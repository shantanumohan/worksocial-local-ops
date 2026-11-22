/**
 * T-US-029 — Original campaign distribution (F15/SC-08) — campaign manifest.
 *
 * Offline fixture gate (happy-path family): build a campaign manifest from an
 * approved brief, versioned draft, independent QA, per-destination previews,
 * eligible destination receipts, and measurement state. Blocked channels keep
 * visible recovery actions. Live CMS/GBP/social adapters stay NOT_WIRED.
 * Distinct from T-X045 (partial campaign destination states), T-US-022
 * (unsupported destination capabilities), and T-US-030 (uncertain post
 * reconcile before retry). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type CampaignBriefEvidence = {
  briefId: string;
  audienceNeed: string;
  /** Source fact IDs backing the brief — empty = incomplete. */
  sourceFactIds: readonly string[];
};

export type VersionedDraftEvidence = {
  draftId: string;
  revisionHash: string;
  version: number;
  /** Draft body must be non-empty. */
  body: string;
};

export type CampaignQaFindings = {
  qaBundleId: string;
  utilityPassed: boolean;
  brandPassed: boolean;
  sourcesPassed: boolean;
  accessibilityPassed: boolean;
};

export type DestinationPreview = {
  destinationId: string;
  kind: "CMS" | "GBP" | "SOCIAL" | "OTHER";
  previewId: string;
  eligible: boolean;
  /** When ineligible/blocked, recovery action must be visible. */
  recoveryAction: string | null;
};

export type DestinationOutcome = {
  destinationId: string;
  /** Independent provider/fixture outcome label. */
  outcome:
    | "RECEIPT_RECORDED"
    | "BLOCKED_WITH_RECOVERY"
    | "FAILED"
    | "UNKNOWN_REMOTE";
  receiptId: string | null;
  recoveryAction: string | null;
};

export type MeasurementState = {
  measurementId: string;
  /** Fixture measurement watermark / state label. */
  stateLabel: string;
  outcomeCollectionReady: boolean;
};

