/**
 * T-US-031 — Paid-media recommendations (F16/SC-13) — verified mutation or failure.
 *
 * Offline fixture gate (happy-path / failure family): record a precisely scoped
 * Google Ads recommendation decision, then either record an honest execute
 * failure (live Ads mutate NOT_WIRED) or refuse a false live-verified mutation
 * claim. ChatGPT Ads stays ACCESS_BLOCKED without transport/entitlement.
 * Shared-budget unknown and incomplete selection fail closed. Live adapters
 * stay NOT_WIRED. Distinct from T-US-011 (analyze-only), T-US-012 (test vs
 * production), T-US-032 (exact financial boundaries), and T-X034–T-X036
 * (Ads project/budget/conversion edge cases). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type PaidMediaRecommendationPlatform = "GOOGLE_ADS" | "CHATGPT_ADS";

export type PaidMediaRecommendationSelection = {
  selectionId: string;
  platform: PaidMediaRecommendationPlatform;
  accountId: string;
  campaignId: string;
  /** Inclusive attribution window start (ISO). */
  periodStartIso: string;
  periodEndIso: string;
  attributionBasis: string;
};

export type PaidMediaDeliveryInspection = {
  inspectionId: string;
  impressions: number;
  clicks: number;
  /** Delivery inspected before conversion diagnosis (F16 step 2). */
  deliveryInspectedBeforeConversion: boolean;
  eventsPresent: boolean;
  attributionSettled: boolean;
};

export type PaidMediaRecommendationProposal = {
  proposalId: string;
  changeKind: "BUDGET_ADJUST" | "BID_ADJUST" | "PAUSE_CAMPAIGN" | "OTHER";
  hypothesis: string;
  exactChange: string;
  risk: string;
  alternative: string;
  dailyBudgetBeforeMinor: number | null;
  dailyBudgetAfterMinor: number | null;
  sharedBudgetAffected: boolean;
  sharedBudgetImpactKnown: boolean;
};

export type PaidMediaRecommendationMutationInput = {
  selection: PaidMediaRecommendationSelection;
  delivery: PaidMediaDeliveryInspection;
  proposal: PaidMediaRecommendationProposal;
  /** Owner/agent decision on the specific action. */
  decision: "approve" | "decline" | null;
  decisionReason: string | null;
  /** Attempt execute after approve — offline yields honest failure. */
  requestExecute: boolean;
  /** Claim live Ads mutation already verified — must refuse offline. */
  claimLiveVerifiedMutation: boolean;
  /** Request live provider mutate — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * ChatGPT Ads access flags. Offline default is blocked unless both are true
   * (still no live mutate — fixture only).
   */
  chatgptLocalTransportVerified?: boolean;
  chatgptEntitlementVerified?: boolean;
};

