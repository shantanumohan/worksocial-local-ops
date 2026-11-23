/**
 * Fixture proof for T-F11 — Connect local, social and inbox channels.
 * Complete F11 evidence package: account/asset IDs, auth results,
 * per-action capability matrices, destination contracts, support policy,
 * authorized test artifact with ready capability; unsafe claims refused;
 * live providers NOT_WIRED. Distinct from T-US-021 connect readiness
 * summary, T-US-022 unsupported capabilities, and T-X045 partial
 * campaign destinations. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  ChannelActionCapability,
  ChannelAuthResult,
  LocalSocialInboxChannelKind,
  SoakProofKind,
  evaluateConnectLocalSocialInboxChannels,
  type ConnectLocalSocialInboxChannelsInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ConnectLocalSocialInboxChannelsInput> = {},
): ConnectLocalSocialInboxChannelsInput {
  return {
    packageId: "pkg-f11-soak",
    destinations: [
      {
        channelKind: LocalSocialInboxChannelKind.LOCAL_GBP,
        accountId: "gbp-acct-soak",
        assetId: "gbp-loc-soak",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrix: {
          matrixId: "caps-gbp-f11-soak",
          capabilities: [
            ChannelActionCapability.POST,
            ChannelActionCapability.REVIEW_READ,
            ChannelActionCapability.READ_BACK,
          ],
        },
        destinationContract: {
          contractId: "contract-gbp-f11-soak",
          approvedFormats: ["gbp_post", "gbp_photo"],
          locationBoundaryId: "boundary-pilot-nyc",
        },
      },
      {
        channelKind: LocalSocialInboxChannelKind.SOCIAL,
        accountId: "social-acct-soak",
        assetId: "social-page-soak",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrix: {
          matrixId: "caps-social-f11-soak",
          capabilities: [
            ChannelActionCapability.POST,
            ChannelActionCapability.READ_BACK,
          ],
        },
        destinationContract: {
          contractId: "contract-social-f11-soak",
          approvedFormats: ["image_post", "caption"],
          locationBoundaryId: "boundary-pilot-nyc",
        },
      },
      {
        channelKind: LocalSocialInboxChannelKind.INBOX,
        accountId: "inbox-acct-soak",
        assetId: "inbox-mailbox-soak",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrix: {
          matrixId: "caps-inbox-f11-soak",
          capabilities: [
            ChannelActionCapability.MESSAGE_SEND,
            ChannelActionCapability.READ_BACK,
          ],
        },
        destinationContract: {
          contractId: "contract-inbox-f11-soak",
          approvedFormats: ["plain_reply"],
          locationBoundaryId: "boundary-pilot-nyc",
        },
      },
    ],
    supportPolicy: {
      policyId: "support-policy-f11-soak",
      supportHoursLabel: "Mon-Fri 09:00-17:00 America/New_York",
      escalationRecipientIds: ["owner-soak", "ops-oncall-soak"],
    },
    authorizedTestArtifact: {
      artifactId: "art-f11-authorized-test-soak",
      destinationAssetId: "gbp-loc-soak",
      authorizedAtIso: "2026-11-23T03:30:00.000Z",
      readyCapability: true,
    },
    attemptLivePublish: false,
    claimLiveVerifiedChannels: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F11 fixture ACCEPTED.
 */
