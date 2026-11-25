import { describe, expect, it } from "vitest";
import { proofIncomparableTrendIndicesRejected } from "./incomparable-trend-indices-proof.js";

describe("proofIncomparableTrendIndicesRejected", () => {
  it("passes with normalized comparable and reject controls", () => {
    const proof = proofIncomparableTrendIndicesRejected(
      "2026-11-21T19:00:00.000Z",
    );
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(proof.details.some((d) => d.includes("honesty NOT_WIRED/NONE"))).toBe(
      true,
    );
    expect(
      proof.details.some((d) =>
        d.includes("case/whitespace-normalized unit+source"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) => d.includes("whitespace-only comparability group")),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("zero baseline"))).toBe(true);
    expect(proof.details.some((d) => d.includes("non-trend kind"))).toBe(true);
  });
});
