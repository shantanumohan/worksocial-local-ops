/**
 * T-X062 — SSE gap after offline UI: Full-state resync.
 *
 * After the UI goes offline, reconnecting with a non-contiguous SSE cursor
 * (sequence gap) must refuse incremental catch-up and require a full-state
 * snapshot resync that covers at least the observed gap seq and replaces UI
 * state. Missed events are never invented. External effects: NONE.
 */

export type SseUiCursor = {
  /** Last contiguous event sequence applied by the UI. */
  lastAppliedSeq: number;
  /** True while the UI is offline / disconnected from SSE. */
  offline: boolean;
  /** Snapshot revision after a successful full-state resync; null before any. */
  lastSnapshotRevision: number | null;
  /**
   * After an SSE gap, minimum snapshot coversThroughSeq required before
   * clearing full-state resync. Null when no outstanding gap.
   */
  minResyncThroughSeq: number | null;
  /** Digest of the UI's current applied entity state (replaced on full resync). */
  stateDigest: string;
};

export type SseStreamEvent = {
  seq: number;
  /** Opaque fixture payload id — not executed. */
  payloadId: string;
};

export type SseFullStateSnapshot = {
  revision: number;
  /** Highest event seq covered by this snapshot. */
  coversThroughSeq: number;
  entityCount: number;
  /** Digest of the authoritative entity state carried by the snapshot. */
  stateDigest: string;
};

export type SseReconnectDecisionCode =
  | "INCREMENTAL_APPLY"
  | "SSE_GAP_FULL_RESYNC_REQUIRED"
  | "FULL_STATE_RESYNC"
  | "SNAPSHOT_INSUFFICIENT_COVERAGE"
  | "IGNORE_STALE"
  | "STILL_OFFLINE";

export type SseReconnectDecision = {
  code: SseReconnectDecisionCode;
  allowedIncremental: boolean;
  fullStateResyncRequired: boolean;
  cursor: SseUiCursor;
  reasons: string[];
  externalEffects: "NONE";
};

export function createSseUiCursor(input?: {
  lastAppliedSeq?: number;
  stateDigest?: string;
}): SseUiCursor {
  return {
    lastAppliedSeq: input?.lastAppliedSeq ?? 0,
    offline: false,
    lastSnapshotRevision: null,
    minResyncThroughSeq: null,
    stateDigest: input?.stateDigest ?? "digest-empty",
  };
}

/** Mark the UI offline (SSE disconnect). Does not invent catch-up events. */
export function markSseUiOffline(cursor: SseUiCursor): SseUiCursor {
  return { ...cursor, offline: true };
}

/**
 * Apply one SSE event after reconnect (or while online).
 * Contiguous next seq → incremental apply.
 * Gap (seq > lastApplied+1) after offline → full-state resync required;
 * records minResyncThroughSeq so later snapshots must cover the gap.
 * Stale/duplicate (seq <= lastApplied) → ignore.
 */
