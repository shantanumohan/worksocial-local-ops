import { describe, expect, it } from "vitest";
import {
  evaluateDailyOwnerReview,
  type DailyOwnerReviewInput,
} from "./daily-owner-review.js";

function validInput(
  overrides: Partial<DailyOwnerReviewInput> = {},
): DailyOwnerReviewInput {
  return {
    briefId: "brief-2026-11-21",
    evidenceBackedSummary:
      "1 lost-lead incident; 2 unanswered inbox threads; hours page released overnight.",
    completedWorkLedger: [
      {
        workItemId: "work-hours-page",
        revisionId: "rev-hours-v3",
        receiptOrObservationId: "receipt-hours-release-1",
        summary: "Published hours update with release receipt",
      },
    ],
    decisionRecords: [
      {
        exceptionId: "exc-unanswered-thread-12",
        decision: "ASSIGN",
        reason: "Needs human takeover after after-hours window",
        decidedByRoleId: "A29",
      },
    ],
    outcomeCostView: {
      actualSpendMinor: 12_500,
      estimateSpendMinor: 15_000,
      pendingAttributionMinor: 2_000,
      syntheticExcludedMinor: 500,
      syntheticExcluded: true,
    },
    newBoundedMission: {
      missionId: "mission-local-seo-q4",
      objective: "Improve local landing clarity for coworking tours",
      approvedScopeId: "scope-pilot-site-a",
      withinApprovedScope: true,
    },
    reviewedOperatingKnowledge: {
      playbookUpdateId: "playbook-upd-42",
      knowledgeVersionId: "ops-knowledge-v12",
      learningSummary:
        "Prioritize unanswered conversations ahead of activity counts in morning brief.",
      expandsAuthoritySilently: false,
    },
    manufactureUrgencyWithNoFindings: false,
    celebrateLiftOnPendingData: false,
    claimLiveVerifiedReview: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

describe("evaluateDailyOwnerReview (T-US-049)", () => {
  it("records reviewed operating knowledge on complete happy path", () => {
    const decision = evaluateDailyOwnerReview(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED");
    expect(decision.evidence.knowledgeVersionId).toBe("ops-knowledge-v12");
    expect(decision.evidence.authorityExpanded).toBe(false);
    expect(decision.evidence.reviewVerifiedLive).toBe(false);
    expect(decision.evidence.syntheticExcluded).toBe(true);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("allows calm empty findings when no urgency is manufactured", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({
        completedWorkLedger: [],
        decisionRecords: [],
        manufactureUrgencyWithNoFindings: false,
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED");
    expect(decision.evidence.completedWorkCount).toBe(0);
  });

  it("refuses manufactured urgency with no findings", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({
        completedWorkLedger: [],
        decisionRecords: [],
        manufactureUrgencyWithNoFindings: true,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("MANUFACTURED_URGENCY_REFUSED");
  });

  it("refuses celebrating lift on pending attribution", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({ celebrateLiftOnPendingData: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PENDING_DATA_LIFT_CELEBRATION_REFUSED");
  });

  it("refuses silent authority expansion via playbook", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({
        reviewedOperatingKnowledge: {
          playbookUpdateId: "playbook-upd-99",
          knowledgeVersionId: "ops-knowledge-v13",
          learningSummary: "Auto-raise ad spend autonomy",
          expandsAuthoritySilently: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("SILENT_AUTHORITY_EXPANSION_REFUSED");
  });

  it("refuses mission outside approved scope", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({
        newBoundedMission: {
          missionId: "mission-new-market",
          objective: "Enter unapproved market",
          approvedScopeId: "scope-pilot-site-a",
          withinApprovedScope: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("MISSION_OUTSIDE_APPROVED_SCOPE");
  });

  it("requires evidence-backed brief", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({ briefId: "", evidenceBackedSummary: "" }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("BRIEF_EVIDENCE_REQUIRED");
  });

  it("refuses production writes", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified review claim", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({ claimLiveVerifiedReview: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_REVIEW_REFUSED");
  });

  it("refuses live provider wiring request", () => {
    const decision = evaluateDailyOwnerReview(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
