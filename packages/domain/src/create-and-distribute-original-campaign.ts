/**
 * T-F15 — Create and distribute an original campaign (complete F15 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F15 evidence
 * package — approved facts + venue media + authorized destination capabilities,
 * brief with source IDs and outcome, editable versioned canonical draft,
 * independent QA (utility/brand/sources/accessibility) with revision hash,
 * per-destination previews, canonical page + eligible variant publish receipts,
 * independent provider outcomes, campaign manifest, and measurement/outcome
 * collection with distribution review. Incomplete packages, blocked channels
 * without recovery, false live-verified claims, and live provider wiring are
 * refused. Live provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-029 (`CAMPAIGN_MANIFEST_DISTRIBUTION`) — this records the
 * complete F15 flow evidence package (structured package + Given prerequisites
 * + canonical publish + distribution review), not the campaign-manifest
 * happy-path summary alone. Distinct from T-X045 (partial destinations),
 * T-US-022 (unsupported capabilities), and T-US-030 (uncertain post reconcile).
 */

import type {
  CampaignBriefEvidence,
  CampaignQaFindings,
  DestinationOutcome,
  DestinationPreview,
  MeasurementState,
  VersionedDraftEvidence,
} from "./campaign-manifest-distribution.js";

export type ApprovedFactSet = {
  factSetId: string;
  /** Approved business fact IDs backing the campaign. */
  approvedFactIds: readonly string[];
};

export type VenueMediaInventory = {
  mediaInventoryId: string;
  /** Licensed venue media asset IDs used by the campaign. */
  licensedAssetIds: readonly string[];
};

export type AuthorizedDestinationCapability = {
  destinationId: string;
  kind: "CMS" | "GBP" | "SOCIAL" | "OTHER";
  /** Capability authorized for this destination (publish/variant). */
  capability: "PUBLISH" | "VARIANT" | "READ_ONLY";
  authorized: boolean;
};

export type BriefOutcome = {
  briefId: string;
  audienceNeed: string;
  sourceFactIds: readonly string[];
  /** Brief outcome label (approved / revised / blocked). */
  outcome: "APPROVED" | "REVISED" | "BLOCKED";
};

export type CanonicalPublishReceipt = {
  publishReceiptId: string;
  canonicalPagePath: string;
  /** Fixture publish recorded (not live CMS). */
  recorded: boolean;
};

export type DistributionReview = {
  reviewId: string;
  /** Distribution outcomes reviewed by owner/fixture reviewer. */
  outcomesReviewed: boolean;
  /** Outcome collection ready for measurement. */
  outcomeCollectionReviewed: boolean;
};

export type CreateAndDistributeOriginalCampaignInput = {
  packageId: string;
  approvedFacts: ApprovedFactSet | null;
  venueMedia: VenueMediaInventory | null;
  authorizedCapabilities: readonly AuthorizedDestinationCapability[] | null;
  brief: BriefOutcome | null;
  draft: VersionedDraftEvidence | null;
  qa: CampaignQaFindings | null;
  destinationPreviews: readonly DestinationPreview[] | null;
  canonicalPublish: CanonicalPublishReceipt | null;
  destinationOutcomes: readonly DestinationOutcome[] | null;
  measurement: MeasurementState | null;
  campaignManifestId: string | null;
  distributionReview: DistributionReview | null;
  /** Claim the F15 path is live-verified — must refuse offline. */
  claimLiveVerifiedDistribution: boolean;
  /** Request live CMS/GBP/social apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * Attempt to publish to an unauthorized / unsupported destination without
   * recovery — must refuse (T-US-022 / T-X045 territory).
   */
  requestUnauthorizedDestinationPublish: boolean;
};

