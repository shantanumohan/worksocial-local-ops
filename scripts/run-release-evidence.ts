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
      note: "Fixture evidence only. ACCEPTED ≠ sandbox/prod VERIFIED. T-X066 via backup/omit-receipt; T-F24/T-US-047 via recover/rotate/reconcile; T-US-002/T-X002 via competing-supervisor lease; T-X018/T-US-054 via self-approval rejected; T-X073 via offboard ACTIVE_TOKEN residual; T-US-060 via emergency stop at commit; T-X005 via forged browser role ignored; T-X006 via cross-workspace reference denied; T-X019/T-US-036 via approved payload edit invalidated; T-X029 via explicit rebind; T-US-057 via cross-workspace resource substitution; T-US-024 via agent cannot widen grant; T-US-042/T-X057 via repair weaken test rejected; T-US-044/T-X053 via takeover cancels unsent; T-US-018/T-X037 via EVAL_ONLY operational tool forbidden; T-X058 via repair attempt limit escalated; T-X069 via imported doc quarantined; T-X038 via eval no-grounding; T-X039/T-US-058 via metric denominators honest; T-US-046/T-X048 via hard search constraints; T-US-010/T-X033 via GSC omitted rows; T-US-008/T-X032 via GA4 debug not delivered; T-X031 via wrong property kind; T-US-040/T-X049 via thank-you without CRM; T-X017 via stop-after-dispatch reconcile; T-X024 via old fence after reassignment. Not R1-complete.",
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
    const hasTf24Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-F24",
    );
    const hasUs047Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-047",
    );
    const hasUs002Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-002",
    );
    const hasTx002Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X002",
    );
    const hasTx018Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X018",
    );
    const hasUs054Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-054",
    );
    const hasTx073Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X073",
    );
    const hasUs060Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-060",
    );
    const hasTx005Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X005",
    );
    const hasTx006Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X006",
    );
    const hasTx019Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X019",
    );
    const hasUs036Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-036",
    );
    const hasTx029Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X029",
    );
    const hasUs057Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-057",
    );
    const hasUs024Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-024",
    );
    const hasUs042Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-042",
    );
    const hasTx057Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X057",
    );
    const hasUs044Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-044",
    );
    const hasTx053Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X053",
    );
    const hasUs018Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-018",
    );
    const hasTx037Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X037",
    );
    const hasTx058Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X058",
    );
    const hasTx069Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X069",
    );
    const hasTx038Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X038",
    );
    const hasTx039Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X039",
    );
    const hasUs058Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-058",
    );
    const hasUs046Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-046",
    );
    const hasTx048Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X048",
    );
    const hasUs010Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-010",
    );
    const hasTx033Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X033",
    );
    const hasUs008Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-008",
    );
    const hasTx032Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X032",
    );
    const hasTx031Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X031",
    );
    const hasUs040Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-040",
    );
    const hasTx049Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X049",
    );
    const hasTx017Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X017",
    );
    const hasTx024Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X024",
    );
    const expectedAccepted = [
      "T-F24",
      "T-US-002",
      "T-US-008",
      "T-US-010",
      "T-US-018",
      "T-US-024",
      "T-US-036",
      "T-US-040",
      "T-US-042",
      "T-US-044",
      "T-US-046",
      "T-US-047",
      "T-US-048",
      "T-US-054",
      "T-US-057",
      "T-US-058",
      "T-US-060",
      "T-X002",
      "T-X005",
      "T-X006",
      "T-X014",
      "T-X017",
      "T-X018",
      "T-X019",
      "T-X020",
      "T-X024",
      "T-X029",
      "T-X031",
      "T-X032",
      "T-X033",
      "T-X037",
      "T-X038",
      "T-X039",
      "T-X048",
      "T-X049",
      "T-X053",
      "T-X057",
      "T-X058",
      "T-X066",
      "T-X069",
      "T-X073",
    ].sort();
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
        hasTf24Accepted &&
        hasUs047Accepted &&
        hasUs002Accepted &&
        hasTx002Accepted &&
        hasTx018Accepted &&
        hasUs054Accepted &&
        hasTx073Accepted &&
        hasUs060Accepted &&
        hasTx005Accepted &&
        hasTx006Accepted &&
        hasTx019Accepted &&
        hasUs036Accepted &&
        hasTx029Accepted &&
        hasUs057Accepted &&
        hasUs024Accepted &&
        hasUs042Accepted &&
        hasTx057Accepted &&
        hasUs044Accepted &&
        hasTx053Accepted &&
        hasUs018Accepted &&
        hasTx037Accepted &&
        hasTx058Accepted &&
        hasTx069Accepted &&
        hasTx038Accepted &&
        hasTx039Accepted &&
        hasUs058Accepted &&
        hasUs046Accepted &&
        hasTx048Accepted &&
        hasUs010Accepted &&
        hasTx033Accepted &&
        hasUs008Accepted &&
        hasTx032Accepted &&
        hasTx031Accepted &&
        hasUs040Accepted &&
        hasTx049Accepted &&
        hasTx017Accepted &&
        hasTx024Accepted &&
        accepted.length === 41 &&
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
        "Fixture acceptance evidence compiled. Pilot gate NOT_MET for short soaks. Includes T-X024 old fence after reassignment fixture ACCEPTED. Live VERIFIED forbidden. Not R1-complete.",
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
