/**
 * Verify a PID still belongs to a WorkSocial slot before SIGTERM/SIGKILL.
 * Guards against PID reuse after a crash.
 *
 * Preferred probe: Linux `/proc/<pid>/{cmdline,environ}`.
 * Fallback: heartbeat JSON written by the slot under the state dir (weaker; used when
 * `/proc` is unavailable — e.g. Windows). Empty probe → deny kill (fail-closed).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { ServiceSlotId } from "./health-records.js";

export type ProcessOwnershipClaim = {
  pid: number;
  serviceId: ServiceSlotId;
  generationId: string;
};

export type ProcessOwnershipProbe = {
  /** Return process argv/cmdline string for the pid, or null if unavailable. */
  readCommandLine?: (pid: number) => string | null;
  /** Return environ blob for the pid, or null if unavailable. */
  readEnviron?: (pid: number) => string | null;
};

export type OwnershipProbeCapability = {
  /** Linux /proc cmdline+environ available. */
  procAvailable: boolean;
  /** Heartbeat-file fallback configured. */
  heartbeatFallback: boolean;
  /** Honest platform note. */
  detail: string;
};

function readLinuxCmdline(pid: number): string | null {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, "utf8");
    return raw.replace(/\0/g, " ");
  } catch {
    return null;
  }
}

function readLinuxEnviron(pid: number): string | null {
  try {
    return readFileSync(`/proc/${pid}/environ`, "utf8");
  } catch {
    return null;
  }
}

export function isProcOwnershipAvailable(): boolean {
  return existsSync("/proc");
}

export function describeOwnershipCapability(
  heartbeatFallback: boolean,
): OwnershipProbeCapability {
  const procAvailable = isProcOwnershipAvailable();
  if (procAvailable) {
    return {
      procAvailable: true,
      heartbeatFallback,
      detail:
        "Linux /proc ownership probe available; heartbeat-file fallback " +
        (heartbeatFallback ? "also configured" : "not configured") +
        ".",
    };
  }
  return {
    procAvailable: false,
    heartbeatFallback,
    detail: heartbeatFallback
      ? "Linux /proc unavailable — using heartbeat-file ownership claims (weaker than /proc; Windows host bind AA-12 still NOT_WIRED)."
      : "No ownership probe available — stopOwned denies kill (fail-closed). Windows AgenticArmyWS bind is AA-12 / out of scope.",
  };
}

export function defaultOwnershipProbe(): ProcessOwnershipProbe {
  if (isProcOwnershipAvailable()) {
    return {
      readCommandLine: readLinuxCmdline,
      readEnviron: readLinuxEnviron,
    };
  }
  return {};
}

type HeartbeatOwnershipFile = {
  pid?: number | null;
  serviceId?: string;
  generationId?: string | null;
};

/**
 * Weaker ownership probe: trust our own heartbeat-<service>.json files under stateDir.
 * Used when /proc is unavailable so stop/recover can still verify generation+service.
 */
export function createHeartbeatFileOwnershipProbe(
  stateDir: string,
): ProcessOwnershipProbe {
  const lookup = (pid: number): HeartbeatOwnershipFile | null => {
    if (!existsSync(stateDir)) {
      return null;
    }
    let names: string[];
    try {
      names = readdirSync(stateDir).filter(
        (n) => n.startsWith("heartbeat-") && n.endsWith(".json"),
      );
    } catch {
      return null;
    }
    for (const name of names) {
      try {
        const parsed = JSON.parse(
          readFileSync(join(stateDir, name), "utf8"),
        ) as HeartbeatOwnershipFile;
        if (parsed.pid === pid) {
          return parsed;
        }
      } catch {
        /* skip corrupt */
      }
    }
    return null;
  };

  return {
    readCommandLine: (pid) => {
      const hit = lookup(pid);
      if (!hit?.serviceId || !hit.generationId) {
        return null;
      }
      return `worksocial-heartbeat --service ${hit.serviceId} --generation ${hit.generationId}`;
    },
    readEnviron: (pid) => {
      const hit = lookup(pid);
      if (!hit?.serviceId || !hit.generationId) {
        return null;
      }
      return `WORKSOCIAL_SERVICE_ID=${hit.serviceId}\0WORKSOCIAL_GENERATION=${hit.generationId}\0`;
    },
  };
}

export function composeOwnershipProbes(
  ...probes: ProcessOwnershipProbe[]
): ProcessOwnershipProbe {
  return {
    readCommandLine: (pid) => {
      for (const probe of probes) {
        const value = probe.readCommandLine?.(pid) ?? null;
        if (value && value.trim()) {
          return value;
        }
      }
      return null;
    },
    readEnviron: (pid) => {
      for (const probe of probes) {
        const value = probe.readEnviron?.(pid) ?? null;
        if (value && value.trim()) {
          return value;
        }
      }
      return null;
    },
  };
}

/**
 * Returns true only when the live process still advertises our service + generation.
 */
export function verifyProcessOwnership(
  claim: ProcessOwnershipClaim,
  probe: ProcessOwnershipProbe = defaultOwnershipProbe(),
): boolean {
  const cmdline = probe.readCommandLine?.(claim.pid) ?? null;
  const environ = probe.readEnviron?.(claim.pid) ?? null;
  const haystack = `${cmdline ?? ""}\n${environ ?? ""}`;

  if (!haystack.trim()) {
    // No OS identity available (e.g. unsupported platform without heartbeat fallback):
    // deny kill for safety.
    return false;
  }

  const hasGeneration =
    haystack.includes(claim.generationId) ||
    haystack.includes(`WORKSOCIAL_GENERATION=${claim.generationId}`);
  const hasService =
    haystack.includes(`--service ${claim.serviceId}`) ||
    haystack.includes(`WORKSOCIAL_SERVICE_ID=${claim.serviceId}`) ||
    haystack.includes(claim.serviceId);

  return hasGeneration && hasService;
}
