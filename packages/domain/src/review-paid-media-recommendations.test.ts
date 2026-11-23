import { describe, expect, it } from "vitest";
import {
  REVIEW_PAID_MEDIA_RECOMMENDATIONS_RELATED_CASE_IDS,
  evaluateReviewPaidMediaRecommendations,
  type ReviewPaidMediaRecommendationsInput,
} from "./review-paid-media-recommendations.js";

function baseInput(
  overrides: Partial<ReviewPaidMediaRecommendationsInput> = {},
): ReviewPaidMediaRecommendationsInput {
  return {
    packageId: "pkg-f16-1",
    selection: {
      selectionId: "sel-google-1",
      platform: "GOOGLE_ADS",
      accountId: "acct-google-1",
      campaignId: "camp-day-pass-1",
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-11-14T23:59:59.000Z",
      attributionBasis: "last_click_7d",
      accountReadReady: true,
      comparableSettledData: true,
      conversionContextPresent: true,
    },
    analysisDefinition: {
      definitionId: "def-f16-1",
      periodStartIso: "2026-11-01T00:00:00.000Z",
      periodEndIso: "2026-11-14T23:59:59.000Z",
      comparisonLabel: "prior_14d",
      reportingTimezone: "America/New_York",
    },
    diagnosis: {
      diagnosisId: "diag-f16-1",
      kind: "LOW_CLICKS",
      impressions: 4200,
      clicks: 18,
      deliveryInspectedBeforeConversion: true,
      eventsPresent: true,
      attributionSettled: true,
      reasons: ["CTR below comparable cohort; delivery confirmed before conversion"],
    },
    proposal: {
      proposalId: "prop-f16-1",
      changeKind: "BID_ADJUST",
      hypothesis: "Raise bid on Midtown day-pass keyword cluster to restore CTR",
      exactChange: "Increase max CPC +15% on ad group day-pass-midtown",
      risk: "Shared budget may shift from brand terms",
      alternative: "Pause underperforming geo instead of bid raise",
    },
    financialDiff: {
      financialDiffId: "fdiff-f16-1",
      currency: "USD",
      dailyBudgetBeforeMinor: 5000,
      dailyBudgetAfterMinor: 5000,
      lifetimeImpactMinor: 2100,
      sharedBudgetAffected: true,
      sharedBudgetImpactKnown: true,
      boundProposalId: "prop-f16-1",
      notes: ["Shared budget impact modeled; brand terms retain floor"],
    },
    authorization: {
      authorizationId: "auth-f16-1",
      actorRole: "owner",
      decision: "approve",
      reason: "Approve scoped bid adjust with known shared-budget impact",
      authorizedAtIso: "2026-11-21T18:00:00.000Z",
    },
    mutationOrFailure: {
      outcomeId: "mut-f16-1",
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

describe("evaluateReviewPaidMediaRecommendations (T-F16)", () => {
  it("records complete F16 evidence package on Google Ads path", () => {
    const decision = evaluateReviewPaidMediaRecommendations(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "REVIEW_PAID_MEDIA_RECOMMENDATIONS_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.chatgptAdsWiring).toBe("ACCESS_BLOCKED");
    expect(decision.decisionRecorded).toBe(true);
    expect(decision.mutationOrFailureRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f16-1");
    expect(decision.evidence.platform).toBe("GOOGLE_ADS");
    expect(decision.evidence.deliveryInspectedBeforeConversion).toBe(true);
    expect(decision.evidence.sharedBudgetImpactKnown).toBe(true);
    expect(decision.evidence.mutationOutcome).toBe("HONEST_FAILURE_NOT_WIRED");
    expect(decision.evidence.mutationVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F16_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(REVIEW_PAID_MEDIA_RECOMMENDATIONS_RELATED_CASE_IDS).toEqual([
      "T-F16",
    ]);
  });

  it("refuses missing selection", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ selection: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SELECTION_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_SELECTION");
  });

  it("blocks ChatGPT Ads without transport/entitlement", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({
        selection: {
          selectionId: "sel-chatgpt-1",
          platform: "CHATGPT_ADS",
          accountId: "acct-chatgpt-1",
          campaignId: "camp-chatgpt-1",
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
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CHATGPT_ADS_ACCESS_BLOCKED");
    expect(decision.chatgptAdsWiring).toBe("ACCESS_BLOCKED");
  });

  it("refuses missing analysis definition", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ analysisDefinition: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ANALYSIS_DEFINITION_REQUIRED");
  });

  it("refuses missing diagnosis", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ diagnosis: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DIAGNOSIS_REQUIRED");
  });

  it("refuses missing typed proposal", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ proposal: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("TYPED_PROPOSAL_REQUIRED");
  });

  it("refuses unknown shared budget impact", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({
        financialDiff: {
          financialDiffId: "fdiff-unknown",
          currency: "USD",
          dailyBudgetBeforeMinor: 5000,
          dailyBudgetAfterMinor: 5500,
          lifetimeImpactMinor: null,
          sharedBudgetAffected: true,
          sharedBudgetImpactKnown: false,
          boundProposalId: "prop-f16-1",
          notes: [],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SHARED_BUDGET_UNKNOWN");
  });

  it("refuses missing authorization", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ authorization: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AUTHORIZATION_REQUIRED");
  });

  it("refuses missing mutation-or-failure", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ mutationOrFailure: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MUTATION_OR_FAILURE_REQUIRED");
  });

  it("records decline with no execute", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({
        authorization: {
          authorizationId: "auth-decline",
          actorRole: "owner",
          decision: "decline",
          reason: "Decline — shared brand risk too high",
          authorizedAtIso: "2026-11-21T18:00:00.000Z",
        },
        mutationOrFailure: {
          outcomeId: "mut-decline",
          outcome: "DECLINED_NO_EXECUTE",
          executeAttempted: false,
          failureRecorded: false,
          mutationVerifiedLive: false,
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.evidence.decision).toBe("decline");
    expect(decision.evidence.mutationOutcome).toBe("DECLINED_NO_EXECUTE");
  });

  it("refuses false live verified mutation claim", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ claimLiveVerifiedMutation: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_MUTATION_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateReviewPaidMediaRecommendations(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
