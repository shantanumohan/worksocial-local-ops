/**
 * AA-19 / WP13–14 — review/analysis + paid-media proposals (fixture-only).
 *
 * F19: reproducible analysis definitions, hypotheses, redacted decision briefs.
 * F16: Google / ChatGPT paid-media recommendations with financial diffs.
 * ChatGPT Ads stays access-blocked without verified local transport + entitlement.
 * Live Ads mutations remain NOT_WIRED. External effects: NONE.
 * Catalog cases stay NOT_RUN — never silently VERIFIED.
 */

import {
  AnalyticsEnvironment,
  evaluateChatGptAdsAccess,
  type AnalyticsEnvironmentValue,
  type ChatGptAdsAccessDecision,
} from "./analytics.js";

export const PaidMediaPlatform = {
  GOOGLE_ADS: "google_ads",
  CHATGPT_ADS: "chatgpt_ads",
} as const;

export type PaidMediaPlatformValue =
  (typeof PaidMediaPlatform)[keyof typeof PaidMediaPlatform];

export const PaidMediaWiring = {
  FIXTURE: "FIXTURE",
  NOT_WIRED: "NOT_WIRED",
  ACCESS_BLOCKED: "ACCESS_BLOCKED",
} as const;

export type PaidMediaWiringValue =
  (typeof PaidMediaWiring)[keyof typeof PaidMediaWiring];

export const DeliveryDiagnosisKind = {
  NO_IMPRESSIONS: "no_impressions",
  LOW_CLICKS: "low_clicks",
  MISSING_EVENTS: "missing_events",
  DELAYED_ATTRIBUTION: "delayed_attribution",
  DELIVERY_OK: "delivery_ok",
  UNKNOWN: "unknown",
} as const;

export type DeliveryDiagnosisKindValue =
  (typeof DeliveryDiagnosisKind)[keyof typeof DeliveryDiagnosisKind];

export const PaidProposalStatus = {
  DRAFT: "draft",
  READY_FOR_REVIEW: "ready_for_review",
  APPROVED: "approved",
  DECLINED: "declined",
  BLOCKED: "blocked",
  /** Fixture review recorded — never a live verified mutation. */
  DECISION_RECORDED: "decision_recorded",
} as const;

export type PaidProposalStatusValue =
  (typeof PaidProposalStatus)[keyof typeof PaidProposalStatus];

export const PaidChangeKind = {
  BUDGET_ADJUST: "budget_adjust",
  BID_ADJUST: "bid_adjust",
  PAUSE_CAMPAIGN: "pause_campaign",
  ACTIVATE_CAMPAIGN: "activate_campaign",
  CREATE_CAMPAIGN: "create_campaign",
  OTHER: "other",
} as const;

export type PaidChangeKindValue =
  (typeof PaidChangeKind)[keyof typeof PaidChangeKind];

/** Catalog case ids related to analysis / paid media — do not mark VERIFIED without evidence. */
export const PAID_MEDIA_RELATED_CASE_IDS = [
  "T-F06",
  "T-F07",
  "T-F16",
  "T-F19",
  "T-US-011",
  "T-US-012",
  "T-US-013",
  "T-US-014",
  "T-US-031",
  "T-US-032",
  "T-US-037",
  "T-X034",
  "T-X035",
  "T-X036",
] as const;

export type AnalysisDefinition = {
  definitionId: string;
  siteId: string;
  periodStartIso: string;
  periodEndIso: string;
  comparisonLabel: string;
  reportingTimezone: string;
  environment: AnalyticsEnvironmentValue;
  createdAtIso: string;
};

export type AnalysisHypothesis = {
  hypothesisId: string;
  definitionId: string;
  statement: string;
  primaryOutcome: string;
  baseline: string;
  comparison: string;
  observationWindowDays: number;
  environment: AnalyticsEnvironmentValue;
  createdAtIso: string;
};

