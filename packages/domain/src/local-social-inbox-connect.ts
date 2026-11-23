/**
 * T-US-021 — Connect local/social/inbox (F11/SC-18) — test artifact and capability.
 *
 * Offline fixture gate: each enabled destination (local GBP, social, inbox)
 * must present account/asset IDs, an auth result, a per-action capability
 * matrix, a destination contract, a support policy, and a specifically
 * authorized test artifact before the surface is ready. Live provider
 * adapters stay NOT_WIRED. Distinct from T-US-022 (unsupported destination
 * capabilities) and T-X045 (partial campaign destination states).
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 */

export const LocalSocialInboxChannelKind = {
  LOCAL_GBP: "LOCAL_GBP",
  SOCIAL: "SOCIAL",
  INBOX: "INBOX",
} as const;

export type LocalSocialInboxChannelKindValue =
  (typeof LocalSocialInboxChannelKind)[keyof typeof LocalSocialInboxChannelKind];

/** Per-action capabilities inspected separately (F11 step 3). */
export const ChannelActionCapability = {
  POST: "POST",
  REVIEW_READ: "REVIEW_READ",
  MESSAGE_SEND: "MESSAGE_SEND",
  READ_BACK: "READ_BACK",
} as const;

export type ChannelActionCapabilityValue =
  (typeof ChannelActionCapability)[keyof typeof ChannelActionCapability];

/** Capabilities permitted on the offline fixture connect surface. */
export const FIXTURE_CHANNEL_ACTION_CAPABILITIES: readonly ChannelActionCapabilityValue[] =
  [
    ChannelActionCapability.POST,
    ChannelActionCapability.REVIEW_READ,
    ChannelActionCapability.MESSAGE_SEND,
    ChannelActionCapability.READ_BACK,
  ] as const;

export const ChannelAuthResult = {
  FIXTURE_AUTH_OK: "FIXTURE_AUTH_OK",
  NEEDS_HUMAN_VERIFICATION: "NEEDS_HUMAN_VERIFICATION",
  FAILED: "FAILED",
} as const;

export type ChannelAuthResultValue =
  (typeof ChannelAuthResult)[keyof typeof ChannelAuthResult];

export type LocalSocialInboxDestinationInput = {
  channelKind: LocalSocialInboxChannelKindValue;
  /** Exact page/profile/location asset id (non-secret). */
  accountId: string;
  assetId: string;
  authResult: ChannelAuthResultValue;
  capabilityMatrixPresent: boolean;
  capabilities: readonly ChannelActionCapabilityValue[];
  destinationContractPresent: boolean;
  destinationContractId: string | null;
  /** Approved content formats / location boundaries present. */
  approvedFormatsPresent: boolean;
  locationBoundaryPresent: boolean;
};

