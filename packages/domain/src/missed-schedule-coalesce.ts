/**
 * T-US-026 — Missed schedules coalesce; no burst republish.
 *
 * When the host recovers across missed content/social schedule slots:
 * - Missed slots are derived from cadence + last published / wake bounds
 * - On recovery, repetitive missed publishes coalesce into one catch-up
 *   (do not republish every missed post in a burst)
 * - Catch-up only increments publishApplyCount after an actual fixture
 *   catch-up decision
 * - Live provider adapters stay NOT_WIRED
 *
 * Distinct from T-X001 (monitoring probe coalesce), T-X015 (DST recurring
 * schedule no duplicates), and T-US-025 (workstream launch path).
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 */

export const MissedScheduleSlotOutcome = {
  PUBLISHED: "PUBLISHED",
  MISSED: "MISSED",
  COALESCED_CATCHUP: "COALESCED_CATCHUP",
} as const;

export type MissedScheduleSlotOutcomeValue =
  (typeof MissedScheduleSlotOutcome)[keyof typeof MissedScheduleSlotOutcome];

export type MissedScheduleSlotRecord = {
  /** `${scheduleId}:${scheduledAtIso}` */
  slotId: string;
  scheduleId: string;
  scheduledAtIso: string;
  outcome: MissedScheduleSlotOutcomeValue;
  /** Wall clock when a publish actually ran; null for open misses. */
  executedAtIso: string | null;
  /** When coalesced, points at the catch-up slot that absorbed this miss. */
  coalescedIntoSlotId: string | null;
};

export type MissedScheduleCoalesceState = {
  scheduleId: string;
  channelId: string;
  /** Cadence between scheduled publish slots. */
  intervalMs: number;
  /** Last actual PUBLISHED only — never advanced by misses. */
  lastPublishedAtIso: string | null;
  slots: MissedScheduleSlotRecord[];
  /** Count of real publish executions (PUBLISHED + executed catch-up). */
  publishApplyCount: number;
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
};

export type CatchupPublishDecision = {
  /** Fixture catch-up publish decision ran at this instant. */
  executedAtIso: string;
  /** Fixture verdict — PUBLISHED updates lastPublished; SKIPPED still counts apply. */
  verdict: "PUBLISHED" | "SKIPPED";
};

export function missedScheduleSlotId(
  scheduleId: string,
  scheduledAtIso: string,
): string {
  return `${scheduleId}:${scheduledAtIso}`;
}

