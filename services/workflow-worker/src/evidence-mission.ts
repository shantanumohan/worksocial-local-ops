/**
 * Durable evidence mission (M3 / NEXT-12) on LOCAL_DURABLE from M2.
 * Compiles evidence → writer job → persists proposal artifact → separate A25
 * review job bound to exact revisions → restart preserves mission history.
 * External effects: NONE (no publish, no spend).
 */

import { randomBytes } from "node:crypto";
import type { ClaudeRunner } from "@worksocial/claude-runner";
import {
  runEvidenceCycle,
  type EvidenceCycleRequest,
  type EvidenceCycleResult,
  type ProposalArtifactRecord,
} from "@worksocial/claude-runner";
import type { ReviewBinding } from "@worksocial/domain";
import { ArtifactTrustLabel } from "@worksocial/domain";
import {
  createDurableExecutionService,
  createMemoryArtifactStore,
  createMemoryDurableStores,
  createMemoryMissionWorkflowStore,
  type ArtifactStore,
  type DurableExecutionService,
  type MissionWorkflowRecord,
  type MissionWorkflowStore,
  type StoredArtifactRevision,
} from "@worksocial/persistence";
import {
  createDurableMissionRuntime,
  type DurableMissionRuntime,
} from "./durable-mission.js";

export type EvidenceMissionSnapshot = {
  workflowId: string;
  phase: MissionWorkflowRecord["phase"];
  temporalWiring: MissionWorkflowRecord["temporalWiring"];
  packageDigest: string;
  proposalArtifact: ProposalArtifactRecord;
  reviewBinding: ReviewBinding;
  writerRunId: string;
  reviewerRunId: string;
  usage: {
    writerCostMinor: number;
    writerCostKind: string;
    reviewerCostMinor: number;
    reviewerCostKind: string;
    estimatesLabeled: boolean;
  };
};

export type EvidenceMissionResult =
  | {
      ok: true;
      cycle: EvidenceCycleResult & { ok: true };
      snapshot: EvidenceMissionSnapshot;
      persistedProposal: StoredArtifactRevision;
      persistedReview: StoredArtifactRevision;
      workflow: MissionWorkflowRecord;
    }
  | {
      ok: false;
      code: string;
      reason: string;
      cycle?: EvidenceCycleResult;
      workflow?: MissionWorkflowRecord;
    };

export type EvidenceMissionRuntime = {
  readonly durable: DurableMissionRuntime;
  readonly artifacts: ArtifactStore;
  run(request: EvidenceCycleRequest): Promise<EvidenceMissionResult>;
  /** Reload mission + artifacts after process restart (same stores). */
  resume(workflowId: string): Promise<{
    workflow: MissionWorkflowRecord | undefined;
    proposal: StoredArtifactRevision | undefined;
    review: StoredArtifactRevision | undefined;
  }>;
};

function operationDigest(snapshot: {
  packageDigest: string;
  proposalChecksum: string;
  bindingId: string;
}): string {
  return `evidence:${snapshot.packageDigest}:${snapshot.proposalChecksum}:${snapshot.bindingId}`;
}

