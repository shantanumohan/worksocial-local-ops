/**
 * T-US-022 — Unsupported destination capabilities respected.
 *
 * Offline fixture gate: each destination publishes a per-action capability
 * matrix. Attempting an action the destination does not support must fail
 * closed (UNSUPPORTED_DESTINATION_CAPABILITY_REFUSED). Claiming success
 * despite an unsupported action is refused. Live provider adapters stay
 * NOT_WIRED. Distinct from T-US-021 (connect + test artifact), T-X045
 * (partial campaign destination states), and T-X046 (unsupported blog
 * destination). Pure domain — no network I/O. Fixture ACCEPTED ≠
 * sandbox/prod VERIFIED. External effects: NONE.
 */

export const DestinationCapabilityAction = {
  POST: "POST",
  REVIEW_READ: "REVIEW_READ",
  MESSAGE_SEND: "MESSAGE_SEND",
  READ_BACK: "READ_BACK",
  /** Never granted on the offline fixture surface for social/local destinations. */
  ADS_MUTATE: "ADS_MUTATE",
} as const;

export type DestinationCapabilityActionValue =
  (typeof DestinationCapabilityAction)[keyof typeof DestinationCapabilityAction];

export const DestinationCapabilityKind = {
  LOCAL_GBP: "LOCAL_GBP",
  SOCIAL: "SOCIAL",
  INBOX: "INBOX",
  CMS: "CMS",
} as const;

export type DestinationCapabilityKindValue =
  (typeof DestinationCapabilityKind)[keyof typeof DestinationCapabilityKind];

export type DestinationCapabilityMatrix = {
  destinationId: string;
  destinationKind: DestinationCapabilityKindValue;
  /** Explicit supported actions; unsupported actions must be refused. */
  supportedCapabilities: readonly DestinationCapabilityActionValue[];
};

export type UnsupportedDestinationCapabilityInput = {
  destination: DestinationCapabilityMatrix;
  requestedAction: DestinationCapabilityActionValue;
  /** Attempt to claim success even when action is unsupported — must refuse. */
  claimSuccessDespiteUnsupported: boolean;
  /** Request live provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type UnsupportedDestinationCapabilityDecision =
  | {
      allowed: true;
      code: "SUPPORTED_CAPABILITY_ATTEMPT_ALLOWED";
      capabilitiesRespected: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        destinationId: string;
        requestedAction: DestinationCapabilityActionValue;
        supportedCapabilities: DestinationCapabilityActionValue[];
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "CAPABILITY_MATRIX_MISSING"
        | "UNSUPPORTED_DESTINATION_CAPABILITY_REFUSED"
        | "FALSE_SUCCESS_CLAIM_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      capabilitiesRespected: boolean;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

export const UNSUPPORTED_DESTINATION_CAPABILITIES_RELATED_CASE_IDS = [
  "T-US-022",
] as const;

/**
 * Evaluate a single destination action against its declared capability matrix.
 * Unsupported actions and false success claims are refused; live stays NOT_WIRED.
 */
export function evaluateUnsupportedDestinationCapability(
  input: UnsupportedDestinationCapabilityInput,
): UnsupportedDestinationCapabilityDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      capabilitiesRespected: false,
      ...base,
      reasons: [
        "Live destination capability apply remains NOT_WIRED — refuse live wiring (T-US-022)",
      ],
    };
  }

  if (
    !input.destination.destinationId.trim() ||
    !input.destination.supportedCapabilities ||
    input.destination.supportedCapabilities.length === 0
  ) {
    return {
      allowed: false,
      code: "CAPABILITY_MATRIX_MISSING",
      capabilitiesRespected: false,
      ...base,
      reasons: [
        "Destination capability matrix with at least one supported action is required (T-US-022)",
      ],
    };
  }

  const supported = new Set<string>(input.destination.supportedCapabilities);
  const actionSupported = supported.has(input.requestedAction);

  if (!actionSupported) {
    if (input.claimSuccessDespiteUnsupported) {
      return {
        allowed: false,
        code: "FALSE_SUCCESS_CLAIM_REFUSED",
        capabilitiesRespected: true,
        ...base,
        reasons: [
          `Refused false success claim for unsupported action ${input.requestedAction} on ${input.destination.destinationId} (T-US-022)`,
        ],
      };
    }
    return {
      allowed: false,
      code: "UNSUPPORTED_DESTINATION_CAPABILITY_REFUSED",
      capabilitiesRespected: true,
      ...base,
      reasons: [
        `Unsupported capability ${input.requestedAction} refused for destination ${input.destination.destinationId} (${input.destination.destinationKind}) (T-US-022)`,
      ],
    };
  }

  if (input.claimSuccessDespiteUnsupported) {
    // Supported action with a "despite unsupported" claim is incoherent — refuse.
    return {
      allowed: false,
      code: "FALSE_SUCCESS_CLAIM_REFUSED",
      capabilitiesRespected: true,
      ...base,
      reasons: [
        "claimSuccessDespiteUnsupported is incoherent when the action is supported — refuse (T-US-022)",
      ],
    };
  }

  return {
    allowed: true,
    code: "SUPPORTED_CAPABILITY_ATTEMPT_ALLOWED",
    capabilitiesRespected: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      destinationId: input.destination.destinationId,
      requestedAction: input.requestedAction,
      supportedCapabilities: [...input.destination.supportedCapabilities],
    },
    reasons: [
      `Supported capability ${input.requestedAction} allowed on ${input.destination.destinationId}; unsupported actions remain refused`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}

