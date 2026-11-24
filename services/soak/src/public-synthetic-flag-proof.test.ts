import { describe, expect, it } from "vitest";
import { proofPublicSyntheticFlagRequiresServerGrant } from "./public-synthetic-flag-proof.js";

describe("proofPublicSyntheticFlagRequiresServerGrant", () => {
  it("passes with OR dual-field, alias, and honesty stamps", async () => {
    const proof = await proofPublicSyntheticFlagRequiresServerGrant(
      "2026-11-21T19:05:20.000Z",
    );
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(
      proof.details.some((d) => d.includes("is_synthetic=true without grant")),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("dual-field OR"))).toBe(true);
    expect(proof.details.some((d) => d.includes("honesty NOT_WIRED/NONE"))).toBe(
      true,
    );
    expect(
      proof.details.some((d) =>
        d.includes("Server grant wins over clientClaimedSynthetic=false"),
      ),
    ).toBe(true);
  });
});
