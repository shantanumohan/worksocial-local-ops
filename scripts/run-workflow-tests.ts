/**
 * Durable mission / Temporal-binding suite (M2 / NEXT-10 + Temporal wiring).
 * Always runs offline unit tests + Temporal local test-server crash/restart suite.
 * When DATABASE_URL is set, also runs PG restart tests.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const workerDir = path.resolve(here, "../services/workflow-worker");

function runVitest(args: string[]): number {
  const result = spawnSync("pnpm", ["exec", "vitest", "run", ...args], {
    cwd: workerDir,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status === null ? 1 : result.status;
}

const unit = runVitest([
  "src/mission-enqueue.test.ts",
  "src/temporal-binding.test.ts",
  "src/durable-mission.test.ts",
]);
if (unit !== 0) {
  process.exit(unit);
}

const temporal = runVitest([
  "--config",
  "vitest.temporal.config.ts",
  "src/temporal-mission.test.ts",
]);
if (temporal !== 0) {
  process.exit(temporal);
}

const url = process.env.WORKSOCIAL_DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.log(
    JSON.stringify({
      suite: "test:workflow",
      status: "PARTIAL",
      note: "Offline + Temporal local test-server suites passed. Set DATABASE_URL to also run durable mission PG restart tests.",
      temporal: "TEMPORAL_TEST_SERVER",
    }),
  );
  process.exit(0);
}

const pg = runVitest(["src/durable-mission.pg.test.ts"]);
process.exit(pg);
