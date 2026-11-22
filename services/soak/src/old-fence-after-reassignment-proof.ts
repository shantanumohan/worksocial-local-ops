/**
 * Fixture proof for T-X024 — old fence after reassignment.
 *
 * Worker A leases a mission workflow; after lease expiry Worker B reassigns.
 * Worker A's subsequent commit (bind / markEffectPending) fails the lease fence;
 * Worker B can commit. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createMemoryMissionWorkflowStore } from "@worksocial/persistence";

/**
 * Complete expected proof set for T-X024 fixture ACCEPTED.
 */
export async function proofOldFenceAfterReassignment(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const store = createMemoryMissionWorkflowStore();
  const workflowId = `wf-fence-${randomUUID().slice(0, 8)}`;
  const jobId = `job-fence-${randomUUID().slice(0, 8)}`;
  const workerA = `worker-a-${randomUUID().slice(0, 8)}`;
  const workerB = `worker-b-${randomUUID().slice(0, 8)}`;
  const t0 = nowIso;
  const tLeaseExpiry = new Date(Date.parse(t0) + 1_000).toISOString();
  const tAfterExpiry = new Date(Date.parse(t0) + 2_000).toISOString();
  const operationId = `op-fence-${randomUUID().slice(0, 8)}`;

  await store.enqueue({
    workflowId,
    jobId,
    temporalWiring: "FIXTURE",
    nowIso: t0,
  });

  // 1. Worker A acquires the lease (pre-reassignment).
  const leasedA = await store.claimLease({
    workflowId,
    holder: workerA,
    leaseExpiresAtIso: tLeaseExpiry,
    nowIso: t0,
  });
  if (leasedA?.leaseHolder === workerA && leasedA.phase === "leased") {
    details.push(
      `Worker A acquired lease holder=${workerA} expires=${tLeaseExpiry}`,
    );
  } else {
    passed = false;
    details.push("Worker A failed to acquire lease");
  }

  // 2. While A's lease is live, B cannot steal it (reassignment requires expiry).
  const stealWhileLive = await store.claimLease({
    workflowId,
    holder: workerB,
    leaseExpiresAtIso: new Date(Date.parse(t0) + 5_000).toISOString(),
    nowIso: new Date(Date.parse(t0) + 100).toISOString(),
  });
  if (stealWhileLive === null) {
    details.push("Worker B refused while A lease live (no premature reassignment)");
  } else {
    passed = false;
    details.push("Worker B stole live lease — unexpected");
  }

  // 3. After expiry, Worker B reassigns the lease.
  const leasedB = await store.claimLease({
    workflowId,
    holder: workerB,
    leaseExpiresAtIso: new Date(Date.parse(tAfterExpiry) + 5_000).toISOString(),
    nowIso: tAfterExpiry,
  });
  if (leasedB?.leaseHolder === workerB && leasedB.phase === "leased") {
    details.push(
      `Worker B reassigned lease holder=${workerB} after A expiry`,
    );
  } else {
    passed = false;
    details.push("Worker B failed to reassign after A lease expiry");
  }

  // 4. Old worker A cannot commit — lease fence fails on bind + markEffectPending.
  let oldBindDenied = false;
  try {
    await store.bindOperationWhileLeased({
      workflowId,
      operationId: `${operationId}-stale`,
      holder: workerA,
      nowIso: tAfterExpiry,
      payloadDigest: "digest-stale-a",
      businessIdempotencyKey: "biz-stale-a",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Lease fence failed/i.test(msg)) {
      oldBindDenied = true;
      details.push(`Old worker A bind denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Old worker A bind unexpected error: ${msg}`);
    }
  }
  if (!oldBindDenied) {
    passed = false;
    details.push("Old worker A bind unexpectedly succeeded after reassignment");
  }

  let oldMarkDenied = false;
  try {
    await store.markEffectPending({
      workflowId,
      operationId: `${operationId}-stale`,
      holder: workerA,
      nowIso: tAfterExpiry,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Lease fence failed/i.test(msg)) {
      oldMarkDenied = true;
      details.push(`Old worker A markEffectPending denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Old worker A markEffectPending unexpected error: ${msg}`);
    }
  }
  if (!oldMarkDenied) {
    passed = false;
    details.push(
      "Old worker A markEffectPending unexpectedly succeeded after reassignment",
    );
  }

  // 5. New holder B can commit (bind + fenced markEffectPending).
  try {
    const bound = await store.bindOperationWhileLeased({
      workflowId,
      operationId,
      holder: workerB,
      nowIso: tAfterExpiry,
      payloadDigest: "digest-b",
      businessIdempotencyKey: "biz-b",
    });
    const pending = await store.markEffectPending({
      workflowId,
      operationId,
      holder: workerB,
      nowIso: tAfterExpiry,
    });
    if (
      bound.leaseHolder === workerB &&
      pending.phase === "effect_pending" &&
      pending.operationId === operationId
    ) {
      details.push(
        `Worker B commit ok phase=${pending.phase} operationId=${pending.operationId}`,
      );
    } else {
      passed = false;
      details.push(
        `Worker B commit unexpected phase=${pending.phase} holder=${pending.leaseHolder}`,
      );
    }
  } catch (err) {
    passed = false;
    details.push(
      `Worker B commit failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  details.push(
    "liveTemporalWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
  );

  return {
    proofId: `proof-old-fence-${randomUUID()}`,
    kind: SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId,
    createdAtIso: tAfterExpiry,
    fixtureOnly: true,
  };
}
