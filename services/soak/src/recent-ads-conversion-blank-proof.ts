/**
 * Fixture proof for T-X036 — recent Ads conversion blank → PENDING,
 * not a false zero. Budget recs stay blocked while pending.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  AdsConversionFreshness,
  AnalyticsEnvironment,
  DeliveryDiagnosisKind,
  PaidChangeKind,
  PaidMediaPlatform,
  SoakProofKind,
  classifyRecentAdsConversion,
  createPaidMediaProposal,
  diagnoseDelivery,
  evaluateRecentAdsConversionAttackSuite,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X036 fixture ACCEPTED.
 */
export function proofRecentAdsConversionBlankPending(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Blank/omitted conversion cell → PENDING, displayValue null (not 0).
  const blank = classifyRecentAdsConversion({
    campaignId: "camp-fixture-blank",
    conversions: null,
    blank: true,
    attributionSettled: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    blank.freshness === AdsConversionFreshness.PENDING &&
    blank.displayValue === null &&
    blank.conversions.kind === "missing" &&
    blank.liveProviderWiring === "NOT_WIRED" &&
    blank.externalEffects === "NONE" &&
    /PENDING|not false zero/i.test(blank.reasons.join(" "))
  ) {
    details.push(
      "Blank Ads conversion → PENDING (displayValue null, not zero) NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Blank classification unexpectedly ${JSON.stringify(blank)}`);
  }

  // Null conversions without blank flag still PENDING — never invent 0.
  const omitted = classifyRecentAdsConversion({
    campaignId: "camp-fixture-omitted",
    conversions: null,
    blank: false,
    attributionSettled: true,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    omitted.freshness === AdsConversionFreshness.PENDING &&
    omitted.displayValue === null
  ) {
    details.push("Omitted null conversions → PENDING (not invented zero)");
  } else {
    passed = false;
    details.push(
      `Omitted classification unexpectedly ${JSON.stringify(omitted)}`,
    );
  }

  // Unsettled attribution with numeric 0 still PENDING (not settled zero).
  const unsettled = classifyRecentAdsConversion({
    campaignId: "camp-fixture-unsettled",
    conversions: 0,
    blank: false,
    attributionSettled: false,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    unsettled.freshness === AdsConversionFreshness.PENDING &&
    unsettled.displayValue === null
  ) {
    details.push(
      "Unsettled attribution with 0 → PENDING (not settled false-zero claim)",
    );
  } else {
    passed = false;
    details.push(
      `Unsettled classification unexpectedly ${JSON.stringify(unsettled)}`,
    );
  }

  // Positive control: settled fixture zero is honest measured 0.
  const settledZero = classifyRecentAdsConversion({
    campaignId: "camp-fixture-settled-zero",
    conversions: 0,
    blank: false,
    attributionSettled: true,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (
    settledZero.freshness === AdsConversionFreshness.FIXTURE &&
    settledZero.displayValue === 0 &&
    settledZero.conversions.kind === "measured"
  ) {
    details.push(
      "Settled fixture zero → honest measured 0 (distinct from blank)",
    );
  } else {
    passed = false;
    details.push(
      `Settled-zero classification unexpectedly ${JSON.stringify(settledZero)}`,
    );
  }

  // NOT_WIRED / LIVE / UNAVAILABLE stay unavailable — distinct from pending blank.
  const notWired = classifyRecentAdsConversion({
    campaignId: "camp-not-wired",
    conversions: 5,
    blank: false,
    attributionSettled: true,
    environment: AnalyticsEnvironment.NOT_WIRED,
  });
  if (notWired.freshness === AdsConversionFreshness.UNAVAILABLE) {
    details.push("NOT_WIRED Ads → unavailable (distinct from PENDING blank)");
  } else {
    passed = false;
    details.push(
      `NOT_WIRED classification unexpectedly ${JSON.stringify(notWired)}`,
    );
  }

  const liveRefused = classifyRecentAdsConversion({
    campaignId: "camp-live-refused",
    conversions: 4,
    blank: false,
    attributionSettled: true,
    environment: AnalyticsEnvironment.LIVE,
  });
  if (
    liveRefused.freshness === AdsConversionFreshness.UNAVAILABLE &&
    liveRefused.displayValue === null &&
    liveRefused.conversions.kind === "unavailable" &&
    /LIVE|NOT_WIRED/i.test(liveRefused.reasons.join(" "))
  ) {
    details.push(
      "LIVE Ads conversion refused while transport NOT_WIRED (no false live claim)",
    );
  } else {
    passed = false;
    details.push(
      `LIVE refusal unexpectedly ${JSON.stringify(liveRefused)}`,
    );
  }

  const sandbox = classifyRecentAdsConversion({
    campaignId: "camp-sandbox",
    conversions: 2,
    blank: false,
    attributionSettled: true,
    environment: AnalyticsEnvironment.SANDBOX,
  });
  if (
    sandbox.freshness === AdsConversionFreshness.SANDBOX &&
    sandbox.displayValue === 2 &&
    sandbox.conversions.kind === "measured"
  ) {
    details.push("SANDBOX Ads conversion preserves sandbox provenance");
  } else {
    passed = false;
    details.push(`SANDBOX classification unexpectedly ${JSON.stringify(sandbox)}`);
  }

  const unavailable = classifyRecentAdsConversion({
    campaignId: "camp-unavailable",
    conversions: 9,
    blank: false,
    attributionSettled: true,
    environment: AnalyticsEnvironment.UNAVAILABLE,
  });
  if (
    unavailable.freshness === AdsConversionFreshness.UNAVAILABLE &&
    unavailable.displayValue === null &&
    unavailable.conversions.kind === "unavailable"
  ) {
    details.push(
      "UNAVAILABLE Ads observation → unavailable (not SETTLED data claim)",
    );
  } else {
    passed = false;
    details.push(
      `UNAVAILABLE classification unexpectedly ${JSON.stringify(unavailable)}`,
    );
  }

  // Delivery diagnosis + budget proposal blocked while attribution pending.
  const delayed = diagnoseDelivery({
    impressions: 1200,
    clicks: 48,
    eventsPresent: true,
    attributionSettled: false,
    sameDaySpendComplete: false,
  });
  if (delayed.kind === DeliveryDiagnosisKind.DELAYED_ATTRIBUTION) {
    details.push("diagnoseDelivery → DELAYED_ATTRIBUTION while unsettled");
  } else {
    passed = false;
    details.push(`Expected DELAYED_ATTRIBUTION, got ${delayed.kind}`);
  }

  const financialDiff = {
    currency: "USD",
    dailyBudgetBeforeMinor: 5000,
    dailyBudgetAfterMinor: 6000,
    lifetimeImpactMinor: null as number | null,
    sharedBudgetAffected: false,
    sharedBudgetImpactKnown: true,
    notes: [] as string[],
  };

  const blocked = createPaidMediaProposal({
    proposalId: `p-ads-blank-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: "acct-fixture",
    campaignId: "camp-fixture-blank",
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise budget on recent conversions",
    exactChange: "+$10/day",
    risk: "Overspend on unsettled attribution",
    alternative: "Hold until conversions settle",
    diagnosis: delayed,
    financialDiff,
    createdAtIso: nowIso,
  });
  if (!blocked.ok && blocked.code === "PARTIAL_SPEND") {
    details.push(
      "Budget recommendation blocked while recent conversion PENDING (PARTIAL_SPEND)",
    );
  } else {
    passed = false;
    details.push(
      `Expected PARTIAL_SPEND block, got ${JSON.stringify(blocked)}`,
    );
  }

  // Zero-delivery unsettled path: NO_IMPRESSIONS still blocks budget adjust.
  const noImpressions = diagnoseDelivery({
    impressions: 0,
    clicks: 0,
    eventsPresent: false,
    attributionSettled: false,
    sameDaySpendComplete: false,
  });
  if (noImpressions.kind === DeliveryDiagnosisKind.NO_IMPRESSIONS) {
    details.push(
      "Zero impressions + unsettled → NO_IMPRESSIONS (delivery before conversion)",
    );
  } else {
    passed = false;
    details.push(`Expected NO_IMPRESSIONS, got ${noImpressions.kind}`);
  }
  const blockedZero = createPaidMediaProposal({
    proposalId: `p-ads-zero-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: "acct-fixture",
    campaignId: "camp-fixture-zero",
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise budget despite zero delivery",
    exactChange: "+$10/day",
    risk: "Unsettled attribution",
    alternative: "Hold",
    diagnosis: noImpressions,
    financialDiff,
    createdAtIso: nowIso,
  });
  if (!blockedZero.ok && blockedZero.code === "PARTIAL_SPEND") {
    details.push(
      "Budget blocked on zero-delivery unsettled path (PARTIAL_SPEND via !attributionSettled)",
    );
  } else {
    passed = false;
    details.push(
      `Expected PARTIAL_SPEND on zero-delivery unsettled, got ${JSON.stringify(blockedZero)}`,
    );
  }

  // LOW_CLICKS + unsettled likewise blocks budget.
  const lowClicks = diagnoseDelivery({
    impressions: 500,
    clicks: 0,
    eventsPresent: false,
    attributionSettled: false,
    sameDaySpendComplete: true,
  });
  if (lowClicks.kind !== DeliveryDiagnosisKind.LOW_CLICKS) {
    passed = false;
    details.push(`Expected LOW_CLICKS, got ${lowClicks.kind}`);
  }
  const blockedLow = createPaidMediaProposal({
    proposalId: `p-ads-low-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: "acct-fixture",
    campaignId: "camp-fixture-low",
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise budget with zero clicks",
    exactChange: "+$5/day",
    risk: "Unsettled",
    alternative: "Hold",
    diagnosis: lowClicks,
    financialDiff,
    createdAtIso: nowIso,
  });
  if (!blockedLow.ok && blockedLow.code === "PARTIAL_SPEND") {
    details.push(
      "Budget blocked on LOW_CLICKS unsettled path (PARTIAL_SPEND via !attributionSettled)",
    );
  } else {
    passed = false;
    details.push(
      `Expected PARTIAL_SPEND on LOW_CLICKS unsettled, got ${JSON.stringify(blockedLow)}`,
    );
  }

  // Hillclimb attack suite: blank/omitted/NaN/unsettled + honesty fields.
  const suite = evaluateRecentAdsConversionAttackSuite();
  if (suite.passed) {
    details.push(...suite.details);
  } else {
    passed = false;
    details.push(`Attack suite failed: ${suite.details.join(" | ")}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-ads-conv-blank-${randomUUID()}`,
    kind: SoakProofKind.RECENT_ADS_CONVERSION_BLANK_PENDING,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-ads-conv-blank-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
