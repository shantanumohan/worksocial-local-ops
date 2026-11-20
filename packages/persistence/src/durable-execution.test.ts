/**
 * Fixture/memory durable execution — offline proof of accept ≠ verify
 * and no second apply on verify.
 */

import { describe, expect, it } from "vitest";
import {
  createDurableExecutionService,
  createMemoryDurableStores,
  newJobId,
} from "./index.js";

describe("durable execution (memory fixture)", () => {
  it("accepts pending, verifies independently, and never double-applies", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    const account = await stores.budgets.ensureAccount({
      dayKey: "2026-11-20",
      currency: "USD",
      limitMinor: 1000,
    });

    const operationId = "op-mem-1";
    const payloadDigest = "digest-mem-1";
    const accepted = await service.acceptPending({
      job: {
        jobId: newJobId(),
        roleId: "A01",
        workflowId: "wf-mem",
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "1",
        inputArtifactIds: [],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: "idem-mem-1",
        expectedOutcome: "verified_publish",
      },
      operationId,
      payloadDigest,
      businessIdempotencyKey: "biz-mem-1",
      nowIso: "2026-11-20T04:00:00.000Z",
      budget: {
        accountId: account.accountId,
        reservationId: "res-mem-1",
        amountMinor: 10,
      },
      decision: {
        decisionId: "dec-mem-1",
        operationId,
        payloadDigest,
        allowed: true,
        code: null,
        reason: "authorized",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T04:00:00.000Z",
        writePathId: "wp-1",
        gateDetails: [],
      },
    });

    expect(accepted.decision.outcome).toBe("ACCEPTED_PENDING");
    expect(accepted.applyAttemptCount).toBe(1);

    // "Restart": new service over the same fixture stores.
    const resumed = createDurableExecutionService(stores);
    expect((await resumed.getDecision(operationId))?.outcome).toBe(
      "ACCEPTED_PENDING",
    );

    const verified = await resumed.verifyIndependent({
      operationId,
      observedDigest: payloadDigest,
      nowIso: "2026-11-20T04:01:00.000Z",
    });
    expect(verified.decision.outcome).toBe("VERIFIED");
    expect(verified.applyAttemptCount).toBe(1);

    const provider = await stores.fakeProvider.getByBusinessKey("biz-mem-1");
    expect(provider?.applyCount).toBe(1);
  });

  it("job insertIdempotent returns the same job on replay", async () => {
    const stores = createMemoryDurableStores();
    const jobInput = {
      jobId: newJobId(),
      roleId: "A02",
      workflowId: "wf-2",
      siteId: "site-1",
      assetId: "asset-1",
      trigger: "schedule",
      policyVersion: "1",
      inputArtifactIds: ["a1"],
      capabilityGrantId: "grant-1",
      sourceRevision: "rev-1",
      maxAttempts: 2,
      deadlineSeconds: 120,
      idempotencyKey: "idem-shared",
      expectedOutcome: "ok",
    };
    const first = await stores.jobs.insertIdempotent(jobInput);
    const second = await stores.jobs.insertIdempotent({
      ...jobInput,
      jobId: newJobId(),
    });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.job.jobId).toBe(first.job.jobId);
  });
});
