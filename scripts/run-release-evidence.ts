/**
 * release:evidence — acceptance evidence compiler path (M9).
 * Compiles redacted fixture evidence for selected catalog cases.
 * Exits 0 when fixture evidence is compiled with ACCEPTED+artifact.
 * Never marks live VERIFIED. Does not claim R1-complete or 72h pilot MET.
 * Writes unique per-run artifacts plus stable matrix aliases.
 */

import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
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
  const { createFileSoakStore, atomicWriteEvidenceJson } =
    await import(persistenceUrl);
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
      note: "Fixture evidence only. ACCEPTED ≠ sandbox/prod VERIFIED. T-X066 via backup/omit-receipt; T-F24/T-US-047 via recover/rotate/reconcile; T-US-002/T-X002 via competing-supervisor lease; T-X018/T-US-054 via self-approval rejected; T-X073 via offboard ACTIVE_TOKEN residual; T-US-060 via emergency stop at commit; T-X005 via forged browser role ignored; T-X006 via cross-workspace reference denied; T-X019/T-US-036 via approved payload edit invalidated; T-X029 via explicit rebind; T-US-057 via cross-workspace resource substitution; T-US-024 via agent cannot widen grant; T-US-042/T-X057 via repair weaken test rejected; T-US-044/T-X053 via takeover cancels unsent; T-US-018/T-X037 via EVAL_ONLY operational tool forbidden; T-X058 via repair attempt limit escalated; T-X069 via imported doc quarantined; T-X038 via eval no-grounding; T-X039/T-US-058 via metric denominators honest; T-US-046/T-X048 via hard search constraints; T-US-010/T-X033 via GSC omitted rows; T-US-008/T-X032 via GA4 debug not delivered; T-X031 via wrong property kind; T-US-040/T-X049 via thank-you without CRM; T-X017 via stop-after-dispatch reconcile; T-X024 via old fence after reassignment; T-X011 via output bomb bounded/quarantined; T-X003 via symlink escape after root verification; T-X050 via public synthetic flag requires server grant; T-X010 via malicious prompt no shell injection; T-X009 via CLI error despite exit 0. T-X015 via DST recurring schedule no duplicates. T-X001 via host-sleep monitoring coverage-gap coalesce; T-X021 via concurrent idempotent release. T-X008 via fact changes after review stale; T-X012 via orphan worker deadline tree stopped; T-X007 via wrong CMS environment no production op; T-X016 via stop before dispatch no mutation; T-X022 via idempotency key payload mismatch. T-X063 via indirect prompt-injection exfil denied; T-X013 via replay historical no repeat I/O. T-X004 via disk-full evidence no partial completed. T-X043 via optimization breaks CTA journey fails. T-X026 via concurrent final budget reservation cap. T-X052 via synthetic conversion contamination excluded. T-X054 via reply sent CRM reconciles no resend. T-X055 via unknown policy question escalates without promise. T-X056 via automated response loop bounded handoff. T-X059/T-US-038 via duplicate platform attribution one booking. T-X060 via currency/timezone mismatch no silent sum. T-X070 via validated payload not collected separate failure states. T-X044 via unlicensed venue media publish blocked; T-X045 via partial campaign destinations per-state. T-US-006 via unbound write path fail closed. T-X023 via eventual consistency false not-found. T-US-052 via mocked connector not production-ready; T-X030 via rate-limit bounded backoff preserves deadline. T-X040 via low-sample trend spike insufficient evidence. T-US-012 via Google Ads test vs production access separated. T-US-015 via connect Claude Code + test API EVAL_ONLY. T-US-017 via connect Gemini evaluation EVAL_ONLY. T-US-019 via map CRM/forms/booking failure/recovery. T-US-020 via synthetic leads classified no commerce pollution. T-US-021 via connect local/social/inbox test artifact and capability. T-US-022 via unsupported destination capabilities respected. T-US-023 via standing autonomy grant control receipts. T-US-025 via launch workstream schedule mission outcome. T-US-026 via missed schedule coalesce no burst republish. T-US-027 via demand page improvement release receipt. T-US-028 via keyword proliferation one useful update. T-US-029 via campaign manifest distribution. T-US-030 via uncertain post reconcile before retry. T-US-031 via paid-media recommendation mutation or failure. Not R1-complete.",
    };
    const ledgerWrite = atomicWriteEvidenceJson({
      filePath: ledgerPath,
      value: ledger,
    });
    if (!ledgerWrite.ok) {
      throw new Error(
        `release:evidence ledger write failed (${ledgerWrite.code}): ${ledgerWrite.reason}`,
      );
    }

    for (const art of stableArtifacts) {
      const artWrite = atomicWriteEvidenceJson({
        filePath: join(outDir, `${art.artifactId}.json`),
        value: art,
      });
      if (!artWrite.ok) {
        throw new Error(
          `release:evidence artifact ${art.artifactId} write failed (${artWrite.code}): ${artWrite.reason}`,
        );
      }
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
    const hasTx011Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X011",
    );
    const hasTx003Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X003",
    );
    const hasTx050Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X050",
    );
    const hasTx010Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X010",
    );
    const hasTx009Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X009",
    );
    const hasTx015Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X015",
    );
    const hasTx001Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X001",
    );
    const hasTx021Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X021",
    );
    const hasTx008Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X008",
    );
    const hasTx012Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X012",
    );
    const hasTx007Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X007",
    );
    const hasTx016Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X016",
    );
    const hasTx022Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X022",
    );
    const hasTx065Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X065",
    );
    const hasTx063Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X063",
    );
    const hasTx013Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X013",
    );
    const hasTx027Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X027",
    );
    const hasTx004Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X004",
    );
    const hasTx025Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X025",
    );
    const hasTx043Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X043",
    );
    const hasTx026Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X026",
    );
    const hasTx052Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X052",
    );
    const hasTx054Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X054",
    );
    const hasTx055Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X055",
    );
    const hasTx056Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X056",
    );
    const hasTx059Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X059",
    );
    const hasTus038Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-038",
    );
    const hasTx060Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X060",
    );
    const hasTx070Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X070",
    );
        const hasTx028Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X028",
    );
    const hasTx044Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X044",
    );
    const hasTx045Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X045",
    );
    const hasUs006Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-006",
    );
    const hasTx023Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X023",
    );
    const hasUs052Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-052",
    );
    const hasTx030Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X030",
    );
    const hasTx040Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-X040",
    );
    const hasUs012Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-012",
    );
    const hasUs015Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-015",
    );
    const hasUs017Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-017",
    );
    const hasUs019Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-019",
    );
    const hasUs020Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-020",
    );
    const hasUs021Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-021",
    );
    const hasUs022Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-022",
    );
    const hasUs023Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-023",
    );
    const hasUs025Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-025",
    );
    const hasUs026Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-026",
    );
    const hasUs027Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-027",
    );
    const hasUs028Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-028",
    );
    const hasUs029Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-029",
    );
    const hasUs030Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-030",
    );
    const hasUs031Accepted = accepted.some(
      (c: { caseId: string }) => c.caseId === "T-US-031",
    );
    const expectedAccepted = [
      "T-F24",
      "T-US-002",
      "T-US-006",
      "T-US-008",
      "T-US-010",
      "T-US-012",
      "T-US-015",
      "T-US-017",
      "T-US-018",
      "T-US-019",
      "T-US-020",
      "T-US-021",
      "T-US-022",
      "T-US-023",
      "T-US-024",
      "T-US-025",
      "T-US-026",
      "T-US-027",
      "T-US-028",
      "T-US-029",
      "T-US-030",
      "T-US-031",
      "T-US-036",
      "T-US-038",
      "T-US-040",
      "T-US-042",
      "T-US-044",
      "T-US-046",
      "T-US-047",
      "T-US-048",
      "T-US-052",
      "T-US-054",
      "T-US-057",
      "T-US-058",
      "T-US-060",
      "T-X001",
      "T-X002",
      "T-X003",
      "T-X004",
      "T-X005",
      "T-X006",
      "T-X007",
      "T-X008",
      "T-X009",
      "T-X010",
      "T-X011",
      "T-X012",
      "T-X013",
      "T-X014",
      "T-X015",
      "T-X016",
      "T-X017",
      "T-X018",
      "T-X019",
      "T-X020",
      "T-X021",
      "T-X022",
      "T-X023",
      "T-X024",
      "T-X025",
      "T-X026",
      "T-X027",
      "T-X028",
      "T-X029",
      "T-X030",
      "T-X031",
      "T-X032",
      "T-X033",
      "T-X037",
      "T-X038",
      "T-X039",
      "T-X040",
      "T-X043",
      "T-X044",
      "T-X045",
      "T-X048",
      "T-X049",
      "T-X050",
      "T-X052",
      "T-X053",
      "T-X054",
      "T-X055",
      "T-X056",
      "T-X057",
      "T-X058",
      "T-X059",
      "T-X060",
      "T-X063",
      "T-X065",
      "T-X066",
      "T-X069",
      "T-X070",
      "T-X073"
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
        hasTx004Accepted &&
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
        hasTx011Accepted &&
        hasTx003Accepted &&
        hasTx050Accepted &&
        hasTx010Accepted &&
        hasTx009Accepted &&
        hasTx015Accepted &&
        hasTx001Accepted &&
        hasTx021Accepted &&
        hasTx008Accepted &&
        hasTx012Accepted &&
        hasTx007Accepted &&
        hasTx016Accepted &&
        hasTx022Accepted &&
        hasTx065Accepted &&
        hasTx063Accepted &&
        hasTx013Accepted &&
        hasTx027Accepted &&
        hasTx025Accepted &&
        hasTx043Accepted &&
        hasTx026Accepted &&
        hasTx052Accepted &&
        hasTx054Accepted &&
        hasTx055Accepted &&
        hasTx056Accepted &&
        hasTx059Accepted &&
        hasTus038Accepted &&
        hasTx060Accepted &&
        hasTx070Accepted &&
        hasTx028Accepted &&
        hasTx044Accepted &&
        hasTx045Accepted &&
        hasUs006Accepted &&
        hasTx023Accepted &&
        hasUs052Accepted &&
        hasTx030Accepted &&
        hasTx040Accepted &&
        hasUs012Accepted &&
        hasUs015Accepted &&
        hasUs017Accepted &&
        hasUs019Accepted &&
        hasUs020Accepted &&
        hasUs021Accepted &&
        hasUs022Accepted &&
        hasUs023Accepted &&
        hasUs025Accepted &&
        hasUs026Accepted &&
        hasUs027Accepted &&
        hasUs028Accepted &&
        hasUs029Accepted &&
        hasUs030Accepted &&
        hasUs031Accepted &&
        accepted.length === 93 &&
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
        "Fixture acceptance evidence compiled. Pilot gate NOT_MET for short soaks. Includes T-US-031 paid-media recommendation mutation-or-failure fixture ACCEPTED (total 93). Live VERIFIED forbidden. Not R1-complete.",
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
