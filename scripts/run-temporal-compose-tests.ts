/**
 * Temporal compose e2e runner (API → Temporal → PG).
 *
 * - CI sets WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1 so missing Temporal fails.
 * - Local/agent without Docker: suite skips honestly unless REQUIRED=1.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const integrationDir = path.resolve(here, "../tests/integration");

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "--config", "vitest.temporal-compose.config.ts"],
  {
    cwd: integrationDir,
    env: process.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  },
);

process.exit(result.status === null ? 1 : result.status);
