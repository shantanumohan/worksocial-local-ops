/**
 * File-backed owner staging workflow store (M4 / NEXT-13–15).
 * Schema companion: database/migrations/016_owner_staging.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyOwnerStagingState,
  type ActivationChecklist,
  type MeasurementObservation,
  type OwnerConnectionRecord,
  type OwnerEvidenceItem,
  type OwnerMissionRecord,
  type OwnerSiteRecord,
  type OwnerStagingState,
  type PageSnapshotRecord,
  type StagingChangeRecord,
  type StagingCmsPageRecord,
} from "@worksocial/domain";

export type OwnerStagingStore = {
  readonly stateDir: string;
  read(): OwnerStagingState;
  write(state: OwnerStagingState): void;
  update(mutator: (current: OwnerStagingState) => OwnerStagingState): OwnerStagingState;
  setActivation(checklist: ActivationChecklist): OwnerStagingState;
  upsertSite(site: OwnerSiteRecord): OwnerStagingState;
  upsertConnection(connection: OwnerConnectionRecord): OwnerStagingState;
  addSnapshot(snapshot: PageSnapshotRecord): OwnerStagingState;
  addMeasurement(observation: MeasurementObservation): OwnerStagingState;
  upsertCmsPage(page: StagingCmsPageRecord): OwnerStagingState;
  upsertChange(change: StagingChangeRecord): OwnerStagingState;
  upsertMission(mission: OwnerMissionRecord): OwnerStagingState;
  addEvidence(item: OwnerEvidenceItem): OwnerStagingState;
  status(): {
    siteCount: number;
    connectionCount: number;
    missionCount: number;
    evidenceCount: number;
    snapshotCount: number;
    changeCount: number;
    activationComplete: number;
    activationTotal: number;
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

export function defaultOwnerStagingStateDir(baseDir: string): string {
  return join(baseDir, "owner-staging");
}

export function createFileOwnerStagingStore(stateDir: string): OwnerStagingStore {
  const dir = join(stateDir, "owner-staging");
  const statePath = join(dir, "owner-staging-state.json");

  const read = (): OwnerStagingState => {
    const existing = readJsonFile<OwnerStagingState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyOwnerStagingState(new Date().toISOString());
    }
    return {
      ...existing,
      sites: existing.sites ?? [],
      connections: existing.connections ?? [],
      snapshots: existing.snapshots ?? [],
      measurements: existing.measurements ?? [],
      cmsPages: existing.cmsPages ?? [],
      changes: existing.changes ?? [],
      missions: existing.missions ?? [],
      evidence: existing.evidence ?? [],
      activation: existing.activation ?? null,
    };
  };

  const write = (state: OwnerStagingState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: OwnerStagingState) => OwnerStagingState,
  ): OwnerStagingState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: dir,
    read,
    write,
    update,
    setActivation: (checklist) =>
      update((state) => ({
        ...state,
        activation: checklist,
        updatedAtIso: checklist.updatedAtIso,
      })),
    upsertSite: (site) =>
      update((state) => ({
        ...state,
        sites: [
          ...state.sites.filter((s) => s.siteId !== site.siteId),
          site,
        ].slice(-100),
        updatedAtIso: site.createdAtIso,
      })),
    upsertConnection: (connection) =>
      update((state) => ({
        ...state,
        connections: [
          ...state.connections.filter(
            (c) => c.connectionId !== connection.connectionId,
          ),
          connection,
        ],
        updatedAtIso: connection.updatedAtIso,
      })),
    addSnapshot: (snapshot) =>
      update((state) => ({
        ...state,
        snapshots: [...state.snapshots, snapshot].slice(-200),
        updatedAtIso: snapshot.capturedAtIso,
      })),
    addMeasurement: (observation) =>
      update((state) => ({
        ...state,
        measurements: [...state.measurements, observation].slice(-200),
        updatedAtIso: observation.capturedAtIso,
      })),
    upsertCmsPage: (page) =>
      update((state) => ({
        ...state,
        cmsPages: [
          ...state.cmsPages.filter((p) => p.pageId !== page.pageId),
          page,
        ],
        updatedAtIso: page.updatedAtIso,
      })),
    upsertChange: (change) =>
      update((state) => ({
        ...state,
        changes: [
          ...state.changes.filter((c) => c.changeId !== change.changeId),
          change,
        ].slice(-200),
        updatedAtIso: change.updatedAtIso,
      })),
    upsertMission: (mission) =>
      update((state) => ({
        ...state,
        missions: [
          ...state.missions.filter((m) => m.missionId !== mission.missionId),
          mission,
        ].slice(-200),
        updatedAtIso: mission.updatedAtIso,
      })),
    addEvidence: (item) =>
      update((state) => ({
        ...state,
        evidence: [...state.evidence, item].slice(-500),
        updatedAtIso: item.createdAtIso,
      })),
    status: () => {
      const state = read();
      const steps = state.activation?.steps ?? [];
      const activationComplete = steps.filter(
        (s) => s.status === "COMPLETE" || s.status === "SKIPPED",
      ).length;
      return {
        siteCount: state.sites.length,
        connectionCount: state.connections.length,
        missionCount: state.missions.length,
        evidenceCount: state.evidence.length,
        snapshotCount: state.snapshots.length,
        changeCount: state.changes.length,
        activationComplete,
        activationTotal: steps.length || 6,
        honestNote: state.honestNote,
      };
    },
  };
}
