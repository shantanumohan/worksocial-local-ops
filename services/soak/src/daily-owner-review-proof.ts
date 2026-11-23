/**
 * Fixture proof for T-US-049 — Daily owner review (F25/SC-01).
 * Evidence-backed brief, completed-work ledger, decision records,
 * outcome/cost view (synthetic excluded), bounded mission, versioned
 * operating knowledge without silent authority expansion; live NOT_WIRED.
 * Distinct from T-US-050 (root-cause brief), T-US-025 (launch), T-US-035
 * (review/revise/release). External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateDailyOwnerReview,
  type DailyOwnerReviewInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
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

/**
 * Complete expected proof set for T-US-049 fixture ACCEPTED.
 */
export function proofDailyOwnerReview(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateDailyOwnerReview(baseInput());
  if (
    happy.allowed &&
    happy.code === "DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED" &&
    happy.evidence.knowledgeVersionId === "ops-knowledge-v12" &&
    happy.evidence.authorityExpanded === false &&
    happy.evidence.reviewVerifiedLive === false &&
    happy.evidence.syntheticExcluded === true &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete brief+ledger+decisions+cost+mission+knowledge → DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED; reviewVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const calmEmpty = evaluateDailyOwnerReview(
    baseInput({
      completedWorkLedger: [],
      decisionRecords: [],
      manufactureUrgencyWithNoFindings: false,
    }),
  );
  if (
    calmEmpty.allowed &&
    calmEmpty.code === "DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED" &&
    calmEmpty.evidence.completedWorkCount === 0
  ) {
    details.push(
      "no material findings without manufactured urgency → calm empty OK",
    );
  } else {
    passed = false;
    details.push(`Calm empty unexpectedly ${JSON.stringify(calmEmpty)}`);
  }

  const urgency = evaluateDailyOwnerReview(
    baseInput({
      completedWorkLedger: [],
      decisionRecords: [],
      manufactureUrgencyWithNoFindings: true,
    }),
  );
  if (!urgency.allowed && urgency.code === "MANUFACTURED_URGENCY_REFUSED") {
    details.push(
      "manufactureUrgencyWithNoFindings → MANUFACTURED_URGENCY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Manufactured urgency unexpectedly ${JSON.stringify(urgency)}`);
  }

  const pendingLift = evaluateDailyOwnerReview(
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

  const authority = evaluateDailyOwnerReview(
    baseInput({
      reviewedOperatingKnowledge: {
        playbookUpdateId: "playbook-upd-99",
        knowledgeVersionId: "ops-knowledge-v13",
        learningSummary: "Auto-raise ad spend autonomy",
        expandsAuthoritySilently: true,
      },
    }),
  );
  if (
    !authority.allowed &&
    authority.code === "SILENT_AUTHORITY_EXPANSION_REFUSED"
  ) {
    details.push(
      "expandsAuthoritySilently → SILENT_AUTHORITY_EXPANSION_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Authority expand unexpectedly ${JSON.stringify(authority)}`);
  }

  const outOfScope = evaluateDailyOwnerReview(
    baseInput({
      newBoundedMission: {
        missionId: "mission-new-market",
        objective: "Enter unapproved market",
        approvedScopeId: "scope-pilot-site-a",
        withinApprovedScope: false,
      },
    }),
  );
  if (
    !outOfScope.allowed &&
    outOfScope.code === "MISSION_OUTSIDE_APPROVED_SCOPE"
  ) {
    details.push(
      "withinApprovedScope=false → MISSION_OUTSIDE_APPROVED_SCOPE",
    );
  } else {
    passed = false;
    details.push(`Out of scope unexpectedly ${JSON.stringify(outOfScope)}`);
  }

  const liveClaim = evaluateDailyOwnerReview(
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

  const liveWire = evaluateDailyOwnerReview(
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

  const prodWrite = evaluateDailyOwnerReview(
    baseInput({ attemptProductionWrite: true }),
  );
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
    "Distinct from T-US-050 (root-cause brief), T-US-025 (launch), T-US-035 (review/revise/release)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-daily-owner-review-${randomUUID()}`,
    kind: SoakProofKind.DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-daily-owner-review-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
