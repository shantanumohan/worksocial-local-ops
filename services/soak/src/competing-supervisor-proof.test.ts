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
    expect(
      proof.details.some((d) =>
        d.includes("Cross-hostId competitor refused LEASE_HELD"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Exact-expiry boundary reclaim ok"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Same-gen renew preserves leaseId+acquiredAt"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Wake mid-gap classify=mid_gap_held competitor LEASE_HELD"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Wake past-expiry classify=wake_past_expiry"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Multi-TTL wake catchup single reclaim"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Exact-expiry wake classify gapMs=0 reclaim ok"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Same-gen mid-gap renew ok reclaimed=false"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("Post-expiry same-gen renew refused LEASE_HELD"),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "Same-gen acquire at exact-expiry re-establish ok reclaimed=false",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "Same-gen acquire past-expiry re-establish ok reclaimed=false",
        ),
      ),
    ).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes(
          "Post-reestablish foreign mid-gap competitor LEASE_HELD generic",
        ),
      ),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("honesty NOT_WIRED/NONE"))).toBe(
      true,
    );
  });
});
