import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateSyncPathPolicy,
  isConsumerSyncPath,
  normalizePathForPolicy,
  resolveCanonicalPath,
} from "./sync-path-policy.js";

describe("sync-path-policy", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("detects OneDrive-style Windows paths", () => {
    const path =
      "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS";
    expect(isConsumerSyncPath(path, { resolveCanonical: false })).toBe(true);
    expect(normalizePathForPolicy(path.replace(/\//g, "\\"))).toContain("OneDrive");
  });

  it("allows non-sync durable paths", () => {
    const path = "C:/Users/ShantanuMohan/AppData/Local/WorkSocial/pgdata";
    expect(isConsumerSyncPath(path, { resolveCanonical: false })).toBe(false);
    const verdict = evaluateSyncPathPolicy("database", path, { resolveCanonical: false });
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.syncPath).toBe(false);
    }
  });

  it("refuses durable DB/Temporal/secrets under OneDrive", () => {
    const sync =
      "C:\\Users\\ShantanuMohan\\OneDrive - myworksocial.com\\Documents\\AgenticArmyWS\\pgdata";
    for (const kind of ["database", "temporal", "secrets"] as const) {
      const verdict = evaluateSyncPathPolicy(kind, sync, { resolveCanonical: false });
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
      const verdict = evaluateSyncPathPolicy(kind, sync, { resolveCanonical: false });
      expect(verdict.ok).toBe(true);
      if (verdict.ok) {
        expect(verdict.syncPath).toBe(true);
      }
    }
  });

  it("honors configurable deny patterns", () => {
    const path = "/home/owner/MyCloudSync/vault";
    expect(isConsumerSyncPath(path, { resolveCanonical: false })).toBe(false);
    expect(
      isConsumerSyncPath(path, { denyPatterns: ["MyCloudSync"], resolveCanonical: false }),
    ).toBe(true);
  });

  it("enforces sync deny on canonical symlink targets", () => {
    const root = mkdtempSync(join(tmpdir(), "ws-sync-"));
    dirs.push(root);
    const syncTarget = join(root, "OneDrive - myworksocial.com", "db");
    mkdirSync(syncTarget, { recursive: true });
    writeFileSync(join(syncTarget, "marker"), "x");
    const alias = join(root, "local-safe-looking");
    symlinkSync(syncTarget, alias);

    expect(resolveCanonicalPath(alias)).toContain("OneDrive");
    const verdict = evaluateSyncPathPolicy("database", alias);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.canonicalPath).toContain("OneDrive");
    }
  });
});
