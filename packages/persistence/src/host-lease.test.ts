import { describe, expect, it } from "vitest";
import {
  HOST_LEASE_HELD_MESSAGE,
  acquireHostLease,
  classifyWakeCatchupLeaseGap,
  isLeaseExpired,
  renewHostLease,
  normalizeHostLeaseToken,
  releaseHostLease,
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

  it("deepen: rejects non-positive ttl; cross-host LEASE_HELD; exact-expiry reclaim (T-X002)", () => {
    const badTtl = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 1, generationId: "gen-1", ttlMs: 0 },
      clockAt(1_000),
    );
    expect(badTtl.ok).toBe(false);
    if (!badTtl.ok) expect(badTtl.reason).toBe("INVALID_INPUT");

    const first = acquireHostLease(
      null,
      { hostId: "host-a", holderPid: 100, generationId: "gen-1", ttlMs: 5_000 },
      clockAt(1_000),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const crossHost = acquireHostLease(
      first.lease,
      { hostId: "host-other", holderPid: 200, generationId: "gen-2", ttlMs: 5_000 },
      clockAt(2_000),
    );
    expect(crossHost.ok).toBe(false);
    if (!crossHost.ok) {
      expect(crossHost.reason).toBe("LEASE_HELD");
      expect(crossHost.message).toBe(HOST_LEASE_HELD_MESSAGE);
    }

    const expiryMs = Date.parse(first.lease.expiresAt);
    const boundary = acquireHostLease(
      first.lease,
      { hostId: "host-a", holderPid: 300, generationId: "gen-3", ttlMs: 5_000 },
      clockAt(expiryMs),
    );
    expect(boundary.ok).toBe(true);
    if (boundary.ok) {
      expect(boundary.reclaimed).toBe(true);
      expect(boundary.lease.generationId).toBe("gen-3");
    }
  });

  it("deepen: wake/catchup mid-gap held; past-expiry single reclaim (T-X002)", () => {
    const seed = acquireHostLease(
      null,
      { hostId: "host-wake", holderPid: 1, generationId: "gen-a", ttlMs: 5_000 },
      clockAt(10_000),
    );
    expect(seed.ok).toBe(true);
    if (!seed.ok) return;

    const mid = classifyWakeCatchupLeaseGap(seed.lease, 12_000);
    expect(mid).toEqual({ kind: "mid_gap_held", expired: false });
    const midDenied = acquireHostLease(
      seed.lease,
      { hostId: "host-wake", holderPid: 2, generationId: "gen-b", ttlMs: 5_000 },
      clockAt(12_000),
    );
    expect(midDenied.ok).toBe(false);
    if (!midDenied.ok) expect(midDenied.reason).toBe("LEASE_HELD");

    const past = classifyWakeCatchupLeaseGap(seed.lease, 20_000);
    expect(past.kind).toBe("wake_past_expiry");
    if (past.kind === "wake_past_expiry") {
      expect(past.expired).toBe(true);
      expect(past.gapMs).toBe(5_000);
    }
    const reclaim = acquireHostLease(
      seed.lease,
      { hostId: "host-wake", holderPid: 3, generationId: "gen-c", ttlMs: 5_000 },
      clockAt(20_000),
    );
    expect(reclaim.ok).toBe(true);
    if (reclaim.ok) {
      expect(reclaim.reclaimed).toBe(true);
      expect(reclaim.lease.leaseId).not.toBe(seed.lease.leaseId);
    }

    // Multi-TTL sleep still yields one reclaim, not invented missed gens.
    const multi = acquireHostLease(
      null,
      { hostId: "host-multi", holderPid: 10, generationId: "gen-m1", ttlMs: 1_000 },
      clockAt(30_000),
    );
    expect(multi.ok).toBe(true);
    if (!multi.ok) return;
    const far = classifyWakeCatchupLeaseGap(multi.lease, 40_000);
    expect(far.kind).toBe("wake_past_expiry");
    if (far.kind === "wake_past_expiry") expect(far.gapMs).toBe(9_000);
    const farReclaim = acquireHostLease(
      multi.lease,
      { hostId: "host-multi", holderPid: 11, generationId: "gen-m2", ttlMs: 5_000 },
      clockAt(40_000),
    );
    expect(farReclaim.ok).toBe(true);
    if (farReclaim.ok) expect(farReclaim.reclaimed).toBe(true);
  });

  it("edge: exact-expiry wake gapMs=0; mid-gap renew; post-expiry renew refuse (T-X002)", () => {
    const seed = acquireHostLease(
      null,
      { hostId: "host-edge", holderPid: 1, generationId: "gen-e", ttlMs: 5_000 },
      clockAt(50_000),
    );
    expect(seed.ok).toBe(true);
    if (!seed.ok) return;

    const expiryMs = Date.parse(seed.lease.expiresAt);
    const atExpiry = classifyWakeCatchupLeaseGap(seed.lease, expiryMs);
    expect(atExpiry).toEqual({
      kind: "wake_past_expiry",
      expired: true,
      gapMs: 0,
    });
    const reclaim = acquireHostLease(
      seed.lease,
      { hostId: "host-edge", holderPid: 2, generationId: "gen-f", ttlMs: 5_000 },
      clockAt(expiryMs),
    );
    expect(reclaim.ok).toBe(true);
    if (reclaim.ok) expect(reclaim.reclaimed).toBe(true);

    const renewSeed = acquireHostLease(
      null,
      { hostId: "host-rn", holderPid: 10, generationId: "gen-rn", ttlMs: 10_000 },
      clockAt(60_000),
    );
    expect(renewSeed.ok).toBe(true);
    if (!renewSeed.ok) return;
    const mid = renewHostLease(
      renewSeed.lease,
      { hostId: "host-rn", holderPid: 10, generationId: "gen-rn", ttlMs: 10_000 },
      clockAt(63_000),
    );
    expect(mid.ok).toBe(true);
    if (mid.ok) {
      expect(mid.reclaimed).toBe(false);
      expect(mid.lease.leaseId).toBe(renewSeed.lease.leaseId);
    }
    const post = renewHostLease(
      renewSeed.lease,
      { hostId: "host-rn", holderPid: 10, generationId: "gen-rn", ttlMs: 10_000 },
      clockAt(Date.parse(renewSeed.lease.expiresAt) + 1),
    );
    expect(post.ok).toBe(false);
    if (!post.ok) expect(post.reason).toBe("LEASE_HELD");
  });

  it("edge: same-gen acquire at/after expiry re-establishes; foreign mid-gap held (T-X002)", () => {
    const seed = acquireHostLease(
      null,
      { hostId: "host-re", holderPid: 1, generationId: "gen-re", ttlMs: 8_000 },
      clockAt(80_000),
    );
    expect(seed.ok).toBe(true);
    if (!seed.ok) return;
    const expiryMs = Date.parse(seed.lease.expiresAt);

    const atExp = acquireHostLease(
      seed.lease,
      {
        hostId: "  host-re  ",
        holderPid: 1,
        generationId: " gen-re ",
        ttlMs: 8_000,
      },
      clockAt(expiryMs),
    );
    expect(atExp.ok).toBe(true);
    if (atExp.ok) {
      expect(atExp.reclaimed).toBe(false);
      expect(atExp.lease.leaseId).toBe(seed.lease.leaseId);
      expect(atExp.lease.hostId).toBe("host-re");
      expect(atExp.lease.generationId).toBe("gen-re");
    }

    const past = acquireHostLease(
      seed.lease,
      { hostId: "host-re", holderPid: 2, generationId: "gen-re", ttlMs: 8_000 },
      clockAt(expiryMs + 2_000),
    );
    expect(past.ok).toBe(true);
    if (past.ok) {
      expect(past.reclaimed).toBe(false);
      expect(past.lease.leaseId).toBe(seed.lease.leaseId);
    }

    if (!past.ok) return;
    const foreign = acquireHostLease(
      past.lease,
      {
        hostId: "host-re",
        holderPid: 99,
        generationId: "gen-other",
        ttlMs: 8_000,
      },
      clockAt(expiryMs + 3_000),
    );
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.reason).toBe("LEASE_HELD");
      expect(foreign.message).toBe(HOST_LEASE_HELD_MESSAGE);
    }
    expect(classifyWakeCatchupLeaseGap(past.lease, expiryMs + 3_000)).toEqual({
      kind: "mid_gap_held",
      expired: false,
    });
  });

  it("edge: NaN holderPid fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-nan",
        holderPid: Number.NaN,
        generationId: "gen-nan",
        ttlMs: 5_000,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: +Infinity holderPid fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-inf",
        holderPid: Number.POSITIVE_INFINITY,
        generationId: "gen-inf",
        ttlMs: 5_000,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: -Infinity holderPid fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-neg-inf",
        holderPid: Number.NEGATIVE_INFINITY,
        generationId: "gen-neg-inf",
        ttlMs: 5_000,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: zero holderPid fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-zero",
        holderPid: 0,
        generationId: "gen-zero",
        ttlMs: 5_000,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: negative holderPid fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-neg",
        holderPid: -1,
        generationId: "gen-neg",
        ttlMs: 5_000,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: -Infinity ttlMs fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-ttl",
        holderPid: 1,
        generationId: "gen-ttl",
        ttlMs: Number.NEGATIVE_INFINITY,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: +Infinity ttlMs fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-ttl-pos",
        holderPid: 1,
        generationId: "gen-ttl-pos",
        ttlMs: Number.POSITIVE_INFINITY,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: NaN ttlMs fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-ttl-nan",
        holderPid: 1,
        generationId: "gen-ttl-nan",
        ttlMs: Number.NaN,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: non-number holderPid fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-pid-str",
        holderPid: "1" as unknown as number,
        generationId: "gen-pid-str",
        ttlMs: 5_000,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: zero ttlMs fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-ttl-zero",
        holderPid: 1,
        generationId: "gen-ttl-zero",
        ttlMs: 0,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });

  it("edge: negative finite ttlMs fails INVALID_INPUT without LEASE_HELD (T-X002)", () => {
    const bad = acquireHostLease(
      null,
      {
        hostId: "host-ttl-neg",
        holderPid: 1,
        generationId: "gen-ttl-neg",
        ttlMs: -100,
      },
      clockAt(1_000),
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.reason).toBe("INVALID_INPUT");
      expect(bad.message).not.toBe(HOST_LEASE_HELD_MESSAGE);
    }
  });
});
