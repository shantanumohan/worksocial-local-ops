/**
 * test:security — offline ownership / auth / lease gate suite.
 * Exits 0 when implemented regressions pass. Does not claim product acceptance,
 * credential-rotation completion, Windows host bind, or live penetration testing.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const securityDir = path.resolve(here, "../tests/security");

const result = spawnSync("pnpm", ["exec", "vitest", "run"], {
  cwd: securityDir,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const code = result.status === null ? 1 : result.status;
const report = {
  suite: "test:security",
  status: code === 0 ? "PASS" : "FAIL",
  implemented: true,
  productionActivated: false,
  releaseGateEligible: false,
  r1CompleteClaimed: false,
  externalEffects: "NONE",
  coverage:
    "process ownership fail-closed + host lease singleton + session/CSRF/origin + standing authority + HTTP 401/CSRF/stop-switch",
  note: "Offline security gate regressions for gates already in host+authority. Not a pen-test or catalog VERIFIED claim.",
};

if (code === 0) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error(JSON.stringify(report, null, 2));
}
process.exit(code);
