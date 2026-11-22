/**
 * Fixture proof for T-US-021 — Connect local/social/inbox (test artifact + capability).
 * Destinations present account/asset IDs, FIXTURE_AUTH_OK, per-action capability
 * matrices, destination contracts, support policy, authorized test artifact;
 * live provider wiring NOT_WIRED. Distinct from T-US-022 / T-X045.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  ChannelActionCapability,
  ChannelAuthResult,
  LocalSocialInboxChannelKind,
  SoakProofKind,
  evaluateLocalSocialInboxConnect,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-021 fixture ACCEPTED.
 */
export function proofConnectLocalSocialInboxTestArtifact(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateLocalSocialInboxConnect({
    destinations: [
      {
        channelKind: LocalSocialInboxChannelKind.LOCAL_GBP,
        accountId: "acct-gbp-fixture-1",
        assetId: "loc-main-street",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrixPresent: true,
        capabilities: [
          ChannelActionCapability.POST,
          ChannelActionCapability.REVIEW_READ,
          ChannelActionCapability.READ_BACK,
        ],
        destinationContractPresent: true,
        destinationContractId: "contract-gbp-1",
        approvedFormatsPresent: true,
        locationBoundaryPresent: true,
      },
      {
        channelKind: LocalSocialInboxChannelKind.SOCIAL,
        accountId: "acct-fb-fixture-1",
        assetId: "page-worksocial",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrixPresent: true,
        capabilities: [
          ChannelActionCapability.POST,
          ChannelActionCapability.MESSAGE_SEND,
          ChannelActionCapability.READ_BACK,
        ],
        destinationContractPresent: true,
        destinationContractId: "contract-social-1",
        approvedFormatsPresent: true,
        locationBoundaryPresent: true,
      },
      {
        channelKind: LocalSocialInboxChannelKind.INBOX,
        accountId: "acct-inbox-fixture-1",
        assetId: "inbox-primary",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrixPresent: true,
        capabilities: [
          ChannelActionCapability.MESSAGE_SEND,
          ChannelActionCapability.READ_BACK,
        ],
        destinationContractPresent: true,
        destinationContractId: "contract-inbox-1",
        approvedFormatsPresent: true,
        locationBoundaryPresent: true,
      },
    ],
    supportPolicyPresent: true,
    supportPolicyId: "support-policy-fixture-1",
    escalationRecipientsPresent: true,
    authorizedTestArtifactPresent: true,
    testArtifactId: "test-art-local-social-inbox-1",
    requestLiveProviderWiring: false,
  });
  if (
    happy.allowed &&
    happy.code === "LOCAL_SOCIAL_INBOX_CONNECT_READY" &&
    happy.destinationsReady &&
    happy.supportPolicyReady &&
    happy.testArtifactReady &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE" &&
    happy.evidence.destinationIds.length === 3 &&
    happy.evidence.testArtifactId === "test-art-local-social-inbox-1"
  ) {
    details.push(
      "Local/social/inbox → LOCAL_SOCIAL_INBOX_CONNECT_READY; 3 destinations; test artifact present; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy connect unexpectedly ${JSON.stringify(happy)}`);
  }

  const live = evaluateLocalSocialInboxConnect({
    destinations: [
      {
        channelKind: LocalSocialInboxChannelKind.LOCAL_GBP,
        accountId: "acct-gbp-fixture-1",
        assetId: "loc-main-street",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrixPresent: true,
        capabilities: [ChannelActionCapability.READ_BACK],
        destinationContractPresent: true,
        destinationContractId: "contract-gbp-1",
        approvedFormatsPresent: true,
        locationBoundaryPresent: true,
      },
    ],
    supportPolicyPresent: true,
    supportPolicyId: "support-policy-fixture-1",
    escalationRecipientsPresent: true,
    authorizedTestArtifactPresent: true,
    testArtifactId: "test-art-local-social-inbox-1",
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live refuse unexpectedly ${JSON.stringify(live)}`);
  }

  const missingAuth = evaluateLocalSocialInboxConnect({
    destinations: [
      {
        channelKind: LocalSocialInboxChannelKind.SOCIAL,
        accountId: "acct-fb-fixture-1",
        assetId: "page-worksocial",
        authResult: ChannelAuthResult.NEEDS_HUMAN_VERIFICATION,
        capabilityMatrixPresent: true,
        capabilities: [ChannelActionCapability.POST],
        destinationContractPresent: true,
        destinationContractId: "contract-social-1",
        approvedFormatsPresent: true,
        locationBoundaryPresent: true,
      },
    ],
    supportPolicyPresent: true,
    supportPolicyId: "support-policy-fixture-1",
    escalationRecipientsPresent: true,
    authorizedTestArtifactPresent: true,
    testArtifactId: "test-art-local-social-inbox-1",
    requestLiveProviderWiring: false,
  });
  if (!missingAuth.allowed && missingAuth.code === "AUTH_RESULT_NOT_READY") {
    details.push("NEEDS_HUMAN_VERIFICATION → AUTH_RESULT_NOT_READY");
  } else {
    passed = false;
    details.push(`Auth refuse unexpectedly ${JSON.stringify(missingAuth)}`);
  }

  const missingArtifact = evaluateLocalSocialInboxConnect({
    destinations: [
      {
        channelKind: LocalSocialInboxChannelKind.INBOX,
        accountId: "acct-inbox-fixture-1",
        assetId: "inbox-primary",
        authResult: ChannelAuthResult.FIXTURE_AUTH_OK,
        capabilityMatrixPresent: true,
        capabilities: [ChannelActionCapability.MESSAGE_SEND],
        destinationContractPresent: true,
        destinationContractId: "contract-inbox-1",
        approvedFormatsPresent: true,
        locationBoundaryPresent: true,
      },
    ],
    supportPolicyPresent: true,
    supportPolicyId: "support-policy-fixture-1",
    escalationRecipientsPresent: true,
    authorizedTestArtifactPresent: false,
    testArtifactId: null,
    requestLiveProviderWiring: false,
  });
  if (
    !missingArtifact.allowed &&
    missingArtifact.code === "AUTHORIZED_TEST_ARTIFACT_MISSING"
  ) {
    details.push(
      "Missing authorized test artifact → AUTHORIZED_TEST_ARTIFACT_MISSING",
    );
  } else {
    passed = false;
    details.push(
      `Missing artifact unexpectedly ${JSON.stringify(missingArtifact)}`,
    );
  }

  const emptyDest = evaluateLocalSocialInboxConnect({
    destinations: [],
    supportPolicyPresent: true,
    supportPolicyId: "support-policy-fixture-1",
    escalationRecipientsPresent: true,
    authorizedTestArtifactPresent: true,
    testArtifactId: "test-art-local-social-inbox-1",
    requestLiveProviderWiring: false,
  });
  if (!emptyDest.allowed && emptyDest.code === "DESTINATIONS_MISSING") {
    details.push("Empty destinations → DESTINATIONS_MISSING");
  } else {
    passed = false;
    details.push(
      `Empty destinations unexpectedly ${JSON.stringify(emptyDest)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  details.push(
    "Distinct from T-US-022 (unsupported destination capabilities) and T-X045 (partial campaign destinations)",
  );

  return {
    proofId: `proof-local-social-inbox-${randomUUID()}`,
    kind: SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us021-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