export function evaluateSseEventAfterOffline(input: {
  cursor: SseUiCursor;
  event: SseStreamEvent;
  /** Callers set true when this evaluation is the first after reconnect. */
  reconnecting: boolean;
}): SseReconnectDecision {
  const { cursor, event, reconnecting } = input;

  if (cursor.offline && !reconnecting) {
    return {
      code: "STILL_OFFLINE",
      allowedIncremental: false,
      fullStateResyncRequired: cursor.minResyncThroughSeq != null,
      cursor,
      reasons: [
        "UI still offline — SSE events are not applied until reconnect + gap check",
      ],
      externalEffects: "NONE",
    };
  }

  const onlineCursor: SseUiCursor = reconnecting
    ? { ...cursor, offline: false }
    : cursor;

  if (event.seq <= onlineCursor.lastAppliedSeq) {
    return {
      code: "IGNORE_STALE",
      allowedIncremental: false,
      fullStateResyncRequired: onlineCursor.minResyncThroughSeq != null,
      cursor: onlineCursor,
      reasons: [
        `Event seq=${event.seq} ≤ lastAppliedSeq=${onlineCursor.lastAppliedSeq} — ignore stale/duplicate`,
      ],
      externalEffects: "NONE",
    };
  }

  const expected = onlineCursor.lastAppliedSeq + 1;
  if (event.seq === expected && onlineCursor.minResyncThroughSeq == null) {
    return {
      code: "INCREMENTAL_APPLY",
      allowedIncremental: true,
      fullStateResyncRequired: false,
      cursor: {
        ...onlineCursor,
        lastAppliedSeq: event.seq,
        stateDigest: `digest-event-${event.seq}-${event.payloadId}`,
      },
      reasons: [
        `Contiguous seq=${event.seq} after lastApplied=${onlineCursor.lastAppliedSeq} — incremental apply`,
      ],
      externalEffects: "NONE",
    };
  }

  // Gap (or outstanding gap still blocking incremental): refuse catch-up.
  const minRequired = Math.max(
    onlineCursor.minResyncThroughSeq ?? 0,
    event.seq,
  );
  return {
    code: "SSE_GAP_FULL_RESYNC_REQUIRED",
    allowedIncremental: false,
    fullStateResyncRequired: true,
    cursor: {
      ...onlineCursor,
      minResyncThroughSeq: minRequired,
    },
    reasons: [
      `SSE gap: expected seq=${expected} got seq=${event.seq} after offline — incremental catch-up refused; full-state resync required through seq=${minRequired}`,
    ],
    externalEffects: "NONE",
  };
}

/**
 * Apply a server full-state snapshot after an SSE gap.
 * Snapshot must cover minResyncThroughSeq (when set) and replace UI stateDigest.
 * Does not invent missed intermediate events.
 */
export function applySseFullStateResync(input: {
  cursor: SseUiCursor;
  snapshot: SseFullStateSnapshot;
}): SseReconnectDecision {
  if (!input.snapshot.stateDigest.trim()) {
    return {
      code: "SNAPSHOT_INSUFFICIENT_COVERAGE",
      allowedIncremental: false,
      fullStateResyncRequired: true,
      cursor: input.cursor,
      reasons: [
        "Snapshot missing stateDigest — refuse empty full-state replacement",
      ],
      externalEffects: "NONE",
    };
  }

  if (input.snapshot.coversThroughSeq < input.cursor.lastAppliedSeq) {
    return {
      code: "IGNORE_STALE",
      allowedIncremental: false,
      fullStateResyncRequired: true,
      cursor: input.cursor,
      reasons: [
        `Snapshot coversThroughSeq=${input.snapshot.coversThroughSeq} < lastAppliedSeq=${input.cursor.lastAppliedSeq} — refuse regressive snapshot`,
      ],
      externalEffects: "NONE",
    };
  }

  const minRequired = input.cursor.minResyncThroughSeq;
  if (
    minRequired != null &&
    input.snapshot.coversThroughSeq < minRequired
  ) {
    return {
      code: "SNAPSHOT_INSUFFICIENT_COVERAGE",
      allowedIncremental: false,
      fullStateResyncRequired: true,
      cursor: input.cursor,
      reasons: [
        `Snapshot coversThroughSeq=${input.snapshot.coversThroughSeq} < minResyncThroughSeq=${minRequired} — stale/partial snapshot cannot clear SSE gap`,
      ],
      externalEffects: "NONE",
    };
  }

  const priorDigest = input.cursor.stateDigest;
  const next: SseUiCursor = {
    lastAppliedSeq: input.snapshot.coversThroughSeq,
    offline: false,
    lastSnapshotRevision: input.snapshot.revision,
    minResyncThroughSeq: null,
    stateDigest: input.snapshot.stateDigest,
  };

  return {
    code: "FULL_STATE_RESYNC",
    allowedIncremental: false,
    fullStateResyncRequired: false,
    cursor: next,
    reasons: [
      `Full-state resync applied revision=${input.snapshot.revision} coversThroughSeq=${input.snapshot.coversThroughSeq} entities=${input.snapshot.entityCount}; stateDigest ${priorDigest} → ${input.snapshot.stateDigest}; missed SSE events not invented`,
    ],
    externalEffects: "NONE",
  };
}

export const SSE_GAP_FULL_RESYNC_RELATED_CASE_IDS = ["T-X062"] as const;
