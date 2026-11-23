import { describe, expect, it } from "vitest";
import {
  REVIEW_REVISE_AND_RELEASE_A_CHANGE_RELATED_CASE_IDS,
  evaluateReviewReviseAndReleaseAChange,
  type ReviewReviseAndReleaseAChangeInput,
} from "./review-revise-and-release-a-change.js";

function baseInput(
  overrides: Partial<ReviewReviseAndReleaseAChangeInput> = {},
): ReviewReviseAndReleaseAChangeInput {
  return {
    packageId: "pkg-f18-1",
    queueSelection: {
      queueId: "queue-f18-1",
      selectedItemId: "item-rev-f18-1",
      opened: true,
    },
    whyProposed: {
      evidenceSummaryId: "evsum-f18-1",
      whyProposed:
        "Update Midtown day-pass FAQ answer to match approved hours fact",
      supportingObservationIds: ["obs-faq-gap", "obs-hours-drift"],
    },
    beforeAfter: {
      compareId: "cmp-f18-1",
      beforeSummary: "FAQ cites weekday close 6pm",
      afterSummary: "FAQ cites weekday close 7pm per approved fact",
      humanReadableDiff:
        "- close at 6pm\n+ close at 7pm (fact-hours-approved)",
    },
    sourceDrawer: {
      drawerId: "drawer-f18-1",
      sourceIds: ["fact-hours-approved", "page-/faq/day-pass"],
      drawerOpened: true,
    },
    gateInspection: [
      {
        gateId: "gate-tech-1",
        kind: "technical",
        status: "pass",
        inspected: true,
      },
      {
        gateId: "gate-fact-1",
        kind: "factual",
        status: "pass",
        inspected: true,
      },
      {
        gateId: "gate-pol-1",
        kind: "policy",
        status: "pass",
        inspected: true,
      },
    ],
    qa: {
      qaBundleId: "qa-f18-1",
      revisionId: "rev-f18-aabb",
      technicalPassed: true,
      factualPassed: true,
      policyPassed: true,
    },
    decision: {
      decisionId: "dec-f18-1",
      decision: "APPROVE",
      reviewerRoleId: "role-owner-reviewer",
      authorRoleId: "role-editor-a13",
      revisionId: "rev-f18-aabb",
      policyVersion: "policy-release-v3",
      decisionReason: null,
    },
    releaseTrack: {
      trackId: "track-f18-1",
      revisionId: "rev-f18-aabb",
      releaseReceiptId: "rcpt-f18-1",
      blockedExceptionCode: null,
      tracked: true,
      verifiedInFixture: true,
    },
    revisionChangedAfterDecision: false,
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

describe("evaluateReviewReviseAndReleaseAChange (T-F18)", () => {
  it("records complete F18 evidence package on approve + receipt", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "REVIEW_REVISE_AND_RELEASE_A_CHANGE_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.changeReviewedAndReleasedRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f18-1");
    expect(decision.evidence.queueId).toBe("queue-f18-1");
    expect(decision.evidence.selectedItemId).toBe("item-rev-f18-1");
    expect(decision.evidence.drawerOpened).toBe(true);
    expect(decision.evidence.technicalGateInspected).toBe(true);
    expect(decision.evidence.factualGateInspected).toBe(true);
    expect(decision.evidence.policyGateInspected).toBe(true);
    expect(decision.evidence.decision).toBe("APPROVE");
    expect(decision.evidence.revisionId).toBe("rev-f18-aabb");
    expect(decision.evidence.policyVersion).toBe("policy-release-v3");
    expect(decision.evidence.releaseReceiptId).toBe("rcpt-f18-1");
    expect(decision.evidence.releaseVerifiedLive).toBe(false);
    expect(decision.evidence.currentState).toBe("RELEASED_FIXTURE_TRACKED");
    expect(decision.evidence.blockingDecision).toBe(
      "F18_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(REVIEW_REVISE_AND_RELEASE_A_CHANGE_RELATED_CASE_IDS).toEqual([
      "T-F18",
    ]);
  });

  it("records complete F18 package on reject + blocked exception", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        decision: {
          decisionId: "dec-f18-reject",
          decision: "REJECT",
          reviewerRoleId: "role-owner-reviewer",
          authorRoleId: "role-editor-a13",
          revisionId: "rev-f18-aabb",
          policyVersion: "policy-release-v3",
          decisionReason: "Factual gate conflict with approved hours",
        },
        releaseTrack: {
          trackId: "track-f18-blocked",
          revisionId: "rev-f18-aabb",
          releaseReceiptId: null,
          blockedExceptionCode: "FACTUAL_GATE_CONFLICT",
          tracked: true,
          verifiedInFixture: true,
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.evidence.currentState).toBe("BLOCKED_EXCEPTION_TRACKED");
    expect(decision.evidence.blockedExceptionCode).toBe(
      "FACTUAL_GATE_CONFLICT",
    );
    expect(decision.evidence.releaseReceiptId).toBeNull();
  });

  it("refuses missing review queue selection", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ queueSelection: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("REVIEW_QUEUE_SELECTION_REQUIRED");
    expect(decision.evidence?.currentState).toBe(
      "AWAITING_REVIEW_QUEUE_SELECTION",
    );
  });

  it("refuses missing why-proposed evidence", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ whyProposed: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WHY_PROPOSED_EVIDENCE_REQUIRED");
  });

  it("refuses missing before/after compare", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ beforeAfter: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BEFORE_AFTER_COMPARE_REQUIRED");
  });

  it("refuses missing source drawer", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ sourceDrawer: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SOURCE_DRAWER_REQUIRED");
  });

  it("refuses incomplete gate inspection", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        gateInspection: [
          {
            gateId: "gate-tech-1",
            kind: "technical",
            status: "pass",
            inspected: true,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("GATE_INSPECTION_REQUIRED");
  });

  it("refuses incomplete QA bundle", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ qa: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("QA_BUNDLE_REQUIRED");
  });

  it("refuses incomplete decision record", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ decision: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DECISION_RECORD_REQUIRED");
  });

  it("refuses self-approval", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        decision: {
          decisionId: "dec-self",
          decision: "APPROVE",
          reviewerRoleId: "role-editor-a13",
          authorRoleId: "role-editor-a13",
          revisionId: "rev-f18-aabb",
          policyVersion: "policy-release-v3",
          decisionReason: null,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SELF_APPROVAL_FORBIDDEN");
  });

  it("refuses stale approval after revision change", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ revisionChangedAfterDecision: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("STALE_APPROVAL_INVALIDATED");
  });

  it("refuses negative decision without reason", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        decision: {
          decisionId: "dec-neg",
          decision: "REQUEST_REVISION",
          reviewerRoleId: "role-owner-reviewer",
          authorRoleId: "role-editor-a13",
          revisionId: "rev-f18-aabb",
          policyVersion: "policy-release-v3",
          decisionReason: null,
        },
        releaseTrack: {
          trackId: "track-neg",
          revisionId: "rev-f18-aabb",
          releaseReceiptId: null,
          blockedExceptionCode: "NEEDS_REVISION",
          tracked: true,
          verifiedInFixture: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("NEGATIVE_DECISION_REASON_REQUIRED");
  });

  it("refuses missing release track", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ releaseTrack: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("RELEASE_TRACK_REQUIRED");
  });

  it("refuses approve without receipt", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        releaseTrack: {
          trackId: "track-no-rcpt",
          revisionId: "rev-f18-aabb",
          releaseReceiptId: null,
          blockedExceptionCode: null,
          tracked: true,
          verifiedInFixture: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("RELEASE_OUTCOME_REQUIRED");
  });

  it("refuses ambiguous receipt + blocked exception", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        releaseTrack: {
          trackId: "track-ambig",
          revisionId: "rev-f18-aabb",
          releaseReceiptId: "rcpt-1",
          blockedExceptionCode: "BLOCKED",
          tracked: true,
          verifiedInFixture: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("RELEASE_OUTCOME_AMBIGUOUS");
  });

  it("refuses production write", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified release claim", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ claimLiveVerifiedRelease: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_RELEASE_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("refuses revision binding mismatch across QA/decision/track", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        qa: {
          qaBundleId: "qa-f18-1",
          revisionId: "rev-other",
          technicalPassed: true,
          factualPassed: true,
          policyPassed: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("REVISION_BINDING_MISMATCH");
  });

  it("refuses approve when a gate failed", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        gateInspection: [
          {
            gateId: "gate-tech-1",
            kind: "technical",
            status: "fail",
            inspected: true,
          },
          {
            gateId: "gate-fact-1",
            kind: "factual",
            status: "pass",
            inspected: true,
          },
          {
            gateId: "gate-pol-1",
            kind: "policy",
            status: "pass",
            inspected: true,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("GATE_FAILURE_BLOCKS_APPROVE");
  });

  it("records reject with failed QA bundle present", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        qa: {
          qaBundleId: "qa-f18-fail",
          revisionId: "rev-f18-aabb",
          technicalPassed: false,
          factualPassed: true,
          policyPassed: true,
        },
        decision: {
          decisionId: "dec-f18-reject-qa",
          decision: "REJECT",
          reviewerRoleId: "role-owner-reviewer",
          authorRoleId: "role-editor-a13",
          revisionId: "rev-f18-aabb",
          policyVersion: "policy-release-v3",
          decisionReason: "Technical QA failed",
        },
        releaseTrack: {
          trackId: "track-f18-qa-fail",
          revisionId: "rev-f18-aabb",
          releaseReceiptId: null,
          blockedExceptionCode: "TECHNICAL_QA_FAILED",
          tracked: true,
          verifiedInFixture: true,
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.evidence.technicalPassed).toBe(false);
    expect(decision.evidence.blockedExceptionCode).toBe("TECHNICAL_QA_FAILED");
  });

  it("normalizes whitespace-only unused blocked exception to null", () => {
    const decision = evaluateReviewReviseAndReleaseAChange(
      baseInput({
        releaseTrack: {
          trackId: "track-f18-ws",
          revisionId: "rev-f18-aabb",
          releaseReceiptId: "rcpt-f18-1",
          blockedExceptionCode: " ",
          tracked: true,
          verifiedInFixture: true,
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.evidence.releaseReceiptId).toBe("rcpt-f18-1");
    expect(decision.evidence.blockedExceptionCode).toBeNull();
  });

});
