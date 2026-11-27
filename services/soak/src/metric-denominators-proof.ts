/**
 * Fixture proof for T-X039 / T-US-058 — metric denominators stay honest:
 * provider errors are unavailable (not zero/pass); synthetics are excluded
 * from business/commerce denominators. Hillclimb: liveMetricsWiring NOT_WIRED;
 * refuse live VERIFIED / live metrics wire; refuse unavailable-as-zero;
 * measured-only pass-rate denominator. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  assertSyntheticExcludedFromCommercial,
  classifyMetric,
  createSyntheticLead,
  emptyLeadCaptureState,
  appendCommerceLead,
  evaluateMetricForHonestDenominator,
  projectCommerceTotals,
  summarizeHonestMetricDenominator,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X039 + T-US-058 fixture ACCEPTED.
 */
export function proofMetricDenominatorsHonest(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // T-X039: provider_error → unavailable, not measured/zero.
  const providerErr = classifyMetric({
    metricId: "fixture-eval-pass-rate",
    value: 0,
    sampleSize: 10,
    sourceStatus: "provider_error",
  });
  if (
    providerErr.kind === "unavailable" &&
    providerErr.reason === "provider_error"
  ) {
    details.push("provider_error → unavailable (not measured/zero pass)");
  } else {
    passed = false;
    details.push(`provider_error classification unexpectedly ${JSON.stringify(providerErr)}`);
  }

  // Positive control: ok observation stays measured.
  const measured = classifyMetric({
    metricId: "fixture-eval-pass-rate",
    value: 0.8,
    sampleSize: 10,
    sourceStatus: "ok",
  });
  if (measured.kind === "measured" && measured.value === 0.8) {
    details.push("ok observation → measured");
  } else {
    passed = false;
    details.push(`ok classification unexpectedly ${JSON.stringify(measured)}`);
  }

  // T1. Missing observation → missing (not measured / not zero pass).
  const missingObs = classifyMetric({
    metricId: "fixture-missing-metric",
    value: null,
    sampleSize: 0,
    sourceStatus: "missing",
  });
  if (missingObs.kind === "missing" && missingObs.reason === "no_observation") {
    details.push("missing sourceStatus → missing (not measured/zero pass)");
  } else {
    passed = false;
    details.push(
      `missing observation unexpectedly ${JSON.stringify(missingObs)}`,
    );
  }
  const missingHonest = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-missing-metric",
      value: null,
      sampleSize: 0,
      sourceStatus: "missing",
    },
  });
  if (
    missingHonest.allowed &&
    missingHonest.code === "MISSING" &&
    missingHonest.countsInDenominator === false
  ) {
    details.push(
      "evaluateMetricForHonestDenominator missing → MISSING; excluded from denominator",
    );
  } else {
    passed = false;
    details.push(
      `missing honest denominator unexpectedly ${JSON.stringify(missingHonest)}`,
    );
  }

  // T2. Non-finite measured inputs → missing (not zero / not in denominator).
  const nonFiniteObs = classifyMetric({
    metricId: "fixture-nan-metric",
    value: Number.NaN,
    sampleSize: 10,
    sourceStatus: "ok",
  });
  if (nonFiniteObs.kind === "missing" && nonFiniteObs.reason === "non_finite") {
    details.push("non_finite value → missing (not measured/zero pass)");
  } else {
    passed = false;
    details.push(
      `non_finite classify unexpectedly ${JSON.stringify(nonFiniteObs)}`,
    );
  }
  const nonFiniteHonest = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-nan-metric",
      value: Number.NaN,
      sampleSize: 10,
      sourceStatus: "ok",
    },
  });
  if (
    nonFiniteHonest.allowed &&
    nonFiniteHonest.code === "MISSING" &&
    nonFiniteHonest.countsInDenominator === false
  ) {
    details.push(
      "evaluateMetricForHonestDenominator non_finite → MISSING; excluded from denominator",
    );
  } else {
    passed = false;
    details.push(
      `non_finite honest denominator unexpectedly ${JSON.stringify(nonFiniteHonest)}`,
    );
  }

  // T3. Insufficient sample → missing (not pass/zero in denominator).
  const thinSample = classifyMetric({
    metricId: "fixture-thin-batch",
    value: 0.25,
    sampleSize: 0,
    sourceStatus: "ok",
  });
  if (
    thinSample.kind === "missing" &&
    thinSample.reason === "insufficient_sample"
  ) {
    details.push("insufficient_sample → missing (not measured/zero pass)");
  } else {
    passed = false;
    details.push(`insufficient_sample classify ${JSON.stringify(thinSample)}`);
  }
  const thinHonest = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-thin-batch",
      value: 0.25,
      sampleSize: 0,
      sourceStatus: "ok",
    },
  });
  if (
    thinHonest.allowed &&
    thinHonest.code === "MISSING" &&
    thinHonest.countsInDenominator === false
  ) {
    details.push(
      "evaluateMetricForHonestDenominator insufficient_sample → MISSING; excluded from denominator",
    );
  } else {
    passed = false;
    details.push(
      `insufficient_sample honest denominator ${JSON.stringify(thinHonest)}`,
    );
  }

  // T4. Unsupported / partial → unavailable (not zero pass / not in denominator).
  const unsupportedObs = classifyMetric({
    metricId: "fixture-unsupported",
    value: 1,
    sampleSize: 10,
    sourceStatus: "unsupported",
  });
  if (
    unsupportedObs.kind === "unavailable" &&
    unsupportedObs.reason === "unsupported"
  ) {
    details.push("unsupported → unavailable (not measured/zero pass)");
  } else {
    passed = false;
    details.push(`unsupported classify ${JSON.stringify(unsupportedObs)}`);
  }
  const unsupportedHonest = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-unsupported",
      value: 1,
      sampleSize: 10,
      sourceStatus: "unsupported",
    },
  });
  if (
    unsupportedHonest.allowed &&
    unsupportedHonest.code === "UNAVAILABLE_UNSUPPORTED" &&
    unsupportedHonest.countsInDenominator === false
  ) {
    details.push(
      "evaluateMetricForHonestDenominator unsupported → UNAVAILABLE_UNSUPPORTED; excluded",
    );
  } else {
    passed = false;
    details.push(`unsupported honest ${JSON.stringify(unsupportedHonest)}`);
  }

  const partialObs = classifyMetric({
    metricId: "fixture-partial",
    value: 0.2,
    sampleSize: 3,
    sourceStatus: "partial",
  });
  if (partialObs.kind === "unavailable" && partialObs.reason === "partial") {
    details.push("partial → unavailable (not measured/zero pass)");
  } else {
    passed = false;
    details.push(`partial classify ${JSON.stringify(partialObs)}`);
  }
  const partialHonest = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-partial",
      value: 0.2,
      sampleSize: 3,
      sourceStatus: "partial",
    },
  });
  if (
    partialHonest.allowed &&
    partialHonest.code === "UNAVAILABLE_PARTIAL" &&
    partialHonest.countsInDenominator === false
  ) {
    details.push(
      "evaluateMetricForHonestDenominator partial → UNAVAILABLE_PARTIAL; excluded",
    );
  } else {
    passed = false;
    details.push(`partial honest ${JSON.stringify(partialHonest)}`);
  }

  // T5. Measured in denominator; synthetic EXCLUDED_SYNTHETIC; null sampleSize → non_finite.
  const measuredHonest = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-measured-batch",
      value: 0.75,
      sampleSize: 20,
      sourceStatus: "ok",
    },
  });
  if (
    measuredHonest.allowed &&
    measuredHonest.code === "MEASURED" &&
    measuredHonest.countsInDenominator === true
  ) {
    details.push(
      "evaluateMetricForHonestDenominator ok → MEASURED; countsInDenominator=true",
    );
  } else {
    passed = false;
    details.push(`measured honest unexpectedly ${JSON.stringify(measuredHonest)}`);
  }

  const syntheticHonest = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-synthetic-honest",
      value: 1,
      sampleSize: 5,
      sourceStatus: "synthetic",
    },
  });
  if (
    syntheticHonest.allowed &&
    syntheticHonest.code === "EXCLUDED_SYNTHETIC" &&
    syntheticHonest.countsInDenominator === false
  ) {
    details.push(
      "evaluateMetricForHonestDenominator synthetic → EXCLUDED_SYNTHETIC; excluded from denominator",
    );
  } else {
    passed = false;
    details.push(`synthetic honest unexpectedly ${JSON.stringify(syntheticHonest)}`);
  }

  const nullSample = classifyMetric({
    metricId: "fixture-null-sample",
    value: 0.5,
    sampleSize: null,
    sourceStatus: "ok",
  });
  if (nullSample.kind === "missing" && nullSample.reason === "non_finite") {
    details.push("null sampleSize on ok → non_finite missing (not measured/zero pass)");
  } else {
    passed = false;
    details.push(`null sampleSize classify unexpectedly ${JSON.stringify(nullSample)}`);
  }

  // T6. Refuse unavailable-as-zero on unsupported/partial; missingCount in summary.
  const unsupportedAsZero = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-unsupported-zero",
      value: 0,
      sampleSize: 10,
      sourceStatus: "unsupported",
    },
    treatUnavailableAsZero: true,
  });
  if (
    !unsupportedAsZero.allowed &&
    unsupportedAsZero.code === "UNAVAILABLE_AS_ZERO_REFUSED" &&
    unsupportedAsZero.countsInDenominator === false
  ) {
    details.push(
      "treatUnavailableAsZero on unsupported → UNAVAILABLE_AS_ZERO_REFUSED",
    );
  } else {
    passed = false;
    details.push(`unsupported-as-zero ${JSON.stringify(unsupportedAsZero)}`);
  }

  const partialAsZero = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-partial-zero",
      value: 0,
      sampleSize: 3,
      sourceStatus: "partial",
    },
    treatUnavailableAsZero: true,
  });
  if (
    !partialAsZero.allowed &&
    partialAsZero.code === "UNAVAILABLE_AS_ZERO_REFUSED"
  ) {
    details.push(
      "treatUnavailableAsZero on partial → UNAVAILABLE_AS_ZERO_REFUSED",
    );
  } else {
    passed = false;
    details.push(`partial-as-zero ${JSON.stringify(partialAsZero)}`);
  }

  const missingSummary = summarizeHonestMetricDenominator([
    {
      metricId: "fix-ok",
      value: 1,
      sampleSize: 50,
      sourceStatus: "ok",
    },
    {
      metricId: "fix-miss",
      value: null,
      sampleSize: 0,
      sourceStatus: "missing",
    },
    {
      metricId: "fix-thin",
      value: 0.1,
      sampleSize: 0,
      sourceStatus: "ok",
    },
  ]);
  if (
    missingSummary.measuredCount === 1 &&
    missingSummary.missingCount === 2 &&
    missingSummary.denominator === 50
  ) {
    details.push(
      "summarizeHonestMetricDenominator missingCount=2; denominator=50 (missing batches excluded)",
    );
  } else {
    passed = false;
    details.push(`missing summary ${JSON.stringify(missingSummary)}`);
  }

  // T7. Custom minSample threshold — thin batches stay MISSING, not zero pass.
  const thinMinSample = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-min-sample-thin",
      value: 0.33,
      sampleSize: 3,
      sourceStatus: "ok",
    },
    minSample: 5,
  });
  if (
    thinMinSample.allowed &&
    thinMinSample.code === "MISSING" &&
    thinMinSample.countsInDenominator === false
  ) {
    details.push(
      "evaluateMetricForHonestDenominator minSample=5 sampleSize=3 → MISSING insufficient_sample",
    );
  } else {
    passed = false;
    details.push(`minSample thin ${JSON.stringify(thinMinSample)}`);
  }

  const thickMinSample = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-min-sample-ok",
      value: 0.8,
      sampleSize: 5,
      sourceStatus: "ok",
    },
    minSample: 5,
  });
  if (
    thickMinSample.allowed &&
    thickMinSample.code === "MEASURED" &&
    thickMinSample.countsInDenominator === true
  ) {
    details.push(
      "evaluateMetricForHonestDenominator minSample=5 sampleSize=5 → MEASURED",
    );
  } else {
    passed = false;
    details.push(`minSample ok ${JSON.stringify(thickMinSample)}`);
  }

  const batchMinSummary = summarizeHonestMetricDenominator(
    [
      {
        metricId: "batch-a",
        value: 1,
        sampleSize: 10,
        sourceStatus: "ok",
      },
      {
        metricId: "batch-b",
        value: 0.2,
        sampleSize: 4,
        sourceStatus: "ok",
      },
    ],
    5,
  );
  if (
    batchMinSummary.measuredCount === 1 &&
    batchMinSummary.missingCount === 1 &&
    batchMinSummary.denominator === 10
  ) {
    details.push(
      "summarizeHonestMetricDenominator minSample=5 → denominator=10 (thin batch excluded)",
    );
  } else {
    passed = false;
    details.push(`minSample summary ${JSON.stringify(batchMinSummary)}`);
  }

  // T8. Non-finite minSample → MISSING; unavailableCount in summary.
  const badMin = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-bad-min",
      value: 0.9,
      sampleSize: 10,
      sourceStatus: "ok",
    },
    minSample: Number.NaN,
  });
  if (
    badMin.allowed &&
    badMin.code === "MISSING" &&
    badMin.classification?.kind === "missing" &&
    badMin.classification.reason === "non_finite"
  ) {
    details.push(
      "evaluateMetricForHonestDenominator non-finite minSample → MISSING non_finite",
    );
  } else {
    passed = false;
    details.push(`non-finite minSample ${JSON.stringify(badMin)}`);
  }

  const unavailableSummary = summarizeHonestMetricDenominator([
    {
      metricId: "fix-ok",
      value: 1,
      sampleSize: 5,
      sourceStatus: "ok",
    },
    {
      metricId: "fix-err",
      value: 0,
      sampleSize: 10,
      sourceStatus: "provider_error",
    },
    {
      metricId: "fix-unsup",
      value: 0,
      sampleSize: 3,
      sourceStatus: "unsupported",
    },
  ]);
  if (
    unavailableSummary.measuredCount === 1 &&
    unavailableSummary.unavailableCount === 2 &&
    unavailableSummary.denominator === 5
  ) {
    details.push(
      "summarizeHonestMetricDenominator unavailableCount=2; denominator=5 (unavailable excluded)",
    );
  } else {
    passed = false;
    details.push(`unavailable summary ${JSON.stringify(unavailableSummary)}`);
  }

  // T9. excludedCount aggregate — synthetics never in denominator.
  const excludedSummary = summarizeHonestMetricDenominator([
    {
      metricId: "fix-measured",
      value: 0.6,
      sampleSize: 12,
      sourceStatus: "ok",
    },
    {
      metricId: "fix-syn-1",
      value: 1,
      sampleSize: 2,
      sourceStatus: "synthetic",
    },
    {
      metricId: "fix-syn-2",
      value: 1,
      sampleSize: 1,
      sourceStatus: "synthetic",
    },
  ]);
  if (
    excludedSummary.measuredCount === 1 &&
    excludedSummary.excludedCount === 2 &&
    excludedSummary.denominator === 12 &&
    excludedSummary.liveMetricsWiring === "NOT_WIRED"
  ) {
    details.push(
      "summarizeHonestMetricDenominator excludedCount=2; denominator=12 (synthetics excluded)",
    );
  } else {
    passed = false;
    details.push(`excluded summary ${JSON.stringify(excludedSummary)}`);
  }

  // T10. All-bucket aggregate edge + ±Infinity non_finite (never in denominator).
  const posInf = classifyMetric({
    metricId: "fixture-pos-inf",
    value: Number.POSITIVE_INFINITY,
    sampleSize: 10,
    sourceStatus: "ok",
  });
  const negInf = classifyMetric({
    metricId: "fixture-neg-inf",
    value: Number.NEGATIVE_INFINITY,
    sampleSize: 10,
    sourceStatus: "ok",
  });
  if (
    posInf.kind === "missing" &&
    posInf.reason === "non_finite" &&
    negInf.kind === "missing" &&
    negInf.reason === "non_finite"
  ) {
    details.push("±Infinity value → non_finite missing (not measured/zero pass)");
  } else {
    passed = false;
    details.push(`infinity classify pos=${JSON.stringify(posInf)} neg=${JSON.stringify(negInf)}`);
  }

  const t10Summary = summarizeHonestMetricDenominator([
    {
      metricId: "t10-measured",
      value: 0.9,
      sampleSize: 7,
      sourceStatus: "ok",
    },
    {
      metricId: "t10-partial",
      value: 0.5,
      sampleSize: 4,
      sourceStatus: "partial",
    },
    {
      metricId: "t10-thin",
      value: 0.1,
      sampleSize: 0,
      sourceStatus: "ok",
    },
    {
      metricId: "t10-syn",
      value: 1,
      sampleSize: 1,
      sourceStatus: "synthetic",
    },
    {
      metricId: "t10-err",
      value: 0,
      sampleSize: 12,
      sourceStatus: "provider_error",
    },
  ]);
  if (
    t10Summary.measuredCount === 1 &&
    t10Summary.unavailableCount === 2 &&
    t10Summary.excludedCount === 1 &&
    t10Summary.missingCount === 1 &&
    t10Summary.denominator === 7 &&
    t10Summary.liveMetricsWiring === "NOT_WIRED"
  ) {
    details.push(
      "T10 all-bucket summarize: partial+insufficient+synthetic+provider_error excluded; denominator=7",
    );
  } else {
    passed = false;
    details.push(`T10 all-bucket summary ${JSON.stringify(t10Summary)}`);
  }

  // T11. Empty batch + negative sampleSize never inflate denominator.
  const emptySummary = summarizeHonestMetricDenominator([]);
  if (
    emptySummary.measuredCount === 0 &&
    emptySummary.unavailableCount === 0 &&
    emptySummary.excludedCount === 0 &&
    emptySummary.missingCount === 0 &&
    emptySummary.denominator === 0 &&
    emptySummary.liveMetricsWiring === "NOT_WIRED"
  ) {
    details.push(
      "summarizeHonestMetricDenominator empty batch → denominator=0 (no zero-fill)",
    );
  } else {
    passed = false;
    details.push(`empty summary ${JSON.stringify(emptySummary)}`);
  }

  const negSample = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-neg-sample",
      value: 0.4,
      sampleSize: -5,
      sourceStatus: "ok",
    },
  });
  if (
    negSample.allowed &&
    negSample.code === "MISSING" &&
    negSample.countsInDenominator === false &&
    negSample.classification?.kind === "missing" &&
    negSample.classification.reason === "insufficient_sample"
  ) {
    details.push(
      "negative sampleSize → MISSING insufficient_sample; excluded from denominator",
    );
  } else {
    passed = false;
    details.push(`negative sampleSize ${JSON.stringify(negSample)}`);
  }

  // T12. NaN sampleSize in batch never enters denominator.
  const nanSampleClass = classifyMetric({
    metricId: "fixture-nan-sample",
    value: 0.7,
    sampleSize: Number.NaN,
    sourceStatus: "ok",
  });
  if (nanSampleClass.kind === "missing" && nanSampleClass.reason === "non_finite") {
    details.push("NaN sampleSize → non_finite missing (not in denominator)");
  } else {
    passed = false;
    details.push(`NaN sampleSize classify ${JSON.stringify(nanSampleClass)}`);
  }
  const nanSampleSummary = summarizeHonestMetricDenominator([
    {
      metricId: "t12-ok",
      value: 0.5,
      sampleSize: 11,
      sourceStatus: "ok",
    },
    {
      metricId: "t12-nan-n",
      value: 0.2,
      sampleSize: Number.NaN,
      sourceStatus: "ok",
    },
  ]);
  if (
    nanSampleSummary.measuredCount === 1 &&
    nanSampleSummary.missingCount === 1 &&
    nanSampleSummary.denominator === 11
  ) {
    details.push(
      "summarizeHonestMetricDenominator NaN sampleSize excluded; denominator=11",
    );
  } else {
    passed = false;
    details.push(`NaN sampleSize summary ${JSON.stringify(nanSampleSummary)}`);
  }

  // T13. minSample=0 measured sampleSize=0 adds zero to denominator (no inflation).
  const zeroMin = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-zero-min",
      value: 0.5,
      sampleSize: 0,
      sourceStatus: "ok",
    },
    minSample: 0,
  });
  if (
    zeroMin.allowed &&
    zeroMin.code === "MEASURED" &&
    zeroMin.countsInDenominator === true
  ) {
    details.push("minSample=0 sampleSize=0 → MEASURED; zero weight in denominator");
  } else {
    passed = false;
    details.push(`zero minSample ${JSON.stringify(zeroMin)}`);
  }
  const zeroMinSummary = summarizeHonestMetricDenominator(
    [
      {
        metricId: "t13-ok",
        value: 1,
        sampleSize: 8,
        sourceStatus: "ok",
      },
      {
        metricId: "t13-zero",
        value: 0.5,
        sampleSize: 0,
        sourceStatus: "ok",
      },
    ],
    0,
  );
  if (
    zeroMinSummary.measuredCount === 2 &&
    zeroMinSummary.denominator === 8
  ) {
    details.push(
      "summarizeHonestMetricDenominator minSample=0: sampleSize=0 adds 0; denominator=8",
    );
  } else {
    passed = false;
    details.push(`zero minSample summary ${JSON.stringify(zeroMinSummary)}`);
  }

  // T15. Unsupported-only batch — large sampleSize never enters denominator.
  const unsupportedOnlySummary = summarizeHonestMetricDenominator([
    {
      metricId: "t15-u1",
      value: 0.9,
      sampleSize: 10_000,
      sourceStatus: "unsupported",
    },
    {
      metricId: "t15-u2",
      value: 0.1,
      sampleSize: 50_000,
      sourceStatus: "unsupported",
    },
  ]);
  if (
    unsupportedOnlySummary.measuredCount === 0 &&
    unsupportedOnlySummary.unavailableCount === 2 &&
    unsupportedOnlySummary.denominator === 0
  ) {
    details.push(
      "summarizeHonestMetricDenominator unsupported-only batch → denominator=0 (sampleSize ignored)",
    );
  } else {
    passed = false;
    details.push(
      `unsupported-only summary ${JSON.stringify(unsupportedOnlySummary)}`,
    );
  }
  const providerErrAsZero = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "t15-err-zero",
      value: 0,
      sampleSize: 20,
      sourceStatus: "provider_error",
    },
    treatUnavailableAsZero: true,
  });
  if (
    !providerErrAsZero.allowed &&
    providerErrAsZero.code === "UNAVAILABLE_AS_ZERO_REFUSED" &&
    providerErrAsZero.countsInDenominator === false
  ) {
    details.push(
      "treatUnavailableAsZero on provider_error → UNAVAILABLE_AS_ZERO_REFUSED",
    );
  } else {
    passed = false;
    details.push(`provider_error-as-zero ${JSON.stringify(providerErrAsZero)}`);
  }

  // T16. Partial-only batch — unavailable sampleSize never enters denominator.
  const partialOnlySummary = summarizeHonestMetricDenominator([
    {
      metricId: "t16-p1",
      value: 0.8,
      sampleSize: 25_000,
      sourceStatus: "partial",
    },
    {
      metricId: "t16-p2",
      value: 0.2,
      sampleSize: 9_999,
      sourceStatus: "partial",
    },
  ]);
  if (
    partialOnlySummary.measuredCount === 0 &&
    partialOnlySummary.unavailableCount === 2 &&
    partialOnlySummary.denominator === 0
  ) {
    details.push(
      "summarizeHonestMetricDenominator partial-only batch → denominator=0 (sampleSize ignored)",
    );
  } else {
    passed = false;
    details.push(`partial-only summary ${JSON.stringify(partialOnlySummary)}`);
  }
  // T17. provider_error-only batch — error sampleSize never zero-fills denominator.
  const providerOnlySummary = summarizeHonestMetricDenominator([
    {
      metricId: "t17-e1",
      value: 0,
      sampleSize: 88_888,
      sourceStatus: "provider_error",
    },
    {
      metricId: "t17-e2",
      value: 0.9,
      sampleSize: 12_345,
      sourceStatus: "provider_error",
    },
  ]);
  if (
    providerOnlySummary.measuredCount === 0 &&
    providerOnlySummary.unavailableCount === 2 &&
    providerOnlySummary.denominator === 0
  ) {
    details.push(
      "summarizeHonestMetricDenominator provider_error-only batch → denominator=0 (sampleSize ignored)",
    );
  } else {
    passed = false;
    details.push(
      `provider_error-only summary ${JSON.stringify(providerOnlySummary)}`,
    );
  }

  // T14. No measured batches → denominator=0 (never zero-filled from errors).
  const noMeasuredSummary = summarizeHonestMetricDenominator([
    {
      metricId: "t14-miss",
      value: null,
      sampleSize: 0,
      sourceStatus: "missing",
    },
    {
      metricId: "t14-err",
      value: 0,
      sampleSize: 10,
      sourceStatus: "provider_error",
    },
    {
      metricId: "t14-syn",
      value: 1,
      sampleSize: 1,
      sourceStatus: "synthetic",
    },
    {
      metricId: "t14-part",
      value: 0.3,
      sampleSize: 4,
      sourceStatus: "partial",
    },
  ]);
  if (
    noMeasuredSummary.measuredCount === 0 &&
    noMeasuredSummary.missingCount === 1 &&
    noMeasuredSummary.unavailableCount === 2 &&
    noMeasuredSummary.excludedCount === 1 &&
    noMeasuredSummary.denominator === 0 &&
    noMeasuredSummary.liveMetricsWiring === "NOT_WIRED"
  ) {
    details.push(
      "summarizeHonestMetricDenominator no-measured batch → denominator=0 (no zero-fill)",
    );
  } else {
    passed = false;
    details.push(`no-measured summary ${JSON.stringify(noMeasuredSummary)}`);
  }

  // T-US-058: synthetic metric excluded from denominators.
  const syntheticMetric = classifyMetric({
    metricId: "fixture-conversion-rate",
    value: 1,
    sampleSize: 1,
    sourceStatus: "synthetic",
  });
  if (
    syntheticMetric.kind === "excluded" &&
    syntheticMetric.reason === "synthetic"
  ) {
    details.push("synthetic metric → excluded");
  } else {
    passed = false;
    details.push(
      `synthetic metric classification unexpectedly ${JSON.stringify(syntheticMetric)}`,
    );
  }

  // Synthetic lead flagged + commercial assert.
  const lead = createSyntheticLead({ correlationId: `canary-${randomUUID().slice(0, 8)}` });
  try {
    assertSyntheticExcludedFromCommercial(lead);
    details.push("createSyntheticLead synthetic=true + assertCommercial exclusion");
  } catch (err) {
    passed = false;
    details.push(
      `assertSyntheticExcludedFromCommercial failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Commerce projection excludes synthetics; refuse countedInCommerce on synthetic.
  let state = emptyLeadCaptureState(nowIso);
  state = appendCommerceLead(
    state,
    {
      recordId: "rec-commercial-1",
      synthetic: false,
      revenueMinor: 2500,
      countedInCommerce: true,
    },
    nowIso,
  );
  state = appendCommerceLead(
    state,
    {
      recordId: "rec-synthetic-1",
      synthetic: true,
      revenueMinor: 9999,
      countedInCommerce: false,
    },
    nowIso,
  );
  const totals = projectCommerceTotals(state.commerceLeads);
  if (
    totals.leadCount === 1 &&
    totals.revenueMinor === 2500 &&
    totals.syntheticExcludedCount === 1
  ) {
    details.push(
      "projectCommerceTotals excludes synthetic (leadCount=1, revenue=2500, syntheticExcluded=1)",
    );
  } else {
    passed = false;
    details.push(`commerce totals unexpectedly ${JSON.stringify(totals)}`);
  }

  let refusedSyntheticCommerce = false;
  try {
    appendCommerceLead(
      state,
      {
        recordId: "rec-bad-synthetic",
        synthetic: true,
        revenueMinor: 100,
        countedInCommerce: true,
      },
      nowIso,
    );
  } catch {
    refusedSyntheticCommerce = true;
  }
  if (refusedSyntheticCommerce) {
    details.push("appendCommerceLead refuses synthetic && countedInCommerce");
  } else {
    passed = false;
    details.push("appendCommerceLead unexpectedly accepted synthetic countedInCommerce");
  }

  // Honest evaluator: provider_error out of denom; refuse unavailable-as-zero.
  const honestProvider = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-eval-pass-rate",
      value: 0,
      sampleSize: 10,
      sourceStatus: "provider_error",
    },
  });
  if (
    honestProvider.allowed &&
    honestProvider.code === "UNAVAILABLE_PROVIDER_ERROR" &&
    honestProvider.countsInDenominator === false &&
    honestProvider.liveMetricsWiring === "NOT_WIRED" &&
    honestProvider.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "evaluateMetricForHonestDenominator provider_error → UNAVAILABLE_PROVIDER_ERROR; liveMetricsWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `honest provider_error unexpectedly ${JSON.stringify(honestProvider)}`,
    );
  }

  const asZero = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-eval-pass-rate",
      value: 0,
      sampleSize: 10,
      sourceStatus: "provider_error",
    },
    treatUnavailableAsZero: true,
  });
  if (
    !asZero.allowed &&
    asZero.code === "UNAVAILABLE_AS_ZERO_REFUSED" &&
    asZero.countsInDenominator === false
  ) {
    details.push(
      "treatUnavailableAsZero → UNAVAILABLE_AS_ZERO_REFUSED (not measured zero)",
    );
  } else {
    passed = false;
    details.push(`unavailable-as-zero unexpectedly ${JSON.stringify(asZero)}`);
  }

  // Live VERIFIED / live metrics wire refused.
  const liveVerified = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-eval-pass-rate",
      value: 0.9,
      sampleSize: 10,
      sourceStatus: "ok",
    },
    claimLiveVerified: true,
  });
  const liveWire = evaluateMetricForHonestDenominator({
    observation: {
      metricId: "fixture-eval-pass-rate",
      value: 0.9,
      sampleSize: 10,
      sourceStatus: "ok",
    },
    requestLiveMetricsWire: true,
  });
  if (
    !liveVerified.allowed &&
    liveVerified.code === "LIVE_METRICS_CLAIM_REFUSED" &&
    !liveWire.allowed &&
    liveWire.code === "LIVE_METRICS_CLAIM_REFUSED" &&
    liveWire.liveMetricsWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimLiveVerified / requestLiveMetricsWire → LIVE_METRICS_CLAIM_REFUSED (NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `live claims unexpectedly verified=${JSON.stringify(liveVerified)} wire=${JSON.stringify(liveWire)}`,
    );
  }

  // Measured sampleSize-sum pass-rate denominator (batches weighted).
  const summary = summarizeHonestMetricDenominator([
    {
      metricId: "ok-a",
      value: 1,
      sampleSize: 100,
      sourceStatus: "ok",
    },
    {
      metricId: "ok-b",
      value: 0,
      sampleSize: 1,
      sourceStatus: "ok",
    },
    {
      metricId: "err",
      value: 0,
      sampleSize: 10,
      sourceStatus: "provider_error",
    },
    {
      metricId: "syn",
      value: 1,
      sampleSize: 1,
      sourceStatus: "synthetic",
    },
    {
      metricId: "nan",
      value: Number.NaN,
      sampleSize: 5,
      sourceStatus: "ok",
    },
  ]);
  if (
    summary.measuredCount === 2 &&
    summary.unavailableCount === 1 &&
    summary.excludedCount === 1 &&
    summary.missingCount === 1 &&
    summary.denominator === 101 &&
    summary.liveMetricsWiring === "NOT_WIRED" &&
    summary.externalEffects === "NONE"
  ) {
    details.push(
      "summarizeHonestMetricDenominator → sampleSize-sum denominator=101 (provider_error+synthetic+non_finite excluded)",
    );
  } else {
    passed = false;
    details.push(`honest summary unexpectedly ${JSON.stringify(summary)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveMetricsWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-metric-denom-${randomUUID()}`,
    kind: SoakProofKind.METRIC_DENOMINATORS_HONEST,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-metric-denom-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
