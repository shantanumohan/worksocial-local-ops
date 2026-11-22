import { describe, expect, it } from "vitest";
import { evaluateCampaignManifestDistribution } from "./campaign-manifest-distribution.js";

function validInput(
  overrides: Partial<Parameters<typeof evaluateCampaignManifestDistribution>[0]> = {},
) {
  return {
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
        kind: "CMS" as const,
        previewId: "prev-cms-1",
        eligible: true,
        recoveryAction: null,
      },
      {
        destinationId: "dest-gbp",
        kind: "GBP" as const,
        previewId: "prev-gbp-1",
        eligible: false,
        recoveryAction: "Reconnect GBP fixture adapter",
      },
    ],
    destinationOutcomes: [
      {
        destinationId: "dest-cms",
        outcome: "RECEIPT_RECORDED" as const,
        receiptId: "rcpt-cms-1",
        recoveryAction: null,
      },
      {
        destinationId: "dest-gbp",
        outcome: "BLOCKED_WITH_RECOVERY" as const,
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
    ...overrides,
  };
}

describe("campaign-manifest-distribution (T-US-029)", () => {
  it("records campaign manifest with eligible receipts and blocked recovery", () => {
    const decision = evaluateCampaignManifestDistribution(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("CAMPAIGN_MANIFEST_RECORDED");
    expect(decision.campaignManifestRecorded).toBe(true);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.evidence.campaignManifestId).toBe("manifest-campaign-1");
    expect(decision.evidence.eligibleDestinationIds).toEqual(["dest-cms"]);
    expect(decision.evidence.blockedDestinationIds).toEqual(["dest-gbp"]);
    expect(decision.evidence.receiptIds).toEqual(["rcpt-cms-1"]);
    expect(decision.evidence.recoveryActions).toEqual([
      "Reconnect GBP fixture adapter",
    ]);
    expect(decision.evidence.sourceFactIds).toEqual([
      "fact-booth-db",
      "fact-venue-media-approved",
    ]);
  });

  it("refuses incomplete brief/draft/QA and missing recovery on blocked channels", () => {
    const noBrief = evaluateCampaignManifestDistribution(
      validInput({
        brief: {
          briefId: "",
          audienceNeed: "x",
          sourceFactIds: [],
        },
      }),
    );
    expect(noBrief.allowed).toBe(false);
    if (!noBrief.allowed) expect(noBrief.code).toBe("BRIEF_INCOMPLETE");

    const noDraft = evaluateCampaignManifestDistribution(
      validInput({
        draft: {
          draftId: "d1",
          revisionHash: "",
          version: 0,
          body: "",
        },
      }),
    );
    expect(noDraft.allowed).toBe(false);
    if (!noDraft.allowed) expect(noDraft.code).toBe("DRAFT_INCOMPLETE");

    const badQa = evaluateCampaignManifestDistribution(
      validInput({
        qa: {
          qaBundleId: "qa-1",
          utilityPassed: true,
          brandPassed: false,
          sourcesPassed: true,
          accessibilityPassed: true,
        },
      }),
    );
    expect(badQa.allowed).toBe(false);
    if (!badQa.allowed) expect(badQa.code).toBe("QA_FINDINGS_INCOMPLETE");

    const noRecovery = evaluateCampaignManifestDistribution(
      validInput({
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
            recoveryAction: null,
          },
        ],
      }),
    );
    expect(noRecovery.allowed).toBe(false);
    if (!noRecovery.allowed)
      expect(noRecovery.code).toBe("BLOCKED_CHANNEL_RECOVERY_REQUIRED");
  });

  it("refuses missing receipts, false live success, and live wiring", () => {
    const noReceipt = evaluateCampaignManifestDistribution(
      validInput({
        destinationOutcomes: [
          {
            destinationId: "dest-cms",
            outcome: "RECEIPT_RECORDED",
            receiptId: null,
            recoveryAction: null,
          },
        ],
      }),
    );
    expect(noReceipt.allowed).toBe(false);
    if (!noReceipt.allowed)
      expect(noReceipt.code).toBe("ELIGIBLE_RECEIPT_REQUIRED");

    const falseLive = evaluateCampaignManifestDistribution(
      validInput({ claimLiveDistributionSuccess: true }),
    );
    expect(falseLive.allowed).toBe(false);
    if (!falseLive.allowed)
      expect(falseLive.code).toBe("FALSE_LIVE_SUCCESS_CLAIM_REFUSED");

    const live = evaluateCampaignManifestDistribution(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(live.allowed).toBe(false);
    if (!live.allowed)
      expect(live.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");

    const noManifest = evaluateCampaignManifestDistribution(
      validInput({ campaignManifestId: null }),
    );
    expect(noManifest.allowed).toBe(false);
    if (!noManifest.allowed)
      expect(noManifest.code).toBe("CAMPAIGN_MANIFEST_ID_REQUIRED");
  });
});
