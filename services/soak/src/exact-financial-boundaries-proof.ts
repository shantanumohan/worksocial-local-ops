/**
 * Fixture proof for T-US-032 — Exact financial boundaries preserved.
 * Paid-media proposals require exactChange + financialDiff; incomplete
 * proposals are refused; ChatGPT Ads stays ACCESS_BLOCKED. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  DeliveryDiagnosisKind,
  PaidChangeKind,
  PaidMediaPlatform,
  PaidMediaWiring,
  SoakProofKind,
  createPaidMediaProposal,
  diagnoseDelivery,
  paidMediaChannelStatus,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-032 fixture ACCEPTED.
 */
export function proofExactFinancialBoundariesPreserved(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const diagnosis = diagnoseDelivery({
    impressions: 2500,
    clicks: 90,
    eventsPresent: true,
    attributionSettled: true,
    sameDaySpendComplete: true,
  });
  if (diagnosis.kind !== DeliveryDiagnosisKind.DELIVERY_OK) {
    passed = false;
    details.push(`settled diagnosis unexpectedly ${diagnosis.kind}`);
  }

  const financialDiff = {
    currency: "USD",
    dailyBudgetBeforeMinor: 5000,
    dailyBudgetAfterMinor: 7500,
    lifetimeImpactMinor: 0,
    sharedBudgetAffected: false,
    sharedBudgetImpactKnown: true,
    notes: ["fixture exact financial boundary"],
  };

  // Incomplete proposal without exactChange → INCOMPLETE_PROPOSAL.
  const incomplete = createPaidMediaProposal({
    proposalId: `p-incomplete-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: "acct-fixture",
    campaignId: "camp-1",
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise daily budget",
    exactChange: "   ",
    risk: "Overspend",
    alternative: "Hold",
    diagnosis,
    financialDiff,
    createdAtIso: nowIso,
  });
  if (!incomplete.ok && incomplete.code === "INCOMPLETE_PROPOSAL") {
    details.push("Blank exactChange → INCOMPLETE_PROPOSAL (exact boundary required)");
  } else {
    passed = false;
    details.push(`INCOMPLETE_PROPOSAL unexpectedly ${JSON.stringify(incomplete)}`);
  }

  // Complete Google Ads proposal preserves exactChange + financialDiff verbatim.
  const exactChange = "dailyBudgetMinor: 5000 → 7500 (+$25/day)";
  const created = createPaidMediaProposal({
    proposalId: `p-exact-${randomUUID().slice(0, 8)}`,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: "acct-fixture",
    campaignId: "camp-1",
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise daily budget for settled fixture campaign",
    exactChange,
    risk: "Overspend if conversion lag persists",
    alternative: "Hold budget; tighten keywords",
    diagnosis,
    financialDiff,
    createdAtIso: nowIso,
  });
  if (
    created.ok &&
    created.proposal.exactChange === exactChange &&
    created.proposal.financialDiff.currency === "USD" &&
    created.proposal.financialDiff.dailyBudgetBeforeMinor === 5000 &&
    created.proposal.financialDiff.dailyBudgetAfterMinor === 7500 &&
    created.proposal.financialDiff.lifetimeImpactMinor === 0 &&
    created.proposal.financialDiff.sharedBudgetAffected === false &&
    created.proposal.financialDiff.sharedBudgetImpactKnown === true &&
    created.proposal.wiring === PaidMediaWiring.FIXTURE
  ) {
    details.push(
      "Google Ads proposal preserves exactChange + financialDiff (5000→7500 minor; no silent rewrite)",
    );
  } else {
    passed = false;
    details.push(`exact proposal unexpectedly ${JSON.stringify(created)}`);
  }

  // Channel honesty: Google Ads analyze-only write disabled; ChatGPT Ads ACCESS_BLOCKED.
  const status = paidMediaChannelStatus();
  if (
    status.googleAds.writeReady === false &&
    status.chatgptAds.wiring === PaidMediaWiring.ACCESS_BLOCKED &&
    status.chatgptAds.access.allowed === false &&
    status.liveMutationWiring === "NOT_WIRED" &&
    status.externalEffects === "NONE"
  ) {
    details.push(
      "Channel status: Google Ads writeReady=false; ChatGPT Ads ACCESS_BLOCKED; liveMutation NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`channel status unexpectedly ${JSON.stringify(status)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-exact-financial-${randomUUID()}`,
    kind: SoakProofKind.EXACT_FINANCIAL_BOUNDARIES_PRESERVED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tus032-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