export type LocalSocialInboxConnectInput = {
  destinations: readonly LocalSocialInboxDestinationInput[];
  /** Support hours + human escalation recipients (F11 steps 5). */
  supportPolicyPresent: boolean;
  supportPolicyId: string | null;
  escalationRecipientsPresent: boolean;
  /** Specifically authorized fixture test artifact (F11 step 6). */
  authorizedTestArtifactPresent: boolean;
  testArtifactId: string | null;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type LocalSocialInboxConnectDecision =
  | {
      allowed: true;
      code: "LOCAL_SOCIAL_INBOX_CONNECT_READY";
      destinationsReady: true;
      supportPolicyReady: true;
      testArtifactReady: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        destinationIds: string[];
        capabilityMatrixIds: string[];
        destinationContractIds: string[];
        supportPolicyId: string;
        testArtifactId: string;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "DESTINATIONS_MISSING"
        | "ACCOUNT_OR_ASSET_ID_MISSING"
        | "AUTH_RESULT_NOT_READY"
        | "CAPABILITY_MATRIX_INCOMPLETE"
        | "UNSUPPORTED_CAPABILITY_REFUSED"
        | "DESTINATION_CONTRACT_MISSING"
        | "APPROVED_FORMATS_OR_BOUNDARY_MISSING"
        | "SUPPORT_POLICY_INCOMPLETE"
        | "AUTHORIZED_TEST_ARTIFACT_MISSING"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      destinationsReady: boolean;
      supportPolicyReady: boolean;
      testArtifactReady: boolean;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

export const LOCAL_SOCIAL_INBOX_CONNECT_RELATED_CASE_IDS = [
  "T-US-021",
] as const;

type DestinationGateFailureCode =
  | "ACCOUNT_OR_ASSET_ID_MISSING"
  | "AUTH_RESULT_NOT_READY"
  | "CAPABILITY_MATRIX_INCOMPLETE"
  | "UNSUPPORTED_CAPABILITY_REFUSED"
  | "DESTINATION_CONTRACT_MISSING"
  | "APPROVED_FORMATS_OR_BOUNDARY_MISSING";

function destinationReady(
  d: LocalSocialInboxDestinationInput,
):
  | { ok: true }
  | { ok: false; code: DestinationGateFailureCode; reason: string } {
  if (!d.accountId.trim() || !d.assetId.trim()) {
    return {
      ok: false,
      code: "ACCOUNT_OR_ASSET_ID_MISSING",
      reason: `Account/asset IDs required for ${d.channelKind} (T-US-021)`,
    };
  }
  if (d.authResult !== ChannelAuthResult.FIXTURE_AUTH_OK) {
    return {
      ok: false,
      code: "AUTH_RESULT_NOT_READY",
      reason: `Auth must be FIXTURE_AUTH_OK before connect ready (${d.channelKind}) (T-US-021)`,
    };
  }
  if (!d.capabilityMatrixPresent || d.capabilities.length === 0) {
    return {
      ok: false,
      code: "CAPABILITY_MATRIX_INCOMPLETE",
      reason: `Per-action capability matrix required for ${d.channelKind} (T-US-021)`,
    };
  }
  const allowed = new Set<string>(FIXTURE_CHANNEL_ACTION_CAPABILITIES);
  if (d.capabilities.some((c) => !allowed.has(c))) {
    return {
      ok: false,
      code: "UNSUPPORTED_CAPABILITY_REFUSED",
      reason: `Unsupported capability refused on fixture surface (${d.channelKind}) (T-US-021)`,
    };
  }
  if (
    !d.destinationContractPresent ||
    !d.destinationContractId ||
    !d.destinationContractId.trim()
  ) {
    return {
      ok: false,
      code: "DESTINATION_CONTRACT_MISSING",
      reason: `Destination contract required for ${d.channelKind} (T-US-021)`,
    };
  }
  if (!d.approvedFormatsPresent || !d.locationBoundaryPresent) {
    return {
      ok: false,
      code: "APPROVED_FORMATS_OR_BOUNDARY_MISSING",
      reason: `Approved formats and location boundary required for ${d.channelKind} (T-US-021)`,
    };
  }
  return { ok: true };
}

/**
 * Connect local / social / inbox destinations with test artifact + capability.
 * Live provider wiring always refused offline.
 */
export function evaluateLocalSocialInboxConnect(
  input: LocalSocialInboxConnectInput,
): LocalSocialInboxConnectDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  const supportPolicyReady =
    input.supportPolicyPresent &&
    !!input.supportPolicyId &&
    input.supportPolicyId.trim() !== "" &&
    input.escalationRecipientsPresent;

  const testArtifactReady =
    input.authorizedTestArtifactPresent &&
    !!input.testArtifactId &&
    input.testArtifactId.trim() !== "";

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      destinationsReady: false,
      supportPolicyReady,
      testArtifactReady,
      ...base,
      reasons: [
        "Live local/social/inbox provider wiring remains NOT_WIRED — refuse live connect (T-US-021)",
      ],
    };
  }

  if (!input.destinations || input.destinations.length === 0) {
    return {
      allowed: false,
      code: "DESTINATIONS_MISSING",
      destinationsReady: false,
      supportPolicyReady,
      testArtifactReady,
      ...base,
      reasons: [
        "At least one local/social/inbox destination required (T-US-021)",
      ],
    };
  }

  for (const d of input.destinations) {
    const check = destinationReady(d);
    if (!check.ok) {
      return {
        allowed: false,
        code: check.code,
        destinationsReady: false,
        supportPolicyReady,
        testArtifactReady,
        ...base,
        reasons: [check.reason],
      };
    }
  }

  if (!supportPolicyReady) {
    return {
      allowed: false,
      code: "SUPPORT_POLICY_INCOMPLETE",
      destinationsReady: true,
      supportPolicyReady: false,
      testArtifactReady,
      ...base,
      reasons: [
        "Support hours policy and human escalation recipients required (T-US-021)",
      ],
    };
  }

  if (!testArtifactReady) {
    return {
      allowed: false,
      code: "AUTHORIZED_TEST_ARTIFACT_MISSING",
      destinationsReady: true,
      supportPolicyReady: true,
      testArtifactReady: false,
      ...base,
      reasons: [
        "Specifically authorized fixture test artifact required before connect ready (T-US-021)",
      ],
    };
  }

  const destinationIds = input.destinations.map(
    (d) => `${d.channelKind}:${d.accountId}/${d.assetId}`,
  );
  const capabilityMatrixIds = input.destinations.map(
    (d) => `caps-${d.channelKind}-${d.capabilities.join("+")}`,
  );
  const destinationContractIds = input.destinations.map(
    (d) => d.destinationContractId!,
  );

  return {
    allowed: true,
    code: "LOCAL_SOCIAL_INBOX_CONNECT_READY",
    destinationsReady: true,
    supportPolicyReady: true,
    testArtifactReady: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      destinationIds,
      capabilityMatrixIds,
      destinationContractIds,
      supportPolicyId: input.supportPolicyId!,
      testArtifactId: input.testArtifactId!,
    },
    reasons: [
      "Local/social/inbox destinations connected with per-action capabilities and authorized test artifact",
      `destinations=${destinationIds.join(",")}`,
      `supportPolicyId=${input.supportPolicyId}`,
      `testArtifactId=${input.testArtifactId}`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
