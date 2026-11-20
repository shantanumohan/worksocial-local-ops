/**
 * Claude role runner — queues, budgets, fixture/live modes, review gates (R1-04).
 */

import { randomBytes } from "node:crypto";
import type { JobEnvelope } from "@worksocial/contracts";
import { JobEnvelopeSchema } from "@worksocial/contracts";
import {
  AGENT_ROLE_IDS,
  CostRecordingKind,
  OutcomeLabel,
  RoleExecutionMode,
  RoleRunStatus,
  createBudgetAccount,
  createRoleRunOutcome,
  getAgentRoleContract,
  isAgentRoleId,
  parseClaudeUsageCost,
  proposeEffect,
  registeredAgentName,
  reserveBudget,
  settleBudget,
  validateRoleStructuredOutput,
  validateTypedDelegation,
  type AgentRoleId,
  type BudgetAccount,
  type CostRecordingKindValue,
  type RoleExecutionModeValue,
  type RoleRunOutcomeEvidence,
  type RoleRunStatusValue,
  type RoleStructuredOutput,
} from "@worksocial/domain";
import {
  detectClaudeCli,
  invokeClaudeCli,
  validateCliArgs,
  type ClaudeCliDetection,
} from "./cli-adapter.js";
import { runRoleFixture } from "./fixture-runner.js";
import { BoundedQueue } from "./queue.js";

export type ClaudeRunnerOptions = {
  /** Workspace root containing `.claude/agents`. */
  workspaceRoot: string;
  /** Force fixture mode even if CLI is present. */
  forceFixture?: boolean;
  concurrency?: number;
  defaultModelId?: string;
  /** Daily Claude budget account (honest reservation stubs). */
  budgetAccount?: BudgetAccount;
  agentsDir?: string;
};

export type RoleJobRequest = {
  envelope: JobEnvelope;
  priority?: number | undefined;
  attemptUnauthorizedEffect?: boolean | undefined;
  attemptSelfApproval?: boolean | undefined;
  attemptUncontrolledRecursion?: boolean | undefined;
  /** Never pass true — present only so tests prove denial. */
  requestPermissionBypass?: boolean | undefined;
  /** Force fixture for this job regardless of runner live settings. */
  forceFixture?: boolean | undefined;
  /**
   * Require live CLI. When true, missing CLI or live failure must not
   * silently succeed via fixture (F01).
   */
  requireLive?: boolean | undefined;
};

export type RoleJobResult = {
  runId: string;
  jobId: string;
  roleId: AgentRoleId;
  status: RoleRunStatusValue;
  executionMode: RoleExecutionModeValue;
  summary: string;
  output: RoleStructuredOutput | null;
  outcome: RoleRunOutcomeEvidence;
  deniedEffects: Array<{ code: string; reason: string }>;
  deniedDelegations: Array<{ code: string; reason: string }>;
  cliDetection: ClaudeCliDetection;
  permissionBypassUsed: false;
  budgetReservationId: string | null;
  costMinor: number;
  costKind: CostRecordingKindValue;
  modelId: string | null;
  startedAtIso: string;
  finishedAtIso: string;
  temporalEnqueue: {
    status: "NOT_WIRED" | "ACCEPTED_LOCAL";
    detail: string;
  };
  /** True when this result was returned from idempotency coalesce. */
  idempotentReplay?: boolean;
  /** Registered Claude agent name used (or that would be used) for --agent. */
  registeredAgentName: string;
};

export type ClaudeRunner = {
  readonly queue: BoundedQueue<RoleJobRequest, RoleJobResult>;
  getBudgetAccount(): BudgetAccount;
  detectCli(): Promise<ClaudeCliDetection>;
  enqueue(request: RoleJobRequest): Promise<RoleJobResult>;
  /** Always fixture/offline — never follows live CLI configuration. */
  evaluateAllRolesFixture(siteId?: string): Promise<RoleJobResult[]>;
};

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

function cryptoRandomUuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function priorityForTrigger(trigger: string): number {
  if (/security|outage|lost.?lead/i.test(trigger)) return 0;
  if (/inbound|customer|after.?hours/i.test(trigger)) return 1;
  if (/publish|broken|repair/i.test(trigger)) return 2;
  if (/content|research|editorial/i.test(trigger)) return 3;
  return 4;
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function createClaudeRunner(options: ClaudeRunnerOptions): ClaudeRunner {
  let budget =
    options.budgetAccount ??
    createBudgetAccount({
      dayKey: utcDayKey(),
      currency: "USD",
      limitMinor: 5_000,
    });

  const queue = new BoundedQueue<RoleJobRequest, RoleJobResult>({
    concurrency: options.concurrency ?? 4,
    reservedUrgentSlots: 1,
    urgentMaxPriority: 1,
  });
  const modelId = options.defaultModelId ?? "claude-sonnet-4-5";
  const workspaceRoot = options.workspaceRoot;

  /** Completed results keyed by idempotencyKey for coalesce. */
  const completedByIdempotency = new Map<string, RoleJobResult>();
  /** In-flight promises for the same idempotencyKey. */
  const inflightByIdempotency = new Map<string, Promise<RoleJobResult>>();

  const detectCli = () =>
    detectClaudeCli({ forceFixture: options.forceFixture === true });

  const rotateBudgetIfNeeded = (): void => {
    const today = utcDayKey();
    if (budget.dayKey !== today) {
      budget = createBudgetAccount({
        dayKey: today,
        currency: budget.currency,
        limitMinor: budget.limitMinor,
      });
    }
  };

  const execute = async (request: RoleJobRequest): Promise<RoleJobResult> => {
    const parsed = JobEnvelopeSchema.safeParse(request.envelope);
    if (!parsed.success) {
      throw new Error(`Invalid job envelope: ${parsed.error.message}`);
    }
    const envelope = parsed.data;
    if (!isAgentRoleId(envelope.roleId)) {
      throw new Error(`Unknown role ${envelope.roleId}`);
    }
    const roleId = envelope.roleId;
    const contract = getAgentRoleContract(roleId);
    const runId = newId("run");
    const startedAtIso = new Date().toISOString();

    const baseTemporal = {
      status: "NOT_WIRED" as const,
      detail:
        "Temporal self-host not bound locally; durable mission enqueue remains NOT_WIRED — executed in-process with file-backed evidence",
    };

    if (request.requestPermissionBypass) {
      const flagCheck = validateCliArgs(["--dangerously-skip-permissions"]);
      const finishedAtIso = new Date().toISOString();
      const outcome = createRoleRunOutcome({
        outcomeId: newId("out"),
        roleId,
        jobId: envelope.jobId,
        runId,
        label: OutcomeLabel.FAILURE,
        status: RoleRunStatus.DENIED,
        executionMode: RoleExecutionMode.FIXTURE,
        reason: flagCheck.reason ?? "Permission bypass refused",
        recordedAtIso: finishedAtIso,
        featureHints: { denied: "permission_bypass" },
      });
      return {
        runId,
        jobId: envelope.jobId,
        roleId,
        status: RoleRunStatus.DENIED,
        executionMode: RoleExecutionMode.FIXTURE,
        summary: outcome.reason,
        output: null,
        outcome,
        deniedEffects: [{ code: "FLAG_DENIED", reason: outcome.reason }],
        deniedDelegations: [],
        cliDetection: await detectCli(),
        permissionBypassUsed: false,
        budgetReservationId: null,
        costMinor: 0,
        costKind: CostRecordingKind.FIXTURE,
        modelId: null,
        startedAtIso,
        finishedAtIso,
        temporalEnqueue: baseTemporal,
        registeredAgentName: registeredAgentName(roleId),
      };
    }

    rotateBudgetIfNeeded();

    const reservationId = newId("res");
    const reserve = reserveBudget(
      budget,
      reservationId,
      Math.min(contract.resourceLimits.maxBudgetMinor, 100),
    );
    if (!reserve.ok) {
      const finishedAtIso = new Date().toISOString();
      const outcome = createRoleRunOutcome({
        outcomeId: newId("out"),
        roleId,
        jobId: envelope.jobId,
        runId,
        label: OutcomeLabel.FAILURE,
        status: RoleRunStatus.BUDGET_EXHAUSTED,
        executionMode: RoleExecutionMode.FIXTURE,
        reason: `Budget exhausted; available ${reserve.availableMinor}`,
        recordedAtIso: finishedAtIso,
      });
      return {
        runId,
        jobId: envelope.jobId,
        roleId,
        status: RoleRunStatus.BUDGET_EXHAUSTED,
        executionMode: RoleExecutionMode.FIXTURE,
        summary: outcome.reason,
        output: null,
        outcome,
        deniedEffects: [],
        deniedDelegations: [],
        cliDetection: await detectCli(),
        permissionBypassUsed: false,
        budgetReservationId: null,
        costMinor: 0,
        costKind: CostRecordingKind.FIXTURE,
        modelId: null,
        startedAtIso,
        finishedAtIso,
        temporalEnqueue: baseTemporal,
        registeredAgentName: registeredAgentName(roleId),
      };
    }
    budget = reserve.account;

    const forceFixtureThisJob =
      request.forceFixture === true || options.forceFixture === true;
    const requireLive = request.requireLive === true;
    const cliDetection = await detectCli();
    const agentName = registeredAgentName(roleId);

    // Explicit mode selection — never silently treat a live miss as fixture SUCCESS.
    let useFixture = forceFixtureThisJob;
    if (!forceFixtureThisJob && !cliDetection.available) {
      if (requireLive) {
        useFixture = false;
      } else {
        useFixture = true;
      }
    }

    let output: RoleStructuredOutput | null = null;
    let deniedEffects: Array<{ code: string; reason: string }> = [];
    let deniedDelegations: Array<{ code: string; reason: string }> = [];
    let status: RoleRunStatusValue = RoleRunStatus.SUCCEEDED;
    let summary = "";
    let executionMode: RoleExecutionModeValue = RoleExecutionMode.FIXTURE;
    let costMinor = 0;
    let costKind: CostRecordingKindValue = CostRecordingKind.UNKNOWN;
    let usedModelId: string | null = null;
    let acceptedReviewableCount = 0;
    let liveStdout: string | null = null;

    const settleAndFinish = (cost: number): void => {
      const settled = settleBudget(budget, reservationId, cost);
      if (settled.ok) {
        budget = settled.account;
      }
    };

    if (requireLive && (forceFixtureThisJob || !cliDetection.available)) {
      executionMode = RoleExecutionMode.LIVE_CLI;
      status = RoleRunStatus.FAILED;
      summary = forceFixtureThisJob
        ? "requireLive=true but fixture was forced — refusing silent fixture SUCCESS"
        : `requireLive=true but Claude CLI unavailable (${cliDetection.reason}) — refusing silent fixture SUCCESS`;
      const usage = parseClaudeUsageCost({
        executionMode: RoleExecutionMode.LIVE_CLI,
      });
      costMinor = usage.costMinor;
      costKind = usage.costKind;
      settleAndFinish(0);
    } else if (useFixture) {
      executionMode = RoleExecutionMode.FIXTURE;
      const fixture = runRoleFixture({
        envelope,
        attemptUnauthorizedEffect: request.attemptUnauthorizedEffect,
        attemptSelfApproval: request.attemptSelfApproval,
        attemptUncontrolledRecursion: request.attemptUncontrolledRecursion,
      });
      output = fixture.output;
      deniedEffects = fixture.deniedEffects;
      deniedDelegations = fixture.deniedDelegations;
      summary = fixture.output.summary;
      acceptedReviewableCount = fixture.output.proposedEffects.length;
      if (
        fixture.output.status === "error" ||
        (request.attemptUnauthorizedEffect && deniedEffects.length > 0) ||
        (request.attemptSelfApproval && deniedEffects.length > 0)
      ) {
        status = deniedEffects.some(
          (d) => d.code.includes("FORBIDDEN") || d.code.includes("SELF"),
        )
          ? RoleRunStatus.DENIED
          : RoleRunStatus.FAILED;
      } else if (
        acceptedReviewableCount > 0 ||
        fixture.output.status === "needs_review"
      ) {
        status = RoleRunStatus.AWAITING_REVIEW;
      } else {
        status = RoleRunStatus.SUCCEEDED;
      }
      const usage = parseClaudeUsageCost({
        executionMode: RoleExecutionMode.FIXTURE,
      });
      costMinor = usage.costMinor;
      costKind = usage.costKind;
      settleAndFinish(costMinor);
    } else {
      executionMode = RoleExecutionMode.LIVE_CLI;
      usedModelId = modelId;
      const deadlineSeconds = Math.min(
        envelope.deadlineSeconds,
        contract.resourceLimits.maxDeadlineSeconds,
      );
      const invoke = await invokeClaudeCli({
        executablePath: cliDetection.executablePath!,
        agentName,
        cwd: workspaceRoot,
        modelId,
        prompt: JSON.stringify({
          envelope,
          contractVersion: contract.version,
          instruction:
            "Return a single JSON object matching RoleStructuredOutput with roleId and jobId bound to this envelope. Do not claim authorization. Do not enable permission bypass.",
        }),
        timeoutMs: deadlineSeconds * 1000,
        maxOutputBytes: contract.resourceLimits.maxOutputBytes,
      });
      if (!invoke.ok) {
        status =
          invoke.code === "TIMEOUT"
            ? RoleRunStatus.TIMED_OUT
            : RoleRunStatus.FAILED;
        summary = invoke.reason;
        output = null;
        liveStdout = invoke.stdout ?? null;
        const usage = parseClaudeUsageCost({
          stdout: liveStdout,
          executionMode: RoleExecutionMode.LIVE_CLI,
        });
        costMinor = usage.costMinor;
        costKind = usage.costKind;
        settleAndFinish(costMinor);
      } else {
        liveStdout = invoke.stdout;
        let parsedOut: unknown;
        try {
          parsedOut = JSON.parse(invoke.stdout);
        } catch {
          parsedOut = null;
        }
        const validated = validateRoleStructuredOutput(parsedOut, {
          expectedRoleId: roleId,
          expectedJobId: envelope.jobId,
        });
        if (!validated.ok) {
          status = RoleRunStatus.FAILED;
          summary = validated.reason;
          output = null;
          const usage = parseClaudeUsageCost({
            stdout: liveStdout,
            executionMode: RoleExecutionMode.LIVE_CLI,
          });
          costMinor = usage.costMinor;
          costKind = usage.costKind;
          settleAndFinish(costMinor);
        } else {
          output = validated.output;
          summary = validated.output.summary;

          for (const effect of validated.output.proposedEffects) {
            const decision = proposeEffect(effect);
            if (!decision.ok) {
              deniedEffects.push({
                code: decision.code,
                reason: decision.reason,
              });
            } else if (
              decision.review.ok &&
              decision.review.requiresReview === true
            ) {
              acceptedReviewableCount += 1;
            }
          }

          let acceptedFanout = 0;
          for (const task of validated.output.taskRequests) {
            const decision = validateTypedDelegation(task, {
              currentFanout: acceptedFanout,
            });
            if (!decision.ok) {
              deniedDelegations.push({
                code: decision.code,
                reason: decision.reason,
              });
            } else {
              acceptedFanout += 1;
            }
          }

          if (deniedEffects.length > 0) {
            status = RoleRunStatus.DENIED;
          } else if (acceptedReviewableCount > 0) {
            // Independent review required — model self-ok is ignored.
            status = RoleRunStatus.AWAITING_REVIEW;
          } else if (validated.output.status === "error") {
            status = RoleRunStatus.FAILED;
          } else if (validated.output.status === "needs_review") {
            status = RoleRunStatus.AWAITING_REVIEW;
          } else {
            status = RoleRunStatus.SUCCEEDED;
          }
          const usage = parseClaudeUsageCost({
            stdout: liveStdout,
            executionMode: RoleExecutionMode.LIVE_CLI,
          });
          costMinor = usage.costMinor;
          costKind = usage.costKind;
          settleAndFinish(costMinor);
        }
      }
    }

    const finishedAtIso = new Date().toISOString();
    const label =
      status === RoleRunStatus.SUCCEEDED ||
      status === RoleRunStatus.AWAITING_REVIEW
        ? OutcomeLabel.SUCCESS
        : OutcomeLabel.FAILURE;

    const outcome = createRoleRunOutcome({
      outcomeId: newId("out"),
      roleId,
      jobId: envelope.jobId,
      runId,
      label,
      status,
      executionMode,
      reason: summary || status,
      artifactIds: output?.artifactIds ?? [],
      costMinor,
      costKind,
      recordedAtIso: finishedAtIso,
      featureHints: {
        suite: contract.evaluationSuiteId,
        startedAt: startedAtIso,
        // Post-outcome counts stay on the ledger but must not feed predictors.
        deniedEffectCount: deniedEffects.length,
        deniedDelegationCount: deniedDelegations.length,
        acceptedReviewableCount,
        registeredAgentName: agentName,
        costKind,
      },
    });

    return {
      runId,
      jobId: envelope.jobId,
      roleId,
      status,
      executionMode,
      summary: summary || status,
      output,
      outcome,
      deniedEffects,
      deniedDelegations,
      cliDetection,
      permissionBypassUsed: false,
      budgetReservationId: reservationId,
      costMinor,
      costKind,
      modelId: usedModelId,
      startedAtIso,
      finishedAtIso,
      temporalEnqueue: baseTemporal,
      registeredAgentName: agentName,
    };
  };

  const enqueue = (request: RoleJobRequest): Promise<RoleJobResult> => {
    // Include execution requirements so fixture vs requireLive cannot silently coalesce.
    const key = [
      request.envelope.idempotencyKey,
      request.requireLive === true ? "live" : "any",
      request.forceFixture === true || options.forceFixture === true
        ? "fixture"
        : "prefer-live-or-fixture",
    ].join("|");
    const prior = completedByIdempotency.get(key);
    if (prior) {
      if (
        request.requireLive === true &&
        prior.executionMode === RoleExecutionMode.FIXTURE &&
        (prior.status === RoleRunStatus.SUCCEEDED ||
          prior.status === RoleRunStatus.AWAITING_REVIEW)
      ) {
        // Never replay a fixture success as a requireLive result.
        return execute({ ...request, requireLive: true }).then((r) => ({
          ...r,
          idempotentReplay: false,
        }));
      }
      return Promise.resolve({ ...prior, idempotentReplay: true });
    }
    const inflight = inflightByIdempotency.get(key);
    if (inflight) {
      return inflight.then((r) => ({ ...r, idempotentReplay: true }));
    }

    const priority =
      request.priority ?? priorityForTrigger(request.envelope.trigger);
    const promise = queue
      .run(
        {
          id: request.envelope.jobId,
          priority,
          payload: request,
        },
        execute,
      )
      .then((qr) => {
        if (!qr.ok || !qr.result) {
          throw new Error(qr.error ?? "queue job failed");
        }
        completedByIdempotency.set(key, qr.result);
        // Bound memory for long-lived API processes.
        if (completedByIdempotency.size > 1000) {
          const first = completedByIdempotency.keys().next().value;
          if (first !== undefined) {
            completedByIdempotency.delete(first);
          }
        }
        return qr.result;
      })
      .finally(() => {
        inflightByIdempotency.delete(key);
      });

    inflightByIdempotency.set(key, promise);
    return promise;
  };

  return {
    queue,
    getBudgetAccount: () => {
      rotateBudgetIfNeeded();
      return budget;
    },
    detectCli,
    enqueue,
    async evaluateAllRolesFixture(siteId = "worksocial") {
      const results: RoleJobResult[] = [];
      for (const roleId of AGENT_ROLE_IDS) {
        const envelope: JobEnvelope = {
          jobId: cryptoRandomUuid(),
          roleId,
          workflowId: `fixture-wf-${roleId}`,
          siteId,
          assetId: `fixture-asset-${roleId}`,
          trigger: "fixture_role_evaluation",
          policyVersion: "r1-04-fixture",
          inputArtifactIds: [`fixture/input/${roleId}`],
          capabilityGrantId: "fixture-grant",
          sourceRevision: "fixture-rev",
          maxAttempts: 1,
          deadlineSeconds: getAgentRoleContract(roleId).resourceLimits
            .maxDeadlineSeconds,
          idempotencyKey: `fixture/${roleId}/${siteId}/${cryptoRandomUuid()}`,
          expectedOutcome: "typed-result-or-denied-effect",
        };
        // Always fixture — independent of live CLI / WORKSOCIAL_CLAUDE_FIXTURE=0.
        results.push(
          await execute({
            envelope,
            forceFixture: true,
          }),
        );
      }
      return results;
    },
  };
}
