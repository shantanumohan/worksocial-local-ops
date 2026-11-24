/**
 * T-F16 — Review Google and ChatGPT paid-media recommendations
 * (complete F16 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F16 evidence
 * package — read-ready account selection with comparable settled data +
 * conversion context, reproducible analysis definition, evidence-backed
 * delivery diagnosis (before conversion), typed change proposal, revision-
 * bound financial diff (shared-budget impact known), authorization record,
 * and verified mutation **or** explicit honest failure. Incomplete packages,
 * unknown shared-budget impact, ChatGPT Ads without transport/entitlement,
 * false live-verified mutation claims, and live provider wiring are refused.
 * Live Ads mutate stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-031 (`PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE`) —
 * this records the complete F16 flow evidence package (analysis definition +
 * diagnosis + typed proposal + financial diff + authorization + mutation-or-
 * failure), not the decision+execute-failure summary alone. Distinct from
 * T-US-011 (analyze-only), T-US-012 (test vs production), T-US-032 (exact
 * financial boundaries), T-F07 / T-US-013 / T-US-014 (ChatGPT Ads connect),
 * and T-X034–T-X036 (Ads edge cases).
 */

export type PaidMediaF16Platform = "GOOGLE_ADS" | "CHATGPT_ADS";

export type ReadReadyAccountSelection = {
  selectionId: string;
  platform: PaidMediaF16Platform;
  accountId: string;
  campaignId: string;
  periodStartIso: string;
  periodEndIso: string;
  attributionBasis: string;
  /** Selected account is read-ready for analysis. */
  accountReadReady: boolean;
  /** Comparable settled delivery/conversion context available. */
  comparableSettledData: boolean;
  conversionContextPresent: boolean;
};

export type ReproducibleAnalysisDefinition = {
  definitionId: string;
  periodStartIso: string;
  periodEndIso: string;
  comparisonLabel: string;
  reportingTimezone: string;
};

export type EvidenceBackedDiagnosis = {
  diagnosisId: string;
  kind:
    | "NO_IMPRESSIONS"
    | "LOW_CLICKS"
    | "MISSING_EVENTS"
    | "DELAYED_ATTRIBUTION"
    | "DELIVERY_OK"
    | "UNKNOWN";
  impressions: number;
  clicks: number;
  /** Delivery inspected before conversion diagnosis (F16 step 2). */
  deliveryInspectedBeforeConversion: boolean;
  eventsPresent: boolean;
  attributionSettled: boolean;
  reasons: readonly string[];
};

export type TypedChangeProposal = {
  proposalId: string;
  changeKind: "BUDGET_ADJUST" | "BID_ADJUST" | "PAUSE_CAMPAIGN" | "OTHER";
  hypothesis: string;
  exactChange: string;
  risk: string;
  alternative: string;
};

export type RevisionBoundFinancialDiff = {
  financialDiffId: string;
  currency: string;
  dailyBudgetBeforeMinor: number | null;
  dailyBudgetAfterMinor: number | null;
  lifetimeImpactMinor: number | null;
  sharedBudgetAffected: boolean;
  /** Block when shared budget impact is unknown (F16). */
  sharedBudgetImpactKnown: boolean;
  /** Bound to proposal / revision identity. */
  boundProposalId: string;
  notes: readonly string[];
};

export type AuthorizationRecord = {
  authorizationId: string;
  actorRole: string;
  decision: "approve" | "decline";
  reason: string;
  authorizedAtIso: string;
};

export type MutationOrExplicitFailure = {
  outcomeId: string;
  /** Offline happy path records honest NOT_WIRED failure after approve+execute. */
  outcome: "HONEST_FAILURE_NOT_WIRED" | "DECLINED_NO_EXECUTE" | "AWAITING_EXECUTE";
  executeAttempted: boolean;
  failureRecorded: boolean;
  /** Always false offline — never invent live verified mutation. */
  mutationVerifiedLive: false;
};

