/**
 * Verify a PID still belongs to a WorkSocial slot before SIGTERM/SIGKILL.
 * Guards against PID reuse after a crash.
 *
 * Preferred probe: Linux `/proc/<pid>/{cmdline,environ}`.
 * Empty probe → deny kill (fail-closed).
 *
 * Do NOT authorize kill from persisted heartbeat JSON alone: after a crash the
 * file can outlive the process, and a reused PID would pass a stale claim.
 * Same-process spawn maps (supervisor spawner session) are the non-/proc path.
 */

import { existsSync, readFileSync } from "node:fs";
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
  /**
   * Always false for kill authorization — heartbeat files are not live process identity.
   * Kept for doctor/API shape compatibility.
   */
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
  _heartbeatFallbackIgnored: boolean = false,
): OwnershipProbeCapability {
  const procAvailable = isProcOwnershipAvailable();
  if (procAvailable) {
    return {
      procAvailable: true,
      heartbeatFallback: false,
      detail:
        "Linux /proc ownership probe available for stop/recover kills. Heartbeat files are health signals only — not kill authorization (PID-reuse safe).",
    };
  }
  return {
    procAvailable: false,
    heartbeatFallback: false,
    detail:
      "Linux /proc unavailable — stopOwned denies kill unless this supervisor session spawned the PID (fail-closed). Heartbeat files must not authorize SIGTERM. Windows AgenticArmyWS bind is AA-12 / out of scope.",
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
 * Returns true only when the live process still advertises our service + generation
 * via an OS ownership probe (/proc cmdline/environ). Heartbeat files must not be
 * passed as the probe for kill authorization.
 */
export function verifyProcessOwnership(
  claim: ProcessOwnershipClaim,
  probe: ProcessOwnershipProbe = defaultOwnershipProbe(),
): boolean {
  const cmdline = probe.readCommandLine?.(claim.pid) ?? null;
  const environ = probe.readEnviron?.(claim.pid) ?? null;
  const haystack = `${cmdline ?? ""}\n${environ ?? ""}`;

  if (!haystack.trim()) {
    // No OS identity available — deny kill for safety (PID-reuse fail-closed).
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
