/**
 * recovery:rehearse — fixture soak / crash-restart recovery harness (M9).
 * Exits 0 only when all soak proofs pass. Does not claim 72h pilot or R1-complete.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const persistenceUrl = pathToFileURL(
  join(here, "../packages/persistence/dist/index.js"),
).href;
const soakUrl = pathToFileURL(join(here, "../services/soak/dist/index.js")).href;

async function main(): Promise<void> {
  const { createFileSoakStore } = await import(persistenceUrl);
  const { createSoakService } = await import(soakUrl);

  const dir = mkdtempSync(join(tmpdir(), "ws-recovery-rehearse-"));
  try {
    const soak = createSoakService(createFileSoakStore(dir));
    // Pin harness clock (same Saturday ISO as release:evidence / contract).
    // Wall-clock weekday afternoons fall outside America/New_York after-hours
    // coverage windows and flake inbox proofs (T-US-004 / T-X053–056 / T-X055).
    const result = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T19:00:00.000Z",
    });
    const report = {
      suite: "recovery:rehearse",
      status: result.ok ? "PASS" : "FAIL",
      implemented: true,
      productionActivated: false,
      releaseGateEligible: false,
      r1CompleteClaimed: false,
      pilotGate: result.run.pilotGate.status,
      proofCount: result.run.proofs.length,
      proofsPassed: result.run.proofs.filter((p: { passed: boolean }) => p.passed)
        .length,
      acceptedCases: result.run.caseResults
        .filter((c: { status: string }) => c.status === "ACCEPTED")
        .map((c: { caseId: string }) => c.caseId),
      externalEffects: "NONE",
      liveWiring: result.run.liveWiring,
      chatgptAds: result.run.chatgptAds,
      note: result.note,
      message:
        "Fixture soak recovery rehearsal. Pilot gate uses server observations; 72h required for MET. Not R1-complete.",
    };
    if (!result.ok) {
      console.error(JSON.stringify(report, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(report, null, 2));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        suite: "recovery:rehearse",
        status: "FAIL",
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
