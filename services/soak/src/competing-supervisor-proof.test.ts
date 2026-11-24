import { describe, expect, it } from "vitest";
import { proofCompetingSupervisorLease } from "./competing-supervisor-proof.js";

describe("proofCompetingSupervisorLease", () => {
  it("passes with third competitor, live-probe deny, and generic LEASE_HELD", () => {
    const proof = proofCompetingSupervisorLease("2026-11-21T19:05:20.000Z");
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(
      proof.details.some((d) => d.includes("messageGeneric=true")),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Third concurrent supervisor refused LEASE_HELD"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("isHolderAlive=true still refuses reclaim"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Whitespace-padded host/generation same-gen renew ok"),
      ),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("honesty NOT_WIRED/NONE"))).toBe(
      true,
    );
  });
});
