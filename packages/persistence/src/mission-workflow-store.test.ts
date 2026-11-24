/**
 * Mission workflow lease fence — T-X024 hillclimb unit coverage.
 * Fixture / memory store only. ACCEPTED ≠ VERIFIED. Temporal NOT_WIRED.
 */

import { describe, expect, it } from "vitest";
import {
  classifyMissionLeaseFence,
  createMemoryMissionWorkflowStore,
  isMissionLeaseActive,
  OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS,
  type MissionWorkflowRecord,
} from "./mission-workflow-store.js";

function baseRecord(
  overrides: Partial<MissionWorkflowRecord> = {},
): MissionWorkflowRecord {
  return {
    workflowId: "wf-test",
    jobId: "job-test",
    operationId: null,
    phase: "leased",
    retryCategory: null,
    attemptCount: 1,
    leaseHolder: "worker-a",
    leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
    reviewRequired: false,
    reviewToken: null,
    lastError: null,
    temporalWiring: "FIXTURE",
    temporalRunId: null,
    envelopeJson: {},
    createdAtIso: "2026-11-21T18:00:00.000Z",
    updatedAtIso: "2026-11-21T18:00:00.000Z",
    ...overrides,
  };
}

describe("classifyMissionLeaseFence / isMissionLeaseActive (T-X024)", () => {
  it("maps related case to T-X024 only", () => {
    expect([...OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS]).toEqual([
      "T-X024",
    ]);
  });

  it("is active before expiry for matching holder", () => {
    const rec = baseRecord();
    expect(
      classifyMissionLeaseFence(rec, "worker-a", "2026-11-21T18:00:00.500Z"),
    ).toBe("active");
    expect(
      isMissionLeaseActive(rec, "worker-a", "2026-11-21T18:00:00.500Z"),
    ).toBe(true);
  });

  it("is expired at exact expiry boundary", () => {
    const rec = baseRecord();
    expect(
      classifyMissionLeaseFence(rec, "worker-a", "2026-11-21T18:00:01.000Z"),
    ).toBe("expired");
    expect(
      isMissionLeaseActive(rec, "worker-a", "2026-11-21T18:00:01.000Z"),
    ).toBe(false);
  });

  it("is wrong_holder for mismatched holder (distinct from expired)", () => {
    const rec = baseRecord();
    expect(
      classifyMissionLeaseFence(rec, "worker-b", "2026-11-21T18:00:00.500Z"),
    ).toBe("wrong_holder");
    expect(
      classifyMissionLeaseFence(rec, "worker-b", "2026-11-21T18:00:01.000Z"),
    ).toBe("wrong_holder");
  });

  it("is no_holder when lease never claimed", () => {
    expect(
      classifyMissionLeaseFence(
        baseRecord({ leaseHolder: null, leaseExpiresAtIso: null, phase: "enqueued" }),
        "worker-a",
        "2026-11-21T18:00:00.000Z",
      ),
    ).toBe("no_holder");
  });
});

describe("memory mission workflow store lease fence", () => {
  it("allows self-renew, refuses steal, fences old holder after reassignment", async () => {
    const store = createMemoryMissionWorkflowStore();
    const workflowId = "wf-fence-unit";
    await store.enqueue({
      workflowId,
      jobId: "job-fence-unit",
      temporalWiring: "FIXTURE",
      nowIso: "2026-11-21T18:00:00.000Z",
    });

    const leasedA = await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(leasedA?.leaseHolder).toBe("worker-a");
    expect(leasedA?.attemptCount).toBe(1);

    const steal = await store.claimLease({
      workflowId,
      holder: "worker-b",
      leaseExpiresAtIso: "2026-11-21T18:00:10.000Z",
      nowIso: "2026-11-21T18:00:00.100Z",
    });
    expect(steal).toBeNull();

    const renewed = await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:01.000Z",
      nowIso: "2026-11-21T18:00:00.500Z",
    });
    expect(renewed?.attemptCount).toBe(2);
    expect(
      classifyMissionLeaseFence(
        renewed!,
        "worker-a",
        "2026-11-21T18:00:00.500Z",
      ),
    ).toBe("active");

    await expect(
      store.bindOperationWhileLeased({
        workflowId,
        operationId: "op-expired",
        holder: "worker-a",
        nowIso: "2026-11-21T18:00:01.000Z",
        payloadDigest: "d",
        businessIdempotencyKey: "k",
      }),
    ).rejects.toThrow(/Lease fence failed/);

    const leasedB = await store.claimLease({
      workflowId,
      holder: "worker-b",
      leaseExpiresAtIso: "2026-11-21T18:00:10.000Z",
      nowIso: "2026-11-21T18:00:01.000Z",
    });
    expect(leasedB?.leaseHolder).toBe("worker-b");
    expect(leasedB?.attemptCount).toBe(3);
    expect(
      classifyMissionLeaseFence(
        leasedB!,
        "worker-a",
        "2026-11-21T18:00:02.000Z",
      ),
    ).toBe("wrong_holder");

    const reclaimA = await store.claimLease({
      workflowId,
      holder: "worker-a",
      leaseExpiresAtIso: "2026-11-21T18:00:20.000Z",
      nowIso: "2026-11-21T18:00:02.000Z",
    });
    expect(reclaimA).toBeNull();

    await expect(
      store.bindOperationWhileLeased({
        workflowId,
        operationId: "op-stale",
        holder: "worker-a",
        nowIso: "2026-11-21T18:00:02.000Z",
        payloadDigest: "d-stale",
        businessIdempotencyKey: "k-stale",
      }),
    ).rejects.toThrow(/Lease fence failed/);

    const bound = await store.bindOperationWhileLeased({
      workflowId,
      operationId: "op-b",
      holder: "worker-b",
      nowIso: "2026-11-21T18:00:02.000Z",
      payloadDigest: "d-b",
      businessIdempotencyKey: "k-b",
    });
    expect(bound.operationId).toBe("op-b");

    const pending = await store.markEffectPending({
      workflowId,
      operationId: "op-b",
      holder: "worker-b",
      nowIso: "2026-11-21T18:00:02.000Z",
    });
    expect(pending.phase).toBe("effect_pending");
  });
});
