import { describe, expect, it } from "vitest";
import {
  ChannelActionCapability,
  ChannelAuthResult,
  LocalSocialInboxChannelKind,
  evaluateLocalSocialInboxConnect,
} from "./local-social-inbox-connect.js";

describe("local-social-inbox-connect (T-US-021)", () => {
  const dest = {
    channelKind: LocalSocialInboxChannelKind.LOCAL_GBP,
    accountId: "acct-gbp-fixture-1",
    assetId: "loc-main-street",
    authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
    capabilityMatrixPresent: true,
    capabilities: [
      ChannelActionCapability.POST,
      ChannelActionCapability.REVIEW_READ,
      ChannelActionCapability.READ_BACK,
    ] as const,
    destinationContractPresent: true,
    destinationContractId: "contract-gbp-1",
    approvedFormatsPresent: true,
    locationBoundaryPresent: true,
  };

  const happy = {
    destinations: [
      dest,
      {
        ...dest,
        channelKind: LocalSocialInboxChannelKind.SOCIAL,
        accountId: "acct-fb-fixture-1",
        assetId: "page-worksocial",
        destinationContractId: "contract-social-1",
        capabilities: [
          ChannelActionCapability.POST,
          ChannelActionCapability.MESSAGE_SEND,
          ChannelActionCapability.READ_BACK,
        ] as const,
      },
      {
        ...dest,
        channelKind: LocalSocialInboxChannelKind.INBOX,
        accountId: "acct-inbox-fixture-1",
        assetId: "inbox-primary",
        destinationContractId: "contract-inbox-1",
        capabilities: [
          ChannelActionCapability.MESSAGE_SEND,
          ChannelActionCapability.READ_BACK,
        ] as const,
      },
    ],
    supportPolicyPresent: true,
    supportPolicyId: "support-policy-fixture-1",
    escalationRecipientsPresent: true,
    authorizedTestArtifactPresent: true,
    testArtifactId: "test-art-local-social-inbox-1",
    requestLiveProviderWiring: false,
  };

  it("connects when destinations, support policy, and test artifact are ready", () => {
    const d = evaluateLocalSocialInboxConnect(happy);
    expect(d.allowed).toBe(true);
    if (!d.allowed) return;
    expect(d.code).toBe("LOCAL_SOCIAL_INBOX_CONNECT_READY");
    expect(d.destinationsReady).toBe(true);
    expect(d.supportPolicyReady).toBe(true);
    expect(d.testArtifactReady).toBe(true);
    expect(d.liveProviderWiring).toBe("NOT_WIRED");
    expect(d.externalEffects).toBe("NONE");
    expect(d.evidence.testArtifactId).toBe("test-art-local-social-inbox-1");
    expect(d.evidence.destinationIds).toHaveLength(3);
  });

  it("refuses live provider wiring", () => {
    const d = evaluateLocalSocialInboxConnect({
      ...happy,
      requestLiveProviderWiring: true,
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    expect(d.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses missing destinations", () => {
    const d = evaluateLocalSocialInboxConnect({
      ...happy,
      destinations: [],
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("DESTINATIONS_MISSING");
  });

  it("refuses incomplete auth", () => {
    const d = evaluateLocalSocialInboxConnect({
      ...happy,
      destinations: [
        {
          ...dest,
          authResult: ChannelAuthResult.NEEDS_HUMAN_VERIFICATION,
        },
      ],
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("AUTH_RESULT_NOT_READY");
  });

  it("refuses missing authorized test artifact", () => {
    const d = evaluateLocalSocialInboxConnect({
      ...happy,
      authorizedTestArtifactPresent: false,
      testArtifactId: null,
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("AUTHORIZED_TEST_ARTIFACT_MISSING");
  });

  it("refuses incomplete support policy", () => {
    const d = evaluateLocalSocialInboxConnect({
      ...happy,
      escalationRecipientsPresent: false,
    });
    expect(d.allowed).toBe(false);
    if (d.allowed) return;
    expect(d.code).toBe("SUPPORT_POLICY_INCOMPLETE");
  });
});
