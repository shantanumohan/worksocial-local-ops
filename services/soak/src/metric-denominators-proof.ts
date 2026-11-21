/**
 * Fixture proof for T-X039 / T-US-058 — metric denominators stay honest:
 * provider errors are unavailable (not zero/pass); synthetics are excluded
 * from business/commerce denominators. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  assertSyntheticExcludedFromCommercial,
  classifyMetric,
  createSyntheticLead,
  emptyLeadCaptureState,
  appendCommerceLead,
  projectCommerceTotals,
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

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
