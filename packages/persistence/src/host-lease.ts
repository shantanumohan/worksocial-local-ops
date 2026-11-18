/**
 * Singleton host lease — one supervisor owns local lifecycle at a time.
 * Closing the editor must not silently destroy job state; lease is process-backed.
 */

export type HostLeaseRecord = {
  leaseId: string;
  hostId: string;
  holderPid: number;
  acquiredAt: string;
  renewedAt: string;
  expiresAt: string;
  /** Honest label: this lease governs local process slots, not remote fleet. */
  scope: "local-singleton";
};

export type HostLeaseAcquireResult =
  | { ok: true; lease: HostLeaseRecord; reclaimed: boolean }
  | {
      ok: false;
      reason: "LEASE_HELD" | "INVALID_INPUT";
      message: string;
      holder?: HostLeaseRecord;
    };

export type HostLeaseClock = {
  nowMs: () => number;
};

export const systemClock: HostLeaseClock = {
  nowMs: () => Date.now(),
};

function toIso(ms: number): string {
  return new Date(ms).toISOString();
}

export function isLeaseExpired(lease: HostLeaseRecord, nowMs: number): boolean {
  return Date.parse(lease.expiresAt) <= nowMs;
}

export function isLeaseHeldBy(
  lease: HostLeaseRecord | null | undefined,
  hostId: string,
  holderPid: number,
  nowMs: number,
): boolean {
  if (!lease || isLeaseExpired(lease, nowMs)) {
    return false;
  }
  return lease.hostId === hostId && lease.holderPid === holderPid;
}

/**
 * Acquire or reclaim the singleton host lease.
 * Same hostId+pid renews; expired leases are reclaimable; live foreign leases deny.
 */
export function acquireHostLease(
  current: HostLeaseRecord | null | undefined,
  input: {
    hostId: string;
    holderPid: number;
    leaseId?: string;
    ttlMs?: number;
  },
  clock: HostLeaseClock = systemClock,
): HostLeaseAcquireResult {
  const hostId = input.hostId.trim();
  if (!hostId || !Number.isFinite(input.holderPid) || input.holderPid <= 0) {
    return {
      ok: false,
      reason: "INVALID_INPUT",
      message: "hostId and positive holderPid are required to acquire a host lease.",
    };
  }

  const now = clock.nowMs();
  const ttlMs = input.ttlMs ?? 60_000;
  const expired = !current || isLeaseExpired(current, now);
  const sameHolder =
    current !== null &&
    current !== undefined &&
    current.hostId === hostId &&
    current.holderPid === input.holderPid;

  if (!expired && !sameHolder && current) {
    return {
      ok: false,
      reason: "LEASE_HELD",
      message: `Host lease held by host=${current.hostId} pid=${current.holderPid} until ${current.expiresAt}.`,
      holder: current,
    };
  }

  const reclaimed = Boolean(current && expired && !sameHolder);
  const acquiredAt = sameHolder && current ? current.acquiredAt : toIso(now);
  const lease: HostLeaseRecord = {
    leaseId: input.leaseId ?? (sameHolder && current ? current.leaseId : `lease-${now}`),
    hostId,
    holderPid: input.holderPid,
    acquiredAt,
    renewedAt: toIso(now),
    expiresAt: toIso(now + ttlMs),
    scope: "local-singleton",
  };

  return { ok: true, lease, reclaimed };
}

export function renewHostLease(
  current: HostLeaseRecord,
  input: { hostId: string; holderPid: number; ttlMs?: number },
  clock: HostLeaseClock = systemClock,
): HostLeaseAcquireResult {
  if (!isLeaseHeldBy(current, input.hostId, input.holderPid, clock.nowMs())) {
    return {
      ok: false,
      reason: "LEASE_HELD",
      message: "Cannot renew a lease not held by this host/pid.",
      holder: current,
    };
  }
  return acquireHostLease(current, input, clock);
}

export function releaseHostLease(
  current: HostLeaseRecord | null | undefined,
  input: {
    hostId: string;
    holderPid: number;
    /** When true, release even if holderPid differs (CLI stop after start process exited). */
    force?: boolean;
    /** Optional liveness probe for the recorded holder pid. */
    isHolderAlive?: (pid: number) => boolean;
  },
  clock: HostLeaseClock = systemClock,
): { ok: true; released: boolean } {
  if (!current) {
    return { ok: true, released: false };
  }
  const now = clock.nowMs();
  if (isLeaseExpired(current, now)) {
    return { ok: true, released: true };
  }
  if (isLeaseHeldBy(current, input.hostId, input.holderPid, now)) {
    return { ok: true, released: true };
  }
  const holderDead =
    input.isHolderAlive !== undefined ? !input.isHolderAlive(current.holderPid) : false;
  if (input.force === true || holderDead) {
    return { ok: true, released: true };
  }
  return { ok: true, released: false };
}
