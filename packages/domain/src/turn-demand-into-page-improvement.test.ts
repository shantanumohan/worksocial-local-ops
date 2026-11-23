import { describe, expect, it } from "vitest";
import {
  TURN_DEMAND_INTO_PAGE_IMPROVEMENT_RELATED_CASE_IDS,
  evaluateTurnDemandIntoPageImprovement,
  type TurnDemandIntoPageImprovementInput,
} from "./turn-demand-into-page-improvement.js";

function baseInput(
  overrides: Partial<TurnDemandIntoPageImprovementInput> = {},
): TurnDemandIntoPageImprovementInput {
  return {
    packageId: "pkg-f14-1",
    observations: [
      {
        observationId: "obs-trend-1",
        demandLabel: "coworking near Midtown with day pass",
        sourceKind: "TREND",
      },
      {
        observationId: "obs-q-1",
        demandLabel: "Do you offer a day pass?",
        sourceKind: "RECURRING_QUESTION",
      },
    ],
    intentMatch: {
      intentId: "intent-day-pass",
      pageId: "page-pricing",
      pagePath: "/pricing",
      editableVerified: true,
      matchConfidence: "HIGH",
    },
    mission: {
      missionId: "mission-f14-1",
      taskPlanId: "plan-f14-1",
      contentBriefId: "brief-f14-1",
      briefSummary: "Clarify day-pass availability on pricing page",
    },
    proposedAnswer: {
      proposedAnswerId: "answer-f14-1",
      answerSummary: "Yes — day passes are available weekdays; book online.",
      metadataReviewed: true,
      internalLinksReviewed: true,
      linkTargetCount: 2,
    },
    revision: {
      revisionId: "rev-f14-1",
      exactDiff: "--- a/pricing.md\n+++ b/pricing.md\n+Day passes available\n",
      changedPathCount: 1,
    },
    qa: {
      qaBundleId: "qa-f14-1",
      qualityPassed: true,
      customerJourneyPassed: true,
    },
    policyReviewed: true,
    releaseReceiptId: "release-f14-1",
    experimentWindow: {
      experimentId: "exp-f14-1",
      startsAtIso: "2026-11-23T00:00:00.000Z",
      endsAtIso: "2026-12-07T00:00:00.000Z",
    },
    measurableChange: {
      observationId: "meas-f14-1",
      measurable: true,
      measurementNote: "Fixture impression + CTR delta recorded for experiment window",
    },
    claimLiveVerifiedRelease: false,
    requestLiveProviderWiring: false,
    requestKeywordProliferation: false,
    ...overrides,
  };
}

describe("evaluateTurnDemandIntoPageImprovement (T-F14)", () => {
  it("records complete F14 evidence package", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "TURN_DEMAND_INTO_PAGE_IMPROVEMENT_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.sourceBackedChangeRecorded).toBe(true);
    expect(decision.measurableOrBlockedClear).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f14-1");
    expect(decision.evidence.observationIds).toEqual([
      "obs-trend-1",
      "obs-q-1",
    ]);
    expect(decision.evidence.proposedAnswerId).toBe("answer-f14-1");
    expect(decision.evidence.metadataReviewed).toBe(true);
    expect(decision.evidence.internalLinksReviewed).toBe(true);
    expect(decision.evidence.changeMeasurable).toBe(true);
    expect(decision.evidence.releaseVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F14_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(TURN_DEMAND_INTO_PAGE_IMPROVEMENT_RELATED_CASE_IDS).toEqual([
      "T-F14",
    ]);
  });

  it("refuses missing observations", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ observations: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OBSERVATIONS_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_OBSERVATIONS");
  });

  it("refuses incomplete intent-page match", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ intentMatch: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INTENT_PAGE_MATCH_REQUIRED");
  });

  it("refuses incomplete mission plan", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ mission: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MISSION_PLAN_REQUIRED");
  });

  it("refuses incomplete proposed answer review", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ proposedAnswer: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROPOSED_ANSWER_REVIEW_REQUIRED");
  });

  it("refuses incomplete revision diff", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ revision: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("REVISION_DIFF_REQUIRED");
  });

  it("refuses incomplete QA bundle", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ qa: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("QA_BUNDLE_REQUIRED");
  });

  it("refuses missing policy release", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ policyReviewed: false, releaseReceiptId: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("POLICY_RELEASE_REQUIRED");
  });

  it("refuses incomplete experiment window", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ experimentWindow: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("EXPERIMENT_WINDOW_REQUIRED");
  });

  it("refuses missing measurable change observation", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ measurableChange: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MEASURABLE_CHANGE_REQUIRED");
  });

  it("refuses keyword proliferation", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ requestKeywordProliferation: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("KEYWORD_PROLIFERATION_REFUSED");
  });

  it("refuses false live-verified release claim", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ claimLiveVerifiedRelease: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_RELEASE_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateTurnDemandIntoPageImprovement(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
