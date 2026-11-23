/**
 * Fixture proof for T-F14 — Turn demand into a page improvement.
 * Complete F14 evidence package: observations, intent-to-page, mission/brief,
 * proposed answer/metadata/links review, exact revision diff, independent QA,
 * policy release receipt + experiment window, measurable change observation;
 * unsafe claims refused; live providers NOT_WIRED. Distinct from T-US-027
 * release-receipt summary, T-US-028 keyword proliferation, and T-US-035
 * review/revise/release. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateTurnDemandIntoPageImprovement,
  type SoakProofRecord,
  type TurnDemandIntoPageImprovementInput,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<TurnDemandIntoPageImprovementInput> = {},
): TurnDemandIntoPageImprovementInput {
  return {
    packageId: "pkg-f14-soak",
    observations: [
      {
        observationId: "obs-trend-soak",
        demandLabel: "coworking near Midtown with day pass",
        sourceKind: "TREND",
      },
      {
        observationId: "obs-q-soak",
        demandLabel: "Do you offer a day pass?",
        sourceKind: "RECURRING_QUESTION",
      },
    ],
    intentMatch: {
      intentId: "intent-day-pass-soak",
      pageId: "page-pricing-soak",
      pagePath: "/pricing",
      editableVerified: true,
      matchConfidence: "HIGH",
    },
    mission: {
      missionId: "mission-f14-soak",
      taskPlanId: "plan-f14-soak",
      contentBriefId: "brief-f14-soak",
      briefSummary: "Clarify day-pass availability on pricing page",
    },
    proposedAnswer: {
      proposedAnswerId: "answer-f14-soak",
      answerSummary: "Yes — day passes are available weekdays; book online.",
      metadataReviewed: true,
      internalLinksReviewed: true,
      linkTargetCount: 2,
    },
    revision: {
      revisionId: "rev-f14-soak",
      exactDiff: "--- a/pricing.md\n+++ b/pricing.md\n+Day passes available\n",
      changedPathCount: 1,
    },
    qa: {
      qaBundleId: "qa-f14-soak",
      qualityPassed: true,
      customerJourneyPassed: true,
    },
    policyReviewed: true,
    releaseReceiptId: "release-f14-soak",
    experimentWindow: {
      experimentId: "exp-f14-soak",
      startsAtIso: "2026-11-23T00:00:00.000Z",
      endsAtIso: "2026-12-07T00:00:00.000Z",
    },
    measurableChange: {
      observationId: "meas-f14-soak",
      measurable: true,
      measurementNote:
        "Fixture impression + CTR delta recorded for experiment window",
    },
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    requestKeywordProliferation: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F14 fixture ACCEPTED.
 */
