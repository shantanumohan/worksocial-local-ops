/**
 * T-F11 — Connect local, social and inbox channels (complete F11 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F11 evidence
 * package — per-destination account/asset IDs, authentication results,
 * per-action capability matrices, destination contracts (approved formats +
 * location boundaries), support hours policy with escalation recipients, and
 * an authorized test artifact with ready capability. Incomplete packages,
 * live publish attempts, and false live-verified claims are refused. Live
 * provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-021 (`CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT`) — this
 * records the complete F11 flow evidence package (structured destinations +
 * support policy + authorized test artifact with ready capability), not the
 * connect readiness summary alone. Distinct from T-US-022 (unsupported
 * destination capabilities) and T-X045 (partial campaign destinations).
 */

import {
  ChannelActionCapability,
  ChannelAuthResult,
  FIXTURE_CHANNEL_ACTION_CAPABILITIES,
  LocalSocialInboxChannelKind,
  type ChannelActionCapabilityValue,
  type ChannelAuthResultValue,
  type LocalSocialInboxChannelKindValue,
} from "./local-social-inbox-connect.js";

export type F11DestinationCapabilityMatrix = {
  matrixId: string;
  capabilities: readonly ChannelActionCapabilityValue[];
};

export type F11DestinationContract = {
  contractId: string;
  approvedFormats: readonly string[];
  locationBoundaryId: string;
};

export type F11ChannelDestination = {
  channelKind: LocalSocialInboxChannelKindValue;
  accountId: string;
  assetId: string;
  authResult: ChannelAuthResultValue;
  capabilityMatrix: F11DestinationCapabilityMatrix | null;
  destinationContract: F11DestinationContract | null;
};

export type F11SupportPolicy = {
  policyId: string;
  supportHoursLabel: string;
  escalationRecipientIds: readonly string[];
};

export type F11AuthorizedTestArtifact = {
  artifactId: string;
  destinationAssetId: string;
  authorizedAtIso: string;
  /** Ready capability after authorized test (F11 expected evidence). */
  readyCapability: true;
};

export type ConnectLocalSocialInboxChannelsInput = {
  packageId: string;
  destinations: readonly F11ChannelDestination[];
  supportPolicy: F11SupportPolicy | null;
  authorizedTestArtifact: F11AuthorizedTestArtifact | null;
  /** Attempt live publish to a destination — must refuse on fixture. */
  attemptLivePublish: boolean;
  /** Claim the F11 path is live-verified — must refuse offline. */
  claimLiveVerifiedChannels: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type ConnectLocalSocialInboxChannelsDecision =
  | {
      allowed: true;
      code: "CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        destinationCount: number;
        channelKinds: readonly LocalSocialInboxChannelKindValue[];
        accountAssetPairs: readonly string[];
        authResults: readonly ChannelAuthResultValue[];
        capabilityMatrixIds: readonly string[];
        destinationContractIds: readonly string[];
        supportPolicyId: string;
        supportHoursLabel: string;
        escalationRecipientCount: number;
        testArtifactId: string;
        testArtifactDestinationAssetId: string;
        testArtifactAuthorizedAtIso: string;
        readyCapability: true;
        channelsVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F11_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "LOCAL_SOCIAL_INBOX_CHANNELS_RECORDED";
        recoveryPath: "KEEP_FIXTURE_CHANNELS_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "DESTINATIONS_REQUIRED"
        | "ACCOUNT_ASSET_IDS_REQUIRED"
        | "AUTH_RESULT_REQUIRED"
        | "CAPABILITY_MATRIX_REQUIRED"
        | "DESTINATION_CONTRACT_REQUIRED"
        | "SUPPORT_POLICY_REQUIRED"
        | "AUTHORIZED_TEST_ARTIFACT_REQUIRED"
        | "LIVE_PUBLISH_REFUSED"
        | "FALSE_LIVE_VERIFIED_CHANNELS_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        destinationCount: number;
        channelKinds: readonly LocalSocialInboxChannelKindValue[];
        accountAssetPairs: readonly string[];
        authResults: readonly ChannelAuthResultValue[];
        capabilityMatrixIds: readonly string[];
        destinationContractIds: readonly string[];
        supportPolicyId: string | null;
        supportHoursLabel: string | null;
        escalationRecipientCount: number;
        testArtifactId: string | null;
        testArtifactDestinationAssetId: string | null;
        testArtifactAuthorizedAtIso: string | null;
        readyCapability: boolean;
        channelsVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_DESTINATIONS"
          | "AWAITING_ACCOUNT_ASSET_IDS"
          | "AWAITING_AUTH_RESULT"
          | "AWAITING_CAPABILITY_MATRIX"
          | "AWAITING_DESTINATION_CONTRACT"
          | "AWAITING_SUPPORT_POLICY"
          | "AWAITING_AUTHORIZED_TEST_ARTIFACT";
        recoveryPath:
          | "SELECT_PROVIDER_PAGE_PROFILE_LOCATION"
          | "COMPLETE_PROVIDER_SIGN_IN_FIXTURE_AUTH"
          | "INSPECT_POST_REVIEW_MESSAGE_READ_BACK"
          | "CHOOSE_APPROVED_FORMATS_AND_BOUNDARIES"
          | "SET_SUPPORT_HOURS_AND_ESCALATION"
          | "PERFORM_AUTHORIZED_FIXTURE_TEST"
          | "KEEP_FIXTURE_CHANNELS_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_RELATED_CASE_IDS = [
  "T-F11",
] as const;

const VALID_CHANNEL_KINDS = new Set<string>(
  Object.values(LocalSocialInboxChannelKind),
);

function preservedInputCount(
  input: ConnectLocalSocialInboxChannelsInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.destinations.length > 0 ? 1 : 0) +
    (input.supportPolicy?.policyId.trim() ? 1 : 0) +
    (input.authorizedTestArtifact?.artifactId.trim() ? 1 : 0)
  );
}

