/**
 * PostgreSQL durable execution: uniqueness races + restart recovery proof.
 * Requires DATABASE_URL or WORKSOCIAL_DATABASE_URL.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPgDurableExecutionService,
  createPgBudgetStore,
  createPgJobStore,
  newJobId,
  type PgPool,
} from "./index.js";
import {
  createMigratedTestPool,
  pgConfigured,
  truncateDurableTables,
} from "./pg-test-harness.js";

const describePg = pgConfigured() ? describe : describe.skip;

describePg("durable execution (postgres)", () => {
  let pool: PgPool;

  beforeAll(async () => {
    pool = await createMigratedTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateDurableTables(pool);
  });

  function sampleJob(suffix: string) {
    return {
      jobId: newJobId(),
      roleId: "A01",
      workflowId: `wf-${suffix}`,
      siteId: "site-1",
      assetId: "page-home",
      trigger: "manual",
      policyVersion: "1",
      inputArtifactIds: [] as string[],
      capabilityGrantId: "grant-1",
      sourceRevision: "rev-1",
      maxAttempts: 2,
      deadlineSeconds: 600,
      idempotencyKey: `idem-${suffix}`,
      expectedOutcome: "verified_publish",
    };
  }

  it("enforces unique job idempotency keys under concurrent insert", async () => {
    const jobs = createPgJobStore(pool);
    const key = `race-job-${randomBytes(4).toString("hex")}`;
    const mk = (n: number) => ({
      ...sampleJob(`${key}-${n}`),
      jobId: newJobId(),
      idempotencyKey: key,
    });

    const results = await Promise.allSettled([
      jobs.insert(mk(1)),
      jobs.insert(mk(2)),
      jobs.insert(mk(3)),
      jobs.insert(mk(4)),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected.length).toBeGreaterThanOrEqual(3);

    const listed = await pool.query(
      `SELECT COUNT(*)::int AS n FROM core.jobs WHERE idempotency_key = $1`,
      [key],
    );
    expect(listed.rows[0].n).toBe(1);
  });

  it("reserves budget race-safely when capacity allows only one winner", async () => {
    const budgets = createPgBudgetStore(pool);
    const account = await budgets.ensureAccount({
      dayKey: "2026-11-20",
      currency: "USD",
      limitMinor: 100,
    });

    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        budgets.reserve({
          accountId: account.accountId,
          reservationId: `res-race-${i}-${randomBytes(3).toString("hex")}`,
          amountMinor: 100,
        }),
      ),
    );

    const ok = attempts.filter((a) => a.ok);
    const exhausted = attempts.filter((a) => !a.ok);
    expect(ok).toHaveLength(1);
    expect(exhausted).toHaveLength(7);

    const again = await budgets.getAccount(account.accountId);
    expect(again?.reservedMinor).toBe(100);
    expect(again?.settledMinor).toBe(0);
  });

  it("survives process restart: accept → new service → verify without second apply", async () => {
    const budgets = createPgBudgetStore(pool);
    const account = await budgets.ensureAccount({
      dayKey: "2026-11-20",
      currency: "USD",
      limitMinor: 5_000,
    });

    const suffix = randomBytes(4).toString("hex");
    const operationId = `op-restart-${suffix}`;
    const payloadDigest = `digest-${suffix}`;
    const businessKey = `biz-${suffix}`;
    const nowIso = "2026-11-20T02:00:00.000Z";

    const serviceA = createPgDurableExecutionService(pool);
    const accepted = await serviceA.acceptPending({
      job: sampleJob(suffix),
      operationId,
      payloadDigest,
      businessIdempotencyKey: businessKey,
      nowIso,
      budget: {
        accountId: account.accountId,
        reservationId: `res-${suffix}`,
        amountMinor: 25,
      },
      decision: {
        decisionId: `dec-${suffix}`,
        operationId,
        payloadDigest,
        allowed: true,
        code: null,
        reason: "authorized fixture release",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: nowIso,
        writePathId: "wp-cms-1",
        gateDetails: ["ownership proven", "read evidence present"],
      },
    });

    expect(accepted.decision.outcome).toBe("ACCEPTED_PENDING");
    expect(accepted.providerCreated).toBe(true);
    expect(accepted.applyAttemptCount).toBe(1);
    expect(accepted.jobCreated).toBe(true);

    // Simulate process restart: brand-new service instance, same database.
    const serviceB = createPgDurableExecutionService(pool);
    const restored = await serviceB.getDecision(operationId);
    expect(restored).toBeDefined();
    expect(restored?.outcome).toBe("ACCEPTED_PENDING");
    expect(restored?.payloadDigest).toBe(payloadDigest);

    const verified = await serviceB.verifyIndependent({
      operationId,
      observedDigest: payloadDigest,
      observedPayload: { title: "Home" },
      nowIso: "2026-11-20T02:05:00.000Z",
    });

    expect(verified.decision.outcome).toBe("VERIFIED");
    expect(verified.applyAttemptCount).toBe(1);
    expect(verified.provider?.applyCount).toBe(1);
    expect(verified.provider?.businessIdempotencyKey).toBe(businessKey);
  });

  it("accept → restart → verify is the primary recovery path (no second effect)", async () => {
    const suffix = randomBytes(4).toString("hex");
    const operationId = `op-proof-${suffix}`;
    const payloadDigest = `digest-proof-${suffix}`;
    const businessKey = `biz-proof-${suffix}`;
    const nowIso = "2026-11-20T03:00:00.000Z";

    const first = createPgDurableExecutionService(pool);
    const accepted = await first.acceptPending({
      job: sampleJob(`proof-${suffix}`),
      operationId,
      payloadDigest,
      businessIdempotencyKey: businessKey,
      nowIso,
      decision: {
        decisionId: `dec-proof-${suffix}`,
        operationId,
        payloadDigest,
        allowed: true,
        code: null,
        reason: "release to pending",
        grantId: "grant-1",
        policyId: "pol-1",
        decidedAtIso: nowIso,
        writePathId: "wp-1",
        gateDetails: [],
      },
    });
    expect(accepted.applyAttemptCount).toBe(1);

    const afterRestart = createPgDurableExecutionService(pool);
    expect((await afterRestart.getDecision(operationId))?.outcome).toBe(
      "ACCEPTED_PENDING",
    );

    const verified = await afterRestart.verifyIndependent({
      operationId,
      observedDigest: payloadDigest,
      nowIso: "2026-11-20T03:01:00.000Z",
    });
    expect(verified.decision.outcome).toBe("VERIFIED");
    expect(verified.applyAttemptCount).toBe(1);

    const providerRows = await pool.query(
      `SELECT apply_count FROM core.fake_provider_effects WHERE business_idempotency_key = $1`,
      [businessKey],
    );
    expect(providerRows.rows[0].apply_count).toBe(1);

    const applyAttempts = await pool.query(
      `SELECT COUNT(*)::int AS n FROM core.effect_attempts
       WHERE operation_id = $1 AND phase = 'apply' AND status = 'succeeded'`,
      [operationId],
    );
    expect(applyAttempts.rows[0].n).toBe(1);
  });

  it("commits mismatch evidence then throws after transaction", async () => {
    const service = createPgDurableExecutionService(pool);
    const suffix = randomBytes(4).toString("hex");
    const operationId = `op-mismatch-${suffix}`;
    const digest = `digest-${suffix}`;
    await service.acceptPending({
      job: sampleJob(`mismatch-${suffix}`),
      operationId,
      payloadDigest: digest,
      businessIdempotencyKey: `biz-mismatch-${suffix}`,
      nowIso: "2026-11-20T08:00:00.000Z",
      decision: {
        decisionId: `dec-mismatch-${suffix}`,
        operationId,
        payloadDigest: digest,
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
      service.verifyIndependent({
        operationId,
        observedDigest: "wrong-digest",
        nowIso: "2026-11-20T08:01:00.000Z",
      }),
    ).rejects.toThrow(/Independent read mismatch/);

    const decision = await service.getDecision(operationId);
    expect(decision?.outcome).toBe("FAILED");
    const intent = await pool.query(
      `SELECT outcome FROM core.effect_intents WHERE operation_id = $1`,
      [operationId],
    );
    expect(intent.rows[0].outcome).toBe("FAILED");
    const receipts = await pool.query(
      `SELECT verdict FROM core.execution_receipts
       WHERE operation_id = $1 AND kind = 'independent_read'`,
      [operationId],
    );
    expect(receipts.rows[0].verdict).toBe("MISMATCH");
  });

  it("fake provider applyOnce is idempotent under concurrency", async () => {
    const service = createPgDurableExecutionService(pool);
    const key = `biz-concurrent-${randomBytes(4).toString("hex")}`;
    const op = `op-concurrent-${randomBytes(4).toString("hex")}`;
    const digest = "same-digest";

    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        service.stores.fakeProvider.applyOnce({
          businessIdempotencyKey: key,
          operationId: op,
          payloadDigest: digest,
        }),
      ),
    );

    const created = results.filter((r) => r.created);
    expect(created).toHaveLength(1);
    expect(new Set(results.map((r) => r.effect.remoteRef)).size).toBe(1);
    expect(results.every((r) => r.effect.applyCount === 1)).toBe(true);
  });
});
