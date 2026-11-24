import { describe, expect, it } from "vitest";
import {
  HOST_LEASE_HELD_MESSAGE,
  acquireHostLease,
  isLeaseExpired,
  normalizeHostLeaseToken,
  releaseHostLease,
  renewHostLease,
  type HostLeaseClock,
  type HostLeaseRecord,
} from "./host-lease.js";

function clockAt(ms: number): HostLeaseClock {
  return { nowMs: () => ms };
}

describe("host-lease", () => {
  it("acquires a singleton lease with generation", () => {
    const result = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 100, generationId: "gen-1" },
      clockAt(1_000),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.lease.scope).toBe("local-singleton");
      expect(result.lease.generationId).toBe("gen-1");
      expect(result.reclaimed).toBe(false);
    }
  });

  it("denies a second live generation", () => {
    const first = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 100, generationId: "gen-1" },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = acquireHostLease(
      first.lease,
      { hostId: "host-a", holderPid: 200, generationId: "gen-2" },
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
      { hostId: "host-a", holderPid: 100, generationId: "gen-1", ttlMs: 1_000 },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(isLeaseExpired(first.lease, 3_000)).toBe(true);
    const reclaimed = acquireHostLease(
      first.lease,
      { hostId: "host-a", holderPid: 101, generationId: "gen-2", ttlMs: 5_000 },
      clockAt(3_000),
    );
    expect(reclaimed.ok).toBe(true);
    if (reclaimed.ok) {
      expect(reclaimed.reclaimed).toBe(true);
      expect(reclaimed.lease.generationId).toBe("gen-2");
    }
  });

  it("renews by generation with a different holder pid (detached slot)", () => {
    const acquired = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 42, generationId: "gen-1", ttlMs: 10_000 },
      clockAt(1_000),
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) {
      return;
    }
    const renewed = renewHostLease(
      acquired.lease,
      { hostId: "host-a", holderPid: 99, generationId: "gen-1", ttlMs: 10_000 },
      clockAt(2_000),
    );
    expect(renewed.ok).toBe(true);
    if (renewed.ok) {
      expect(renewed.lease.holderPid).toBe(99);
    }

    const lease: HostLeaseRecord = renewed.ok ? renewed.lease : acquired.lease;
    const released = releaseHostLease(
      lease,
      { hostId: "host-a", holderPid: 1, generationId: "gen-1" },
      clockAt(2_500),
    );
    expect(released.released).toBe(true);
  });

  it("force-releases when needed", () => {
    const acquired = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 42, generationId: "gen-1", ttlMs: 10_000 },
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

  it("reclaims a non-expired lease when the holder PID is dead", () => {
    const first = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 100, generationId: "gen-1", ttlMs: 60_000 },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const denied = acquireHostLease(
      first.lease,
      { hostId: "host-a", holderPid: 200, generationId: "gen-2", ttlMs: 60_000 },
      clockAt(2_000),
    );
    expect(denied.ok).toBe(false);

    const reclaimed = acquireHostLease(
      first.lease,
      {
        hostId: "host-a",
        holderPid: 200,
        generationId: "gen-2",
        ttlMs: 60_000,
        isHolderAlive: (pid) => pid !== 100,
      },
      clockAt(2_000),
    );
    expect(reclaimed.ok).toBe(true);
    if (reclaimed.ok) {
      expect(reclaimed.reclaimed).toBe(true);
      expect(reclaimed.lease.generationId).toBe("gen-2");
      expect(reclaimed.lease.holderPid).toBe(200);
    }
  });

  it("keeps LEASE_HELD message generic without host/generation/pid leak (T-X002)", () => {
    const first = acquireHostLease(
      null,
      { hostId: "host-secret", holderPid: 777, generationId: "gen-secret", ttlMs: 60_000 },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = acquireHostLease(
      first.lease,
      { hostId: "host-secret", holderPid: 888, generationId: "gen-other", ttlMs: 60_000 },
      clockAt(2_000),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("LEASE_HELD");
      expect(second.message).toBe(HOST_LEASE_HELD_MESSAGE);
      expect(second.message.includes("host-secret")).toBe(false);
      expect(second.message.includes("gen-secret")).toBe(false);
      expect(second.message.includes("777")).toBe(false);
      expect(second.holder?.generationId).toBe("gen-secret");
    }
  });

  it("renews with whitespace-padded host/generation tokens (T-X002)", () => {
    const acquired = acquireHostLease(
      null,
      { hostId: "  host-a  ", holderPid: 42, generationId: " gen-1 ", ttlMs: 10_000 },
      clockAt(1_000),
    );
    expect(acquired.ok).toBe(true);
    if (!acquired.ok) return;
    expect(acquired.lease.hostId).toBe("host-a");
    expect(acquired.lease.generationId).toBe("gen-1");
    const renewed = renewHostLease(
      acquired.lease,
      { hostId: "\thost-a\n", holderPid: 99, generationId: "  gen-1  ", ttlMs: 10_000 },
      clockAt(2_000),
    );
    expect(renewed.ok).toBe(true);
  });

  it("rejects whitespace-only tokens and refuses when isHolderAlive is true (T-X002)", () => {
    expect(normalizeHostLeaseToken("   ")).toBeNull();
    const blank = acquireHostLease(
      null,
      { hostId: "   ", holderPid: 1, generationId: "gen-1" },
      clockAt(1_000),
    );
    expect(blank.ok).toBe(false);
    if (!blank.ok) expect(blank.reason).toBe("INVALID_INPUT");

    const first = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 100, generationId: "gen-1", ttlMs: 60_000 },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const liveProbe = acquireHostLease(
      first.lease,
      {
        hostId: "host-a",
        holderPid: 200,
        generationId: "gen-2",
        ttlMs: 60_000,
        isHolderAlive: () => true,
      },
      clockAt(2_000),
    );
    expect(liveProbe.ok).toBe(false);
    if (!liveProbe.ok) {
      expect(liveProbe.reason).toBe("LEASE_HELD");
      expect(liveProbe.message).toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });
});
