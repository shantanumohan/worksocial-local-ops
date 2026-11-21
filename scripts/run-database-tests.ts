/**
 * Postgres durable-execution + evaluation-store suites (M2 / AA-21).
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

const suites = [
  "src/durable-execution.pg.test.ts",
  "src/evaluation-store.pg.test.ts",
];

for (const suite of suites) {
  const result = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", suite],
    {
      cwd: persistenceDir,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );
  const code = result.status === null ? 1 : result.status;
  if (code !== 0) {
    process.exit(code);
  }
}

process.exit(0);
