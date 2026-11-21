/**
 * WP10 / F24 recovery evidence — classify host/provider outage and queued work.
 *
 * Separates STALE_OBSERVATION vs ACTIVE_INCIDENT vs UNKNOWN_REMOTE_OUTCOME.
 * Fixture-only effects. Never silently VERIFIED for live recovery.
 * Pure types + classifiers. No network I/O.
 */

import { EffectState, type EffectStateValue } from "./effect-state-machine.js";

/** Honest classification for recovery inspection (F24 step 1). */
export const RecoveryObservationClass = {
  STALE_OBSERVATION: "STALE_OBSERVATION",
  ACTIVE_INCIDENT: "ACTIVE_INCIDENT",
  UNKNOWN_REMOTE_OUTCOME: "UNKNOWN_REMOTE_OUTCOME",
} as const;

export type RecoveryObservationClassValue =
  (typeof RecoveryObservationClass)[keyof typeof RecoveryObservationClass];

export const OutagePlane = {
  HOST: "host",
  PROVIDER: "provider",
  NONE: "none",
} as const;

export type OutagePlaneValue = (typeof OutagePlane)[keyof typeof OutagePlane];

export const RecoveryRunStatus = {
  PASSED: "PASSED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
} as const;

export type RecoveryRunStatusValue =
  (typeof RecoveryRunStatus)[keyof typeof RecoveryRunStatus];

/** Live recovery claim status — VERIFIED is forbidden without authorized evidence. */
export const LiveRecoveryClaim = {
  NOT_RUN: "NOT_RUN",
  NOT_WIRED: "NOT_WIRED",
  BLOCKED: "BLOCKED",
} as const;

export type LiveRecoveryClaimValue =
  (typeof LiveRecoveryClaim)[keyof typeof LiveRecoveryClaim];

export const FORBIDDEN_LIVE_RECOVERY_STATUS = "VERIFIED" as const;

/** Default age after which an unconfirmed observation is stale (5 minutes). */
export const DEFAULT_OBSERVATION_STALE_MS = 5 * 60 * 1000;

export type QueuedWorkItem = {
  workId: string;
  capabilityId: string;
  operationId: string | null;
  effectState: EffectStateValue | null;
  queuedAtIso: string;
  summary: string;
};

export type CapabilityStopRecord = {
  stopId: string;
  capabilityId: string;
  plane: OutagePlaneValue;
  reason: string;
  stoppedAtIso: string;
  /** Unrelated healthy workstreams must remain runnable. */
  unrelatedCapabilitiesAllowed: true;
  resumeAllowed: boolean;
};

export type HealthTimelineEvent = {
  eventId: string;
  recordedAtIso: string;
  plane: OutagePlaneValue;
  classification: RecoveryObservationClassValue;
  summary: string;
  sourceKind: "heartbeat" | "probe" | "effect_ledger" | "fixture";
  relatedCapabilityIds: string[];
  queuedWorkCount: number;
  evidenceRefs: string[];
};

export type RecoveryClassificationInput = {
  nowMs: number;
  /** Last time this signal was observed; null means never observed. */
  lastObservedAtIso: string | null;
  staleAfterMs?: number;
  /** Fresh confirmed outage evidence (host down / provider unreachable). */
  confirmedOutage: boolean;
  plane: OutagePlaneValue;
  /** Post-apply effect state when known. */
  effectState?: EffectStateValue | null;
};

export type RecoveryClassificationResult = {
  classification: RecoveryObservationClassValue;
  plane: OutagePlaneValue;
  reason: string;
  /** Fail closed — do not resume outbound writes while true. */
  blocksOutboundResume: boolean;
  /** Fail closed — do not retry provider apply while true. */
  blocksProviderRetry: boolean;
  observationAgeMs: number | null;
};