export function proofConnectLocalSocialInboxChannels(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateConnectLocalSocialInboxChannels(baseInput());
  if (
    happy.allowed &&
    happy.code === "CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_EVIDENCE_RECORDED" &&
    happy.evidence.destinationCount === 3 &&
    happy.evidence.capabilityMatrixIds.length === 3 &&
    happy.evidence.destinationContractIds.length === 3 &&
    happy.evidence.readyCapability === true &&
    happy.evidence.channelsVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F11 evidence package → CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_EVIDENCE_RECORDED; account/asset IDs; auth results; per-action capability matrices; destination contracts; support policy; authorized test artifact with readyCapability; channelsVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noDest = evaluateConnectLocalSocialInboxChannels(
    baseInput({ destinations: [] }),
  );
  if (!noDest.allowed && noDest.code === "DESTINATIONS_REQUIRED") {
    details.push("destinations=[] → DESTINATIONS_REQUIRED");
  } else {
    passed = false;
    details.push(`Destinations unexpectedly ${JSON.stringify(noDest)}`);
  }

  const noAuth = evaluateConnectLocalSocialInboxChannels(
    baseInput({
      destinations: [
        {
          ...baseInput().destinations[0]!,
          authResult: ChannelAuthResult.NEEDS_HUMAN_VERIFICATION,
        },
      ],
    }),
  );
  if (!noAuth.allowed && noAuth.code === "AUTH_RESULT_REQUIRED") {
    details.push(
      "authResult=NEEDS_HUMAN_VERIFICATION → AUTH_RESULT_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Auth unexpectedly ${JSON.stringify(noAuth)}`);
  }

  const noCaps = evaluateConnectLocalSocialInboxChannels(
    baseInput({
      destinations: [
        {
          ...baseInput().destinations[0]!,
          capabilityMatrix: null,
        },
      ],
    }),
  );
  if (!noCaps.allowed && noCaps.code === "CAPABILITY_MATRIX_REQUIRED") {
    details.push("capabilityMatrix=null → CAPABILITY_MATRIX_REQUIRED");
  } else {
    passed = false;
    details.push(`Capability matrix unexpectedly ${JSON.stringify(noCaps)}`);
  }

  const noContract = evaluateConnectLocalSocialInboxChannels(
    baseInput({
      destinations: [
        {
          ...baseInput().destinations[0]!,
          destinationContract: null,
        },
      ],
    }),
  );
  if (!noContract.allowed && noContract.code === "DESTINATION_CONTRACT_REQUIRED") {
    details.push("destinationContract=null → DESTINATION_CONTRACT_REQUIRED");
  } else {
    passed = false;
    details.push(
      `Destination contract unexpectedly ${JSON.stringify(noContract)}`,
    );
  }

  const noSupport = evaluateConnectLocalSocialInboxChannels(
    baseInput({ supportPolicy: null }),
  );
  if (!noSupport.allowed && noSupport.code === "SUPPORT_POLICY_REQUIRED") {
    details.push("supportPolicy=null → SUPPORT_POLICY_REQUIRED");
  } else {
    passed = false;
    details.push(`Support policy unexpectedly ${JSON.stringify(noSupport)}`);
  }

  const noArtifact = evaluateConnectLocalSocialInboxChannels(
    baseInput({ authorizedTestArtifact: null }),
  );
  if (
    !noArtifact.allowed &&
    noArtifact.code === "AUTHORIZED_TEST_ARTIFACT_REQUIRED"
  ) {
    details.push(
      "authorizedTestArtifact=null → AUTHORIZED_TEST_ARTIFACT_REQUIRED",
    );
  } else {
    passed = false;
    details.push(
      `Authorized test artifact unexpectedly ${JSON.stringify(noArtifact)}`,
    );
  }

  const livePublish = evaluateConnectLocalSocialInboxChannels(
    baseInput({ attemptLivePublish: true }),
  );
  if (!livePublish.allowed && livePublish.code === "LIVE_PUBLISH_REFUSED") {
    details.push("attemptLivePublish → LIVE_PUBLISH_REFUSED");
  } else {
    passed = false;
    details.push(`Live publish unexpectedly ${JSON.stringify(livePublish)}`);
  }

  const liveClaim = evaluateConnectLocalSocialInboxChannels(
    baseInput({ claimLiveVerifiedChannels: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_CHANNELS_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedChannels → FALSE_LIVE_VERIFIED_CHANNELS_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateConnectLocalSocialInboxChannels(
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
    "Distinct from T-US-021 (connect readiness summary), T-US-022 (unsupported destination capabilities), and T-X045 (partial campaign destinations) — complete F11 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-connect-local-social-inbox-channels-f11",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
