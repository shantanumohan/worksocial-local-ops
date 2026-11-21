/**
 * File-backed credential rotation / offboarding store (WP10 / F24).
 * Schema companion: database/migrations/026_credential_rotation.sql
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyCredentialRotationState,
  type CredentialAuditEntry,
  type CredentialQueuedWorkItem,
  type CredentialRotationRecord,
  type CredentialRotationState,
  type FixtureCredentialConnection,
  type OffboardingManifest,
} from "@worksocial/domain";

export type CredentialRotationStore = {
  readonly stateDir: string;
  read(): CredentialRotationState;
  write(state: CredentialRotationState): void;
  update(
    mutator: (current: CredentialRotationState) => CredentialRotationState,
  ): CredentialRotationState;
  upsertConnection(
    connection: FixtureCredentialConnection,
  ): CredentialRotationState;
  upsertQueuedWork(items: CredentialQueuedWorkItem[]): CredentialRotationState;
  appendAudit(entry: CredentialAuditEntry): CredentialRotationState;
  addRotation(record: CredentialRotationRecord): CredentialRotationState;
  addManifest(manifest: OffboardingManifest): CredentialRotationState;
  getConnection(connectionId: string): FixtureCredentialConnection | null;
  listConnections(): FixtureCredentialConnection[];
  listQueuedWork(connectionId?: string): CredentialQueuedWorkItem[];
  listAudit(limit?: number): CredentialAuditEntry[];
  listRotations(limit?: number): CredentialRotationRecord[];
  listManifests(limit?: number): OffboardingManifest[];
  status(): {
    connectionCount: number;
    activeCount: number;
    revokedCount: number;
    queuedWorkCount: number;
    auditCount: number;
    rotationCount: number;
    manifestCount: number;
    liveWiring: CredentialRotationState["liveWiring"];
    catalogClaim: "NOT_RUN";
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

export function defaultCredentialRotationStateDir(baseDir: string): string {
  return join(baseDir, "credential-rotation");
}

export function createFileCredentialRotationStore(
  stateDir: string,
): CredentialRotationStore {
  const dir = join(stateDir, "credential-rotation");
  const statePath = join(dir, "credential-rotation-state.json");

  const read = (): CredentialRotationState => {
    const existing = readJsonFile<CredentialRotationState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyCredentialRotationState(new Date().toISOString());
    }
    const base = emptyCredentialRotationState(existing.updatedAtIso);
    return {
      ...base,
      ...existing,
      connections: existing.connections ?? [],
      queuedWork: existing.queuedWork ?? [],
      audit: existing.audit ?? [],
      rotations: existing.rotations ?? [],
      offboardingManifests: existing.offboardingManifests ?? [],
      liveWiring: {
        localRevoke: "fixture",
        localRotation: "fixture",
        offboardingManifest: "fixture",
        liveProviderRevocation: "NOT_WIRED",
      },
      catalogClaim: "NOT_RUN",
      chatgptAdsWiring: "NOT_WIRED",
      productionActivated: false,
      externalEffects: "NONE",
    };
  };

  const write = (state: CredentialRotationState): void => {
    atomicWriteJson(statePath, {
      ...state,
      liveWiring: {
        localRevoke: "fixture",
        localRotation: "fixture",
        offboardingManifest: "fixture",
        liveProviderRevocation: "NOT_WIRED",
      },
      catalogClaim: "NOT_RUN",
      chatgptAdsWiring: "NOT_WIRED",
      productionActivated: false,
      externalEffects: "NONE",
      updatedAtIso: state.updatedAtIso,
    } satisfies CredentialRotationState);
  };

  const update = (
    mutator: (current: CredentialRotationState) => CredentialRotationState,
  ): CredentialRotationState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: dir,

    read,
    write,
    update,

    upsertConnection(connection) {
      return update((state) => {
        const others = state.connections.filter(
          (c) => c.connectionId !== connection.connectionId,
        );
        return {
          ...state,
          connections: [...others, connection],
          updatedAtIso: connection.revokedAtIso ?? connection.createdAtIso,
        };
      });
    },

    upsertQueuedWork(items) {
      return update((state) => {
        const byId = new Map(state.queuedWork.map((w) => [w.workId, w]));
        for (const item of items) {
          byId.set(item.workId, item);
        }
        return {
          ...state,
          queuedWork: [...byId.values()],
          updatedAtIso: new Date().toISOString(),
        };
      });
    },

    appendAudit(entry) {
      return update((state) => ({
        ...state,
        audit: [...state.audit, entry],
        updatedAtIso: entry.recordedAtIso,
      }));
    },

    addRotation(record) {
      return update((state) => ({
        ...state,
        rotations: [...state.rotations, record],
        updatedAtIso: record.createdAtIso,
      }));
    },

    addManifest(manifest) {
      return update((state) => ({
        ...state,
        offboardingManifests: [...state.offboardingManifests, manifest],
        updatedAtIso: manifest.createdAtIso,
      }));
    },

    getConnection(connectionId) {
      return (
        read().connections.find((c) => c.connectionId === connectionId) ?? null
      );
    },

    listConnections() {
      return read().connections;
    },

    listQueuedWork(connectionId) {
      const items = read().queuedWork;
      return connectionId
        ? items.filter((w) => w.connectionId === connectionId)
        : items;
    },

    listAudit(limit = 100) {
      return read().audit.slice(-limit);
    },

    listRotations(limit = 50) {
      return read().rotations.slice(-limit);
    },

    listManifests(limit = 50) {
      return read().offboardingManifests.slice(-limit);
    },

    status() {
      const state = read();
      return {
        connectionCount: state.connections.length,
        activeCount: state.connections.filter((c) => c.status === "ACTIVE")
          .length,
        revokedCount: state.connections.filter(
          (c) => c.status === "REVOKED" || c.status === "ROTATED_AWAY",
        ).length,
        queuedWorkCount: state.queuedWork.length,
        auditCount: state.audit.length,
        rotationCount: state.rotations.length,
        manifestCount: state.offboardingManifests.length,
        liveWiring: state.liveWiring,
        catalogClaim: "NOT_RUN" as const,
        chatgptAdsWiring: "NOT_WIRED" as const,
        productionActivated: false as const,
        externalEffects: "NONE" as const,
        honestNote:
          "Fixture credential revoke/rotate/offboard only. Live provider revocation NOT_WIRED. External effects NONE. Catalog NOT_RUN.",
      };
    },
  };
}