export type DecisionBrief = {
  briefId: string;
  definitionId: string;
  hypothesisId: string | null;
  title: string;
  summary: string;
  sourceCaveats: string[];
  proposedActions: string[];
  redacted: true;
  environment: AnalyticsEnvironmentValue;
  createdAtIso: string;
};

export type FinancialDiff = {
  currency: string;
  /** Daily budget before — null when unknown / N/A. */
  dailyBudgetBeforeMinor: number | null;
  dailyBudgetAfterMinor: number | null;
  lifetimeImpactMinor: number | null;
  sharedBudgetAffected: boolean;
  /** Block when shared budget impact is unknown (F16). */
  sharedBudgetImpactKnown: boolean;
  notes: string[];
};

export type DeliveryDiagnosis = {
  kind: DeliveryDiagnosisKindValue;
  impressions: number | null;
  clicks: number | null;
  eventsPresent: boolean;
  attributionSettled: boolean;
  reasons: string[];
};

export type PaidMediaProposal = {
  proposalId: string;
  platform: PaidMediaPlatformValue;
  accountId: string;
  campaignId: string;
  changeKind: PaidChangeKindValue;
  hypothesis: string;
  exactChange: string;
  risk: string;
  alternative: string;
  diagnosis: DeliveryDiagnosis;
  financialDiff: FinancialDiff;
  status: PaidProposalStatusValue;
  environment: AnalyticsEnvironmentValue;
  wiring: PaidMediaWiringValue;
  createdAtIso: string;
  updatedAtIso: string;
};

export type PaidMediaDecision = {
  decisionId: string;
  proposalId: string;
  decision: "approve" | "decline";
  actorRole: string;
  reason: string;
  recordedAtIso: string;
  /** Always false for fixture path — live mutations NOT_WIRED. */
  mutationAttempted: false;
  externalEffects: "NONE";
};

export type PaidMediaState = {
  version: 1;
  definitions: AnalysisDefinition[];
  hypotheses: AnalysisHypothesis[];
  briefs: DecisionBrief[];
  proposals: PaidMediaProposal[];
  decisions: PaidMediaDecision[];
  googleAdsWiring: PaidMediaWiringValue;
  chatgptAdsWiring: PaidMediaWiringValue;
  liveMutationWiring: "NOT_WIRED";
  productionActivated: false;
  updatedAtIso: string;
};

export function emptyPaidMediaState(nowIso: string): PaidMediaState {
  return {
    version: 1,
    definitions: [],
    hypotheses: [],
    briefs: [],
    proposals: [],
    decisions: [],
    googleAdsWiring: PaidMediaWiring.FIXTURE,
    chatgptAdsWiring: PaidMediaWiring.ACCESS_BLOCKED,
    liveMutationWiring: "NOT_WIRED",
    productionActivated: false,
    updatedAtIso: nowIso,
  };
}

export type CreateAnalysisDefinitionInput = {
  definitionId: string;
  siteId: string;
  periodStartIso: string;
  periodEndIso: string;
  comparisonLabel: string;
  reportingTimezone: string;
  environment?: AnalyticsEnvironmentValue;
  createdAtIso: string;
};

export function createAnalysisDefinition(
  input: CreateAnalysisDefinitionInput,
): AnalysisDefinition {
  const environment = input.environment ?? AnalyticsEnvironment.FIXTURE;
  if (environment === AnalyticsEnvironment.LIVE) {
    throw new Error(
      "Live analysis definitions refused — live GSC/GA4/Ads query transport remains NOT_WIRED",
    );
  }
  return {
    definitionId: input.definitionId,
    siteId: input.siteId,
    periodStartIso: input.periodStartIso,
    periodEndIso: input.periodEndIso,
    comparisonLabel: input.comparisonLabel,
    reportingTimezone: input.reportingTimezone,
    environment,
    createdAtIso: input.createdAtIso,
  };
}

