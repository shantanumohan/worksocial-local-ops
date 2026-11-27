/**
 * A25 review binding (M3 / NEXT-12) — T-X019 / T-US-036.
 * Pure — binds an independent review job to the exact proposed artifact revision
 * and evidence package digest. Editing either invalidates the review.
 *
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. Live review/release wiring stays
 * NOT_WIRED. externalEffects: NONE. No invent past T-X073.
 */

import { isAgentRoleId, type AgentRoleId } from "./agent-roles.js";
import {
  acceptReviewVerdict,
  evaluateIndependentReviewGate,
  type EffectProposal,
  type ReviewVerdict,
} from "./role-runtime.js";

/** Cases that map exclusively to APPROVED_PAYLOAD_EDIT_INVALIDATED. */
export const REVIEW_BINDING_RELATED_CASE_IDS = [
  "T-X019",
  "T-US-036",
] as const;

/** Live review/release provider wiring — always NOT_WIRED offline. */
export const REVIEW_BINDING_LIVE_WIRING = "NOT_WIRED" as const;

/** Fixture path never claims outbound side effects. */
export const REVIEW_BINDING_EXTERNAL_EFFECTS = "NONE" as const;

/** Refuse live/sandbox VERIFIED claims on this fixture-only binding path. */
export const REVIEW_BINDING_LIVE_CLAIM_REFUSED =
  "LIVE_REVIEW_CLAIM_REFUSED" as const;

export type ReviewBindingFixtureHonestyInput = {
  fixtureOnly: boolean;
  claimLiveVerified?: boolean;
};

export type ReviewBindingFixtureHonestyResult =
  | { ok: true }
  | {
      ok: false;
      code: typeof REVIEW_BINDING_LIVE_CLAIM_REFUSED;
      reason: string;
    };

/**
 * Fixture ACCEPTED ≠ VERIFIED. Non-fixture or claimLiveVerified paths refuse.
 */
export function assertReviewBindingFixtureHonesty(
  input: ReviewBindingFixtureHonestyInput,
): ReviewBindingFixtureHonestyResult {
  if (!input.fixtureOnly || input.claimLiveVerified === true) {
    return {
      ok: false,
      code: REVIEW_BINDING_LIVE_CLAIM_REFUSED,
      reason:
        "Live/sandbox VERIFIED claim refused; review binding stays fixture-only NOT_WIRED",
    };
  }
  return { ok: true };
}

/** Structured honesty bag for soak/contract trailers (T-X019 / T-US-036). */
export type ReviewBindingHonestySummary = {
  relatedCaseIds: readonly string[];
  liveWiring: typeof REVIEW_BINDING_LIVE_WIRING;
  externalEffects: typeof REVIEW_BINDING_EXTERNAL_EFFECTS;
  liveClaimRefused: typeof REVIEW_BINDING_LIVE_CLAIM_REFUSED;
  fixtureOnly: true;
  claimLiveVerified: false;
};

export function summarizeReviewBindingHonesty(): ReviewBindingHonestySummary {
  return {
    relatedCaseIds: [...REVIEW_BINDING_RELATED_CASE_IDS],
    liveWiring: REVIEW_BINDING_LIVE_WIRING,
    externalEffects: REVIEW_BINDING_EXTERNAL_EFFECTS,
    liveClaimRefused: REVIEW_BINDING_LIVE_CLAIM_REFUSED,
    fixtureOnly: true,
    claimLiveVerified: false,
  };
}

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
  BINDING_ID_REQUIRED: "BINDING_ID_REQUIRED",
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
  if (!input.bindingId.trim()) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_ID_REQUIRED,
      reason: "bindingId is required",
    };
  }
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
      bindingId: input.bindingId.trim(),
      proposalId: input.proposal.proposalId.trim(),
      proposalArtifactId: input.proposalArtifactId.trim(),
      proposalRevision: input.proposalRevision.trim(),
      proposalChecksum: input.proposalChecksum.trim(),
      evidencePackageDigest: input.evidencePackageDigest.trim(),
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

