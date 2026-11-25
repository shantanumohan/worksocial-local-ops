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
