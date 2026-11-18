/**
 * Policy: durable DB / Temporal / secrets must not live under consumer sync folders.
 * Artifact roots (source, working, content, reports, encrypted_backup) may.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

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
] as const;

export type SyncPathPolicyOptions = {
  /** Extra substrings (case-insensitive) that mark a path as sync-backed. */
  denyPatterns?: readonly string[];
  /**
   * When true (default), also evaluate the canonical/realpath (symlinks/junctions).
   * Pure unit tests may set false to avoid filesystem resolution.
   */
  resolveCanonical?: boolean;
};

export function isDurableStorageKind(kind: StorageRootKind): kind is DurableStorageKind {
  return (DURABLE_STORAGE_KINDS as readonly string[]).includes(kind);
}

export function isArtifactStorageKind(kind: StorageRootKind): kind is ArtifactStorageKind {
  return (ARTIFACT_STORAGE_KINDS as readonly string[]).includes(kind);
}

/**
 * Normalize path separators for cross-platform substring checks.
 */
export function normalizePathForPolicy(pathInput: string): string {
  return pathInput.replace(/\\/g, "/").replace(/\/+/g, "/").trim();
}

/**
 * Resolve to a canonical filesystem location when possible (symlinks/junctions).
 * If the leaf does not exist yet, resolve the deepest existing ancestor and rejoin.
 */
export function resolveCanonicalPath(pathInput: string): string {
  const absolute = isAbsolute(pathInput) ? pathInput : resolve(pathInput);
  const normalized = normalizePathForPolicy(absolute);

  try {
    if (existsSync(absolute)) {
      return normalizePathForPolicy(realpathSync(absolute));
    }
  } catch {
    /* fall through to ancestor walk */
  }

  let cursor = absolute;
  const missing: string[] = [];
  while (true) {
    const parent = dirname(cursor);
    if (parent === cursor) {
      break;
    }
    missing.unshift(cursor.slice(parent.length).replace(/^[/\\]/, ""));
    try {
      if (existsSync(parent) && statSync(parent).isDirectory()) {
        const realParent = realpathSync(parent);
        return normalizePathForPolicy(join(realParent, ...missing));
      }
    } catch {
      /* keep walking */
    }
    cursor = parent;
  }

  return normalized;
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
  const candidates = [normalized];
  if (options.resolveCanonical !== false) {
    try {
      const canonical = resolveCanonicalPath(pathInput);
      if (canonical !== normalized) {
        candidates.push(canonical);
      }
    } catch {
      /* keep logical path only */
    }
  }
  return candidates.some((candidate) => {
    const lower = candidate.toLowerCase();
    return patterns.some((pattern) => lower.includes(pattern.toLowerCase()));
  });
}

export type SyncPathPolicyVerdict =
  | {
      ok: true;
      kind: StorageRootKind;
      path: string;
      canonicalPath: string;
      syncPath: boolean;
    }
  | {
      ok: false;
      kind: StorageRootKind;
      path: string;
      canonicalPath: string;
      syncPath: true;
      reason: "DURABLE_ON_SYNC_PATH";
      message: string;
    };

/**
 * Enforce: durable kinds (database, temporal, secrets) cannot be registered
 * under detected consumer sync paths (logical or canonical). Artifact kinds may.
 */
export function evaluateSyncPathPolicy(
  kind: StorageRootKind,
  pathInput: string,
  options: SyncPathPolicyOptions = {},
): SyncPathPolicyVerdict {
  const path = normalizePathForPolicy(pathInput);
  const canonicalPath =
    options.resolveCanonical === false ? path : resolveCanonicalPath(pathInput);
  const syncPath = isConsumerSyncPath(pathInput, options);

  if (isDurableStorageKind(kind) && syncPath) {
    return {
      ok: false,
      kind,
      path,
      canonicalPath,
      syncPath: true,
      reason: "DURABLE_ON_SYNC_PATH",
      message: `Refusing ${kind} root under consumer sync path (e.g. OneDrive). Checked logical='${path}' canonical='${canonicalPath}'. Keep live DB, Temporal state, and secrets off synced folders.`,
    };
  }

  return { ok: true, kind, path, canonicalPath, syncPath };
}
