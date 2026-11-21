/**
 * Memory/file recovery store — classification honesty (no DATABASE_URL).
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  OutagePlane,
  RecoveryObservationClass,
} from "@worksocial/domain";
import {
  createFileRecoveryStore,
  createMemoryRecoveryStore,
} from "./recovery-store.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("recovery store (memory/file)", () => {
  it("memory tracks classification counts and seals live NOT_RUN", async () => {
    const store = createMemoryRecoveryStore();
    expect(store.backend).toBe("memory");
    await store.appendTimeline({
      eventId: "e1",
      recordedAtIso: "2026-11-21T21:00:00.000Z",
      plane: OutagePlane.HOST,
      classification: RecoveryObservationClass.ACTIVE_INCIDENT,
      summary: "fixture",
      sourceKind: "fixture",
      relatedCapabilityIds: ["cms_publish"],
      queuedWorkCount: 0,
      evidenceRefs: [],
    });
    const status = await store.status();
    expect(status.backend).toBe("memory");
    expect(status.classCounts.ACTIVE_INCIDENT).toBe(1);
    expect(status.liveRecoveryClaim).toBe("NOT_RUN");
    expect(status.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(status.externalEffects).toBe("NONE");
  });

  it("file store restarts with timeline classification", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-rec-store-"));
    dirs.push(dir);
    const first = createFileRecoveryStore(dir);
    await first.appendTimeline({
      eventId: "e2",
      recordedAtIso: "2026-11-21T21:00:00.000Z",
      plane: OutagePlane.PROVIDER,
      classification: RecoveryObservationClass.STALE_OBSERVATION,
      summary: "stale",
      sourceKind: "heartbeat",
      relatedCapabilityIds: [],
      queuedWorkCount: 0,
      evidenceRefs: [],
    });

    const second = createFileRecoveryStore(dir);
    expect(second.backend).toBe("file");
    const events = await second.listTimeline();
    expect(events[0]?.classification).toBe("STALE_OBSERVATION");
    expect((await second.status()).liveRecoveryClaim).toBe("NOT_RUN");
  });
});
