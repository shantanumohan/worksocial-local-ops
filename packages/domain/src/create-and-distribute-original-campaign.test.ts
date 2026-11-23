import { describe, expect, it } from "vitest";
import {
  CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_RELATED_CASE_IDS,
  evaluateCreateAndDistributeOriginalCampaign,
  type CreateAndDistributeOriginalCampaignInput,
} from "./create-and-distribute-original-campaign.js";

function baseInput(
  overrides: Partial<CreateAndDistributeOriginalCampaignInput> = {},
): CreateAndDistributeOriginalCampaignInput {
  return {
    packageId: "pkg-f15-1",
    approvedFacts: {
      factSetId: "facts-f15-1",
      approvedFactIds: ["fact-hours", "fact-day-pass"],
    },
    venueMedia: {
      mediaInventoryId: "media-f15-1",
      licensedAssetIds: ["asset-lobby", "asset-desk"],
    },
    authorizedCapabilities: [
      {
        destinationId: "dest-cms",
        kind: "CMS",
        capability: "PUBLISH",
        authorized: true,
      },
      {
        destinationId: "dest-gbp",
        kind: "GBP",
        capability: "VARIANT",
        authorized: true,
      },
      {
        destinationId: "dest-social",
        kind: "SOCIAL",
        capability: "VARIANT",
        authorized: true,
      },
    ],
    brief: {
      briefId: "brief-f15-1",
      audienceNeed: "Promote weekday day-pass offer to Midtown professionals",
      sourceFactIds: ["fact-hours", "fact-day-pass"],
      outcome: "APPROVED",
    },
    draft: {
      draftId: "draft-f15-1",
      revisionHash: "revhash-f15-aabb",
      version: 2,
      body: "Canonical article: weekday day passes now available at Midtown.",
    },
    qa: {
      qaBundleId: "qa-f15-1",
      utilityPassed: true,
      brandPassed: true,
      sourcesPassed: true,
      accessibilityPassed: true,
    },
    destinationPreviews: [
      {
        destinationId: "dest-cms",
        kind: "CMS",
        previewId: "prev-cms-1",
        eligible: true,
        recoveryAction: null,
      },
      {
        destinationId: "dest-gbp",
        kind: "GBP",
        previewId: "prev-gbp-1",
        eligible: true,
        recoveryAction: null,
      },
      {
        destinationId: "dest-social",
        kind: "SOCIAL",
        previewId: "prev-social-1",
        eligible: false,
        recoveryAction: "Reconnect social OAuth and retry variant",
      },
    ],
    canonicalPublish: {
      publishReceiptId: "pub-canonical-f15-1",
      canonicalPagePath: "/blog/weekday-day-pass",
      recorded: true,
    },
    destinationOutcomes: [
      {
        destinationId: "dest-cms",
        outcome: "RECEIPT_RECORDED",
        receiptId: "rcpt-cms-1",
        recoveryAction: null,
      },
      {
        destinationId: "dest-gbp",
        outcome: "RECEIPT_RECORDED",
        receiptId: "rcpt-gbp-1",
        recoveryAction: null,
      },
      {
        destinationId: "dest-social",
        outcome: "BLOCKED_WITH_RECOVERY",
        receiptId: null,
        recoveryAction: "Reconnect social OAuth and retry variant",
      },
    ],
    measurement: {
      measurementId: "meas-f15-1",
      stateLabel: "OUTCOME_COLLECTION_READY",
      outcomeCollectionReady: true,
    },
    campaignManifestId: "manifest-f15-1",
    distributionReview: {
      reviewId: "dist-review-f15-1",
      outcomesReviewed: true,
      outcomeCollectionReviewed: true,
    },
    claimLiveVerifiedDistribution: false,
    requestLiveProviderWiring: false,
    requestUnauthorizedDestinationPublish: false,
    ...overrides,
  };
}

describe("evaluateCreateAndDistributeOriginalCampaign (T-F15)", () => {
  it("records complete F15 evidence package", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.campaignDistributedRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f15-1");
    expect(decision.evidence.briefId).toBe("brief-f15-1");
    expect(decision.evidence.briefOutcome).toBe("APPROVED");
    expect(decision.evidence.revisionHash).toBe("revhash-f15-aabb");
    expect(decision.evidence.canonicalPublishReceiptId).toBe(
      "pub-canonical-f15-1",
    );
    expect(decision.evidence.eligibleDestinationIds).toEqual([
      "dest-cms",
      "dest-gbp",
    ]);
    expect(decision.evidence.blockedDestinationIds).toEqual(["dest-social"]);
    expect(decision.evidence.receiptIds).toEqual(["rcpt-cms-1", "rcpt-gbp-1"]);
    expect(decision.evidence.distributionVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F15_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_RELATED_CASE_IDS).toEqual([
      "T-F15",
    ]);
  });

  it("refuses missing approved facts", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ approvedFacts: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("APPROVED_FACTS_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_APPROVED_FACTS");
  });

  it("refuses missing venue media", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ venueMedia: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("VENUE_MEDIA_REQUIRED");
  });

  it("refuses missing authorized capabilities", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ authorizedCapabilities: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AUTHORIZED_CAPABILITIES_REQUIRED");
  });

  it("refuses incomplete brief outcome", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ brief: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BRIEF_OUTCOME_REQUIRED");
  });

  it("refuses incomplete draft", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ draft: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DRAFT_REQUIRED");
  });

  it("refuses incomplete QA findings", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ qa: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("QA_FINDINGS_REQUIRED");
  });

  it("refuses missing destination previews", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ destinationPreviews: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DESTINATION_PREVIEWS_REQUIRED");
  });

  it("refuses blocked preview without recovery", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({
        destinationPreviews: [
          {
            destinationId: "dest-cms",
            kind: "CMS",
            previewId: "prev-cms-1",
            eligible: false,
            recoveryAction: null,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BLOCKED_CHANNEL_RECOVERY_REQUIRED");
  });

  it("refuses missing canonical publish", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ canonicalPublish: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CANONICAL_PUBLISH_REQUIRED");
  });

  it("refuses missing provider outcomes", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ destinationOutcomes: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROVIDER_OUTCOMES_REQUIRED");
  });

  it("refuses missing measurement state", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ measurement: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MEASUREMENT_STATE_REQUIRED");
  });

  it("refuses missing campaign manifest", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ campaignManifestId: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CAMPAIGN_MANIFEST_REQUIRED");
  });

  it("refuses missing distribution review", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ distributionReview: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DISTRIBUTION_REVIEW_REQUIRED");
  });

  it("refuses unauthorized destination publish", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ requestUnauthorizedDestinationPublish: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("UNAUTHORIZED_DESTINATION_PUBLISH_REFUSED");
  });

  it("refuses false live-verified distribution claim", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ claimLiveVerifiedDistribution: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_DISTRIBUTION_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateCreateAndDistributeOriginalCampaign(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