export type CreateHypothesisInput = {
  hypothesisId: string;
  definitionId: string;
  statement: string;
  primaryOutcome: string;
  baseline: string;
  comparison: string;
  observationWindowDays: number;
  environment?: AnalyticsEnvironmentValue;
  createdAtIso: string;
};

export function createAnalysisHypothesis(
  input: CreateHypothesisInput,
):
  | { ok: true; hypothesis: AnalysisHypothesis }
  | { ok: false; code: "INCOMPLETE_HYPOTHESIS" | "LIVE_REFUSED"; reasons: string[] } {
  const environment = input.environment ?? AnalyticsEnvironment.FIXTURE;
  if (environment === AnalyticsEnvironment.LIVE) {
    return {
      ok: false,
      code: "LIVE_REFUSED",
      reasons: ["Live hypothesis persistence refused — transport NOT_WIRED"],
    };
  }
  if (
    !input.statement.trim() ||
    !input.primaryOutcome.trim() ||
    !input.baseline.trim() ||
    !input.comparison.trim() ||
    input.observationWindowDays < 1
  ) {
    return {
      ok: false,
      code: "INCOMPLETE_HYPOTHESIS",
      reasons: [
        "Hypothesis requires statement, primary outcome, baseline, comparison, and observation window ≥ 1 day",
      ],
    };
  }
  return {
    ok: true,
    hypothesis: {
      hypothesisId: input.hypothesisId,
      definitionId: input.definitionId,
      statement: input.statement.trim(),
      primaryOutcome: input.primaryOutcome.trim(),
      baseline: input.baseline.trim(),
      comparison: input.comparison.trim(),
      observationWindowDays: input.observationWindowDays,
      environment,
      createdAtIso: input.createdAtIso,
    },
  };
}

export type CreateDecisionBriefInput = {
  briefId: string;
  definitionId: string;
  hypothesisId?: string | null;
  title: string;
  summary: string;
  sourceCaveats: string[];
  proposedActions: string[];
  environment?: AnalyticsEnvironmentValue;
  createdAtIso: string;
};

export function createDecisionBrief(
  input: CreateDecisionBriefInput,
): DecisionBrief {
  return {
    briefId: input.briefId,
    definitionId: input.definitionId,
    hypothesisId: input.hypothesisId ?? null,
    title: input.title,
    summary: input.summary,
    sourceCaveats: [...input.sourceCaveats],
    proposedActions: [...input.proposedActions],
    redacted: true,
    environment: input.environment ?? AnalyticsEnvironment.FIXTURE,
    createdAtIso: input.createdAtIso,
  };
}

export type DiagnoseDeliveryInput = {
  impressions: number | null;
  clicks: number | null;
  eventsPresent: boolean;
  attributionSettled: boolean;
  /** Same-day spend incomplete — cannot recommend budget. */
  sameDaySpendComplete: boolean;
};

/**
 * Inspect delivery before diagnosing conversion (F16 step 2).
 * CPC undefined at zero clicks → N/A via UNKNOWN / LOW_CLICKS.
 */
