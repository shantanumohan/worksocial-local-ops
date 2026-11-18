/**
 * Claude role runner — queues, budgets, fixture/live modes, review gates (R1-04).
 */

import { randomBytes } from "node:crypto";
import { join } from "node:path";
import type { JobEnvelope } from "@worksocial/contracts";
import {
  JobEnvelopeSchema,
} from "@worksocial/contracts";
import {
  AGENT_ROLE_IDS,
  OutcomeLabel,
  RoleExecutionMode,
  RoleRunStatus,
  createBudgetAccount,
  createRoleRunOutcome,
  getAgentRoleContract,
  isAgentRoleId,
  proposeEffect,
  reserveBudget,
  settleBudget,
  validateRoleStructuredOutput,
  validateTypedDelegation,
  type AgentRoleId,
  type BudgetAccount,
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
  temporalEnqueue: {
    status: "NOT_WIRED" | "ACCEPTED_LOCAL";
    detail: string;
  };
};

export type ClaudeRunner = {
  readonly queue: BoundedQueue<RoleJobRequest, RoleJobResult>;
  getBudgetAccount(): BudgetAccount;
  detectCli(): Promise<ClaudeCliDetection>;
  enqueue(request: RoleJobRequest): Promise<RoleJobResult>;
  evaluateAllRolesFixture(
    siteId?: string,
  ): Promise<RoleJobResult[]>;
};

function newId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

function priorityForTrigger(trigger: string): number {
  if (/security|outage|lost.?lead/i.test(trigger)) return 0;
  if (/inbound|customer|after.?hours/i.test(trigger)) return 1;
  if (/publish|broken|repair/i.test(trigger)) return 2;
  if (/content|research|editorial/i.test(trigger)) return 3;
  return 4;
}

