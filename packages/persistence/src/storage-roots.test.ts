import { describe, expect, it } from "vitest";
import {
  assertDurableRootsOffSync,
  createEmptyRegistry,
  listMissingArtifactRoots,
  registerStorageRoot,
  validateStorageRootCandidate,
} from "./storage-roots.js";

describe("storage-roots", () => {
  it("registers selected artifact folders including OneDrive workspace example", () => {
    let registry = createEmptyRegistry("2026-11-18T00:00:00.000Z");
    const workspace =
      "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS";

    for (const kind of ["source", "working", "content", "reports", "encrypted_backup"] as const) {
      const result = registerStorageRoot(registry, kind, `${workspace}/${kind}`, {
        nowIso: "2026-11-18T00:00:00.000Z",
        id: kind,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        registry = result.registry;
        expect(result.root.syncPath).toBe(true);
      }
    }

    expect(listMissingArtifactRoots(registry)).toEqual([]);
    expect(assertDurableRootsOffSync(registry)).toEqual([]);
  });

  it("rejects database root on sync path", () => {
    const result = validateStorageRootCandidate(
      "database",
      "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS/db",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.code === "DURABLE_ON_SYNC_PATH")).toBe(true);
    }
  });

  it("accepts database root off sync path", () => {
    const result = validateStorageRootCandidate(
      "database",
      "C:/Users/ShantanuMohan/AppData/Local/WorkSocial/pgdata",
    );
    expect(result.ok).toBe(true);
  });

  it("rejects duplicate kinds and empty paths", () => {
    const registry = createEmptyRegistry();
    const first = registerStorageRoot(registry, "source", "/repo", { id: "source" });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const dup = registerStorageRoot(first.registry, "source", "/other");
    expect(dup.ok).toBe(false);
    expect(validateStorageRootCandidate("working", "   ").ok).toBe(false);
  });
});