export function diagnoseDelivery(
  input: DiagnoseDeliveryInput,
): DeliveryDiagnosis {
  if (input.impressions === null || input.clicks === null) {
    return {
      kind: DeliveryDiagnosisKind.UNKNOWN,
      impressions: input.impressions,
      clicks: input.clicks,
      eventsPresent: input.eventsPresent,
      attributionSettled: input.attributionSettled,
      reasons: [
        "Impressions/clicks omitted — UNKNOWN delivery, not zero (never invent CPC)",
      ],
    };
  }
  if (input.impressions === 0) {
    return {
      kind: DeliveryDiagnosisKind.NO_IMPRESSIONS,
      impressions: 0,
      clicks: input.clicks,
      eventsPresent: input.eventsPresent,
      attributionSettled: input.attributionSettled,
      reasons: ["No impressions — diagnose delivery before conversion"],
    };
  }
  if (input.clicks === 0) {
    return {
      kind: DeliveryDiagnosisKind.LOW_CLICKS,
      impressions: input.impressions,
      clicks: 0,
      eventsPresent: input.eventsPresent,
      attributionSettled: input.attributionSettled,
      reasons: ["Zero clicks — CPC is N/A; do not invent rates"],
    };
  }
  if (!input.eventsPresent) {
    return {
      kind: DeliveryDiagnosisKind.MISSING_EVENTS,
      impressions: input.impressions,
      clicks: input.clicks,
      eventsPresent: false,
      attributionSettled: input.attributionSettled,
      reasons: ["Clicks present but conversion events missing"],
    };
  }
  if (!input.attributionSettled || !input.sameDaySpendComplete) {
    return {
      kind: DeliveryDiagnosisKind.DELAYED_ATTRIBUTION,
      impressions: input.impressions,
      clicks: input.clicks,
      eventsPresent: input.eventsPresent,
      attributionSettled: input.attributionSettled,
      reasons: [
        !input.sameDaySpendComplete
          ? "Fresh same-day spend incomplete — no budget recommendation from partial totals"
          : "Attribution window not settled — delayed conversions possible",
      ],
    };
  }
  return {
    kind: DeliveryDiagnosisKind.DELIVERY_OK,
    impressions: input.impressions,
    clicks: input.clicks,
    eventsPresent: true,
    attributionSettled: true,
    reasons: ["Delivery settled enough for a typed fixture recommendation"],
  };
}

export type CreatePaidProposalInput = {
  proposalId: string;
  platform: PaidMediaPlatformValue;
  accountId: string;
  campaignId: string;
  changeKind: PaidChangeKindValue;
  hypothesis: string;
  exactChange: string;
  risk: string;
  alternative: string;
  diagnosis: DeliveryDiagnosis;
  financialDiff: FinancialDiff;
  chatgptAdsAccess?: ChatGptAdsAccessDecision;
  createdAtIso: string;
};

export type CreatePaidProposalResult =
  | { ok: true; proposal: PaidMediaProposal }
  | {
      ok: false;
      code:
        | "CHATGPT_ADS_BLOCKED"
        | "SHARED_BUDGET_UNKNOWN"
        | "PARTIAL_SPEND"
        | "INCOMPLETE_PROPOSAL";
      reasons: string[];
      proposal: PaidMediaProposal | null;
    };

/**
 * Build a typed paid-media change proposal (F16).
 * ChatGPT Ads proposals stay BLOCKED without transport+entitlement.
 * Shared-budget unknown blocks. Partial same-day spend blocks budget recs.
 */
