import { describe, expect, it } from "vitest";
import { proofAdsTestProjectProductionBlocked } from "./ads-test-project-production-proof.js";

describe("proofAdsTestProjectProductionBlocked", () => {
  it("passes with honesty stamps and soft-skip distinct ACCESS_BLOCKED", () => {
    const proof = proofAdsTestProjectProductionBlocked(
      "2026-11-21T19:00:00.000Z",
    );
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(proof.details.some((d) => d.includes("honesty NOT_WIRED/NONE"))).toBe(
      true,
    );
    expect(
      proof.details.some((d) =>
        d.includes("blank projectId") || d.includes("Repeated SANDBOX→LIVE"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("ADS_ACCESS_BLOCKED (not T-X034 mismatch"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("soft-skip T-F07/T-US-013/T-US-014"),
      ),
    ).toBe(true);
  });
});
