/**
 * File-backed recovery evidence store (WP10 / F24).
 * Schema companion: database/migrations/024_recovery_evidence.sql
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyRecoveryEvidenceState,
  type CapabilityStopRecord,
  type HealthTimelineEvent,
  type QueuedWorkItem,
  type RecoveryEvidenceArtifact,
  type RecoveryEvidenceState,
  type RecoveryRunRecord,
} from "@worksocial/domain";

export type RecoveryStore = {
  readonly stateDir: string;
  read(): RecoveryEvidenceState;
  write(state: RecoveryEvidenceState): void;
  update(
    mutator: (current: RecoveryEvidenceState) => RecoveryEvidenceState,
  ): RecoveryEvidenceState;
  appendTimeline(event: HealthTimelineEvent): RecoveryEvidenceState;
  upsertQueuedWork(items: QueuedWorkItem[]): RecoveryEvidenceState;
  upsertCapabilityStop(stop: CapabilityStopRecord): RecoveryEvidenceState;
  addRun(run: RecoveryRunRecord): RecoveryEvidenceState;
  addArtifact(artifact: RecoveryEvidenceArtifact): RecoveryEvidenceState;
  listTimeline(limit?: number): HealthTimelineEvent[];
  listQueuedWork(): QueuedWorkItem[];
  listCapabilityStops(): CapabilityStopRecord[];
  listRuns(limit?: number): RecoveryRunRecord[];
  listArtifacts(limit?: number): RecoveryEvidenceArtifact[];
  status(): {
    timelineCount: number;
    queuedWorkCount: number;
    activeCapabilityStops: number;
    runCount: number;
    classCounts: {
      STALE_OBSERVATION: number;
      ACTIVE_INCIDENT: number;
      UNKNOWN_REMOTE_OUTCOME: number;
    };
    liveWiring: RecoveryEvidenceState["liveWiring"];
    liveRecoveryClaim: RecoveryEvidenceState["liveRecoveryClaim"];
    chatgptAdsWiring: "NOT_WIRED";
    productionActivated: false;
    externalEffects: "NONE";
    honestNote: string;
  };
};

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function defaultRecoveryStateDir(baseDir: string): string {
  return join(baseDir, "recovery");
}

export function createFileRecoveryStore(stateDir: string): RecoveryStore {
  const recoveryDir = join(stateDir, "recovery");
  const statePath = join(recoveryDir, "recovery-state.json");
  const evidenceDir = join(recoveryDir, "evidence");

  const read = (): RecoveryEvidenceState => {
    const existing = readJsonFile<RecoveryEvidenceState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyRecoveryEvidenceState(new Date().toISOString());
    }
    const base = emptyRecoveryEvidenceState(existing.updatedAtIso);
    return {
      ...base,
      ...existing,
      timeline: existing.timeline ?? [],
      queuedWork: existing.queuedWork ?? [],
      capabilityStops: existing.capabilityStops ?? [],
      runs: existing.runs ?? [],
      artifacts: existing.artifacts ?? [],
      liveWiring: {
        hostRecovery: existing.liveWiring?.hostRecovery ?? "fixture",
        providerRecovery: existing.liveWiring?.providerRecovery ?? "fixture",
        credentialRotation: "NOT_WIRED",
        offboarding: "NOT_WIRED",
      },
      liveRecoveryClaim: existing.liveRecoveryClaim ?? "NOT_RUN",
      chatgptAdsWiring: "NOT_WIRED",
      productionActivated: false,
    };
  };

  const write = (state: RecoveryEvidenceState): void => {
    mkdirSync(evidenceDir, { recursive: true });
    atomicWriteJson(statePath, {
      ...state,
      liveWiring: {
        hostRecovery: state.liveWiring.hostRecovery,
        providerRecovery: state.liveWiring.providerRecovery,
        credentialRotation: "NOT_WIRED",
        offboarding: "NOT_WIRED",
      },
      chatgptAdsWiring: "NOT_WIRED",
      productionActivated: false,
      updatedAtIso: state.updatedAtIso,
    } satisfies RecoveryEvidenceState);
  };

  const update = (
    mutator: (current: RecoveryEvidenceState) => RecoveryEvidenceState,
  ): RecoveryEvidenceState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir,

    read,
    write,
    update,

    appendTimeline(event) {
      return update((s) => ({
        ...s,
        timeline: [...s.timeline, event],
        updatedAtIso: event.recordedAtIso,
      }));
    },

    upsertQueuedWork(items) {
      return update((s) => {
        const byId = new Map(s.queuedWork.map((q) => [q.workId, q]));
        for (const item of items) {
          byId.set(item.workId, item);
        }
        return {
          ...s,
          queuedWork: [...byId.values()],
          updatedAtIso: new Date().toISOString(),
        };
      });
    },

    upsertCapabilityStop(stop) {
      return update((s) => ({
        ...s,
        capabilityStops: [
          ...s.capabilityStops.filter((c) => c.stopId !== stop.stopId),
          stop,
        ],
        updatedAtIso: stop.stoppedAtIso,
      }));
    },

    addRun(run) {
      return update((s) => ({
        ...s,
        runs: [...s.runs, run],
        updatedAtIso: run.endedAtIso,
      }));
    },

    addArtifact(artifact) {
      return update((s) => ({
        ...s,
        artifacts: [...s.artifacts, artifact],
        updatedAtIso: artifact.createdAtIso,
      }));
    },

    listTimeline(limit = 100) {
      return read().timeline.slice(-limit);
    },

    listQueuedWork() {
      return read().queuedWork;
    },

    listCapabilityStops() {
      return read().capabilityStops;
    },

    listRuns(limit = 50) {
      return read().runs.slice(-limit);
    },

    listArtifacts(limit = 50) {
      return read().artifacts.slice(-limit);
    },

    status() {
      const state = read();
      const classCounts = {
        STALE_OBSERVATION: 0,
        ACTIVE_INCIDENT: 0,
        UNKNOWN_REMOTE_OUTCOME: 0,
      };
      for (const e of state.timeline) {
        classCounts[e.classification] += 1;
      }
      return {
        timelineCount: state.timeline.length,
        queuedWorkCount: state.queuedWork.length,
        activeCapabilityStops: state.capabilityStops.filter(
          (s) => !s.resumeAllowed,
        ).length,
        runCount: state.runs.length,
        classCounts,
        liveWiring: state.liveWiring,
        liveRecoveryClaim: state.liveRecoveryClaim,
        chatgptAdsWiring: "NOT_WIRED" as const,
        productionActivated: false as const,
        externalEffects: "NONE" as const,
        honestNote:
          "Fixture recovery evidence only. Distinguishes STALE_OBSERVATION / ACTIVE_INCIDENT / UNKNOWN_REMOTE_OUTCOME. Live recovery NOT_RUN; never silently VERIFIED. Credential rotation and offboarding remain NOT_WIRED.",
      };
    },
  };
}
