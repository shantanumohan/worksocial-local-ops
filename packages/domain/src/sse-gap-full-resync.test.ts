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
    cursor = d1.cursor;

    const d2 = evaluateSseEventAfterOffline({
      cursor,
      event: { seq: 12, payloadId: "e12" },
      reconnecting: false,
    });
    expect(d2.code).toBe("INCREMENTAL_APPLY");
    expect(d2.cursor.lastAppliedSeq).toBe(12);
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
  });
});
