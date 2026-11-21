/**
 * Durable mission runtime (NEXT-10 local slice).
 *
 * Contract:
 * 1. Enqueue workflow + job row BEFORE any effect ack
 * 2. Claim lease (honor maxAttempts + deadline)
 * 3. Bind operation_id while leased, then accept effect (ACCEPTED_PENDING)
 * 4. Fenced mark effect_pending
 * 5. Optional review wait
 * 6. Independent verify (no second apply); update job status on terminal
 * 7. Crash/restart resumes from durable Postgres state
 *
 * Default temporalWiring label is LOCAL_DURABLE (Postgres/file durability).
 * When a Temporal cluster is bound, pass temporalLabelOverride: "TEMPORAL".
 */

import { randomBytes } from "node:crypto";
import type { JobEnvelope } from "@worksocial/contracts";
import {
  createDurableExecutionService,
  createMemoryDurableStores,
  createMemoryMissionWorkflowStore,
  newJobId,
  type DurableExecutionService,
  type MissionWorkflowStore,
  type MissionWorkflowRecord,
} from "@worksocial/persistence";
import {
  probeTemporalBinding,
  runtimeTemporalLabel,
  type TemporalBindingReport,
} from "./temporal-binding.js";

export type DurableMissionRuntime = {
  readonly temporal: TemporalBindingReport;
  readonly temporalLabel: "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE" | "TEMPORAL";
  enqueueBeforeAck(input: {
    envelope: JobEnvelope;
    reviewRequired?: boolean;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  claimAndAcceptEffect(input: {
    workflowId: string;
    holder: string;
    leaseMs?: number;
    operationId: string;
    payloadDigest: string;
    businessIdempotencyKey: string;
    nowIso: string;
    decision: {
      decisionId: string;
      reason: string;
      grantId?: string | null;
      policyId?: string | null;
      writePathId?: string | null;
      gateDetails?: string[];
    };
  }): Promise<{
    workflow: MissionWorkflowRecord;
    acceptedOutcome: "ACCEPTED_PENDING";
    applyAttemptCount: number;
  }>;
  waitForReview(input: {
    workflowId: string;
    nowIso: string;
  }): Promise<{ workflow: MissionWorkflowRecord; reviewToken: string }>;
  completeReviewAndVerify(input: {
    workflowId: string;
    reviewToken: string;
    observedDigest: string;
    nowIso: string;
  }): Promise<{
    workflow: MissionWorkflowRecord;
    verifiedOutcome: "VERIFIED";
    applyAttemptCount: number;
  }>;
  resumeAfterRestart(input: {
    workflowId: string;
    observedDigest: string;
    nowIso: string;
    reviewToken?: string;
  }): Promise<{
    workflow: MissionWorkflowRecord;
    outcome: "ACCEPTED_PENDING" | "VERIFIED" | "REVIEW_WAIT" | "FAILED";
    applyAttemptCount: number;
  }>;
  getWorkflow(workflowId: string): Promise<MissionWorkflowRecord | undefined>;
};

function maxAttemptsOf(workflow: MissionWorkflowRecord): number {
  return Number(workflow.envelopeJson.maxAttempts ?? 2);
}

function deadlineSecondsOf(workflow: MissionWorkflowRecord): number {
  return Number(workflow.envelopeJson.deadlineSeconds ?? 600);
}

function deadlineExceeded(workflow: MissionWorkflowRecord, nowIso: string): boolean {
  const deadlineMs =
    Date.parse(workflow.createdAtIso) + deadlineSecondsOf(workflow) * 1000;
  return Date.parse(nowIso) > deadlineMs;
}

export function createDurableMissionRuntime(options: {
  missions: MissionWorkflowStore;
  execution: DurableExecutionService;
  temporalEnv?: NodeJS.ProcessEnv;
  /** Force TEMPORAL when worker is bound to a live Temporal frontend. */
  temporalLabelOverride?: "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE" | "TEMPORAL";
}): DurableMissionRuntime {
  const temporal = probeTemporalBinding(options.temporalEnv ?? process.env);
  const temporalLabel =
    options.temporalLabelOverride ??
    (temporal.status === "NOT_WIRED" || temporal.status === "READY_TO_BIND"
      ? "LOCAL_DURABLE"
      : runtimeTemporalLabel(temporal));

  const { missions, execution } = options;

  async function markJobTerminal(
    jobId: string,
    status: "succeeded" | "failed",
    nowIso: string,
  ): Promise<void> {
    await execution.stores.jobs.updateStatus(jobId, status, nowIso);
  }

  async function succeedMission(
    workflowId: string,
    nowIso: string,
  ): Promise<MissionWorkflowRecord> {
    const workflow = await missions.succeed(workflowId, nowIso);
    await markJobTerminal(workflow.jobId, "succeeded", nowIso);
    return workflow;
  }

  async function failMission(input: {
    workflowId: string;
    retryCategory: "transient" | "policy" | "unknown_remote" | "fatal" | "none";
    lastError: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord> {
    const workflow = await missions.fail(input);
    await markJobTerminal(workflow.jobId, "failed", input.nowIso);
    return workflow;
  }

  return {
    temporal,
    temporalLabel,

    async enqueueBeforeAck(input) {
      const { job } = await execution.stores.jobs.insertIdempotent({
        jobId: input.envelope.jobId || newJobId(),
        roleId: input.envelope.roleId,
        workflowId: input.envelope.workflowId,
        siteId: input.envelope.siteId,
        assetId: input.envelope.assetId,
        trigger: input.envelope.trigger,
        policyVersion: input.envelope.policyVersion,
        inputArtifactIds: input.envelope.inputArtifactIds ?? [],
        capabilityGrantId: input.envelope.capabilityGrantId,
        sourceRevision: input.envelope.sourceRevision,
        maxAttempts: input.envelope.maxAttempts ?? 2,
        deadlineSeconds: input.envelope.deadlineSeconds,
        idempotencyKey: input.envelope.idempotencyKey,
        expectedOutcome: input.envelope.expectedOutcome,
        envelopeJson: input.envelope as unknown as Record<string, unknown>,
      });

      return missions.enqueue({
        workflowId: input.envelope.workflowId,
        jobId: job.jobId,
        reviewRequired: input.reviewRequired ?? false,
        temporalWiring: temporalLabel,
        envelopeJson: input.envelope as unknown as Record<string, unknown>,
        nowIso: input.nowIso,
      });
    },

    async claimAndAcceptEffect(input) {
      const prior = await missions.get(input.workflowId);
      if (!prior) throw new Error(`Unknown workflow ${input.workflowId}`);

      if (deadlineExceeded(prior, input.nowIso)) {
        await failMission({
          workflowId: input.workflowId,
          retryCategory: "fatal",
          lastError: "Mission deadline exceeded before lease claim",
          nowIso: input.nowIso,
        });
        throw new Error(`Deadline exceeded for ${input.workflowId}`);
      }
      if (prior.attemptCount >= maxAttemptsOf(prior)) {
        await failMission({
          workflowId: input.workflowId,
          retryCategory: "fatal",
          lastError: "Mission maxAttempts exhausted before lease claim",
          nowIso: input.nowIso,
        });
        throw new Error(`maxAttempts exhausted for ${input.workflowId}`);
      }

      const leaseExpiresAtIso = new Date(
        Date.parse(input.nowIso) + (input.leaseMs ?? 60_000),
      ).toISOString();
      const leased = await missions.claimLease({
        workflowId: input.workflowId,
        holder: input.holder,
        leaseExpiresAtIso,
        nowIso: input.nowIso,
      });
      if (!leased) {
        throw new Error(`Unable to claim lease for ${input.workflowId}`);
      }

      // Persist operation boundary BEFORE provider apply so restart can recover.
      await missions.bindOperationWhileLeased({
        workflowId: input.workflowId,
        operationId: input.operationId,
        holder: input.holder,
        nowIso: input.nowIso,
        payloadDigest: input.payloadDigest,
        businessIdempotencyKey: input.businessIdempotencyKey,
      });

      const accepted = await execution.acceptPending({
        job: {
          jobId: leased.jobId,
          roleId: String(leased.envelopeJson.roleId ?? "A01"),
          workflowId: input.workflowId,
          siteId: String(leased.envelopeJson.siteId ?? "site"),
          assetId: String(leased.envelopeJson.assetId ?? "asset"),
          trigger: String(leased.envelopeJson.trigger ?? "manual"),
          policyVersion: String(leased.envelopeJson.policyVersion ?? "1"),
          inputArtifactIds: Array.isArray(leased.envelopeJson.inputArtifactIds)
            ? (leased.envelopeJson.inputArtifactIds as string[])
            : [],
          capabilityGrantId: String(
            leased.envelopeJson.capabilityGrantId ?? "grant",
          ),
          sourceRevision: String(leased.envelopeJson.sourceRevision ?? "rev"),
          maxAttempts: Number(leased.envelopeJson.maxAttempts ?? 2),
          deadlineSeconds: Number(leased.envelopeJson.deadlineSeconds ?? 600),
          idempotencyKey: String(
            leased.envelopeJson.idempotencyKey ??
              `mission/${input.workflowId}`,
          ),
          expectedOutcome: String(
            leased.envelopeJson.expectedOutcome ?? "verified",
          ),
        },
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        businessIdempotencyKey: input.businessIdempotencyKey,
        nowIso: input.nowIso,
        decision: {
          decisionId: input.decision.decisionId,
          operationId: input.operationId,
          payloadDigest: input.payloadDigest,
          allowed: true,
          code: null,
          reason: input.decision.reason,
          grantId: input.decision.grantId ?? null,
          policyId: input.decision.policyId ?? null,
          decidedAtIso: input.nowIso,
          writePathId: input.decision.writePathId ?? null,
          gateDetails: input.decision.gateDetails ?? [],
        },
      });

      const pending = await missions.markEffectPending({
        workflowId: input.workflowId,
        operationId: input.operationId,
        holder: input.holder,
        nowIso: input.nowIso,
      });

      return {
        workflow: pending,
        acceptedOutcome: "ACCEPTED_PENDING",
        applyAttemptCount: accepted.applyAttemptCount,
      };
    },

    async waitForReview(input) {
      const token = `rev-${randomBytes(8).toString("hex")}`;
      const workflow = await missions.enterReviewWait({
        workflowId: input.workflowId,
        reviewToken: token,
        nowIso: input.nowIso,
      });
      return { workflow, reviewToken: token };
    },

    async completeReviewAndVerify(input) {
      await missions.completeReview({
        workflowId: input.workflowId,
        reviewToken: input.reviewToken,
        nowIso: input.nowIso,
      });
      const current = (await missions.get(input.workflowId))!;
      const verified = await execution.verifyIndependent({
        operationId: current.operationId!,
        observedDigest: input.observedDigest,
        nowIso: input.nowIso,
      });
      const workflow = await succeedMission(input.workflowId, input.nowIso);
      return {
        workflow,
        verifiedOutcome: "VERIFIED",
        applyAttemptCount: verified.applyAttemptCount,
      };
    },

    async resumeAfterRestart(input) {
      let workflow = await missions.get(input.workflowId);
      if (!workflow) throw new Error(`Unknown workflow ${input.workflowId}`);

      if (workflow.phase === "succeeded") {
        const op = workflow.operationId!;
        return {
          workflow,
          outcome: "VERIFIED",
          applyAttemptCount: await execution.stores.effects.countApplyAttempts(op),
        };
      }

      if (workflow.phase === "failed" || workflow.phase === "cancelled") {
        return {
          workflow,
          outcome: "FAILED",
          applyAttemptCount: workflow.operationId
            ? await execution.stores.effects.countApplyAttempts(
                workflow.operationId,
              )
            : 0,
        };
      }

      // Crash after bind/apply but before markEffectPending: still leased with op id.
      if (workflow.phase === "leased" && workflow.operationId) {
        const decision = await execution.getDecision(workflow.operationId);
        if (
          decision &&
          (decision.outcome === "ACCEPTED_PENDING" ||
            decision.outcome === "VERIFIED" ||
            decision.outcome === "FAILED")
        ) {
          workflow = await missions.recoverEffectPending({
            workflowId: input.workflowId,
            operationId: workflow.operationId,
            nowIso: input.nowIso,
          });
        } else {
          // Re-accept with bound keys (idempotent; no second apply).
          const digest = String(
            workflow.envelopeJson.boundPayloadDigest ?? input.observedDigest,
          );
          const bizKey = String(
            workflow.envelopeJson.boundBusinessIdempotencyKey ??
              `biz-${workflow.workflowId}`,
          );
          await execution.acceptPending({
            job: {
              jobId: workflow.jobId,
              roleId: String(workflow.envelopeJson.roleId ?? "A01"),
              workflowId: workflow.workflowId,
              siteId: String(workflow.envelopeJson.siteId ?? "site"),
              assetId: String(workflow.envelopeJson.assetId ?? "asset"),
              trigger: String(workflow.envelopeJson.trigger ?? "manual"),
              policyVersion: String(workflow.envelopeJson.policyVersion ?? "1"),
              inputArtifactIds: Array.isArray(
                workflow.envelopeJson.inputArtifactIds,
              )
                ? (workflow.envelopeJson.inputArtifactIds as string[])
                : [],
              capabilityGrantId: String(
                workflow.envelopeJson.capabilityGrantId ?? "grant",
              ),
              sourceRevision: String(
                workflow.envelopeJson.sourceRevision ?? "rev",
              ),
              maxAttempts: Number(workflow.envelopeJson.maxAttempts ?? 2),
              deadlineSeconds: Number(
                workflow.envelopeJson.deadlineSeconds ?? 600,
              ),
              idempotencyKey: String(
                workflow.envelopeJson.idempotencyKey ??
                  `mission/${workflow.workflowId}`,
              ),
              expectedOutcome: String(
                workflow.envelopeJson.expectedOutcome ?? "verified",
              ),
            },
            operationId: workflow.operationId,
            payloadDigest: digest,
            businessIdempotencyKey: bizKey,
            nowIso: input.nowIso,
            decision: {
              decisionId: `dec-recover-${workflow.workflowId}`,
              operationId: workflow.operationId,
              payloadDigest: digest,
              allowed: true,
              code: null,
              reason: "recovered after restart at leased boundary",
              grantId: null,
              policyId: null,
              decidedAtIso: input.nowIso,
              writePathId: null,
              gateDetails: ["recovered"],
            },
          });
          workflow = await missions.recoverEffectPending({
            workflowId: input.workflowId,
            operationId: workflow.operationId,
            nowIso: input.nowIso,
          });
        }
      }

      if (workflow.phase === "review_wait") {
        if (!input.reviewToken) {
          return {
            workflow,
            outcome: "REVIEW_WAIT",
            applyAttemptCount: workflow.operationId
              ? await execution.stores.effects.countApplyAttempts(
                  workflow.operationId,
                )
              : 0,
          };
        }
        const done = await this.completeReviewAndVerify({
          workflowId: input.workflowId,
          reviewToken: input.reviewToken,
          observedDigest: input.observedDigest,
          nowIso: input.nowIso,
        });
        return {
          workflow: done.workflow,
          outcome: "VERIFIED",
          applyAttemptCount: done.applyAttemptCount,
        };
      }

      if (workflow.phase === "effect_pending" && workflow.operationId) {
        if (workflow.reviewRequired) {
          return {
            workflow,
            outcome: "REVIEW_WAIT",
            applyAttemptCount: await execution.stores.effects.countApplyAttempts(
              workflow.operationId,
            ),
          };
        }

        const decision = await execution.getDecision(workflow.operationId);
        if (!decision) {
          const failed = await failMission({
            workflowId: input.workflowId,
            retryCategory: "unknown_remote",
            lastError: "Missing durable decision after restart",
            nowIso: input.nowIso,
          });
          return { workflow: failed, outcome: "FAILED", applyAttemptCount: 0 };
        }
        if (decision.outcome === "FAILED") {
          const failed = await failMission({
            workflowId: input.workflowId,
            retryCategory: "unknown_remote",
            lastError: decision.reason,
            nowIso: input.nowIso,
          });
          return {
            workflow: failed,
            outcome: "FAILED",
            applyAttemptCount: await execution.stores.effects.countApplyAttempts(
              workflow.operationId,
            ),
          };
        }
        if (decision.outcome === "ACCEPTED_PENDING") {
          try {
            const verified = await execution.verifyIndependent({
              operationId: workflow.operationId,
              observedDigest: input.observedDigest,
              nowIso: input.nowIso,
            });
            const succeeded = await succeedMission(
              input.workflowId,
              input.nowIso,
            );
            return {
              workflow: succeeded,
              outcome: "VERIFIED",
              applyAttemptCount: verified.applyAttemptCount,
            };
          } catch (err) {
            const failed = await failMission({
              workflowId: input.workflowId,
              retryCategory: "unknown_remote",
              lastError:
                err instanceof Error ? err.message : "verify failed after restart",
              nowIso: input.nowIso,
            });
            return {
              workflow: failed,
              outcome: "FAILED",
              applyAttemptCount: await execution.stores.effects.countApplyAttempts(
                workflow.operationId,
              ),
            };
          }
        }
        if (decision.outcome === "VERIFIED") {
          const succeeded = await succeedMission(input.workflowId, input.nowIso);
          return {
            workflow: succeeded,
            outcome: "VERIFIED",
            applyAttemptCount: await execution.stores.effects.countApplyAttempts(
              workflow.operationId,
            ),
          };
        }
        return {
          workflow,
          outcome: "ACCEPTED_PENDING",
          applyAttemptCount: await execution.stores.effects.countApplyAttempts(
            workflow.operationId,
          ),
        };
      }

      return {
        workflow,
        outcome: "FAILED",
        applyAttemptCount: 0,
      };
    },

    async getWorkflow(workflowId) {
      return missions.get(workflowId);
    },
  };
}

export function createMemoryDurableMissionRuntime(options?: {
  temporalEnv?: NodeJS.ProcessEnv;
  temporalLabelOverride?: "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE" | "TEMPORAL";
}): DurableMissionRuntime {
  const stores = createMemoryDurableStores();
  return createDurableMissionRuntime({
    missions: createMemoryMissionWorkflowStore(),
    execution: createDurableExecutionService(stores),
    ...(options?.temporalEnv ? { temporalEnv: options.temporalEnv } : {}),
    ...(options?.temporalLabelOverride
      ? { temporalLabelOverride: options.temporalLabelOverride }
      : {}),
  });
}
