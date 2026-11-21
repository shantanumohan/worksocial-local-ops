/**
 * Security gate suite — process ownership + host lease (already in persistence).
 * Fail-closed kill authorization and singleton lease reclaim. External effects: NONE.
 */
import { describe, expect, it } from "vitest";
import {
  acquireHostLease,
  defaultOwnershipProbe,
  describeOwnershipCapability,
  isProcOwnershipAvailable,
  releaseHostLease,
  renewHostLease,
  verifyProcessOwnership,
  type HostLeaseClock,
} from "@worksocial/persistence";

function clockAt(ms: number): HostLeaseClock {
  return { nowMs: () => ms };
}

describe("security: process ownership gates", () => {
  it("accepts live cmdline/environ that advertise service + generation", () => {
    expect(
      verifyProcessOwnership(
        { pid: 101, serviceId: "api", generationId: "gen-sec" },
        {
          readCommandLine: () =>
            "tsx heartbeat-slot.ts --service api --generation gen-sec",
          readEnviron: () =>
            "WORKSOCIAL_SERVICE_ID=api\0WORKSOCIAL_GENERATION=gen-sec\0",
        },
      ),
    ).toBe(true);
  });

  it("rejects PID reuse when generation markers are absent", () => {
    expect(
      verifyProcessOwnership(
        { pid: 101, serviceId: "api", generationId: "gen-sec" },
        {
          readCommandLine: () => "nginx: worker process",
          readEnviron: () => "USER=www\0",
        },
      ),
    ).toBe(false);
  });

  it("denies kill when no OS ownership probe data is available (fail-closed)", () => {
    expect(
      verifyProcessOwnership(
        { pid: 101, serviceId: "api", generationId: "gen-sec" },
        {},
      ),
    ).toBe(false);
  });

  it("never authorizes kill from heartbeatFallback (capability honesty)", () => {
    const cap = describeOwnershipCapability(true);
    expect(cap.heartbeatFallback).toBe(false);
    expect(cap.procAvailable).toBe(isProcOwnershipAvailable());
    expect(cap.detail.toLowerCase()).toMatch(/heartbeat/);
    // Arbitrary PID must not match this process's identity.
    expect(
      verifyProcessOwnership(
        { pid: 424242, serviceId: "api", generationId: "gen-stale" },
        defaultOwnershipProbe(),
      ),
    ).toBe(false);
  });
});

describe("security: host lease singleton gates", () => {
  it("acquires a local-singleton lease and denies a second live generation", () => {
    const first = acquireHostLease(
      null,
      { hostId: "host-sec", holderPid: 10, generationId: "gen-1" },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.lease.scope).toBe("local-singleton");

    const second = acquireHostLease(
      first.lease,
      { hostId: "host-sec", holderPid: 11, generationId: "gen-2" },
      clockAt(2_000),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("LEASE_HELD");
    }
  });

  it("reclaims when the prior holder PID is dead", () => {
    const first = acquireHostLease(
      null,
      {
        hostId: "host-sec",
        holderPid: 10,
        generationId: "gen-1",
        ttlMs: 60_000,
      },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const reclaimed = acquireHostLease(
      first.lease,
      {
        hostId: "host-sec",
        holderPid: 20,
        generationId: "gen-2",
        ttlMs: 60_000,
        isHolderAlive: (pid) => pid !== 10,
      },
      clockAt(2_000),
    );
    expect(reclaimed.ok).toBe(true);
    if (reclaimed.ok) {
      expect(reclaimed.reclaimed).toBe(true);
      expect(reclaimed.lease.generationId).toBe("gen-2");
    }
  });

  it("renews by generation and releases by generation", () => {
    const acquired = acquireHostLease(
      null,
      {
        hostId: "host-sec",
        holderPid: 42,
        generationId: "gen-1",
        ttlMs: 10_000,
      },
      clockAt(1_000),
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      return;
    }
    const renewed = renewHostLease(
      acquired.lease,
      {
        hostId: "host-sec",
        holderPid: 99,
        generationId: "gen-1",
        ttlMs: 10_000,
      },
      clockAt(2_000),
    );
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) {
      return;
    }
    const released = releaseHostLease(
      renewed.lease,
      { hostId: "host-sec", holderPid: 1, generationId: "gen-1" },
      clockAt(2_500),
    );
    expect(released.released).toBe(true);
  });
});
