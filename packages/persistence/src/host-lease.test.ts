import { describe, expect, it } from "vitest";
import {
  acquireHostLease,
  isLeaseExpired,
  releaseHostLease,
  renewHostLease,
  type HostLeaseClock,
  type HostLeaseRecord,
} from "./host-lease.js";

function clockAt(ms: number): HostLeaseClock {
  return { nowMs: () => ms };
}

describe("host-lease", () => {
  it("acquires a singleton lease", () => {
    const result = acquireHostLease(null, { hostId: "host-a", holderPid: 100 }, clockAt(1_000));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lease.scope).toBe("local-singleton");
      expect(result.reclaimed).toBe(false);
    }
  });

  it("denies a second live holder", () => {
    const first = acquireHostLease(null, { hostId: "host-a", holderPid: 100 }, clockAt(1_000));
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = acquireHostLease(
      first.lease,
      { hostId: "host-b", holderPid: 200 },
      clockAt(2_000),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("LEASE_HELD");
    }
  });

  it("reclaims an expired lease (restart)", () => {
    const first = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 100, ttlMs: 1_000 },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(isLeaseExpired(first.lease, 3_000)).toBe(true);
    const reclaimed = acquireHostLease(
      first.lease,
      { hostId: "host-a", holderPid: 101, ttlMs: 5_000 },
      clockAt(3_000),
    );
    expect(reclaimed.ok).toBe(true);
    if (reclaimed.ok) {
      expect(reclaimed.reclaimed).toBe(true);
      expect(reclaimed.lease.holderPid).toBe(101);
    }
  });

  it("renews and releases for the same holder", () => {
    const acquired = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 42, ttlMs: 10_000 },
      clockAt(1_000),
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      return;
    }
    const renewed = renewHostLease(
      acquired.lease,
      { hostId: "host-a", holderPid: 42, ttlMs: 10_000 },
      clockAt(2_000),
    );
    expect(renewed.ok).toBe(true);

    const lease: HostLeaseRecord = renewed.ok ? renewed.lease : acquired.lease;
    const released = releaseHostLease(lease, { hostId: "host-a", holderPid: 42 }, clockAt(2_500));
    expect(released.released).toBe(true);
  });

  it("force-releases when the original CLI holder pid is gone", () => {
    const acquired = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 42, ttlMs: 10_000 },
      clockAt(1_000),
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      return;
    }
    const released = releaseHostLease(
      acquired.lease,
      {
        hostId: "host-a",
        holderPid: 99,
        force: true,
        isHolderAlive: () => false,
      },
      clockAt(2_000),
    );
    expect(released.released).toBe(true);
  });
});
