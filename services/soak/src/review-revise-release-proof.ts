/**
 * Fixture proof for T-US-035 — Review/revise/release (F18/SC-05).
 * Independent decision bound to revision + policy; release receipt or
 * blocked exception; self-approval and stale approval refused; live NOT_WIRED.
 * Distinct from T-US-027 (demand page release), T-US-036/T-X019 (stale
 * approval), T-US-054/T-X018 (self-approval alone). External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateReviewReviseRelease,
  type SoakProofRecord,
} from "@worksocial/domain";

const qaGates = [
  { gateId: "tech-links", kind: "technical" as const, status: "pass" as const },
  { gateId: "fact-hours", kind: "factual" as const, status: "pass" as const },
  {
    gateId: "policy-claims",
    kind: "policy" as const,
    status: "not_applicable" as const,
  },
];

/**
 * Complete expected proof set for T-US-035 fixture ACCEPTED.
 */
export function proofReviewReviseRelease(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff:
      "--- a/hours.md\n+++ b/hours.md\n-Mon–Fri 9–5\n+Mon–Fri 8–6",
    evidenceSummary: "Observed recurring hours question; update published hours.",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A25",
    authorRoleId: "A15",
    decision: "APPROVE",
    decisionReason: null,
    policyVersion: "policy-release-v1",
    releaseReceiptId: "receipt-hours-release-1",
    blockedExceptionCode: null,
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
  });
  if (
    happy.allowed &&
    happy.code === "REVIEW_RELEASE_RECEIPT_RECORDED" &&
    happy.evidence.releaseReceiptId === "receipt-hours-release-1" &&
    happy.evidence.releaseVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "approve+receipt → REVIEW_RELEASE_RECEIPT_RECORDED; releaseVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const blocked = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff:
      "--- a/hours.md\n+++ b/hours.md\n-Mon–Fri 9–5\n+Mon–Fri 8–6",
    evidenceSummary: "Observed recurring hours question; update published hours.",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A25",
    authorRoleId: "A15",
    decision: "REJECT",
    decisionReason: "Factual claim unsupported by sources",
    policyVersion: "policy-release-v1",
    releaseReceiptId: null,
    blockedExceptionCode: "POLICY_FACT_UNSUPPORTED",
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
  });
  if (
    blocked.allowed &&
    blocked.code === "REVIEW_BLOCKED_EXCEPTION_RECORDED" &&
    blocked.evidence.blockedExceptionCode === "POLICY_FACT_UNSUPPORTED"
  ) {
    details.push(
      "reject+blockedException → REVIEW_BLOCKED_EXCEPTION_RECORDED; no silent release",
    );
  } else {
    passed = false;
    details.push(`Blocked exception unexpectedly ${JSON.stringify(blocked)}`);
  }

  const selfApproval = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff: "diff",
    evidenceSummary: "summary",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A15",
    authorRoleId: "A15",
    decision: "APPROVE",
    decisionReason: null,
    policyVersion: "policy-release-v1",
    releaseReceiptId: "receipt-hours-release-1",
    blockedExceptionCode: null,
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
  });
  if (
    !selfApproval.allowed &&
    selfApproval.code === "SELF_APPROVAL_FORBIDDEN"
  ) {
    details.push("author==reviewer → SELF_APPROVAL_FORBIDDEN");
  } else {
    passed = false;
    details.push(`Self-approval unexpectedly ${JSON.stringify(selfApproval)}`);
  }

  const stale = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff: "diff",
    evidenceSummary: "summary",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A25",
    authorRoleId: "A15",
    decision: "APPROVE",
    decisionReason: null,
    policyVersion: "policy-release-v1",
    releaseReceiptId: "receipt-hours-release-1",
    blockedExceptionCode: null,
    revisionChangedAfterDecision: true,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
  });
  if (!stale.allowed && stale.code === "STALE_APPROVAL_INVALIDATED") {
    details.push(
      "revisionChangedAfterDecision → STALE_APPROVAL_INVALIDATED",
    );
  } else {
    passed = false;
    details.push(`Stale approval unexpectedly ${JSON.stringify(stale)}`);
  }

  const noOutcome = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff: "diff",
    evidenceSummary: "summary",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A25",
    authorRoleId: "A15",
    decision: "APPROVE",
    decisionReason: null,
    policyVersion: "policy-release-v1",
    releaseReceiptId: null,
    blockedExceptionCode: null,
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
  });
  if (!noOutcome.allowed && noOutcome.code === "RELEASE_OUTCOME_REQUIRED") {
    details.push(
      "approve without receipt/exception → RELEASE_OUTCOME_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`No outcome unexpectedly ${JSON.stringify(noOutcome)}`);
  }

  const liveClaim = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff: "diff",
    evidenceSummary: "summary",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A25",
    authorRoleId: "A15",
    decision: "APPROVE",
    decisionReason: null,
    policyVersion: "policy-release-v1",
    releaseReceiptId: "receipt-hours-release-1",
    blockedExceptionCode: null,
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: true,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
  });
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_RELEASE_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedRelease → FALSE_LIVE_VERIFIED_RELEASE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff: "diff",
    evidenceSummary: "summary",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A25",
    authorRoleId: "A15",
    decision: "APPROVE",
    decisionReason: null,
    policyVersion: "policy-release-v1",
    releaseReceiptId: "receipt-hours-release-1",
    blockedExceptionCode: null,
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: true,
    attemptProductionWrite: false,
  });
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  const prodWrite = evaluateReviewReviseRelease({
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff: "diff",
    evidenceSummary: "summary",
    qaBundleId: "qa-bundle-hours-1",
    qaGates,
    reviewerRoleId: "A25",
    authorRoleId: "A15",
    decision: "APPROVE",
    decisionReason: null,
    policyVersion: "policy-release-v1",
    releaseReceiptId: "receipt-hours-release-1",
    blockedExceptionCode: null,
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: true,
  });
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-027 (demand page release), T-US-036/T-X019 (stale approval), T-US-054/T-X018 (self-approval alone)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-review-revise-release-${randomUUID()}`,
    kind: SoakProofKind.REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-review-revise-release-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
