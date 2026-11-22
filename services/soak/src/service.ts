/**
 * M9 / NEXT-20 soak service — recovery harness + evidence compiler + owner report.
 * Pilot gate duration uses server-recorded observations only (never client claim dates).
 */

import { randomUUID } from "node:crypto";
import {
  AcceptanceEnvironment,
  PILOT_SOAK_REQUIRED_MS,
  PilotObservationKind,
  SOAK_RELATED_CASE_IDS,
  evaluatePilotGate,
  type PilotGateObservation,
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
   * Record a server-clock pilot observation (start|heartbeat|end).
   * Client claim dates are never accepted.
   */
  recordPilotObservation(kind: "start" | "heartbeat" | "end"): {
    observation: PilotGateObservation;
    observations: PilotGateObservation[];
  };
  listPilotObservations(): PilotGateObservation[];
  /**
   * Run fixture soak proofs + compile acceptance evidence.
   * Short runs leave pilotGate NOT_MET (72h required for MET).
   * Client-supplied startedAtIso/endedAtIso are not accepted for the gate.
   */
  runFixtureSoak(input?: {
    /** Deterministic clock for durable harness proofs only — not used for pilot gate. */
    harnessNowIso?: string;
    /** Test-only server clock injection (still server-side; never request body dates). */
    now?: () => Date;
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

    recordPilotObservation(kind) {
      const observation: PilotGateObservation = {
        kind:
          kind === "start"
            ? PilotObservationKind.START
            : kind === "end"
              ? PilotObservationKind.END
              : PilotObservationKind.HEARTBEAT,
        recordedAtIso: new Date().toISOString(),
      };
      const observations = store.appendPilotObservation(observation);
      return { observation, observations };
    },

    listPilotObservations() {
      return store.listPilotObservations();
    },

    async runFixtureSoak(input = {}) {
      const clock = input.now ?? (() => new Date());
      const runId = `soak-${randomUUID()}`;

      const serverStartedAtIso = clock().toISOString();
      const runStartObs: PilotGateObservation = {
        kind: PilotObservationKind.START,
        recordedAtIso: serverStartedAtIso,
      };

      // Heartbeat the durable pilot window (if any) with server clock only.
      store.appendPilotObservation({
        kind: PilotObservationKind.HEARTBEAT,
        recordedAtIso: serverStartedAtIso,
      });

      const harness = await runSoakRecoveryHarness({
        stateDir: store.stateDir,
        nowIso: input.harnessNowIso ?? serverStartedAtIso,
      });

      const serverEndedAtIso = clock().toISOString();
      const runEndObs: PilotGateObservation = {
        kind: PilotObservationKind.END,
        recordedAtIso: serverEndedAtIso,
      };
      store.appendPilotObservation({
        kind: PilotObservationKind.HEARTBEAT,
        recordedAtIso: serverEndedAtIso,
      });

      const windowObs = store.listPilotObservations();
      const windowHasStart = windowObs.some(
        (o) => o.kind === PilotObservationKind.START,
      );

      /**
       * Gate observations:
       * - If an owner-started pilot window exists (server start recorded earlier),
       *   evaluate that window plus this run's end.
       * - Otherwise use only this run's server start/end (short CI → NOT_MET).
       * Client claim dates are never consulted.
       */
      const gateObservations: PilotGateObservation[] = windowHasStart
        ? [
            ...windowObs,
            {
              kind: PilotObservationKind.END,
              recordedAtIso: serverEndedAtIso,
            },
          ]
        : [runStartObs, runEndObs];

      const compiled = compileAcceptanceEvidence({
        proofs: harness.proofs,
        nowIso: serverEndedAtIso,
        runId,
      });

      for (const artifact of compiled.artifacts) {
        store.addArtifact(artifact);
      }

      const pilotGate = evaluatePilotGate({
        observations: gateObservations,
        proofs: harness.proofs,
      });

      const run: SoakRunRecord = {
        runId,
        startedAtIso: serverStartedAtIso,
        endedAtIso: serverEndedAtIso,
        durationMs: Math.max(
          0,
          Date.parse(serverEndedAtIso) - Date.parse(serverStartedAtIso),
        ),
        environment: AcceptanceEnvironment.FIXTURE,
        proofs: harness.proofs,
        caseResults: compiled.caseResults,
        pilotGate,
        pilotObservations: gateObservations,
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
          "Fixture soak only. Pilot gate uses server-recorded observations only (client claim dates ignored). Live providers NOT_WIRED. T-X066 via backup/omit-receipt; T-F24/T-US-047 via recover/rotate/reconcile; T-US-002/T-X002 via competing-supervisor lease; T-X018/T-US-054 via self-approval rejected; T-X073 via offboard ACTIVE_TOKEN residual; T-US-060 via emergency stop at commit; T-X005 via forged browser role ignored; T-X006 via cross-workspace reference denied; T-X019/T-US-036 via approved payload edit invalidated; T-X029 via explicit rebind; T-X015 via DST recurring schedule no duplicates — not live VERIFIED. T-X008 via fact changes after review stale. T-X023 via eventual consistency false not-found — not live VERIFIED. T-X034 via test Ads project vs production blocked. Not R1-complete.",
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
          "Client startedAtIso/endedAtIso claim dates ignored for MET",
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
            : `Latest pilotGate=${latestRun.pilotGate.status}; r1CompleteClaimed=false; ChatGPT Ads blocked; live NOT_WIRED; T-X066 + T-F24/T-US-047 + T-US-002/T-X002 + T-X018/T-US-054 + T-X073 + T-US-060 + T-X005/T-X006 + T-X019/T-US-036 + T-X029 + T-X003 fixture ACCEPTED when required proofs present (not live VERIFIED).`,
      };
    },
  };
}
