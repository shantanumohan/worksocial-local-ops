/**
 * Fixture proof for T-US-002 / T-X002 — competing supervisors / singleton host lease.
 *
 * First generation acquires the local-singleton lease; a second live generation
 * is refused (no duplicate leases). Dead-holder reclaim is allowed. Ownership
 * kill auth stays fail-closed for mismatched PIDs. External effects: NONE.
 * Never invents live VERIFIED. Does not touch credential rebind (#43 lane).
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  acquireHostLease,
  describeOwnershipCapability,
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
  } else {
    details.push(
      `Second supervisor refused reason=LEASE_HELD holderGeneration=${second.holder?.generationId ?? "unknown"}`,
    );
  }

  // 3. Dead-holder reclaim allowed (honest crash recovery, still one lease).
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

  // 4. Ownership kill auth fail-closed for mismatched PID / missing markers.
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

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
