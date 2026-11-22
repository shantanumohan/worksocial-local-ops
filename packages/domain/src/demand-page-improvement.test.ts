import { describe, expect, it } from "vitest";
import { evaluateDemandPageImprovement } from "./demand-page-improvement.js";

function baseInput() {
  return {
    observations: [
      {
        observationId: "obs-trend-1",
        demandLabel: "coworking wifi speed",
        sourceKind: "TREND" as const,
      },
    ],
    intentMatch: {
      intentId: "intent-wifi-faq",
      pageId: "page-wifi-guide",
      pagePath: "/guides/wifi",
      editableVerified: true,
      matchConfidence: "HIGH" as const,
    },
    mission: {
      missionId: "mission-us027",
      taskPlanId: "plan-us027",
      contentBriefId: "brief-us027",
      briefSummary: "Source-backed wifi FAQ improvement for recurring demand",
    },
    revision: {
      revisionId: "rev-us027",
      exactDiff: "--- a/guides/wifi.md\n+++ b/guides/wifi.md\n@@\n+Measured upload speeds\n",
      changedPathCount: 1,
    },
    qa: {
      qaBundleId: "qa-us027",
      qualityPassed: true,
      customerJourneyPassed: true,
    },
    policyReviewed: true,
    releaseReceiptId: "rcpt-release-us027",
    experimentWindow: {
      experimentId: "exp-us027",
      startsAtIso: "2026-11-22T12:00:00.000Z",
      endsAtIso: "2026-12-06T12:00:00.000Z",
    },
    requestKeywordProliferation: false,
    requestLiveProviderWiring: false,
  };
}

describe("demand-page-improvement (T-US-027)", () => {
  it("releases with receipt + experiment window when evidence is complete", () => {
    const decision = evaluateDemandPageImprovement(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("DEMAND_PAGE_IMPROVEMENT_RELEASED");
    expect(decision.releaseReceiptRecorded).toBe(true);
    expect(decision.experimentWindowRecorded).toBe(true);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.evidence.releaseReceiptId).toBe("rcpt-release-us027");
    expect(decision.evidence.experimentId).toBe("exp-us027");
    expect(decision.evidence.observationIds).toEqual(["obs-trend-1"]);
    expect(decision.evidence.exactDiff).toContain("Measured upload speeds");
  });

  it("refuses keyword proliferation and live wiring", () => {
    const proliferation = evaluateDemandPageImprovement({
      ...baseInput(),
      requestKeywordProliferation: true,
    });
    expect(proliferation.allowed).toBe(false);
    if (proliferation.allowed) throw new Error("expected refuse");
    expect(proliferation.code).toBe("KEYWORD_PROLIFERATION_REFUSED");

    const live = evaluateDemandPageImprovement({
      ...baseInput(),
      requestLiveProviderWiring: true,
    });
    expect(live.allowed).toBe(false);
    if (live.allowed) throw new Error("expected refuse");
    expect(live.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("blocks incomplete observations, match, QA, and missing experiment window", () => {
    const noObs = evaluateDemandPageImprovement({
      ...baseInput(),
      observations: [],
    });
    expect(noObs.allowed).toBe(false);
    if (!noObs.allowed) expect(noObs.code).toBe("OBSERVATIONS_REQUIRED");

    const lowMatch = evaluateDemandPageImprovement({
      ...baseInput(),
      intentMatch: {
        ...baseInput().intentMatch,
        matchConfidence: "LOW",
      },
    });
    expect(lowMatch.allowed).toBe(false);
    if (!lowMatch.allowed) expect(lowMatch.code).toBe("INTENT_PAGE_MATCH_INCOMPLETE");

    const qaFail = evaluateDemandPageImprovement({
      ...baseInput(),
      qa: { ...baseInput().qa, customerJourneyPassed: false },
    });
    expect(qaFail.allowed).toBe(false);
    if (!qaFail.allowed) expect(qaFail.code).toBe("QA_BUNDLE_INCOMPLETE");

    const noWindow = evaluateDemandPageImprovement({
      ...baseInput(),
      experimentWindow: null,
    });
    expect(noWindow.allowed).toBe(false);
    if (!noWindow.allowed) expect(noWindow.code).toBe("EXPERIMENT_WINDOW_REQUIRED");

    const noReceipt = evaluateDemandPageImprovement({
      ...baseInput(),
      policyReviewed: false,
      releaseReceiptId: null,
    });
    expect(noReceipt.allowed).toBe(false);
    if (!noReceipt.allowed) expect(noReceipt.code).toBe("POLICY_RELEASE_REQUIRED");
  });
});
