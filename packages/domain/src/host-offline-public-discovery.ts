/**
 * T-X071 — Local host offline public discovery: honest unavailability.
 *
 * When the local execution host is offline, public-discovery surfaces
 * (GEO / ChatGPT presence / business visibility observations) must report
 * UNAVAILABLE with reason HOST_OFFLINE — never invent AVAILABLE,
 * ACTIVE_COVERAGE, or discovery ranks. Distinct from T-X001 (scheduled
 * monitoring sleep coverage gaps). External effects: NONE. ChatGPT Ads
 * stays ACCESS_BLOCKED without verified local transport/entitlement.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

export const HostDiscoveryLiveness = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
} as const;

export type HostDiscoveryLivenessValue =
  (typeof HostDiscoveryLiveness)[keyof typeof HostDiscoveryLiveness];

export const PublicDiscoveryAvailability = {
  AVAILABLE: "AVAILABLE",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export type PublicDiscoveryAvailabilityValue =
  (typeof PublicDiscoveryAvailability)[keyof typeof PublicDiscoveryAvailability];

export const PublicDiscoveryUnavailableReason = {
  HOST_OFFLINE: "HOST_OFFLINE",
} as const;

export type PublicDiscoveryUnavailableReasonValue =
  (typeof PublicDiscoveryUnavailableReason)[keyof typeof PublicDiscoveryUnavailableReason];

export const PublicDiscoveryDecisionCode = {
  HOST_ONLINE_AVAILABLE: "HOST_ONLINE_AVAILABLE",
  HOST_OFFLINE_UNAVAILABLE: "HOST_OFFLINE_UNAVAILABLE",
  CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED:
    "CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED",
} as const;

export type PublicDiscoveryDecisionCodeValue =
  (typeof PublicDiscoveryDecisionCode)[keyof typeof PublicDiscoveryDecisionCode];

export type PublicDiscoveryObservation = {
  observationId: string;
  surface: "geo_presence" | "chatgpt_business" | "public_visibility";
  observedAtIso: string;
  availability: PublicDiscoveryAvailabilityValue;
  unavailableReason: PublicDiscoveryUnavailableReasonValue | null;
  /** Never true while host is offline — no pretend active coverage. */
  activeCoverageClaimed: boolean;
  /** Never invented while offline — ranks stay null. */
  inventedDiscoveryRank: number | null;
  hostLiveness: HostDiscoveryLivenessValue;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  externalEffects: "NONE";
  code: PublicDiscoveryDecisionCodeValue;
  reasons: string[];
};

/**
 * Evaluate a public-discovery observation against local host liveness.
 * Offline host → honest UNAVAILABLE / HOST_OFFLINE; refuses AVAILABLE claims.
 */
export function evaluateHostOfflinePublicDiscovery(input: {
  observationId: string;
  surface?: PublicDiscoveryObservation["surface"];
  hostLiveness: HostDiscoveryLivenessValue;
  nowIso: string;
  /**
   * Optional claim from a caller that wants AVAILABLE while the host may be
   * offline — refused when hostLiveness=OFFLINE.
   */
  claimedAvailability?: PublicDiscoveryAvailabilityValue;
  /** Prior success only informs ONLINE path; never invents offline availability. */
  lastSuccessfulDiscoveryAtIso?: string | null;
}): PublicDiscoveryObservation {
  const surface = input.surface ?? "public_visibility";
  const base = {
    observationId: input.observationId,
    surface,
    observedAtIso: input.nowIso,
    chatgptAdsAccess: "ACCESS_BLOCKED" as const,
    externalEffects: "NONE" as const,
    hostLiveness: input.hostLiveness,
  };

  if (input.hostLiveness === HostDiscoveryLiveness.OFFLINE) {
    const claimedAvailable =
      input.claimedAvailability === PublicDiscoveryAvailability.AVAILABLE;
    return {
      ...base,
      availability: PublicDiscoveryAvailability.UNAVAILABLE,
      unavailableReason: PublicDiscoveryUnavailableReason.HOST_OFFLINE,
      activeCoverageClaimed: false,
      inventedDiscoveryRank: null,
      code: claimedAvailable
        ? PublicDiscoveryDecisionCode.CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED
        : PublicDiscoveryDecisionCode.HOST_OFFLINE_UNAVAILABLE,
      reasons: claimedAvailable
        ? [
            "Host OFFLINE — claimed AVAILABLE refused; honest UNAVAILABLE/HOST_OFFLINE",
            "activeCoverageClaimed=false inventedDiscoveryRank=null",
            "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
          ]
        : [
            "Host OFFLINE — public discovery UNAVAILABLE (HOST_OFFLINE)",
            "No pretend active coverage; no invented discovery rank",
            "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
          ],
    };
  }

  // ONLINE — measured availability only when a prior success exists; still never Ads.
  const hasPriorSuccess = Boolean(input.lastSuccessfulDiscoveryAtIso);
  return {
    ...base,
    availability: hasPriorSuccess
      ? PublicDiscoveryAvailability.AVAILABLE
      : PublicDiscoveryAvailability.UNAVAILABLE,
    unavailableReason: null,
    activeCoverageClaimed: hasPriorSuccess,
    inventedDiscoveryRank: null,
    code: PublicDiscoveryDecisionCode.HOST_ONLINE_AVAILABLE,
    reasons: hasPriorSuccess
      ? [
          "Host ONLINE with prior discovery success — AVAILABLE allowed",
          "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
        ]
      : [
          "Host ONLINE but no prior discovery success — UNAVAILABLE (not invented)",
          "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
        ],
  };
}

export const HOST_OFFLINE_PUBLIC_DISCOVERY_RELATED_CASE_IDS = [
  "T-X071",
] as const;