function destinationAccountAssetOk(d: F11ChannelDestination): boolean {
  return d.accountId.trim().length > 0 && d.assetId.trim().length > 0;
}

function destinationAuthOk(d: F11ChannelDestination): boolean {
  return d.authResult === ChannelAuthResult.FIXTURE_AUTH_OK;
}

function capabilityMatrixOk(
  m: F11DestinationCapabilityMatrix | null,
): m is F11DestinationCapabilityMatrix {
  if (!m) return false;
  if (!m.matrixId.trim() || m.capabilities.length === 0) return false;
  const allowed = new Set<string>(FIXTURE_CHANNEL_ACTION_CAPABILITIES);
  return m.capabilities.every((c) => allowed.has(c));
}

function destinationContractOk(
  c: F11DestinationContract | null,
): c is F11DestinationContract {
  if (!c) return false;
  if (!c.contractId.trim() || !c.locationBoundaryId.trim()) return false;
  if (c.approvedFormats.length === 0) return false;
  return c.approvedFormats.every((f) => f.trim().length > 0);
}

function supportPolicyOk(
  p: F11SupportPolicy | null,
): p is F11SupportPolicy {
  if (!p) return false;
  if (!p.policyId.trim() || !p.supportHoursLabel.trim()) return false;
  if (p.escalationRecipientIds.length === 0) return false;
  return p.escalationRecipientIds.every((id) => id.trim().length > 0);
}

function authorizedTestArtifactOk(
  a: F11AuthorizedTestArtifact | null,
  destinations: readonly F11ChannelDestination[],
): a is F11AuthorizedTestArtifact {
  if (!a) return false;
  if (
    !a.artifactId.trim() ||
    !a.destinationAssetId.trim() ||
    !a.authorizedAtIso.trim() ||
    a.readyCapability !== true
  ) {
    return false;
  }
  const assetIds = new Set(
    destinations.map((d) => d.assetId.trim()).filter(Boolean),
  );
  return assetIds.has(a.destinationAssetId.trim());
}

