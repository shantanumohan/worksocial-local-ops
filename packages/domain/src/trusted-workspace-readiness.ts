/**
 * T-US-001 — Create a trusted local workspace (F01/SC-02): readiness
 * summary with explicit blockers and next actions per dimension.
 *
 * Distinguishes host ready, Claude authenticated, providers ready, and
 * workstreams ready. Observe is the initial operating mode; public writes
 * never occur during fixture readiness. External effects: NONE unless a
 * public write is recorded. ChatGPT Ads uses the three-part access gate
 * (transport + entitlement + auth) via evaluateChatGptAdsAccess.
 */

import {
  AnalyticsEnvironment,
  evaluateChatGptAdsAccess,
} from "./analytics.js";
import {
  ActionClass,
  OperatingMode,
  type OperatingModeValue,
} from "./standing-authority.js";

export const ReadinessDimension = {
  HOST: "host",
  CLAUDE: "claude",
  PROVIDERS: "providers",
  WORKSTREAMS: "workstreams",
} as const;

export type ReadinessDimensionValue =
  (typeof ReadinessDimension)[keyof typeof ReadinessDimension];

export const ReadinessState = {
  READY: "READY",
  BLOCKED: "BLOCKED",
} as const;

export type ReadinessStateValue =
  (typeof ReadinessState)[keyof typeof ReadinessState];

/** Required host diagnostic categories (F01 step 3). */
export const HostProbeCategory = {
  SERVICE_IDENTITY: "service_identity",
  LEASE: "lease",
  STORAGE: "storage",
  CLOCK: "clock",
} as const;

export type HostProbeCategoryValue =
  (typeof HostProbeCategory)[keyof typeof HostProbeCategory];

export const REQUIRED_HOST_PROBE_CATEGORIES = [
  HostProbeCategory.SERVICE_IDENTITY,
  HostProbeCategory.LEASE,
  HostProbeCategory.STORAGE,
  HostProbeCategory.CLOCK,
] as const;

export type HostDiagnosticProbe = {
  probeId: string;
  /** Required for host probes — maps to REQUIRED_HOST_PROBE_CATEGORIES. */
  category?: HostProbeCategoryValue;
  label: string;
  ok: boolean;
  detail: string;
  observedAtIso: string;
};

export type DimensionObservation = {
  dimension: ReadinessDimensionValue;
  ready: boolean;
  /** Human-readable blocker when not ready; null when ready. */
  blocker: string | null;
  /** Concrete next action when blocked; null when ready. */
  nextAction: string | null;
  /** Timestamped diagnostic evidence for this dimension. */
  diagnostics: HostDiagnosticProbe[];
};

export type TrustedWorkspaceInput = {
  nowIso: string;
  ownerId: string;
  ownerRole: string;
  sessionId: string;
  businessName: string;
  timezone: string;
  notificationRecipients: string[];
  workspaceConfigRevision: string;
  operatingMode: OperatingModeValue;
  /** Host service identity / lease / storage / clock probes. */
  hostProbes: HostDiagnosticProbe[];
  /** Claude executable / auth probes. */
  claudeProbes: HostDiagnosticProbe[];
  /** Provider connection readiness (fixture adapters OK). */
  providerProbes: HostDiagnosticProbe[];
  /** Workstream / mission readiness probes. */
  workstreamProbes: HostDiagnosticProbe[];
  /**
   * ChatGPT Ads three-part gate inputs. Defaults → ACCESS_BLOCKED
   * (transport, entitlement, and auth all unverified).
   */
  chatgptAds?: {
    localTransportVerified: boolean;
    entitlementVerified: boolean;
    authVerified: boolean;
  };
  /** Must stay false for fixture ACCEPTED honesty. */
  publicWritesOccurred?: boolean;
};

export type ExternalEffectsHonesty = "NONE" | "PRESENT";

export type TrustedWorkspaceReadiness = {
  ownerId: string;
  ownerRole: string;
  sessionId: string;
  businessName: string;
  timezone: string;
  notificationRecipients: string[];
  workspaceConfigRevision: string;
  operatingMode: OperatingModeValue;
  observeDeniesPublish: boolean;
  publicWritesOccurred: boolean;
  chatgptAdsAccess: "ACCESS_BLOCKED" | "ENTITLED";
  chatgptAdsCode: string;
  dimensions: DimensionObservation[];
  /** True only when every dimension is READY and Observe is active. */
  localReadinessVerified: boolean;
  blockers: Array<{
    dimension: ReadinessDimensionValue;
    blocker: string;
    nextAction: string;
  }>;
  /**
   * NONE only when no public write occurred. A recorded public write
   * reports PRESENT — never claim zero effects after a mutation.
   */
  externalEffects: ExternalEffectsHonesty;
};

export const TRUSTED_WORKSPACE_READINESS_RELATED_CASE_IDS = [
  "T-US-001",
  "T-F01",
] as const;

const DIMENSION_NEXT_ACTIONS: Record<ReadinessDimensionValue, string> = {
  [ReadinessDimension.HOST]:
    "Resolve failing host diagnostic probes (service identity, storage, clock, singleton lease)",
  [ReadinessDimension.CLAUDE]:
    "Install or authenticate Claude Code on this local host",
  [ReadinessDimension.PROVIDERS]:
    "Configure fixture/live provider connections required for Observe",
  [ReadinessDimension.WORKSTREAMS]:
    "Create or enable an initial Observe workstream after host readiness",
};

