/**
 * release:evidence — acceptance evidence compiler path (M9).
 * Compiles redacted fixture evidence for selected catalog cases.
 * Exits 0 when fixture evidence is compiled with ACCEPTED+artifact.
 * Never marks live VERIFIED. Does not claim R1-complete or 72h pilot MET.
 * Writes unique per-run artifacts plus stable matrix aliases.
 */

import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const persistenceUrl = pathToFileURL(
  join(here, "../packages/persistence/dist/index.js"),
).href;
const soakUrl = pathToFileURL(join(here, "../services/soak/dist/index.js")).href;
const domainUrl = pathToFileURL(
  join(here, "../packages/domain/dist/index.js"),
).href;

async function main(): Promise<void> {
  const { createFileSoakStore } = await import(persistenceUrl);
  const { createSoakService } = await import(soakUrl);
  const { stableFixtureEvidenceArtifactId } = await import(domainUrl);

  const outDir =
    process.env.WORKSOCIAL_EVIDENCE_OUT ??
    join(root, "tests", "acceptance-evidence", "fixture");
  const dir = mkdtempSync(join(tmpdir(), "ws-release-evidence-"));

  try {
    const soak = createSoakService(createFileSoakStore(dir));
    const result = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T19:00:00.000Z",
    });

    mkdirSync(outDir, { recursive: true });
    const ledgerPath = join(outDir, "evidence-ledger.json");
    const artifacts = soak.listArtifacts();

    // Stable aliases for matrix validation (canonical published package names).
    const stableArtifacts = artifacts.map(
      (art: {
        artifactId: string;
        caseId: string;
        environment: string;
        redacted: true;
        summary: string;
        proofKinds: string[];
        evidenceRef: string;
        createdAtIso: string;
        liveProviderSuccessClaimed: false;
        externalEffects: "NONE";
      }) => {
        const stableId = stableFixtureEvidenceArtifactId(art.caseId);
        return {
          ...art,
          artifactId: stableId,
          evidenceRef: `soak/evidence/${stableId}.json`,
          uniqueSourceArtifactId: art.artifactId,
        };
      },
    );

    const stableCaseResults = result.run.caseResults.map(
      (c: {
        caseId: string;
        status: string;
        environment: string;
        artifactId: string | null;
        reasons: string[];
        updatedAtIso: string;
      }) =>
        c.status === "ACCEPTED" && c.artifactId
          ? {
              ...c,
              artifactId: stableFixtureEvidenceArtifactId(c.caseId),
              uniqueSourceArtifactId: c.artifactId,
            }
          : c,
    );

    const ledger = {
      compiledAtIso: result.run.endedAtIso,
      environment: "fixture",
      r1CompleteClaimed: false,
      pilotGate: result.run.pilotGate,
      chatgptAds: result.run.chatgptAds,
      liveWiring: result.run.liveWiring,
      externalEffects: "NONE",
      cases: stableCaseResults,
      artifacts: stableArtifacts,
      uniqueRunArtifacts: artifacts,
      note: "Fixture evidence only. ACCEPTED ≠ sandbox/prod VERIFIED. T-X066 fixture ACCEPTED via backup/omit-receipt proof. Not R1-complete.",
    };
    writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2), "utf8");

    for (const art of stableArtifacts) {
      writeFileSync(
        join(outDir, `${art.artifactId}.json`),
        JSON.stringify(art, null, 2),
        "utf8",
      );
    }

    const accepted = stableCaseResults.filter(
      (c: { status: string }) => c.status === "ACCEPTED",
    );
    const missingEvidence = accepted.filter(
      (c: { artifactId: string | null }) => !c.artifactId,
    );
    const hasVerified = result.run.caseResults.some(
      (c: { status: string }) => String(c.status).toUpperCase() === "VERIFIED",
    );
    const hasTx066Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X066",
    );
    const expectedAccepted = ["T-X014", "T-X020", "T-US-048", "T-X066"].sort();
    const acceptedIds = accepted
      .map((c: { caseId: string }) => c.caseId)
      .sort();

    const report = {
      suite: "release:evidence",
      status:
        result.ok &&
        missingEvidence.length === 0 &&
        !hasVerified &&
        hasTx066Accepted &&
        accepted.length === 4 &&
        JSON.stringify(acceptedIds) === JSON.stringify(expectedAccepted)
          ? "PASS"
          : "FAIL",
      implemented: true,
      productionActivated: false,
      releaseGateEligible: false,
      r1CompleteClaimed: false,
      pilotGate: result.run.pilotGate.status,
      acceptedCaseIds: accepted.map((c: { caseId: string }) => c.caseId),
      artifactCount: stableArtifacts.length,
      ledgerPath,
      outDir,
      externalEffects: "NONE",
      message:
        "Fixture acceptance evidence compiled. Pilot gate NOT_MET for short soaks. T-X066 fixture ACCEPTED (backup/omit-receipt). Live VERIFIED forbidden. Not R1-complete.",
    };

    if (report.status !== "PASS") {
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
        suite: "release:evidence",
        status: "FAIL",
        error: err instanceof Error ? err.message : String(err),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
