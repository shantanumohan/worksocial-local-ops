/**
 * Fixture proof for T-F15 — Create and distribute an original campaign.
 * Complete F15 evidence package: approved facts, venue media, authorized
 * capabilities, brief+outcome, versioned draft, QA, previews, canonical
 * publish, provider outcomes, campaign manifest, measurement, distribution
 * review; unsafe claims refused; live providers NOT_WIRED. Distinct from
 * T-US-029 campaign-manifest summary, T-X045 partial destinations,
 * T-US-022 unsupported capabilities, and T-US-030 uncertain post reconcile.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateCreateAndDistributeOriginalCampaign,
  type CreateAndDistributeOriginalCampaignInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<CreateAndDistributeOriginalCampaignInput> = {},
): CreateAndDistributeOriginalCampaignInput {
  return {
    packageId: "pkg-f15-soak",
    approvedFacts: {
      factSetId: "facts-f15-soak",
      approvedFactIds: ["fact-hours-soak", "fact-day-pass-soak"],
    },
    venueMedia: {
      mediaInventoryId: "media-f15-soak",
      licensedAssetIds: ["asset-lobby-soak", "asset-desk-soak"],
    },
    authorizedCapabilities: [
      {
        destinationId: "dest-cms-soak",
        kind: "CMS",
        capability: "PUBLISH",
        authorized: true,
      },
      {
        destinationId: "dest-gbp-soak",
        kind: "GBP",
        capability: "VARIANT",
        authorized: true,
      },
      {
        destinationId: "dest-social-soak",
        kind: "SOCIAL",
        capability: "VARIANT",
        authorized: true,
      },
    ],
    brief: {
      briefId: "brief-f15-soak",
      audienceNeed: "Promote weekday day-pass offer to Midtown professionals",
      sourceFactIds: ["fact-hours-soak", "fact-day-pass-soak"],
      outcome: "APPROVED",
    },
    draft: {
      draftId: "draft-f15-soak",
      revisionHash: "revhash-f15-soak",
      version: 2,
      body: "Canonical article: weekday day passes now available at Midtown.",
    },
    qa: {
      qaBundleId: "qa-f15-soak",
      utilityPassed: true,
      brandPassed: true,
      sourcesPassed: true,
      accessibilityPassed: true,
    },
    destinationPreviews: [
      {
        destinationId: "dest-cms-soak",
        kind: "CMS",
        previewId: "prev-cms-soak",
        eligible: true,
        recoveryAction: null,
      },
      {
        destinationId: "dest-gbp-soak",
        kind: "GBP",
        previewId: "prev-gbp-soak",
        eligible: true,
        recoveryAction: null,
      },
      {
        destinationId: "dest-social-soak",
        kind: "SOCIAL",
        previewId: "prev-social-soak",
        eligible: false,
        recoveryAction: "Reconnect social OAuth and retry variant",
      },
    ],
    canonicalPublish: {
      publishReceiptId: "pub-canonical-f15-soak",
      canonicalPagePath: "/blog/weekday-day-pass",
      recorded: true,
    },
    destinationOutcomes: [
      {
        destinationId: "dest-cms-soak",
        outcome: "RECEIPT_RECORDED",
        receiptId: "rcpt-cms-soak",
        recoveryAction: null,
      },
      {
        destinationId: "dest-gbp-soak",
        outcome: "RECEIPT_RECORDED",
        receiptId: "rcpt-gbp-soak",
        recoveryAction: null,
      },
      {
        destinationId: "dest-social-soak",
        outcome: "BLOCKED_WITH_RECOVERY",
        receiptId: null,
        recoveryAction: "Reconnect social OAuth and retry variant",
      },
    ],
    measurement: {
      measurementId: "meas-f15-soak",
      stateLabel: "OUTCOME_COLLECTION_READY",
      outcomeCollectionReady: true,
    },
    campaignManifestId: "manifest-f15-soak",
    distributionReview: {
      reviewId: "dist-review-f15-soak",
      outcomesReviewed: true,
      outcomeCollectionReviewed: true,
    },
    claimLiveVerifiedDistribution: false,
    requestLiveProviderWiring: false,
    requestUnauthorizedDestinationPublish: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F15 fixture ACCEPTED.
 */
