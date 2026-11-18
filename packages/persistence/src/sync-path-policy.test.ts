import { describe, expect, it } from "vitest";
import {
  evaluateSyncPathPolicy,
  isConsumerSyncPath,
  normalizePathForPolicy,
} from "./sync-path-policy.js";

describe("sync-path-policy", () => {
  it("detects OneDrive-style Windows paths", () => {
    const path =
      "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS";
    expect(isConsumerSyncPath(path)).toBe(true);
    expect(normalizePathForPolicy(path.replace(/\//g, "\\"))).toContain("OneDrive");
  });

  it("allows non-sync durable paths", () => {
    const path = "C:/Users/ShantanuMohan/AppData/Local/WorkSocial/pgdata";
    expect(isConsumerSyncPath(path)).toBe(false);
    const verdict = evaluateSyncPathPolicy("database", path);
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.syncPath).toBe(false);
    }
  });

  it("refuses durable DB/Temporal/secrets under OneDrive", () => {
    const sync =
      "C:\\Users\\ShantanuMohan\\OneDrive - myworksocial.com\\Documents\\AgenticArmyWS\\pgdata";
    for (const kind of ["database", "temporal", "secrets"] as const) {
      const verdict = evaluateSyncPathPolicy(kind, sync);
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) {
        expect(verdict.reason).toBe("DURABLE_ON_SYNC_PATH");
      }
    }
  });

  it("allows artifact roots under OneDrive workspace", () => {
    const sync =
      "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS";
    for (const kind of ["source", "working", "content", "reports", "encrypted_backup"] as const) {
      const verdict = evaluateSyncPathPolicy(kind, sync);
      expect(verdict.ok).toBe(true);
      if (verdict.ok) {
        expect(verdict.syncPath).toBe(true);
      }
    }
  });

  it("honors configurable deny patterns", () => {
    const path = "/home/owner/MyCloudSync/vault";
    expect(isConsumerSyncPath(path)).toBe(false);
    expect(isConsumerSyncPath(path, { denyPatterns: ["MyCloudSync"] })).toBe(true);
    const verdict = evaluateSyncPathPolicy("secrets", path, {
      denyPatterns: ["MyCloudSync"],
    });
    expect(verdict.ok).toBe(false);
  });
});
