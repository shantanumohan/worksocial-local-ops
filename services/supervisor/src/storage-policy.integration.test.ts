import { describe, expect, it } from "vitest";
import {
  assertDurableRootsOffSync,
  createEmptyRegistry,
  registerStorageRoot,
  validateStorageRootCandidate,
} from "@worksocial/persistence";

/**
 * Selected-folder + "DB not on sync path" policy coverage for R1-01 acceptance evidence.
 */
describe("selected-folder validation (integration with persistence policy)", () => {
  it("accepts AgenticArmyWS as workspace/source example but not as database root", () => {
    const workspace =
      "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS";

    expect(validateStorageRootCandidate("source", workspace).ok).toBe(true);
    expect(validateStorageRootCandidate("database", workspace).ok).toBe(false);
    expect(
      validateStorageRootCandidate(
        "database",
        "C:/Users/ShantanuMohan/AppData/Local/WorkSocial/pgdata",
      ).ok,
    ).toBe(true);
  });

  it("builds a valid mixed registry: artifacts on sync, durable off sync", () => {
    let registry = createEmptyRegistry();
    const workspace =
      "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS";

    for (const kind of ["source", "working", "content", "reports", "encrypted_backup"] as const) {
      const result = registerStorageRoot(registry, kind, `${workspace}/${kind}`);
      expect(result.ok).toBe(true);
      if (result.ok) {
        registry = result.registry;
      }
    }

    for (const kind of ["database", "temporal", "secrets"] as const) {
      const result = registerStorageRoot(
        registry,
        kind,
        `C:/Users/ShantanuMohan/AppData/Local/WorkSocial/${kind}`,
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        registry = result.registry;
      }
    }

    expect(assertDurableRootsOffSync(registry)).toEqual([]);
    expect(registry.roots).toHaveLength(8);
  });
});
