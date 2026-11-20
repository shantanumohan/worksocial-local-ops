/**
 * A25 review binding (M3 / NEXT-12).
 * Pure — binds an independent review job to the exact proposed artifact revision
 * and evidence package digest. Editing either invalidates the review.
 */

import { isAgentRoleId, type AgentRoleId } from "./agent-roles.js";
import {
  acceptReviewVerdict,
  evaluateIndependentReviewGate,
  type EffectProposal,
  type ReviewVerdict,
} from "./role-runtime.js";

export const ReviewBindingStatus = {
  BOUND: "bound",
  INVALIDATED: "invalidated",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
} as const;

export type ReviewBindingStatusValue =
  (typeof ReviewBindingStatus)[keyof typeof ReviewBindingStatus];

export const ReviewBindingErrorCode = {
  AUTHOR_UNKNOWN: "AUTHOR_UNKNOWN",
  REVIEWER_MUST_BE_A25: "REVIEWER_MUST_BE_A25",
  PROPOSAL_REQUIRED: "PROPOSAL_REQUIRED",
  EVIDENCE_DIGEST_REQUIRED: "EVIDENCE_DIGEST_REQUIRED",
  ARTIFACT_REVISION_REQUIRED: "ARTIFACT_REVISION_REQUIRED",
  BINDING_INVALIDATED: "BINDING_INVALIDATED",
  BINDING_MISMATCH: "BINDING_MISMATCH",
  SELF_APPROVAL_FORBIDDEN: "SELF_APPROVAL_FORBIDDEN",
} as const;

export type ReviewBindingErrorCodeValue =
  (typeof ReviewBindingErrorCode)[keyof typeof ReviewBindingErrorCode];

/**
 * Immutable snapshot that an A25 review job must re-present at verdict time.
 */
export type ReviewBinding = {
  bindingId: string;
  proposalId: string;
  proposalArtifactId: string;
  proposalRevision: string;
  proposalChecksum: string;
  evidencePackageDigest: string;
  evidenceArtifactIds: readonly string[];
  authorRoleId: AgentRoleId;
  /** Independent reviewer — always A25 for Release 1 writer proposals. */
  reviewerRoleId: "A25";
  createdAtIso: string;
  status: ReviewBindingStatusValue;
  /** Set when status becomes invalidated. */
  invalidationReason?: string;
};

export type CreateReviewBindingInput = {
  bindingId: string;
  proposal: EffectProposal;
  proposalArtifactId: string;
  proposalRevision: string;
  proposalChecksum: string;
  evidencePackageDigest: string;
  evidenceArtifactIds?: readonly string[];
  createdAtIso: string;
};

export type CreateReviewBindingResult =
  | { ok: true; binding: ReviewBinding }
  | { ok: false; code: ReviewBindingErrorCodeValue; reason: string };

export function createReviewBinding(
  input: CreateReviewBindingInput,
): CreateReviewBindingResult {
  if (!isAgentRoleId(input.proposal.authorRoleId)) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.AUTHOR_UNKNOWN,
      reason: "Proposal authorRoleId must be a registered A01–A30 role",
    };
  }
  if (input.proposal.selfApprovalAttempted) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.SELF_APPROVAL_FORBIDDEN,
      reason: "Cannot bind review for a self-approval attempt",
    };
  }
  if (!input.proposalArtifactId.trim() || !input.proposalRevision.trim()) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.ARTIFACT_REVISION_REQUIRED,
      reason: "Proposal artifact id and immutable revision are required",
    };
  }
  if (!input.proposalChecksum.trim()) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.ARTIFACT_REVISION_REQUIRED,
      reason: "Proposal artifact checksum is required",
    };
  }
  if (!input.evidencePackageDigest.trim()) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.EVIDENCE_DIGEST_REQUIRED,
      reason: "Evidence package digest is required to bind A25 review",
    };
  }
  if (!input.proposal.proposalId.trim()) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.PROPOSAL_REQUIRED,
      reason: "proposalId is required",
    };
  }

  const gate = evaluateIndependentReviewGate({
    proposal: input.proposal,
    reviewerRoleId: "A25",
  });
  if (!gate.ok) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.SELF_APPROVAL_FORBIDDEN,
      reason: gate.reason,
    };
  }

  return {
    ok: true,
    binding: {
      bindingId: input.bindingId,
      proposalId: input.proposal.proposalId,
      proposalArtifactId: input.proposalArtifactId,
      proposalRevision: input.proposalRevision,
      proposalChecksum: input.proposalChecksum,
      evidencePackageDigest: input.evidencePackageDigest,
      evidenceArtifactIds:
        input.evidenceArtifactIds ??
        [...input.proposal.evidenceArtifactIds],
      authorRoleId: input.proposal.authorRoleId,
      reviewerRoleId: "A25",
      createdAtIso: input.createdAtIso,
      status: ReviewBindingStatus.BOUND,
    },
  };
}

