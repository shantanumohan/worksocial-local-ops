/**
 * Postgres durable mission: crash/restart at effect boundary across new runtime instances.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createPgDurableExecutionService,
  createPgMissionWorkflowStore,
  createPgPool,
  resolveDatabaseUrl,
  runMigrations,
  type PgPool,
} from "@worksocial/persistence";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDurableMissionRuntime } from "./durable-mission.js";

const hasPg = Boolean(resolveDatabaseUrl());
const describePg = hasPg ? describe : describe.skip;

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describePg("durable mission (postgres restart)", () => {
  let pool: PgPool;

  beforeAll(async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(here, "../../../database/migrations");
    pool = createPgPool({ max: 6 });
    await runMigrations({ pool, migrationsDir });
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'core' AND table_name = 'mission_workflows'
        ) THEN
          EXECUTE 'TRUNCATE TABLE core.mission_workflows';
        END IF;
      END $$;
    `);
    await pool.query(`
      TRUNCATE TABLE
        core.execution_receipts,
        core.effect_attempts,
        core.fake_provider_effects,
        core.gateway_decisions,
        core.outbox_events,
        measure.budget_reservations,
        measure.budget_accounts,
        core.effect_intents,
        core.jobs
      RESTART IDENTITY CASCADE
    `);
  });

  it("accept → new process → resume verify without second apply", async () => {
    const workflowId = `wf-pg-${uuid()}`;
    const digest = `digest-${workflowId}`;
    const operationId = `op-${workflowId}`;

    const runtimeA = createDurableMissionRuntime({
      missions: createPgMissionWorkflowStore(pool),
      execution: createPgDurableExecutionService(pool),
    });
    expect(runtimeA.temporal.status).toBe("NOT_WIRED");
    expect(runtimeA.temporalLabel).toBe("LOCAL_DURABLE");

    await runtimeA.enqueueBeforeAck({
      envelope: {
        jobId: uuid(),
        roleId: "A01",
        workflowId,
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "m2",
        inputArtifactIds: [],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: `mission/${workflowId}`,
        expectedOutcome: "verified",
      },
      nowIso: "2026-11-20T07:00:00.000Z",
    });

    const accepted = await runtimeA.claimAndAcceptEffect({
      workflowId,
      holder: "worker-a",
      operationId,
      payloadDigest: digest,
      businessIdempotencyKey: `biz-${workflowId}`,
      nowIso: "2026-11-20T07:01:00.000Z",
      decision: {
        decisionId: `dec-${workflowId}`,
        reason: "authorized",
      },
    });
    expect(accepted.applyAttemptCount).toBe(1);
    expect(accepted.workflow.phase).toBe("effect_pending");

    // New runtime instance = process restart.
    const runtimeB = createDurableMissionRuntime({
      missions: createPgMissionWorkflowStore(pool),
      execution: createPgDurableExecutionService(pool),
    });
    const resumed = await runtimeB.resumeAfterRestart({
      workflowId,
      observedDigest: digest,
      nowIso: "2026-11-20T07:10:00.000Z",
    });
    expect(resumed.outcome).toBe("VERIFIED");
    expect(resumed.applyAttemptCount).toBe(1);

    const applyRows = await pool.query(
      `SELECT COUNT(*)::int AS n FROM core.effect_attempts
       WHERE operation_id = $1 AND phase = 'apply' AND status = 'succeeded'`,
      [operationId],
    );
    expect(applyRows.rows[0].n).toBe(1);
  });
});
