/**
 * Host sleep during scheduled monitoring (T-X001).
 *
 * When the local host sleeps across scheduled probe slots:
 * - Missed slots are derived from cadence + sleep/wake bounds (honest COVERAGE_GAP)
 * - On wake, repetitive missed probes coalesce into a single catch-up run (no burst)
 * - Catch-up only increments probeApplyCount after an actual fixture probe result
 * - lastVerifiedSuccessAtIso advances only on actual SUCCESS, monotonically
 * - Live probe / Temporal / host-heartbeat reads stay NOT_WIRED offline
 *
 * Pure domain. External effects: NONE. No network / Temporal / credentials.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

/** Live host-sleep monitoring / probe transport — always NOT_WIRED offline. */
export const HOST_SLEEP_LIVE_WIRING = "NOT_WIRED" as const;

export const MonitoringSlotOutcome = {
  SUCCESS: "SUCCESS",
  COVERAGE_GAP: "COVERAGE_GAP",
  COALESCED_CATCHUP: "COALESCED_CATCHUP",
} as const;

export type MonitoringSlotOutcomeValue =
  (typeof MonitoringSlotOutcome)[keyof typeof MonitoringSlotOutcome];

export type MonitoringSlotRecord = {
  /** `${probeId}:${scheduledAtIso}` */
  slotId: string;
  probeId: string;
  scheduledAtIso: string;
  outcome: MonitoringSlotOutcomeValue;
  /** Wall clock when a probe actually ran; null for open coverage gaps. */
  executedAtIso: string | null;
  /** When coalesced, points at the catch-up slot that absorbed this gap. */
  coalescedIntoSlotId: string | null;
};

export type HostSleepMonitoringState = {
  probeId: string;
  /** Cadence between scheduled monitoring slots. */
  intervalMs: number;
  /** Last actual SUCCESS only — never advanced by gaps or invented zeros. */
  lastVerifiedSuccessAtIso: string | null;
  slots: MonitoringSlotRecord[];
  /** Count of real probe executions (SUCCESS + executed catch-up). */
  probeApplyCount: number;
  externalEffects: "NONE";
  /** Live probe / Temporal / host-heartbeat reads remain NOT_WIRED for fixture soak. */
  liveMonitoringWiring: typeof HOST_SLEEP_LIVE_WIRING;
};

export type CatchupProbeResult = {
  /** Fixture probe actually ran at this instant. */
  executedAtIso: string;
  /** Fixture verdict — SUCCESS updates lastVerified; FAILURE still counts as apply. */
  verdict: "SUCCESS" | "FAILURE";
};

export function monitoringSlotId(
  probeId: string,
  scheduledAtIso: string,
): string {
  return `${probeId}:${scheduledAtIso}`;
}

export function createHostSleepMonitoringState(input: {
  probeId: string;
  intervalMs: number;
}): HostSleepMonitoringState {
  if (!input.probeId.trim()) {
    throw new Error("probeId is required");
  }
  if (!Number.isFinite(input.intervalMs) || input.intervalMs <= 0) {
    throw new Error("intervalMs must be a positive finite number");
  }
  return {
    probeId: input.probeId,
    intervalMs: input.intervalMs,
    lastVerifiedSuccessAtIso: null,
    slots: [],
    probeApplyCount: 0,
    externalEffects: "NONE",
    liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
  };
}

/** True when a slot is an open (not-yet-coalesced) coverage gap. */
export function isOpenCoverageGap(slot: MonitoringSlotRecord): boolean {
  return (
    slot.outcome === MonitoringSlotOutcome.COVERAGE_GAP &&
    slot.coalescedIntoSlotId === null &&
    slot.executedAtIso === null
  );
}

/** Open COVERAGE_GAP slots awaiting wake coalesce. */
export function listOpenCoverageGaps(
  state: HostSleepMonitoringState,
): MonitoringSlotRecord[] {
  return state.slots.filter(isOpenCoverageGap);
}

export type HostSleepMonitoringHonesty = {
  honest: boolean;
  externalEffects: "NONE";
  liveMonitoringWiring: typeof HOST_SLEEP_LIVE_WIRING;
  openGapCount: number;
  reasons: string[];
};

/**
 * Fixture honesty edges for T-X001 — never claim live VERIFIED or invent gap executes.
 */
