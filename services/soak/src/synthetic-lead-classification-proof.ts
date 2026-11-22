/**
 * Fixture proof for T-US-020 — Synthetic leads classified; no commerce pollution.
 * Classification (synthetic + ws_synthetic + correlation), commerce projection
 * excludes canaries, synthetic+countedInCommerce refused, live Zoho NOT_WIRED.
 * Distinct from T-X052 (conversion contamination) and T-X050 (public flag grant).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  appendCommerceLead,
  assertSyntheticExcludedFromCommercial,
  createSyntheticLead,
  emptyLeadCaptureState,
  evaluateSyntheticLeadClassification,
  projectCommerceTotals,
  verifyCanaryCrmFields,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-020 fixture ACCEPTED.
 */
export function proofSyntheticLeadsClassifiedNoCommercePollution(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const correlationId = "corr-tus020-canary-1";

  const lead = createSyntheticLead({ correlationId });
  try {
    assertSyntheticExcludedFromCommercial(lead);
    details.push(
      "createSyntheticLead → synthetic=true; assertSyntheticExcludedFromCommercial ok",
    );
  } catch (err) {
    passed = false;
    details.push(`Synthetic assert failed: ${String(err)}`);
  }

  const classified = evaluateSyntheticLeadClassification({
    synthetic: lead.synthetic,
    wsSyntheticField: lead.fieldValues.ws_synthetic ?? null,
    correlationId,
    wsCorrelationIdField: lead.fieldValues.ws_correlation_id ?? null,
    countInCommerce: false,
    requestLiveZohoWiring: false,
  });
  if (
    classified.allowed &&
    classified.code === "SYNTHETIC_LEAD_CLASSIFIED_COMMERCIAL_EXCLUDED" &&
    classified.classified &&
    classified.commercialExcluded &&
    classified.liveZohoWiring === "NOT_WIRED" &&
    classified.externalEffects === "NONE"
  ) {
    details.push(
      "evaluateSyntheticLeadClassification → SYNTHETIC_LEAD_CLASSIFIED_COMMERCIAL_EXCLUDED",
    );
  } else {
    passed = false;
    details.push(`Classification unexpectedly ${JSON.stringify(classified)}`);
  }

  const fields = verifyCanaryCrmFields({
    correlationId,
    expected: {
      Email: lead.email,
      Last_Name: lead.displayName,
    },
    observed: lead.fieldValues,
  });
  if (fields.passed) {
    details.push("verifyCanaryCrmFields passed (ws_synthetic + correlation)");
  } else {
    passed = false;
    details.push(`CRM field verify failed: ${fields.details.join("; ")}`);
  }

  let state = emptyLeadCaptureState(nowIso);
  state = appendCommerceLead(
    state,
    {
      recordId: "rec-commercial-lead",
      synthetic: false,
      revenueMinor: 2500,
      countedInCommerce: true,
    },
    nowIso,
  );
  state = appendCommerceLead(
    state,
    {
      recordId: "rec-synthetic-canary",
      synthetic: true,
      revenueMinor: 99_999,
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
      "Commerce projection: synthetic excluded (leadCount=1, revenue=2500)",
    );
  } else {
    passed = false;
    details.push(`Commerce totals unexpectedly ${JSON.stringify(totals)}`);
  }

  const pollution = evaluateSyntheticLeadClassification({
    synthetic: true,
    wsSyntheticField: "true",
    correlationId,
    wsCorrelationIdField: correlationId,
    countInCommerce: true,
    requestLiveZohoWiring: false,
  });
  if (!pollution.allowed && pollution.code === "COMMERCE_POLLUTION_REFUSED") {
    details.push("countInCommerce on synthetic → COMMERCE_POLLUTION_REFUSED");
  } else {
    passed = false;
    details.push(`Commerce pollution unexpectedly ${JSON.stringify(pollution)}`);
  }

  try {
    appendCommerceLead(
      emptyLeadCaptureState(nowIso),
      {
        recordId: "rec-bad",
        synthetic: true,
        revenueMinor: 1,
        countedInCommerce: true,
      },
      nowIso,
    );
    passed = false;
    details.push("appendCommerceLead should refuse synthetic+countedInCommerce");
  } catch {
    details.push("appendCommerceLead refuses synthetic+countedInCommerce");
  }

  const live = evaluateSyntheticLeadClassification({
    synthetic: true,
    wsSyntheticField: "true",
    correlationId,
    wsCorrelationIdField: correlationId,
    countInCommerce: false,
    requestLiveZohoWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_ZOHO_WIRING_NOT_WIRED") {
    details.push("Live Zoho request → LIVE_ZOHO_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  const unclassified = evaluateSyntheticLeadClassification({
    synthetic: false,
    wsSyntheticField: null,
    correlationId,
    wsCorrelationIdField: correlationId,
    countInCommerce: false,
    requestLiveZohoWiring: false,
  });
  if (
    !unclassified.allowed &&
    unclassified.code === "NOT_CLASSIFIED_AS_SYNTHETIC"
  ) {
    details.push("Unclassified lead → NOT_CLASSIFIED_AS_SYNTHETIC");
  } else {
    passed = false;
    details.push(
      `Unclassified unexpectedly ${JSON.stringify(unclassified)}`,
    );
  }

  details.push(
    "ACCEPTED ≠ VERIFIED; externalEffects NONE; distinct from T-X052/T-X050",
  );

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `t-us-020-synthetic-leads-${nowIso}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
