import { describe, expect, it } from "vitest";
import { proofCrossWorkspaceReferenceDenied } from "./cross-workspace-reference-proof.js";

describe("proofCrossWorkspaceReferenceDenied", () => {
  it("passes with whitespace-normalized and dual foreign deny controls", () => {
    const proof = proofCrossWorkspaceReferenceDenied(
      "2026-11-21T22:30:00.000Z",
    );
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Whitespace-padded in-workspace ids allowed"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Whitespace-padded foreign channel denied"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Dual foreign channel+asset substitution denied"),
      ),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("honesty NOT_WIRED/NONE"))).toBe(
      true,
    );
  });
});
