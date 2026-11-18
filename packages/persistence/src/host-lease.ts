/**
 * Singleton host lease — one supervisor generation owns local lifecycle at a time.
 * Closing the editor must not silently destroy job state; slots renew the lease.
 */

export type HostLeaseRecord = {
  leaseId: string;
  hostId: string;
  /** Generation token shared by all managed slots for this start. */
  generationId: string;
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

export function isLeaseHeldByGeneration(
  lease: HostLeaseRecord | null | undefined,
  hostId: string,
  generationId: string,
  nowMs: number,
): boolean {
  if (!lease || isLeaseExpired(lease, nowMs)) {
    return false;
  }
  return lease.hostId === hostId && lease.generationId === generationId;
}

/**
 * Acquire or reclaim the singleton host lease.
 * Same hostId+generation renews; expired leases are reclaimable; live foreign leases deny.
 */
export function acquireHostLease(
  current: HostLeaseRecord | null | undefined,
  input: {
    hostId: string;
    holderPid: number;
    generationId: string;
    leaseId?: string;
    ttlMs?: number;
  },
  clock: HostLeaseClock = systemClock,
): HostLeaseAcquireResult {
  const hostId = input.hostId.trim();
  const generationId = input.generationId.trim();
  if (
    !hostId ||
    !generationId ||
    !Number.isFinite(input.holderPid) ||
    input.holderPid <= 0
  ) {
    return {
      ok: false,
      reason: "INVALID_INPUT",
      message: "hostId, generationId, and positive holderPid are required to acquire a host lease.",
    };
  }

  const now = clock.nowMs();
  const ttlMs = input.ttlMs ?? 60_000;
  const expired = !current || isLeaseExpired(current, now);
  const sameGeneration =
    current !== null &&
    current !== undefined &&
    current.hostId === hostId &&
    current.generationId === generationId;

  if (!expired && !sameGeneration && current) {
    return {
      ok: false,
      reason: "LEASE_HELD",
      message: `Host lease held by host=${current.hostId} generation=${current.generationId} until ${current.expiresAt}.`,
      holder: current,
    };
  }

  const reclaimed = Boolean(current && expired && !sameGeneration);
  const acquiredAt = sameGeneration && current ? current.acquiredAt : toIso(now);
  const lease: HostLeaseRecord = {
    leaseId:
      input.leaseId ?? (sameGeneration && current ? current.leaseId : `lease-${now}`),
    hostId,
    generationId,
    holderPid: input.holderPid,
    acquiredAt,
    renewedAt: toIso(now),
    expiresAt: toIso(now + ttlMs),
    scope: "local-singleton",
  };

  return { ok: true, lease, reclaimed };
}

/**
 * Renew by generation so detached slots can keep the lease after the CLI exits.
 */
export function renewHostLease(
  current: HostLeaseRecord,
  input: {
    hostId: string;
    holderPid: number;
    generationId: string;
    ttlMs?: number;
  },
  clock: HostLeaseClock = systemClock,
): HostLeaseAcquireResult {
  if (
    !isLeaseHeldByGeneration(current, input.hostId, input.generationId, clock.nowMs())
  ) {
    return {
      ok: false,
      reason: "LEASE_HELD",
      message: "Cannot renew a lease not held by this host/generation.",
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
    generationId?: string;
    /** When true, release even if holder differs (CLI stop after start process exited). */
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
  if (
    input.generationId !== undefined &&
    isLeaseHeldByGeneration(current, input.hostId, input.generationId, now)
  ) {
    return { ok: true, released: true };
  }
  if (current.hostId === input.hostId && current.holderPid === input.holderPid) {
    return { ok: true, released: true };
  }
  const holderDead =
    input.isHolderAlive !== undefined ? !input.isHolderAlive(current.holderPid) : false;
  if (input.force === true || holderDead) {
    return { ok: true, released: true };
  }
  return { ok: true, released: false };
}
