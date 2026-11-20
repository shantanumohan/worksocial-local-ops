/**
 * Shared helpers for Postgres-backed tests.
 * Skips when DATABASE_URL / WORKSOCIAL_DATABASE_URL is unset.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPgPool,
  resolveDatabaseUrl,
  runMigrations,
  type PgPool,
} from "./index.js";

export function pgConfigured(): boolean {
  return Boolean(resolveDatabaseUrl());
}

export function migrationsDirFromPackage(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../../database/migrations");
}

export async function createMigratedTestPool(): Promise<PgPool> {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL / WORKSOCIAL_DATABASE_URL required for PG tests");
  }
  const pool = createPgPool({ connectionString: url, max: 8 });
  await runMigrations({
    pool,
    migrationsDir: migrationsDirFromPackage(),
  });
  return pool;
}

export async function truncateDurableTables(pool: PgPool): Promise<void> {
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
}
