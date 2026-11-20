/**
 * Ordered SQL migration runner for database/migrations/*.sql.
 * Tracks applied files in core.schema_migrations (bootstrapped first).
 */

import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { PgPool, PgQueryable } from "./client.js";

export type MigrationResult = {
  applied: string[];
  skipped: string[];
  migrationsDir: string;
};

const BOOTSTRAP_SQL = `
CREATE SCHEMA IF NOT EXISTS core;
CREATE TABLE IF NOT EXISTS core.schema_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now(),
  checksum   text NOT NULL
);
`;

export function defaultMigrationsDir(fromCwd = process.cwd()): string {
  // Prefer repo-root database/migrations whether cwd is root or a package.
  const candidates = [
    path.resolve(fromCwd, "database/migrations"),
    path.resolve(fromCwd, "../../database/migrations"),
    path.resolve(fromCwd, "../../../database/migrations"),
  ];
  return candidates[0]!;
}

function checksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

export async function listMigrationFiles(migrationsDir: string): Promise<string[]> {
  const entries = await readdir(migrationsDir);
  return entries
    .filter((name) => /^\d+_.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));
}

export async function ensureMigrationTable(db: PgQueryable): Promise<void> {
  await db.query(BOOTSTRAP_SQL);
}

export async function appliedMigrations(
  db: PgQueryable,
): Promise<Map<string, string>> {
  await ensureMigrationTable(db);
  const result = await db.query<{ filename: string; checksum: string }>(
    `SELECT filename, checksum FROM core.schema_migrations ORDER BY filename`,
  );
  return new Map(result.rows.map((row) => [row.filename, row.checksum]));
}

export async function runMigrations(options: {
  pool: PgPool;
  migrationsDir: string;
}): Promise<MigrationResult> {
  const { pool, migrationsDir } = options;
  const files = await listMigrationFiles(migrationsDir);
  const already = await appliedMigrations(pool);
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const filename of files) {
    const fullPath = path.join(migrationsDir, filename);
    const contents = await readFile(fullPath, "utf8");
    const sum = checksum(contents);
    const prior = already.get(filename);
    if (prior) {
      if (prior !== sum) {
        throw new Error(
          `Migration checksum mismatch for ${filename}: applied=${prior} current=${sum}`,
        );
      }
      skipped.push(filename);
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(contents);
      await client.query(
        `INSERT INTO core.schema_migrations (filename, checksum) VALUES ($1, $2)`,
        [filename, sum],
      );
      await client.query("COMMIT");
      applied.push(filename);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return { applied, skipped, migrationsDir };
}
