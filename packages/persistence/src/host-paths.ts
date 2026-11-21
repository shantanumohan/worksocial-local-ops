/**
 * Safe default host storage locations for WorkSocial local ops.
 *
 * Defaults live OUTSIDE the git checkout so a OneDrive-synced AgenticArmyWS
 * (or any consumer sync folder) does not hold live DB / Temporal / secrets /
 * auth session state. Override with WORKSOCIAL_STATE_DIR or WORKSOCIAL_DATA_HOME.
 */

import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { isConsumerSyncPath, type SyncPathPolicyOptions } from "./sync-path-policy.js";

export type HostPathPlatform = NodeJS.Platform | "linux" | "darwin" | "win32";

export type ResolveHostPathsInput = {
  env?: NodeJS.ProcessEnv;
  platform?: HostPathPlatform;
  homeDir?: string;
  /** Optional repo root — never used as the durable default; retained for docs/tests only. */
  repoRoot?: string;
  syncPolicy?: SyncPathPolicyOptions;
};

export type ResolvedHostPaths = {
  /** Platform data home (XDG / LocalAppData / Application Support). */
  dataHome: string;
  /** Control-plane + file-backed store root (heartbeats, authority, domain JSON). */
  stateDir: string;
  /** Suggested durable roots kept off sync paths. */
  durableRoots: {
    database: string;
    temporal: string;
    secrets: string;
  };
  /** True when stateDir matched a consumer sync deny pattern. */
  stateDirOnSyncPath: boolean;
  /** How stateDir was chosen. */
  source: "WORKSOCIAL_STATE_DIR" | "WORKSOCIAL_DATA_HOME" | "platform-default";
  /** Human-readable notes (OneDrive / override guidance). */
  notes: string[];
};

function envTrim(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (!raw || !raw.trim()) {
    return undefined;
  }
  return raw.trim();
}

/**
 * Resolve the platform-local data home for WorkSocial.
 * - Linux: $XDG_DATA_HOME/worksocial or ~/.local/share/worksocial
 * - macOS: ~/Library/Application Support/WorkSocial
 * - Windows: %LOCALAPPDATA%\\WorkSocial (never %USERPROFILE%\\OneDrive\\...)
 */
export function resolveWorkSocialDataHome(input: ResolveHostPathsInput = {}): string {
  const env = input.env ?? process.env;
  const platform = input.platform ?? process.platform;
  const home = input.homeDir ?? homedir();

  const explicit = envTrim(env, "WORKSOCIAL_DATA_HOME");
  if (explicit) {
    return isAbsolute(explicit) ? explicit : resolve(explicit);
  }

  if (platform === "win32") {
    const localAppData = envTrim(env, "LOCALAPPDATA") ?? join(home, "AppData", "Local");
    return join(localAppData, "WorkSocial");
  }

  if (platform === "darwin") {
    return join(home, "Library", "Application Support", "WorkSocial");
  }

  // linux and other POSIX
  const xdg = envTrim(env, "XDG_DATA_HOME");
  if (xdg) {
    return join(xdg, "worksocial");
  }
  return join(home, ".local", "share", "worksocial");
}

/**
 * Resolve the default control-plane state directory.
 * Prefer WORKSOCIAL_STATE_DIR; otherwise `${dataHome}/local-state`.
 *
 * Intentionally does **not** default under the git repo (`.worksocial/local-state`),
 * which is unsafe when the checkout lives on OneDrive / Google Drive / Dropbox.
 */
export function resolveWorkSocialStateDir(input: ResolveHostPathsInput = {}): string {
  const env = input.env ?? process.env;
  const explicit = envTrim(env, "WORKSOCIAL_STATE_DIR");
  if (explicit) {
    return isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
  }
  return join(resolveWorkSocialDataHome(input), "local-state");
}

export function resolveDefaultDurableRoots(
  dataHome: string,
): ResolvedHostPaths["durableRoots"] {
  return {
    database: join(dataHome, "pgdata"),
    temporal: join(dataHome, "temporal"),
    secrets: join(dataHome, "secrets"),
  };
}

/**
 * Full host path resolution with sync-path honesty for the control-plane state dir.
 */
export function resolveHostPaths(input: ResolveHostPathsInput = {}): ResolvedHostPaths {
  const env = input.env ?? process.env;
  const dataHome = resolveWorkSocialDataHome(input);
  const explicitState = envTrim(env, "WORKSOCIAL_STATE_DIR");
  const explicitData = envTrim(env, "WORKSOCIAL_DATA_HOME");
  const stateDir = resolveWorkSocialStateDir(input);
  const stateDirOnSyncPath = isConsumerSyncPath(stateDir, input.syncPolicy);
  const notes: string[] = [
    "Live database, Temporal, secrets, and auth/session state must stay off OneDrive-style sync folders.",
    "Windows owner workspace under OneDrive is OK for source/content artifacts only — not for WORKSOCIAL_STATE_DIR or durable roots.",
    "Cloud/Linux defaults use XDG (~/.local/share/worksocial) or WORKSOCIAL_DATA_HOME.",
  ];

  if (stateDirOnSyncPath) {
    notes.push(
      `WARNING: resolved stateDir appears under a consumer sync path: ${stateDir}. Override WORKSOCIAL_STATE_DIR to a local non-synced disk.`,
    );
  }

  let source: ResolvedHostPaths["source"] = "platform-default";
  if (explicitState) {
    source = "WORKSOCIAL_STATE_DIR";
  } else if (explicitData) {
    source = "WORKSOCIAL_DATA_HOME";
  }

  return {
    dataHome,
    stateDir,
    durableRoots: resolveDefaultDurableRoots(dataHome),
    stateDirOnSyncPath,
    source,
    notes,
  };
}

/**
 * @deprecated Prefer resolveWorkSocialStateDir / resolveHostPaths.
 * Kept as a thin alias; repoRoot is ignored so defaults stay off the checkout.
 */
export function defaultStateDir(_repoRoot?: string, env?: NodeJS.ProcessEnv): string {
  return resolveWorkSocialStateDir(env ? { env } : {});
}
