/**
 * Real Claude evidence cycle (M3 / NEXT-12): compile → writer → persistable
 * proposal artifact → separate A25 review bound to exact revisions.
 *
 * Default path uses the offline fake/fixture adapter (no spend).
 * Live CLI only when requireLive=true and CLI is available (fail-closed otherwise).
 */

import { createHash, randomBytes } from "node:crypto";
import type { JobEnvelope } from "@worksocial/contracts";
import {
  ArtifactTrustLabel,
  CostRecordingKind,
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
import type { ClaudeRunner, RoleJobRequest, RoleJobResult } from "./runner.js";
import {
  simulateReviewerOutput,
  simulateWriterOutput,
} from "./offline-fake-adapter.js";
import { runRoleFixture } from "./fixture-runner.js";

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
  /** Force offline fake/fixture (default true — no production spend). */
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

/**
 * Run writer + A25 review against a compiled evidence package.
 * Prefer offline fake adapter; live path is optional and fail-closed.
 */
export async function runEvidenceCycle(
  runner: ClaudeRunner,
  request: EvidenceCycleRequest,
): Promise<EvidenceCycleResult> {
  const forceFixture = request.forceFixture !== false && !request.requireLive;
  const requireLive = request.requireLive === true;
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

  if (requireLive) {
    writerRun = await runner.enqueue({
      envelope: writerEnvelope,
      requireLive: true,
      forceFixture: false,
    });
    if (
      writerRun.status === RoleRunStatus.FAILED ||
      writerRun.status === RoleRunStatus.TIMED_OUT ||
      writerRun.status === RoleRunStatus.DENIED
    ) {
      return {
        ok: false,
        code: "WRITER_LIVE_FAILED",
        reason: writerRun.summary,
        inputPackage,
        writerRun,
      };
    }
  } else {
    // Explicit offline fake adapter — fixture class, labeled zero cost.
    const fakeOutput = simulateWriterOutput({
      envelope: writerEnvelope,
      package: inputPackage,
    });
    // Still exercise runner gates for unauthorized paths via fixture when needed;
    // for happy path, synthesize a RoleJobResult from fake + runner budget bookkeeping.
    const fixtureProbe = runRoleFixture({ envelope: writerEnvelope });
    void fixtureProbe;

    writerRun = await runner.enqueue({
      envelope: writerEnvelope,
      forceFixture: true,
    });

    // Replace fixture generic summary/citations with evidence-aware fake output.
    // Keep runner status/budget/cost honesty from fixture path.
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

  if (!writerRun.output || writerRun.output.proposedEffects.length < 1) {
    // Live path may produce proposals; fixture fake always should for A13.
    if (forceFixture || !requireLive) {
      return {
        ok: false,
        code: "WRITER_NO_PROPOSAL",
        reason: "Writer produced no reviewable proposal",
        inputPackage,
        writerRun,
      };
    }
  }

  const proposal =
    writerRun.output?.proposedEffects[0] ??
    ({
      proposalId: `missing-${writerEnvelope.jobId}`,
      authorRoleId: request.writerRoleId,
      actionClass: "create",
      operation: "stage_artifact",
      assetId: request.assetId,
      channelId: "local-artifact",
      payloadDigest: "missing",
      evidenceArtifactIds: inputIds,
    } satisfies EffectProposal);

  if (!writerRun.output?.proposedEffects[0]) {
    return {
      ok: false,
      code: "WRITER_NO_PROPOSAL",
      reason: "Writer produced no reviewable proposal for A25 binding",
      inputPackage,
      writerRun,
    };
  }

  // Live outputs must also cite evidence when package requires it.
  if (writerRun.output) {
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
    [
      proposalArtifact.artifactId,
      ...proposal.evidenceArtifactIds,
    ],
    `${workflowId}-review`,
  );

  let reviewerRun: RoleJobResult;
  let reviewVerdict: ReviewVerdict;

  if (requireLive) {
    reviewerRun = await runner.enqueue({
      envelope: reviewerEnvelope,
      requireLive: true,
      forceFixture: false,
    } satisfies RoleJobRequest);
    if (
      reviewerRun.status === RoleRunStatus.FAILED ||
      reviewerRun.status === RoleRunStatus.TIMED_OUT
    ) {
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
    reviewVerdict = {
      verdictId: `verdict-${reviewerEnvelope.jobId}`,
      proposalId: proposal.proposalId,
      reviewerRoleId: "A25",
      authorRoleId: proposal.authorRoleId,
      approved: reviewerRun.status !== RoleRunStatus.DENIED,
      reason: reviewerRun.summary,
      decidedAtIso: new Date().toISOString(),
    };
  } else {
    const fakeReview = simulateReviewerOutput({
      envelope: reviewerEnvelope,
      binding: reviewBinding,
      proposal,
      draftSummary: writerRun.summary,
    });
    reviewerRun = await runner.enqueue({
      envelope: reviewerEnvelope,
      forceFixture: true,
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
    reviewVerdict = {
      verdictId: `verdict-${reviewerEnvelope.jobId}`,
      proposalId: proposal.proposalId,
      reviewerRoleId: "A25",
      authorRoleId: proposal.authorRoleId,
      approved: fakeReview.status === "ok",
      reason: fakeReview.summary,
      decidedAtIso: new Date().toISOString(),
    };
  }

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
      // Fixture/estimate/unknown are labeled; only ACTUAL is observed spend.
      estimatesLabeled:
        writerRun.costKind !== CostRecordingKind.ACTUAL ||
        reviewerRun.costKind !== CostRecordingKind.ACTUAL,
    },
    executionMode: requireLive ? "live_cli" : "fixture",
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
