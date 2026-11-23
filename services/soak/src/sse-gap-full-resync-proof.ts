/**
 * Fixture proof for T-X062 — SSE gap after offline UI → full-state resync.
 * External effects: NONE.
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
    contiguous.externalEffects === "NONE"
  ) {
    details.push(
      "Online contiguous seq=101 → INCREMENTAL_APPLY; lastAppliedSeq=101; stateDigest advanced",
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
    gap.externalEffects === "NONE"
  ) {
    details.push(
      "After offline, seq=108 gap → SSE_GAP_FULL_RESYNC_REQUIRED; minResyncThroughSeq=108; incremental refused; stateDigest unchanged",
    );
  } else {
    passed = false;
    details.push(`Gap unexpectedly ${JSON.stringify(gap)}`);
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
    insufficient.cursor.stateDigest === priorDigest
  ) {
    details.push(
      "coversThroughSeq=107 < minResyncThroughSeq=108 → SNAPSHOT_INSUFFICIENT_COVERAGE; prior state retained",
    );
  } else {
    passed = false;
    details.push(`Insufficient unexpectedly ${JSON.stringify(insufficient)}`);
  }

  // 4. Covering snapshot replaces UI state; no invented mid events.
  const snapshotDigest = `digest-snap-9001-${randomUUID().slice(0, 8)}`;
  const resync = applySseFullStateResync({
    cursor: gap.cursor,
    snapshot: {
      revision: 9001,
      coversThroughSeq: 108,
      entityCount: 12,
      stateDigest: snapshotDigest,
    },
  });
  if (
    resync.code === "FULL_STATE_RESYNC" &&
    resync.fullStateResyncRequired === false &&
    resync.cursor.lastAppliedSeq === 108 &&
    resync.cursor.lastSnapshotRevision === 9001 &&
    resync.cursor.minResyncThroughSeq === null &&
    resync.cursor.stateDigest === snapshotDigest &&
    resync.cursor.stateDigest !== priorDigest &&
    resync.externalEffects === "NONE"
  ) {
    details.push(
      `FULL_STATE_RESYNC revision=9001 coversThroughSeq=108; stateDigest replaced (${priorDigest} → ${snapshotDigest}); missed SSE events not invented`,
    );
  } else {
    passed = false;
    details.push(`Resync unexpectedly ${JSON.stringify(resync)}`);
  }

  // 5. After resync, contiguous resume works.
  const resume = evaluateSseEventAfterOffline({
    cursor: resync.cursor,
    event: { seq: 109, payloadId: `p-resume-${randomUUID().slice(0, 8)}` },
    reconnecting: false,
  });
  if (
    resume.code === "INCREMENTAL_APPLY" &&
    resume.cursor.lastAppliedSeq === 109
  ) {
    details.push(
      "Post-resync contiguous seq=109 → INCREMENTAL_APPLY (stream resumes)",
    );
  } else {
    passed = false;
    details.push(`Resume unexpectedly ${JSON.stringify(resume)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
