import {
  ALL_STORAGE_ROOT_KINDS,
  ARTIFACT_STORAGE_KINDS,
  DURABLE_STORAGE_KINDS,
  evaluateSyncPathPolicy,
  isDurableStorageKind,
  normalizePathForPolicy,
  type ArtifactStorageKind,
  type DurableStorageKind,
  type StorageRootKind,
  type SyncPathPolicyOptions,
} from "./sync-path-policy.js";

export type StorageRootRecord = {
  id: string;
  kind: StorageRootKind;
  path: string;
  /** True when path matched a sync deny pattern at registration time. */
  syncPath: boolean;
  registeredAt: string;
  notes?: string;
};

export type StorageRootValidationError = {
  code:
    | "EMPTY_PATH"
    | "UNKNOWN_KIND"
    | "DURABLE_ON_SYNC_PATH"
    | "DUPLICATE_KIND"
    | "PATH_TRAVERSAL";
  kind?: StorageRootKind;
  path?: string;
  message: string;
};

export type StorageRootValidationResult =
  | { ok: true; root: Omit<StorageRootRecord, "id" | "registeredAt"> }
  | { ok: false; errors: StorageRootValidationError[] };

const KIND_SET = new Set<string>(ALL_STORAGE_ROOT_KINDS);

export function isStorageRootKind(value: string): value is StorageRootKind {
  return KIND_SET.has(value);
}

/**
 * Validate a candidate storage root without touching the filesystem.
 * Path existence / permission checks belong to the supervisor doctor.
 */
export function validateStorageRootCandidate(
  kind: string,
  pathInput: string,
  options: SyncPathPolicyOptions & { existingKinds?: readonly StorageRootKind[] } = {},
): StorageRootValidationResult {
  const errors: StorageRootValidationError[] = [];
  const path = normalizePathForPolicy(pathInput);

  if (!path) {
    errors.push({
      code: "EMPTY_PATH",
      message: "Storage root path must be non-empty.",
    });
  }

  if (path.includes("\0") || path.includes("/../") || path.endsWith("/..") || path === "..") {
    errors.push({
      code: "PATH_TRAVERSAL",
      path,
      message: "Storage root path must not contain path-traversal segments.",
    });
  }

  if (!isStorageRootKind(kind)) {
    errors.push({
      code: "UNKNOWN_KIND",
      path,
      message: `Unknown storage root kind '${kind}'. Expected one of: ${ALL_STORAGE_ROOT_KINDS.join(", ")}.`,
    });
    return { ok: false, errors };
  }

  if (options.existingKinds?.includes(kind)) {
    errors.push({
      code: "DUPLICATE_KIND",
      kind,
      path,
      message: `A storage root of kind '${kind}' is already registered.`,
    });
  }

  const syncVerdict = evaluateSyncPathPolicy(kind, path, options);
  if (!syncVerdict.ok) {
    errors.push({
      code: "DURABLE_ON_SYNC_PATH",
      kind,
      path: syncVerdict.path,
      message: syncVerdict.message,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const root: Omit<StorageRootRecord, "id" | "registeredAt"> = {
    kind,
    path: syncVerdict.path,
    syncPath: syncVerdict.syncPath,
  };

  return { ok: true, root };
}

export type StorageRootRegistrySnapshot = {
  roots: StorageRootRecord[];
  updatedAt: string;
};

export function createEmptyRegistry(nowIso: string = new Date().toISOString()): StorageRootRegistrySnapshot {
  return { roots: [], updatedAt: nowIso };
}

export function registerStorageRoot(
  registry: StorageRootRegistrySnapshot,
  kind: StorageRootKind,
  pathInput: string,
  options: SyncPathPolicyOptions & { id?: string; nowIso?: string; notes?: string } = {},
):
  | { ok: true; registry: StorageRootRegistrySnapshot; root: StorageRootRecord }
  | { ok: false; errors: StorageRootValidationError[] } {
  const existingKinds = registry.roots.map((r) => r.kind);
  const candidateOptions: SyncPathPolicyOptions & {
    existingKinds?: readonly StorageRootKind[];
  } = { existingKinds };
  if (options.denyPatterns !== undefined) {
    candidateOptions.denyPatterns = options.denyPatterns;
  }
  const validated = validateStorageRootCandidate(kind, pathInput, candidateOptions);

  if (!validated.ok) {
    return validated;
  }

  const nowIso = options.nowIso ?? new Date().toISOString();
  const root: StorageRootRecord = {
    id: options.id ?? `${kind}-${nowIso}`,
    kind: validated.root.kind,
    path: validated.root.path,
    syncPath: validated.root.syncPath,
    registeredAt: nowIso,
    ...(options.notes !== undefined ? { notes: options.notes } : {}),
  };

  return {
    ok: true,
    root,
    registry: {
      roots: [...registry.roots.filter((r) => r.kind !== kind), root],
      updatedAt: nowIso,
    },
  };
}

export function getRootByKind(
  registry: StorageRootRegistrySnapshot,
  kind: StorageRootKind,
): StorageRootRecord | undefined {
  return registry.roots.find((r) => r.kind === kind);
}

export function listMissingArtifactRoots(
  registry: StorageRootRegistrySnapshot,
): ArtifactStorageKind[] {
  const present = new Set(registry.roots.map((r) => r.kind));
  return ARTIFACT_STORAGE_KINDS.filter((k) => !present.has(k));
}

export function listMissingDurableRoots(
  registry: StorageRootRegistrySnapshot,
): DurableStorageKind[] {
  const present = new Set(registry.roots.map((r) => r.kind));
  return DURABLE_STORAGE_KINDS.filter((k) => !present.has(k));
}

export function assertDurableRootsOffSync(
  registry: StorageRootRegistrySnapshot,
  options: SyncPathPolicyOptions = {},
): StorageRootValidationError[] {
  const errors: StorageRootValidationError[] = [];
  for (const root of registry.roots) {
    if (!isDurableStorageKind(root.kind)) {
      continue;
    }
    const verdict = evaluateSyncPathPolicy(root.kind, root.path, options);
    if (!verdict.ok) {
      errors.push({
        code: "DURABLE_ON_SYNC_PATH",
        kind: root.kind,
        path: verdict.path,
        message: verdict.message,
      });
    }
  }
  return errors;
}

export type { ArtifactStorageKind, DurableStorageKind, StorageRootKind };
