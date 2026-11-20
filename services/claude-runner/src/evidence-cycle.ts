/**
 * Real Claude evidence cycle (M3 / NEXT-12): compile → writer → persistable
 * proposal artifact → separate A25 review bound to exact revisions.
 *
 * Default path uses the offline fake/fixture adapter (no spend).
 * Live CLI only when requireLive=true and CLI is available (fail-closed otherwise).
 * forceFixture=false prefers live without requiring it.
 */

import { createHash, randomBytes } from "node:crypto";
import type { JobEnvelope } from "@worksocial/contracts";
import {
  ArtifactTrustLabel,
  CostRecordingKind,
  ReviewBindingStatus,
  RoleExecutionMode,
  RoleRunStatus,
  acceptBoundReviewVerdict,
  compileInputPackage,
  createReviewBinding,
  validateEvidenceCitations,
  validateReviewBinding,
  type AgentRoleId,
  type ArtifactRevisionRef,
  type CompiledInputPackage,
  type EffectProposal,
  type ReviewBinding,
  type ReviewVerdict,
} from "@worksocial/domain";
import type { ClaudeRunner, RoleJobResult } from "./runner.js";
import {
  simulateReviewerOutput,
  simulateWriterOutput,
} from "./offline-fake-adapter.js";

export type ProposalArtifactRecord = {
  artifactId: string;
  revision: string;
  checksum: string;
  content: string;
  kind: string;
  trustLabel: typeof ArtifactTrustLabel.UNTRUSTED_SOURCE;
};

export type EvidenceCycleUsage = {
  writerCostMinor: number;
  writerCostKind: string;
  reviewerCostMinor: number;
  reviewerCostKind: string;
  /** Always true for offline/fixture path — estimates never look like ACTUAL. */
  estimatesLabeled: boolean;
};

export type EvidenceCycleRequest = {
  writerRoleId: AgentRoleId;
  siteId: string;
  assetId: string;
  trigger?: string;
  policyVersion?: string;
  capabilityGrantId: string;
  sourceRevision: string;
  nowIso: string;
  artifacts: readonly ArtifactRevisionRef[];
  workflowId?: string;
  /**
   * Force offline fake/fixture. Default true (no production spend).
   * Set false to prefer live when available without requireLive fail-closed.
   */
  forceFixture?: boolean;
  /**
   * Require live Claude CLI. When true and CLI missing, fail closed —
   * never silent fixture SUCCESS.
   */
  requireLive?: boolean;
};

export type EvidenceCycleResult =
  | {
      ok: true;
      inputPackage: CompiledInputPackage;
      writerRun: RoleJobResult;
      proposal: EffectProposal;
      proposalArtifact: ProposalArtifactRecord;
      reviewBinding: ReviewBinding;
      reviewerRun: RoleJobResult;
      reviewVerdict: ReviewVerdict;
      usage: EvidenceCycleUsage;
      executionMode: "fixture" | "live_cli";
    }
  | {
      ok: false;
      code: string;
      reason: string;
      inputPackage?: CompiledInputPackage;
      writerRun?: RoleJobResult;
      reviewBinding?: ReviewBinding;
      reviewerRun?: RoleJobResult;
    };

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function envelopeFor(
  roleId: AgentRoleId,
  input: EvidenceCycleRequest,
  inputArtifactIds: string[],
  workflowId: string,
): JobEnvelope {
  return {
    jobId: uuid(),
    roleId,
    workflowId,
    siteId: input.siteId,
    assetId: input.assetId,
    trigger: input.trigger ?? "evidence_cycle",
    policyVersion: input.policyVersion ?? "m3-next-12",
    inputArtifactIds,
    capabilityGrantId: input.capabilityGrantId,
    sourceRevision: input.sourceRevision,
    maxAttempts: 1,
    deadlineSeconds: 180,
    idempotencyKey: `evidence/${workflowId}/${roleId}/${uuid()}`,
    expectedOutcome: "grounded_draft_with_bound_review",
  };
}

function isRunnerFailure(status: string): boolean {
  return (
    status === RoleRunStatus.FAILED ||
    status === RoleRunStatus.TIMED_OUT ||
    status === RoleRunStatus.DENIED ||
    status === RoleRunStatus.BUDGET_EXHAUSTED
  );
}

/**
 * Explicit A25 decision from structured output — never synthesize approval
 * from BUDGET_EXHAUSTED / AWAITING_REVIEW / missing output.
 */
