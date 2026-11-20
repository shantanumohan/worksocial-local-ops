/**
 * Durable mission / Temporal-binding suite (M2 / NEXT-10).
 * Always runs offline unit tests. When DATABASE_URL is set, also runs PG restart tests.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(here, "../services/workflow-worker");

const unit = spawnSync(
  "pnpm",
  [
    "exec",
    "vitest",
    "run",
    "src/mission-enqueue.test.ts",
    "src/temporal-binding.test.ts",
    "src/durable-mission.test.ts",
  ],
  {
    cwd: workerDir,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

if (unit.status !== 0) {
  process.exit(unit.status === null ? 1 : unit.status);
}

const url = process.env.WORKSOCIAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.log(
    JSON.stringify({
      suite: "test:workflow",
      status: "PARTIAL",
      note: "Offline workflow tests passed. Set DATABASE_URL to also run durable mission PG restart tests.",
      temporal: "NOT_WIRED",
    }),
  );
  process.exit(0);
}

const pg = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "src/durable-mission.pg.test.ts"],
  {
    cwd: workerDir,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(pg.status === null ? 1 : pg.status);