export type ReviewPaidMediaRecommendationsInput = {
  packageId: string;
  selection: ReadReadyAccountSelection | null;
  analysisDefinition: ReproducibleAnalysisDefinition | null;
  diagnosis: EvidenceBackedDiagnosis | null;
  proposal: TypedChangeProposal | null;
  financialDiff: RevisionBoundFinancialDiff | null;
  authorization: AuthorizationRecord | null;
  mutationOrFailure: MutationOrExplicitFailure | null;
  /**
   * ChatGPT Ads access flags. Offline default is blocked unless both are true
   * (still no live mutate — fixture only).
   */
  chatgptLocalTransportVerified?: boolean;
  chatgptEntitlementVerified?: boolean;
  /** Claim live Ads mutation already verified — must refuse offline. */
  claimLiveVerifiedMutation: boolean;
  /** Request live provider mutate — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type ReviewPaidMediaRecommendationsDecision =
  | {
      allowed: true;
      code: "REVIEW_PAID_MEDIA_RECOMMENDATIONS_EVIDENCE_RECORDED";
      decisionRecorded: true;
      mutationOrFailureRecorded: true;
      chatgptAdsWiring: "ACCESS_BLOCKED" | "FIXTURE";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        selectionId: string;
        platform: PaidMediaF16Platform;
        accountId: string;
        campaignId: string;
        attributionBasis: string;
        accountReadReady: true;
        comparableSettledData: true;
        conversionContextPresent: true;
        definitionId: string;
        comparisonLabel: string;
        reportingTimezone: string;
        diagnosisId: string;
        diagnosisKind: EvidenceBackedDiagnosis["kind"];
        deliveryInspectedBeforeConversion: true;
        proposalId: string;
        changeKind: TypedChangeProposal["changeKind"];
        exactChange: string;
        financialDiffId: string;
        currency: string;
        dailyBudgetBeforeMinor: number | null;
        dailyBudgetAfterMinor: number | null;
        sharedBudgetAffected: boolean;
        sharedBudgetImpactKnown: true;
        authorizationId: string;
        decision: "approve" | "decline";
        actorRole: string;
        mutationOutcomeId: string;
        mutationOutcome: MutationOrExplicitFailure["outcome"];
        executeAttempted: boolean;
        failureRecorded: boolean;
        mutationVerifiedLive: false;
        blockingDecision: "F16_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "DECISION_RECORDED_MUTATION_OR_FAILURE";
        recoveryPath: "KEEP_FIXTURE_DECISION_NO_LIVE_MUTATE";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "SELECTION_REQUIRED"
        | "ANALYSIS_DEFINITION_REQUIRED"
        | "DIAGNOSIS_REQUIRED"
        | "TYPED_PROPOSAL_REQUIRED"
        | "FINANCIAL_DIFF_REQUIRED"
        | "SHARED_BUDGET_UNKNOWN"
        | "AUTHORIZATION_REQUIRED"
        | "MUTATION_OR_FAILURE_REQUIRED"
        | "CHATGPT_ADS_ACCESS_BLOCKED"
        | "FALSE_LIVE_VERIFIED_MUTATION_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      decisionRecorded: false;
      mutationOrFailureRecorded: false;
      chatgptAdsWiring: "ACCESS_BLOCKED" | "FIXTURE" | "N/A";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        selectionId: string | null;
        platform: PaidMediaF16Platform | null;
        accountId: string | null;
        campaignId: string | null;
        definitionId: string | null;
        diagnosisId: string | null;
        proposalId: string | null;
        financialDiffId: string | null;
        authorizationId: string | null;
        mutationOutcomeId: string | null;
        mutationVerifiedLive: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "ACCESS_BLOCKED"
          | "AWAITING_SELECTION"
          | "AWAITING_ANALYSIS_DEFINITION"
          | "AWAITING_DIAGNOSIS"
          | "AWAITING_TYPED_PROPOSAL"
          | "AWAITING_FINANCIAL_DIFF"
          | "AWAITING_AUTHORIZATION"
          | "AWAITING_MUTATION_OR_FAILURE";
        recoveryPath:
          | "SELECT_READ_READY_ACCOUNT_WITH_SETTLED_CONTEXT"
          | "RECORD_REPRODUCIBLE_ANALYSIS_DEFINITION"
          | "INSPECT_DELIVERY_BEFORE_CONVERSION"
          | "RECORD_TYPED_CHANGE_PROPOSAL"
          | "RECORD_REVISION_BOUND_FINANCIAL_DIFF"
          | "RESOLVE_SHARED_BUDGET_IMPACT"
          | "RECORD_AUTHORIZATION_DECISION"
          | "RECORD_VERIFIED_MUTATION_OR_EXPLICIT_FAILURE"
          | "KEEP_FIXTURE_DECISION_NO_LIVE_MUTATE"
          | "VERIFY_CHATGPT_TRANSPORT_AND_ENTITLEMENT";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const REVIEW_PAID_MEDIA_RECOMMENDATIONS_RELATED_CASE_IDS = [
  "T-F16",
] as const;

function preservedInputCount(
  input: ReviewPaidMediaRecommendationsInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.selection?.selectionId.trim() ? 1 : 0) +
    (input.analysisDefinition?.definitionId.trim() ? 1 : 0) +
    (input.diagnosis?.diagnosisId.trim() ? 1 : 0) +
    (input.proposal?.proposalId.trim() ? 1 : 0) +
    (input.financialDiff?.financialDiffId.trim() ? 1 : 0) +
    (input.authorization?.authorizationId.trim() ? 1 : 0) +
    (input.mutationOrFailure?.outcomeId.trim() ? 1 : 0)
  );
}

function selectionOk(
  selection: ReadReadyAccountSelection | null,
): selection is ReadReadyAccountSelection {
  if (!selection) return false;
  return (
    selection.selectionId.trim().length > 0 &&
    (selection.platform === "GOOGLE_ADS" ||
      selection.platform === "CHATGPT_ADS") &&
    selection.accountId.trim().length > 0 &&
    selection.campaignId.trim().length > 0 &&
    selection.periodStartIso.trim().length > 0 &&
    selection.periodEndIso.trim().length > 0 &&
    selection.attributionBasis.trim().length > 0 &&
    selection.accountReadReady === true &&
    selection.comparableSettledData === true &&
    selection.conversionContextPresent === true
  );
}

function analysisOk(
  def: ReproducibleAnalysisDefinition | null,
): def is ReproducibleAnalysisDefinition {
  if (!def) return false;
  return (
    def.definitionId.trim().length > 0 &&
    def.periodStartIso.trim().length > 0 &&
    def.periodEndIso.trim().length > 0 &&
    def.comparisonLabel.trim().length > 0 &&
    def.reportingTimezone.trim().length > 0
  );
}

function diagnosisOk(
  diagnosis: EvidenceBackedDiagnosis | null,
): diagnosis is EvidenceBackedDiagnosis {
  if (!diagnosis) return false;
  return (
    diagnosis.diagnosisId.trim().length > 0 &&
    diagnosis.deliveryInspectedBeforeConversion === true &&
    Number.isFinite(diagnosis.impressions) &&
    Number.isFinite(diagnosis.clicks) &&
    diagnosis.reasons.length > 0
  );
}

function proposalOk(
  proposal: TypedChangeProposal | null,
): proposal is TypedChangeProposal {
  if (!proposal) return false;
  return (
    proposal.proposalId.trim().length > 0 &&
    proposal.hypothesis.trim().length > 0 &&
    proposal.exactChange.trim().length > 0 &&
    proposal.risk.trim().length > 0 &&
    proposal.alternative.trim().length > 0
  );
}

function financialOk(
  diff: RevisionBoundFinancialDiff | null,
  proposalId: string,
): diff is RevisionBoundFinancialDiff {
  if (!diff) return false;
  return (
    diff.financialDiffId.trim().length > 0 &&
    diff.currency.trim().length > 0 &&
    diff.boundProposalId.trim() === proposalId.trim() &&
    Array.isArray(diff.notes)
  );
}

function authorizationOk(
  auth: AuthorizationRecord | null,
): auth is AuthorizationRecord {
  if (!auth) return false;
  return (
    auth.authorizationId.trim().length > 0 &&
    auth.actorRole.trim().length > 0 &&
    (auth.decision === "approve" || auth.decision === "decline") &&
    auth.reason.trim().length > 0 &&
    auth.authorizedAtIso.trim().length > 0
  );
}

function mutationOk(
  mutation: MutationOrExplicitFailure | null,
  decision: "approve" | "decline",
): mutation is MutationOrExplicitFailure {
  if (!mutation) return false;
  if (!mutation.outcomeId.trim()) return false;
  if (mutation.mutationVerifiedLive !== false) return false;
  if (decision === "decline") {
    return (
      mutation.outcome === "DECLINED_NO_EXECUTE" &&
      mutation.executeAttempted === false &&
      mutation.failureRecorded === false
    );
  }
  // approve: require honest failure recorded (offline) or awaiting execute
  if (mutation.outcome === "HONEST_FAILURE_NOT_WIRED") {
    return mutation.executeAttempted === true && mutation.failureRecorded === true;
  }
  if (mutation.outcome === "AWAITING_EXECUTE") {
    return mutation.executeAttempted === false && mutation.failureRecorded === false;
  }
  return false;
}

/**
 * Evaluate the T-F16 review paid-media recommendations path offline.
 * Complete F16 evidence package → REVIEW_PAID_MEDIA_RECOMMENDATIONS_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; ChatGPT Ads ACCESS_BLOCKED without transport+entitlement.
 */
export function evaluateReviewPaidMediaRecommendations(
  input: ReviewPaidMediaRecommendationsInput,
): ReviewPaidMediaRecommendationsDecision {
  const base = {
    decisionRecorded: false as const,
    mutationOrFailureRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const selection = input.selection;
  const analysisDefinition = input.analysisDefinition;
  const diagnosis = input.diagnosis;
  const proposal = input.proposal;
  const financialDiff = input.financialDiff;
  const authorization = input.authorization;
  const mutationOrFailure = input.mutationOrFailure;

  const chatgptTransport = input.chatgptLocalTransportVerified === true;
  const chatgptEntitlement = input.chatgptEntitlementVerified === true;
  const chatgptFixtureAllowed = chatgptTransport && chatgptEntitlement;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "ACCESS_BLOCKED"
      | "AWAITING_SELECTION"
      | "AWAITING_ANALYSIS_DEFINITION"
      | "AWAITING_DIAGNOSIS"
      | "AWAITING_TYPED_PROPOSAL"
      | "AWAITING_FINANCIAL_DIFF"
      | "AWAITING_AUTHORIZATION"
      | "AWAITING_MUTATION_OR_FAILURE",
    recoveryPath:
      | "SELECT_READ_READY_ACCOUNT_WITH_SETTLED_CONTEXT"
      | "RECORD_REPRODUCIBLE_ANALYSIS_DEFINITION"
      | "INSPECT_DELIVERY_BEFORE_CONVERSION"
      | "RECORD_TYPED_CHANGE_PROPOSAL"
      | "RECORD_REVISION_BOUND_FINANCIAL_DIFF"
      | "RESOLVE_SHARED_BUDGET_IMPACT"
      | "RECORD_AUTHORIZATION_DECISION"
      | "RECORD_VERIFIED_MUTATION_OR_EXPLICIT_FAILURE"
      | "KEEP_FIXTURE_DECISION_NO_LIVE_MUTATE"
      | "VERIFY_CHATGPT_TRANSPORT_AND_ENTITLEMENT",
    chatgptAdsWiring: "ACCESS_BLOCKED" | "FIXTURE" | "N/A",
  ): NonNullable<
    Extract<
      ReviewPaidMediaRecommendationsDecision,
      { allowed: false }
    >["evidence"]
  > & { _chatgptAdsWiring: typeof chatgptAdsWiring } => ({
    packageId: input.packageId.trim() || null,
    selectionId: selection?.selectionId.trim() || null,
    platform: selection?.platform ?? null,
    accountId: selection?.accountId.trim() || null,
    campaignId: selection?.campaignId.trim() || null,
    definitionId: analysisDefinition?.definitionId.trim() || null,
    diagnosisId: diagnosis?.diagnosisId.trim() || null,
    proposalId: proposal?.proposalId.trim() || null,
    financialDiffId: financialDiff?.financialDiffId.trim() || null,
    authorizationId: authorization?.authorizationId.trim() || null,
    mutationOutcomeId: mutationOrFailure?.outcomeId.trim() || null,
    mutationVerifiedLive: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
    _chatgptAdsWiring: chatgptAdsWiring,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      chatgptAdsWiring: "N/A",
      evidence: null,
      reasons: [
        "Live paid-media mutate remains NOT_WIRED — refuse live wiring (T-F16)",
      ],
    };
  }

  if (input.claimLiveVerifiedMutation) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_MUTATION_REFUSED",
      ...base,
      chatgptAdsWiring: "N/A",
      evidence: null,
      reasons: [
        "Refused false live-verified Ads mutation claim offline (T-F16) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (!input.packageId.trim() || !selectionOk(selection)) {
    const ev = blockedEvidence(
      "SELECTION_INCOMPLETE",
      "AWAITING_SELECTION",
      "SELECT_READ_READY_ACCOUNT_WITH_SETTLED_CONTEXT",
      "N/A",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "SELECTION_REQUIRED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 requires package id and read-ready account selection with comparable settled data + conversion context (T-F16)",
      ],
    };
  }

  if (selection.platform === "CHATGPT_ADS" && !chatgptFixtureAllowed) {
    const ev = blockedEvidence(
      "CHATGPT_ADS_ACCESS_BLOCKED",
      "ACCESS_BLOCKED",
      "VERIFY_CHATGPT_TRANSPORT_AND_ENTITLEMENT",
      "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "CHATGPT_ADS_ACCESS_BLOCKED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "ChatGPT Ads ACCESS_BLOCKED without verified local transport and entitlement (T-F16); distinct from T-F07/T-US-013/T-US-014 ChatGPT Ads connect fixtures",
      ],
    };
  }

  if (!analysisOk(analysisDefinition)) {
    const ev = blockedEvidence(
      "ANALYSIS_DEFINITION_INCOMPLETE",
      "AWAITING_ANALYSIS_DEFINITION",
      "RECORD_REPRODUCIBLE_ANALYSIS_DEFINITION",
      selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "ANALYSIS_DEFINITION_REQUIRED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 requires reproducible analysis definition with definitionId, period, comparisonLabel, reportingTimezone (T-F16)",
      ],
    };
  }

  if (!diagnosisOk(diagnosis)) {
    const ev = blockedEvidence(
      "DIAGNOSIS_INCOMPLETE",
      "AWAITING_DIAGNOSIS",
      "INSPECT_DELIVERY_BEFORE_CONVERSION",
      selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "DIAGNOSIS_REQUIRED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 requires evidence-backed delivery diagnosis before conversion with diagnosisId + reasons (T-F16)",
      ],
    };
  }

  if (!proposalOk(proposal)) {
    const ev = blockedEvidence(
      "TYPED_PROPOSAL_INCOMPLETE",
      "AWAITING_TYPED_PROPOSAL",
      "RECORD_TYPED_CHANGE_PROPOSAL",
      selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "TYPED_PROPOSAL_REQUIRED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 requires typed change proposal with hypothesis, exactChange, risk, alternative (T-F16)",
      ],
    };
  }

  if (!financialOk(financialDiff, proposal.proposalId)) {
    const ev = blockedEvidence(
      "FINANCIAL_DIFF_INCOMPLETE",
      "AWAITING_FINANCIAL_DIFF",
      "RECORD_REVISION_BOUND_FINANCIAL_DIFF",
      selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "FINANCIAL_DIFF_REQUIRED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 requires revision-bound financial diff bound to proposalId with currency (T-F16)",
      ],
    };
  }

  if (!financialDiff.sharedBudgetImpactKnown) {
    const ev = blockedEvidence(
      "SHARED_BUDGET_IMPACT_UNKNOWN",
      "AWAITING_FINANCIAL_DIFF",
      "RESOLVE_SHARED_BUDGET_IMPACT",
      selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "SHARED_BUDGET_UNKNOWN",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 refuses recommendation when shared budget impact is unknown (T-F16)",
      ],
    };
  }

  if (!authorizationOk(authorization)) {
    const ev = blockedEvidence(
      "AUTHORIZATION_INCOMPLETE",
      "AWAITING_AUTHORIZATION",
      "RECORD_AUTHORIZATION_DECISION",
      selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "AUTHORIZATION_REQUIRED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 requires authorization record with actorRole, approve/decline decision, reason, authorizedAtIso (T-F16)",
      ],
    };
  }

  if (!mutationOk(mutationOrFailure, authorization.decision)) {
    const ev = blockedEvidence(
      "MUTATION_OR_FAILURE_INCOMPLETE",
      "AWAITING_MUTATION_OR_FAILURE",
      "RECORD_VERIFIED_MUTATION_OR_EXPLICIT_FAILURE",
      selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED",
    );
    const { _chatgptAdsWiring, ...evidence } = ev;
    return {
      allowed: false,
      code: "MUTATION_OR_FAILURE_REQUIRED",
      ...base,
      chatgptAdsWiring: _chatgptAdsWiring,
      evidence,
      reasons: [
        "F16 requires verified mutation or explicit failure (offline: honest NOT_WIRED failure after approve+execute, or decline with no execute) (T-F16)",
      ],
    };
  }

  const chatgptAdsWiring: "ACCESS_BLOCKED" | "FIXTURE" =
    selection.platform === "CHATGPT_ADS" ? "FIXTURE" : "ACCESS_BLOCKED";

  return {
    allowed: true,
    code: "REVIEW_PAID_MEDIA_RECOMMENDATIONS_EVIDENCE_RECORDED",
    ...base,
    decisionRecorded: true,
    mutationOrFailureRecorded: true,
    chatgptAdsWiring,
    evidence: {
      packageId: input.packageId.trim(),
      selectionId: selection.selectionId.trim(),
      platform: selection.platform,
      accountId: selection.accountId.trim(),
      campaignId: selection.campaignId.trim(),
      attributionBasis: selection.attributionBasis.trim(),
      accountReadReady: true,
      comparableSettledData: true,
      conversionContextPresent: true,
      definitionId: analysisDefinition.definitionId.trim(),
      comparisonLabel: analysisDefinition.comparisonLabel.trim(),
      reportingTimezone: analysisDefinition.reportingTimezone.trim(),
      diagnosisId: diagnosis.diagnosisId.trim(),
      diagnosisKind: diagnosis.kind,
      deliveryInspectedBeforeConversion: true,
      proposalId: proposal.proposalId.trim(),
      changeKind: proposal.changeKind,
      exactChange: proposal.exactChange.trim(),
      financialDiffId: financialDiff.financialDiffId.trim(),
      currency: financialDiff.currency.trim(),
      dailyBudgetBeforeMinor: financialDiff.dailyBudgetBeforeMinor,
      dailyBudgetAfterMinor: financialDiff.dailyBudgetAfterMinor,
      sharedBudgetAffected: financialDiff.sharedBudgetAffected,
      sharedBudgetImpactKnown: true,
      authorizationId: authorization.authorizationId.trim(),
      decision: authorization.decision,
      actorRole: authorization.actorRole.trim(),
      mutationOutcomeId: mutationOrFailure.outcomeId.trim(),
      mutationOutcome: mutationOrFailure.outcome,
      executeAttempted: mutationOrFailure.executeAttempted,
      failureRecorded: mutationOrFailure.failureRecorded,
      mutationVerifiedLive: false,
      blockingDecision: "F16_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "DECISION_RECORDED_MUTATION_OR_FAILURE",
      recoveryPath: "KEEP_FIXTURE_DECISION_NO_LIVE_MUTATE",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F16 evidence package recorded (read-ready selection, reproducible analysis definition, evidence-backed diagnosis, typed change proposal, revision-bound financial diff, authorization record, verified mutation or explicit failure); ChatGPT Ads ACCESS_BLOCKED on Google path; live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}