function explicitA25Decision(run: RoleJobResult):
  | { ok: true; approved: boolean; reason: string }
  | { ok: false; reason: string } {
  if (isRunnerFailure(run.status)) {
    return {
      ok: false,
      reason: `A25 run did not complete a review decision (status=${run.status})`,
    };
  }
  if (run.status === RoleRunStatus.AWAITING_REVIEW) {
    return {
      ok: false,
      reason: "A25 cannot leave its own review in awaiting_review — no decision",
    };
  }
  if (!run.output) {
    return { ok: false, reason: "A25 produced no structured output — no decision" };
  }
  if (run.output.status === "ok") {
    return { ok: true, approved: true, reason: run.output.summary };
  }
  if (run.output.status === "error") {
    return { ok: true, approved: false, reason: run.output.summary };
  }
  return {
    ok: false,
    reason: `A25 status '${run.output.status}' is not an explicit approve/reject decision`,
  };
}

/**
 * Run writer + A25 review against a compiled evidence package.
 * Prefer offline fake adapter; live path is optional and fail-closed.
 */
export async function runEvidenceCycle(
  runner: ClaudeRunner,
  request: EvidenceCycleRequest,
): Promise<EvidenceCycleResult> {
  const requireLive = request.requireLive === true;
  // Default forceFixture=true for no-spend safety; explicit false prefers live.
  const preferLive = !requireLive && request.forceFixture === false;
  const useForcedFixture = !requireLive && !preferLive;
  const workflowId = request.workflowId ?? `evcycle-${uuid()}`;

  const compiled = compileInputPackage({
    packageId: `pkg-${workflowId}`,
    roleId: request.writerRoleId,
    capabilityGrantId: request.capabilityGrantId,
    sourceRevision: request.sourceRevision,
    nowIso: request.nowIso,
    artifacts: request.artifacts,
  });
  if (!compiled.ok) {
    return {
      ok: false,
      code: compiled.code,
      reason: compiled.reason,
    };
  }
  const inputPackage = compiled.package;
  const inputIds = inputPackage.entries.map((e) => e.artifactId);

  const writerEnvelope = envelopeFor(
    request.writerRoleId,
    request,
    inputIds,
    workflowId,
  );

  let writerRun: RoleJobResult;
  let usedOfflineFake = false;

  if (requireLive || preferLive) {
    writerRun = await runner.enqueue({
      envelope: writerEnvelope,
      requireLive: requireLive || undefined,
      forceFixture: false,
      compiledPackage: inputPackage,
    });
    if (requireLive && isRunnerFailure(writerRun.status)) {
      return {
        ok: false,
        code: "WRITER_LIVE_FAILED",
        reason: writerRun.summary,
        inputPackage,
        writerRun,
      };
    }
    if (isRunnerFailure(writerRun.status)) {
      return {
        ok: false,
        code: "WRITER_FAILED",
        reason: writerRun.summary,
        inputPackage,
        writerRun,
      };
    }
    // preferLive fell back to fixture — overlay evidence-aware fake only then.
    if (
      !requireLive &&
      writerRun.executionMode === RoleExecutionMode.FIXTURE
    ) {
      usedOfflineFake = true;
    }
  } else if (useForcedFixture) {
    // Explicit offline fake path (default).
    writerRun = await runner.enqueue({
      envelope: writerEnvelope,
      forceFixture: true,
      compiledPackage: inputPackage,
    });
    if (isRunnerFailure(writerRun.status)) {
      return {
        ok: false,
        code: "WRITER_RUNNER_FAILED",
        reason: `Runner gate failed before offline fake overlay: ${writerRun.summary}`,
        inputPackage,
        writerRun,
      };
    }
    usedOfflineFake = true;
  } else {
    return {
      ok: false,
      code: "INVALID_MODE",
      reason: "Unable to resolve writer execution mode",
      inputPackage,
    };
  }

  if (usedOfflineFake) {
    const fakeOutput = simulateWriterOutput({
      envelope: writerEnvelope,
      package: inputPackage,
    });
    const citations = validateEvidenceCitations({
      package: inputPackage,
      citedArtifactIds: [
        ...fakeOutput.artifactIds,
        ...fakeOutput.proposedEffects.flatMap((p) => [
          ...p.evidenceArtifactIds,
        ]),
      ],
      summary: fakeOutput.summary,
    });
    if (!citations.ok) {
      return {
        ok: false,
        code: citations.code,
        reason: citations.reason,
        inputPackage,
        writerRun,
      };
    }
    writerRun = {
      ...writerRun,
      summary: fakeOutput.summary,
      output: fakeOutput,
      status:
        fakeOutput.proposedEffects.length > 0
          ? RoleRunStatus.AWAITING_REVIEW
          : RoleRunStatus.SUCCEEDED,
      executionMode: RoleExecutionMode.FIXTURE,
      costKind: CostRecordingKind.FIXTURE,
      costMinor: 0,
      outcome: {
        ...writerRun.outcome,
        reason: fakeOutput.summary,
        artifactIds: fakeOutput.artifactIds,
        costKind: CostRecordingKind.FIXTURE,
        costMinor: 0,
        status:
          fakeOutput.proposedEffects.length > 0
            ? RoleRunStatus.AWAITING_REVIEW
            : RoleRunStatus.SUCCEEDED,
        featureHints: {
          ...writerRun.outcome.featureHints,
          offlineFakeAdapter: true,
          packageDigest: inputPackage.packageDigest,
        },
      },
    };
  }

  if (!writerRun.output?.proposedEffects[0]) {
    return {
      ok: false,
      code: "WRITER_NO_PROPOSAL",
      reason: "Writer produced no reviewable proposal for A25 binding",
      inputPackage,
      writerRun,
    };
  }

  const proposal = writerRun.output.proposedEffects[0];

  const citeCheck = validateEvidenceCitations({
    package: inputPackage,
    citedArtifactIds: [
      ...writerRun.output.artifactIds,
      ...writerRun.output.proposedEffects.flatMap((p) => [
        ...p.evidenceArtifactIds,
      ]),
    ],
    summary: writerRun.output.summary,
  });
  if (!citeCheck.ok) {
    return {
      ok: false,
      code: citeCheck.code,
      reason: citeCheck.reason,
      inputPackage,
      writerRun,
    };
  }

  const draftContent = JSON.stringify(
    {
      type: "article_draft",
      roleId: request.writerRoleId,
      summary: writerRun.summary,
      proposal,
      packageDigest: inputPackage.packageDigest,
      citedEvidence: proposal.evidenceArtifactIds,
    },
    null,
    2,
  );
  const proposalArtifact: ProposalArtifactRecord = {
    artifactId: `proposal-${proposal.proposalId}`,
    revision: `rev-${sha256(draftContent).slice(0, 8)}`,
    checksum: sha256(draftContent),
    content: draftContent,
    kind: "article_draft",
    trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
  };

  const bindingResult = createReviewBinding({
    bindingId: `bind-${proposal.proposalId}`,
    proposal,
    proposalArtifactId: proposalArtifact.artifactId,
    proposalRevision: proposalArtifact.revision,
    proposalChecksum: proposalArtifact.checksum,
    evidencePackageDigest: inputPackage.packageDigest,
    evidenceArtifactIds: proposal.evidenceArtifactIds,
    createdAtIso: request.nowIso,
  });
  if (!bindingResult.ok) {
    return {
      ok: false,
      code: bindingResult.code,
      reason: bindingResult.reason,
      inputPackage,
      writerRun,
    };
  }
  const reviewBinding = bindingResult.binding;

  const reviewerEnvelope = envelopeFor(
    "A25",
    request,
    [proposalArtifact.artifactId, ...proposal.evidenceArtifactIds],
    `${workflowId}-review`,
  );

  const reviewContext = {
    bindingId: reviewBinding.bindingId,
    proposalId: reviewBinding.proposalId,
    proposalArtifactId: reviewBinding.proposalArtifactId,
    proposalRevision: reviewBinding.proposalRevision,
    proposalChecksum: reviewBinding.proposalChecksum,
    evidencePackageDigest: reviewBinding.evidencePackageDigest,
    authorRoleId: reviewBinding.authorRoleId,
  };

  let reviewerRun: RoleJobResult;
  let usedOfflineReviewFake = false;

  if (requireLive || preferLive) {
    reviewerRun = await runner.enqueue({
      envelope: reviewerEnvelope,
      requireLive: requireLive || undefined,
      forceFixture: false,
      compiledPackage: inputPackage,
      reviewContext,
    });
    if (requireLive && isRunnerFailure(reviewerRun.status)) {
      return {
        ok: false,
        code: "REVIEWER_LIVE_FAILED",
        reason: reviewerRun.summary,
        inputPackage,
        writerRun,
        reviewBinding,
        reviewerRun,
      };
    }
    if (
      !requireLive &&
      reviewerRun.executionMode === RoleExecutionMode.FIXTURE
    ) {
      usedOfflineReviewFake = true;
    }
  } else {
    reviewerRun = await runner.enqueue({
      envelope: reviewerEnvelope,
      forceFixture: true,
      compiledPackage: inputPackage,
      reviewContext,
    });
    if (isRunnerFailure(reviewerRun.status)) {
      return {
        ok: false,
        code: "REVIEWER_RUNNER_FAILED",
        reason: `Runner gate failed before offline fake overlay: ${reviewerRun.summary}`,
        inputPackage,
        writerRun,
        reviewBinding,
        reviewerRun,
      };
    }
    usedOfflineReviewFake = true;
  }

  if (usedOfflineReviewFake) {
    const fakeReview = simulateReviewerOutput({
      envelope: reviewerEnvelope,
      binding: reviewBinding,
      proposal,
      draftSummary: writerRun.summary,
    });
    reviewerRun = {
      ...reviewerRun,
      summary: fakeReview.summary,
      output: fakeReview,
      status:
        fakeReview.status === "ok"
          ? RoleRunStatus.SUCCEEDED
          : RoleRunStatus.FAILED,
      executionMode: RoleExecutionMode.FIXTURE,
      costKind: CostRecordingKind.FIXTURE,
      costMinor: 0,
      outcome: {
        ...reviewerRun.outcome,
        reason: fakeReview.summary,
        artifactIds: fakeReview.artifactIds,
        costKind: CostRecordingKind.FIXTURE,
        costMinor: 0,
        status:
          fakeReview.status === "ok"
            ? RoleRunStatus.SUCCEEDED
            : RoleRunStatus.FAILED,
        featureHints: {
          ...reviewerRun.outcome.featureHints,
          offlineFakeAdapter: true,
          reviewBindingId: reviewBinding.bindingId,
        },
      },
    };
  }

  const decision = explicitA25Decision(reviewerRun);
  if (!decision.ok) {
    return {
      ok: false,
      code: "REVIEW_DECISION_MISSING",
      reason: decision.reason,
      inputPackage,
      writerRun,
      reviewBinding,
      reviewerRun,
    };
  }

  const reviewVerdict: ReviewVerdict = {
    verdictId: `verdict-${reviewerEnvelope.jobId}`,
    proposalId: proposal.proposalId,
    reviewerRoleId: "A25",
    authorRoleId: proposal.authorRoleId,
    approved: decision.approved,
    reason: decision.reason,
    decidedAtIso: new Date().toISOString(),
  };

  const current = {
    proposalArtifactId: proposalArtifact.artifactId,
    proposalRevision: proposalArtifact.revision,
    proposalChecksum: proposalArtifact.checksum,
    evidencePackageDigest: inputPackage.packageDigest,
  };
  const stillBound = validateReviewBinding(reviewBinding, current);
  if (!stillBound.ok) {
    return {
      ok: false,
      code: stillBound.code,
      reason: stillBound.reason,
      inputPackage,
      writerRun,
      reviewBinding: stillBound.binding,
      reviewerRun,
    };
  }

  const accepted = acceptBoundReviewVerdict({
    binding: reviewBinding,
    proposal,
    current,
    verdict: reviewVerdict,
  });
  if (!accepted.ok) {
    return {
      ok: false,
      code: accepted.code,
      reason: accepted.reason,
      inputPackage,
      writerRun,
      reviewBinding: accepted.binding,
      reviewerRun,
    };
  }

  if (
    !reviewVerdict.approved ||
    accepted.binding.status !== ReviewBindingStatus.ACCEPTED
  ) {
    return {
      ok: false,
      code: "REVIEW_REJECTED",
      reason: reviewVerdict.reason,
      inputPackage,
      writerRun,
      reviewBinding: accepted.binding,
      reviewerRun,
    };
  }

  return {
    ok: true,
    inputPackage,
    writerRun,
    proposal,
    proposalArtifact,
    reviewBinding: accepted.binding,
    reviewerRun,
    reviewVerdict: accepted.verdict,
    usage: {
      writerCostMinor: writerRun.costMinor,
      writerCostKind: writerRun.costKind,
      reviewerCostMinor: reviewerRun.costMinor,
      reviewerCostKind: reviewerRun.costKind,
      estimatesLabeled:
        writerRun.costKind !== CostRecordingKind.ACTUAL ||
        reviewerRun.costKind !== CostRecordingKind.ACTUAL,
    },
    executionMode:
      requireLive || writerRun.executionMode === RoleExecutionMode.LIVE_CLI
        ? "live_cli"
        : "fixture",
  };
}

/** Prove that mutating proposal/evidence invalidates a prior binding. */
export function invalidateBindingAfterEdit(input: {
  binding: ReviewBinding;
  editedProposalRevision?: string;
  editedEvidenceDigest?: string;
}): ReviewBinding {
  const current = {
    proposalArtifactId: input.binding.proposalArtifactId,
    proposalRevision:
      input.editedProposalRevision ?? input.binding.proposalRevision,
    proposalChecksum: input.binding.proposalChecksum,
    evidencePackageDigest:
      input.editedEvidenceDigest ?? input.binding.evidencePackageDigest,
  };
  const result = validateReviewBinding(input.binding, current);
  return result.ok ? result.binding : result.binding;
}
