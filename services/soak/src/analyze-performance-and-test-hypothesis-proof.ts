/**
 * Fixture proof for T-F19 — Analyze performance and test a hypothesis.
 * Complete F19 evidence package: analysis definition, metric definitions/
 * denominators, view, channel/page inspection, discrepancy investigation,
 * reconciliation worksheet, hypothesis+measurement plan, experiment record,
 * redacted portable decision brief; vanity-score and live claims refused;
 * live providers NOT_WIRED. Distinct from T-US-037 portable-artifact summary,
 * T-US-031 paid-media recommendation, T-US-058/T-X039 metric denominators,
 * and T-X060 currency/timezone mismatch. External effects: NONE. Never
 * invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateAnalyzePerformanceAndTestHypothesis,
  type AnalyzePerformanceAndTestHypothesisInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<AnalyzePerformanceAndTestHypothesisInput> = {},
): AnalyzePerformanceAndTestHypothesisInput {
  return {
    packageId: "pkg-f19-soak",
    analysisDefinition: {
      definitionId: "def-f19-soak",
      siteId: "site-midtown-soak",
      periodStartIso: "2026-10-01T00:00:00.000Z",
      periodEndIso: "2026-10-31T23:59:59.000Z",
      comparisonLabel: "prior_period",
      reportingTimezone: "America/New_York",
    },
    metricDefinitions: [
      {
        metricId: "metric-sessions-soak",
        label: "Organic sessions",
        denominator: "sessions",
        numerator: 420,
        denominatorValue: 420,
        omitted: false,
      },
      {
        metricId: "metric-bookings-soak",
        label: "Tour bookings",
        denominator: "bookings",
        numerator: 18,
        denominatorValue: 18,
        omitted: false,
      },
      {
        metricId: "metric-omitted-ctr-soak",
        label: "Omitted CTR row",
        denominator: "clicks",
        numerator: null,
        denominatorValue: null,
        omitted: true,
      },
    ],
    viewSelection: {
      viewId: "view-acquisition-soak",
      kind: "ACQUISITION",
    },
    inspection: {
      inspectionId: "insp-organic-soak",
      targetKind: "CHANNEL",
      targetId: "channel-organic",
      targetLabel: "Organic Search",
    },
    discrepancy: {
      investigationId: "disc-f19-soak",
      discrepancySummary:
        "Sessions up 12% while tour bookings flat vs prior period",
      annotationIds: ["ann-sessions-up-soak", "ann-bookings-flat-soak"],
      drillThroughPath: "/analysis/organic/landing-pages",
    },
    reconciliation: {
      worksheetId: "recon-f19-soak",
      reconciledRowCount: 14,
      unresolvedOmittedCount: 1,
      notes: "Omitted CTR kept UNKNOWN; no invented zeros",
    },
    hypothesisPlan: {
      hypothesisId: "hyp-f19-soak",
      statement:
        "Improving day-pass CTA clarity on /pricing will lift tour bookings without reducing sessions",
      primaryOutcome: "tour_bookings",
      baseline: "18 tour bookings / 31 days",
      comparison: "prior_period_same_window",
      observationWindowDays: 14,
      measurementPlanId: "mplan-f19-soak",
      measurementSteps: [
        "Record baseline tour bookings and sessions",
        "Ship pricing CTA clarification under fixture release",
        "Compare 14-day window against prior period",
      ],
    },
    experiment: {
      experimentId: "exp-f19-soak",
      startsAtIso: "2026-11-01T00:00:00.000Z",
      endsAtIso: "2026-11-15T00:00:00.000Z",
      linkedHypothesisId: "hyp-f19-soak",
    },
    portableBrief: {
      briefId: "brief-f19-soak",
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

/**
 * Complete expected proof set for T-F19 fixture ACCEPTED.
 */
