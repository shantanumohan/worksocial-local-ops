/**
 * Apply database/migrations/*.sql in order.
 * Usage: pnpm db:migrate
 * Requires DATABASE_URL or WORKSOCIAL_DATABASE_URL.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPgPool, resolveDatabaseUrl } from "../packages/persistence/dist/pg/client.js";
import { runMigrations } from "../packages/persistence/dist/pg/migrate.js";

async function main(): Promise<void> {
  const url = resolveDatabaseUrl();
  if (!url) {
    console.error(
      JSON.stringify({
        ok: false,
        error: "DATABASE_URL or WORKSOCIAL_DATABASE_URL is required",
      }),
    );
    process.exit(1);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(here, "../database/migrations");
  const pool = createPgPool({ connectionString: url });
  try {
    const result = await runMigrations({ pool, migrationsDir });
    console.log(
      JSON.stringify(
        {
          ok: true,
          migrationsDir: result.migrationsDir,
          applied: result.applied,
          skipped: result.skipped,
        },
        null,
        2,
      ),
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exit(1);
});