/**
 * Classify a recovery observation.
 *
 * Precedence (highest first):
 * 1. UNKNOWN_REMOTE_OUTCOME — post-apply ambiguous remote write
 * 2. ACTIVE_INCIDENT — confirmed host/provider outage with current evidence
 * 3. STALE_OBSERVATION — aged/missing signal without confirmed outage
 */
export function classifyRecoveryObservation(
  input: RecoveryClassificationInput,
): RecoveryClassificationResult {
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_OBSERVATION_STALE_MS;
  const effectState = input.effectState ?? null;

  let observationAgeMs: number | null = null;
  if (input.lastObservedAtIso) {
    const then = Date.parse(input.lastObservedAtIso);
    if (Number.isFinite(then)) {
      observationAgeMs = Math.max(0, input.nowMs - then);
    }
  }

  if (effectState === EffectState.UNKNOWN_REMOTE_OUTCOME) {
    return {
      classification: RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME,
      plane: input.plane,
      reason:
        "Post-apply remote outcome is ambiguous — reconcile provider state before retry or resume",
      blocksOutboundResume: true,
      blocksProviderRetry: true,
      observationAgeMs,
    };
  }

  if (input.confirmedOutage && input.plane !== OutagePlane.NONE) {
    return {
      classification: RecoveryObservationClass.ACTIVE_INCIDENT,
      plane: input.plane,
      reason: `Confirmed ${input.plane} outage with current evidence`,
      blocksOutboundResume: true,
      blocksProviderRetry: input.plane === OutagePlane.PROVIDER,
      observationAgeMs,
    };
  }

  const isStale =
    observationAgeMs === null || observationAgeMs > staleAfterMs;

  if (isStale) {
    return {
      classification: RecoveryObservationClass.STALE_OBSERVATION,
      plane: input.plane === OutagePlane.NONE ? OutagePlane.NONE : input.plane,
      reason:
        observationAgeMs === null
          ? "No observation recorded — treat as stale, not an active incident"
          : `Observation age ${observationAgeMs}ms exceeds stale threshold ${staleAfterMs}ms without confirmed outage`,
      blocksOutboundResume: false,
      blocksProviderRetry: false,
      observationAgeMs,
    };
  }

  // Fresh observation, no confirmed outage, no unknown remote — still label as
  // stale-class absence of incident rather than inventing ACTIVE_INCIDENT.
  return {
    classification: RecoveryObservationClass.STALE_OBSERVATION,
    plane: OutagePlane.NONE,
    reason:
      "Fresh observation without confirmed outage — not an active incident",
    blocksOutboundResume: false,
    blocksProviderRetry: false,
    observationAgeMs,
  };
}

export type CapabilityStopInput = {
  stopId: string;
  capabilityId: string;
  plane: OutagePlaneValue;
  reason: string;
  stoppedAtIso: string;
};

/**
 * Capability-level stop — pauses only the affected capability.
 * Unrelated healthy workstreams remain allowed.
 */
export function createCapabilityStop(
  input: CapabilityStopInput,
): CapabilityStopRecord {
  if (input.plane === OutagePlane.NONE) {
    throw new Error(
      "Capability stop requires host or provider plane — NONE is not an outage plane",
    );
  }
  return {
    stopId: input.stopId,
    capabilityId: input.capabilityId,
    plane: input.plane,
    reason: input.reason,
    stoppedAtIso: input.stoppedAtIso,
    unrelatedCapabilitiesAllowed: true,
    resumeAllowed: false,
  };
}

export function isCapabilityOutboundStopped(
  stops: readonly CapabilityStopRecord[],
  capabilityId: string,
): boolean {
  return stops.some(
    (s) => s.capabilityId === capabilityId && !s.resumeAllowed,
  );
}

export type RecoveryScenarioId =
  | "host_outage_queued_work"
  | "provider_outage_capability_stop"
  | "stale_heartbeat_not_incident"
  | "unknown_remote_reconcile";

