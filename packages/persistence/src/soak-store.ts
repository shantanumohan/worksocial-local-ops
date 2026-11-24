/**
 * File-backed soak / acceptance evidence store (M9 / NEXT-20).
 * Schema companion: database/migrations/021_m9_soak_acceptance.sql
 * (+ 022 for pilot observations).
 */

import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { atomicWriteEvidenceJson } from "./evidence-manifest-write.js";
import { join } from "node:path";
import {
  SOAK_FIXTURE_STATUS_HONEST_NOTE,
  emptySoakAcceptanceState,
  soakNotWiredLiveWiring,
  type AcceptanceCaseEvidenceRecord,
  type PilotGateObservation,
  type RedactedEvidenceArtifact,
  type SoakAcceptanceState,
  type SoakRunRecord,
} from "@worksocial/domain";

export type SoakStore = {
  readonly stateDir: string;
  read(): SoakAcceptanceState;
  write(state: SoakAcceptanceState): void;
  update(mutator: (current: SoakAcceptanceState) => SoakAcceptanceState): SoakAcceptanceState;
  addRun(run: SoakRunRecord): SoakAcceptanceState;
  addArtifact(artifact: RedactedEvidenceArtifact): SoakAcceptanceState;
  upsertCase(record: AcceptanceCaseEvidenceRecord): SoakAcceptanceState;
  listRuns(limit?: number): SoakRunRecord[];
  listArtifacts(limit?: number): RedactedEvidenceArtifact[];
  listCases(limit?: number): AcceptanceCaseEvidenceRecord[];
  listPilotObservations(): PilotGateObservation[];
  /** Append a server-recorded observation. Resets the window when kind=start. */
  appendPilotObservation(observation: PilotGateObservation): PilotGateObservation[];
  resetPilotObservations(): PilotGateObservation[];
  status(): {
    runCount: number;
    artifactCount: number;
    acceptedCount: number;
    notRunCount: number;
    pilotGateLast: SoakRunRecord["pilotGate"] | null;
    pilotObservationCount: number;
    liveWiring: SoakAcceptanceState["liveWiring"];
    chatgptAdsWiring: "NOT_WIRED";
    r1CompleteClaimed: false;
    honestNote: string;
  };
};

/** Soak evidence path uses the T-X004 atomic writer (ENOSPC-safe; no partial finals). */
function atomicWriteJson(filePath: string, value: unknown): void {
  const result = atomicWriteEvidenceJson({ filePath, value });
  if (!result.ok) {
    const err = new Error(result.reason) as NodeJS.ErrnoException;
    err.code = result.code === "DISK_FULL" ? "ENOSPC" : "EIO";
    throw err;
  }
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function defaultSoakStateDir(baseDir: string): string {
  return join(baseDir, "soak");
}

export function createFileSoakStore(stateDir: string): SoakStore {
  const soakDir = join(stateDir, "soak");
  const statePath = join(soakDir, "soak-state.json");
  const evidenceDir = join(soakDir, "evidence");

  const read = (): SoakAcceptanceState => {
    const existing = readJsonFile<SoakAcceptanceState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptySoakAcceptanceState(new Date().toISOString());
    }
    const base = emptySoakAcceptanceState(existing.updatedAtIso);
    return {
      ...base,
      ...existing,
      runs: existing.runs ?? [],
      artifacts: existing.artifacts ?? [],
      caseLedger: existing.caseLedger ?? [],
      pilotObservations: existing.pilotObservations ?? [],
      // Always force fixture honesty — persisted live claims cannot elevate wiring.
      liveWiring: soakNotWiredLiveWiring(),
      chatgptAdsWiring: "NOT_WIRED",
    };
  };

  const write = (state: SoakAcceptanceState): void => {
    mkdirSync(evidenceDir, { recursive: true });
    atomicWriteJson(statePath, {
      ...state,
      liveWiring: soakNotWiredLiveWiring(),
      chatgptAdsWiring: "NOT_WIRED",
      updatedAtIso: state.updatedAtIso,
    } satisfies SoakAcceptanceState);
  };

  const update = (
    mutator: (current: SoakAcceptanceState) => SoakAcceptanceState,
  ): SoakAcceptanceState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir,

    read,
    write,
    update,

    addRun(run) {
      return update((current) => ({
        ...current,
        updatedAtIso: run.endedAtIso,
        runs: [...current.runs, run].slice(-100),
        caseLedger: mergeCaseLedger(current.caseLedger, run.caseResults),
      }));
    },

    addArtifact(artifact) {
      mkdirSync(evidenceDir, { recursive: true });
      const artifactPath = join(evidenceDir, `${artifact.artifactId}.json`);
      atomicWriteJson(artifactPath, artifact);
      // Keep all unique artifact IDs — do not overwrite by case.
      return update((current) => ({
        ...current,
        updatedAtIso: artifact.createdAtIso,
        artifacts: [
          ...current.artifacts.filter((a) => a.artifactId !== artifact.artifactId),
          artifact,
        ].slice(-500),
      }));
    },

    upsertCase(record) {
      return update((current) => ({
        ...current,
        updatedAtIso: record.updatedAtIso,
        caseLedger: mergeCaseLedger(current.caseLedger, [record]),
      }));
    },

    listRuns(limit = 50) {
      return read().runs.slice(-limit);
    },

    listArtifacts(limit = 100) {
      return read().artifacts.slice(-limit);
    },

    listCases(limit = 200) {
      return read().caseLedger.slice(0, limit);
    },

    listPilotObservations() {
      return read().pilotObservations;
    },

    appendPilotObservation(observation) {
      const next = update((current) => {
        const base =
          observation.kind === "start" ? [] : current.pilotObservations;
        return {
          ...current,
          updatedAtIso: observation.recordedAtIso,
          pilotObservations: [...base, observation].slice(-500),
        };
      });
      return next.pilotObservations;
    },

    resetPilotObservations() {
      const next = update((current) => ({
        ...current,
        updatedAtIso: new Date().toISOString(),
        pilotObservations: [],
      }));
      return next.pilotObservations;
    },

    status() {
      const state = read();
      const acceptedCount = state.caseLedger.filter((c) => c.status === "ACCEPTED").length;
      const notRunCount = state.caseLedger.filter((c) => c.status === "NOT_RUN").length;
      const last = state.runs[state.runs.length - 1] ?? null;
      return {
        runCount: state.runs.length,
        artifactCount: state.artifacts.length,
        acceptedCount,
        notRunCount,
        pilotGateLast: last?.pilotGate ?? null,
        pilotObservationCount: state.pilotObservations.length,
        liveWiring: soakNotWiredLiveWiring(),
        chatgptAdsWiring: "NOT_WIRED",
        r1CompleteClaimed: false,
        honestNote: SOAK_FIXTURE_STATUS_HONEST_NOTE,
      };
    },
  };
}

function mergeCaseLedger(
  existing: AcceptanceCaseEvidenceRecord[],
  incoming: AcceptanceCaseEvidenceRecord[],
): AcceptanceCaseEvidenceRecord[] {
  const byId = new Map(existing.map((c) => [c.caseId, c]));
  for (const row of incoming) {
    byId.set(row.caseId, row);
  }
  return [...byId.values()].sort((a, b) => a.caseId.localeCompare(b.caseId));
}
