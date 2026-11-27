/**
 * Fixture proof for T-X062 — SSE gap after offline UI → full-state resync.
 * Hillclimb F32–F44: liveProviderWiring=NOT_WIRED; chatgptAdsAccess=ACCESS_BLOCKED;
 * LIVE_SSE_CLAIM_REFUSED for live VERIFIED / live SSE wire; STILL_OFFLINE;
 * regressive snapshot refuse; online gap; pending-gap blocks invent;
 * covering-beyond; invalid seq refuse; NaN/+Infinity coversThroughSeq refuse (F43/F44).
 * External effects: NONE. Never invents live VERIFIED.
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
    contiguous.liveProviderWiring === "NOT_WIRED" &&
    contiguous.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    contiguous.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "Online contiguous seq=101 → INCREMENTAL_APPLY; lastAppliedSeq=101; stateDigest advanced; liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED",
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

  // 2e. F34 — larger gap while minResyncThroughSeq pending raises floor (no invent).
  const pendingGap = evaluateSseEventAfterOffline({
    cursor: createSseUiCursor({
      lastAppliedSeq: 30,
      stateDigest: "digest-seq-30",
    }),
    event: { seq: 40, payloadId: "p-pending-gap" },
    reconnecting: false,
  });
  const raisedGap = evaluateSseEventAfterOffline({
    cursor: pendingGap.cursor,
    event: { seq: 45, payloadId: "p-larger-gap" },
    reconnecting: false,
  });
  if (
    raisedGap.code === "SSE_GAP_FULL_RESYNC_REQUIRED" &&
    raisedGap.cursor.minResyncThroughSeq === 45 &&
    raisedGap.cursor.lastAppliedSeq === 30 &&
    raisedGap.cursor.stateDigest === "digest-seq-30" &&
    raisedGap.liveProviderWiring === "NOT_WIRED" &&
    raisedGap.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "F34 pending minResync=40 then seq=45 → minResyncThroughSeq raised to 45; lastApplied stays 30",
    );
  } else {
    passed = false;
    details.push(`F34 raised-gap unexpectedly ${JSON.stringify(raisedGap)}`);
  }

  // 2f. F35 — snapshot at exact minResyncThroughSeq boundary clears gap (not only beyond).
  const boundaryGap = evaluateSseEventAfterOffline({
    cursor: createSseUiCursor({
      lastAppliedSeq: 7,
      stateDigest: "digest-seq-7",
    }),
    event: { seq: 13, payloadId: "p-gap-13" },
    reconnecting: false,
  });
  const exactBoundary = applySseFullStateResync({
    cursor: boundaryGap.cursor,
    snapshot: {
      revision: 5001,
      coversThroughSeq: 13,
      entityCount: 4,
      stateDigest: "digest-snap-exact-13",
    },
  });
  if (
    exactBoundary.code === "FULL_STATE_RESYNC" &&
    exactBoundary.cursor.lastAppliedSeq === 13 &&
    exactBoundary.cursor.minResyncThroughSeq === null &&
    exactBoundary.cursor.stateDigest === "digest-snap-exact-13" &&
    exactBoundary.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "F35 coversThroughSeq=13 equals minResyncThroughSeq=13 → FULL_STATE_RESYNC; gap cleared",
    );
  } else {
    passed = false;
    details.push(`F35 exact-boundary unexpectedly ${JSON.stringify(exactBoundary)}`);
  }

  // 2g. F36 — incremental stream resumes immediately after exact-boundary resync.
  const afterBoundary = evaluateSseEventAfterOffline({
    cursor: exactBoundary.cursor,
    event: { seq: 14, payloadId: "p-after-f35" },
    reconnecting: false,
  });
  if (
    afterBoundary.code === "INCREMENTAL_APPLY" &&
    afterBoundary.cursor.lastAppliedSeq === 14 &&
    afterBoundary.cursor.minResyncThroughSeq === null &&
    afterBoundary.liveProviderWiring === "NOT_WIRED" &&
    afterBoundary.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "F36 post-boundary seq=14 → INCREMENTAL_APPLY; gap stays cleared; liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`F36 post-boundary resume unexpectedly ${JSON.stringify(afterBoundary)}`);
  }

  // 2h. F37 — negative seq → INVALID_SEQ without advancing cursor.
  const f37Cursor = createSseUiCursor({
    lastAppliedSeq: 5,
    stateDigest: "digest-seq-5",
  });
  const negSeq = evaluateSseEventAfterOffline({
    cursor: f37Cursor,
    event: { seq: -3, payloadId: "p-neg" },
    reconnecting: false,
  });
  if (
    negSeq.code === "INVALID_SEQ" &&
    negSeq.allowedIncremental === false &&
    negSeq.cursor.lastAppliedSeq === 5 &&
    negSeq.cursor.stateDigest === "digest-seq-5" &&
    negSeq.liveProviderWiring === "NOT_WIRED" &&
    negSeq.externalEffects === "NONE"
  ) {
    details.push("F37 seq=-3 → INVALID_SEQ; lastAppliedSeq=5 unchanged");
  } else {
    passed = false;
    details.push(`F37 negative seq unexpectedly ${JSON.stringify(negSeq)}`);
  }

  // 2i. F38 — seq=0 INVALID_SEQ with outstanding gap; minResync floor unchanged.
  let f38Cursor = createSseUiCursor({
    lastAppliedSeq: 8,
    stateDigest: "digest-seq-8",
  });
  f38Cursor = markSseUiOffline(f38Cursor);
  const f38Gap = evaluateSseEventAfterOffline({
    cursor: f38Cursor,
    event: { seq: 12, payloadId: "p-gap-12" },
    reconnecting: true,
  });
  const zeroSeq = evaluateSseEventAfterOffline({
    cursor: f38Gap.cursor,
    event: { seq: 0, payloadId: "p-zero" },
    reconnecting: false,
  });
  if (
    zeroSeq.code === "INVALID_SEQ" &&
    zeroSeq.allowedIncremental === false &&
    zeroSeq.fullStateResyncRequired === true &&
    zeroSeq.cursor.lastAppliedSeq === 8 &&
    zeroSeq.cursor.minResyncThroughSeq === 12 &&
    zeroSeq.liveProviderWiring === "NOT_WIRED" &&
    zeroSeq.externalEffects === "NONE"
  ) {
    details.push(
      "F38 seq=0 with minResync=12 → INVALID_SEQ; floor unchanged; fullStateResyncRequired",
    );
  } else {
    passed = false;
    details.push(`F38 zero seq unexpectedly ${JSON.stringify(zeroSeq)}`);
  }

  // 2j. F39 — non-integer seq → INVALID_SEQ; gap floor unchanged.
  const fracSeq = evaluateSseEventAfterOffline({
    cursor: f38Gap.cursor,
    event: { seq: 1.5, payloadId: "p-frac" },
    reconnecting: false,
  });
  if (
    fracSeq.code === "INVALID_SEQ" &&
    fracSeq.allowedIncremental === false &&
    fracSeq.fullStateResyncRequired === true &&
    fracSeq.cursor.lastAppliedSeq === 8 &&
    fracSeq.cursor.minResyncThroughSeq === 12 &&
    fracSeq.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push("F39 seq=1.5 → INVALID_SEQ; minResyncThroughSeq=12 unchanged");
  } else {
    passed = false;
    details.push(`F39 fractional seq unexpectedly ${JSON.stringify(fracSeq)}`);
  }

  // 2k. F40 — non-finite seq (NaN) → INVALID_SEQ; gap floor unchanged.
  const nanSeq = evaluateSseEventAfterOffline({
    cursor: f38Gap.cursor,
    event: { seq: Number.NaN, payloadId: "p-nan" },
    reconnecting: false,
  });
  if (
    nanSeq.code === "INVALID_SEQ" &&
    nanSeq.allowedIncremental === false &&
    nanSeq.fullStateResyncRequired === true &&
    nanSeq.cursor.lastAppliedSeq === 8 &&
    nanSeq.cursor.minResyncThroughSeq === 12 &&
    nanSeq.liveProviderWiring === "NOT_WIRED" &&
    nanSeq.externalEffects === "NONE"
  ) {
    details.push(
      "F40 seq=NaN with minResync=12 → INVALID_SEQ; floor unchanged; fullStateResyncRequired",
    );
  } else {
    passed = false;
    details.push(`F40 NaN seq unexpectedly ${JSON.stringify(nanSeq)}`);
  }

  // 2l. F41 — +Infinity seq → INVALID_SEQ; gap floor unchanged.
  const infSeq = evaluateSseEventAfterOffline({
    cursor: f38Gap.cursor,
    event: { seq: Number.POSITIVE_INFINITY, payloadId: "p-inf" },
    reconnecting: false,
  });
  if (
    infSeq.code === "INVALID_SEQ" &&
    infSeq.allowedIncremental === false &&
    infSeq.fullStateResyncRequired === true &&
    infSeq.cursor.lastAppliedSeq === 8 &&
    infSeq.cursor.minResyncThroughSeq === 12 &&
    infSeq.liveProviderWiring === "NOT_WIRED" &&
    infSeq.externalEffects === "NONE"
  ) {
    details.push(
      "F41 seq=+Infinity with minResync=12 → INVALID_SEQ; floor unchanged; fullStateResyncRequired",
    );
  } else {
    passed = false;
    details.push(`F41 infinity seq unexpectedly ${JSON.stringify(infSeq)}`);
  }

  // 2m. F42 — -Infinity seq → INVALID_SEQ; gap floor unchanged.
  const negInfSeq = evaluateSseEventAfterOffline({
    cursor: f38Gap.cursor,
    event: { seq: Number.NEGATIVE_INFINITY, payloadId: "p-neg-inf" },
    reconnecting: false,
  });
  if (
    negInfSeq.code === "INVALID_SEQ" &&
    negInfSeq.allowedIncremental === false &&
    negInfSeq.fullStateResyncRequired === true &&
    negInfSeq.cursor.lastAppliedSeq === 8 &&
    negInfSeq.cursor.minResyncThroughSeq === 12 &&
    negInfSeq.liveProviderWiring === "NOT_WIRED" &&
    negInfSeq.externalEffects === "NONE"
  ) {
    details.push(
      "F42 seq=-Infinity with minResync=12 → INVALID_SEQ; floor unchanged; fullStateResyncRequired",
    );
  } else {
    passed = false;
    details.push(`F42 neg-infinity seq unexpectedly ${JSON.stringify(negInfSeq)}`);
  }

  // 2n. F43 — NaN coversThroughSeq → SNAPSHOT_INSUFFICIENT_COVERAGE; gap floor unchanged.
  const nanCover = applySseFullStateResync({
    cursor: f38Gap.cursor,
    snapshot: {
      revision: 7,
      coversThroughSeq: Number.NaN,
      entityCount: 3,
      stateDigest: "digest-snap-nan-cover",
    },
  });
  if (
    nanCover.code === "SNAPSHOT_INSUFFICIENT_COVERAGE" &&
    nanCover.allowedIncremental === false &&
    nanCover.fullStateResyncRequired === true &&
    nanCover.cursor.lastAppliedSeq === 8 &&
    nanCover.cursor.minResyncThroughSeq === 12 &&
    nanCover.cursor.stateDigest === "digest-seq-8" &&
    nanCover.liveProviderWiring === "NOT_WIRED" &&
    nanCover.externalEffects === "NONE" &&
    nanCover.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    nanCover.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "F43 coversThroughSeq=NaN with minResync=12 → SNAPSHOT_INSUFFICIENT_COVERAGE; floor unchanged; stateDigest retained",
    );
  } else {
    passed = false;
    details.push(`F43 NaN coversThroughSeq unexpectedly ${JSON.stringify(nanCover)}`);
  }

  // 2o. F44 — +Infinity coversThroughSeq → SNAPSHOT_INSUFFICIENT_COVERAGE; gap floor unchanged.
  const infCover = applySseFullStateResync({
    cursor: f38Gap.cursor,
    snapshot: {
      revision: 8,
      coversThroughSeq: Number.POSITIVE_INFINITY,
      entityCount: 3,
      stateDigest: "digest-snap-inf-cover",
    },
  });
  if (
    infCover.code === "SNAPSHOT_INSUFFICIENT_COVERAGE" &&
    infCover.allowedIncremental === false &&
    infCover.fullStateResyncRequired === true &&
    infCover.cursor.lastAppliedSeq === 8 &&
    infCover.cursor.minResyncThroughSeq === 12 &&
    infCover.cursor.stateDigest === "digest-seq-8" &&
    infCover.liveProviderWiring === "NOT_WIRED" &&
    infCover.externalEffects === "NONE" &&
    infCover.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    infCover.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "F44 coversThroughSeq=+Infinity with minResync=12 → SNAPSHOT_INSUFFICIENT_COVERAGE; floor unchanged; stateDigest retained",
    );
  } else {
    passed = false;
    details.push(`F44 +Infinity coversThroughSeq unexpectedly ${JSON.stringify(infCover)}`);
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
    resume.liveProviderWiring === "NOT_WIRED" &&
    resume.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "Post-resync contiguous seq=111 → INCREMENTAL_APPLY (stream resumes)",
    );
  } else {
    passed = false;
    details.push(`Resume unexpectedly ${JSON.stringify(resume)}`);
  }

  // 6. STILL_OFFLINE — events not applied until reconnect.
  const offlineCursor = markSseUiOffline(
    createSseUiCursor({ lastAppliedSeq: 5, stateDigest: "digest-seq-5" }),
  );
  const stillOffline = evaluateSseEventAfterOffline({
    cursor: offlineCursor,
    event: { seq: 6, payloadId: "p-offline" },
    reconnecting: false,
  });
  if (
    stillOffline.code === "STILL_OFFLINE" &&
    stillOffline.allowedIncremental === false &&
    stillOffline.cursor.lastAppliedSeq === 5 &&
    stillOffline.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Still offline seq=6 → STILL_OFFLINE; lastApplied stays 5; liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Still-offline unexpectedly ${JSON.stringify(stillOffline)}`);
  }

  // 7. Regressive snapshot below lastApplied refused.
  const regressive = applySseFullStateResync({
    cursor: createSseUiCursor({
      lastAppliedSeq: 50,
      stateDigest: "digest-seq-50",
    }),
    snapshot: {
      revision: 1,
      coversThroughSeq: 40,
      entityCount: 2,
      stateDigest: "digest-old-40",
    },
  });
  if (
    regressive.code === "IGNORE_STALE" &&
    regressive.cursor.lastAppliedSeq === 50 &&
    regressive.cursor.stateDigest === "digest-seq-50" &&
    regressive.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "Regressive coversThroughSeq=40 < lastApplied=50 → IGNORE_STALE; prior state retained",
    );
  } else {
    passed = false;
    details.push(`Regressive unexpectedly ${JSON.stringify(regressive)}`);
  }

  // 8. IGNORE_STALE while gap pending — duplicate/stale must not clear minResyncThroughSeq (F33).
  let gapStale = createSseUiCursor({
    lastAppliedSeq: 20,
    stateDigest: "digest-seq-20",
  });
  gapStale = markSseUiOffline(gapStale);
  const gapEvt = evaluateSseEventAfterOffline({
    cursor: gapStale,
    event: { seq: 25, payloadId: "p-gap-25" },
    reconnecting: true,
  });
  const staleDup = evaluateSseEventAfterOffline({
    cursor: gapEvt.cursor,
    event: { seq: 18, payloadId: "p-stale-dup" },
    reconnecting: false,
  });
  if (
    staleDup.code === "IGNORE_STALE" &&
    staleDup.cursor.lastAppliedSeq === 20 &&
    staleDup.cursor.minResyncThroughSeq === 25 &&
    staleDup.fullStateResyncRequired === true &&
    staleDup.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "F33 stale seq=18 with outstanding gap → IGNORE_STALE; minResyncThroughSeq=25 unchanged",
    );
  } else {
    passed = false;
    details.push(`F33 stale-gap unexpectedly ${JSON.stringify(staleDup)}`);
  }

  // 9. Live VERIFIED / live SSE wire refused.
  const liveVerified = evaluateSseEventAfterOffline({
    cursor: createSseUiCursor({ lastAppliedSeq: 1, stateDigest: "d1" }),
    event: { seq: 2, payloadId: "p2" },
    reconnecting: false,
    claimLiveVerified: true,
  });
  if (
    liveVerified.code === "LIVE_SSE_CLAIM_REFUSED" &&
    liveVerified.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimLiveVerified → LIVE_SSE_CLAIM_REFUSED (fixture ACCEPTED ≠ VERIFIED)",
    );
  } else {
    passed = false;
    details.push(`claimLiveVerified unexpectedly ${JSON.stringify(liveVerified)}`);
  }

  const liveWire = applySseFullStateResync({
    cursor: createSseUiCursor({ lastAppliedSeq: 1, stateDigest: "d1" }),
    snapshot: {
      revision: 1,
      coversThroughSeq: 1,
      entityCount: 1,
      stateDigest: "digest-wire",
    },
    requestLiveSseWire: true,
  });
  if (
    liveWire.code === "LIVE_SSE_CLAIM_REFUSED" &&
    liveWire.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    liveWire.cursor.stateDigest === "d1"
  ) {
    details.push(
      "requestLiveSseWire → LIVE_SSE_CLAIM_REFUSED (SSE transport stays NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(`requestLiveSseWire unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE ACCEPTED≠VERIFIED",
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