export type CreateAndDistributeOriginalCampaignDecision =
  | {
      allowed: true;
      code: "CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_EVIDENCE_RECORDED";
      campaignDistributedRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        factSetId: string;
        approvedFactIds: string[];
        mediaInventoryId: string;
        licensedAssetIds: string[];
        authorizedDestinationIds: string[];
        briefId: string;
        audienceNeed: string;
        sourceFactIds: string[];
        briefOutcome: BriefOutcome["outcome"];
        draftId: string;
        revisionHash: string;
        draftVersion: number;
        qaBundleId: string;
        utilityPassed: true;
        brandPassed: true;
        sourcesPassed: true;
        accessibilityPassed: true;
        previewIds: string[];
        canonicalPublishReceiptId: string;
        canonicalPagePath: string;
        eligibleDestinationIds: string[];
        blockedDestinationIds: string[];
        receiptIds: string[];
        recoveryActions: string[];
        campaignManifestId: string;
        measurementId: string;
        measurementStateLabel: string;
        distributionReviewId: string;
        outcomesReviewed: true;
        outcomeCollectionReviewed: true;
        distributionVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F15_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "ORIGINAL_CAMPAIGN_DISTRIBUTED_MEASURABLE";
        recoveryPath: "KEEP_FIXTURE_DISTRIBUTION_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "APPROVED_FACTS_REQUIRED"
        | "VENUE_MEDIA_REQUIRED"
        | "AUTHORIZED_CAPABILITIES_REQUIRED"
        | "BRIEF_OUTCOME_REQUIRED"
        | "DRAFT_REQUIRED"
        | "QA_FINDINGS_REQUIRED"
        | "DESTINATION_PREVIEWS_REQUIRED"
        | "CANONICAL_PUBLISH_REQUIRED"
        | "PROVIDER_OUTCOMES_REQUIRED"
        | "BLOCKED_CHANNEL_RECOVERY_REQUIRED"
        | "MEASUREMENT_STATE_REQUIRED"
        | "CAMPAIGN_MANIFEST_REQUIRED"
        | "DISTRIBUTION_REVIEW_REQUIRED"
        | "UNAUTHORIZED_DESTINATION_PUBLISH_REFUSED"
        | "FALSE_LIVE_VERIFIED_DISTRIBUTION_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      campaignDistributedRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        factSetId: string | null;
        approvedFactIds: string[];
        mediaInventoryId: string | null;
        licensedAssetIds: string[];
        authorizedDestinationIds: string[];
        briefId: string | null;
        audienceNeed: string | null;
        sourceFactIds: string[];
        briefOutcome: BriefOutcome["outcome"] | null;
        draftId: string | null;
        revisionHash: string | null;
        draftVersion: number;
        qaBundleId: string | null;
        utilityPassed: boolean;
        brandPassed: boolean;
        sourcesPassed: boolean;
        accessibilityPassed: boolean;
        previewIds: string[];
        canonicalPublishReceiptId: string | null;
        canonicalPagePath: string | null;
        eligibleDestinationIds: string[];
        blockedDestinationIds: string[];
        receiptIds: string[];
        recoveryActions: string[];
        campaignManifestId: string | null;
        measurementId: string | null;
        measurementStateLabel: string | null;
        distributionReviewId: string | null;
        outcomesReviewed: boolean;
        outcomeCollectionReviewed: boolean;
        distributionVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_APPROVED_FACTS"
          | "AWAITING_VENUE_MEDIA"
          | "AWAITING_AUTHORIZED_CAPABILITIES"
          | "AWAITING_BRIEF_OUTCOME"
          | "AWAITING_DRAFT"
          | "AWAITING_QA_FINDINGS"
          | "AWAITING_DESTINATION_PREVIEWS"
          | "AWAITING_CANONICAL_PUBLISH"
          | "AWAITING_PROVIDER_OUTCOMES"
          | "AWAITING_MEASUREMENT_STATE"
          | "AWAITING_CAMPAIGN_MANIFEST"
          | "AWAITING_DISTRIBUTION_REVIEW";
        recoveryPath:
          | "APPROVE_BUSINESS_FACTS"
          | "LICENSE_VENUE_MEDIA"
          | "AUTHORIZE_DESTINATION_CAPABILITIES"
          | "CHOOSE_BRIEF_AND_AUDIENCE"
          | "DRAFT_CANONICAL_ARTICLE"
          | "REVIEW_UTILITY_BRAND_SOURCES_A11Y"
          | "PREVIEW_DESTINATION_VARIANTS"
          | "PUBLISH_CANONICAL_AND_ELIGIBLE_VARIANTS"
          | "RECORD_PROVIDER_OUTCOMES_WITH_RECOVERY"
          | "RECORD_MEASUREMENT_STATE"
          | "RECORD_CAMPAIGN_MANIFEST"
          | "REVIEW_DISTRIBUTION_AND_OUTCOME_COLLECTION"
          | "KEEP_FIXTURE_DISTRIBUTION_NO_LIVE_PROVIDER"
          | "REFUSE_UNAUTHORIZED_DESTINATION";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_RELATED_CASE_IDS = [
  "T-F15",
] as const;

function preservedInputCount(
  input: CreateAndDistributeOriginalCampaignInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.approvedFacts?.factSetId.trim() ? 1 : 0) +
    (input.venueMedia?.mediaInventoryId.trim() ? 1 : 0) +
    (input.authorizedCapabilities && input.authorizedCapabilities.length > 0
      ? 1
      : 0) +
    (input.brief?.briefId.trim() ? 1 : 0) +
    (input.draft?.draftId.trim() ? 1 : 0) +
    (input.qa?.qaBundleId.trim() ? 1 : 0) +
    (input.destinationPreviews && input.destinationPreviews.length > 0
      ? 1
      : 0) +
    (input.canonicalPublish?.publishReceiptId.trim() ? 1 : 0) +
    (input.destinationOutcomes && input.destinationOutcomes.length > 0
      ? 1
      : 0) +
    (input.measurement?.measurementId.trim() ? 1 : 0) +
    (input.campaignManifestId?.trim() ? 1 : 0) +
    (input.distributionReview?.reviewId.trim() ? 1 : 0)
  );
}

