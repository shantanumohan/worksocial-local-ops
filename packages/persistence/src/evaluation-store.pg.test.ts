/**
 * Postgres evaluation store: persistence + restart without claiming live VERIFIED.
 * Requires DATABASE_URL or WORKSOCIAL_DATABASE_URL.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  EvalCapability,
  EvalProvider,
  EvalRunStatus,
  createEvalConnection,
  evalChatGptAdsProbe,
} from "@worksocial/domain";
import { createPgEvaluationStore } from "./evaluation-store.js";
import type { PgPool } from "./pg/client.js";
import {
  createMigratedTestPool,
  pgConfigured,
} from "./pg-test-harness.js";

const describePg = pgConfigured() ? describe : describe.skip;

async function truncateEvalTables(pool: PgPool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      journey.eval_runs,
      journey.eval_connections,
      journey.eval_suites
    RESTART IDENTITY CASCADE
  `);
  await pool.query(`
    UPDATE journey.eval_state
    SET budget_json = jsonb_build_object(
      'dayKey', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
      'currency', 'USD',
      'limitMinor', 5000,
      'reservedMinor', 0,
      'settledMinor', 0,
      'openReservations', '{}'::jsonb,
      'settledReservations', '{}'::jsonb
    ),
    updated_at = now()
    WHERE singleton_id = 'default'
  `);
}

describePg("evaluation store (postgres)", () => {
  let pool: PgPool;
  const now = "2026-11-21T22:10:00.000Z";

  beforeAll(async () => {
    pool = await createMigratedTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateEvalTables(pool);
  });

  it("persists suite/run across store instances (restart)", async () => {
    const suffix = randomBytes(3).toString("hex");
    const suiteId = `suite-${suffix}`;
    const runId = `run-${suffix}`;

    const first = createPgEvaluationStore(pool);
    await first.upsertSuite({
      suiteId,
      title: "Fixture golden",
      cases: [
        {
          caseId: "c1",
          prompt: "hours?",
          expectedFactIds: ["f1"],
          requiresGrounding: true,
          acceptanceCaseId: null,
        },
      ],
      fixtureOnly: true,
      createdAtIso: now,
    });
    await first.upsertConnection(
      createEvalConnection({
        connectionId: `conn-${suffix}`,
        provider: EvalProvider.CLAUDE,
        displayName: "Claude EVAL_ONLY",
        nowIso: now,
      }),
    );
    await first.addRun({
      runId,
      suiteId,
      provider: EvalProvider.CLAUDE,
      capability: EvalCapability.EVAL_ONLY,
      status: EvalRunStatus.COMPLETED,
      reservationId: `res-${suffix}`,
      reservedMinor: 200,
      settledMinor: 150,
      results: [
        {
          caseId: "c1",
          verdict: "pass",
          citedFactIds: ["f1"],
          supportedCitedFactIds: ["f1"],
          groundingUsed: true,
          reasons: ["fixture"],
          toolAttemptsBlocked: [],
        },
      ],
      fixtureOnly: true,
      chatgptAdsDecision: evalChatGptAdsProbe(),
      createdAtIso: now,
      completedAtIso: now,
    });
    await first.update((s) => ({
      ...s,
      budget: {
        ...s.budget,
        settledMinor: 150,
        reservedMinor: 0,
      },
      updatedAtIso: now,
    }));

    // New store instance = process restart against same DB.
    const second = createPgEvaluationStore(pool);
    const state = await second.read();
    expect(state.suites.map((s) => s.suiteId)).toContain(suiteId);
    expect(state.runs.map((r) => r.runId)).toContain(runId);
    expect(state.connections).toHaveLength(1);
    expect(state.budget.settledMinor).toBe(150);
    expect(state.liveEvalWiring).toBe("NOT_WIRED");
    expect(state.chatgptAdsWiring).toBe("NOT_WIRED");

    const run = state.runs.find((r) => r.runId === runId)!;
    expect(run.fixtureOnly).toBe(true);
    expect(run.chatgptAdsDecision.allowed).toBe(false);
    expect(run.capability).toBe("EVAL_ONLY");

    const status = await second.status();
    expect(status.backend).toBe("postgres");
    expect(status.runCount).toBeGreaterThanOrEqual(1);
    expect(status.liveEvalWiring).toBe("NOT_WIRED");
    expect(status.chatgptAdsWiring).toBe("NOT_WIRED");
    // Honesty: fixture persistence ≠ live VERIFIED / catalog ACCEPTED.
    expect(status.honestNote).toMatch(/ACCEPTED≠VERIFIED|NOT_RUN|NOT_WIRED/);
  });

  it("forces Ads blocked even if stored JSON claimed allowed", async () => {
    const suiteId = `suite-ads-${randomBytes(2).toString("hex")}`;
    const store = createPgEvaluationStore(pool);
    await store.upsertSuite({
      suiteId,
      title: "Ads honesty",
      cases: [],
      fixtureOnly: true,
      createdAtIso: now,
    });
    await pool.query(
      `INSERT INTO journey.eval_runs (
         run_id, suite_id, provider, capability, status,
         reservation_id, reserved_minor, settled_minor, results,
         fixture_only, chatgpt_ads_json, created_at, completed_at
       ) VALUES (
         $1, $2, 'claude', 'EVAL_ONLY', 'completed',
         null, 0, 0, '[]'::jsonb,
         true,
         $3::jsonb,
         $4::timestamptz, $4::timestamptz
       )`,
      [
        `run-ads-${randomBytes(2).toString("hex")}`,
        suiteId,
        JSON.stringify({
          allowed: true,
          code: "ADS_ACCESS_GRANTED_FIXTURE",
          reasons: ["tampered"],
          environment: "FIXTURE",
        }),
        now,
      ],
    );

    const runs = await store.listRuns();
    expect(runs[0]?.chatgptAdsDecision.allowed).toBe(false);
    expect((await store.read()).chatgptAdsWiring).toBe("NOT_WIRED");
  });
});
