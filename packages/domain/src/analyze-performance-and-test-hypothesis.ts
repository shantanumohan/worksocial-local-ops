/**
 * T-F19 — Analyze performance and test a hypothesis (complete F19 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F19 evidence
 * package — saved analysis definition (site/period/comparison/timezone), metric
 * definitions with honest denominators, selected view, channel/page inspection,
 * discrepancy investigation with annotations, reconciliation worksheet,
 * hypothesis + measurement plan, experiment record, and redacted portable
 * decision brief. Incomplete packages, vanity-score decisions, false
 * live-verified claims, and live provider wiring are refused. Live provider
 * wiring stays NOT_WIRED. Pure domain — no network I/O. Fixture ACCEPTED ≠
 * sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-037 (`PORTABLE_ANALYSIS_ARTIFACT` / portable brief summary)
 * — this records the complete F19 flow evidence package (definition + metrics +
 * drill-through + reconciliation + hypothesis/measurement + experiment +
 * portable brief), not the portable-artifact happy-path alone. Distinct from
 * T-US-031 (paid-media recommendation mutation), T-US-058/T-X039 (metric
 * denominators honesty alone), and T-X060 (currency/timezone mismatch refuse).
 */

export type AnalysisScopeDefinition = {
  definitionId: string;
  siteId: string;
  periodStartIso: string;
  periodEndIso: string;
  comparisonLabel: string;
  reportingTimezone: string;
};

export type MetricDefinition = {
  metricId: string;
  label: string;
  /** Honest denominator label (sessions, clicks, bookings) — never vanity. */
  denominator: string;
  /** null when omitted/unknown — never invent 0. */
  numerator: number | null;
  denominatorValue: number | null;
  omitted: boolean;
};

export type AnalysisViewSelection = {
  viewId: string;
  kind: "ACQUISITION" | "JOURNEY" | "REVENUE";
};

export type ChannelOrPageInspection = {
  inspectionId: string;
  targetKind: "CHANNEL" | "PAGE";
  targetId: string;
  targetLabel: string;
};

export type DiscrepancyInvestigation = {
  investigationId: string;
  discrepancySummary: string;
  annotationIds: readonly string[];
  drillThroughPath: string;
};

export type ReconciliationWorksheet = {
  worksheetId: string;
  /** Rows reconciled without inventing missing values. */
  reconciledRowCount: number;
  unresolvedOmittedCount: number;
  notes: string;
};

export type HypothesisMeasurementPlan = {
  hypothesisId: string;
  statement: string;
  primaryOutcome: string;
  baseline: string;
  comparison: string;
  observationWindowDays: number;
  measurementPlanId: string;
  measurementSteps: readonly string[];
};

export type ExperimentRecord = {
  experimentId: string;
  startsAtIso: string;
  endsAtIso: string;
  linkedHypothesisId: string;
};

export type PortableDecisionBrief = {
  briefId: string;
  title: string;
  summary: string;
  /** Shareable brief must be redacted. */
  redacted: true;
  supportedDecision: string;
  /** Vanity score claims must be refused. */
  vanityScoreClaimed: false;
  sourceCaveats: readonly string[];
  proposedActions: readonly string[];
};