export type CampaignManifestDistributionInput = {
  brief: CampaignBriefEvidence;
  draft: VersionedDraftEvidence;
  qa: CampaignQaFindings;
  destinationPreviews: readonly DestinationPreview[];
  destinationOutcomes: readonly DestinationOutcome[];
  measurement: MeasurementState;
  campaignManifestId: string | null;
  /** Attempt to claim live distribution success offline — must refuse. */
  claimLiveDistributionSuccess: boolean;
  /** Request live provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type CampaignManifestDistributionDecision =
  | {
      allowed: true;
      code: "CAMPAIGN_MANIFEST_RECORDED";
      campaignManifestRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        campaignManifestId: string;
        briefId: string;
        sourceFactIds: string[];
        draftId: string;
        revisionHash: string;
        draftVersion: number;
        qaBundleId: string;
        eligibleDestinationIds: string[];
        blockedDestinationIds: string[];
        receiptIds: string[];
        recoveryActions: string[];
        measurementId: string;
        measurementStateLabel: string;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "BRIEF_INCOMPLETE"
        | "DRAFT_INCOMPLETE"
        | "QA_FINDINGS_INCOMPLETE"
        | "DESTINATION_PREVIEWS_REQUIRED"
        | "BLOCKED_CHANNEL_RECOVERY_REQUIRED"
        | "ELIGIBLE_RECEIPT_REQUIRED"
        | "MEASUREMENT_STATE_REQUIRED"
        | "CAMPAIGN_MANIFEST_ID_REQUIRED"
        | "FALSE_LIVE_SUCCESS_CLAIM_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      campaignManifestRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

export const CAMPAIGN_MANIFEST_DISTRIBUTION_RELATED_CASE_IDS = [
  "T-US-029",
] as const;

/**
 * Evaluate the F15 original campaign distribution path offline.
 * Produces brief / draft / QA / per-destination preview + outcome /
 * measurement / campaign-manifest evidence; live stays NOT_WIRED.
 */
export function evaluateCampaignManifestDistribution(
  input: CampaignManifestDistributionInput,
): CampaignManifestDistributionDecision {
  const base = {
    campaignManifestRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      reasons: [
        "Live campaign distribution CMS/GBP/social apply remains NOT_WIRED — refuse live wiring (T-US-029)",
      ],
    };
  }

  if (input.claimLiveDistributionSuccess) {
    return {
      allowed: false,
      code: "FALSE_LIVE_SUCCESS_CLAIM_REFUSED",
      ...base,
      reasons: [
        "Refused false live distribution success claim on offline fixture surface (T-US-029)",
      ],
    };
  }

  const brief = input.brief;
  if (
    !brief.briefId.trim() ||
    !brief.audienceNeed.trim() ||
    brief.sourceFactIds.length === 0 ||
    brief.sourceFactIds.some((id) => !id.trim())
  ) {
    return {
      allowed: false,
      code: "BRIEF_INCOMPLETE",
      ...base,
      reasons: [
        "Campaign brief requires briefId, audienceNeed, and at least one sourceFactId (T-US-029)",
      ],
    };
  }

  const draft = input.draft;
  if (
    !draft.draftId.trim() ||
    !draft.revisionHash.trim() ||
    !draft.body.trim() ||
    !Number.isFinite(draft.version) ||
    draft.version < 1
  ) {
    return {
      allowed: false,
      code: "DRAFT_INCOMPLETE",
      ...base,
      reasons: [
        "Editable versioned draft requires draftId, revisionHash, non-empty body, and version>=1 (T-US-029)",
      ],
    };
  }

  const qa = input.qa;
  if (
    !qa.qaBundleId.trim() ||
    !qa.utilityPassed ||
    !qa.brandPassed ||
    !qa.sourcesPassed ||
    !qa.accessibilityPassed
  ) {
    return {
      allowed: false,
      code: "QA_FINDINGS_INCOMPLETE",
      ...base,
      reasons: [
        "Independent QA requires qaBundleId and passing utility, brand, sources, and accessibility (T-US-029)",
      ],
    };
  }

  if (input.destinationPreviews.length === 0) {
    return {
      allowed: false,
      code: "DESTINATION_PREVIEWS_REQUIRED",
      ...base,
      reasons: [
        "At least one per-destination preview is required before campaign manifest (T-US-029)",
      ],
    };
  }
  for (const preview of input.destinationPreviews) {
    if (!preview.destinationId.trim() || !preview.previewId.trim()) {
      return {
        allowed: false,
        code: "DESTINATION_PREVIEWS_REQUIRED",
        ...base,
        reasons: [
          "Each destination preview requires destinationId and previewId (T-US-029)",
        ],
      };
    }
    if (
      !preview.eligible &&
      (!preview.recoveryAction || !preview.recoveryAction.trim())
    ) {
      return {
        allowed: false,
        code: "BLOCKED_CHANNEL_RECOVERY_REQUIRED",
        ...base,
        reasons: [
          `Blocked/ineligible destination ${preview.destinationId} requires a visible recovery action (T-US-029)`,
        ],
      };
    }
  }

  if (input.destinationOutcomes.length === 0) {
    return {
      allowed: false,
      code: "ELIGIBLE_RECEIPT_REQUIRED",
      ...base,
      reasons: [
        "Independent provider outcomes are required for campaign distribution (T-US-029)",
      ],
    };
  }

  const previewIds = new Set(
    input.destinationPreviews.map((p) => p.destinationId),
  );
  let eligibleReceiptCount = 0;
  const receiptIds: string[] = [];
  const recoveryActions: string[] = [];
  const eligibleDestinationIds: string[] = [];
  const blockedDestinationIds: string[] = [];

  for (const outcome of input.destinationOutcomes) {
    if (!outcome.destinationId.trim() || !previewIds.has(outcome.destinationId)) {
      return {
        allowed: false,
        code: "ELIGIBLE_RECEIPT_REQUIRED",
        ...base,
        reasons: [
          `Destination outcome ${outcome.destinationId || "(empty)"} must reference a previewed destination (T-US-029)`,
        ],
      };
    }
    if (outcome.outcome === "RECEIPT_RECORDED") {
      if (!outcome.receiptId?.trim()) {
        return {
          allowed: false,
          code: "ELIGIBLE_RECEIPT_REQUIRED",
          ...base,
          reasons: [
            `Eligible destination ${outcome.destinationId} requires a receiptId (T-US-029)`,
          ],
        };
      }
      eligibleReceiptCount += 1;
      eligibleDestinationIds.push(outcome.destinationId);
      receiptIds.push(outcome.receiptId);
      continue;
    }
    if (
      outcome.outcome === "BLOCKED_WITH_RECOVERY" ||
      outcome.outcome === "FAILED" ||
      outcome.outcome === "UNKNOWN_REMOTE"
    ) {
      if (!outcome.recoveryAction?.trim()) {
        return {
          allowed: false,
          code: "BLOCKED_CHANNEL_RECOVERY_REQUIRED",
          ...base,
          reasons: [
            `Non-receipt outcome for ${outcome.destinationId} requires a visible recovery action (T-US-029)`,
          ],
        };
      }
      blockedDestinationIds.push(outcome.destinationId);
      recoveryActions.push(outcome.recoveryAction);
      continue;
    }
  }

  if (eligibleReceiptCount < 1) {
    return {
      allowed: false,
      code: "ELIGIBLE_RECEIPT_REQUIRED",
      ...base,
      reasons: [
        "At least one eligible destination must record a receipt (T-US-029)",
      ],
    };
  }

  const measurement = input.measurement;
  if (
    !measurement.measurementId.trim() ||
    !measurement.stateLabel.trim() ||
    !measurement.outcomeCollectionReady
  ) {
    return {
      allowed: false,
      code: "MEASUREMENT_STATE_REQUIRED",
      ...base,
      reasons: [
        "Campaign measurement state requires measurementId, stateLabel, and outcomeCollectionReady (T-US-029)",
      ],
    };
  }

  if (!input.campaignManifestId?.trim()) {
    return {
      allowed: false,
      code: "CAMPAIGN_MANIFEST_ID_REQUIRED",
      ...base,
      reasons: [
        "Campaign manifest id is required to record original campaign distribution (T-US-029)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CAMPAIGN_MANIFEST_RECORDED",
    campaignManifestRecorded: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      campaignManifestId: input.campaignManifestId,
      briefId: brief.briefId,
      sourceFactIds: [...brief.sourceFactIds],
      draftId: draft.draftId,
      revisionHash: draft.revisionHash,
      draftVersion: draft.version,
      qaBundleId: qa.qaBundleId,
      eligibleDestinationIds,
      blockedDestinationIds,
      receiptIds,
      recoveryActions,
      measurementId: measurement.measurementId,
      measurementStateLabel: measurement.stateLabel,
    },
    reasons: [
      `Brief ${brief.briefId} with sources [${brief.sourceFactIds.join(", ")}] → draft ${draft.draftId}@v${draft.version}`,
      `QA ${qa.qaBundleId} passed; eligible receipts [${receiptIds.join(", ")}]; blocked recovery [${recoveryActions.join(", ") || "none"}]`,
      `Campaign manifest ${input.campaignManifestId}; measurement ${measurement.measurementId}=${measurement.stateLabel}`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
