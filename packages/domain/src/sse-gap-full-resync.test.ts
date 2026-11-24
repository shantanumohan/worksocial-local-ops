import { describe, expect, it } from "vitest";
import {
  applySseFullStateResync,
  createSseUiCursor,
  evaluateSseEventAfterOffline,
  markSseUiOffline,
} from "./sse-gap-full-resync.js";

describe("SSE gap after offline UI (T-X062)", () => {
  it("applies contiguous events incrementally while online", () => {
    let cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    const d1 = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 11, payloadId: "e11" },
      reconnecting: false,
    });
    expect(d1.code).toBe("INCREMENTAL_APPLY");
    expect(d1.allowedIncremental).toBe(true);
    expect(d1.fullStateResyncRequired).toBe(false);
    expect(d1.cursor.lastAppliedSeq).toBe(11);
    expect(d1.externalEffects).toBe("NONE");
    expect(d1.liveProviderWiring).toBe("NOT_WIRED");
    cursor = d1.cursor;

    const d2 = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 12, payloadId: "e12" },
      reconnecting: false,
    });
    expect(d2.code).toBe("INCREMENTAL_APPLY");
    expect(d2.cursor.lastAppliedSeq).toBe(12);
    expect(d2.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses incremental catch-up on SSE gap and records minResyncThroughSeq", () => {
    let cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    cursor = markSseUiOffline(cursor);
    expect(cursor.offline).toBe(true);

    const gap = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 15, payloadId: "e15" },
      reconnecting: true,
    });
    expect(gap.code).toBe("SSE_GAP_FULL_RESYNC_REQUIRED");
    expect(gap.allowedIncremental).toBe(false);
    expect(gap.fullStateResyncRequired).toBe(true);
    expect(gap.cursor.lastAppliedSeq).toBe(10);
    expect(gap.cursor.minResyncThroughSeq).toBe(15);
    expect(gap.cursor.offline).toBe(false);
    expect(gap.externalEffects).toBe("NONE");
    expect(gap.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("rejects snapshot that does not cover the detected gap", () => {
    let cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    cursor = markSseUiOffline(cursor);
    const gap = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 15, payloadId: "e15" },
      reconnecting: true,
    });
    expect(gap.cursor.minResyncThroughSeq).toBe(15);

    const insufficient = applySseFullStateResync({
      cursor: gap.cursor,
      snapshot: {
        revision: 41,
        coversThroughSeq: 14,
        entityCount: 6,
        stateDigest: "digest-snap-partial",
      },
    });
    expect(insufficient.code).toBe("SNAPSHOT_INSUFFICIENT_COVERAGE");
    expect(insufficient.fullStateResyncRequired).toBe(true);
    expect(insufficient.cursor.minResyncThroughSeq).toBe(15);
    expect(insufficient.cursor.stateDigest).toBe("digest-seq-10");
    expect(insufficient.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("applies covering snapshot, replaces stateDigest, then resumes incremental", () => {
    let cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    cursor = markSseUiOffline(cursor);

    const gap = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 15, payloadId: "e15" },
      reconnecting: true,
    });
    expect(gap.fullStateResyncRequired).toBe(true);

    const resync = applySseFullStateResync({
      cursor: gap.cursor,
      snapshot: {
        revision: 42,
        coversThroughSeq: 15,
        entityCount: 7,
        stateDigest: "digest-snap-42",
      },
    });
    expect(resync.code).toBe("FULL_STATE_RESYNC");
    expect(resync.fullStateResyncRequired).toBe(false);
    expect(resync.cursor.lastAppliedSeq).toBe(15);
    expect(resync.cursor.lastSnapshotRevision).toBe(42);
    expect(resync.cursor.minResyncThroughSeq).toBeNull();
    expect(resync.cursor.stateDigest).toBe("digest-snap-42");
    expect(resync.cursor.stateDigest).not.toBe("digest-seq-10");
    expect(resync.externalEffects).toBe("NONE");
    expect(resync.liveProviderWiring).toBe("NOT_WIRED");

    const next = evaluateSseEventAfterOffline({
      cursor: resync.cursor,
      event: { seq: 16, payloadId: "e16" },
      reconnecting: false,
    });
    expect(next.code).toBe("INCREMENTAL_APPLY");
    expect(next.cursor.lastAppliedSeq).toBe(16);
  });

  it("ignores stale/duplicate seq and refuses still-offline apply", () => {
    const cursor = markSseUiOffline(
      createSseUiCursor({ lastAppliedSeq: 10, stateDigest: "digest-seq-10" }),
    );
    const still = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 11, payloadId: "e11" },
      reconnecting: false,
    });
    expect(still.code).toBe("STILL_OFFLINE");
    expect(still.liveProviderWiring).toBe("NOT_WIRED");

    const online = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    const stale = evaluateSseEventAfterOffline({
      cursor: online,
      event: { seq: 9, payloadId: "e9" },
      reconnecting: false,
    });
    expect(stale.code).toBe("IGNORE_STALE");
    expect(stale.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("requires full-state resync for online gap without prior offline mark", () => {
    const cursor = createSseUiCursor({
      lastAppliedSeq: 20,
      stateDigest: "digest-seq-20",
    });
    const gap = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 25, payloadId: "e25" },
      reconnecting: false,
    });
    expect(gap.code).toBe("SSE_GAP_FULL_RESYNC_REQUIRED");
    expect(gap.allowedIncremental).toBe(false);
    expect(gap.cursor.lastAppliedSeq).toBe(20);
    expect(gap.cursor.minResyncThroughSeq).toBe(25);
    expect(gap.cursor.stateDigest).toBe("digest-seq-20");
    expect(gap.externalEffects).toBe("NONE");
    expect(gap.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("blocks contiguous apply while outstanding gap pending (no invent)", () => {
    let cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    cursor = markSseUiOffline(cursor);
    const gap = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 15, payloadId: "e15" },
      reconnecting: true,
    });
    expect(gap.cursor.minResyncThroughSeq).toBe(15);

    const blocked = evaluateSseEventAfterOffline({
      cursor: gap.cursor,
      event: { seq: 11, payloadId: "e11-invent" },
      reconnecting: false,
    });
    expect(blocked.code).toBe("SSE_GAP_FULL_RESYNC_REQUIRED");
    expect(blocked.allowedIncremental).toBe(false);
    expect(blocked.cursor.lastAppliedSeq).toBe(10);
    expect(blocked.cursor.minResyncThroughSeq).toBe(15);
    expect(blocked.cursor.stateDigest).toBe("digest-seq-10");
    expect(blocked.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("raises minResyncThroughSeq when a larger gap arrives while pending", () => {
    let cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    cursor = markSseUiOffline(cursor);
    const first = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 15, payloadId: "e15" },
      reconnecting: true,
    });
    expect(first.cursor.minResyncThroughSeq).toBe(15);

    const raised = evaluateSseEventAfterOffline({
      cursor: first.cursor,
      event: { seq: 22, payloadId: "e22" },
      reconnecting: false,
    });
    expect(raised.code).toBe("SSE_GAP_FULL_RESYNC_REQUIRED");
    expect(raised.cursor.minResyncThroughSeq).toBe(22);
    expect(raised.cursor.lastAppliedSeq).toBe(10);
  });

  it("accepts snapshot covering beyond minResyncThroughSeq", () => {
    let cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    cursor = markSseUiOffline(cursor);
    const gap = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 15, payloadId: "e15" },
      reconnecting: true,
    });

    const beyond = applySseFullStateResync({
      cursor: gap.cursor,
      snapshot: {
        revision: 99,
        coversThroughSeq: 20,
        entityCount: 9,
        stateDigest: "  digest-snap-beyond-20  ",
      },
    });
    expect(beyond.code).toBe("FULL_STATE_RESYNC");
    expect(beyond.cursor.lastAppliedSeq).toBe(20);
    expect(beyond.cursor.minResyncThroughSeq).toBeNull();
    expect(beyond.cursor.stateDigest).toBe("digest-snap-beyond-20");
    expect(beyond.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses invalid seq and blank/whitespace snapshot digests", () => {
    const cursor = createSseUiCursor({
      lastAppliedSeq: 10,
      stateDigest: "digest-seq-10",
    });
    for (const seq of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const bad = evaluateSseEventAfterOffline({
        cursor,
        event: { seq, payloadId: "bad" },
        reconnecting: false,
      });
      expect(bad.code).toBe("INVALID_SEQ");
      expect(bad.allowedIncremental).toBe(false);
      expect(bad.liveProviderWiring).toBe("NOT_WIRED");
      expect(bad.externalEffects).toBe("NONE");
    }

    const blank = applySseFullStateResync({
      cursor,
      snapshot: {
        revision: 1,
        coversThroughSeq: 10,
        entityCount: 1,
        stateDigest: "   ",
      },
    });
    expect(blank.code).toBe("SNAPSHOT_INSUFFICIENT_COVERAGE");
    expect(blank.liveProviderWiring).toBe("NOT_WIRED");
  });
});
