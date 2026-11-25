/**
 * Fixture/memory durable execution — offline proof of accept ≠ verify
 * and no second apply on verify.
 */

import { describe, expect, it } from "vitest";
import {
  createDurableExecutionService,
  createMemoryDurableStores,
  IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP,
  IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING,
  isIdempotencyPayloadMismatchError,
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

  it("rejects denied decisions before any provider apply", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    await expect(
      service.acceptPending({
        job: {
          jobId: newJobId(),
          roleId: "A01",
          workflowId: "wf-denied",
          siteId: "site-1",
          assetId: "page-home",
          trigger: "manual",
          policyVersion: "1",
          inputArtifactIds: [],
          capabilityGrantId: "grant-1",
          sourceRevision: "rev-1",
          maxAttempts: 2,
          deadlineSeconds: 600,
          idempotencyKey: "idem-denied",
          expectedOutcome: "verified",
        },
        operationId: "op-denied",
        payloadDigest: "digest-denied",
        businessIdempotencyKey: "biz-denied",
        nowIso: "2026-11-20T04:10:00.000Z",
        decision: {
          decisionId: "dec-denied",
          operationId: "op-denied",
          payloadDigest: "digest-denied",
          allowed: false,
          code: "GRANT_MISSING",
          reason: "denied",
          grantId: null,
          policyId: null,
          decidedAtIso: "2026-11-20T04:10:00.000Z",
          writePathId: null,
          gateDetails: [],
        },
      }),
    ).rejects.toThrow(/Denied decision/);
    expect(await stores.fakeProvider.list()).toHaveLength(0);
  });

  it("replays acceptPending with the same budget reservation id", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    const account = await stores.budgets.ensureAccount({
      dayKey: "2026-11-20",
      currency: "USD",
      limitMinor: 100,
    });
    const input = {
      job: {
        jobId: newJobId(),
        roleId: "A01" as const,
        workflowId: "wf-replay",
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "1",
        inputArtifactIds: [] as string[],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: "idem-replay",
        expectedOutcome: "verified",
      },
      operationId: "op-replay",
      payloadDigest: "digest-replay",
      businessIdempotencyKey: "biz-replay",
      nowIso: "2026-11-20T04:20:00.000Z",
      budget: {
        accountId: account.accountId,
        reservationId: "res-replay",
        amountMinor: 50,
      },
      decision: {
        decisionId: "dec-replay",
        operationId: "op-replay",
        payloadDigest: "digest-replay",
        allowed: true,
        code: null,
        reason: "ok",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T04:20:00.000Z",
        writePathId: null,
        gateDetails: [] as string[],
      },
    };
    const first = await service.acceptPending(input);
    const second = await service.acceptPending(input);
    expect(second.providerCreated).toBe(false);
    expect(second.applyAttemptCount).toBe(1);
    expect(second.reservation?.reservationId).toBe(
      first.reservation?.reservationId,
    );
    expect((await stores.budgets.getAccount(account.accountId))?.reservedMinor).toBe(
      50,
    );
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

  it("acceptPending conflicts when replay uses a different payload digest (T-X022)", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    const base = {
      job: {
        jobId: newJobId(),
        roleId: "A01" as const,
        workflowId: "wf-mismatch",
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "1",
        inputArtifactIds: [] as string[],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: "idem-mismatch",
        expectedOutcome: "verified",
      },
      operationId: "op-mismatch",
      businessIdempotencyKey: "biz-mismatch",
      nowIso: "2026-11-20T05:00:00.000Z",
    };
    const first = await service.acceptPending({
      ...base,
      payloadDigest: "digest-a",
      decision: {
        decisionId: "dec-mismatch-a",
        operationId: "op-mismatch",
        payloadDigest: "digest-a",
        allowed: true,
        code: null,
        reason: "ok",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T05:00:00.000Z",
        writePathId: null,
        gateDetails: [],
      },
    });
    expect(first.providerCreated).toBe(true);
    expect(first.applyAttemptCount).toBe(1);

    await expect(
      service.acceptPending({
        ...base,
        payloadDigest: "digest-b",
        decision: {
          decisionId: "dec-mismatch-b",
          operationId: "op-mismatch",
          payloadDigest: "digest-b",
          allowed: true,
          code: null,
          reason: "ok",
          grantId: "grant-1",
          policyId: "pol-1",
          decidedAtIso: "2026-11-20T05:00:01.000Z",
          writePathId: null,
          gateDetails: [],
        },
      }),
    ).rejects.toThrow(/payload mismatch/i);

    await expect(
      service.acceptPending({
        ...base,
        operationId: "op-mismatch-alt",
        job: {
          ...base.job,
          jobId: newJobId(),
          idempotencyKey: "idem-mismatch-alt",
        },
        payloadDigest: "digest-b",
        decision: {
          decisionId: "dec-mismatch-alt",
          operationId: "op-mismatch-alt",
          payloadDigest: "digest-b",
          allowed: true,
          code: null,
          reason: "ok",
          grantId: "grant-1",
          policyId: "pol-1",
          decidedAtIso: "2026-11-20T05:00:02.000Z",
          writePathId: null,
          gateDetails: [],
        },
      }),
    ).rejects.toThrow(/different payload digest/i);

    const provider = await stores.fakeProvider.getByBusinessKey("biz-mismatch");
    expect(provider?.applyCount).toBe(1);
    expect(provider?.payloadDigest).toBe("digest-a");
    // Codex P1: Conflict must not leave an orphan INTENDED digest-B intent.
    expect(await stores.effects.get("op-mismatch-alt")).toBeUndefined();
    expect(await stores.decisions.get("op-mismatch-alt")).toBeUndefined();
    expect(
      (await stores.effects.list()).some((e) => e.payloadDigest === "digest-b"),
    ).toBe(false);
  });

  it("acceptPending conflicts after VERIFIED when payload digest differs (T-X022)", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    const base = {
      job: {
        jobId: newJobId(),
        roleId: "A01" as const,
        workflowId: "wf-mismatch-v",
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "1",
        inputArtifactIds: [] as string[],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: "idem-mismatch-v",
        expectedOutcome: "verified",
      },
      operationId: "op-mismatch-v",
      businessIdempotencyKey: "biz-mismatch-v",
      nowIso: "2026-11-20T06:00:00.000Z",
    };
    await service.acceptPending({
      ...base,
      payloadDigest: "digest-a",
      decision: {
        decisionId: "dec-mismatch-v-a",
        operationId: "op-mismatch-v",
        payloadDigest: "digest-a",
        allowed: true,
        code: null,
        reason: "ok",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T06:00:00.000Z",
        writePathId: null,
        gateDetails: [],
      },
    });
    const verified = await service.verifyIndependent({
      operationId: "op-mismatch-v",
      observedDigest: "digest-a",
      nowIso: "2026-11-20T06:00:30.000Z",
    });
    expect(verified.decision.outcome).toBe("VERIFIED");
    expect(verified.applyAttemptCount).toBe(1);

    try {
      await service.acceptPending({
        ...base,
        payloadDigest: "digest-b",
        decision: {
          decisionId: "dec-mismatch-v-b",
          operationId: "op-mismatch-v",
          payloadDigest: "digest-b",
          allowed: true,
          code: null,
          reason: "ok",
          grantId: "grant-1",
          policyId: "pol-1",
          decidedAtIso: "2026-11-20T06:01:00.000Z",
          writePathId: null,
          gateDetails: [],
        },
      });
      expect.fail("expected payload mismatch Conflict");
    } catch (err) {
      expect(isIdempotencyPayloadMismatchError(err)).toBe(true);
    }

    const provider = await stores.fakeProvider.getByBusinessKey("biz-mismatch-v");
    expect(provider?.applyCount).toBe(1);
    expect(provider?.payloadDigest).toBe("digest-a");
    expect((await stores.decisions.get("op-mismatch-v"))?.outcome).toBe(
      "VERIFIED",
    );
    expect(IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING).toBe("NOT_WIRED");
  });

  it("classifies payload-mismatch Conflict errors (T-X022)", () => {
    expect(
      isIdempotencyPayloadMismatchError(
        new Error(
          "Idempotency key payload mismatch for op-x: bound digest differs from request",
        ),
      ),
    ).toBe(true);
    expect(
      isIdempotencyPayloadMismatchError(
        new Error("Fake provider key biz-x bound to a different payload digest"),
      ),
    ).toBe(true);
    expect(
      isIdempotencyPayloadMismatchError(new Error("BUDGET_EXHAUSTED available=0")),
    ).toBe(false);
    expect(
      isIdempotencyPayloadMismatchError(
        new Error("Business idempotency key mismatch for op-x"),
      ),
    ).toBe(false);
    expect(
      isIdempotencyPayloadMismatchError(
        new Error("Independent read mismatch for op-x"),
      ),
    ).toBe(false);
    expect([...IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP]).toEqual([
      "T-F07",
      "T-US-013",
      "T-US-014",
    ]);
  });

  it("empty and NUL-suffix digests Conflict after bind (T-X022)", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    const base = {
      job: {
        jobId: newJobId(),
        roleId: "A01" as const,
        workflowId: "wf-empty",
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "1",
        inputArtifactIds: [] as string[],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: "idem-empty",
        expectedOutcome: "verified",
      },
      operationId: "op-empty",
      businessIdempotencyKey: "biz-empty",
      nowIso: "2026-11-20T08:00:00.000Z",
    };
    await service.acceptPending({
      ...base,
      payloadDigest: "digest-bound",
      decision: {
        decisionId: "dec-empty-a",
        operationId: "op-empty",
        payloadDigest: "digest-bound",
        allowed: true,
        code: null,
        reason: "ok",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T08:00:00.000Z",
        writePathId: null,
        gateDetails: [],
      },
    });
    await expect(
      service.acceptPending({
        ...base,
        payloadDigest: "",
        decision: {
          decisionId: "dec-empty-b",
          operationId: "op-empty",
          payloadDigest: "",
          allowed: true,
          code: null,
          reason: "ok",
          grantId: "grant-1",
          policyId: "pol-1",
          decidedAtIso: "2026-11-20T08:00:01.000Z",
          writePathId: null,
          gateDetails: [],
        },
      }),
    ).rejects.toThrow(/payload mismatch/i);
    await expect(
      service.acceptPending({
        ...base,
        payloadDigest: "digest-bound\0",
        decision: {
          decisionId: "dec-empty-nul",
          operationId: "op-empty",
          payloadDigest: "digest-bound\0",
          allowed: true,
          code: null,
          reason: "ok",
          grantId: "grant-1",
          policyId: "pol-1",
          decidedAtIso: "2026-11-20T08:00:02.000Z",
          writePathId: null,
          gateDetails: [],
        },
      }),
    ).rejects.toThrow(/payload mismatch/i);
    expect((await stores.fakeProvider.getByBusinessKey("biz-empty"))?.applyCount).toBe(
      1,
    );
    const receipts = await stores.receipts.listForOperation("op-empty");
    expect(receipts.every((r) => r.observedDigest !== "")).toBe(true);
    expect(receipts.some((r) => r.observedDigest === "digest-bound")).toBe(true);
  });

  it("byte-exact case-distinct digest Conflicts; same-digest new-op replays (T-X022)", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    const base = {
      job: {
        jobId: newJobId(),
        roleId: "A01" as const,
        workflowId: "wf-case",
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "1",
        inputArtifactIds: [] as string[],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: "idem-case",
        expectedOutcome: "verified",
      },
      operationId: "op-case",
      businessIdempotencyKey: "biz-case",
      nowIso: "2026-11-20T07:00:00.000Z",
    };
    const first = await service.acceptPending({
      ...base,
      payloadDigest: "digest-lower",
      decision: {
        decisionId: "dec-case-a",
        operationId: "op-case",
        payloadDigest: "digest-lower",
        allowed: true,
        code: null,
        reason: "ok",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T07:00:00.000Z",
        writePathId: null,
        gateDetails: [],
      },
    });
    expect(first.providerCreated).toBe(true);

    await expect(
      service.acceptPending({
        ...base,
        payloadDigest: "DIGEST-LOWER",
        decision: {
          decisionId: "dec-case-upper",
          operationId: "op-case",
          payloadDigest: "DIGEST-LOWER",
          allowed: true,
          code: null,
          reason: "ok",
          grantId: "grant-1",
          policyId: "pol-1",
          decidedAtIso: "2026-11-20T07:00:01.000Z",
          writePathId: null,
          gateDetails: [],
        },
      }),
    ).rejects.toThrow(/payload mismatch/i);

    const replay = await service.acceptPending({
      ...base,
      operationId: "op-case-replay",
      job: {
        ...base.job,
        jobId: newJobId(),
        idempotencyKey: "idem-case-replay",
      },
      payloadDigest: "digest-lower",
      decision: {
        decisionId: "dec-case-replay",
        operationId: "op-case-replay",
        payloadDigest: "digest-lower",
        allowed: true,
        code: null,
        reason: "ok",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T07:00:02.000Z",
        writePathId: null,
        gateDetails: [],
      },
    });
    expect(replay.providerCreated).toBe(false);
    expect(replay.provider.applyCount).toBe(1);
    expect(replay.provider.remoteRef).toBe(first.provider.remoteRef);
    expect((await stores.fakeProvider.getByBusinessKey("biz-case"))?.applyCount).toBe(
      1,
    );
  });

  it("NBSP/ZWSP/prefix digests Conflict after bind (T-X022)", async () => {
    const stores = createMemoryDurableStores();
    const service = createDurableExecutionService(stores);
    const base = {
      job: {
        jobId: newJobId(),
        roleId: "A01" as const,
        workflowId: "wf-unicode",
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "1",
        inputArtifactIds: [] as string[],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: "idem-unicode",
        expectedOutcome: "verified",
      },
      operationId: "op-unicode",
      businessIdempotencyKey: "biz-unicode",
      nowIso: "2026-11-20T09:00:00.000Z",
    };
    await service.acceptPending({
      ...base,
      payloadDigest: "digest-bound",
      decision: {
        decisionId: "dec-unicode-a",
        operationId: "op-unicode",
        payloadDigest: "digest-bound",
        allowed: true,
        code: null,
        reason: "ok",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: "2026-11-20T09:00:00.000Z",
        writePathId: null,
        gateDetails: [],
      },
    });
    for (const [label, digest] of [
      ["nbsp", "digest-bound\u00a0"],
      ["zwsp", "digest-bound\u200b"],
      ["prefix", "xdigest-bound"],
      ["leading", " digest-bound"],
      ["bom", "\ufeffdigest-bound"],
      ["dblspace", "digest-bound  "],
      ["vt", "digest-bound\v"],
      ["ff", "digest-bound\f"],
      ["ls", "digest-bound\u2028"],
      ["cr", "digest-bound\r"],
      ["ps", "digest-bound\u2029"],
      ["midnul", "digest\0bound"],
      ["shy", "digest-bound\u00ad"],
      ["lrm", "\u200edigest-bound"],
      ["rlm", "digest-bound\u200f"],
    ] as const) {
      await expect(
        service.acceptPending({
          ...base,
          payloadDigest: digest,
          decision: {
            decisionId: `dec-unicode-${label}`,
            operationId: "op-unicode",
            payloadDigest: digest,
            allowed: true,
            code: null,
            reason: "ok",
            grantId: "grant-1",
            policyId: "pol-1",
            decidedAtIso: "2026-11-20T09:00:01.000Z",
            writePathId: null,
            gateDetails: [],
          },
        }),
      ).rejects.toThrow(/payload mismatch/i);
    }
    expect(
      (await stores.fakeProvider.getByBusinessKey("biz-unicode"))?.applyCount,
    ).toBe(1);
  });

});
