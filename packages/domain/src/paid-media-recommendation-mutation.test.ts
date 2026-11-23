import { describe, expect, it } from "vitest";
import { evaluatePaidMediaRecommendationMutation } from "./paid-media-recommendation-mutation.js";

function validSelection(
  overrides: Partial<
    Parameters<typeof evaluatePaidMediaRecommendationMutation>[0]["selection"]
  > = {},
) {
  return {
    selectionId: "sel-google-acoustic",
    platform: "GOOGLE_ADS" as const,
    accountId: "acct-fixture-google",
    campaignId: "camp-booth-awareness",
    periodStartIso: "2026-11-01T00:00:00.000Z",
    periodEndIso: "2026-11-14T00:00:00.000Z",
    attributionBasis: "last_click_settled",
    ...overrides,
  };
}

function validDelivery(
  overrides: Partial<
    Parameters<typeof evaluatePaidMediaRecommendationMutation>[0]["delivery"]
  > = {},
) {
  return {
    inspectionId: "insp-delivery-1",
    impressions: 1200,
    clicks: 48,
    deliveryInspectedBeforeConversion: true,
    eventsPresent: true,
    attributionSettled: true,
    ...overrides,
  };
}

function validProposal(
  overrides: Partial<
    Parameters<typeof evaluatePaidMediaRecommendationMutation>[0]["proposal"]
  > = {},
) {
  return {
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
    ...overrides,
  };
}

function validInput(
  overrides: Partial<
    Parameters<typeof evaluatePaidMediaRecommendationMutation>[0]
  > = {},
) {
  return {
    selection: validSelection(),
    delivery: validDelivery(),
    proposal: validProposal(),
    decision: "approve" as const,
    decisionReason: "Owner accepts scoped budget lift after delivery check",
    requestExecute: true,
    claimLiveVerifiedMutation: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("paid-media-recommendation-mutation (T-US-031)", () => {
  it("records approve + honest execute failure when live mutate NOT_WIRED", () => {
    const decision = evaluatePaidMediaRecommendationMutation(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("DECISION_RECORDED_EXECUTE_FAILURE");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.evidence.decisionRecorded).toBe(true);
    expect(decision.evidence.executeAttempted).toBe(true);
    expect(decision.evidence.executeOutcome).toBe("HONEST_FAILURE_NOT_WIRED");
    expect(decision.evidence.failureRecorded).toBe(true);
    expect(decision.evidence.mutationVerified).toBe(false);
    expect(decision.evidence.currentState).toBe("EXECUTE_FAILED_CLOSED");
    expect(decision.evidence.recoveryPath).toBe(
      "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
    );
  });

  it("records decline without execute", () => {
    const decision = evaluatePaidMediaRecommendationMutation(
      validInput({
        decision: "decline",
        decisionReason: "Budget lift too aggressive for fixture period",
        requestExecute: false,
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("DECLINE_RECORDED_NO_EXECUTE");
    expect(decision.evidence.executeAttempted).toBe(false);
    expect(decision.evidence.mutationVerified).toBe(false);
  });

  it("blocks ChatGPT Ads without transport/entitlement", () => {
    const decision = evaluatePaidMediaRecommendationMutation(
      validInput({
        selection: validSelection({ platform: "CHATGPT_ADS" }),
        chatgptLocalTransportVerified: false,
        chatgptEntitlementVerified: false,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("CHATGPT_ADS_ACCESS_BLOCKED");
    expect(decision.chatgptAdsWiring).toBe("ACCESS_BLOCKED");
    expect(decision.evidence?.currentState).toBe("ACCESS_BLOCKED");
  });

  it("blocks shared budget unknown", () => {
    const decision = evaluatePaidMediaRecommendationMutation(
      validInput({
        proposal: validProposal({
          sharedBudgetAffected: true,
          sharedBudgetImpactKnown: false,
        }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("SHARED_BUDGET_UNKNOWN");
  });

  it("requires delivery inspection before conversion diagnosis", () => {
    const decision = evaluatePaidMediaRecommendationMutation(
      validInput({
        delivery: validDelivery({ deliveryInspectedBeforeConversion: false }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("DELIVERY_NOT_INSPECTED");
  });

  it("refuses false live-verified mutation claim", () => {
    const decision = evaluatePaidMediaRecommendationMutation(
      validInput({ claimLiveVerifiedMutation: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_MUTATION_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluatePaidMediaRecommendationMutation(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("refuses execute on declined proposal", () => {
    const decision = evaluatePaidMediaRecommendationMutation(
      validInput({
        decision: "decline",
        decisionReason: "Not now",
        requestExecute: true,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("EXECUTE_REQUIRES_APPROVE");
  });
});
