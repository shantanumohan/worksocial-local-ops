import { isAbsolute, join, resolve } from "node:path";
import {
  isConsumerSyncPath,
  resolveHostPaths,
  type ResolvedHostPaths,
} from "@worksocial/persistence";

export type SupervisorConfig = {
  repoRoot: string;
  stateDir: string;
  dataHome: string;
  hostPaths: ResolvedHostPaths;
  hostId: string;
  leaseTtlMs: number;
  /** Extra sync deny substrings (comma-separated env WORKSOCIAL_SYNC_DENY). */
  syncDenyPatterns: string[];
  apiPort: number;
  consolePort: number;
  /** When true, start() will seed example artifact roots if none registered (dev only). */
  seedExampleRoots: boolean;
};

function parseDenyPatterns(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) {
    return [];
  }
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function resolveRepoRoot(cwd: string = process.cwd()): string {
  return resolve(cwd);
}

export function loadSupervisorConfig(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): SupervisorConfig {
  const repoRoot = resolveRepoRoot(cwd);
  const syncDenyPatterns = parseDenyPatterns(env.WORKSOCIAL_SYNC_DENY);
  const hostPaths = resolveHostPaths({
    env,
    syncPolicy: { denyPatterns: syncDenyPatterns },
    repoRoot,
  });

  // Explicit relative WORKSOCIAL_STATE_DIR stays relative to repoRoot (operator intent).
  const stateDirEnv = env.WORKSOCIAL_STATE_DIR?.trim();
  const stateDir =
    stateDirEnv && !isAbsolute(stateDirEnv)
      ? join(repoRoot, stateDirEnv)
      : hostPaths.stateDir;
  const stateDirOnSyncPath = isConsumerSyncPath(stateDir, {
    denyPatterns: syncDenyPatterns,
  });

  const hostId =
    env.WORKSOCIAL_HOST_ID?.trim() ||
    env.COMPUTERNAME?.trim() ||
    env.HOSTNAME?.trim() ||
    `local-${hostPaths.dataHome.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(-48)}`;

  return {
    repoRoot,
    stateDir,
    dataHome: hostPaths.dataHome,
    hostPaths: {
      ...hostPaths,
      stateDir,
      stateDirOnSyncPath,
      notes: stateDirOnSyncPath
        ? [
            ...hostPaths.notes.filter((n) => !n.startsWith("WARNING:")),
            `WARNING: resolved stateDir appears under a consumer sync path: ${stateDir}. Override WORKSOCIAL_STATE_DIR to a local non-synced disk.`,
          ]
        : hostPaths.notes,
    },
    hostId,
    leaseTtlMs: Number(env.WORKSOCIAL_LEASE_TTL_MS ?? 120_000),
    syncDenyPatterns,
    apiPort: Number(env.WORKSOCIAL_API_PORT ?? 8787),
    consolePort: Number(env.WORKSOCIAL_CONSOLE_PORT ?? 8788),
    seedExampleRoots: env.WORKSOCIAL_SEED_EXAMPLE_ROOTS === "1",
  };
}

/** Example durable roots that stay off OneDrive (AppData / XDG style). */
export function defaultDurableRootSuggestions(hostLocalData: string): Record<
  "database" | "temporal" | "secrets",
  string
> {
  return {
    database: join(hostLocalData, "pgdata"),
    temporal: join(hostLocalData, "temporal"),
    secrets: join(hostLocalData, "secrets"),
  };
}
