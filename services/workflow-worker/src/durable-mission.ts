/**
 * Durable mission runtime (NEXT-10 local slice).
 *
 * Contract:
 * 1. Enqueue workflow + job row BEFORE any effect ack
 * 2. Claim lease
 * 3. Accept effect via DurableExecutionService (ACCEPTED_PENDING)
 * 4. Optional review wait
 * 5. Independent verify (no second apply)
 * 6. Crash/restart resumes from durable Postgres state
 *
 * Temporal cluster remains NOT_WIRED; temporalWiring label is LOCAL_DURABLE
 * for this path (or NOT_WIRED when only the legacy in-process enqueue is used).
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
  readonly temporalLabel: "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE";
  /**
   * Persist job + workflow as enqueued before any provider apply.
   * Returns the durable workflow record (phase=enqueued).
   */
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
  /**
   * Resume after process restart: read workflow; if effect_pending/review_wait,
   * verify without a second apply when digest matches.
   */
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

export function createDurableMissionRuntime(options: {
  missions: MissionWorkflowStore;
  execution: DurableExecutionService;
  temporalEnv?: NodeJS.ProcessEnv;
}): DurableMissionRuntime {
  const temporal = probeTemporalBinding(options.temporalEnv ?? process.env);
  const temporalLabel =
    temporal.status === "NOT_WIRED" || temporal.status === "READY_TO_BIND"
      ? "LOCAL_DURABLE"
      : runtimeTemporalLabel(temporal);

  const { missions, execution } = options;

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
      });
    },

    async claimAndAcceptEffect(input) {
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

      const workflowRow = await missions.get(input.workflowId);
      if (!workflowRow) throw new Error(`Unknown workflow ${input.workflowId}`);

      const accepted = await execution.acceptPending({
        job: {
          jobId: workflowRow.jobId,
          roleId: String(workflowRow.envelopeJson.roleId ?? "A01"),
          workflowId: input.workflowId,
          siteId: String(workflowRow.envelopeJson.siteId ?? "site"),
          assetId: String(workflowRow.envelopeJson.assetId ?? "asset"),
          trigger: String(workflowRow.envelopeJson.trigger ?? "manual"),
          policyVersion: String(workflowRow.envelopeJson.policyVersion ?? "1"),
          inputArtifactIds: Array.isArray(workflowRow.envelopeJson.inputArtifactIds)
            ? (workflowRow.envelopeJson.inputArtifactIds as string[])
            : [],
          capabilityGrantId: String(
            workflowRow.envelopeJson.capabilityGrantId ?? "grant",
          ),
          sourceRevision: String(
            workflowRow.envelopeJson.sourceRevision ?? "rev",
          ),
          maxAttempts: Number(workflowRow.envelopeJson.maxAttempts ?? 2),
          deadlineSeconds: Number(
            workflowRow.envelopeJson.deadlineSeconds ?? 600,
          ),
          idempotencyKey: String(
            workflowRow.envelopeJson.idempotencyKey ??
              `mission/${input.workflowId}`,
          ),
          expectedOutcome: String(
            workflowRow.envelopeJson.expectedOutcome ?? "verified",
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
      const verified = await execution.verifyIndependent({
        operationId: (await missions.get(input.workflowId))!.operationId!,
        observedDigest: input.observedDigest,
        nowIso: input.nowIso,
      });
      const workflow = await missions.succeed(input.workflowId, input.nowIso);
      return {
        workflow,
        verifiedOutcome: "VERIFIED",
        applyAttemptCount: verified.applyAttemptCount,
      };
    },

    async resumeAfterRestart(input) {
      const workflow = await missions.get(input.workflowId);
      if (!workflow) throw new Error(`Unknown workflow ${input.workflowId}`);

      if (workflow.phase === "succeeded") {
        const op = workflow.operationId!;
        const count = await execution.stores.effects.countApplyAttempts(op);
        return {
          workflow,
          outcome: "VERIFIED",
          applyAttemptCount: count,
        };
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
        const decision = await execution.getDecision(workflow.operationId);
        if (!decision) {
          await missions.fail({
            workflowId: input.workflowId,
            retryCategory: "unknown_remote",
            lastError: "Missing durable decision after restart",
            nowIso: input.nowIso,
          });
          return {
            workflow: (await missions.get(input.workflowId))!,
            outcome: "FAILED",
            applyAttemptCount: 0,
          };
        }
        if (decision.outcome === "ACCEPTED_PENDING") {
          const verified = await execution.verifyIndependent({
            operationId: workflow.operationId,
            observedDigest: input.observedDigest,
            nowIso: input.nowIso,
          });
          const succeeded = await missions.succeed(
            input.workflowId,
            input.nowIso,
          );
          return {
            workflow: succeeded,
            outcome: "VERIFIED",
            applyAttemptCount: verified.applyAttemptCount,
          };
        }
        if (decision.outcome === "VERIFIED") {
          const succeeded = await missions.succeed(
            input.workflowId,
            input.nowIso,
          );
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

export function createMemoryDurableMissionRuntime(): DurableMissionRuntime {
  const stores = createMemoryDurableStores();
  return createDurableMissionRuntime({
    missions: createMemoryMissionWorkflowStore(),
    execution: createDurableExecutionService(stores),
  });
}
