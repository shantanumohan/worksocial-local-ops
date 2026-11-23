/**
 * Fixture proof for T-F16 — Review Google and ChatGPT paid-media
 * recommendations. Complete F16 evidence package: read-ready selection,
 * reproducible analysis definition, evidence-backed diagnosis, typed change
 * proposal, revision-bound financial diff, authorization record, verified
 * mutation or explicit failure; ChatGPT Ads ACCESS_BLOCKED without
 * transport/entitlement; unsafe claims refused; live providers NOT_WIRED.
 * Distinct from T-US-031 decision+execute-failure summary, T-US-011
 * analyze-only, T-US-012 test vs production, T-US-032 exact financial
 * boundaries, and T-F07/T-US-013/T-US-014 ChatGPT Ads connect. External
 * effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateReviewPaidMediaRecommendations,
  type ReviewPaidMediaRecommendationsInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ReviewPaidMediaRecommendationsInput> = {},
): ReviewPaidMediaRecommendationsInput {
  return {
    packageId: "pkg-f16-soak",
    selection: {
      selectionId: "sel-google-soak",
      platform: "GOOGLE_ADS",
      accountId: "acct-google-soak",
      campaignId: "camp-day-pass-soak",
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-11-14T23:59:59.000Z",
      attributionBasis: "last_click_7d",
      accountReadReady: true,
      comparableSettledData: true,
      conversionContextPresent: true,
    },
    analysisDefinition: {
      definitionId: "def-f16-soak",
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-11-14T23:59:59.000Z",
      comparisonLabel: "prior_14d",
      reportingTimezone: "America/New_York",
    },
    diagnosis: {
      diagnosisId: "diag-f16-soak",
      kind: "LOW_CLICKS",
      impressions: 4200,
      clicks: 18,
      deliveryInspectedBeforeConversion: true,
      eventsPresent: true,
      attributionSettled: true,
      reasons: [
        "CTR below comparable cohort; delivery confirmed before conversion",
      ],
    },
    proposal: {
      proposalId: "prop-f16-soak",
      changeKind: "BID_ADJUST",
      hypothesis: "Raise bid on Midtown day-pass keyword cluster to restore CTR",
      exactChange: "Increase max CPC +15% on ad group day-pass-midtown",
      risk: "Shared budget may shift from brand terms",
      alternative: "Pause underperforming geo instead of bid raise",
    },
    financialDiff: {
      financialDiffId: "fdiff-f16-soak",
      currency: "USD",
      dailyBudgetBeforeMinor: 5000,
      dailyBudgetAfterMinor: 5000,
      lifetimeImpactMinor: 2100,
      sharedBudgetAffected: true,
      sharedBudgetImpactKnown: true,
      boundProposalId: "prop-f16-soak",
      notes: ["Shared budget impact modeled; brand terms retain floor"],
    },
    authorization: {
      authorizationId: "auth-f16-soak",
      actorRole: "owner",
      decision: "approve",
      reason: "Approve scoped bid adjust with known shared-budget impact",
      authorizedAtIso: "2026-11-21T18:00:00.000Z",
    },
    mutationOrFailure: {
      outcomeId: "mut-f16-soak",
      outcome: "HONEST_FAILURE_NOT_WIRED",
      executeAttempted: true,
      failureRecorded: true,
      mutationVerifiedLive: false,
    },
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F16 fixture ACCEPTED.
 */
