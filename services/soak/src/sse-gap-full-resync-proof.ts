/**
 * Fixture proof for T-X062 — SSE gap after offline UI → full-state resync.
 * Additive hillclimb: liveProviderWiring=NOT_WIRED; online gap; pending-gap
 * blocks contiguous invent; covering-beyond; invalid seq refuse.
 * External effects: NONE. Never live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  applySseFullStateResync,
  createSseUiCursor,
  evaluateSseEventAfterOffline,
  markSseUiOffline,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X062 fixture ACCEPTED.
 */
export function proofSseGapFullStateResync(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Contiguous online events apply incrementally (positive control).
  let cursor = createSseUiCursor({
    lastAppliedSeq: 100,
    stateDigest: "digest-seq-100",
  });
  const contiguous = evaluateSseEventAfterOffline({
    cursor,
    event: { seq: 101, payloadId: `p-${randomUUID().slice(0, 8)}` },
    reconnecting: false,
  });
  if (
    contiguous.code === "INCREMENTAL_APPLY" &&
    contiguous.allowedIncremental === true &&
    contiguous.fullStateResyncRequired === false &&
    contiguous.cursor.lastAppliedSeq === 101 &&
    contiguous.cursor.stateDigest.startsWith("digest-event-101-") &&
    contiguous.externalEffects === "NONE" &&
    contiguous.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Online contiguous seq=101 → INCREMENTAL_APPLY; lastAppliedSeq=101; stateDigest advanced; liveProviderWiring=NOT_WIRED",
    );
    cursor = contiguous.cursor;
  } else {
    passed = false;
    details.push(`Contiguous unexpectedly ${JSON.stringify(contiguous)}`);
  }

  const priorDigest = cursor.stateDigest;

  // 2. Offline + gap on reconnect → full-state resync required (no invent).
  cursor = markSseUiOffline(cursor);
  const gap = evaluateSseEventAfterOffline({
    cursor,
    event: { seq: 108, payloadId: `p-gap-${randomUUID().slice(0, 8)}` },
    reconnecting: true,
  });
  if (
    gap.code === "SSE_GAP_FULL_RESYNC_REQUIRED" &&
    gap.allowedIncremental === false &&
    gap.fullStateResyncRequired === true &&
    gap.cursor.lastAppliedSeq === 101 &&
    gap.cursor.minResyncThroughSeq === 108 &&
    gap.cursor.stateDigest === priorDigest &&
    gap.externalEffects === "NONE" &&
    gap.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "After offline, seq=108 gap → SSE_GAP_FULL_RESYNC_REQUIRED; minResyncThroughSeq=108; incremental refused; stateDigest unchanged",
    );
  } else {
    passed = false;
    details.push(`Gap unexpectedly ${JSON.stringify(gap)}`);
  }

  // 2b. Pending gap blocks contiguous invent (hillclimb).
  const blocked = evaluateSseEventAfterOffline({
    cursor: gap.cursor,
    event: { seq: 102, payloadId: "p-invent-mid" },
    reconnecting: false,
  });
  if (
    blocked.code === "SSE_GAP_FULL_RESYNC_REQUIRED" &&
    blocked.allowedIncremental === false &&
    blocked.cursor.lastAppliedSeq === 101 &&
    blocked.cursor.minResyncThroughSeq === 108 &&
    blocked.cursor.stateDigest === priorDigest &&
    blocked.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Outstanding gap blocks contiguous seq=102 invent — lastApplied stays 101; minResyncThroughSeq=108",
    );
  } else {
    passed = false;
    details.push(`Pending-gap block unexpectedly ${JSON.stringify(blocked)}`);
  }

  // 2c. Online gap (no offline mark) also requires full resync (hillclimb).
  const onlineGap = evaluateSseEventAfterOffline({
    cursor: createSseUiCursor({
      lastAppliedSeq: 50,
      stateDigest: "digest-seq-50",
    }),
    event: { seq: 60, payloadId: "p-online-gap" },
    reconnecting: false,
  });
  if (
    onlineGap.code === "SSE_GAP_FULL_RESYNC_REQUIRED" &&
    onlineGap.cursor.minResyncThroughSeq === 60 &&
    onlineGap.cursor.lastAppliedSeq === 50 &&
    onlineGap.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Online gap seq=60 (no offline mark) → SSE_GAP_FULL_RESYNC_REQUIRED; missed events not invented",
    );
  } else {
    passed = false;
    details.push(`Online gap unexpectedly ${JSON.stringify(onlineGap)}`);
  }

  // 2d. Invalid seq refuse (hillclimb).
  const invalid = evaluateSseEventAfterOffline({
    cursor: gap.cursor,
    event: { seq: 0, payloadId: "p-zero" },
    reconnecting: false,
  });
  if (
    invalid.code === "INVALID_SEQ" &&
    invalid.allowedIncremental === false &&
    invalid.liveProviderWiring === "NOT_WIRED" &&
    invalid.externalEffects === "NONE"
  ) {
    details.push("seq=0 → INVALID_SEQ; liveProviderWiring=NOT_WIRED");
  } else {
    passed = false;
    details.push(`Invalid seq unexpectedly ${JSON.stringify(invalid)}`);
  }

  // 3. Snapshot below gap coverage must not clear the requirement.
  const insufficient = applySseFullStateResync({
    cursor: gap.cursor,
    snapshot: {
      revision: 9000,
      coversThroughSeq: 107,
      entityCount: 11,
      stateDigest: "digest-snap-partial-107",
    },
  });
  if (
    insufficient.code === "SNAPSHOT_INSUFFICIENT_COVERAGE" &&
    insufficient.fullStateResyncRequired === true &&
    insufficient.cursor.minResyncThroughSeq === 108 &&
    insufficient.cursor.stateDigest === priorDigest &&
    insufficient.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "coversThroughSeq=107 < minResyncThroughSeq=108 → SNAPSHOT_INSUFFICIENT_COVERAGE; prior state retained",
    );
  } else {
    passed = false;
    details.push(`Insufficient unexpectedly ${JSON.stringify(insufficient)}`);
  }

  // 3b. Whitespace digest refuse (hillclimb).
  const blankDigest = applySseFullStateResync({
    cursor: gap.cursor,
    snapshot: {
      revision: 9000,
      coversThroughSeq: 108,
      entityCount: 11,
      stateDigest: "   ",
    },
  });
  if (
    blankDigest.code === "SNAPSHOT_INSUFFICIENT_COVERAGE" &&
    blankDigest.cursor.stateDigest === priorDigest &&
    blankDigest.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push("Whitespace stateDigest → SNAPSHOT_INSUFFICIENT_COVERAGE");
  } else {
    passed = false;
    details.push(`Blank digest unexpectedly ${JSON.stringify(blankDigest)}`);
  }

  // 4. Covering snapshot (beyond min) replaces UI state; no invented mid events.
  const snapshotDigest = `digest-snap-9001-${randomUUID().slice(0, 8)}`;
  const resync = applySseFullStateResync({
    cursor: gap.cursor,
    snapshot: {
      revision: 9001,
      coversThroughSeq: 110,
      entityCount: 12,
      stateDigest: `  ${snapshotDigest}  `,
    },
  });
  if (
    resync.code === "FULL_STATE_RESYNC" &&
    resync.fullStateResyncRequired === false &&
    resync.cursor.lastAppliedSeq === 110 &&
    resync.cursor.lastSnapshotRevision === 9001 &&
    resync.cursor.minResyncThroughSeq === null &&
    resync.cursor.stateDigest === snapshotDigest &&
    resync.cursor.stateDigest !== priorDigest &&
    resync.externalEffects === "NONE" &&
    resync.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      `FULL_STATE_RESYNC revision=9001 coversThroughSeq=110 (≥108); stateDigest replaced (${priorDigest} → ${snapshotDigest}); missed SSE events not invented; liveProviderWiring=NOT_WIRED`,
    );
  } else {
    passed = false;
    details.push(`Resync unexpectedly ${JSON.stringify(resync)}`);
  }

  // 5. After resync, contiguous resume works.
  const resume = evaluateSseEventAfterOffline({
    cursor: resync.cursor,
    event: { seq: 111, payloadId: `p-resume-${randomUUID().slice(0, 8)}` },
    reconnecting: false,
  });
  if (
    resume.code === "INCREMENTAL_APPLY" &&
    resume.cursor.lastAppliedSeq === 111 &&
    resume.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Post-resync contiguous seq=111 → INCREMENTAL_APPLY (stream resumes)",
    );
  } else {
    passed = false;
    details.push(`Resume unexpectedly ${JSON.stringify(resume)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
  );

  return {
    proofId: `proof-sse-gap-${randomUUID()}`,
    kind: SoakProofKind.SSE_GAP_FULL_STATE_RESYNC,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx062-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