/** Snapshot fields compared at bind/verdict time (T-X019 digest conflict family). */
export type ReviewBindingMismatchField =
  | "proposalArtifactId"
  | "proposalRevision"
  | "proposalChecksum"
  | "evidencePackageDigest";

/**
 * Fields that differ between binding pin and current snapshot.
 * Empty when exact match.
 */
export function classifyReviewBindingMismatch(
  binding: ReviewBinding,
  current: CurrentProposalSnapshot,
): ReviewBindingMismatchField[] {
  // Trim both sides so padded snapshot pins still match (tip-style trim honesty).
  const mismatches: ReviewBindingMismatchField[] = [];
  if (binding.proposalArtifactId !== current.proposalArtifactId.trim()) {
    mismatches.push("proposalArtifactId");
  }
  if (binding.proposalRevision !== current.proposalRevision.trim()) {
    mismatches.push("proposalRevision");
  }
  if (binding.proposalChecksum !== current.proposalChecksum.trim()) {
    mismatches.push("proposalChecksum");
  }
  if (
    binding.evidencePackageDigest !== current.evidencePackageDigest.trim()
  ) {
    mismatches.push("evidencePackageDigest");
  }
  return mismatches;
}

/** True when current snapshot still matches the bound pin exactly. */
export function reviewBindingSnapshotMatches(
  binding: ReviewBinding,
  current: CurrentProposalSnapshot,
): boolean {
  return classifyReviewBindingMismatch(binding, current).length === 0;
}

/** Terminal statuses cannot accept a new verdict — issue a fresh binding. */
export function isReviewBindingTerminal(
  status: ReviewBindingStatusValue,
): boolean {
  return (
    status === ReviewBindingStatus.ACCEPTED ||
    status === ReviewBindingStatus.REJECTED
  );
}

/**
 * Re-check binding against current proposal artifact + evidence.
 * Any edit to either invalidates the review.
 */
export type ValidateReviewBindingFailure = {
  ok: false;
  code: ReviewBindingErrorCodeValue;
  reason: string;
  binding: ReviewBinding;
  /** Present when invalidate was caused by snapshot field edits (T-X019). */
  mismatchedFields?: readonly ReviewBindingMismatchField[];
};

export function validateReviewBinding(
  binding: ReviewBinding,
  current: CurrentProposalSnapshot,
): { ok: true; binding: ReviewBinding } | ValidateReviewBindingFailure {
  if (binding.status === ReviewBindingStatus.INVALIDATED) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_INVALIDATED,
      reason: binding.invalidationReason ?? "Review binding previously invalidated",
      binding,
    };
  }
  if (isReviewBindingTerminal(binding.status)) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_INVALIDATED,
      reason: `Review binding is terminal (${binding.status}) — issue a new binding for a new auditable review`,
      binding,
    };
  }

  const mismatches = classifyReviewBindingMismatch(binding, current);

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
      mismatchedFields: mismatches,
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
  if (input.proposal.proposalId !== input.binding.proposalId) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_MISMATCH,
      reason: "Supplied proposal.proposalId does not match bound proposal",
      binding: input.binding,
    };
  }
  if (input.proposal.authorRoleId !== input.binding.authorRoleId) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_MISMATCH,
      reason: "Supplied proposal.authorRoleId does not match bound author",
      binding: input.binding,
    };
  }
  if (input.verdict.authorRoleId !== input.binding.authorRoleId) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_MISMATCH,
      reason: "Verdict authorRoleId does not match bound author",
      binding: input.binding,
    };
  }
  const boundEvidence = [...input.binding.evidenceArtifactIds].sort().join(",");
  const proposalEvidence = [...input.proposal.evidenceArtifactIds]
    .sort()
    .join(",");
  if (boundEvidence !== proposalEvidence) {
    return {
      ok: false,
      code: ReviewBindingErrorCode.BINDING_MISMATCH,
      reason: "Supplied proposal evidenceArtifactIds do not match binding",
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