export type AnalyzePerformanceAndTestHypothesisInput = {
  packageId: string;
  analysisDefinition: AnalysisScopeDefinition | null;
  metricDefinitions: readonly MetricDefinition[] | null;
  viewSelection: AnalysisViewSelection | null;
  inspection: ChannelOrPageInspection | null;
  discrepancy: DiscrepancyInvestigation | null;
  reconciliation: ReconciliationWorksheet | null;
  hypothesisPlan: HypothesisMeasurementPlan | null;
  experiment: ExperimentRecord | null;
  portableBrief: PortableDecisionBrief | null;
  /** Claim a vanity score as the decision — must refuse. */
  claimVanityScoreDecision: boolean;
  /** Claim the F19 path is live-verified — must refuse offline. */
  claimLiveVerifiedAnalysis: boolean;
  /** Request live GSC/GA4/Ads query apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type AnalyzePerformanceAndTestHypothesisDecision =
  | {
      allowed: true;
      code: "ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_EVIDENCE_RECORDED";
      supportedDecisionRecorded: true;
      vanityScoreRefused: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        definitionId: string;
        siteId: string;
        periodStartIso: string;
        periodEndIso: string;
        comparisonLabel: string;
        reportingTimezone: string;
        metricIds: string[];
        metricDenominatorLabels: string[];
        viewId: string;
        viewKind: AnalysisViewSelection["kind"];
        inspectionId: string;
        inspectionTargetId: string;
        investigationId: string;
        annotationIds: string[];
        drillThroughPath: string;
        worksheetId: string;
        reconciledRowCount: number;
        unresolvedOmittedCount: number;
        hypothesisId: string;
        measurementPlanId: string;
        observationWindowDays: number;
        experimentId: string;
        briefId: string;
        supportedDecision: string;
        briefRedacted: true;
        vanityScoreClaimed: false;
        analysisVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F19_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "ANALYSIS_HYPOTHESIS_BRIEF_RECORDED";
        recoveryPath: "KEEP_FIXTURE_ANALYSIS_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "ANALYSIS_DEFINITION_REQUIRED"
        | "METRIC_DEFINITIONS_REQUIRED"
        | "VIEW_SELECTION_REQUIRED"
        | "INSPECTION_REQUIRED"
        | "DISCREPANCY_INVESTIGATION_REQUIRED"
        | "RECONCILIATION_WORKSHEET_REQUIRED"
        | "HYPOTHESIS_MEASUREMENT_PLAN_REQUIRED"
        | "EXPERIMENT_RECORD_REQUIRED"
        | "PORTABLE_DECISION_BRIEF_REQUIRED"
        | "VANITY_SCORE_DECISION_REFUSED"
        | "FALSE_LIVE_VERIFIED_ANALYSIS_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      supportedDecisionRecorded: false;
      vanityScoreRefused: boolean;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        definitionId: string | null;
        siteId: string | null;
        periodStartIso: string | null;
        periodEndIso: string | null;
        comparisonLabel: string | null;
        reportingTimezone: string | null;
        metricIds: string[];
        metricDenominatorLabels: string[];
        viewId: string | null;
        viewKind: AnalysisViewSelection["kind"] | null;
        inspectionId: string | null;
        inspectionTargetId: string | null;
        investigationId: string | null;
        annotationIds: string[];
        drillThroughPath: string | null;
        worksheetId: string | null;
        reconciledRowCount: number;
        unresolvedOmittedCount: number;
        hypothesisId: string | null;
        measurementPlanId: string | null;
        observationWindowDays: number | null;
        experimentId: string | null;
        briefId: string | null;
        supportedDecision: string | null;
        briefRedacted: boolean;
        vanityScoreClaimed: boolean;
        analysisVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_ANALYSIS_DEFINITION"
          | "AWAITING_METRIC_DEFINITIONS"
          | "AWAITING_VIEW_SELECTION"
          | "AWAITING_INSPECTION"
          | "AWAITING_DISCREPANCY_INVESTIGATION"
          | "AWAITING_RECONCILIATION_WORKSHEET"
          | "AWAITING_HYPOTHESIS_MEASUREMENT_PLAN"
          | "AWAITING_EXPERIMENT_RECORD"
          | "AWAITING_PORTABLE_DECISION_BRIEF";
        recoveryPath:
          | "CHOOSE_SITE_PERIOD_COMPARISON_TIMEZONE"
          | "DEFINE_METRICS_WITH_HONEST_DENOMINATORS"
          | "SELECT_ACQUISITION_JOURNEY_OR_REVENUE_VIEW"
          | "INSPECT_CHANNEL_OR_PAGE"
          | "INVESTIGATE_DISCREPANCY_WITH_ANNOTATIONS"
          | "COMPLETE_RECONCILIATION_WORKSHEET"
          | "SAVE_HYPOTHESIS_AND_MEASUREMENT_PLAN"
          | "RECORD_EXPERIMENT"
          | "EXPORT_REDACTED_SUPPORTED_DECISION_BRIEF"
          | "KEEP_FIXTURE_ANALYSIS_NO_LIVE_PROVIDER"
          | "REPLACE_VANITY_SCORE_WITH_SUPPORTED_DECISION";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_RELATED_CASE_IDS = [
  "T-F19",
] as const;

function preservedInputCount(
  input: AnalyzePerformanceAndTestHypothesisInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.analysisDefinition?.definitionId.trim() ? 1 : 0) +
    (input.metricDefinitions && input.metricDefinitions.length > 0 ? 1 : 0) +
    (input.viewSelection?.viewId.trim() ? 1 : 0) +
    (input.inspection?.inspectionId.trim() ? 1 : 0) +
    (input.discrepancy?.investigationId.trim() ? 1 : 0) +
    (input.reconciliation?.worksheetId.trim() ? 1 : 0) +
    (input.hypothesisPlan?.hypothesisId.trim() ? 1 : 0) +
    (input.experiment?.experimentId.trim() ? 1 : 0) +
    (input.portableBrief?.briefId.trim() ? 1 : 0)
  );
}

function definitionOk(
  def: AnalysisScopeDefinition | null,
): def is AnalysisScopeDefinition {
  if (!def) return false;
  if (
    !def.definitionId.trim() ||
    !def.siteId.trim() ||
    !def.periodStartIso.trim() ||
    !def.periodEndIso.trim() ||
    !def.comparisonLabel.trim() ||
    !def.reportingTimezone.trim()
  ) {
    return false;
  }
  const startMs = Date.parse(def.periodStartIso);
  const endMs = Date.parse(def.periodEndIso);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
}

function metricsOk(
  metrics: readonly MetricDefinition[] | null,
): metrics is readonly MetricDefinition[] {
  if (!metrics || metrics.length === 0) return false;
  return metrics.every((m) => {
    if (
      !m.metricId.trim() ||
      !m.label.trim() ||
      !m.denominator.trim() ||
      typeof m.omitted !== "boolean"
    ) {
      return false;
    }
    // Omitted/unknown must not invent zeros as measured values.
    if (m.omitted) {
      return m.numerator === null && m.denominatorValue === null;
    }
    return (
      m.numerator !== null &&
      m.denominatorValue !== null &&
      Number.isFinite(m.numerator) &&
      Number.isFinite(m.denominatorValue) &&
      m.denominatorValue > 0 &&
      m.numerator >= 0
    );
  });
}

function viewOk(
  view: AnalysisViewSelection | null,
): view is AnalysisViewSelection {
  if (!view) return false;
  return (
    view.viewId.trim().length > 0 &&
    (view.kind === "ACQUISITION" ||
      view.kind === "JOURNEY" ||
      view.kind === "REVENUE")
  );
}

function inspectionOk(
  inspection: ChannelOrPageInspection | null,
): inspection is ChannelOrPageInspection {
  if (!inspection) return false;
  return (
    inspection.inspectionId.trim().length > 0 &&
    (inspection.targetKind === "CHANNEL" ||
      inspection.targetKind === "PAGE") &&
    inspection.targetId.trim().length > 0 &&
    inspection.targetLabel.trim().length > 0
  );
}

function discrepancyOk(
  disc: DiscrepancyInvestigation | null,
): disc is DiscrepancyInvestigation {
  if (!disc) return false;
  return (
    disc.investigationId.trim().length > 0 &&
    disc.discrepancySummary.trim().length > 0 &&
    disc.annotationIds.length > 0 &&
    disc.annotationIds.every((id) => id.trim().length > 0) &&
    disc.drillThroughPath.trim().length > 0
  );
}

function reconciliationOk(
  sheet: ReconciliationWorksheet | null,
): sheet is ReconciliationWorksheet {
  if (!sheet) return false;
  return (
    sheet.worksheetId.trim().length > 0 &&
    Number.isFinite(sheet.reconciledRowCount) &&
    sheet.reconciledRowCount >= 1 &&
    Number.isFinite(sheet.unresolvedOmittedCount) &&
    sheet.unresolvedOmittedCount >= 0 &&
    sheet.notes.trim().length > 0
  );
}

function hypothesisOk(
  plan: HypothesisMeasurementPlan | null,
): plan is HypothesisMeasurementPlan {
  if (!plan) return false;
  return (
    plan.hypothesisId.trim().length > 0 &&
    plan.statement.trim().length > 0 &&
    plan.primaryOutcome.trim().length > 0 &&
    plan.baseline.trim().length > 0 &&
    plan.comparison.trim().length > 0 &&
    Number.isFinite(plan.observationWindowDays) &&
    plan.observationWindowDays >= 1 &&
    plan.measurementPlanId.trim().length > 0 &&
    plan.measurementSteps.length > 0 &&
    plan.measurementSteps.every((s) => s.trim().length > 0)
  );
}

function experimentOk(
  experiment: ExperimentRecord | null,
  hypothesisId: string,
): experiment is ExperimentRecord {
  if (!experiment) return false;
  if (
    !experiment.experimentId.trim() ||
    !experiment.startsAtIso.trim() ||
    !experiment.endsAtIso.trim() ||
    experiment.linkedHypothesisId.trim() !== hypothesisId
  ) {
    return false;
  }
  const startMs = Date.parse(experiment.startsAtIso);
  const endMs = Date.parse(experiment.endsAtIso);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
}

function briefOk(
  brief: PortableDecisionBrief | null,
): brief is PortableDecisionBrief {
  if (!brief) return false;
  return (
    brief.briefId.trim().length > 0 &&
    brief.title.trim().length > 0 &&
    brief.summary.trim().length > 0 &&
    brief.redacted === true &&
    brief.supportedDecision.trim().length > 0 &&
    brief.vanityScoreClaimed === false &&
    brief.sourceCaveats.length > 0 &&
    brief.proposedActions.length > 0 &&
    brief.proposedActions.every((a) => a.trim().length > 0)
  );
}

/**
 * Evaluate the T-F19 analyze-performance-and-test-hypothesis path offline.
 * Complete F19 evidence package → ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and vanity/live claims refused.
 */
export function evaluateAnalyzePerformanceAndTestHypothesis(
  input: AnalyzePerformanceAndTestHypothesisInput,
): AnalyzePerformanceAndTestHypothesisDecision {
  const base = {
    supportedDecisionRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const analysisDefinition = input.analysisDefinition;
  const metricDefinitions = input.metricDefinitions;
  const viewSelection = input.viewSelection;
  const inspection = input.inspection;
  const discrepancy = input.discrepancy;
  const reconciliation = input.reconciliation;
  const hypothesisPlan = input.hypothesisPlan;
  const experiment = input.experiment;
  const portableBrief = input.portableBrief;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_ANALYSIS_DEFINITION"
      | "AWAITING_METRIC_DEFINITIONS"
      | "AWAITING_VIEW_SELECTION"
      | "AWAITING_INSPECTION"
      | "AWAITING_DISCREPANCY_INVESTIGATION"
      | "AWAITING_RECONCILIATION_WORKSHEET"
      | "AWAITING_HYPOTHESIS_MEASUREMENT_PLAN"
      | "AWAITING_EXPERIMENT_RECORD"
      | "AWAITING_PORTABLE_DECISION_BRIEF",
    recoveryPath:
      | "CHOOSE_SITE_PERIOD_COMPARISON_TIMEZONE"
      | "DEFINE_METRICS_WITH_HONEST_DENOMINATORS"
      | "SELECT_ACQUISITION_JOURNEY_OR_REVENUE_VIEW"
      | "INSPECT_CHANNEL_OR_PAGE"
      | "INVESTIGATE_DISCREPANCY_WITH_ANNOTATIONS"
      | "COMPLETE_RECONCILIATION_WORKSHEET"
      | "SAVE_HYPOTHESIS_AND_MEASUREMENT_PLAN"
      | "RECORD_EXPERIMENT"
      | "EXPORT_REDACTED_SUPPORTED_DECISION_BRIEF"
      | "KEEP_FIXTURE_ANALYSIS_NO_LIVE_PROVIDER"
      | "REPLACE_VANITY_SCORE_WITH_SUPPORTED_DECISION",
  ): NonNullable<
    Extract<
      AnalyzePerformanceAndTestHypothesisDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    definitionId: analysisDefinition?.definitionId.trim() || null,
    siteId: analysisDefinition?.siteId.trim() || null,
    periodStartIso: analysisDefinition?.periodStartIso.trim() || null,
    periodEndIso: analysisDefinition?.periodEndIso.trim() || null,
    comparisonLabel: analysisDefinition?.comparisonLabel.trim() || null,
    reportingTimezone: analysisDefinition?.reportingTimezone.trim() || null,
    metricIds: metricDefinitions?.map((m) => m.metricId) ?? [],
    metricDenominatorLabels: metricDefinitions?.map((m) => m.denominator) ?? [],
    viewId: viewSelection?.viewId.trim() || null,
    viewKind: viewSelection?.kind ?? null,
    inspectionId: inspection?.inspectionId.trim() || null,
    inspectionTargetId: inspection?.targetId.trim() || null,
    investigationId: discrepancy?.investigationId.trim() || null,
    annotationIds: discrepancy?.annotationIds.map((id) => id.trim()) ?? [],
    drillThroughPath: discrepancy?.drillThroughPath.trim() || null,
    worksheetId: reconciliation?.worksheetId.trim() || null,
    reconciledRowCount: reconciliation?.reconciledRowCount ?? 0,
    unresolvedOmittedCount: reconciliation?.unresolvedOmittedCount ?? 0,
    hypothesisId: hypothesisPlan?.hypothesisId.trim() || null,
    measurementPlanId: hypothesisPlan?.measurementPlanId.trim() || null,
    observationWindowDays: hypothesisPlan?.observationWindowDays ?? null,
    experimentId: experiment?.experimentId.trim() || null,
    briefId: portableBrief?.briefId.trim() || null,
    supportedDecision: portableBrief?.supportedDecision.trim() || null,
    briefRedacted: portableBrief?.redacted === true,
    vanityScoreClaimed: false,
    analysisVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: null,
      reasons: [
        "Live GSC/GA4/Ads analysis query transport remains NOT_WIRED — refuse live wiring (T-F19)",
      ],
    };
  }

  if (input.claimLiveVerifiedAnalysis) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_ANALYSIS_REFUSED",
      ...base,
      vanityScoreRefused: true,
      evidence: null,
      reasons: [
        "Refused false live-verified analysis claim offline (T-F19) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.claimVanityScoreDecision) {
    return {
      allowed: false,
      code: "VANITY_SCORE_DECISION_REFUSED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "VANITY_SCORE_DECISION_REFUSED",
        "BLOCKED",
        "REPLACE_VANITY_SCORE_WITH_SUPPORTED_DECISION",
      ),
      reasons: [
        "Vanity-score decision refused — F19 requires a supported decision from reproducible analysis, not a vanity score (T-F19)",
      ],
    };
  }

  if (!input.packageId.trim() || !definitionOk(analysisDefinition)) {
    return {
      allowed: false,
      code: "ANALYSIS_DEFINITION_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "ANALYSIS_DEFINITION_INCOMPLETE",
        "AWAITING_ANALYSIS_DEFINITION",
        "CHOOSE_SITE_PERIOD_COMPARISON_TIMEZONE",
      ),
      reasons: [
        "F19 requires package id and saved analysis definition with site, period, comparison, and reporting timezone (T-F19)",
      ],
    };
  }

  if (!metricsOk(metricDefinitions)) {
    return {
      allowed: false,
      code: "METRIC_DEFINITIONS_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "METRIC_DEFINITIONS_INCOMPLETE",
        "AWAITING_METRIC_DEFINITIONS",
        "DEFINE_METRICS_WITH_HONEST_DENOMINATORS",
      ),
      reasons: [
        "F19 requires metric definitions with honest denominators; omitted metrics must keep null numerators/denominators (never invent 0) (T-F19)",
      ],
    };
  }

  if (!viewOk(viewSelection)) {
    return {
      allowed: false,
      code: "VIEW_SELECTION_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "VIEW_SELECTION_INCOMPLETE",
        "AWAITING_VIEW_SELECTION",
        "SELECT_ACQUISITION_JOURNEY_OR_REVENUE_VIEW",
      ),
      reasons: [
        "F19 requires selecting an acquisition, journey, or revenue view (T-F19)",
      ],
    };
  }

  if (!inspectionOk(inspection)) {
    return {
      allowed: false,
      code: "INSPECTION_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "INSPECTION_INCOMPLETE",
        "AWAITING_INSPECTION",
        "INSPECT_CHANNEL_OR_PAGE",
      ),
      reasons: [
        "F19 requires inspecting a channel or page with inspectionId + target identity (T-F19)",
      ],
    };
  }

  if (!discrepancyOk(discrepancy)) {
    return {
      allowed: false,
      code: "DISCREPANCY_INVESTIGATION_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "DISCREPANCY_INVESTIGATION_INCOMPLETE",
        "AWAITING_DISCREPANCY_INVESTIGATION",
        "INVESTIGATE_DISCREPANCY_WITH_ANNOTATIONS",
      ),
      reasons: [
        "F19 requires discrepancy investigation with annotations and drill-through path (T-F19)",
      ],
    };
  }

  if (!reconciliationOk(reconciliation)) {
    return {
      allowed: false,
      code: "RECONCILIATION_WORKSHEET_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "RECONCILIATION_WORKSHEET_INCOMPLETE",
        "AWAITING_RECONCILIATION_WORKSHEET",
        "COMPLETE_RECONCILIATION_WORKSHEET",
      ),
      reasons: [
        "F19 requires reconciliation worksheet with reconciled rows and notes (T-F19)",
      ],
    };
  }

  if (!hypothesisOk(hypothesisPlan)) {
    return {
      allowed: false,
      code: "HYPOTHESIS_MEASUREMENT_PLAN_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "HYPOTHESIS_MEASUREMENT_PLAN_INCOMPLETE",
        "AWAITING_HYPOTHESIS_MEASUREMENT_PLAN",
        "SAVE_HYPOTHESIS_AND_MEASUREMENT_PLAN",
      ),
      reasons: [
        "F19 requires saved hypothesis and measurement plan (statement, outcome, baseline, comparison, window, steps) (T-F19)",
      ],
    };
  }

  if (!experimentOk(experiment, hypothesisPlan.hypothesisId.trim())) {
    return {
      allowed: false,
      code: "EXPERIMENT_RECORD_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "EXPERIMENT_RECORD_INCOMPLETE",
        "AWAITING_EXPERIMENT_RECORD",
        "RECORD_EXPERIMENT",
      ),
      reasons: [
        "F19 requires experiment record linked to the hypothesis with endsAtIso after startsAtIso (T-F19)",
      ],
    };
  }

  if (!briefOk(portableBrief)) {
    return {
      allowed: false,
      code: "PORTABLE_DECISION_BRIEF_REQUIRED",
      ...base,
      vanityScoreRefused: true,
      evidence: blockedEvidence(
        "PORTABLE_DECISION_BRIEF_INCOMPLETE",
        "AWAITING_PORTABLE_DECISION_BRIEF",
        "EXPORT_REDACTED_SUPPORTED_DECISION_BRIEF",
      ),
      reasons: [
        "F19 requires redacted portable decision brief with supportedDecision (not vanity), caveats, and proposed actions (T-F19)",
      ],
    };
  }

  return {
    allowed: true,
    code: "ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS_EVIDENCE_RECORDED",
    ...base,
    supportedDecisionRecorded: true,
    vanityScoreRefused: true,
    evidence: {
      packageId: input.packageId.trim(),
      definitionId: analysisDefinition.definitionId.trim(),
      siteId: analysisDefinition.siteId.trim(),
      periodStartIso: analysisDefinition.periodStartIso.trim(),
      periodEndIso: analysisDefinition.periodEndIso.trim(),
      comparisonLabel: analysisDefinition.comparisonLabel.trim(),
      reportingTimezone: analysisDefinition.reportingTimezone.trim(),
      metricIds: metricDefinitions.map((m) => m.metricId.trim()),
      metricDenominatorLabels: metricDefinitions.map((m) =>
        m.denominator.trim(),
      ),
      viewId: viewSelection.viewId.trim(),
      viewKind: viewSelection.kind,
      inspectionId: inspection.inspectionId.trim(),
      inspectionTargetId: inspection.targetId.trim(),
      investigationId: discrepancy.investigationId.trim(),
      annotationIds: discrepancy.annotationIds.map((id) => id.trim()),
      drillThroughPath: discrepancy.drillThroughPath.trim(),
      worksheetId: reconciliation.worksheetId.trim(),
      reconciledRowCount: reconciliation.reconciledRowCount,
      unresolvedOmittedCount: reconciliation.unresolvedOmittedCount,
      hypothesisId: hypothesisPlan.hypothesisId.trim(),
      measurementPlanId: hypothesisPlan.measurementPlanId.trim(),
      observationWindowDays: hypothesisPlan.observationWindowDays,
      experimentId: experiment.experimentId.trim(),
      briefId: portableBrief.briefId.trim(),
      supportedDecision: portableBrief.supportedDecision.trim(),
      briefRedacted: true,
      vanityScoreClaimed: false,
      analysisVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F19_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "ANALYSIS_HYPOTHESIS_BRIEF_RECORDED",
      recoveryPath: "KEEP_FIXTURE_ANALYSIS_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F19 evidence package recorded (analysis definition, metric definitions/denominators, view, channel/page inspection, discrepancy investigation, reconciliation worksheet, hypothesis+measurement plan, experiment record, redacted portable decision brief); supported decision recorded; vanity score refused; live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}