export type CurrentProposalSnapshot = {
  proposalArtifactId: string;
  proposalRevision: string;
  proposalChecksum: string;
  evidencePackageDigest: string;
};

/**
 * Re-check binding against current proposal artifact + evidence.
 * Any edit to either invalidates the review.
 */
export function validateReviewBinding(
  binding: ReviewBinding,
  current: CurrentProposalSnapshot,
):
  | { ok: true; binding: ReviewBinding }
  | {
      ok: false;
      code: ReviewBindingErrorCodeValue;
      reason: string;
      binding: ReviewBinding;
    } {
  if (binding.status === ReviewBindingStatus.INVALIDATED) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_INVALIDATED,
      reason: binding.invalidationReason ?? "Review binding previously invalidated",
      binding,
    };
  }

  const mismatches: string[] = [];
  if (binding.proposalArtifactId !== current.proposalArtifactId) {
    mismatches.push("proposalArtifactId");
  }
  if (binding.proposalRevision !== current.proposalRevision) {
    mismatches.push("proposalRevision");
  }
  if (binding.proposalChecksum !== current.proposalChecksum) {
    mismatches.push("proposalChecksum");
  }
  if (binding.evidencePackageDigest !== current.evidencePackageDigest) {
    mismatches.push("evidencePackageDigest");
  }

  if (mismatches.length > 0) {
    const invalidated: ReviewBinding = {
      ...binding,
      status: ReviewBindingStatus.INVALIDATED,
      invalidationReason: `Edited after bind: ${mismatches.join(", ")} — A25 review invalidated`,
    };
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_INVALIDATED,
      reason: invalidated.invalidationReason!,
      binding: invalidated,
    };
  }

  return { ok: true, binding };
}

/**
 * Accept an A25 verdict only when the binding still matches exact revisions.
 */
export function acceptBoundReviewVerdict(input: {
  binding: ReviewBinding;
  proposal: EffectProposal;
  current: CurrentProposalSnapshot;
  verdict: ReviewVerdict;
}):
  | { ok: true; binding: ReviewBinding; verdict: ReviewVerdict }
  | { ok: false; code: string; reason: string; binding: ReviewBinding } {
  if (input.verdict.reviewerRoleId !== "A25") {
    return {
      ok: false,
      code: ReviewBindingErrorCode.REVIEWER_MUST_BE_A25,
      reason: "Bound review verdicts must be issued by A25",
      binding: input.binding,
    };
  }

  const stillBound = validateReviewBinding(input.binding, input.current);
  if (!stillBound.ok) {
    return {
      ok: false,
      code: stillBound.code,
      reason: stillBound.reason,
      binding: stillBound.binding,
    };
  }

  if (input.verdict.proposalId !== input.binding.proposalId) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_MISMATCH,
      reason: "Verdict proposalId does not match bound proposal",
      binding: input.binding,
    };
  }

  const accepted = acceptReviewVerdict({
    proposal: input.proposal,
    verdict: input.verdict,
  });
  if (!accepted.ok) {
    return {
      ok: false,
      code: accepted.code,
      reason: accepted.reason,
      binding: input.binding,
    };
  }

  return {
    ok: true,
    binding: {
      ...stillBound.binding,
      status: input.verdict.approved
        ? ReviewBindingStatus.ACCEPTED
        : ReviewBindingStatus.REJECTED,
    },
    verdict: accepted.verdict,
  };
}
