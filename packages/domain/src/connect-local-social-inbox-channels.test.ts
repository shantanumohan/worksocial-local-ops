import { describe, expect, it } from "vitest";
import {
  ChannelActionCapability,
  ChannelAuthResult,
  CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_RELATED_CASE_IDS,
  evaluateConnectLocalSocialInboxChannels,
  LocalSocialInboxChannelKind,
  type ConnectLocalSocialInboxChannelsInput,
} from "./connect-local-social-inbox-channels.js";

function baseInput(
  overrides: Partial<ConnectLocalSocialInboxChannelsInput> = {},
): ConnectLocalSocialInboxChannelsInput {
  return {
    packageId: "pkg-f11-1",
    destinations: [
      {
        channelKind: LocalSocialInboxChannelKind.LOCAL_GBP,
        accountId: "gbp-acct-1",
        assetId: "gbp-loc-1",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrix: {
          matrixId: "caps-gbp-f11-1",
          capabilities: [
            ChannelActionCapability.POST,
            ChannelActionCapability.REVIEW_READ,
            ChannelActionCapability.READ_BACK,
          ],
        },
        destinationContract: {
          contractId: "contract-gbp-f11-1",
          approvedFormats: ["gbp_post", "gbp_photo"],
          locationBoundaryId: "boundary-pilot-nyc",
        },
      },
      {
        channelKind: LocalSocialInboxChannelKind.SOCIAL,
        accountId: "social-acct-1",
        assetId: "social-page-1",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrix: {
          matrixId: "caps-social-f11-1",
          capabilities: [
            ChannelActionCapability.POST,
            ChannelActionCapability.READ_BACK,
          ],
        },
        destinationContract: {
          contractId: "contract-social-f11-1",
          approvedFormats: ["image_post", "caption"],
          locationBoundaryId: "boundary-pilot-nyc",
        },
      },
      {
        channelKind: LocalSocialInboxChannelKind.INBOX,
        accountId: "inbox-acct-1",
        assetId: "inbox-mailbox-1",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrix: {
          matrixId: "caps-inbox-f11-1",
          capabilities: [
            ChannelActionCapability.MESSAGE_SEND,
            ChannelActionCapability.READ_BACK,
          ],
        },
        destinationContract: {
          contractId: "contract-inbox-f11-1",
          approvedFormats: ["plain_reply"],
          locationBoundaryId: "boundary-pilot-nyc",
        },
      },
    ],
    supportPolicy: {
      policyId: "support-policy-f11-1",
      supportHoursLabel: "Mon-Fri 09:00-17:00 America/New_York",
      escalationRecipientIds: ["owner-1", "ops-oncall-1"],
    },
    authorizedTestArtifact: {
      artifactId: "art-f11-authorized-test-1",
      destinationAssetId: "gbp-loc-1",
      authorizedAtIso: "2026-11-23T03:30:00.000Z",
      readyCapability: true,
    },
    attemptLivePublish: false,
    claimLiveVerifiedChannels: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateConnectLocalSocialInboxChannels (T-F11)", () => {
  it("records complete F11 evidence package", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.destinationCount).toBe(3);
    expect(decision.evidence.capabilityMatrixIds).toHaveLength(3);
    expect(decision.evidence.destinationContractIds).toHaveLength(3);
    expect(decision.evidence.supportPolicyId).toBe("support-policy-f11-1");
    expect(decision.evidence.escalationRecipientCount).toBe(2);
    expect(decision.evidence.testArtifactId).toBe(
      "art-f11-authorized-test-1",
    );
    expect(decision.evidence.readyCapability).toBe(true);
    expect(decision.evidence.channelsVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F11_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_RELATED_CASE_IDS).toEqual([
      "T-F11",
    ]);
  });

  it("refuses missing destinations", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({ destinations: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DESTINATIONS_REQUIRED");
  });

  it("refuses missing account/asset IDs", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({
        destinations: [
          {
            ...baseInput().destinations[0]!,
            accountId: "",
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ACCOUNT_ASSET_IDS_REQUIRED");
  });

  it("refuses non-fixture auth", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({
        destinations: [
          {
            ...baseInput().destinations[0]!,
            authResult: ChannelAuthResult.NEEDS_HUMAN_VERIFICATION,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AUTH_RESULT_REQUIRED");
  });

  it("refuses missing capability matrix", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({
        destinations: [
          {
            ...baseInput().destinations[0]!,
            capabilityMatrix: null,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CAPABILITY_MATRIX_REQUIRED");
  });

  it("refuses missing destination contract", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({
        destinations: [
          {
            ...baseInput().destinations[0]!,
            destinationContract: null,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DESTINATION_CONTRACT_REQUIRED");
  });

  it("refuses missing support policy", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({ supportPolicy: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SUPPORT_POLICY_REQUIRED");
  });

  it("refuses missing authorized test artifact", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({ authorizedTestArtifact: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AUTHORIZED_TEST_ARTIFACT_REQUIRED");
  });

  it("refuses live publish", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({ attemptLivePublish: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PUBLISH_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({ claimLiveVerifiedChannels: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_CHANNELS_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateConnectLocalSocialInboxChannels(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