export function createMissedScheduleCoalesceState(input: {
  scheduleId: string;
  channelId: string;
  intervalMs: number;
}): MissedScheduleCoalesceState {
  if (!input.scheduleId.trim()) {
    throw new Error("scheduleId is required");
  }
  if (!input.channelId.trim()) {
    throw new Error("channelId is required");
  }
  if (!Number.isFinite(input.intervalMs) || input.intervalMs <= 0) {
    throw new Error("intervalMs must be a positive finite number");
  }
  return {
    scheduleId: input.scheduleId,
    channelId: input.channelId,
    intervalMs: input.intervalMs,
    lastPublishedAtIso: null,
    slots: [],
    publishApplyCount: 0,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

function maxIso(a: string | null, b: string): string {
  if (!a) return b;
  return Date.parse(b) > Date.parse(a) ? b : a;
}

/**
 * Derive missed scheduled publish times from cadence between last publish and recovery.
 * Does not invent off-cadence or future misses.
 */
export function deriveMissedPublishSlots(input: {
  lastPublishedAtIso: string;
  recoveredAtIso: string;
  intervalMs: number;
}): string[] {
  const start = Date.parse(input.lastPublishedAtIso);
  const recovered = Date.parse(input.recoveredAtIso);
  if (!Number.isFinite(start) || !Number.isFinite(recovered)) {
    throw new Error(
      "lastPublishedAtIso and recoveredAtIso must be valid ISO timestamps",
    );
  }
  if (recovered <= start) {
    return [];
  }
  if (!Number.isFinite(input.intervalMs) || input.intervalMs <= 0) {
    throw new Error("intervalMs must be a positive finite number");
  }
  const missed: string[] = [];
  let next = start + input.intervalMs;
  while (next < recovered) {
    missed.push(new Date(next).toISOString());
    next += input.intervalMs;
  }
  return missed;
}

/**
 * Record an on-schedule PUBLISHED while the host is awake.
 * Advances lastPublishedAtIso monotonically and publishApplyCount.
 */
export function recordScheduledPublish(
  state: MissedScheduleCoalesceState,
  input: { scheduledAtIso: string; executedAtIso: string },
): MissedScheduleCoalesceState {
  const slotId = missedScheduleSlotId(state.scheduleId, input.scheduledAtIso);
  if (state.slots.some((s) => s.slotId === slotId)) {
    throw new Error(`Publish slot already recorded: ${slotId}`);
  }
  return {
    ...state,
    lastPublishedAtIso: maxIso(
      state.lastPublishedAtIso,
      input.executedAtIso,
    ),
    publishApplyCount: state.publishApplyCount + 1,
    slots: [
      ...state.slots,
      {
        slotId,
        scheduleId: state.scheduleId,
        scheduledAtIso: input.scheduledAtIso,
        outcome: MissedScheduleSlotOutcome.PUBLISHED,
        executedAtIso: input.executedAtIso,
        coalescedIntoSlotId: null,
      },
    ],
  };
}

/**
 * Mark cadence-derived misses as MISSED (honest gaps — not invented SUCCESS).
 * Does not advance lastPublishedAtIso or publishApplyCount.
 */
export function markMissedPublishSlots(
  state: MissedScheduleCoalesceState,
  missedScheduledAtIsos: readonly string[],
): MissedScheduleCoalesceState {
  const added: MissedScheduleSlotRecord[] = [];
  for (const scheduledAtIso of missedScheduledAtIsos) {
    const slotId = missedScheduleSlotId(state.scheduleId, scheduledAtIso);
    if (state.slots.some((s) => s.slotId === slotId)) {
      continue;
    }
    if (added.some((s) => s.slotId === slotId)) {
      continue;
    }
    added.push({
      slotId,
      scheduleId: state.scheduleId,
      scheduledAtIso,
      outcome: MissedScheduleSlotOutcome.MISSED,
      executedAtIso: null,
      coalescedIntoSlotId: null,
    });
  }
  return {
    ...state,
    slots: [...state.slots, ...added],
  };
}

export type CoalesceMissedPublishResult =
  | {
      ok: true;
      state: MissedScheduleCoalesceState;
      catchupSlotId: string;
      coalescedMissedSlotIds: string[];
      publishAppliesThisRecovery: 1;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
    }
  | {
      ok: false;
      code:
        | "NO_OPEN_MISSES"
        | "BURST_REPUBLISH_FORBIDDEN"
        | "CATCHUP_DECISION_REQUIRED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      reason: string;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
    };

/**
 * On host recovery, coalesce all open MISSED slots into one catch-up publish.
 * Requires an actual fixture catch-up decision before counting an apply.
 * Refuses burst republish of each missed slot individually.
 */
export function coalesceMissedPublishSlots(
  state: MissedScheduleCoalesceState,
  input: {
    recoveredAtIso: string;
    /** Actual fixture catch-up publish decision — required to count an apply. */
    catchupDecision: CatchupPublishDecision | null;
    /** If true, caller attempted one-publish-per-missed-slot — always refuse. */
    attemptedBurstRepublish?: boolean;
    /** Request live provider apply — must stay NOT_WIRED offline. */
    requestLiveProviderWiring?: boolean;
  },
): CoalesceMissedPublishResult {
  const wiring = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
  };

  if (input.requestLiveProviderWiring) {
    return {
      ok: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      reason:
        "Live missed-schedule catch-up remains NOT_WIRED — refuse live wiring (T-US-026)",
      ...wiring,
    };
  }

  if (input.attemptedBurstRepublish) {
    return {
      ok: false,
      code: "BURST_REPUBLISH_FORBIDDEN",
      reason:
        "Missed content/social schedule slots must coalesce on recovery — burst republish of every missed post forbidden (T-US-026)",
      ...wiring,
    };
  }

  const openMisses = state.slots.filter(
    (s) =>
      s.outcome === MissedScheduleSlotOutcome.MISSED &&
      s.coalescedIntoSlotId === null,
  );
  if (openMisses.length === 0) {
    return {
      ok: false,
      code: "NO_OPEN_MISSES",
      reason: "No open missed publish slots to coalesce",
      ...wiring,
    };
  }

  if (!input.catchupDecision) {
    return {
      ok: false,
      code: "CATCHUP_DECISION_REQUIRED",
      reason:
        "Catch-up coalesce requires an actual fixture publish decision before counting an apply",
      ...wiring,
    };
  }

  const catchupScheduledAtIso = input.recoveredAtIso;
  const catchupSlotId = missedScheduleSlotId(
    state.scheduleId,
    catchupScheduledAtIso,
  );
  if (state.slots.some((s) => s.slotId === catchupSlotId)) {
    throw new Error(`Catch-up slot already recorded: ${catchupSlotId}`);
  }

  const catchup: MissedScheduleSlotRecord = {
    slotId: catchupSlotId,
    scheduleId: state.scheduleId,
    scheduledAtIso: catchupScheduledAtIso,
    outcome: MissedScheduleSlotOutcome.COALESCED_CATCHUP,
    executedAtIso: input.catchupDecision.executedAtIso,
    coalescedIntoSlotId: null,
  };

  const coalescedMissedSlotIds = openMisses.map((g) => g.slotId);
  const slots = state.slots.map((s) =>
    coalescedMissedSlotIds.includes(s.slotId)
      ? { ...s, coalescedIntoSlotId: catchupSlotId }
      : s,
  );

  let lastPublished = state.lastPublishedAtIso;
  if (input.catchupDecision.verdict === "PUBLISHED") {
    lastPublished = maxIso(
      lastPublished,
      input.catchupDecision.executedAtIso,
    );
  }

  return {
    ok: true,
    state: {
      ...state,
      lastPublishedAtIso: lastPublished,
      publishApplyCount: state.publishApplyCount + 1,
      slots: [...slots, catchup],
    },
    catchupSlotId,
    coalescedMissedSlotIds,
    publishAppliesThisRecovery: 1,
    ...wiring,
  };
}

/** Catalog linkage — fixture ACCEPTED only via soak proof, never silent VERIFIED. */
export const MISSED_SCHEDULE_COALESCE_RELATED_CASE_IDS = ["T-US-026"] as const;