export function proofCreateAndDistributeOriginalCampaign(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateCreateAndDistributeOriginalCampaign(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_EVIDENCE_RECORDED" &&
    happy.evidence.distributionVerifiedLive === false &&
    happy.campaignDistributedRecorded === true &&
    happy.evidence.outcomesReviewed === true &&
    happy.evidence.outcomeCollectionReviewed === true &&
    happy.evidence.eligibleDestinationIds.length >= 1 &&
    happy.evidence.blockedDestinationIds.length >= 1 &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F15 evidence package → CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN_EVIDENCE_RECORDED; approved facts; venue media; authorized capabilities; brief+outcome; versioned draft; QA; previews; canonical publish; provider outcomes; campaign manifest; measurement; distribution review; distributionVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noFacts = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ approvedFacts: null }),
  );
  if (!noFacts.allowed && noFacts.code === "APPROVED_FACTS_REQUIRED") {
    details.push("approvedFacts=null → APPROVED_FACTS_REQUIRED");
  } else {
    passed = false;
    details.push(`Approved facts unexpectedly ${JSON.stringify(noFacts)}`);
  }

  const noMedia = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ venueMedia: null }),
  );
  if (!noMedia.allowed && noMedia.code === "VENUE_MEDIA_REQUIRED") {
    details.push("venueMedia=null → VENUE_MEDIA_REQUIRED");
  } else {
    passed = false;
    details.push(`Venue media unexpectedly ${JSON.stringify(noMedia)}`);
  }

  const noCaps = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ authorizedCapabilities: null }),
  );
  if (!noCaps.allowed && noCaps.code === "AUTHORIZED_CAPABILITIES_REQUIRED") {
    details.push(
      "authorizedCapabilities=null → AUTHORIZED_CAPABILITIES_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Capabilities unexpectedly ${JSON.stringify(noCaps)}`);
  }

  const noBrief = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ brief: null }),
  );
  if (!noBrief.allowed && noBrief.code === "BRIEF_OUTCOME_REQUIRED") {
    details.push("brief=null → BRIEF_OUTCOME_REQUIRED");
  } else {
    passed = false;
    details.push(`Brief unexpectedly ${JSON.stringify(noBrief)}`);
  }

  const noDraft = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ draft: null }),
  );
  if (!noDraft.allowed && noDraft.code === "DRAFT_REQUIRED") {
    details.push("draft=null → DRAFT_REQUIRED");
  } else {
    passed = false;
    details.push(`Draft unexpectedly ${JSON.stringify(noDraft)}`);
  }

  const noQa = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ qa: null }),
  );
  if (!noQa.allowed && noQa.code === "QA_FINDINGS_REQUIRED") {
    details.push("qa=null → QA_FINDINGS_REQUIRED");
  } else {
    passed = false;
    details.push(`QA unexpectedly ${JSON.stringify(noQa)}`);
  }

  const noPrev = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ destinationPreviews: null }),
  );
  if (!noPrev.allowed && noPrev.code === "DESTINATION_PREVIEWS_REQUIRED") {
    details.push("destinationPreviews=null → DESTINATION_PREVIEWS_REQUIRED");
  } else {
    passed = false;
    details.push(`Previews unexpectedly ${JSON.stringify(noPrev)}`);
  }

  const noPub = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ canonicalPublish: null }),
  );
  if (!noPub.allowed && noPub.code === "CANONICAL_PUBLISH_REQUIRED") {
    details.push("canonicalPublish=null → CANONICAL_PUBLISH_REQUIRED");
  } else {
    passed = false;
    details.push(`Canonical publish unexpectedly ${JSON.stringify(noPub)}`);
  }

  const noOut = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ destinationOutcomes: null }),
  );
  if (!noOut.allowed && noOut.code === "PROVIDER_OUTCOMES_REQUIRED") {
    details.push("destinationOutcomes=null → PROVIDER_OUTCOMES_REQUIRED");
  } else {
    passed = false;
    details.push(`Outcomes unexpectedly ${JSON.stringify(noOut)}`);
  }

  const noMeas = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ measurement: null }),
  );
  if (!noMeas.allowed && noMeas.code === "MEASUREMENT_STATE_REQUIRED") {
    details.push("measurement=null → MEASUREMENT_STATE_REQUIRED");
  } else {
    passed = false;
    details.push(`Measurement unexpectedly ${JSON.stringify(noMeas)}`);
  }

  const noManifest = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ campaignManifestId: null }),
  );
  if (!noManifest.allowed && noManifest.code === "CAMPAIGN_MANIFEST_REQUIRED") {
    details.push("campaignManifestId=null → CAMPAIGN_MANIFEST_REQUIRED");
  } else {
    passed = false;
    details.push(`Manifest unexpectedly ${JSON.stringify(noManifest)}`);
  }

  const noReview = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ distributionReview: null }),
  );
  if (
    !noReview.allowed &&
    noReview.code === "DISTRIBUTION_REVIEW_REQUIRED"
  ) {
    details.push("distributionReview=null → DISTRIBUTION_REVIEW_REQUIRED");
  } else {
    passed = false;
    details.push(`Distribution review unexpectedly ${JSON.stringify(noReview)}`);
  }

  const unauth = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ requestUnauthorizedDestinationPublish: true }),
  );
  if (
    !unauth.allowed &&
    unauth.code === "UNAUTHORIZED_DESTINATION_PUBLISH_REFUSED"
  ) {
    details.push(
      "requestUnauthorizedDestinationPublish → UNAUTHORIZED_DESTINATION_PUBLISH_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Unauthorized publish unexpectedly ${JSON.stringify(unauth)}`);
  }

  const liveClaim = evaluateCreateAndDistributeOriginalCampaign(
    baseInput({ claimLiveVerifiedDistribution: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_DISTRIBUTION_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedDistribution → FALSE_LIVE_VERIFIED_DISTRIBUTION_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateCreateAndDistributeOriginalCampaign(
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
    "Distinct from T-US-029 (campaign manifest happy-path summary), T-X045 (partial destinations), T-US-022 (unsupported capabilities), and T-US-030 (uncertain post reconcile) — complete F15 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-create-and-distribute-original-campaign-f15",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