export function createPaidMediaProposal(
  input: CreatePaidProposalInput,
): CreatePaidProposalResult {
  if (
    !input.hypothesis.trim() ||
    !input.exactChange.trim() ||
    !input.risk.trim() ||
    !input.alternative.trim()
  ) {
    return {
      ok: false,
      code: "INCOMPLETE_PROPOSAL",
      reasons: [
        "Proposal requires hypothesis, exact change, risk, and alternative",
      ],
      proposal: null,
    };
  }

  if (
    input.changeKind === PaidChangeKind.BUDGET_ADJUST &&
    input.diagnosis.kind === DeliveryDiagnosisKind.DELAYED_ATTRIBUTION
  ) {
    return {
      ok: false,
      code: "PARTIAL_SPEND",
      reasons: [
        "Budget recommendation blocked — spend/attribution not settled",
      ],
      proposal: null,
    };
  }

  if (
    input.financialDiff.sharedBudgetAffected &&
    !input.financialDiff.sharedBudgetImpactKnown
  ) {
    return {
      ok: false,
      code: "SHARED_BUDGET_UNKNOWN",
      reasons: ["Shared budget impact unknown — block recommendation (F16)"],
      proposal: null,
    };
  }

  let wiring: PaidMediaWiringValue = PaidMediaWiring.FIXTURE;
  let status: PaidProposalStatusValue = PaidProposalStatus.DRAFT;
  const reasons: string[] = [];

  if (input.platform === PaidMediaPlatform.CHATGPT_ADS) {
    const access =
      input.chatgptAdsAccess ??
      evaluateChatGptAdsAccess({
        localTransportVerified: false,
        entitlementVerified: false,
        authVerified: false,
        projectEnvironment: AnalyticsEnvironment.FIXTURE,
        requestedEnvironment: AnalyticsEnvironment.FIXTURE,
      });
    if (!access.allowed) {
      wiring = PaidMediaWiring.ACCESS_BLOCKED;
      status = PaidProposalStatus.BLOCKED;
      reasons.push(...access.reasons);
      return {
        ok: false,
        code: "CHATGPT_ADS_BLOCKED",
        reasons,
        proposal: {
          proposalId: input.proposalId,
          platform: input.platform,
          accountId: input.accountId,
          campaignId: input.campaignId,
          changeKind: input.changeKind,
          hypothesis: input.hypothesis.trim(),
          exactChange: input.exactChange.trim(),
          risk: input.risk.trim(),
          alternative: input.alternative.trim(),
          diagnosis: input.diagnosis,
          financialDiff: input.financialDiff,
          status,
          environment: AnalyticsEnvironment.NOT_WIRED,
          wiring,
          createdAtIso: input.createdAtIso,
          updatedAtIso: input.createdAtIso,
        },
      };
    }
  }

  return {
    ok: true,
    proposal: {
      proposalId: input.proposalId,
      platform: input.platform,
      accountId: input.accountId,
      campaignId: input.campaignId,
      changeKind: input.changeKind,
      hypothesis: input.hypothesis.trim(),
      exactChange: input.exactChange.trim(),
      risk: input.risk.trim(),
      alternative: input.alternative.trim(),
      diagnosis: input.diagnosis,
      financialDiff: input.financialDiff,
      status: PaidProposalStatus.READY_FOR_REVIEW,
      environment: AnalyticsEnvironment.FIXTURE,
      wiring,
      createdAtIso: input.createdAtIso,
      updatedAtIso: input.createdAtIso,
    },
  };
}

export type RecordPaidDecisionInput = {
  decisionId: string;
  proposal: PaidMediaProposal;
  decision: "approve" | "decline";
  actorRole: string;
  reason: string;
  recordedAtIso: string;
};

export type RecordPaidDecisionResult =
  | {
      ok: true;
      proposal: PaidMediaProposal;
      decision: PaidMediaDecision;
    }
  | { ok: false; code: string; reasons: string[] };

/**
 * Approve or decline a specific action (F16 step 5).
 * Records the decision; does not execute live mutations.
 */
export function recordPaidMediaDecision(
  input: RecordPaidDecisionInput,
): RecordPaidDecisionResult {
  if (input.proposal.status === PaidProposalStatus.BLOCKED) {
    return {
      ok: false,
      code: "PROPOSAL_BLOCKED",
      reasons: [
        "Blocked proposals (e.g. ChatGPT Ads access-blocked) cannot be approved for mutation",
      ],
    };
  }
  if (
    input.proposal.status !== PaidProposalStatus.READY_FOR_REVIEW &&
    input.proposal.status !== PaidProposalStatus.DRAFT
  ) {
    return {
      ok: false,
      code: "INVALID_STATUS",
      reasons: [`Proposal status ${input.proposal.status} is not reviewable`],
    };
  }
  if (!input.reason.trim()) {
    return {
      ok: false,
      code: "REASON_REQUIRED",
      reasons: ["Approve/decline requires a reason"],
    };
  }

  const nextStatus: PaidProposalStatusValue =
    input.decision === "approve"
      ? PaidProposalStatus.APPROVED
      : PaidProposalStatus.DECLINED;

  const decision: PaidMediaDecision = {
    decisionId: input.decisionId,
    proposalId: input.proposal.proposalId,
    decision: input.decision,
    actorRole: input.actorRole,
    reason: input.reason.trim(),
    recordedAtIso: input.recordedAtIso,
    mutationAttempted: false,
    externalEffects: "NONE",
  };

  return {
    ok: true,
    proposal: {
      ...input.proposal,
      status: nextStatus,
      updatedAtIso: input.recordedAtIso,
    },
    decision,
  };
}

