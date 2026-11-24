/**
 * Fixture proof for T-US-002 / T-X002 — competing supervisors / singleton host lease.
 *
 * First generation acquires the local-singleton lease; a second live generation
 * is refused (no duplicate leases). Dead-holder reclaim is allowed. Ownership
 * kill auth stays fail-closed for mismatched PIDs.
 *
 * Hillclimb: third competitor refused; isHolderAlive=true still LEASE_HELD;
 * whitespace-normalized tokens; LEASE_HELD message generic (no host/gen/pid leak);
 * honesty NOT_WIRED / externalEffects NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  HOST_LEASE_HELD_MESSAGE,
  acquireHostLease,
  classifyWakeCatchupLeaseGap,
  describeOwnershipCapability,
  renewHostLease,
  verifyProcessOwnership,
  type HostLeaseClock,
  type HostLeaseRecord,
} from "@worksocial/persistence";

function clockAt(ms: number): HostLeaseClock {
  return { nowMs: () => ms };
}

/**
 * Complete expected proof set for competing-supervisor / host-lease fixture ACCEPTED.
 * Returns a single SoakProofRecord mapped to T-US-002 and T-X002.
 */
export function proofCompetingSupervisorLease(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const baseMs = Date.parse(nowIso);
  const hostId = "host-soak-lease";
  const genA = `gen-a-${randomUUID().slice(0, 8)}`;
  const genB = `gen-b-${randomUUID().slice(0, 8)}`;
  const genC = `gen-c-${randomUUID().slice(0, 8)}`;

  // 1. First supervisor acquires the singleton lease.
  const first = acquireHostLease(
    null,
    { hostId, holderPid: 1001, generationId: genA, ttlMs: 60_000 },
    clockAt(baseMs),
  );
  if (!first.ok) {
    passed = false;
    details.push(`First supervisor failed to acquire lease: ${first.reason}`);
  } else {
    details.push(
      `First supervisor acquired leaseId=${first.lease.leaseId} generation=${genA} scope=${first.lease.scope}`,
    );
  }

  let held: HostLeaseRecord | null = first.ok ? first.lease : null;

  // 2. Second concurrent supervisor refused while first is live (T-US-002 / T-X002).
  const second = acquireHostLease(
    held,
    { hostId, holderPid: 2002, generationId: genB, ttlMs: 60_000 },
    clockAt(baseMs + 1_000),
  );
  if (second.ok) {
    passed = false;
    details.push(
      "Second live supervisor acquired lease — duplicate lease not refused",
    );
  } else if (second.reason !== "LEASE_HELD") {
    passed = false;
    details.push(`Second supervisor denied with unexpected reason=${second.reason}`);
  } else if (second.message !== HOST_LEASE_HELD_MESSAGE) {
    passed = false;
    details.push(`LEASE_HELD message not generic: ${second.message}`);
  } else if (
    second.message.includes(hostId) ||
    second.message.includes(genA) ||
    second.message.includes("1001")
  ) {
    passed = false;
    details.push("LEASE_HELD message leaked host/generation/pid");
  } else {
    details.push(
      `Second supervisor refused reason=LEASE_HELD holderGeneration=${second.holder?.generationId ?? "unknown"} messageGeneric=true`,
    );
  }

  // 3. Hillclimb — third competitor also refused (still singleton).
  const third = acquireHostLease(
    held,
    { hostId, holderPid: 4004, generationId: genC, ttlMs: 60_000 },
    clockAt(baseMs + 1_500),
  );
  if (!third.ok && third.reason === "LEASE_HELD") {
    details.push("Third concurrent supervisor refused LEASE_HELD");
  } else {
    passed = false;
    details.push("Third concurrent supervisor unexpectedly acquired or mismatched");
  }

  // 4. Hillclimb — explicit live probe still refuses reclaim.
  const liveProbe = acquireHostLease(
    held,
    {
      hostId,
      holderPid: 5005,
      generationId: genC,
      ttlMs: 60_000,
      isHolderAlive: () => true,
    },
    clockAt(baseMs + 1_800),
  );
  if (!liveProbe.ok && liveProbe.reason === "LEASE_HELD") {
    details.push("isHolderAlive=true still refuses reclaim (LEASE_HELD)");
  } else {
    passed = false;
    details.push("Live holder probe unexpectedly allowed reclaim");
  }

  // 5. Dead-holder reclaim allowed (honest crash recovery, still one lease).
  const reclaimed = acquireHostLease(
    held,
    {
      hostId,
      holderPid: 3003,
      generationId: genB,
      ttlMs: 60_000,
      isHolderAlive: () => false,
    },
    clockAt(baseMs + 2_000),
  );
  if (!reclaimed.ok || !reclaimed.reclaimed) {
    passed = false;
    details.push(
      `Dead-holder reclaim failed ok=${reclaimed.ok} reclaimed=${reclaimed.ok ? reclaimed.reclaimed : false}`,
    );
  } else {
    held = reclaimed.lease;
    details.push(
      `Dead-holder reclaim ok leaseId=${reclaimed.lease.leaseId} generation=${genB} reclaimed=true`,
    );
  }

  // 6. Hillclimb — whitespace-padded same-generation renew.
  const paddedRenew = acquireHostLease(
    held,
    {
      hostId: `  ${hostId}  `,
      holderPid: 3004,
      generationId: ` ${genB} `,
      ttlMs: 60_000,
    },
    clockAt(baseMs + 2_500),
  );
  if (paddedRenew.ok && !paddedRenew.reclaimed) {
    details.push("Whitespace-padded host/generation same-gen renew ok");
    held = paddedRenew.lease;
  } else {
    passed = false;
    details.push("Whitespace-padded same-gen renew failed");
  }

  // 7. Hillclimb — whitespace-only tokens fail closed.
  const blank = acquireHostLease(
    held,
    { hostId: "   ", holderPid: 1, generationId: genB, ttlMs: 60_000 },
    clockAt(baseMs + 2_800),
  );
  if (!blank.ok && blank.reason === "INVALID_INPUT") {
    details.push("Whitespace-only hostId fail closed INVALID_INPUT");
  } else {
    passed = false;
    details.push("Whitespace-only hostId unexpectedly accepted");
  }

  // 8. Deepen — non-positive ttlMs fail closed.
  const badTtl = acquireHostLease(
    held,
    { hostId, holderPid: 1, generationId: genB, ttlMs: 0 },
    clockAt(baseMs + 2_900),
  );
  if (!badTtl.ok && badTtl.reason === "INVALID_INPUT") {
    details.push("Non-positive ttlMs fail closed INVALID_INPUT");
  } else {
    passed = false;
    details.push("Non-positive ttlMs unexpectedly accepted");
  }

  // 9. Deepen — cross-hostId competition still singleton LEASE_HELD.
  const crossHost = acquireHostLease(
    held,
    {
      hostId: "host-other-soak",
      holderPid: 6006,
      generationId: genC,
      ttlMs: 60_000,
    },
    clockAt(baseMs + 3_000),
  );
  if (
    !crossHost.ok &&
    crossHost.reason === "LEASE_HELD" &&
    crossHost.message === HOST_LEASE_HELD_MESSAGE
  ) {
    details.push("Cross-hostId competitor refused LEASE_HELD (generic message)");
  } else {
    passed = false;
    details.push("Cross-hostId competitor unexpectedly acquired");
  }

  // 10. Deepen — same-gen renew preserves leaseId and acquiredAt.
  const priorLeaseId = held?.leaseId;
  const priorAcquiredAt = held?.acquiredAt;
  const sameGen = acquireHostLease(
    held,
    { hostId, holderPid: 3005, generationId: genB, ttlMs: 60_000 },
    clockAt(baseMs + 3_200),
  );
  if (
    sameGen.ok &&
    !sameGen.reclaimed &&
    sameGen.lease.leaseId === priorLeaseId &&
    sameGen.lease.acquiredAt === priorAcquiredAt
  ) {
    details.push("Same-gen renew preserves leaseId+acquiredAt reclaimed=false");
    held = sameGen.lease;
  } else {
    passed = false;
    details.push("Same-gen renew did not preserve lease identity");
  }

  // 11. Deepen — exact expiry boundary reclaim, then second live refused.
  const short = acquireHostLease(
    null,
    { hostId: "host-expire-soak", holderPid: 7007, generationId: "gen-exp-a", ttlMs: 1_000 },
    clockAt(baseMs + 10_000),
  );
  if (!short.ok) {
    passed = false;
    details.push("Short-ttl acquire failed for expiry boundary deepen");
  } else {
    const expiryMs = Date.parse(short.lease.expiresAt);
    const atExpiry = acquireHostLease(
      short.lease,
      {
        hostId: "host-expire-soak",
        holderPid: 7008,
        generationId: "gen-exp-b",
        ttlMs: 60_000,
      },
      clockAt(expiryMs),
    );
    if (atExpiry.ok && atExpiry.reclaimed) {
      details.push("Exact-expiry boundary reclaim ok reclaimed=true");
      const afterExpirySecond = acquireHostLease(
        atExpiry.lease,
        {
          hostId: "host-expire-soak",
          holderPid: 7009,
          generationId: "gen-exp-c",
          ttlMs: 60_000,
        },
        clockAt(expiryMs + 100),
      );
      if (!afterExpirySecond.ok && afterExpirySecond.reason === "LEASE_HELD") {
        details.push("Post-expiry-reclaim second competitor refused LEASE_HELD");
      } else {
        passed = false;
        details.push("Post-expiry-reclaim second competitor unexpectedly acquired");
      }
    } else {
      passed = false;
      details.push("Exact-expiry boundary reclaim failed");
    }
  }

  // 12. Ownership kill auth fail-closed for mismatched PID / missing markers.
  const ownershipOk = verifyProcessOwnership(
    { pid: 1001, serviceId: "api", generationId: genA },
    {
      readCommandLine: () =>
        "tsx heartbeat-slot.ts --service api --generation " + genA,
      readEnviron: () =>
        `WORKSOCIAL_SERVICE_ID=api\0WORKSOCIAL_GENERATION=${genA}\0`,
    },
  );
  const ownershipDenyReuse = verifyProcessOwnership(
    { pid: 1001, serviceId: "api", generationId: genA },
    {
      readCommandLine: () => "nginx: worker process",
      readEnviron: () => "USER=www\0",
    },
  );
  const ownershipDenyEmpty = verifyProcessOwnership(
    { pid: 1001, serviceId: "api", generationId: genA },
    {},
  );
  const cap = describeOwnershipCapability(true);
  if (!ownershipOk) {
    passed = false;
    details.push("Matching ownership probe unexpectedly denied");
  } else {
    details.push("Matching ownership probe accepted");
  }
  if (ownershipDenyReuse || ownershipDenyEmpty) {
    passed = false;
    details.push("Ownership fail-closed gates did not deny PID reuse / empty probe");
  } else {
    details.push(
      `Ownership fail-closed denyReuse=true denyEmpty=true heartbeatFallback=${cap.heartbeatFallback}`,
    );
  }
  if (cap.heartbeatFallback !== false) {
    passed = false;
    details.push("heartbeatFallback must remain false (kill auth honesty)");
  }

  details.push("honesty NOT_WIRED/NONE");
  details.push(
    "liveProviderSuccessClaimed=false catalogClaim=ACCEPTED≠VERIFIED externalEffects=NONE",
  );

  return {
    proofId: `proof-competing-supervisor-${randomUUID()}`,
    kind: SoakProofKind.COMPETING_SUPERVISOR_LEASE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `lease-${hostId}-${genA}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
