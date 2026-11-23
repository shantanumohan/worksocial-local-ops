import { describe, expect, it } from "vitest";
import {
  OPERATE_DAILY_OWNER_REVIEW_RELATED_CASE_IDS,
  evaluateOperateDailyOwnerReview,
  type OperateDailyOwnerReviewInput,
} from "./operate-daily-owner-review.js";

function baseInput(
  overrides: Partial<OperateDailyOwnerReviewInput> = {},
): OperateDailyOwnerReviewInput {
  return {
    packageId: "pkg-f25-1",
    morningBrief: {
      briefId: "brief-f25-1",
      evidenceBackedSummary:
        "1 lost-lead incident; 2 unanswered inbox threads; hours page released overnight.",
      opened: true,
    },
    overnightInspection: {
      inspectionId: "inspect-f25-1",
      changedItemIds: ["work-hours-page", "exc-unanswered-thread-12"],
      inspected: true,
    },
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
    qualifiedDemand: {
      demandViewId: "demand-f25-1",
      qualifiedDemandCount: 3,
      periodLabel: "overnight",
    },
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

describe("evaluateOperateDailyOwnerReview (T-F25)", () => {
  it("maps related case ids to T-F25 only", () => {
    expect([...OPERATE_DAILY_OWNER_REVIEW_RELATED_CASE_IDS]).toEqual([
      "T-F25",
    ]);
  });

  it("records complete F25 evidence package offline", () => {
    const result = evaluateOperateDailyOwnerReview(baseInput());
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.code).toBe("OPERATE_DAILY_OWNER_REVIEW_EVIDENCE_RECORDED");
    expect(result.dailyOwnerReviewRecorded).toBe(true);
    expect(result.liveProviderWiring).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
    expect(result.evidence.briefOpened).toBe(true);
    expect(result.evidence.overnightInspected).toBe(true);
    expect(result.evidence.completedWorkCount).toBe(1);
    expect(result.evidence.decisionRecordCount).toBe(1);
    expect(result.evidence.qualifiedDemandCount).toBe(3);
    expect(result.evidence.syntheticExcluded).toBe(true);
    expect(result.evidence.authorityExpanded).toBe(false);
    expect(result.evidence.reviewVerifiedLive).toBe(false);
    expect(result.evidence.blockingDecision).toBe(
      "F25_EVIDENCE_PACKAGE_COMPLETE",
    );
  });

  it("allows calm empty overnight with no manufactured urgency", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({
        overnightInspection: {
          inspectionId: "inspect-calm",
          changedItemIds: [],
          inspected: true,
        },
        completedWorkLedger: [],
        decisionRecords: [],
        manufactureUrgencyWithNoFindings: false,
      }),
    );
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.evidence.completedWorkCount).toBe(0);
    expect(result.evidence.decisionRecordCount).toBe(0);
  });

  it("refuses missing morning brief", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ morningBrief: null }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("MORNING_BRIEF_REQUIRED");
  });

  it("refuses missing overnight inspection", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ overnightInspection: null }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("OVERNIGHT_INSPECTION_REQUIRED");
  });

  it("refuses missing completed-work ledger", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ completedWorkLedger: null }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("COMPLETED_WORK_LEDGER_REQUIRED");
  });

  it("refuses missing decision records", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ decisionRecords: null }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("DECISION_RECORDS_REQUIRED");
  });

  it("refuses manufactured urgency with no findings", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({
        overnightInspection: {
          inspectionId: "inspect-empty",
          changedItemIds: [],
          inspected: true,
        },
        completedWorkLedger: [],
        decisionRecords: [],
        manufactureUrgencyWithNoFindings: true,
      }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("MANUFACTURED_URGENCY_REFUSED");
  });

  it("refuses missing qualified demand", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ qualifiedDemand: null }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("QUALIFIED_DEMAND_REQUIRED");
  });

  it("refuses missing outcome/cost view", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ outcomeCostView: null }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("OUTCOME_COST_VIEW_REQUIRED");
  });

  it("refuses celebrating lift on pending data", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ celebrateLiftOnPendingData: true }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("PENDING_DATA_LIFT_CELEBRATION_REFUSED");
  });

  it("refuses mission outside approved scope", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({
        newBoundedMission: {
          missionId: "mission-widen",
          objective: "Expand into unapproved markets",
          approvedScopeId: "scope-pilot-site-a",
          withinApprovedScope: false,
        },
      }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("MISSION_OUTSIDE_APPROVED_SCOPE");
  });

  it("refuses silent authority expansion", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({
        reviewedOperatingKnowledge: {
          playbookUpdateId: "playbook-bad",
          knowledgeVersionId: "ops-v-bad",
          learningSummary: "Silently grant ad spend",
          expandsAuthoritySilently: true,
        },
      }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("SILENT_AUTHORITY_EXPANSION_REFUSED");
  });

  it("refuses missing operating knowledge", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ reviewedOperatingKnowledge: null }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("OPERATING_KNOWLEDGE_REQUIRED");
  });

  it("refuses production write", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ attemptProductionWrite: true }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ claimLiveVerifiedReview: true }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("FALSE_LIVE_VERIFIED_REVIEW_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const result = evaluateOperateDailyOwnerReview(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});