export function proofReviewPaidMediaRecommendations(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateReviewPaidMediaRecommendations(baseInput());
  if (
    happy.allowed &&
    happy.code === "REVIEW_PAID_MEDIA_RECOMMENDATIONS_EVIDENCE_RECORDED" &&
    happy.evidence.mutationVerifiedLive === false &&
    happy.decisionRecorded === true &&
    happy.mutationOrFailureRecorded === true &&
    happy.evidence.deliveryInspectedBeforeConversion === true &&
    happy.evidence.sharedBudgetImpactKnown === true &&
    happy.chatgptAdsWiring === "ACCESS_BLOCKED" &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F16 evidence package → REVIEW_PAID_MEDIA_RECOMMENDATIONS_EVIDENCE_RECORDED; read-ready selection; reproducible analysis definition; evidence-backed diagnosis; typed change proposal; revision-bound financial diff; authorization record; verified mutation or explicit failure; mutationVerifiedLive=false; ChatGPT Ads ACCESS_BLOCKED; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noSel = evaluateReviewPaidMediaRecommendations(
    baseInput({ selection: null }),
  );
  if (!noSel.allowed && noSel.code === "SELECTION_REQUIRED") {
    details.push("selection=null → SELECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Selection unexpectedly ${JSON.stringify(noSel)}`);
  }

  const chatgptBlocked = evaluateReviewPaidMediaRecommendations(
    baseInput({
      selection: {
        selectionId: "sel-chatgpt-soak",
        platform: "CHATGPT_ADS",
        accountId: "acct-chatgpt-soak",
        campaignId: "camp-chatgpt-soak",
        periodStartIso: "2026-11-01T00:00:00.000Z",
        periodEndIso: "2026-11-14T23:59:59.000Z",
        attributionBasis: "last_click_7d",
        accountReadReady: true,
        comparableSettledData: true,
        conversionContextPresent: true,
      },
      chatgptLocalTransportVerified: false,
      chatgptEntitlementVerified: false,
    }),
  );
  if (
    !chatgptBlocked.allowed &&
    chatgptBlocked.code === "CHATGPT_ADS_ACCESS_BLOCKED"
  ) {
    details.push("CHATGPT_ADS without transport/entitlement → ACCESS_BLOCKED");
  } else {
    passed = false;
    details.push(`ChatGPT Ads unexpectedly ${JSON.stringify(chatgptBlocked)}`);
  }

  const noDef = evaluateReviewPaidMediaRecommendations(
    baseInput({ analysisDefinition: null }),
  );
  if (!noDef.allowed && noDef.code === "ANALYSIS_DEFINITION_REQUIRED") {
    details.push("analysisDefinition=null → ANALYSIS_DEFINITION_REQUIRED");
  } else {
    passed = false;
    details.push(`Analysis definition unexpectedly ${JSON.stringify(noDef)}`);
  }

  const noDiag = evaluateReviewPaidMediaRecommendations(
    baseInput({ diagnosis: null }),
  );
  if (!noDiag.allowed && noDiag.code === "DIAGNOSIS_REQUIRED") {
    details.push("diagnosis=null → DIAGNOSIS_REQUIRED");
  } else {
    passed = false;
    details.push(`Diagnosis unexpectedly ${JSON.stringify(noDiag)}`);
  }

  const noProp = evaluateReviewPaidMediaRecommendations(
    baseInput({ proposal: null }),
  );
  if (!noProp.allowed && noProp.code === "TYPED_PROPOSAL_REQUIRED") {
    details.push("proposal=null → TYPED_PROPOSAL_REQUIRED");
  } else {
    passed = false;
    details.push(`Proposal unexpectedly ${JSON.stringify(noProp)}`);
  }

  const unknownBudget = evaluateReviewPaidMediaRecommendations(
    baseInput({
      financialDiff: {
        financialDiffId: "fdiff-unknown-soak",
        currency: "USD",
        dailyBudgetBeforeMinor: 5000,
        dailyBudgetAfterMinor: 5500,
        lifetimeImpactMinor: null,
        sharedBudgetAffected: true,
        sharedBudgetImpactKnown: false,
        boundProposalId: "prop-f16-soak",
        notes: [],
      },
    }),
  );
  if (
    !unknownBudget.allowed &&
    unknownBudget.code === "SHARED_BUDGET_UNKNOWN"
  ) {
    details.push("sharedBudgetImpactKnown=false → SHARED_BUDGET_UNKNOWN");
  } else {
    passed = false;
    details.push(`Shared budget unexpectedly ${JSON.stringify(unknownBudget)}`);
  }

  const noAuth = evaluateReviewPaidMediaRecommendations(
    baseInput({ authorization: null }),
  );
  if (!noAuth.allowed && noAuth.code === "AUTHORIZATION_REQUIRED") {
    details.push("authorization=null → AUTHORIZATION_REQUIRED");
  } else {
    passed = false;
    details.push(`Authorization unexpectedly ${JSON.stringify(noAuth)}`);
  }

  const noMut = evaluateReviewPaidMediaRecommendations(
    baseInput({ mutationOrFailure: null }),
  );
  if (!noMut.allowed && noMut.code === "MUTATION_OR_FAILURE_REQUIRED") {
    details.push("mutationOrFailure=null → MUTATION_OR_FAILURE_REQUIRED");
  } else {
    passed = false;
    details.push(`Mutation/failure unexpectedly ${JSON.stringify(noMut)}`);
  }

  const liveClaim = evaluateReviewPaidMediaRecommendations(
    baseInput({ claimLiveVerifiedMutation: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_MUTATION_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedMutation → FALSE_LIVE_VERIFIED_MUTATION_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateReviewPaidMediaRecommendations(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-031 (decision+execute-failure summary), T-US-011 (analyze-only), T-US-012 (test vs production), T-US-032 (exact financial boundaries), and T-F07/T-US-013/T-US-014 (ChatGPT Ads connect) — complete F16 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.REVIEW_PAID_MEDIA_RECOMMENDATIONS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-review-paid-media-recommendations-f16",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
