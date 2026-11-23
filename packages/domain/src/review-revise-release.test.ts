import { describe, expect, it } from "vitest";
import {
  evaluateReviewReviseRelease,
  type ReviewQaGate,
  type ReviewReviseReleaseInput,
} from "./review-revise-release.js";

const gates: ReviewQaGate[] = [
  { gateId: "tech-links", kind: "technical", status: "pass" },
  { gateId: "fact-hours", kind: "factual", status: "pass" },
  { gateId: "policy-claims", kind: "policy", status: "not_applicable" },
];

function validInput(
  overrides: Partial<ReviewReviseReleaseInput> = {},
): ReviewReviseReleaseInput {
  return {
    reviewItemId: "review-item-hours-page",
    revisionId: "rev-hours-v3",
    humanReadableDiff:
      "--- a/hours.md\n+++ b/hours.md\n-Mon–Fri 9–5\n+Mon–Fri 8–6",
    evidenceSummary: "Observed recurring hours question; update published hours.",
    qaBundleId: "qa-bundle-hours-1",
    qaGates: gates,
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
    ...overrides,
  };
}

describe("evaluateReviewReviseRelease (T-US-035)", () => {
  it("records release receipt on independent approve", () => {
    const decision = evaluateReviewReviseRelease(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("REVIEW_RELEASE_RECEIPT_RECORDED");
    expect(decision.evidence.releaseReceiptId).toBe("receipt-hours-release-1");
    expect(decision.evidence.blockedExceptionCode).toBeNull();
    expect(decision.evidence.releaseVerifiedLive).toBe(false);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("records blocked exception on reject with reason", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({
        decision: "REJECT",
        decisionReason: "Factual claim unsupported by sources",
        releaseReceiptId: null,
        blockedExceptionCode: "POLICY_FACT_UNSUPPORTED",
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("REVIEW_BLOCKED_EXCEPTION_RECORDED");
    expect(decision.evidence.blockedExceptionCode).toBe(
      "POLICY_FACT_UNSUPPORTED",
    );
    expect(decision.evidence.releaseReceiptId).toBeNull();
  });

  it("refuses self-approval", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({ reviewerRoleId: "A15", authorRoleId: "A15" }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("refuses stale approval after revision change", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({ revisionChangedAfterDecision: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("STALE_APPROVAL_INVALIDATED");
  });

  it("requires reason for negative decisions", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({
        decision: "REQUEST_REVISION",
        decisionReason: null,
        releaseReceiptId: null,
        blockedExceptionCode: "NEEDS_SOURCE",
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("NEGATIVE_DECISION_REASON_REQUIRED");
  });

  it("requires release receipt or blocked exception on approve", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({
        releaseReceiptId: null,
        blockedExceptionCode: null,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("RELEASE_OUTCOME_REQUIRED");
  });

  it("refuses production writes", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified release claim", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({ claimLiveVerifiedRelease: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_RELEASE_REFUSED");
  });

  it("refuses live provider wiring request", () => {
    const decision = evaluateReviewReviseRelease(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
