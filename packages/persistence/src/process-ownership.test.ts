import { describe, expect, it } from "vitest";
import {
  defaultOwnershipProbe,
  describeOwnershipCapability,
  isProcOwnershipAvailable,
  verifyProcessOwnership,
} from "./process-ownership.js";

describe("process-ownership", () => {
  it("accepts a pid whose cmdline/environ advertise service + generation", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {
        readCommandLine: () =>
          "tsx heartbeat-slot.ts --service api --generation gen-abc",
        readEnviron: () => "WORKSOCIAL_SERVICE_ID=api\0WORKSOCIAL_GENERATION=gen-abc\0",
      },
    );
    expect(ok).toBe(true);
  });

  it("rejects PID reuse when generation is missing", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {
        readCommandLine: () => "nginx: worker process",
        readEnviron: () => "USER=www\0",
      },
    );
    expect(ok).toBe(false);
  });

  it("denies kill when no ownership probe data is available (fail-closed)", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {},
    );
    expect(ok).toBe(false);
  });

  it("does not treat a stale heartbeat-shaped claim as ownership without a live OS probe", () => {
    // Simulates the unsafe pattern that was removed: synthesizing markers from a
    // persisted heartbeat file for a reused PID. Empty/unavailable /proc → deny.
    expect(
      verifyProcessOwnership(
        { pid: 4242, serviceId: "api", generationId: "gen-stale" },
        defaultOwnershipProbe(),
      ),
    ).toBe(
      // Only true if this test process somehow matches — it must not for an arbitrary PID.
      false,
    );
  });

  it("reports heartbeatFallback=false and /proc capability honestly", () => {
    const cap = describeOwnershipCapability(true);
    expect(cap.heartbeatFallback).toBe(false);
    expect(cap.procAvailable).toBe(isProcOwnershipAvailable());
    expect(cap.detail.toLowerCase()).toContain("heartbeat");
    if (isProcOwnershipAvailable()) {
      const probe = defaultOwnershipProbe();
      expect(typeof probe.readCommandLine).toBe("function");
    }
  });
});
