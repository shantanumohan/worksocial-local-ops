import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { defaultStateDir } from "@worksocial/persistence";

export type SupervisorConfig = {
  repoRoot: string;
  stateDir: string;
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
  const stateDirEnv = env.WORKSOCIAL_STATE_DIR;
  const stateDir = stateDirEnv
    ? isAbsolute(stateDirEnv)
      ? stateDirEnv
      : join(repoRoot, stateDirEnv)
    : defaultStateDir(repoRoot);

  const hostId =
    env.WORKSOCIAL_HOST_ID?.trim() ||
    env.COMPUTERNAME?.trim() ||
    env.HOSTNAME?.trim() ||
    `local-${homedir().replace(/[^a-zA-Z0-9_-]+/g, "-")}`;

  return {
    repoRoot,
    stateDir,
    hostId,
    leaseTtlMs: Number(env.WORKSOCIAL_LEASE_TTL_MS ?? 120_000),
    syncDenyPatterns: parseDenyPatterns(env.WORKSOCIAL_SYNC_DENY),
    apiPort: Number(env.WORKSOCIAL_API_PORT ?? 8787),
    consolePort: Number(env.WORKSOCIAL_CONSOLE_PORT ?? 8788),
    seedExampleRoots: env.WORKSOCIAL_SEED_EXAMPLE_ROOTS === "1",
  };
}

/** Example durable roots that stay off OneDrive (AppData-style). */
export function defaultDurableRootSuggestions(hostLocalData: string): Record<
  "database" | "temporal" | "secrets",
  string
> {
  return {
    database: join(hostLocalData, "WorkSocial", "pgdata"),
    temporal: join(hostLocalData, "WorkSocial", "temporal"),
    secrets: join(hostLocalData, "WorkSocial", "secrets"),
  };
}
