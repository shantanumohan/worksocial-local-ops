/**
 * Policy: durable DB / Temporal / secrets must not live under consumer sync folders.
 * Artifact roots (source, working, content, reports, encrypted_backup) may.
 */

export type ArtifactStorageKind =
  | "source"
  | "working"
  | "content"
  | "reports"
  | "encrypted_backup";

export type DurableStorageKind = "database" | "temporal" | "secrets";

export type StorageRootKind = ArtifactStorageKind | DurableStorageKind;

export const ARTIFACT_STORAGE_KINDS: readonly ArtifactStorageKind[] = [
  "source",
  "working",
  "content",
  "reports",
  "encrypted_backup",
] as const;

export const DURABLE_STORAGE_KINDS: readonly DurableStorageKind[] = [
  "database",
  "temporal",
  "secrets",
] as const;

export const ALL_STORAGE_ROOT_KINDS: readonly StorageRootKind[] = [
  ...ARTIFACT_STORAGE_KINDS,
  ...DURABLE_STORAGE_KINDS,
] as const;

/** Default patterns that indicate consumer cloud-sync folders (OneDrive-style). */
export const DEFAULT_SYNC_DENY_PATTERNS: readonly string[] = [
  "OneDrive",
  "onedrive",
  "Google Drive",
  "GoogleDrive",
  "Dropbox",
  "iCloudDrive",
  "iCloud Drive",
  "Box Sync",
  "Box Sync",
] as const;

export type SyncPathPolicyOptions = {
  /** Extra substrings (case-insensitive) that mark a path as sync-backed. */
  denyPatterns?: readonly string[];
};

export function isDurableStorageKind(kind: StorageRootKind): kind is DurableStorageKind {
  return (DURABLE_STORAGE_KINDS as readonly string[]).includes(kind);
}

export function isArtifactStorageKind(kind: StorageRootKind): kind is ArtifactStorageKind {
  return (ARTIFACT_STORAGE_KINDS as readonly string[]).includes(kind);
}

/**
 * Normalize path separators for cross-platform substring checks.
 * Does not resolve symlinks or touch the filesystem.
 */
export function normalizePathForPolicy(pathInput: string): string {
  return pathInput.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

/**
 * Returns true when the path appears to live under a consumer sync folder.
 */
export function isConsumerSyncPath(
  pathInput: string,
  options: SyncPathPolicyOptions = {},
): boolean {
  const normalized = normalizePathForPolicy(pathInput);
  if (!normalized) {
    return false;
  }
  const patterns = [
    ...DEFAULT_SYNC_DENY_PATTERNS,
    ...(options.denyPatterns ?? []),
  ];
  const lower = normalized.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
}

export type SyncPathPolicyVerdict =
  | { ok: true; kind: StorageRootKind; path: string; syncPath: boolean }
  | {
      ok: false;
      kind: StorageRootKind;
      path: string;
      syncPath: true;
      reason: "DURABLE_ON_SYNC_PATH";
      message: string;
    };

/**
 * Enforce: durable kinds (database, temporal, secrets) cannot be registered
 * under detected consumer sync paths. Artifact kinds are allowed on sync paths.
 */
export function evaluateSyncPathPolicy(
  kind: StorageRootKind,
  pathInput: string,
  options: SyncPathPolicyOptions = {},
): SyncPathPolicyVerdict {
  const path = normalizePathForPolicy(pathInput);
  const syncPath = isConsumerSyncPath(path, options);

  if (isDurableStorageKind(kind) && syncPath) {
    return {
      ok: false,
      kind,
      path,
      syncPath: true,
      reason: "DURABLE_ON_SYNC_PATH",
      message: `Refusing ${kind} root under consumer sync path (e.g. OneDrive). Keep live DB, Temporal state, and secrets off synced folders.`,
    };
  }

  return { ok: true, kind, path, syncPath };
}