export const RECOVERY_FIXTURE_SCENARIO_IDS: readonly RecoveryScenarioId[] = [
  "host_outage_queued_work",
  "provider_outage_capability_stop",
  "stale_heartbeat_not_incident",
  "unknown_remote_reconcile",
] as const;

/** Catalog IDs this fixture surface exercises honestly (never live VERIFIED). */
export const RECOVERY_RELATED_CASE_IDS: readonly string[] = [
  "T-F24",
  "T-US-047",
  "T-X001",
  "T-X017",
  "T-X020",
  "T-X068",
  "T-X071",
] as const;

export type RecoveryEvidenceArtifact = {
  artifactId: string;
  scenarioId: RecoveryScenarioId;
  environment: "fixture";
  redacted: true;
  summary: string;
  classification: RecoveryObservationClassValue;
  evidenceRef: string;
  createdAtIso: string;
};

export type RecoveryRunRecord = {
  runId: string;
  scenarioId: RecoveryScenarioId;
  status: RecoveryRunStatusValue;
  classification: RecoveryObservationClassValue;
  timelineEventIds: string[];
  capabilityStopIds: string[];
  queuedWorkIds: string[];
  artifactId: string | null;
  details: string[];
  /** Always false — fixture paths never claim live recovery VERIFIED. */
  liveRecoveryVerified: false;
  liveRecoveryClaim: LiveRecoveryClaimValue;
  externalEffects: "NONE";
  productionActivated: false;
  startedAtIso: string;
  endedAtIso: string;
};

export type RecoveryEvidenceState = {
  version: 1;
  updatedAtIso: string;
  timeline: HealthTimelineEvent[];
  queuedWork: QueuedWorkItem[];
  capabilityStops: CapabilityStopRecord[];
  runs: RecoveryRunRecord[];
  artifacts: RecoveryEvidenceArtifact[];
  liveWiring: {
    hostRecovery: "NOT_WIRED" | "fixture";
    providerRecovery: "NOT_WIRED" | "fixture";
    credentialRotation: "NOT_WIRED";
    offboarding: "NOT_WIRED";
  };
  liveRecoveryClaim: LiveRecoveryClaimValue;
  chatgptAdsWiring: "NOT_WIRED";
  productionActivated: false;
};

export function emptyRecoveryEvidenceState(
  nowIso: string,
): RecoveryEvidenceState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    timeline: [],
    queuedWork: [],
    capabilityStops: [],
    runs: [],
    artifacts: [],
    liveWiring: {
      hostRecovery: "fixture",
      providerRecovery: "fixture",
      credentialRotation: "NOT_WIRED",
      offboarding: "NOT_WIRED",
    },
    liveRecoveryClaim: LiveRecoveryClaim.NOT_RUN,
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
  };
}

export function validateLiveRecoveryClaim(status: string): {
  ok: boolean;
  reason: string;
} {
  if (status === FORBIDDEN_LIVE_RECOVERY_STATUS) {
    return {
      ok: false,
      reason:
        "Live recovery VERIFIED is forbidden without an authorized-production evidence package",
    };
  }
  if (
    status === LiveRecoveryClaim.NOT_RUN ||
    status === LiveRecoveryClaim.NOT_WIRED ||
    status === LiveRecoveryClaim.BLOCKED
  ) {
    return { ok: true, reason: "Honest live recovery claim" };
  }
  return {
    ok: false,
    reason: `Unknown live recovery claim status: ${status}`,
  };
}

/**
 * Summarize classification counts for console/API — never invent ACTIVE_INCIDENT
 * from stale rows alone.
 */
export function summarizeRecoveryClasses(
  events: readonly HealthTimelineEvent[],
): Record<RecoveryObservationClassValue, number> {
  const counts: Record<RecoveryObservationClassValue, number> = {
    STALE_OBSERVATION: 0,
    ACTIVE_INCIDENT: 0,
    UNKNOWN_REMOTE_OUTCOME: 0,
  };
  for (const e of events) {
    counts[e.classification] += 1;
  }
  return counts;
}
