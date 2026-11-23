/**
 * Fixture proof for T-US-031 — Paid-media recommendations (F16/SC-13)
 * verified mutation or failure. Decision recorded; execute yields honest
 * LIVE_MUTATION_NOT_WIRED failure; ChatGPT Ads ACCESS_BLOCKED; false live
 * verified claims refused; live NOT_WIRED.
 * Distinct from T-US-011 (analyze-only), T-US-012 (test vs production),
 * T-US-032 (financial boundaries), T-X034–T-X036 (Ads edge cases).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluatePaidMediaRecommendationMutation,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-031 fixture ACCEPTED.
 */
export function proofPaidMediaRecommendationMutationOrFailure(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const selection = {
    selectionId: "sel-google-acoustic",
    platform: "GOOGLE_ADS" as const,
    accountId: "acct-fixture-google",
    campaignId: "camp-booth-awareness",
    periodStartIso: "2026-11-01T00:00:00.000Z",
    periodEndIso: "2026-11-14T00:00:00.000Z",
    attributionBasis: "last_click_settled",
  };
  const delivery = {
    inspectionId: "insp-delivery-1",
    impressions: 1200,
    clicks: 48,
    deliveryInspectedBeforeConversion: true,
    eventsPresent: true,
    attributionSettled: true,
  };
  const proposal = {
    proposalId: "prop-google-budget-1",
    changeKind: "BUDGET_ADJUST" as const,
    hypothesis: "Low clicks with settled delivery — modest budget lift",
    exactChange: "daily_budget 5000→6500 minor USD",
    risk: "Spend increases ~30% daily if delivery holds",
    alternative: "Pause underperforming ad group instead",
    dailyBudgetBeforeMinor: 5000,
    dailyBudgetAfterMinor: 6500,
    sharedBudgetAffected: false,
    sharedBudgetImpactKnown: true,
  };

  const executeFail = evaluatePaidMediaRecommendationMutation({
    selection,
    delivery,
    proposal,
    decision: "approve",
    decisionReason: "Owner accepts scoped budget lift after delivery check",
    requestExecute: true,
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: false,
  });
  if (
    executeFail.allowed &&
    executeFail.code === "DECISION_RECORDED_EXECUTE_FAILURE" &&
    executeFail.evidence.decisionRecorded &&
    executeFail.evidence.executeAttempted &&
    executeFail.evidence.executeOutcome === "HONEST_FAILURE_NOT_WIRED" &&
    executeFail.evidence.failureRecorded &&
    executeFail.evidence.mutationVerified === false &&
    executeFail.liveProviderWiring === "NOT_WIRED" &&
    executeFail.externalEffects === "NONE"
  ) {
    details.push(
      "approve+execute → DECISION_RECORDED_EXECUTE_FAILURE; honest LIVE_MUTATION_NOT_WIRED failure; mutationVerified=false",
    );
  } else {
    passed = false;
    details.push(`Execute failure unexpectedly ${JSON.stringify(executeFail)}`);
  }

  const decline = evaluatePaidMediaRecommendationMutation({
    selection,
    delivery,
    proposal,
    decision: "decline",
    decisionReason: "Budget lift too aggressive for fixture period",
    requestExecute: false,
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: false,
  });
  if (decline.allowed && decline.code === "DECLINE_RECORDED_NO_EXECUTE") {
    details.push("decline → DECLINE_RECORDED_NO_EXECUTE; no mutate");
  } else {
    passed = false;
    details.push(`Decline unexpectedly ${JSON.stringify(decline)}`);
  }

  const chatgpt = evaluatePaidMediaRecommendationMutation({
    selection: { ...selection, platform: "CHATGPT_ADS" },
    delivery,
    proposal: { ...proposal, proposalId: "prop-chatgpt-blocked-1" },
    decision: "approve",
    decisionReason: "Would approve if entitled",
    requestExecute: true,
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: false,
    chatgptLocalTransportVerified: false,
    chatgptEntitlementVerified: false,
  });
  if (
    !chatgpt.allowed &&
    chatgpt.code === "CHATGPT_ADS_ACCESS_BLOCKED" &&
    chatgpt.chatgptAdsWiring === "ACCESS_BLOCKED"
  ) {
    details.push(
      "ChatGPT Ads without transport/entitlement → CHATGPT_ADS_ACCESS_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`ChatGPT Ads unexpectedly ${JSON.stringify(chatgpt)}`);
  }

  const shared = evaluatePaidMediaRecommendationMutation({
    selection,
    delivery,
    proposal: {
      ...proposal,
      sharedBudgetAffected: true,
      sharedBudgetImpactKnown: false,
    },
    decision: "approve",
    decisionReason: "try",
    requestExecute: true,
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: false,
  });
  if (!shared.allowed && shared.code === "SHARED_BUDGET_UNKNOWN") {
    details.push(
      "sharedBudgetAffected + unknown impact → SHARED_BUDGET_UNKNOWN",
    );
  } else {
    passed = false;
    details.push(`Shared budget unexpectedly ${JSON.stringify(shared)}`);
  }

  const deliveryGate = evaluatePaidMediaRecommendationMutation({
    selection,
    delivery: { ...delivery, deliveryInspectedBeforeConversion: false },
    proposal,
    decision: "approve",
    decisionReason: "try",
    requestExecute: true,
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: false,
  });
  if (
    !deliveryGate.allowed &&
    deliveryGate.code === "DELIVERY_NOT_INSPECTED"
  ) {
    details.push(
      "deliveryInspectedBeforeConversion=false → DELIVERY_NOT_INSPECTED",
    );
  } else {
    passed = false;
    details.push(`Delivery gate unexpectedly ${JSON.stringify(deliveryGate)}`);
  }

  const falseClaim = evaluatePaidMediaRecommendationMutation({
    selection,
    delivery,
    proposal,
    decision: "approve",
    decisionReason: "try",
    requestExecute: true,
    claimLiveVerifiedMutation: true,
    requestLiveProviderWiring: false,
  });
  if (
    !falseClaim.allowed &&
    falseClaim.code === "FALSE_LIVE_VERIFIED_MUTATION_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedMutation → FALSE_LIVE_VERIFIED_MUTATION_REFUSED",
    );
  } else {
    passed = false;
    details.push(`False claim unexpectedly ${JSON.stringify(falseClaim)}`);
  }

  const live = evaluatePaidMediaRecommendationMutation({
    selection,
    delivery,
    proposal,
    decision: "approve",
    decisionReason: "try",
    requestExecute: true,
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-011 (analyze-only), T-US-012 (test vs production), T-US-032 (financial boundaries), T-X034–T-X036 (Ads edge cases)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-paid-media-rec-${randomUUID()}`,
    kind: SoakProofKind.PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-paid-media-rec-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
