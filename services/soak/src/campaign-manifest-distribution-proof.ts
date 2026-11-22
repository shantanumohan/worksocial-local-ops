/**
 * Fixture proof for T-US-029 — Original campaign distribution (F15/SC-08)
 * campaign manifest. Brief + versioned draft + QA + per-destination previews/
 * outcomes + measurement state → campaign manifest; blocked channels keep
 * recovery actions; false live success refused; live NOT_WIRED.
 * Distinct from T-X045 (partial destinations), T-US-022 (unsupported
 * capabilities), T-US-030 (uncertain post reconcile).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateCampaignManifestDistribution,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-029 fixture ACCEPTED.
 */
export function proofCampaignManifestDistribution(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateCampaignManifestDistribution({
    brief: {
      briefId: "brief-acoustic-campaign",
      audienceNeed: "Explain acoustic privacy for private offices",
      sourceFactIds: ["fact-booth-db", "fact-venue-media-approved"],
    },
    draft: {
      draftId: "draft-acoustic-article",
      revisionHash: "rev-abc123",
      version: 2,
      body: "Canonical article on acoustic privacy with measured booth attenuation.",
    },
    qa: {
      qaBundleId: "qa-acoustic-1",
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
        eligible: false,
        recoveryAction: "Reconnect GBP fixture adapter",
      },
    ],
    destinationOutcomes: [
      {
        destinationId: "dest-cms",
        outcome: "RECEIPT_RECORDED",
        receiptId: "rcpt-cms-1",
        recoveryAction: null,
      },
      {
        destinationId: "dest-gbp",
        outcome: "BLOCKED_WITH_RECOVERY",
        receiptId: null,
        recoveryAction: "Reconnect GBP fixture adapter",
      },
    ],
    measurement: {
      measurementId: "meas-campaign-1",
      stateLabel: "FIXTURE_OUTCOME_COLLECTION_READY",
      outcomeCollectionReady: true,
    },
    campaignManifestId: "manifest-campaign-1",
    claimLiveDistributionSuccess: false,
    requestLiveProviderWiring: false,
  });
  if (
    happy.allowed &&
    happy.code === "CAMPAIGN_MANIFEST_RECORDED" &&
    happy.campaignManifestRecorded &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE" &&
    happy.evidence.campaignManifestId === "manifest-campaign-1" &&
    happy.evidence.receiptIds.includes("rcpt-cms-1") &&
    happy.evidence.blockedDestinationIds.includes("dest-gbp")
  ) {
    details.push(
      "Happy → CAMPAIGN_MANIFEST_RECORDED; eligible receipts + blocked recovery; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy unexpectedly ${JSON.stringify(happy)}`);
  }

  const falseLive = evaluateCampaignManifestDistribution({
    brief: {
      briefId: "brief-acoustic-campaign",
      audienceNeed: "Explain acoustic privacy for private offices",
      sourceFactIds: ["fact-booth-db"],
    },
    draft: {
      draftId: "draft-acoustic-article",
      revisionHash: "rev-abc123",
      version: 1,
      body: "Body",
    },
    qa: {
      qaBundleId: "qa-acoustic-1",
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
    ],
    destinationOutcomes: [
      {
        destinationId: "dest-cms",
        outcome: "RECEIPT_RECORDED",
        receiptId: "rcpt-cms-1",
        recoveryAction: null,
      },
    ],
    measurement: {
      measurementId: "meas-campaign-1",
      stateLabel: "FIXTURE_OUTCOME_COLLECTION_READY",
      outcomeCollectionReady: true,
    },
    campaignManifestId: "manifest-campaign-1",
    claimLiveDistributionSuccess: true,
    requestLiveProviderWiring: false,
  });
  if (
    !falseLive.allowed &&
    falseLive.code === "FALSE_LIVE_SUCCESS_CLAIM_REFUSED"
  ) {
    details.push(
      "claimLiveDistributionSuccess → FALSE_LIVE_SUCCESS_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(`False live unexpectedly ${JSON.stringify(falseLive)}`);
  }

  const live = evaluateCampaignManifestDistribution({
    brief: {
      briefId: "brief-acoustic-campaign",
      audienceNeed: "Explain acoustic privacy for private offices",
      sourceFactIds: ["fact-booth-db"],
    },
    draft: {
      draftId: "draft-acoustic-article",
      revisionHash: "rev-abc123",
      version: 1,
      body: "Body",
    },
    qa: {
      qaBundleId: "qa-acoustic-1",
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
    ],
    destinationOutcomes: [
      {
        destinationId: "dest-cms",
        outcome: "RECEIPT_RECORDED",
        receiptId: "rcpt-cms-1",
        recoveryAction: null,
      },
    ],
    measurement: {
      measurementId: "meas-campaign-1",
      stateLabel: "FIXTURE_OUTCOME_COLLECTION_READY",
      outcomeCollectionReady: true,
    },
    campaignManifestId: "manifest-campaign-1",
    claimLiveDistributionSuccess: false,
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  const blockedNoRecovery = evaluateCampaignManifestDistribution({
    brief: {
      briefId: "brief-acoustic-campaign",
      audienceNeed: "Explain acoustic privacy for private offices",
      sourceFactIds: ["fact-booth-db"],
    },
    draft: {
      draftId: "draft-acoustic-article",
      revisionHash: "rev-abc123",
      version: 1,
      body: "Body",
    },
    qa: {
      qaBundleId: "qa-acoustic-1",
      utilityPassed: true,
      brandPassed: true,
      sourcesPassed: true,
      accessibilityPassed: true,
    },
    destinationPreviews: [
      {
        destinationId: "dest-gbp",
        kind: "GBP",
        previewId: "prev-gbp-1",
        eligible: false,
        recoveryAction: null,
      },
    ],
    destinationOutcomes: [
      {
        destinationId: "dest-gbp",
        outcome: "BLOCKED_WITH_RECOVERY",
        receiptId: null,
        recoveryAction: "Reconnect GBP fixture adapter",
      },
    ],
    measurement: {
      measurementId: "meas-campaign-1",
      stateLabel: "FIXTURE_OUTCOME_COLLECTION_READY",
      outcomeCollectionReady: true,
    },
    campaignManifestId: "manifest-campaign-1",
    claimLiveDistributionSuccess: false,
    requestLiveProviderWiring: false,
  });
  if (
    !blockedNoRecovery.allowed &&
    blockedNoRecovery.code === "BLOCKED_CHANNEL_RECOVERY_REQUIRED"
  ) {
    details.push(
      "Blocked preview without recovery → BLOCKED_CHANNEL_RECOVERY_REQUIRED",
    );
  } else {
    passed = false;
    details.push(
      `Blocked recovery unexpectedly ${JSON.stringify(blockedNoRecovery)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-X045 (partial destinations), T-US-022 (unsupported capabilities), T-US-030 (uncertain post reconcile)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-campaign-manifest-${randomUUID()}`,
    kind: SoakProofKind.CAMPAIGN_MANIFEST_DISTRIBUTION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-campaign-manifest-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