function factsOk(
  facts: ApprovedFactSet | null,
): facts is ApprovedFactSet {
  if (!facts) return false;
  return (
    facts.factSetId.trim().length > 0 &&
    facts.approvedFactIds.length > 0 &&
    facts.approvedFactIds.every((id) => id.trim().length > 0)
  );
}

function mediaOk(
  media: VenueMediaInventory | null,
): media is VenueMediaInventory {
  if (!media) return false;
  return (
    media.mediaInventoryId.trim().length > 0 &&
    media.licensedAssetIds.length > 0 &&
    media.licensedAssetIds.every((id) => id.trim().length > 0)
  );
}

function capabilitiesOk(
  caps: readonly AuthorizedDestinationCapability[] | null,
): caps is readonly AuthorizedDestinationCapability[] {
  if (!caps || caps.length === 0) return false;
  return caps.every(
    (c) =>
      c.destinationId.trim().length > 0 &&
      c.authorized === true &&
      (c.capability === "PUBLISH" || c.capability === "VARIANT"),
  );
}

function briefOk(brief: BriefOutcome | null): brief is BriefOutcome {
  if (!brief) return false;
  return (
    brief.briefId.trim().length > 0 &&
    brief.audienceNeed.trim().length > 0 &&
    brief.sourceFactIds.length > 0 &&
    brief.sourceFactIds.every((id) => id.trim().length > 0) &&
    (brief.outcome === "APPROVED" || brief.outcome === "REVISED")
  );
}

function draftOk(
  draft: VersionedDraftEvidence | null,
): draft is VersionedDraftEvidence {
  if (!draft) return false;
  return (
    draft.draftId.trim().length > 0 &&
    draft.revisionHash.trim().length > 0 &&
    draft.body.trim().length > 0 &&
    Number.isFinite(draft.version) &&
    draft.version >= 1
  );
}

function qaOk(
  qa: CampaignQaFindings | null,
): qa is CampaignQaFindings {
  if (!qa) return false;
  return (
    qa.qaBundleId.trim().length > 0 &&
    qa.utilityPassed === true &&
    qa.brandPassed === true &&
    qa.sourcesPassed === true &&
    qa.accessibilityPassed === true
  );
}

function previewsOk(
  previews: readonly DestinationPreview[] | null,
): previews is readonly DestinationPreview[] {
  if (!previews || previews.length === 0) return false;
  return previews.every((p) => {
    if (!p.destinationId.trim() || !p.previewId.trim()) return false;
    if (!p.eligible && (!p.recoveryAction || !p.recoveryAction.trim())) {
      return false;
    }
    return true;
  });
}

