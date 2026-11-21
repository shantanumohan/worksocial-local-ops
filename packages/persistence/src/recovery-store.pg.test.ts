/**
 * Postgres recovery store: classification persistence + honesty seals.
 * Requires DATABASE_URL or WORKSOCIAL_DATABASE_URL.
 */

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  LiveRecoveryClaim,
  OutagePlane,
  RecoveryObservationClass,
  RecoveryRunStatus,
} from "@worksocial/domain";
import { createPgRecoveryStore } from "./recovery-store.js";
import type { PgPool } from "./pg/client.js";
import { createMigratedTestPool, pgConfigured } from "./pg-test-harness.js";

const describePg = pgConfigured() ? describe : describe.skip;

async function truncateRecoveryTables(pool: PgPool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      recovery_timeline_events,
      recovery_queued_work,
      recovery_capability_stops,
      recovery_runs,
      recovery_artifacts
    RESTART IDENTITY CASCADE
  `);
  await pool.query(`
    UPDATE recovery_evidence_state
    SET live_recovery_claim = 'NOT_RUN', updated_at = now()
    WHERE singleton_id = 'default'
  `);
}

describePg("recovery store (postgres)", () => {
  let pool: PgPool;
  const now = "2026-11-21T23:10:00.000Z";

  beforeAll(async () => {
    pool = await createMigratedTestPool();
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateRecoveryTables(pool);
  });

  it("persists classifications across store instances (restart)", async () => {
    const suffix = randomBytes(3).toString("hex");
    const first = createPgRecoveryStore(pool);

    await first.appendTimeline({
      eventId: `evt-${suffix}`,
      recordedAtIso: now,
      plane: OutagePlane.HOST,
      classification: RecoveryObservationClass.ACTIVE_INCIDENT,
      summary: "fixture host outage",
      sourceKind: "fixture",
      relatedCapabilityIds: ["cms_publish"],
      queuedWorkCount: 1,
      evidenceRefs: [`fixture://${suffix}`],
    });
    await first.appendTimeline({
      eventId: `evt-stale-${suffix}`,
      recordedAtIso: now,
      plane: OutagePlane.HOST,
      classification: RecoveryObservationClass.STALE_OBSERVATION,
      summary: "stale heartbeat",
      sourceKind: "heartbeat",
      relatedCapabilityIds: [],
      queuedWorkCount: 0,
      evidenceRefs: [],
    });
    await first.appendTimeline({
      eventId: `evt-uro-${suffix}`,
      recordedAtIso: now,
      plane: OutagePlane.PROVIDER,
      classification: RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME,
      summary: "unknown remote",
      sourceKind: "effect_ledger",
      relatedCapabilityIds: ["gbp_publish"],
      queuedWorkCount: 1,
      evidenceRefs: [],
    });
    await first.addRun({
      runId: `run-${suffix}`,
      scenarioId: "host_outage_queued_work",
      status: RecoveryRunStatus.PASSED,
      classification: RecoveryObservationClass.ACTIVE_INCIDENT,
      timelineEventIds: [`evt-${suffix}`],
      capabilityStopIds: [],
      queuedWorkIds: [],
      artifactId: null,
      details: ["fixture"],
      liveRecoveryVerified: false,
      liveRecoveryClaim: LiveRecoveryClaim.NOT_RUN,
      externalEffects: "NONE",
      productionActivated: false,
      startedAtIso: now,
      endedAtIso: now,
    });

    const second = createPgRecoveryStore(pool);
    const status = await second.status();
    expect(status.backend).toBe("postgres");
    expect(status.classCounts.ACTIVE_INCIDENT).toBe(1);
    expect(status.classCounts.STALE_OBSERVATION).toBe(1);
    expect(status.classCounts.UNKNOWN_REMOTE_OUTCOME).toBe(1);
    expect(status.liveRecoveryClaim).toBe("NOT_RUN");
    expect(status.liveWiring.liveProviderRevocation).toBe("NOT_WIRED");
    expect(status.externalEffects).toBe("NONE");
    expect(status.honestNote).toMatch(/NOT_RUN|NOT_WIRED/);

    const runs = await second.listRuns();
    expect(runs[0]?.liveRecoveryVerified).toBe(false);
    expect(runs[0]?.liveRecoveryClaim).toBe("NOT_RUN");
  });

  it("forces liveRecoveryClaim NOT_RUN even if row claimed VERIFIED", async () => {
    const suffix = randomBytes(2).toString("hex");
    const store = createPgRecoveryStore(pool);
    await pool.query(
      `INSERT INTO recovery_runs (
         run_id, scenario_id, status, classification,
         timeline_event_ids, capability_stop_ids, queued_work_ids, artifact_id,
         details, live_recovery_verified, live_recovery_claim, external_effects,
         production_activated, started_at_iso, ended_at_iso
       ) VALUES (
         $1, 'host_outage_queued_work', 'PASSED', 'ACTIVE_INCIDENT',
         '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, null,
         '[]'::jsonb, true, 'VERIFIED', 'CLAIMED',
         true, $2::timestamptz, $2::timestamptz
       )`,
      [`run-tamper-${suffix}`, now],
    );

    const runs = await store.listRuns();
    expect(runs[0]?.liveRecoveryVerified).toBe(false);
    expect(runs[0]?.liveRecoveryClaim).toBe("NOT_RUN");
    expect(runs[0]?.externalEffects).toBe("NONE");
    expect(runs[0]?.productionActivated).toBe(false);
    expect((await store.read()).liveRecoveryClaim).toBe("NOT_RUN");
  });
});