export type ExecutePaidProposalInput = {
  proposal: PaidMediaProposal;
  /** Prefer live Ads mutation — always refused in AA-19. */
  preferLive?: boolean;
};

export type ExecutePaidProposalResult = {
  ok: false;
  code: "LIVE_MUTATION_NOT_WIRED" | "CHATGPT_ADS_BLOCKED" | "NOT_APPROVED";
  reasons: string[];
  externalEffects: "NONE";
  liveMutationWiring: "NOT_WIRED";
  acceptanceEqualsVerified: false;
};

/**
 * Execute only when authorized — live path remains NOT_WIRED (F16 step 6).
 * Fixture era never performs provider mutations.
 */
export function attemptPaidMediaExecution(
  input: ExecutePaidProposalInput,
): ExecutePaidProposalResult {
  if (input.proposal.platform === PaidMediaPlatform.CHATGPT_ADS) {
    return {
      ok: false,
      code: "CHATGPT_ADS_BLOCKED",
      reasons: [
        "ChatGPT Ads mutations blocked — access requires verified local transport and entitlement; adapter NOT_WIRED",
      ],
      externalEffects: "NONE",
      liveMutationWiring: "NOT_WIRED",
      acceptanceEqualsVerified: false,
    };
  }
  if (input.proposal.status !== PaidProposalStatus.APPROVED) {
    return {
      ok: false,
      code: "NOT_APPROVED",
      reasons: ["Only approved proposals may attempt execution"],
      externalEffects: "NONE",
      liveMutationWiring: "NOT_WIRED",
      acceptanceEqualsVerified: false,
    };
  }
  return {
    ok: false,
    code: "LIVE_MUTATION_NOT_WIRED",
    reasons: [
      input.preferLive
        ? "Live Google Ads mutation refused — live adapter NOT_WIRED (AA-19 fixture decision support only)"
        : "Paid-media execute path is NOT_WIRED — decision recorded without external effects",
    ],
    externalEffects: "NONE",
    liveMutationWiring: "NOT_WIRED",
    acceptanceEqualsVerified: false,
  };
}

/**
 * Platform wiring snapshot for owner-facing honesty.
 */
export function paidMediaChannelStatus(input?: {
  chatgptAdsAccess?: ChatGptAdsAccessDecision;
}): {
  googleAds: {
    wiring: PaidMediaWiringValue;
    readReady: boolean;
    writeReady: false;
    note: string;
  };
  chatgptAds: {
    wiring: PaidMediaWiringValue;
    readReady: false;
    writeReady: false;
    access: ChatGptAdsAccessDecision;
    note: string;
  };
  liveMutationWiring: "NOT_WIRED";
  externalEffects: "NONE";
  productionActivated: false;
} {
  const access =
    input?.chatgptAdsAccess ??
    evaluateChatGptAdsAccess({
      localTransportVerified: false,
      entitlementVerified: false,
      authVerified: false,
      projectEnvironment: AnalyticsEnvironment.FIXTURE,
      requestedEnvironment: AnalyticsEnvironment.FIXTURE,
    });

  return {
    googleAds: {
      wiring: PaidMediaWiring.FIXTURE,
      readReady: true,
      writeReady: false,
      note: "Google Ads fixture analysis only — spend mutations NOT_WIRED; Analyze-only capability",
    },
    chatgptAds: {
      wiring: PaidMediaWiring.ACCESS_BLOCKED,
      readReady: false,
      writeReady: false,
      access,
      note: "ChatGPT Ads access-blocked without verified local transport and entitlement",
    },
    liveMutationWiring: "NOT_WIRED",
    externalEffects: "NONE",
    productionActivated: false,
  };
}