/**
 * Evaluate the T-F11 connect-local-social-inbox-channels path offline.
 * Complete F11 evidence package → CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateConnectLocalSocialInboxChannels(
  input: ConnectLocalSocialInboxChannelsInput,
): ConnectLocalSocialInboxChannelsDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);

  const channelKinds = input.destinations
    .map((d) => d.channelKind)
    .filter((k) => VALID_CHANNEL_KINDS.has(k));
  const accountAssetPairs = input.destinations
    .filter(destinationAccountAssetOk)
    .map((d) => `${d.channelKind}:${d.accountId.trim()}/${d.assetId.trim()}`);
  const authResults = input.destinations.map((d) => d.authResult);
  const capabilityMatrixIds = input.destinations
    .map((d) => d.capabilityMatrix?.matrixId.trim() || "")
    .filter(Boolean);
  const destinationContractIds = input.destinations
    .map((d) => d.destinationContract?.contractId.trim() || "")
    .filter(Boolean);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_DESTINATIONS"
      | "AWAITING_ACCOUNT_ASSET_IDS"
      | "AWAITING_AUTH_RESULT"
      | "AWAITING_CAPABILITY_MATRIX"
      | "AWAITING_DESTINATION_CONTRACT"
      | "AWAITING_SUPPORT_POLICY"
      | "AWAITING_AUTHORIZED_TEST_ARTIFACT",
    recoveryPath:
      | "SELECT_PROVIDER_PAGE_PROFILE_LOCATION"
      | "COMPLETE_PROVIDER_SIGN_IN_FIXTURE_AUTH"
      | "INSPECT_POST_REVIEW_MESSAGE_READ_BACK"
      | "CHOOSE_APPROVED_FORMATS_AND_BOUNDARIES"
      | "SET_SUPPORT_HOURS_AND_ESCALATION"
      | "PERFORM_AUTHORIZED_FIXTURE_TEST"
      | "KEEP_FIXTURE_CHANNELS_NO_LIVE_PROVIDER",
  ): NonNullable<
    Extract<
      ConnectLocalSocialInboxChannelsDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    destinationCount: input.destinations.length,
    channelKinds,
    accountAssetPairs,
    authResults,
    capabilityMatrixIds,
    destinationContractIds,
    supportPolicyId: input.supportPolicy?.policyId.trim() || null,
    supportHoursLabel: input.supportPolicy?.supportHoursLabel.trim() || null,
    escalationRecipientCount:
      input.supportPolicy?.escalationRecipientIds.length ?? 0,
    testArtifactId: input.authorizedTestArtifact?.artifactId.trim() || null,
    testArtifactDestinationAssetId:
      input.authorizedTestArtifact?.destinationAssetId.trim() || null,
    testArtifactAuthorizedAtIso:
      input.authorizedTestArtifact?.authorizedAtIso.trim() || null,
    readyCapability: input.authorizedTestArtifact?.readyCapability === true,
    channelsVerifiedLive: false,
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
        "Live local/social/inbox provider wiring remains NOT_WIRED — refuse live channel connect (T-F11)",
      ],
    };
  }

  if (input.claimLiveVerifiedChannels) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_CHANNELS_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified local/social/inbox channels claim offline (T-F11) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptLivePublish) {
    return {
      allowed: false,
      code: "LIVE_PUBLISH_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "LIVE_PUBLISH_REFUSED",
        "BLOCKED",
        "KEEP_FIXTURE_CHANNELS_NO_LIVE_PROVIDER",
      ),
      reasons: [
        "Live publish refused on F11 fixture surface — authorized fixture test artifact only (T-F11)",
      ],
    };
  }

  if (!input.packageId.trim() || input.destinations.length === 0) {
    return {
      allowed: false,
      code: "DESTINATIONS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DESTINATIONS_INCOMPLETE",
        "AWAITING_DESTINATIONS",
        "SELECT_PROVIDER_PAGE_PROFILE_LOCATION",
      ),
      reasons: [
        "F11 requires at least one local/social/inbox destination with package id (T-F11)",
      ],
    };
  }

  if (!input.destinations.every(destinationAccountAssetOk)) {
    return {
      allowed: false,
      code: "ACCOUNT_ASSET_IDS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ACCOUNT_ASSET_IDS_INCOMPLETE",
        "AWAITING_ACCOUNT_ASSET_IDS",
        "SELECT_PROVIDER_PAGE_PROFILE_LOCATION",
      ),
      reasons: [
        "F11 requires account and asset IDs for every enabled destination (T-F11)",
      ],
    };
  }

  if (!input.destinations.every(destinationAuthOk)) {
    return {
      allowed: false,
      code: "AUTH_RESULT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "AUTH_RESULT_INCOMPLETE",
        "AWAITING_AUTH_RESULT",
        "COMPLETE_PROVIDER_SIGN_IN_FIXTURE_AUTH",
      ),
      reasons: [
        "F11 requires FIXTURE_AUTH_OK authentication result per destination (T-F11)",
      ],
    };
  }

  if (!input.destinations.every((d) => capabilityMatrixOk(d.capabilityMatrix))) {
    return {
      allowed: false,
      code: "CAPABILITY_MATRIX_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CAPABILITY_MATRIX_INCOMPLETE",
        "AWAITING_CAPABILITY_MATRIX",
        "INSPECT_POST_REVIEW_MESSAGE_READ_BACK",
      ),
      reasons: [
        "F11 requires per-action capability matrix (post/review/message/read-back) per destination (T-F11)",
      ],
    };
  }

  if (
    !input.destinations.every((d) =>
      destinationContractOk(d.destinationContract),
    )
  ) {
    return {
      allowed: false,
      code: "DESTINATION_CONTRACT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DESTINATION_CONTRACT_INCOMPLETE",
        "AWAITING_DESTINATION_CONTRACT",
        "CHOOSE_APPROVED_FORMATS_AND_BOUNDARIES",
      ),
      reasons: [
        "F11 requires destination contract with approved formats and location boundary (T-F11)",
      ],
    };
  }

  if (!supportPolicyOk(input.supportPolicy)) {
    return {
      allowed: false,
      code: "SUPPORT_POLICY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SUPPORT_POLICY_INCOMPLETE",
        "AWAITING_SUPPORT_POLICY",
        "SET_SUPPORT_HOURS_AND_ESCALATION",
      ),
      reasons: [
        "F11 requires support hours policy and human escalation recipients (T-F11)",
      ],
    };
  }

  if (
    !authorizedTestArtifactOk(input.authorizedTestArtifact, input.destinations)
  ) {
    return {
      allowed: false,
      code: "AUTHORIZED_TEST_ARTIFACT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "AUTHORIZED_TEST_ARTIFACT_INCOMPLETE",
        "AWAITING_AUTHORIZED_TEST_ARTIFACT",
        "PERFORM_AUTHORIZED_FIXTURE_TEST",
      ),
      reasons: [
        "F11 requires specifically authorized fixture test artifact with ready capability (T-F11)",
      ],
    };
  }

  const support = input.supportPolicy;
  const testArtifact = input.authorizedTestArtifact;

  return {
    allowed: true,
    code: "CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      destinationCount: input.destinations.length,
      channelKinds,
      accountAssetPairs,
      authResults,
      capabilityMatrixIds: input.destinations.map(
        (d) => d.capabilityMatrix!.matrixId.trim(),
      ),
      destinationContractIds: input.destinations.map(
        (d) => d.destinationContract!.contractId.trim(),
      ),
      supportPolicyId: support.policyId.trim(),
      supportHoursLabel: support.supportHoursLabel.trim(),
      escalationRecipientCount: support.escalationRecipientIds.length,
      testArtifactId: testArtifact.artifactId.trim(),
      testArtifactDestinationAssetId: testArtifact.destinationAssetId.trim(),
      testArtifactAuthorizedAtIso: testArtifact.authorizedAtIso.trim(),
      readyCapability: true,
      channelsVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F11_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "LOCAL_SOCIAL_INBOX_CHANNELS_RECORDED",
      recoveryPath: "KEEP_FIXTURE_CHANNELS_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F11 evidence package recorded (account/asset IDs, auth results, per-action capability matrices, destination contracts, support policy, authorized test artifact with ready capability); live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}

export {
  ChannelActionCapability,
  ChannelAuthResult,
  LocalSocialInboxChannelKind,
};