export function proofTurnDemandIntoPageImprovement(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateTurnDemandIntoPageImprovement(baseInput());
  if (
    happy.allowed &&
    happy.code === "TURN_DEMAND_INTO_PAGE_IMPROVEMENT_EVIDENCE_RECORDED" &&
    happy.evidence.releaseVerifiedLive === false &&
    happy.sourceBackedChangeRecorded === true &&
    happy.measurableOrBlockedClear === true &&
    happy.evidence.changeMeasurable === true &&
    happy.evidence.metadataReviewed === true &&
    happy.evidence.internalLinksReviewed === true &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F14 evidence package → TURN_DEMAND_INTO_PAGE_IMPROVEMENT_EVIDENCE_RECORDED; observations; intent-to-page; mission/brief; proposed answer/metadata/links review; exact revision diff; independent QA; policy release receipt + experiment window; measurable change; releaseVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noObs = evaluateTurnDemandIntoPageImprovement(
    baseInput({ observations: null }),
  );
  if (!noObs.allowed && noObs.code === "OBSERVATIONS_REQUIRED") {
    details.push("observations=null → OBSERVATIONS_REQUIRED");
  } else {
    passed = false;
    details.push(`Observations unexpectedly ${JSON.stringify(noObs)}`);
  }

  const noMatch = evaluateTurnDemandIntoPageImprovement(
    baseInput({ intentMatch: null }),
  );
  if (!noMatch.allowed && noMatch.code === "INTENT_PAGE_MATCH_REQUIRED") {
    details.push("intentMatch=null → INTENT_PAGE_MATCH_REQUIRED");
  } else {
    passed = false;
    details.push(`Intent match unexpectedly ${JSON.stringify(noMatch)}`);
  }

  const noMission = evaluateTurnDemandIntoPageImprovement(
    baseInput({ mission: null }),
  );
  if (!noMission.allowed && noMission.code === "MISSION_PLAN_REQUIRED") {
    details.push("mission=null → MISSION_PLAN_REQUIRED");
  } else {
    passed = false;
    details.push(`Mission unexpectedly ${JSON.stringify(noMission)}`);
  }

  const noAnswer = evaluateTurnDemandIntoPageImprovement(
    baseInput({ proposedAnswer: null }),
  );
  if (
    !noAnswer.allowed &&
    noAnswer.code === "PROPOSED_ANSWER_REVIEW_REQUIRED"
  ) {
    details.push("proposedAnswer=null → PROPOSED_ANSWER_REVIEW_REQUIRED");
  } else {
    passed = false;
    details.push(`Proposed answer unexpectedly ${JSON.stringify(noAnswer)}`);
  }

  const noRev = evaluateTurnDemandIntoPageImprovement(
    baseInput({ revision: null }),
  );
  if (!noRev.allowed && noRev.code === "REVISION_DIFF_REQUIRED") {
    details.push("revision=null → REVISION_DIFF_REQUIRED");
  } else {
    passed = false;
    details.push(`Revision unexpectedly ${JSON.stringify(noRev)}`);
  }

  const noQa = evaluateTurnDemandIntoPageImprovement(baseInput({ qa: null }));
  if (!noQa.allowed && noQa.code === "QA_BUNDLE_REQUIRED") {
    details.push("qa=null → QA_BUNDLE_REQUIRED");
  } else {
    passed = false;
    details.push(`QA unexpectedly ${JSON.stringify(noQa)}`);
  }

  const unreviewed = evaluateTurnDemandIntoPageImprovement(
    baseInput({ policyReviewed: false, releaseReceiptId: null }),
  );
  if (!unreviewed.allowed && unreviewed.code === "POLICY_RELEASE_REQUIRED") {
    details.push("unreviewed → POLICY_RELEASE_REQUIRED");
  } else {
    passed = false;
    details.push(`Policy release unexpectedly ${JSON.stringify(unreviewed)}`);
  }

  const noWindow = evaluateTurnDemandIntoPageImprovement(
    baseInput({ experimentWindow: null }),
  );
  if (!noWindow.allowed && noWindow.code === "EXPERIMENT_WINDOW_REQUIRED") {
    details.push("experimentWindow=null → EXPERIMENT_WINDOW_REQUIRED");
  } else {
    passed = false;
    details.push(`Experiment window unexpectedly ${JSON.stringify(noWindow)}`);
  }

  const noMeas = evaluateTurnDemandIntoPageImprovement(
    baseInput({ measurableChange: null }),
  );
  if (!noMeas.allowed && noMeas.code === "MEASURABLE_CHANGE_REQUIRED") {
    details.push("measurableChange=null → MEASURABLE_CHANGE_REQUIRED");
  } else {
    passed = false;
    details.push(`Measurable change unexpectedly ${JSON.stringify(noMeas)}`);
  }

  const prolif = evaluateTurnDemandIntoPageImprovement(
    baseInput({ requestKeywordProliferation: true }),
  );
  if (!prolif.allowed && prolif.code === "KEYWORD_PROLIFERATION_REFUSED") {
    details.push("requestKeywordProliferation → KEYWORD_PROLIFERATION_REFUSED");
  } else {
    passed = false;
    details.push(`Proliferation unexpectedly ${JSON.stringify(prolif)}`);
  }

  const liveClaim = evaluateTurnDemandIntoPageImprovement(
    baseInput({ claimLiveVerifiedRelease: true }),
  );
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

  const liveWire = evaluateTurnDemandIntoPageImprovement(
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
    "Distinct from T-US-027 (release receipt / experiment window summary), T-US-028 (keyword proliferation / one useful update), and T-US-035 (review/revise/release) — complete F14 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.TURN_DEMAND_INTO_PAGE_IMPROVEMENT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-turn-demand-into-page-improvement-f14",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