export type PaidMediaRecommendationMutationDecision =
  | {
      allowed: true;
      code:
        | "DECISION_RECORDED_EXECUTE_FAILURE"
        | "DECISION_RECORDED_AWAITING_EXECUTE"
        | "DECLINE_RECORDED_NO_EXECUTE";
      chatgptAdsWiring: "ACCESS_BLOCKED" | "FIXTURE";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        selectionId: string;
        platform: PaidMediaRecommendationPlatform;
        accountId: string;
        campaignId: string;
        proposalId: string;
        decision: "approve" | "decline";
        decisionRecorded: true;
        executeAttempted: boolean;
        executeOutcome: "HONEST_FAILURE_NOT_WIRED" | "NOT_ATTEMPTED";
        failureRecorded: boolean;
        mutationVerified: false;
        blockingDecision: string;
        currentState: "DECISION_RECORDED" | "EXECUTE_FAILED_CLOSED";
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "SELECTION_INCOMPLETE"
        | "DELIVERY_NOT_INSPECTED"
        | "PROPOSAL_INCOMPLETE"
        | "SHARED_BUDGET_UNKNOWN"
        | "CHATGPT_ADS_ACCESS_BLOCKED"
        | "DECISION_REQUIRED"
        | "EXECUTE_REQUIRES_APPROVE"
        | "FALSE_LIVE_VERIFIED_MUTATION_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      chatgptAdsWiring: "ACCESS_BLOCKED" | "FIXTURE" | "N/A";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        selectionId: string | null;
        platform: PaidMediaRecommendationPlatform | null;
        accountId: string | null;
        campaignId: string | null;
        proposalId: string | null;
        decision: "approve" | "decline" | null;
        decisionRecorded: boolean;
        executeAttempted: boolean;
        executeOutcome: "HONEST_FAILURE_NOT_WIRED" | "NOT_ATTEMPTED" | null;
        failureRecorded: boolean;
        mutationVerified: false;
        blockingDecision: string;
        currentState: "BLOCKED" | "ACCESS_BLOCKED" | "AWAITING_DECISION";
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const PAID_MEDIA_RECOMMENDATION_MUTATION_RELATED_CASE_IDS = [
  "T-US-031",
  "T-F16",
] as const;

function preservedInputCount(
  input: PaidMediaRecommendationMutationInput,
): number {
  const s = input.selection;
  const d = input.delivery;
  const p = input.proposal;
  return (
    (s.selectionId.trim() ? 1 : 0) +
    (s.platform ? 1 : 0) +
    (s.accountId.trim() ? 1 : 0) +
    (s.campaignId.trim() ? 1 : 0) +
    (s.periodStartIso.trim() ? 1 : 0) +
    (s.periodEndIso.trim() ? 1 : 0) +
    (s.attributionBasis.trim() ? 1 : 0) +
    (d.inspectionId.trim() ? 1 : 0) +
    (d.deliveryInspectedBeforeConversion ? 1 : 0) +
    (p.proposalId.trim() ? 1 : 0) +
    (p.hypothesis.trim() ? 1 : 0) +
    (p.exactChange.trim() ? 1 : 0) +
    (input.decision ? 1 : 0)
  );
}

function selectionComplete(
  selection: PaidMediaRecommendationSelection,
): boolean {
  return (
    !!selection.selectionId.trim() &&
    (selection.platform === "GOOGLE_ADS" ||
      selection.platform === "CHATGPT_ADS") &&
    !!selection.accountId.trim() &&
    !!selection.campaignId.trim() &&
    !!selection.periodStartIso.trim() &&
    !!selection.periodEndIso.trim() &&
    !!selection.attributionBasis.trim()
  );
}

function proposalComplete(proposal: PaidMediaRecommendationProposal): boolean {
  return (
    !!proposal.proposalId.trim() &&
    !!proposal.hypothesis.trim() &&
    !!proposal.exactChange.trim() &&
    !!proposal.risk.trim() &&
    !!proposal.alternative.trim()
  );
}

/**
 * Evaluate paid-media recommendation → decision → verified mutation or failure.
 * Offline: approve+execute yields honest NOT_WIRED failure; false live verified
 * claims refused; ChatGPT Ads ACCESS_BLOCKED; externalEffects NONE.
 */
export function evaluatePaidMediaRecommendationMutation(
  input: PaidMediaRecommendationMutationInput,
): PaidMediaRecommendationMutationDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
  };
  const preserved = preservedInputCount(input);

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      chatgptAdsWiring: "N/A",
      ...base,
      evidence: null,
      reasons: [
        "Live paid-media mutate remains NOT_WIRED — refuse live wiring (T-US-031)",
      ],
    };
  }

  if (input.claimLiveVerifiedMutation) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_MUTATION_REFUSED",
      chatgptAdsWiring: "N/A",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified Ads mutation claim offline (T-US-031) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  const selection = input.selection;
  if (!selectionComplete(selection)) {
    return {
      allowed: false,
      code: "SELECTION_INCOMPLETE",
      chatgptAdsWiring: "N/A",
      ...base,
      evidence: {
        selectionId: selection.selectionId.trim() || null,
        platform: selection.platform ?? null,
        accountId: selection.accountId.trim() || null,
        campaignId: selection.campaignId.trim() || null,
        proposalId: null,
        decision: null,
        decisionRecorded: false,
        executeAttempted: false,
        executeOutcome: null,
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "SELECTION_INCOMPLETE",
        currentState: "BLOCKED",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: [
        "Paid-media recommendation requires platform, account, campaign, dates, and attribution basis (T-US-031)",
      ],
    };
  }

  if (
    !input.delivery.inspectionId.trim() ||
    !input.delivery.deliveryInspectedBeforeConversion
  ) {
    return {
      allowed: false,
      code: "DELIVERY_NOT_INSPECTED",
      chatgptAdsWiring:
        selection.platform === "CHATGPT_ADS" ? "ACCESS_BLOCKED" : "FIXTURE",
      ...base,
      evidence: {
        selectionId: selection.selectionId,
        platform: selection.platform,
        accountId: selection.accountId,
        campaignId: selection.campaignId,
        proposalId: null,
        decision: null,
        decisionRecorded: false,
        executeAttempted: false,
        executeOutcome: null,
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "DELIVERY_MUST_PRECEDE_CONVERSION",
        currentState: "BLOCKED",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: [
        "Inspect delivery before diagnosing conversion — delivery inspection required (T-US-031 / F16)",
      ],
    };
  }

  if (!proposalComplete(input.proposal)) {
    return {
      allowed: false,
      code: "PROPOSAL_INCOMPLETE",
      chatgptAdsWiring:
        selection.platform === "CHATGPT_ADS" ? "ACCESS_BLOCKED" : "FIXTURE",
      ...base,
      evidence: {
        selectionId: selection.selectionId,
        platform: selection.platform,
        accountId: selection.accountId,
        campaignId: selection.campaignId,
        proposalId: input.proposal.proposalId.trim() || null,
        decision: null,
        decisionRecorded: false,
        executeAttempted: false,
        executeOutcome: null,
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "PROPOSAL_INCOMPLETE",
        currentState: "BLOCKED",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: [
        "Recommendation requires hypothesis, exact change, risk, and alternative (T-US-031)",
      ],
    };
  }

  if (
    input.proposal.sharedBudgetAffected &&
    !input.proposal.sharedBudgetImpactKnown
  ) {
    return {
      allowed: false,
      code: "SHARED_BUDGET_UNKNOWN",
      chatgptAdsWiring:
        selection.platform === "CHATGPT_ADS" ? "ACCESS_BLOCKED" : "FIXTURE",
      ...base,
      evidence: {
        selectionId: selection.selectionId,
        platform: selection.platform,
        accountId: selection.accountId,
        campaignId: selection.campaignId,
        proposalId: input.proposal.proposalId,
        decision: null,
        decisionRecorded: false,
        executeAttempted: false,
        executeOutcome: null,
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "SHARED_BUDGET_IMPACT_UNKNOWN",
        currentState: "BLOCKED",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: [
        "Shared budget impact unknown — block recommendation until impact is known (T-US-031 / F16)",
      ],
    };
  }

  if (selection.platform === "CHATGPT_ADS") {
    const transportOk = input.chatgptLocalTransportVerified === true;
    const entitlementOk = input.chatgptEntitlementVerified === true;
    if (!transportOk || !entitlementOk) {
      return {
        allowed: false,
        code: "CHATGPT_ADS_ACCESS_BLOCKED",
        chatgptAdsWiring: "ACCESS_BLOCKED",
        ...base,
        evidence: {
          selectionId: selection.selectionId,
          platform: selection.platform,
          accountId: selection.accountId,
          campaignId: selection.campaignId,
          proposalId: input.proposal.proposalId,
          decision: null,
          decisionRecorded: false,
          executeAttempted: false,
          executeOutcome: null,
          failureRecorded: false,
          mutationVerified: false,
          blockingDecision: "CHATGPT_ADS_ACCESS_BLOCKED",
          currentState: "ACCESS_BLOCKED",
          recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
          preservedInputCount: preserved,
        },
        reasons: [
          "ChatGPT Ads ACCESS_BLOCKED without verified local transport and entitlement (T-US-031); offline soak soft-skips live ChatGPT Ads",
        ],
      };
    }
  }

  const chatgptWiring =
    selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED";

  if (!input.decision) {
    return {
      allowed: false,
      code: "DECISION_REQUIRED",
      chatgptAdsWiring: chatgptWiring,
      ...base,
      evidence: {
        selectionId: selection.selectionId,
        platform: selection.platform,
        accountId: selection.accountId,
        campaignId: selection.campaignId,
        proposalId: input.proposal.proposalId,
        decision: null,
        decisionRecorded: false,
        executeAttempted: false,
        executeOutcome: null,
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "APPROVE_OR_DECLINE_REQUIRED",
        currentState: "AWAITING_DECISION",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: [
        "Approve or decline the specific recommendation before execute (T-US-031 / F16)",
      ],
    };
  }

  if (!input.decisionReason?.trim()) {
    return {
      allowed: false,
      code: "DECISION_REQUIRED",
      chatgptAdsWiring: chatgptWiring,
      ...base,
      evidence: {
        selectionId: selection.selectionId,
        platform: selection.platform,
        accountId: selection.accountId,
        campaignId: selection.campaignId,
        proposalId: input.proposal.proposalId,
        decision: input.decision,
        decisionRecorded: false,
        executeAttempted: false,
        executeOutcome: null,
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "DECISION_REASON_REQUIRED",
        currentState: "AWAITING_DECISION",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: ["Approve/decline requires a non-empty reason (T-US-031)"],
    };
  }

  if (input.decision === "decline") {
    if (input.requestExecute) {
      return {
        allowed: false,
        code: "EXECUTE_REQUIRES_APPROVE",
        chatgptAdsWiring: chatgptWiring,
        ...base,
        evidence: {
          selectionId: selection.selectionId,
          platform: selection.platform,
          accountId: selection.accountId,
          campaignId: selection.campaignId,
          proposalId: input.proposal.proposalId,
          decision: "decline",
          decisionRecorded: true,
          executeAttempted: false,
          executeOutcome: "NOT_ATTEMPTED",
          failureRecorded: false,
          mutationVerified: false,
          blockingDecision: "DECLINED_NOT_EXECUTABLE",
          currentState: "BLOCKED",
          recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
          preservedInputCount: preserved,
        },
        reasons: [
          "Declined recommendations cannot execute — only approved actions may attempt mutate (T-US-031)",
        ],
      };
    }
    return {
      allowed: true,
      code: "DECLINE_RECORDED_NO_EXECUTE",
      chatgptAdsWiring: chatgptWiring,
      ...base,
      evidence: {
        selectionId: selection.selectionId,
        platform: selection.platform,
        accountId: selection.accountId,
        campaignId: selection.campaignId,
        proposalId: input.proposal.proposalId,
        decision: "decline",
        decisionRecorded: true,
        executeAttempted: false,
        executeOutcome: "NOT_ATTEMPTED",
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "NONE_DECLINED",
        currentState: "DECISION_RECORDED",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: [
        `Decline recorded for proposal ${input.proposal.proposalId} — no mutate; externalEffects=NONE (T-US-031)`,
      ],
    };
  }

  // approve path
  if (!input.requestExecute) {
    return {
      allowed: true,
      code: "DECISION_RECORDED_AWAITING_EXECUTE",
      chatgptAdsWiring: chatgptWiring,
      ...base,
      evidence: {
        selectionId: selection.selectionId,
        platform: selection.platform,
        accountId: selection.accountId,
        campaignId: selection.campaignId,
        proposalId: input.proposal.proposalId,
        decision: "approve",
        decisionRecorded: true,
        executeAttempted: false,
        executeOutcome: "NOT_ATTEMPTED",
        failureRecorded: false,
        mutationVerified: false,
        blockingDecision: "EXECUTE_PENDING_OR_NOT_REQUESTED",
        currentState: "DECISION_RECORDED",
        recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
        preservedInputCount: preserved,
      },
      reasons: [
        `Approve recorded for proposal ${input.proposal.proposalId}; execute not requested — live mutate stays NOT_WIRED (T-US-031)`,
      ],
    };
  }

  // approve + execute → honest offline failure (verified failure path)
  return {
    allowed: true,
    code: "DECISION_RECORDED_EXECUTE_FAILURE",
    chatgptAdsWiring: chatgptWiring,
    ...base,
    evidence: {
      selectionId: selection.selectionId,
      platform: selection.platform,
      accountId: selection.accountId,
      campaignId: selection.campaignId,
      proposalId: input.proposal.proposalId,
      decision: "approve",
      decisionRecorded: true,
      executeAttempted: true,
      executeOutcome: "HONEST_FAILURE_NOT_WIRED",
      failureRecorded: true,
      mutationVerified: false,
      blockingDecision: "LIVE_MUTATION_NOT_WIRED",
      currentState: "EXECUTE_FAILED_CLOSED",
      recoveryPath: "RECORD_DECISION_THEN_VERIFY_OR_FAIL",
      preservedInputCount: preserved,
    },
    reasons: [
      `Approve recorded; execute failed closed LIVE_MUTATION_NOT_WIRED for ${input.proposal.proposalId} — honest failure path (T-US-031); mutationVerified=false externalEffects=NONE`,
    ],
  };
}