export function evaluateHostSleepMonitoringHonesty(
  state: HostSleepMonitoringState,
): HostSleepMonitoringHonesty {
  const reasons: string[] = [];
  if (state.externalEffects !== "NONE") {
    reasons.push(`externalEffects=${state.externalEffects} (expected NONE)`);
  }
  if (state.liveMonitoringWiring !== HOST_SLEEP_LIVE_WIRING) {
    reasons.push(
      `liveMonitoringWiring=${state.liveMonitoringWiring} (expected NOT_WIRED)`,
    );
  }
  const dishonestGaps = state.slots.filter(
    (s) =>
      s.outcome === MonitoringSlotOutcome.COVERAGE_GAP &&
      s.executedAtIso !== null,
  );
  if (dishonestGaps.length > 0) {
    reasons.push(
      `${dishonestGaps.length} COVERAGE_GAP slot(s) claim executedAtIso (invented probe)`,
    );
  }
  const openGaps = listOpenCoverageGaps(state);
  return {
    honest: reasons.length === 0,
    externalEffects: "NONE",
    liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
    openGapCount: openGaps.length,
    reasons,
  };
}

function maxIso(a: string | null, b: string): string {
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * Derive missed scheduled slot times from cadence between last success and wake.
 * Does not invent off-cadence or future gaps.
 */
export function deriveMissedScheduledSlots(input: {
  lastSuccessAtIso: string;
  wakeAtIso: string;
  intervalMs: number;
}): string[] {
  const start = Date.parse(input.lastSuccessAtIso);
  const wake = Date.parse(input.wakeAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(wake)) {
    throw new Error("lastSuccessAtIso and wakeAtIso must be valid ISO timestamps");
  }
  if (wake <= start) {
    return [];
  }
  if (!Number.isFinite(input.intervalMs) || input.intervalMs <= 0) {
    throw new Error("intervalMs must be a positive finite number");
  }
  const missed: string[] = [];
  let next = start + input.intervalMs;
  while (next < wake) {
    missed.push(new Date(next).toISOString());
    next += input.intervalMs;
  }
  return missed;
}

/**
 * Record an on-schedule SUCCESS while the host is awake.
 * Advances lastVerifiedSuccessAtIso monotonically and probeApplyCount.
 */
export function recordScheduledProbeSuccess(
  state: HostSleepMonitoringState,
  input: { scheduledAtIso: string; executedAtIso: string },
): HostSleepMonitoringState {
  const slotId = monitoringSlotId(state.probeId, input.scheduledAtIso);
  if (state.slots.some((s) => s.slotId === slotId)) {
    throw new Error(`Slot already recorded: ${slotId}`);
  }
  const slot: MonitoringSlotRecord = {
    slotId,
    probeId: state.probeId,
    scheduledAtIso: input.scheduledAtIso,
    outcome: MonitoringSlotOutcome.SUCCESS,
    executedAtIso: input.executedAtIso,
    coalescedIntoSlotId: null,
  };
  return {
    ...state,
    lastVerifiedSuccessAtIso: maxIso(
      state.lastVerifiedSuccessAtIso,
      input.executedAtIso,
    ),
    probeApplyCount: state.probeApplyCount + 1,
    slots: [...state.slots, slot],
  };
}

/**
 * Mark scheduled slots missed while the host slept as honest COVERAGE_GAP.
 * Prefer deriveMissedScheduledSlots(...) for the timestamp list.
 * Does not advance lastVerifiedSuccessAtIso and does not execute probes.
 */
export function markHostSleepCoverageGaps(
  state: HostSleepMonitoringState,
  missedScheduledAtIsos: readonly string[],
): HostSleepMonitoringState {
  const added: MonitoringSlotRecord[] = [];
  for (const scheduledAtIso of missedScheduledAtIsos) {
    const slotId = monitoringSlotId(state.probeId, scheduledAtIso);
    if (
      state.slots.some((s) => s.slotId === slotId) ||
      added.some((s) => s.slotId === slotId)
    ) {
      throw new Error(`Slot already recorded: ${slotId}`);
    }
    if (state.lastVerifiedSuccessAtIso) {
      const delta =
        Date.parse(scheduledAtIso) - Date.parse(state.lastVerifiedSuccessAtIso);
      if (delta <= 0 || delta % state.intervalMs !== 0) {
        throw new Error(
          `Missed slot ${scheduledAtIso} is off-cadence for intervalMs=${state.intervalMs}`,
        );
      }
    }
    added.push({
      slotId,
      probeId: state.probeId,
      scheduledAtIso,
      outcome: MonitoringSlotOutcome.COVERAGE_GAP,
      executedAtIso: null,
      coalescedIntoSlotId: null,
    });
  }
  return {
    ...state,
    slots: [...state.slots, ...added],
  };
}

export type CoalesceWakeCatchupResult =
  | {
      ok: true;
      state: HostSleepMonitoringState;
      catchupSlotId: string;
      coalescedGapSlotIds: string[];
      probeAppliesThisWake: 1;
      liveMonitoringWiring: typeof HOST_SLEEP_LIVE_WIRING;
      externalEffects: "NONE";
    }
  | {
      ok: false;
      code:
        | "NO_OPEN_GAPS"
        | "BURST_FORBIDDEN"
        | "CATCHUP_PROBE_REQUIRED"
        | "DISK_FULL";
      reason: string;
      liveMonitoringWiring: typeof HOST_SLEEP_LIVE_WIRING;
      externalEffects: "NONE";
    };

/**
 * On host wake, coalesce all open COVERAGE_GAP slots into one catch-up probe.
 * Requires an actual fixture catch-up probe result before counting an apply.
 * Refuses burst execution of each missed slot individually.
 * Fixture ENOSPC / disk-full refuses without inventing SUCCESS or advancing lastVerified
 * (distinct from T-X004 evidence-manifest disk-full).
 */
export function coalesceWakeCatchup(
  state: HostSleepMonitoringState,
  input: {
    wakeAtIso: string;
    /** Actual fixture catch-up probe execution — required to count an apply. */
    catchupProbe: CatchupProbeResult | null;
    /** If true, caller attempted one-probe-per-missed-slot — always refuse. */
    attemptedBurstPerMissedSlot?: boolean;
    /**
     * Fixture ENOSPC signal during wake catch-up persistence.
     * When true, refuse with DISK_FULL — open gaps stay open; no invented SUCCESS.
     */
    fixtureDiskFull?: boolean;
  },
): CoalesceWakeCatchupResult {
  if (input.attemptedBurstPerMissedSlot) {
    return {
      ok: false,
      code: "BURST_FORBIDDEN",
      reason:
        "Missed monitoring slots must coalesce on wake — burst per-slot replay forbidden",
      liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
      externalEffects: "NONE",
    };
  }

  const openGaps = listOpenCoverageGaps(state);
  if (openGaps.length === 0) {
    return {
      ok: false,
      code: "NO_OPEN_GAPS",
      reason: "No open coverage gaps to coalesce",
      liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
      externalEffects: "NONE",
    };
  }

  if (input.fixtureDiskFull) {
    return {
      ok: false,
      code: "DISK_FULL",
      reason:
        "ENOSPC during host-sleep wake catch-up — open coverage gaps stay open; no invented SUCCESS (distinct from T-X004 evidence disk-full)",
      liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
      externalEffects: "NONE",
    };
  }

  if (!input.catchupProbe) {
    return {
      ok: false,
      code: "CATCHUP_PROBE_REQUIRED",
      reason:
        "Catch-up coalesce requires an actual fixture probe result before counting an apply",
      liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
      externalEffects: "NONE",
    };
  }

  const catchupScheduledAtIso = input.wakeAtIso;
  const catchupSlotId = monitoringSlotId(state.probeId, catchupScheduledAtIso);
  if (state.slots.some((s) => s.slotId === catchupSlotId)) {
    throw new Error(`Catch-up slot already recorded: ${catchupSlotId}`);
  }

  const catchup: MonitoringSlotRecord = {
    slotId: catchupSlotId,
    probeId: state.probeId,
    scheduledAtIso: catchupScheduledAtIso,
    outcome: MonitoringSlotOutcome.COALESCED_CATCHUP,
    executedAtIso: input.catchupProbe.executedAtIso,
    coalescedIntoSlotId: null,
  };

  const coalescedGapSlotIds = openGaps.map((g) => g.slotId);
  const slots = state.slots.map((s) =>
    coalescedGapSlotIds.includes(s.slotId)
      ? { ...s, coalescedIntoSlotId: catchupSlotId }
      : s,
  );

  let lastVerified = state.lastVerifiedSuccessAtIso;
  if (input.catchupProbe.verdict === "SUCCESS") {
    lastVerified = maxIso(lastVerified, input.catchupProbe.executedAtIso);
  }

  return {
    ok: true,
    state: {
      ...state,
      lastVerifiedSuccessAtIso: lastVerified,
      probeApplyCount: state.probeApplyCount + 1,
      slots: [...slots, catchup],
      externalEffects: "NONE",
      liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
    },
    catchupSlotId,
    coalescedGapSlotIds,
    probeAppliesThisWake: 1,
    liveMonitoringWiring: HOST_SLEEP_LIVE_WIRING,
    externalEffects: "NONE",
  };
}

/** Catalog linkage — fixture ACCEPTED only via soak proof, never silent VERIFIED. */
export const HOST_SLEEP_MONITORING_RELATED_CASE_IDS = ["T-X001"] as const;
