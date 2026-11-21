/**
 * Deterministic fixture bundle for AA-19 analysis + paid-media proposals.
 * External effects: NONE.
 */

import {
  PaidChangeKind,
  PaidMediaPlatform,
  createAnalysisDefinition,
  createAnalysisHypothesis,
  createDecisionBrief,
  createPaidMediaProposal,
  diagnoseDelivery,
  type AnalysisDefinition,
  type AnalysisHypothesis,
  type DecisionBrief,
  type PaidMediaProposal,
} from "@worksocial/domain";

export const PAID_MEDIA_DEFINITION_ID = "def-fixture-analysis-001";
export const PAID_MEDIA_HYPOTHESIS_ID = "hyp-fixture-001";
export const PAID_MEDIA_BRIEF_ID = "brief-fixture-001";
export const PAID_MEDIA_GOOGLE_PROPOSAL_ID = "prop-google-fixture-001";
export const PAID_MEDIA_CHATGPT_PROPOSAL_ID = "prop-chatgpt-blocked-001";

export type PaidMediaFixtureBundle = {
  definition: AnalysisDefinition;
  hypothesis: AnalysisHypothesis;
  brief: DecisionBrief;
  googleProposal: PaidMediaProposal;
  chatgptBlockedProposal: PaidMediaProposal;
};

export function buildPaidMediaFixtureBundle(
  nowIso = "2026-11-21T21:00:00.000Z",
): PaidMediaFixtureBundle {
  const definition = createAnalysisDefinition({
    definitionId: PAID_MEDIA_DEFINITION_ID,
    siteId: "site-worksocial-fixture",
    periodStartIso: "2026-11-01T00:00:00.000Z",
    periodEndIso: "2026-11-14T23:59:59.000Z",
    comparisonLabel: "prior_14d",
    reportingTimezone: "America/New_York",
    createdAtIso: nowIso,
  });

  const hyp = createAnalysisHypothesis({
    hypothesisId: PAID_MEDIA_HYPOTHESIS_ID,
    definitionId: definition.definitionId,
    statement:
      "Improving conference-room CTA clarity increases CRM-verified tour bookings",
    primaryOutcome: "CRM-verified tour bookings",
    baseline: "2 bookings / week (fixture)",
    comparison: "≥4 bookings / week",
    observationWindowDays: 14,
    createdAtIso: nowIso,
  });
  if (!hyp.ok) {
    throw new Error(hyp.reasons.join("; "));
  }

  const brief = createDecisionBrief({
    briefId: PAID_MEDIA_BRIEF_ID,
    definitionId: definition.definitionId,
    hypothesisId: hyp.hypothesis.hypothesisId,
    title: "Fixture decision brief — CTA hypothesis",
    summary:
      "Fixture GSC/GA4 only. Do not treat as live KPI evidence. Hold live spend changes.",
    sourceCaveats: [
      "FIXTURE ≠ SANDBOX ≠ LIVE",
      "Live GSC/GA4/Ads query transport NOT_WIRED",
      "ChatGPT Ads ACCESS_BLOCKED without transport+entitlement",
    ],
    proposedActions: [
      "Keep Analyze-only Google Ads fixture path",
      "Do not approve live spend mutations",
    ],
    createdAtIso: nowIso,
  });

  const settled = diagnoseDelivery({
    impressions: 4200,
    clicks: 126,
    eventsPresent: true,
    attributionSettled: true,
    sameDaySpendComplete: true,
  });

  const google = createPaidMediaProposal({
    proposalId: PAID_MEDIA_GOOGLE_PROPOSAL_ID,
    platform: PaidMediaPlatform.GOOGLE_ADS,
    accountId: "google-ads-fixture-001",
    campaignId: "camp-jc-conference-fixture",
    changeKind: PaidChangeKind.PAUSE_CAMPAIGN,
    hypothesis:
      "Pause underperforming fixture campaign after settled delivery review",
    exactChange: "campaign.status: ENABLED → PAUSED",
    risk: "Loss of learning; temporary traffic dip on fixture account",
    alternative: "Tighten keywords before pause",
    diagnosis: settled,
    financialDiff: {
      currency: "USD",
      dailyBudgetBeforeMinor: 7500,
      dailyBudgetAfterMinor: 0,
      lifetimeImpactMinor: 0,
      sharedBudgetAffected: false,
      sharedBudgetImpactKnown: true,
      notes: ["Fixture financial diff — not live account impact"],
    },
    createdAtIso: nowIso,
  });
  if (!google.ok) {
    throw new Error(google.reasons.join("; "));
  }

  const chatgpt = createPaidMediaProposal({
    proposalId: PAID_MEDIA_CHATGPT_PROPOSAL_ID,
    platform: PaidMediaPlatform.CHATGPT_ADS,
    accountId: "chatgpt-ads-mgr-unverified",
    campaignId: "camp-chatgpt-fixture",
    changeKind: PaidChangeKind.BUDGET_ADJUST,
    hypothesis: "Raise ChatGPT Ads budget (must stay blocked)",
    exactChange: "daily_budget +$20",
    risk: "Uncontrolled spend",
    alternative: "Keep access-blocked until transport+entitlement verified",
    diagnosis: settled,
    financialDiff: {
      currency: "USD",
      dailyBudgetBeforeMinor: 3000,
      dailyBudgetAfterMinor: 5000,
      lifetimeImpactMinor: null,
      sharedBudgetAffected: false,
      sharedBudgetImpactKnown: true,
      notes: [],
    },
    createdAtIso: nowIso,
  });
  if (chatgpt.ok || !chatgpt.proposal) {
    throw new Error("Expected ChatGPT Ads proposal to be blocked");
  }

  return {
    definition,
    hypothesis: hyp.hypothesis,
    brief,
    googleProposal: google.proposal,
    chatgptBlockedProposal: chatgpt.proposal,
  };
}