function summarizeGenericDimension(
  dimension: ReadinessDimensionValue,
  probes: HostDiagnosticProbe[],
): DimensionObservation {
  const failing = probes.filter((p) => !p.ok);
  if (failing.length === 0 && probes.length > 0) {
    return {
      dimension,
      ready: true,
      blocker: null,
      nextAction: null,
      diagnostics: probes,
    };
  }
  const blocker =
    probes.length === 0
      ? `No timestamped ${dimension} diagnostics recorded`
      : failing.map((p) => `${p.label}: ${p.detail}`).join("; ");
  return {
    dimension,
    ready: false,
    blocker,
    nextAction: DIMENSION_NEXT_ACTIONS[dimension],
    diagnostics: probes,
  };
}

/**
 * Host readiness requires every REQUIRED_HOST_PROBE_CATEGORIES entry
 * present and ok — a subset of passing probes never declares READY.
 */
function summarizeHostDimension(
  probes: HostDiagnosticProbe[],
): DimensionObservation {
  const missing: string[] = [];
  const failing: string[] = [];

  for (const category of REQUIRED_HOST_PROBE_CATEGORIES) {
    const matches = probes.filter((p) => p.category === category);
    if (matches.length === 0) {
      missing.push(category);
      continue;
    }
    for (const p of matches) {
      if (!p.ok) {
        failing.push(`${p.label}: ${p.detail}`);
      }
    }
  }

  if (missing.length === 0 && failing.length === 0) {
    return {
      dimension: ReadinessDimension.HOST,
      ready: true,
      blocker: null,
      nextAction: null,
      diagnostics: probes,
    };
  }

  const parts: string[] = [];
  if (missing.length > 0) {
    parts.push(`Missing host probes: ${missing.join(", ")}`);
  }
  if (failing.length > 0) {
    parts.push(failing.join("; "));
  }

  return {
    dimension: ReadinessDimension.HOST,
    ready: false,
    blocker: parts.join(" | "),
    nextAction: DIMENSION_NEXT_ACTIONS[ReadinessDimension.HOST],
    diagnostics: probes,
  };
}

/**
 * Build the F01 readiness summary: per-dimension READY/BLOCKED with
 * explicit blockers and next actions. Observe denies publish classes.
 */
export function evaluateTrustedWorkspaceReadiness(
  input: TrustedWorkspaceInput,
): TrustedWorkspaceReadiness {
  const dimensions: DimensionObservation[] = [
    summarizeHostDimension(input.hostProbes),
    summarizeGenericDimension(ReadinessDimension.CLAUDE, input.claudeProbes),
    summarizeGenericDimension(
      ReadinessDimension.PROVIDERS,
      input.providerProbes,
    ),
    summarizeGenericDimension(
      ReadinessDimension.WORKSTREAMS,
      input.workstreamProbes,
    ),
  ];

  const blockers = dimensions
    .filter((d) => !d.ready)
    .map((d) => ({
      dimension: d.dimension,
      blocker: d.blocker ?? `Blocked: ${d.dimension}`,
      nextAction: d.nextAction ?? DIMENSION_NEXT_ACTIONS[d.dimension],
    }));

  const observeMode = input.operatingMode === OperatingMode.OBSERVE;
  const publicWritesOccurred = input.publicWritesOccurred === true;

  const adsGate = evaluateChatGptAdsAccess({
    localTransportVerified: input.chatgptAds?.localTransportVerified === true,
    entitlementVerified: input.chatgptAds?.entitlementVerified === true,
    authVerified: input.chatgptAds?.authVerified === true,
    projectEnvironment: AnalyticsEnvironment.FIXTURE,
    requestedEnvironment: AnalyticsEnvironment.FIXTURE,
  });
  const chatgptAdsAccess = adsGate.allowed ? "ENTITLED" : "ACCESS_BLOCKED";

  return {
    ownerId: input.ownerId,
    ownerRole: input.ownerRole,
    sessionId: input.sessionId,
    businessName: input.businessName,
    timezone: input.timezone,
    notificationRecipients: [...input.notificationRecipients],
    workspaceConfigRevision: input.workspaceConfigRevision,
    operatingMode: input.operatingMode,
    observeDeniesPublish: observeMode,
    publicWritesOccurred,
    chatgptAdsAccess,
    chatgptAdsCode: adsGate.code,
    dimensions,
    localReadinessVerified:
      blockers.length === 0 && observeMode && !publicWritesOccurred,
    blockers,
    externalEffects: publicWritesOccurred ? "PRESENT" : "NONE",
  };
}

/**
 * Observe mode never authorizes routine publish / customer reply classes
 * during trusted-workspace activation.
 */
export function observeModeBlocksActionClass(
  mode: OperatingModeValue,
  actionClass: string,
): boolean {
  if (mode !== OperatingMode.OBSERVE) {
    return false;
  }
  return (
    actionClass === ActionClass.ROUTINE_PUBLISH ||
    actionClass === ActionClass.ROUTINE_CUSTOMER_SERVICE ||
    actionClass === ActionClass.MATERIAL_CHANGE ||
    actionClass === ActionClass.BOUNDED_REPAIR ||
    actionClass === ActionClass.ACCESS_OR_POLICY_CHANGE
  );
}