function publishOk(
  publish: CanonicalPublishReceipt | null,
): publish is CanonicalPublishReceipt {
  if (!publish) return false;
  return (
    publish.publishReceiptId.trim().length > 0 &&
    publish.canonicalPagePath.trim().length > 0 &&
    publish.recorded === true
  );
}

function measurementOk(
  measurement: MeasurementState | null,
): measurement is MeasurementState {
  if (!measurement) return false;
  return (
    measurement.measurementId.trim().length > 0 &&
    measurement.stateLabel.trim().length > 0 &&
    measurement.outcomeCollectionReady === true
  );
}

function reviewOk(
  review: DistributionReview | null,
): review is DistributionReview {
  if (!review) return false;
  return (
    review.reviewId.trim().length > 0 &&
    review.outcomesReviewed === true &&
    review.outcomeCollectionReviewed === true
  );
}

/**
 * Evaluate the T-F15 create-and-distribute-original-campaign path offline.
 * Complete F15 evidence package → CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateCreateAndDistributeOriginalCampaign(
  input: CreateAndDistributeOriginalCampaignInput,
): CreateAndDistributeOriginalCampaignDecision {
  const base = {
    campaignDistributedRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const facts = input.approvedFacts;
  const media = input.venueMedia;
  const caps = input.authorizedCapabilities;
  const brief = input.brief;
  const draft = input.draft;
  const qa = input.qa;
  const previews = input.destinationPreviews;
  const publish = input.canonicalPublish;
  const outcomes = input.destinationOutcomes;
  const measurement = input.measurement;
  const review = input.distributionReview;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_APPROVED_FACTS"
      | "AWAITING_VENUE_MEDIA"
      | "AWAITING_AUTHORIZED_CAPABILITIES"
      | "AWAITING_BRIEF_OUTCOME"
      | "AWAITING_DRAFT"
      | "AWAITING_QA_FINDINGS"
      | "AWAITING_DESTINATION_PREVIEWS"
      | "AWAITING_CANONICAL_PUBLISH"
      | "AWAITING_PROVIDER_OUTCOMES"
      | "AWAITING_MEASUREMENT_STATE"
      | "AWAITING_CAMPAIGN_MANIFEST"
      | "AWAITING_DISTRIBUTION_REVIEW",
    recoveryPath:
      | "APPROVE_BUSINESS_FACTS"
      | "LICENSE_VENUE_MEDIA"
      | "AUTHORIZE_DESTINATION_CAPABILITIES"
      | "CHOOSE_BRIEF_AND_AUDIENCE"
      | "DRAFT_CANONICAL_ARTICLE"
      | "REVIEW_UTILITY_BRAND_SOURCES_A11Y"
      | "PREVIEW_DESTINATION_VARIANTS"
      | "PUBLISH_CANONICAL_AND_ELIGIBLE_VARIANTS"
      | "RECORD_PROVIDER_OUTCOMES_WITH_RECOVERY"
      | "RECORD_MEASUREMENT_STATE"
      | "RECORD_CAMPAIGN_MANIFEST"
      | "REVIEW_DISTRIBUTION_AND_OUTCOME_COLLECTION"
      | "KEEP_FIXTURE_DISTRIBUTION_NO_LIVE_PROVIDER"
      | "REFUSE_UNAUTHORIZED_DESTINATION",
  ): NonNullable<
    Extract<
      CreateAndDistributeOriginalCampaignDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    factSetId: facts?.factSetId.trim() || null,
    approvedFactIds: facts?.approvedFactIds.map((id) => id.trim()) ?? [],
    mediaInventoryId: media?.mediaInventoryId.trim() || null,
    licensedAssetIds: media?.licensedAssetIds.map((id) => id.trim()) ?? [],
    authorizedDestinationIds:
      caps?.filter((c) => c.authorized).map((c) => c.destinationId.trim()) ??
      [],
    briefId: brief?.briefId.trim() || null,
    audienceNeed: brief?.audienceNeed.trim() || null,
    sourceFactIds: brief?.sourceFactIds.map((id) => id.trim()) ?? [],
    briefOutcome: brief?.outcome ?? null,
    draftId: draft?.draftId.trim() || null,
    revisionHash: draft?.revisionHash.trim() || null,
    draftVersion: draft?.version ?? 0,
    qaBundleId: qa?.qaBundleId.trim() || null,
    utilityPassed: qa?.utilityPassed === true,
    brandPassed: qa?.brandPassed === true,
    sourcesPassed: qa?.sourcesPassed === true,
    accessibilityPassed: qa?.accessibilityPassed === true,
    previewIds: previews?.map((p) => p.previewId.trim()) ?? [],
    canonicalPublishReceiptId: publish?.publishReceiptId.trim() || null,
    canonicalPagePath: publish?.canonicalPagePath.trim() || null,
    eligibleDestinationIds: [],
    blockedDestinationIds: [],
    receiptIds: [],
    recoveryActions: [],
    campaignManifestId: input.campaignManifestId?.trim() || null,
    measurementId: measurement?.measurementId.trim() || null,
    measurementStateLabel: measurement?.stateLabel.trim() || null,
    distributionReviewId: review?.reviewId.trim() || null,
    outcomesReviewed: review?.outcomesReviewed === true,
    outcomeCollectionReviewed: review?.outcomeCollectionReviewed === true,
    distributionVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live campaign distribution CMS/GBP/social apply remains NOT_WIRED — refuse live wiring (T-F15)",
      ],
    };
  }

  if (input.claimLiveVerifiedDistribution) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_DISTRIBUTION_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified original campaign distribution claim offline (T-F15) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.requestUnauthorizedDestinationPublish) {
    return {
      allowed: false,
      code: "UNAUTHORIZED_DESTINATION_PUBLISH_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "UNAUTHORIZED_DESTINATION_PUBLISH_REFUSED",
        "BLOCKED",
        "REFUSE_UNAUTHORIZED_DESTINATION",
      ),
      reasons: [
        "Unauthorized / unsupported destination publish refused (T-F15); capability and recovery gates are T-US-022 / T-X045",
      ],
    };
  }

  if (!input.packageId.trim() || !factsOk(facts)) {
    return {
      allowed: false,
      code: "APPROVED_FACTS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "APPROVED_FACTS_INCOMPLETE",
        "AWAITING_APPROVED_FACTS",
        "APPROVE_BUSINESS_FACTS",
      ),
      reasons: [
        "F15 requires package id and approved facts with factSetId + at least one approvedFactId (T-F15)",
      ],
    };
  }

  if (!mediaOk(media)) {
    return {
      allowed: false,
      code: "VENUE_MEDIA_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "VENUE_MEDIA_INCOMPLETE",
        "AWAITING_VENUE_MEDIA",
        "LICENSE_VENUE_MEDIA",
      ),
      reasons: [
        "F15 requires licensed venue media inventory with mediaInventoryId + licensedAssetIds (T-F15)",
      ],
    };
  }

  if (!capabilitiesOk(caps)) {
    return {
      allowed: false,
      code: "AUTHORIZED_CAPABILITIES_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "AUTHORIZED_CAPABILITIES_INCOMPLETE",
        "AWAITING_AUTHORIZED_CAPABILITIES",
        "AUTHORIZE_DESTINATION_CAPABILITIES",
      ),
      reasons: [
        "F15 requires authorized destination capabilities (PUBLISH/VARIANT) for each destination (T-F15)",
      ],
    };
  }

  if (!briefOk(brief)) {
    return {
      allowed: false,
      code: "BRIEF_OUTCOME_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BRIEF_OUTCOME_INCOMPLETE",
        "AWAITING_BRIEF_OUTCOME",
        "CHOOSE_BRIEF_AND_AUDIENCE",
      ),
      reasons: [
        "F15 requires brief with briefId, audienceNeed, sourceFactIds, and APPROVED/REVISED outcome (T-F15)",
      ],
    };
  }

  if (!draftOk(draft)) {
    return {
      allowed: false,
      code: "DRAFT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DRAFT_INCOMPLETE",
        "AWAITING_DRAFT",
        "DRAFT_CANONICAL_ARTICLE",
      ),
      reasons: [
        "F15 requires editable versioned canonical draft with draftId, revisionHash, body, version>=1 (T-F15)",
      ],
    };
  }

  if (!qaOk(qa)) {
    return {
      allowed: false,
      code: "QA_FINDINGS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "QA_FINDINGS_INCOMPLETE",
        "AWAITING_QA_FINDINGS",
        "REVIEW_UTILITY_BRAND_SOURCES_A11Y",
      ),
      reasons: [
        "F15 requires QA findings with qaBundleId and passing utility, brand, sources, accessibility (T-F15)",
      ],
    };
  }

  const missingPreviewRecovery =
    Array.isArray(previews) &&
    previews.some(
      (p) =>
        !p.eligible && (!p.recoveryAction || !p.recoveryAction.trim()),
    );
  if (missingPreviewRecovery) {
    return {
      allowed: false,
      code: "BLOCKED_CHANNEL_RECOVERY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BLOCKED_CHANNEL_RECOVERY_MISSING",
        "AWAITING_DESTINATION_PREVIEWS",
        "PREVIEW_DESTINATION_VARIANTS",
      ),
      reasons: [
        "Blocked/ineligible destination preview requires a visible recovery action (T-F15)",
      ],
    };
  }
  if (!previewsOk(previews)) {
    return {
      allowed: false,
      code: "DESTINATION_PREVIEWS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DESTINATION_PREVIEWS_INCOMPLETE",
        "AWAITING_DESTINATION_PREVIEWS",
        "PREVIEW_DESTINATION_VARIANTS",
      ),
      reasons: [
        "F15 requires per-destination previews with destinationId + previewId (T-F15)",
      ],
    };
  }

  if (!publishOk(publish)) {
    return {
      allowed: false,
      code: "CANONICAL_PUBLISH_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CANONICAL_PUBLISH_INCOMPLETE",
        "AWAITING_CANONICAL_PUBLISH",
        "PUBLISH_CANONICAL_AND_ELIGIBLE_VARIANTS",
      ),
      reasons: [
        "F15 requires canonical page publish receipt with publishReceiptId, path, and recorded=true (T-F15)",
      ],
    };
  }

  if (!outcomes || outcomes.length === 0) {
    return {
      allowed: false,
      code: "PROVIDER_OUTCOMES_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PROVIDER_OUTCOMES_INCOMPLETE",
        "AWAITING_PROVIDER_OUTCOMES",
        "RECORD_PROVIDER_OUTCOMES_WITH_RECOVERY",
      ),
      reasons: [
        "F15 requires independent provider outcomes for campaign distribution (T-F15)",
      ],
    };
  }

  const previewIds = new Set(previews.map((p) => p.destinationId));
  const authorizedIds = new Set(caps.map((c) => c.destinationId));
  let eligibleReceiptCount = 0;
  const receiptIds: string[] = [];
  const recoveryActions: string[] = [];
  const eligibleDestinationIds: string[] = [];
  const blockedDestinationIds: string[] = [];

  for (const outcome of outcomes) {
    if (
      !outcome.destinationId.trim() ||
      !previewIds.has(outcome.destinationId) ||
      !authorizedIds.has(outcome.destinationId)
    ) {
      return {
        allowed: false,
        code: "PROVIDER_OUTCOMES_REQUIRED",
        ...base,
        evidence: blockedEvidence(
          "PROVIDER_OUTCOMES_MISMATCH",
          "AWAITING_PROVIDER_OUTCOMES",
          "RECORD_PROVIDER_OUTCOMES_WITH_RECOVERY",
        ),
        reasons: [
          `Destination outcome ${outcome.destinationId || "(empty)"} must reference a previewed authorized destination (T-F15)`,
        ],
      };
    }
    if (outcome.outcome === "RECEIPT_RECORDED") {
      if (!outcome.receiptId?.trim()) {
        return {
          allowed: false,
          code: "PROVIDER_OUTCOMES_REQUIRED",
          ...base,
          evidence: blockedEvidence(
            "ELIGIBLE_RECEIPT_MISSING",
            "AWAITING_PROVIDER_OUTCOMES",
            "RECORD_PROVIDER_OUTCOMES_WITH_RECOVERY",
          ),
          reasons: [
            `Eligible destination ${outcome.destinationId} requires a receiptId (T-F15)`,
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
          evidence: blockedEvidence(
            "BLOCKED_CHANNEL_RECOVERY_MISSING",
            "AWAITING_PROVIDER_OUTCOMES",
            "RECORD_PROVIDER_OUTCOMES_WITH_RECOVERY",
          ),
          reasons: [
            `Non-receipt outcome for ${outcome.destinationId} requires a visible recovery action (T-F15)`,
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
      code: "PROVIDER_OUTCOMES_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ELIGIBLE_RECEIPT_MISSING",
        "AWAITING_PROVIDER_OUTCOMES",
        "RECORD_PROVIDER_OUTCOMES_WITH_RECOVERY",
      ),
      reasons: [
        "At least one eligible destination must record a receipt (T-F15)",
      ],
    };
  }

  if (!measurementOk(measurement)) {
    return {
      allowed: false,
      code: "MEASUREMENT_STATE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MEASUREMENT_STATE_INCOMPLETE",
        "AWAITING_MEASUREMENT_STATE",
        "RECORD_MEASUREMENT_STATE",
      ),
      reasons: [
        "F15 requires measurement state with measurementId, stateLabel, and outcomeCollectionReady (T-F15)",
      ],
    };
  }

  if (!input.campaignManifestId?.trim()) {
    return {
      allowed: false,
      code: "CAMPAIGN_MANIFEST_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CAMPAIGN_MANIFEST_INCOMPLETE",
        "AWAITING_CAMPAIGN_MANIFEST",
        "RECORD_CAMPAIGN_MANIFEST",
      ),
      reasons: [
        "F15 requires campaign manifest id to record original campaign distribution (T-F15)",
      ],
    };
  }

  if (!reviewOk(review)) {
    return {
      allowed: false,
      code: "DISTRIBUTION_REVIEW_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DISTRIBUTION_REVIEW_INCOMPLETE",
        "AWAITING_DISTRIBUTION_REVIEW",
        "REVIEW_DISTRIBUTION_AND_OUTCOME_COLLECTION",
      ),
      reasons: [
        "F15 requires distribution review with outcomesReviewed and outcomeCollectionReviewed (T-F15)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_EVIDENCE_RECORDED",
    ...base,
    campaignDistributedRecorded: true,
    evidence: {
      packageId: input.packageId.trim(),
      factSetId: facts.factSetId.trim(),
      approvedFactIds: facts.approvedFactIds.map((id) => id.trim()),
      mediaInventoryId: media.mediaInventoryId.trim(),
      licensedAssetIds: media.licensedAssetIds.map((id) => id.trim()),
      authorizedDestinationIds: caps.map((c) => c.destinationId.trim()),
      briefId: brief.briefId.trim(),
      audienceNeed: brief.audienceNeed.trim(),
      sourceFactIds: brief.sourceFactIds.map((id) => id.trim()),
      briefOutcome: brief.outcome,
      draftId: draft.draftId.trim(),
      revisionHash: draft.revisionHash.trim(),
      draftVersion: draft.version,
      qaBundleId: qa.qaBundleId.trim(),
      utilityPassed: true,
      brandPassed: true,
      sourcesPassed: true,
      accessibilityPassed: true,
      previewIds: previews.map((p) => p.previewId.trim()),
      canonicalPublishReceiptId: publish.publishReceiptId.trim(),
      canonicalPagePath: publish.canonicalPagePath.trim(),
      eligibleDestinationIds,
      blockedDestinationIds,
      receiptIds,
      recoveryActions,
      campaignManifestId: input.campaignManifestId.trim(),
      measurementId: measurement.measurementId.trim(),
      measurementStateLabel: measurement.stateLabel.trim(),
      distributionReviewId: review.reviewId.trim(),
      outcomesReviewed: true,
      outcomeCollectionReviewed: true,
      distributionVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F15_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "ORIGINAL_CAMPAIGN_DISTRIBUTED_MEASURABLE",
      recoveryPath: "KEEP_FIXTURE_DISTRIBUTION_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F15 evidence package recorded (approved facts, venue media, authorized capabilities, brief+outcome, versioned draft, QA, previews, canonical publish, provider outcomes, campaign manifest, measurement, distribution review); live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}

export type {
  CampaignBriefEvidence,
  CampaignQaFindings,
  DestinationOutcome,
  DestinationPreview,
  MeasurementState,
  VersionedDraftEvidence,
};
