import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createEmptyRegistry,
  type StorageRootRegistrySnapshot,
} from "./storage-roots.js";
import type { HostLeaseRecord } from "./host-lease.js";
import {
  DEFAULT_SERVICE_SLOTS,
  defaultHeartbeat,
  type ServiceHeartbeatRecord,
} from "./health-records.js";

export type SupervisorRuntimeState = {
  version: 1;
  storageRoots: StorageRootRegistrySnapshot;
  hostLease: HostLeaseRecord | null;
  heartbeats: ServiceHeartbeatRecord[];
  updatedAt: string;
};

export type LocalStateStore = {
  readonly stateDir: string;
  read(): SupervisorRuntimeState;
  write(state: SupervisorRuntimeState): void;
  update(
    mutator: (current: SupervisorRuntimeState) => SupervisorRuntimeState,
  ): SupervisorRuntimeState;
};

function emptyState(nowIso: string): SupervisorRuntimeState {
  return {
    version: 1,
    storageRoots: createEmptyRegistry(nowIso),
    hostLease: null,
    heartbeats: DEFAULT_SERVICE_SLOTS.map((id) => defaultHeartbeat(id, null)),
    updatedAt: nowIso,
  };
}

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
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as T;
}

/**
 * File-backed control-plane state for local supervisor.
 * Honest: this is not PostgreSQL; SQL migrations define the durable schema for when DB is bound.
 */
export function createFileLocalStateStore(stateDir: string): LocalStateStore {
  const statePath = join(stateDir, "supervisor-state.json");

  const read = (): SupervisorRuntimeState => {
    const existing = readJsonFile<SupervisorRuntimeState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyState(new Date().toISOString());
    }
    return existing;
  };

  const write = (state: SupervisorRuntimeState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: SupervisorRuntimeState) => SupervisorRuntimeState,
  ): SupervisorRuntimeState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return { stateDir, read, write, update };
}

export function defaultStateDir(repoRoot: string): string {
  return join(repoRoot, ".worksocial", "local-state");
}
