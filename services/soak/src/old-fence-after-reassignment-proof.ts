/**
 * Fixture proof for T-X024 — old fence after reassignment.
 *
 * Worker A leases a mission workflow; after lease expiry Worker B reassigns.
 * Worker A's subsequent commit (bind / markEffectPending) fails the lease fence;
 * Worker B can commit. External effects: NONE. Temporal stays NOT_WIRED.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. Never invents past T-X073.
 *
 * Hillclimb O1: expired-pre-reassignment deny, exact-expiry reclaim gate,
 * old-A reclaim refused while B live, attemptCount on reassignment,
 * post-commit phase fence for old A.
 * Hillclimb O2: classifyMissionLeaseFence (expired ≠ wrong_holder);
 * A self-renew positive control while live.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  classifyMissionLeaseFence,
  createMemoryMissionWorkflowStore,
  isMissionLeaseActive,
  OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS,
} from "@worksocial/persistence";

/** Live Temporal / mission runtime — always NOT_WIRED offline. */
export const OLD_FENCE_TEMPORAL_WIRING = "NOT_WIRED" as const;

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
  const tAtExpiry = tLeaseExpiry;
  const tAfterExpiry = new Date(Date.parse(t0) + 2_000).toISOString();
  const operationId = `op-fence-${randomUUID().slice(0, 8)}`;

  const enqueued = await store.enqueue({
    workflowId,
    jobId,
    temporalWiring: "FIXTURE",
    nowIso: t0,
  });
  if (enqueued.temporalWiring !== "FIXTURE") {
    passed = false;
    details.push(
      `Enqueue temporalWiring unexpected=${enqueued.temporalWiring}`,
    );
  }

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

  // 2a. Positive control: A self-renew while live (fence must not block holder).
  const tMid = new Date(Date.parse(t0) + 500).toISOString();
  const renewedA = await store.claimLease({
    workflowId,
    holder: workerA,
    leaseExpiresAtIso: tLeaseExpiry,
    nowIso: tMid,
  });
  if (
    renewedA?.leaseHolder === workerA &&
    renewedA.attemptCount === 2 &&
    classifyMissionLeaseFence(renewedA, workerA, tMid) === "active"
  ) {
    details.push(
      `Worker A self-renew while live ok attemptCount=2 fenceCause=active`,
    );
  } else {
    passed = false;
    details.push(
      `Worker A self-renew unexpected holder=${renewedA?.leaseHolder} attempts=${renewedA?.attemptCount}`,
    );
  }

  // 2b. Exact expiry: classify=expired; A cannot bind pre-reassignment.
  const snapAtExpiry = await store.get(workflowId);
  const causeAtExpiry = snapAtExpiry
    ? classifyMissionLeaseFence(snapAtExpiry, workerA, tAtExpiry)
    : null;
  if (
    causeAtExpiry === "expired" &&
    snapAtExpiry &&
    isMissionLeaseActive(snapAtExpiry, workerA, tAtExpiry) === false
  ) {
    details.push(
      `Exact expiry boundary: fenceCause=expired isMissionLeaseActive=false`,
    );
  } else {
    passed = false;
    details.push(
      `Exact expiry boundary unexpected cause=${causeAtExpiry ?? "missing"}`,
    );
  }

  let expiredPreReassignDenied = false;
  try {
    await store.bindOperationWhileLeased({
      workflowId,
      operationId: `${operationId}-expired-pre`,
      holder: workerA,
      nowIso: tAtExpiry,
      payloadDigest: "digest-expired-pre",
      businessIdempotencyKey: "biz-expired-pre",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/Lease fence failed/i.test(msg)) {
      expiredPreReassignDenied = true;
      details.push(
        `Expired-pre-reassignment A bind denied fenceCause=expired: ${msg}`,
      );
    } else {
      passed = false;
      details.push(`Expired-pre-reassignment unexpected error: ${msg}`);
    }
  }
  if (!expiredPreReassignDenied) {
    passed = false;
    details.push("Expired-pre-reassignment A bind unexpectedly succeeded");
  }

  // 3. At exact expiry, Worker B reassigns the lease (attemptCount 2→3 after renew).
  const leasedB = await store.claimLease({
    workflowId,
    holder: workerB,
    leaseExpiresAtIso: new Date(Date.parse(tAtExpiry) + 5_000).toISOString(),
    nowIso: tAtExpiry,
  });
  if (
    leasedB?.leaseHolder === workerB &&
    leasedB.phase === "leased" &&
    leasedB.attemptCount === 3
  ) {
    details.push(
      `Worker B reassigned lease holder=${workerB} at exact expiry attemptCount=3`,
    );
  } else {
    passed = false;
    details.push(
      `Worker B reassign unexpected holder=${leasedB?.leaseHolder} attempts=${leasedB?.attemptCount}`,
    );
  }

  // 3a. After reassignment, A is wrong_holder (distinct from expired).
  if (
    leasedB &&
    classifyMissionLeaseFence(leasedB, workerA, tAfterExpiry) ===
      "wrong_holder" &&
    classifyMissionLeaseFence(leasedB, workerB, tAfterExpiry) === "active"
  ) {
    details.push(
      "Post-reassignment fenceCause A=wrong_holder B=active (expired≠wrong_holder)",
    );
  } else {
    passed = false;
    details.push("Post-reassignment fenceCause classification unexpected");
  }

  // 3b. Old worker A cannot reclaim while B holds a live lease.
  const reclaimA = await store.claimLease({
    workflowId,
    holder: workerA,
    leaseExpiresAtIso: new Date(Date.parse(tAfterExpiry) + 10_000).toISOString(),
    nowIso: tAfterExpiry,
  });
  if (reclaimA === null) {
    details.push("Old worker A reclaim refused while B lease live");
  } else {
    passed = false;
    details.push("Old worker A reclaimed while B lease live — unexpected");
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

  // 5b. After B commit, old A still cannot bind (phase fence — not leased).
  let postCommitDenied = false;
  try {
    await store.bindOperationWhileLeased({
      workflowId,
      operationId: `${operationId}-post`,
      holder: workerA,
      nowIso: tAfterExpiry,
      payloadDigest: "digest-post",
      businessIdempotencyKey: "biz-post",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/must be leased|Lease fence failed/i.test(msg)) {
      postCommitDenied = true;
      details.push(`Post-commit old A bind denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Post-commit old A unexpected error: ${msg}`);
    }
  }
  if (!postCommitDenied) {
    passed = false;
    details.push("Post-commit old A bind unexpectedly succeeded");
  }

  details.push(
    `relatedCases=${OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS.join(",")} liveTemporalWiring=${OLD_FENCE_TEMPORAL_WIRING} liveProviderSuccessClaimed=false externalEffects=NONE`,
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
