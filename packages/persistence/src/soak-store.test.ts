import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  SOAK_FIXTURE_STATUS_HONEST_NOTE,
  SOAK_NOT_WIRED_LIVE_WIRING,
} from "@worksocial/domain";
import { createFileSoakStore } from "./soak-store.js";

describe("createFileSoakStore NOT_WIRED helpers", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-soak-store-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("forces liveWiring NOT_WIRED on read/write/status and uses stable honest note", () => {
    const store = createFileSoakStore(dir);
    const empty = store.read();
    expect(empty.liveWiring).toEqual(SOAK_NOT_WIRED_LIVE_WIRING);
    expect(empty.chatgptAdsWiring).toBe("NOT_WIRED");

    store.write({
      ...empty,
      // Attempted elevation must not persist — store rewrites NOT_WIRED.
      liveWiring: {
        cms: "NOT_WIRED",
        gsc: "NOT_WIRED",
        ga4: "NOT_WIRED",
        zoho: "NOT_WIRED",
        temporal: "NOT_WIRED",
      },
      updatedAtIso: "2026-11-24T21:05:00.000Z",
    });

    const status = store.status();
    expect(status.liveWiring).toEqual(SOAK_NOT_WIRED_LIVE_WIRING);
    expect(status.chatgptAdsWiring).toBe("NOT_WIRED");
    expect(status.r1CompleteClaimed).toBe(false);
    expect(status.honestNote).toBe(SOAK_FIXTURE_STATUS_HONEST_NOTE);
    expect(status.honestNote).toMatch(/never silently VERIFIED/);
  });
});
