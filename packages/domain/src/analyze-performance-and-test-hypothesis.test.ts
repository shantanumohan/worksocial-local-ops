import { describe, expect, it } from "vitest";
import {
  ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_RELATED_CASE_IDS,
  evaluateAnalyzePerformanceAndTestHypothesis,
  type AnalyzePerformanceAndTestHypothesisInput,
} from "./analyze-performance-and-test-hypothesis.js";

function baseInput(
  overrides: Partial<AnalyzePerformanceAndTestHypothesisInput> = {},
): AnalyzePerformanceAndTestHypothesisInput {
  return {
    packageId: "pkg-f19-1",
    analysisDefinition: {
      definitionId: "def-f19-1",
      siteId: "site-midtown",
      periodStartIso: "2026-10-01T00:00:00.000Z",
      periodEndIso: "2026-10-31T23:59:59.000Z",
      comparisonLabel: "prior_period",
      reportingTimezone: "America/New_York",
    },
    metricDefinitions: [
      {
        metricId: "metric-sessions",
        label: "Organic sessions",
        denominator: "sessions",
        numerator: 420,
        denominatorValue: 420,
        omitted: false,
      },
      {
        metricId: "metric-bookings",
        label: "Tour bookings",
        denominator: "bookings",
        numerator: 18,
        denominatorValue: 18,
        omitted: false,
      },
      {
        metricId: "metric-omitted-ctr",
        label: "Omitted CTR row",
        denominator: "clicks",
        numerator: null,
        denominatorValue: null,
        omitted: true,
      },
    ],
    viewSelection: {
      viewId: "view-acquisition-1",
      kind: "ACQUISITION",
    },
    inspection: {
      inspectionId: "insp-organic-1",
      targetKind: "CHANNEL",
      targetId: "channel-organic",
      targetLabel: "Organic Search",
    },
    discrepancy: {
      investigationId: "disc-f19-1",
      discrepancySummary:
        "Sessions up 12% while tour bookings flat vs prior period",
      annotationIds: ["ann-sessions-up", "ann-bookings-flat"],
      drillThroughPath: "/analysis/organic/landing-pages",
    },
    reconciliation: {
      worksheetId: "recon-f19-1",
      reconciledRowCount: 14,
      unresolvedOmittedCount: 1,
      notes: "Omitted CTR kept UNKNOWN; no invented zeros",
    },
    hypothesisPlan: {
      hypothesisId: "hyp-f19-1",
      statement:
        "Improving day-pass CTA clarity on /pricing will lift tour bookings without reducing sessions",
      primaryOutcome: "tour_bookings",
      baseline: "18 tour bookings / 31 days",
      comparison: "prior_period_same_window",
      observationWindowDays: 14,
      measurementPlanId: "mplan-f19-1",
      measurementSteps: [
        "Record baseline tour bookings and sessions",
        "Ship pricing CTA clarification under fixture release",
        "Compare 14-day window against prior period",
      ],
    },
    experiment: {
      experimentId: "exp-f19-1",
      startsAtIso: "2026-11-01T00:00:00.000Z",
      endsAtIso: "2026-11-15T00:00:00.000Z",
      linkedHypothesisId: "hyp-f19-1",
    },
    portableBrief: {
      briefId: "brief-f19-1",
      title: "Organic acquisition → tour booking hypothesis",
      summary:
        "Supported decision: test pricing CTA clarification; omit vanity engagement score.",
      redacted: true,
      supportedDecision:
        "Proceed with 14-day pricing CTA experiment; keep omitted CTR as UNKNOWN",
      vanityScoreClaimed: false,
      sourceCaveats: [
        "Fixture GSC/GA4 rows only — live query transport NOT_WIRED",
        "One omitted CTR row unresolved",
      ],
      proposedActions: [
        "Ship pricing CTA clarification under fixture release",
        "Re-check tour bookings after 14 days",
      ],
    },
    claimVanityScoreDecision: false,
    claimLiveVerifiedAnalysis: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateAnalyzePerformanceAndTestHypothesis (T-F19)", () => {
  it("records complete F19 evidence package", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.supportedDecisionRecorded).toBe(true);
    expect(decision.vanityScoreRefused).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f19-1");
    expect(decision.evidence.definitionId).toBe("def-f19-1");
    expect(decision.evidence.metricIds).toEqual([
      "metric-sessions",
      "metric-bookings",
      "metric-omitted-ctr",
    ]);
    expect(decision.evidence.viewKind).toBe("ACQUISITION");
    expect(decision.evidence.hypothesisId).toBe("hyp-f19-1");
    expect(decision.evidence.briefRedacted).toBe(true);
    expect(decision.evidence.vanityScoreClaimed).toBe(false);
    expect(decision.evidence.analysisVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F19_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_RELATED_CASE_IDS).toEqual([
      "T-F19",
    ]);
  });

  it("refuses missing analysis definition", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ analysisDefinition: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ANALYSIS_DEFINITION_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_ANALYSIS_DEFINITION");
  });

  it("refuses invented zeros on omitted metrics", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({
        metricDefinitions: [
          {
            metricId: "metric-bad",
            label: "Bad omitted",
            denominator: "clicks",
            numerator: 0,
            denominatorValue: 0,
            omitted: true,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("METRIC_DEFINITIONS_REQUIRED");
  });

  it("refuses missing view selection", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ viewSelection: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("VIEW_SELECTION_REQUIRED");
  });

  it("refuses missing inspection", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ inspection: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INSPECTION_REQUIRED");
  });

  it("refuses missing discrepancy investigation", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ discrepancy: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DISCREPANCY_INVESTIGATION_REQUIRED");
  });

  it("refuses missing reconciliation worksheet", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ reconciliation: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("RECONCILIATION_WORKSHEET_REQUIRED");
  });

  it("refuses missing hypothesis/measurement plan", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ hypothesisPlan: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("HYPOTHESIS_MEASUREMENT_PLAN_REQUIRED");
  });

  it("refuses experiment not linked to hypothesis", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({
        experiment: {
          experimentId: "exp-bad",
          startsAtIso: "2026-11-01T00:00:00.000Z",
          endsAtIso: "2026-11-15T00:00:00.000Z",
          linkedHypothesisId: "hyp-other",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("EXPERIMENT_RECORD_REQUIRED");
  });

  it("refuses incomplete portable brief", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ portableBrief: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PORTABLE_DECISION_BRIEF_REQUIRED");
  });

  it("refuses vanity-score decisions", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ claimVanityScoreDecision: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("VANITY_SCORE_DECISION_REFUSED");
    expect(decision.vanityScoreRefused).toBe(true);
  });

  it("refuses false live-verified analysis claims", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ claimLiveVerifiedAnalysis: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_ANALYSIS_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateAnalyzePerformanceAndTestHypothesis(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