export function proofAnalyzePerformanceAndTestHypothesis(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateAnalyzePerformanceAndTestHypothesis(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_EVIDENCE_RECORDED" &&
    happy.evidence.analysisVerifiedLive === false &&
    happy.supportedDecisionRecorded === true &&
    happy.vanityScoreRefused === true &&
    happy.evidence.briefRedacted === true &&
    happy.evidence.vanityScoreClaimed === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F19 evidence package → ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_EVIDENCE_RECORDED; analysis definition; metric definitions/denominators; view; inspection; discrepancy; reconciliation; hypothesis+measurement; experiment; redacted portable brief; analysisVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noDef = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ analysisDefinition: null }),
  );
  if (!noDef.allowed && noDef.code === "ANALYSIS_DEFINITION_REQUIRED") {
    details.push("analysisDefinition=null → ANALYSIS_DEFINITION_REQUIRED");
  } else {
    passed = false;
    details.push(`Definition unexpectedly ${JSON.stringify(noDef)}`);
  }

  const noMetrics = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ metricDefinitions: null }),
  );
  if (!noMetrics.allowed && noMetrics.code === "METRIC_DEFINITIONS_REQUIRED") {
    details.push("metricDefinitions=null → METRIC_DEFINITIONS_REQUIRED");
  } else {
    passed = false;
    details.push(`Metrics unexpectedly ${JSON.stringify(noMetrics)}`);
  }

  const noView = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ viewSelection: null }),
  );
  if (!noView.allowed && noView.code === "VIEW_SELECTION_REQUIRED") {
    details.push("viewSelection=null → VIEW_SELECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`View unexpectedly ${JSON.stringify(noView)}`);
  }

  const noInsp = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ inspection: null }),
  );
  if (!noInsp.allowed && noInsp.code === "INSPECTION_REQUIRED") {
    details.push("inspection=null → INSPECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Inspection unexpectedly ${JSON.stringify(noInsp)}`);
  }

  const noDisc = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ discrepancy: null }),
  );
  if (
    !noDisc.allowed &&
    noDisc.code === "DISCREPANCY_INVESTIGATION_REQUIRED"
  ) {
    details.push("discrepancy=null → DISCREPANCY_INVESTIGATION_REQUIRED");
  } else {
    passed = false;
    details.push(`Discrepancy unexpectedly ${JSON.stringify(noDisc)}`);
  }

  const noRecon = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ reconciliation: null }),
  );
  if (
    !noRecon.allowed &&
    noRecon.code === "RECONCILIATION_WORKSHEET_REQUIRED"
  ) {
    details.push("reconciliation=null → RECONCILIATION_WORKSHEET_REQUIRED");
  } else {
    passed = false;
    details.push(`Reconciliation unexpectedly ${JSON.stringify(noRecon)}`);
  }

  const noHyp = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ hypothesisPlan: null }),
  );
  if (
    !noHyp.allowed &&
    noHyp.code === "HYPOTHESIS_MEASUREMENT_PLAN_REQUIRED"
  ) {
    details.push("hypothesisPlan=null → HYPOTHESIS_MEASUREMENT_PLAN_REQUIRED");
  } else {
    passed = false;
    details.push(`Hypothesis unexpectedly ${JSON.stringify(noHyp)}`);
  }

  const noExp = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ experiment: null }),
  );
  if (!noExp.allowed && noExp.code === "EXPERIMENT_RECORD_REQUIRED") {
    details.push("experiment=null → EXPERIMENT_RECORD_REQUIRED");
  } else {
    passed = false;
    details.push(`Experiment unexpectedly ${JSON.stringify(noExp)}`);
  }

  const noBrief = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ portableBrief: null }),
  );
  if (
    !noBrief.allowed &&
    noBrief.code === "PORTABLE_DECISION_BRIEF_REQUIRED"
  ) {
    details.push("portableBrief=null → PORTABLE_DECISION_BRIEF_REQUIRED");
  } else {
    passed = false;
    details.push(`Brief unexpectedly ${JSON.stringify(noBrief)}`);
  }

  const vanity = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ claimVanityScoreDecision: true }),
  );
  if (!vanity.allowed && vanity.code === "VANITY_SCORE_DECISION_REFUSED") {
    details.push("claimVanityScoreDecision → VANITY_SCORE_DECISION_REFUSED");
  } else {
    passed = false;
    details.push(`Vanity unexpectedly ${JSON.stringify(vanity)}`);
  }

  const liveClaim = evaluateAnalyzePerformanceAndTestHypothesis(
    baseInput({ claimLiveVerifiedAnalysis: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_ANALYSIS_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedAnalysis → FALSE_LIVE_VERIFIED_ANALYSIS_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateAnalyzePerformanceAndTestHypothesis(
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
    "Distinct from T-US-037 (portable analysis artifact summary), T-US-031 (paid-media recommendation), T-US-058/T-X039 (metric denominators honesty alone), and T-X060 (currency/timezone mismatch) — complete F19 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-analyze-performance-and-test-hypothesis-f19",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
