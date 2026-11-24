/**
 * Fixture proof for T-X052 — Synthetic conversion contamination excluded from commerce.
 *
 * Canary / synthetic conversion rows must never inflate commerce denominators
 * (lead count, revenue). Contaminating synthetics stay ledgered for audit but
 * are projected out; synthetic+countedInCommerce is refused. Distinct from
 * T-X039/T-US-058 (metric denominators honesty bundle) and T-X050 (public flag
 * grant). External effects: NONE. Live wiring NOT_WIRED. Never invents live VERIFIED.
 * Hillclimb: syntheticExcludedRevenueMinor, defense-in-depth projection,
 * multi-contaminant, honesty stamps.
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
 * Complete expected proof set for T-X052 fixture ACCEPTED.
 */
export function proofSyntheticConversionContaminationExcluded(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Synthetic conversion metric must be excluded (not measured as commerce win).
  const conversionMetric = classifyMetric({
    metricId: "fixture-synthetic-conversion-rate",
    value: 1,
    sampleSize: 1,
    sourceStatus: "synthetic",
  });
  if (
    conversionMetric.kind === "excluded" &&
    conversionMetric.reason === "synthetic"
  ) {
    details.push(
      "synthetic conversion metric → excluded (not measured commerce win)",
    );
  } else {
    passed = false;
    details.push(
      `synthetic conversion metric unexpectedly ${JSON.stringify(conversionMetric)}`,
    );
  }

  // 2. Commercial baseline + contaminating synthetic conversion with large revenue.
  let state = emptyLeadCaptureState(nowIso);
  state = appendCommerceLead(
    state,
    {
      recordId: "rec-commercial-booking",
      synthetic: false,
      revenueMinor: 5000,
      countedInCommerce: true,
    },
    nowIso,
  );
  state = appendCommerceLead(
    state,
    {
      recordId: "rec-synthetic-conversion-contaminant",
      synthetic: true,
      revenueMinor: 99_999,
      countedInCommerce: false,
    },
    nowIso,
  );
  // Second contaminant — excluded revenue must accumulate.
  state = appendCommerceLead(
    state,
    {
      recordId: "rec-synthetic-conversion-contaminant-2",
      synthetic: true,
      revenueMinor: 1,
      countedInCommerce: false,
    },
    nowIso,
  );
  const totals = projectCommerceTotals(state.commerceLeads);
  if (
    totals.leadCount === 1 &&
    totals.revenueMinor === 5000 &&
    totals.syntheticExcludedCount === 2 &&
    totals.syntheticExcludedRevenueMinor === 100_000 &&
    totals.liveProviderWiring === "NOT_WIRED" &&
    totals.externalEffects === "NONE" &&
    totals.fixtureOnly === true
  ) {
    details.push(
      "commerce projection excludes synthetic conversion contaminants (leadCount=1, revenue=5000, syntheticExcluded=2, syntheticExcludedRevenueMinor=100000; contaminants not counted; liveProviderWiring=NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `commerce totals unexpectedly contaminated: ${JSON.stringify(totals)}`,
    );
  }

  // 3. Counterfactual: summing all ledger revenue would pollute; projection must not.
  const rawLedgerRevenue = state.commerceLeads.reduce(
    (n, row) => n + row.revenueMinor,
    0,
  );
  if (rawLedgerRevenue === 105_000 && totals.revenueMinor === 5000) {
    details.push(
      "counterfactual: raw ledger revenue 105000 ≠ commerce revenue 5000 (contamination blocked)",
    );
  } else {
    passed = false;
    details.push(
      `counterfactual mismatch raw=${rawLedgerRevenue} commerce=${totals.revenueMinor}`,
    );
  }

  // 4. Refuse synthetic marked countedInCommerce (fail closed).
  let refused = false;
  try {
    appendCommerceLead(
      state,
      {
        recordId: "rec-bad-synthetic-commerce",
        synthetic: true,
        revenueMinor: 2500,
        countedInCommerce: true,
      },
      nowIso,
    );
  } catch {
    refused = true;
  }
  if (refused) {
    details.push(
      "appendCommerceLead refuses synthetic && countedInCommerce (fail closed)",
    );
  } else {
    passed = false;
    details.push(
      "appendCommerceLead unexpectedly accepted synthetic countedInCommerce",
    );
  }

  // 5. Defense-in-depth: slipped synthetic+countedInCommerce still projected out.
  const slipped = projectCommerceTotals([
    {
      recordId: "rec-real",
      synthetic: false,
      revenueMinor: 100,
      countedInCommerce: true,
    },
    {
      recordId: "rec-slipped",
      synthetic: true,
      revenueMinor: 9_000,
      countedInCommerce: true,
    },
  ]);
  if (
    slipped.leadCount === 1 &&
    slipped.revenueMinor === 100 &&
    slipped.syntheticExcludedCount === 1 &&
    slipped.syntheticExcludedRevenueMinor === 9_000
  ) {
    details.push(
      "defense-in-depth: slipped synthetic+countedInCommerce still excluded from projection",
    );
  } else {
    passed = false;
    details.push(
      `defense-in-depth projection unexpectedly ${JSON.stringify(slipped)}`,
    );
  }

  // 6. Canary synthetic lead assert commercial exclusion.
  const lead = createSyntheticLead({
    correlationId: `canary-conv-${randomUUID().slice(0, 8)}`,
  });
  try {
    assertSyntheticExcludedFromCommercial(lead);
    details.push(
      "createSyntheticLead synthetic=true + assertSyntheticExcludedFromCommercial",
    );
  } catch (err) {
    passed = false;
    details.push(
      `assertSyntheticExcludedFromCommercial failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-synth-conv-contam-${randomUUID()}`,
    kind: SoakProofKind.SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-synth-conv-contam-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
