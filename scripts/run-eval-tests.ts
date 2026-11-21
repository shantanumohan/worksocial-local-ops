/**
 * test:eval — offline EVAL_ONLY isolation suite (AA-20).
 * Exits 0 when isolation proofs pass. Does not claim live fleet, Ads, or 159 VERIFIED.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const evalDir = path.resolve(here, "../tests/eval");

const result = spawnSync("pnpm", ["exec", "vitest", "run"], {
  cwd: evalDir,
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

const code = result.status === null ? 1 : result.status;
const report = {
  suite: "test:eval",
  status: code === 0 ? "PASS" : "FAIL",
  implemented: true,
  productionActivated: false,
  releaseGateEligible: false,
  r1CompleteClaimed: false,
  externalEffects: "NONE",
  liveEvalFleet: "NOT_WIRED",
  chatgptAds: "NOT_WIRED",
  acceptanceCatalog: "NOT_RUN",
  note: "Offline EVAL_ONLY isolation suite. Fixture ≠ live. Learning cannot expand effects. Not product acceptance.",
};

if (code === 0) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error(JSON.stringify(report, null, 2));
}
process.exit(code);
