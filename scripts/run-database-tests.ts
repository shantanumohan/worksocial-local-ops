/**
 * Postgres durable-execution suite (M2 / NEXT-08–09).
 * Requires DATABASE_URL or WORKSOCIAL_DATABASE_URL. Fails closed if unset.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url =
  process.env.WORKSOCIAL_DATABASE_URL ?? process.env.DATABASE_URL ?? "";

if (!url) {
  console.error(
    JSON.stringify(
      {
        suite: "test:database",
        status: "FAILED",
        implemented: true,
        productionActivated: false,
        releaseGateEligible: false,
        message:
          "DATABASE_URL or WORKSOCIAL_DATABASE_URL is required for durable execution tests",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

const here = path.dirname(fileURLToPath(import.meta.url));
const persistenceDir = path.resolve(here, "../packages/persistence");

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "src/durable-execution.pg.test.ts"],
  {
    cwd: persistenceDir,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status === null ? 1 : result.status);
