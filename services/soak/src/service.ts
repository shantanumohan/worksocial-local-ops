/**
 * M9 / NEXT-20 soak service — recovery harness + evidence compiler + owner report.
 */

import { randomUUID } from "node:crypto";
import {
  AcceptanceEnvironment,
  PILOT_SOAK_REQUIRED_MS,
  SOAK_RELATED_CASE_IDS,
  evaluatePilotGate,
  type SoakRunRecord,
} from "@worksocial/domain";
import type { SoakStore } from "@worksocial/persistence";
import { compileAcceptanceEvidence } from "./evidence-compiler.js";
import { runSoakRecoveryHarness } from "./harness.js";

export type SoakService = {
  status(): ReturnType<SoakStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    principal: "soak";
    pilotSoakRequiredMs: number;
  };
  listRuns(limit?: number): ReturnType<SoakStore["listRuns"]>;
  listArtifacts(limit?: number): ReturnType<SoakStore["listArtifacts"]>;
  listCases(limit?: number): ReturnType<SoakStore["listCases"]>;
  /**
   * Run fixture soak proofs + compile acceptance evidence.
   * Short runs leave pilotGate NOT_MET (72h required for MET).
   */
  runFixtureSoak(input?: {
    nowIso?: string;
    /** Override endedAt for pilot-gate evaluation (owner 72h soak). */
    endedAtIso?: string;
    startedAtIso?: string;
  }): Promise<{
    ok: boolean;
    run: SoakRunRecord;
    note: string;
  }>;
  ownerReport(): {
    status: ReturnType<SoakService["status"]>;
    latestRun: SoakRunRecord | null;
    acceptedCases: ReturnType<SoakStore["listCases"]>;
    note: string;
  };
};

export function createSoakService(store: SoakStore): SoakService {
  return {
    status() {
      return {
        ...store.status(),
        acceptanceCaseIds: SOAK_RELATED_CASE_IDS,
        principal: "soak",
        pilotSoakRequiredMs: PILOT_SOAK_REQUIRED_MS,
      };
    },

    listRuns(limit) {
      return store.listRuns(limit);
    },

    listArtifacts(limit) {
      return store.listArtifacts(limit);
    },

    listCases(limit) {
      return store.listCases(limit);
    },

    async runFixtureSoak(input = {}) {
      const startedAtIso = input.startedAtIso ?? input.nowIso ?? new Date().toISOString();
      const harness = await runSoakRecoveryHarness({
        stateDir: store.stateDir,
        nowIso: startedAtIso,
      });
      const endedAtIso = input.endedAtIso ?? new Date().toISOString();
      const compiled = compileAcceptanceEvidence({
        proofs: harness.proofs,
        nowIso: endedAtIso,
      });

      for (const artifact of compiled.artifacts) {
        store.addArtifact(artifact);
      }

      const pilotGate = evaluatePilotGate({
        startedAtIso,
        endedAtIso,
        proofs: harness.proofs,
      });

      const run: SoakRunRecord = {
        runId: `soak-${randomUUID()}`,
        startedAtIso,
        endedAtIso,
        durationMs: Math.max(0, Date.parse(endedAtIso) - Date.parse(startedAtIso)),
        environment: AcceptanceEnvironment.FIXTURE,
        proofs: harness.proofs,
        caseResults: compiled.caseResults,
        pilotGate,
        chatgptAds: compiled.chatgptAds,
        liveWiring: {
          cms: "NOT_WIRED",
          gsc: "NOT_WIRED",
          ga4: "NOT_WIRED",
          zoho: "NOT_WIRED",
          temporal: "NOT_WIRED",
        },
        r1CompleteClaimed: false,
        externalEffects: "NONE",
        honestNote:
          "Fixture soak only. Pilot gate requires 72h continuous window. Live providers NOT_WIRED. Not R1-complete.",
      };

      store.addRun(run);

      const ok = harness.allPassed;
      return {
        ok,
        run,
        note: [
          ok ? "Fixture soak proofs passed" : "Fixture soak proofs failed",
          `pilotGate=${pilotGate.status}`,
          `ACCEPTED cases=${compiled.caseResults.filter((c) => c.status === "ACCEPTED").length}`,
          "External effects: NONE",
          "R1-complete: not claimed",
        ].join(". "),
      };
    },

    ownerReport() {
      const runs = store.listRuns(1);
      const latestRun = runs[runs.length - 1] ?? null;
      const acceptedCases = store
        .listCases(200)
        .filter((c) => c.status === "ACCEPTED");
      return {
        status: this.status(),
        latestRun,
        acceptedCases,
        note:
          latestRun == null
            ? "No soak runs yet — run fixture soak (recovery:rehearse / POST /soak/run)."
            : `Latest pilotGate=${latestRun.pilotGate.status}; r1CompleteClaimed=false; ChatGPT Ads blocked; live NOT_WIRED.`,
      };
    },
  };
}
