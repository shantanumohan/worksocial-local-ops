/**
 * Fixture proof for T-F25 — Operate the daily owner review.
 * Complete F25 evidence package: morning brief, overnight inspection,
 * completed-work ledger, exception decisions, qualified demand,
 * outcome/cost (synthetic excluded), bounded mission, reviewed operating
 * knowledge; unsafe claims refused; live providers NOT_WIRED. Distinct from
 * T-US-049 operating-knowledge summary, T-US-050 root-cause brief,
 * T-US-025 launch workstream, and T-US-035 review/revise/release.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateOperateDailyOwnerReview,
  type OperateDailyOwnerReviewInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<OperateDailyOwnerReviewInput> = {},
): OperateDailyOwnerReviewInput {
  return {
    packageId: "pkg-f25-soak",
    morningBrief: {
      briefId: "brief-f25-soak",
      evidenceBackedSummary:
        "1 lost-lead incident; 2 unanswered inbox threads; hours page released overnight.",
      opened: true,
    },
    overnightInspection: {
      inspectionId: "inspect-f25-soak",
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
      demandViewId: "demand-f25-soak",
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

/**
 * Complete expected proof set for T-F25 fixture ACCEPTED.
 */
export function proofOperateDailyOwnerReview(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateOperateDailyOwnerReview(baseInput());
  if (
    happy.allowed &&
    happy.code === "OPERATE_DAILY_OWNER_REVIEW_EVIDENCE_RECORDED" &&
    happy.evidence.reviewVerifiedLive === false &&
    happy.dailyOwnerReviewRecorded === true &&
    happy.evidence.briefOpened === true &&
    happy.evidence.overnightInspected === true &&
    happy.evidence.syntheticExcluded === true &&
    happy.evidence.authorityExpanded === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F25 evidence package → OPERATE_DAILY_OWNER_REVIEW_EVIDENCE_RECORDED; morning brief; overnight inspection; completed-work ledger; exception decisions; qualified demand; outcome/cost synthetic excluded; bounded mission; reviewed operating knowledge; reviewVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noBrief = evaluateOperateDailyOwnerReview(
    baseInput({ morningBrief: null }),
  );
  if (!noBrief.allowed && noBrief.code === "MORNING_BRIEF_REQUIRED") {
    details.push("morningBrief=null → MORNING_BRIEF_REQUIRED");
  } else {
    passed = false;
    details.push(`Morning brief unexpectedly ${JSON.stringify(noBrief)}`);
  }

  const noInspect = evaluateOperateDailyOwnerReview(
    baseInput({ overnightInspection: null }),
  );
  if (
    !noInspect.allowed &&
    noInspect.code === "OVERNIGHT_INSPECTION_REQUIRED"
  ) {
    details.push("overnightInspection=null → OVERNIGHT_INSPECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Inspection unexpectedly ${JSON.stringify(noInspect)}`);
  }

  const noLedger = evaluateOperateDailyOwnerReview(
    baseInput({ completedWorkLedger: null }),
  );
  if (
    !noLedger.allowed &&
    noLedger.code === "COMPLETED_WORK_LEDGER_REQUIRED"
  ) {
    details.push("completedWorkLedger=null → COMPLETED_WORK_LEDGER_REQUIRED");
  } else {
    passed = false;
    details.push(`Ledger unexpectedly ${JSON.stringify(noLedger)}`);
  }

  const noDecisions = evaluateOperateDailyOwnerReview(
    baseInput({ decisionRecords: null }),
  );
  if (
    !noDecisions.allowed &&
    noDecisions.code === "DECISION_RECORDS_REQUIRED"
  ) {
    details.push("decisionRecords=null → DECISION_RECORDS_REQUIRED");
  } else {
    passed = false;
    details.push(`Decisions unexpectedly ${JSON.stringify(noDecisions)}`);
  }

  const urgency = evaluateOperateDailyOwnerReview(
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
  if (
    !urgency.allowed &&
    urgency.code === "MANUFACTURED_URGENCY_REFUSED"
  ) {
    details.push(
      "manufactureUrgencyWithNoFindings → MANUFACTURED_URGENCY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Urgency unexpectedly ${JSON.stringify(urgency)}`);
  }

  const noDemand = evaluateOperateDailyOwnerReview(
    baseInput({ qualifiedDemand: null }),
  );
  if (!noDemand.allowed && noDemand.code === "QUALIFIED_DEMAND_REQUIRED") {
    details.push("qualifiedDemand=null → QUALIFIED_DEMAND_REQUIRED");
  } else {
    passed = false;
    details.push(`Demand unexpectedly ${JSON.stringify(noDemand)}`);
  }

  const noCost = evaluateOperateDailyOwnerReview(
    baseInput({ outcomeCostView: null }),
  );
  if (!noCost.allowed && noCost.code === "OUTCOME_COST_VIEW_REQUIRED") {
    details.push("outcomeCostView=null → OUTCOME_COST_VIEW_REQUIRED");
  } else {
    passed = false;
    details.push(`Cost unexpectedly ${JSON.stringify(noCost)}`);
  }

  const pendingLift = evaluateOperateDailyOwnerReview(
    baseInput({ celebrateLiftOnPendingData: true }),
  );
  if (
    !pendingLift.allowed &&
    pendingLift.code === "PENDING_DATA_LIFT_CELEBRATION_REFUSED"
  ) {
    details.push(
      "celebrateLiftOnPendingData → PENDING_DATA_LIFT_CELEBRATION_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Pending lift unexpectedly ${JSON.stringify(pendingLift)}`);
  }

  const noMission = evaluateOperateDailyOwnerReview(
    baseInput({ newBoundedMission: null }),
  );
  if (!noMission.allowed && noMission.code === "BOUNDED_MISSION_REQUIRED") {
    details.push("newBoundedMission=null → BOUNDED_MISSION_REQUIRED");
  } else {
    passed = false;
    details.push(`Mission unexpectedly ${JSON.stringify(noMission)}`);
  }

  const outside = evaluateOperateDailyOwnerReview(
    baseInput({
      newBoundedMission: {
        missionId: "mission-widen",
        objective: "Expand into unapproved markets",
        approvedScopeId: "scope-pilot-site-a",
        withinApprovedScope: false,
      },
    }),
  );
  if (
    !outside.allowed &&
    outside.code === "MISSION_OUTSIDE_APPROVED_SCOPE"
  ) {
    details.push(
      "withinApprovedScope=false → MISSION_OUTSIDE_APPROVED_SCOPE",
    );
  } else {
    passed = false;
    details.push(`Outside scope unexpectedly ${JSON.stringify(outside)}`);
  }

  const noKnowledge = evaluateOperateDailyOwnerReview(
    baseInput({ reviewedOperatingKnowledge: null }),
  );
  if (
    !noKnowledge.allowed &&
    noKnowledge.code === "OPERATING_KNOWLEDGE_REQUIRED"
  ) {
    details.push(
      "reviewedOperatingKnowledge=null → OPERATING_KNOWLEDGE_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Knowledge unexpectedly ${JSON.stringify(noKnowledge)}`);
  }

  const expand = evaluateOperateDailyOwnerReview(
    baseInput({
      reviewedOperatingKnowledge: {
        playbookUpdateId: "playbook-bad",
        knowledgeVersionId: "ops-v-bad",
        learningSummary: "Silently grant ad spend",
        expandsAuthoritySilently: true,
      },
    }),
  );
  if (
    !expand.allowed &&
    expand.code === "SILENT_AUTHORITY_EXPANSION_REFUSED"
  ) {
    details.push(
      "expandsAuthoritySilently → SILENT_AUTHORITY_EXPANSION_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Authority expand unexpectedly ${JSON.stringify(expand)}`);
  }

  const prodWrite = evaluateOperateDailyOwnerReview(
    baseInput({ attemptProductionWrite: true }),
  );
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  const liveClaim = evaluateOperateDailyOwnerReview(
    baseInput({ claimLiveVerifiedReview: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_REVIEW_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedReview → FALSE_LIVE_VERIFIED_REVIEW_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateOperateDailyOwnerReview(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-049 (operating-knowledge happy-path summary), T-US-050 (root-cause brief), T-US-025 (launch workstream), and T-US-035 (review/revise/release) — complete F25 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.OPERATE_DAILY_OWNER_REVIEW,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-operate-daily-owner-review-f25",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}