export type DestinationCapabilityBatchInput = {
  destinations: readonly DestinationCapabilityMatrix[];
  attempts: readonly {
    destinationId: string;
    requestedAction: DestinationCapabilityActionValue;
  }[];
  requestLiveProviderWiring: boolean;
};

export type DestinationCapabilityBatchDecision =
  | {
      allowed: true;
      code: "UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED";
      capabilitiesRespected: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        destinationIds: string[];
        allowedAttempts: string[];
        refusedUnsupported: string[];
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "DESTINATIONS_MISSING"
        | "ATTEMPT_DESTINATION_UNKNOWN"
        | "UNSUPPORTED_NOT_RESPECTED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      capabilitiesRespected: boolean;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

/**
 * Batch gate: every attempt must either be a supported action or be refused
 * as unsupported. Live wiring stays NOT_WIRED.
 */
export function evaluateUnsupportedDestinationCapabilityBatch(
  input: DestinationCapabilityBatchInput,
): DestinationCapabilityBatchDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      capabilitiesRespected: false,
      ...base,
      reasons: [
        "Live destination capability batch remains NOT_WIRED (T-US-022)",
      ],
    };
  }

  if (!input.destinations || input.destinations.length === 0) {
    return {
      allowed: false,
      code: "DESTINATIONS_MISSING",
      capabilitiesRespected: false,
      ...base,
      reasons: ["At least one destination capability matrix required (T-US-022)"],
    };
  }

  const byId = new Map(
    input.destinations.map((d) => [d.destinationId, d] as const),
  );
  const allowedAttempts: string[] = [];
  const refusedUnsupported: string[] = [];

  for (const attempt of input.attempts) {
    const dest = byId.get(attempt.destinationId);
    if (!dest) {
      return {
        allowed: false,
        code: "ATTEMPT_DESTINATION_UNKNOWN",
        capabilitiesRespected: false,
        ...base,
        reasons: [
          `Attempt references unknown destination ${attempt.destinationId} (T-US-022)`,
        ],
      };
    }
    const decision = evaluateUnsupportedDestinationCapability({
      destination: dest,
      requestedAction: attempt.requestedAction,
      claimSuccessDespiteUnsupported: false,
      requestLiveProviderWiring: false,
    });
    if (decision.allowed) {
      allowedAttempts.push(
        `${attempt.destinationId}:${attempt.requestedAction}`,
      );
      continue;
    }
    if (decision.code === "UNSUPPORTED_DESTINATION_CAPABILITY_REFUSED") {
      refusedUnsupported.push(
        `${attempt.destinationId}:${attempt.requestedAction}`,
      );
      continue;
    }
    return {
      allowed: false,
      code: "UNSUPPORTED_NOT_RESPECTED",
      capabilitiesRespected: false,
      ...base,
      reasons: [
        `Capability gate failed for ${attempt.destinationId}:${attempt.requestedAction} code=${decision.code} (T-US-022)`,
      ],
    };
  }

  return {
    allowed: true,
    code: "UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED",
    capabilitiesRespected: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      destinationIds: input.destinations.map((d) => d.destinationId),
      allowedAttempts,
      refusedUnsupported,
    },
    reasons: [
      "Unsupported destination capabilities respected; only supported actions allowed",
      `allowed=${allowedAttempts.join(",") || "(none)"}`,
      `refusedUnsupported=${refusedUnsupported.join(",") || "(none)"}`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