export function createClaudeRunner(options: ClaudeRunnerOptions): ClaudeRunner {
  let budget =
    options.budgetAccount ??
    createBudgetAccount({
      dayKey: new Date().toISOString().slice(0, 10),
      currency: "USD",
      limitMinor: 5_000,
    });

  const queue = new BoundedQueue<RoleJobRequest, RoleJobResult>(
    options.concurrency ?? 4,
  );
  const agentsDir =
    options.agentsDir ?? join(options.workspaceRoot, ".claude", "agents");
  const modelId = options.defaultModelId ?? "claude-sonnet-4-5";

  const detectCli = () =>
    detectClaudeCli({ forceFixture: options.forceFixture === true });

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
    const startedAt = new Date().toISOString();

    if (request.requestPermissionBypass) {
      const flagCheck = validateCliArgs(["--dangerously-skip-permissions"]);
      const outcome = createRoleRunOutcome({
        outcomeId: newId("out"),
        roleId,
        jobId: envelope.jobId,
        runId,
        label: OutcomeLabel.FAILURE,
        status: RoleRunStatus.DENIED,
        executionMode: RoleExecutionMode.FIXTURE,
        reason: flagCheck.reason ?? "Permission bypass refused",
        recordedAtIso: new Date().toISOString(),
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
        temporalEnqueue: {
          status: "NOT_WIRED",
          detail:
            "Temporal self-host not bound locally; job executed in-process only",
        },
      };
    }

    const reservationId = newId("res");
    const reserve = reserveBudget(
      budget,
      reservationId,
      Math.min(contract.resourceLimits.maxBudgetMinor, 100),
    );
    if (!reserve.ok) {
      const outcome = createRoleRunOutcome({
        outcomeId: newId("out"),
        roleId,
        jobId: envelope.jobId,
        runId,
        label: OutcomeLabel.FAILURE,
        status: RoleRunStatus.BUDGET_EXHAUSTED,
        executionMode: RoleExecutionMode.FIXTURE,
        reason: `Budget exhausted; available ${reserve.availableMinor}`,
        recordedAtIso: new Date().toISOString(),
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
        temporalEnqueue: {
          status: "NOT_WIRED",
          detail:
            "Temporal self-host not bound locally; job executed in-process only",
        },
      };
    }
    budget = reserve.account;

    const cliDetection = await detectCli();
    const useFixture =
      options.forceFixture === true || !cliDetection.available;

    let output: RoleStructuredOutput | null = null;
    let deniedEffects: Array<{ code: string; reason: string }> = [];
    let deniedDelegations: Array<{ code: string; reason: string }> = [];
    let status: RoleRunStatusValue = RoleRunStatus.SUCCEEDED;
    let summary = "";
    let executionMode: RoleExecutionModeValue = RoleExecutionMode.FIXTURE;
    let costMinor = 25;

    if (useFixture) {
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
      if (
        fixture.output.status === "error" ||
        (request.attemptUnauthorizedEffect && deniedEffects.length > 0) ||
        (request.attemptSelfApproval && deniedEffects.length > 0)
      ) {
        status =
          deniedEffects.some((d) => d.code.includes("FORBIDDEN") || d.code.includes("SELF"))
            ? RoleRunStatus.DENIED
            : RoleRunStatus.FAILED;
      } else if (fixture.output.status === "needs_review") {
        status = RoleRunStatus.AWAITING_REVIEW;
      } else {
        status = RoleRunStatus.SUCCEEDED;
      }
      costMinor = 10;
    } else {
      executionMode = RoleExecutionMode.LIVE_CLI;
      const agentPath = join(agentsDir, `${roleId}.md`);
      const invoke = await invokeClaudeCli({
        executablePath: cliDetection.executablePath!,
        agentDefinitionPath: agentPath,
        modelId,
        prompt: JSON.stringify({
          envelope,
          contractVersion: contract.version,
          instruction:
            "Return a single JSON object matching RoleStructuredOutput. Do not claim authorization. Do not enable permission bypass.",
        }),
        timeoutMs: contract.resourceLimits.maxDeadlineSeconds * 1000,
        maxOutputBytes: contract.resourceLimits.maxOutputBytes,
      });
      if (!invoke.ok) {
        status =
          invoke.code === "TIMEOUT"
            ? RoleRunStatus.TIMED_OUT
            : RoleRunStatus.FAILED;
        summary = invoke.reason;
        output = null;
      } else {
        let parsedOut: unknown;
        try {
          parsedOut = JSON.parse(invoke.stdout);
        } catch {
          parsedOut = null;
        }
        const validated = validateRoleStructuredOutput(parsedOut);
        if (!validated.ok) {
          status = RoleRunStatus.FAILED;
          summary = validated.reason;
          output = null;
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
            }
          }
          for (const task of validated.output.taskRequests) {
            const decision = validateTypedDelegation(task);
            if (!decision.ok) {
              deniedDelegations.push({
                code: decision.code,
                reason: decision.reason,
              });
            }
          }
          if (deniedEffects.length > 0) {
            status = RoleRunStatus.DENIED;
          } else if (validated.output.status === "needs_review") {
            status = RoleRunStatus.AWAITING_REVIEW;
          } else if (validated.output.status === "error") {
            status = RoleRunStatus.FAILED;
          } else {
            status = RoleRunStatus.SUCCEEDED;
          }
        }
      }
      costMinor = 75;
    }

    const settled = settleBudget(budget, reservationId, costMinor);
    if (settled.ok) {
      budget = settled.account;
    }

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
      recordedAtIso: new Date().toISOString(),
      featureHints: {
        suite: contract.evaluationSuiteId,
        startedAt,
        deniedEffectCount: deniedEffects.length,
        deniedDelegationCount: deniedDelegations.length,
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
      temporalEnqueue: {
        status: "NOT_WIRED",
        detail:
          "Temporal self-host not bound locally; durable mission enqueue remains NOT_WIRED — executed in-process with file-backed evidence",
      },
    };
  };

  return {
    queue,
    getBudgetAccount: () => budget,
    detectCli,
    enqueue(request) {
      const priority =
        request.priority ?? priorityForTrigger(request.envelope.trigger);
      return queue
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
          return qr.result;
        });
    },
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
          idempotencyKey: `fixture/${roleId}/${siteId}`,
          expectedOutcome: "typed-result-or-denied-effect",
        };
        results.push(
          await execute({
            envelope,
          }),
        );
      }
      return results;
    },
  };
}

function cryptoRandomUuid(): string {
  // Node 20+ 
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