export function createEvidenceMissionRuntime(options: {
  runner: ClaudeRunner;
  /** Required — callers must supply durable stores; use createMemoryEvidenceMissionRuntime for in-memory tests. */
  missions: MissionWorkflowStore;
  execution: DurableExecutionService;
  artifacts: ArtifactStore;
}): EvidenceMissionRuntime {
  const { missions, execution, artifacts } = options;
  const durable = createDurableMissionRuntime({ missions, execution });

  return {
    durable,
    artifacts,

    async run(request) {
      const workflowId =
        request.workflowId ??
        `evidence-mission-${randomBytes(8).toString("hex")}`;

      // 1) Enqueue durable mission BEFORE writer/review work completes.
      const enqueued = await durable.enqueueBeforeAck({
        envelope: {
          jobId: cryptoRandomUuid(),
          roleId: request.writerRoleId,
          workflowId,
          siteId: request.siteId,
          assetId: request.assetId,
          trigger: request.trigger ?? "evidence_cycle",
          policyVersion: request.policyVersion ?? "m3-next-12",
          inputArtifactIds: request.artifacts.map((a) => a.artifactId),
          capabilityGrantId: request.capabilityGrantId,
          sourceRevision: request.sourceRevision,
          maxAttempts: 2,
          deadlineSeconds: 600,
          idempotencyKey: `evidence-mission/${workflowId}`,
          expectedOutcome: "grounded_draft_with_bound_review",
        },
        reviewRequired: true,
        nowIso: request.nowIso,
      });

      // 2) Compile + writer + A25 (fixture/offline by default).
      const cycle = await runEvidenceCycle(options.runner, {
        ...request,
        workflowId,
      });
      if (!cycle.ok) {
        await missions.fail({
          workflowId,
          retryCategory: "fatal",
          lastError: `${cycle.code}: ${cycle.reason}`,
          nowIso: request.nowIso,
        });
        await execution.stores.jobs.updateStatus(
          enqueued.jobId,
          "failed",
          request.nowIso,
        );
        return {
          ok: false,
          code: cycle.code,
          reason: cycle.reason,
          cycle,
          workflow: (await missions.get(workflowId)) ?? enqueued,
        };
      }

      if (
        !cycle.reviewVerdict.approved ||
        cycle.reviewBinding.status !== "accepted"
      ) {
        await missions.fail({
          workflowId,
          retryCategory: "policy",
          lastError: `A25 rejected or did not accept proposal: ${cycle.reviewVerdict.reason}`,
          nowIso: request.nowIso,
        });
        await execution.stores.jobs.updateStatus(
          enqueued.jobId,
          "failed",
          request.nowIso,
        );
        return {
          ok: false,
          code: "REVIEW_REJECTED",
          reason: cycle.reviewVerdict.reason,
          cycle,
          workflow: (await missions.get(workflowId)) ?? enqueued,
        };
      }

      // 3) Persist proposal + review verdict as real artifacts.
      const persistedProposal = artifacts.put({
        artifactId: cycle.proposalArtifact.artifactId,
        revision: cycle.proposalArtifact.revision,
        trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
        kind: cycle.proposalArtifact.kind,
        content: cycle.proposalArtifact.content,
        createdAtIso: request.nowIso,
        metadata: {
          workflowId,
          packageDigest: cycle.inputPackage.packageDigest,
          writerRunId: cycle.writerRun.runId,
          proposalId: cycle.proposal.proposalId,
        },
      });

      const reviewContent = JSON.stringify(
        {
          type: "review_verdict",
          binding: cycle.reviewBinding,
          verdict: cycle.reviewVerdict,
          reviewerRunId: cycle.reviewerRun.runId,
        },
        null,
        2,
      );
      const persistedReview = artifacts.put({
        artifactId: `review-${cycle.reviewBinding.bindingId}`,
        trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
        kind: "review_verdict",
        content: reviewContent,
        createdAtIso: request.nowIso,
        metadata: {
          workflowId,
          bindingId: cycle.reviewBinding.bindingId,
          proposalArtifactId: cycle.proposalArtifact.artifactId,
          proposalRevision: cycle.proposalArtifact.revision,
        },
      });

      const digest = operationDigest({
        packageDigest: cycle.inputPackage.packageDigest,
        proposalChecksum: cycle.proposalArtifact.checksum,
        bindingId: cycle.reviewBinding.bindingId,
      });

      // 4) Claim lease + accept pending (ACCEPTED ≠ VERIFIED).
      await durable.claimAndAcceptEffect({
        workflowId,
        holder: `evidence-worker-${cycle.writerRun.runId}`,
        operationId: `op-${workflowId}`,
        payloadDigest: digest,
        businessIdempotencyKey: `biz-evidence-${workflowId}`,
        nowIso: request.nowIso,
        decision: {
          decisionId: `dec-${workflowId}`,
          reason: "Evidence cycle staged proposal pending A25-bound review",
          grantId: request.capabilityGrantId,
          policyId: "m3-evidence",
          gateDetails: [
            `package:${cycle.inputPackage.packageDigest}`,
            `writer:${cycle.writerRun.runId}`,
            `reviewer:${cycle.reviewerRun.runId}`,
            `costKind:${cycle.usage.writerCostKind}/${cycle.usage.reviewerCostKind}`,
          ],
        },
      });

      const review = await durable.waitForReview({
        workflowId,
        nowIso: request.nowIso,
      });

      const verified = await durable.completeReviewAndVerify({
        workflowId,
        reviewToken: review.reviewToken,
        observedDigest: digest,
        nowIso: request.nowIso,
      });

      const snapshot: EvidenceMissionSnapshot = {
        workflowId,
        phase: verified.workflow.phase,
        temporalWiring: verified.workflow.temporalWiring,
        packageDigest: cycle.inputPackage.packageDigest,
        proposalArtifact: cycle.proposalArtifact,
        reviewBinding: cycle.reviewBinding,
        writerRunId: cycle.writerRun.runId,
        reviewerRunId: cycle.reviewerRun.runId,
        usage: cycle.usage,
      };

      return {
        ok: true,
        cycle,
        snapshot,
        persistedProposal,
        persistedReview,
        workflow: verified.workflow,
      };
    },

    async resume(workflowId) {
      const workflow = await durable.getWorkflow(workflowId);
      if (!workflow) {
        return { workflow: undefined, proposal: undefined, review: undefined };
      }
      const all = artifacts.list();
      const proposal = all.find(
        (a) =>
          a.kind === "article_draft" && a.metadata.workflowId === workflowId,
      );
      const review = all.find(
        (a) =>
          a.kind === "review_verdict" && a.metadata.workflowId === workflowId,
      );
      return { workflow, proposal, review };
    },
  };
}

export function createMemoryEvidenceMissionRuntime(
  runner: ClaudeRunner,
): EvidenceMissionRuntime {
  return createEvidenceMissionRuntime({
    runner,
    missions: createMemoryMissionWorkflowStore(),
    execution: createDurableExecutionService(createMemoryDurableStores()),
    artifacts: createMemoryArtifactStore(),
  });
}

function cryptoRandomUuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
