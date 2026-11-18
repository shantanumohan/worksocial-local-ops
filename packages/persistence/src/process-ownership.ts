/**
 * Verify a PID still belongs to a WorkSocial slot before SIGTERM/SIGKILL.
 * Guards against PID reuse after a crash.
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

export function defaultOwnershipProbe(): ProcessOwnershipProbe {
  if (existsSync("/proc")) {
    return {
      readCommandLine: readLinuxCmdline,
      readEnviron: readLinuxEnviron,
    };
  }
  return {};
}

/**
 * Returns true only when the live process still advertises our service + generation.
 */
export function verifyProcessOwnership(
  claim: ProcessOwnershipClaim,
  probe: ProcessOwnershipProbe = defaultOwnershipProbe(),
): boolean {
  const markers = [
    claim.generationId,
    `WORKSOCIAL_GENERATION=${claim.generationId}`,
    `--generation`,
    claim.serviceId,
    `WORKSOCIAL_SERVICE_ID=${claim.serviceId}`,
  ];

  const cmdline = probe.readCommandLine?.(claim.pid) ?? null;
  const environ = probe.readEnviron?.(claim.pid) ?? null;
  const haystack = `${cmdline ?? ""}\n${environ ?? ""}`;

  if (!haystack.trim()) {
    // No OS identity available (e.g. in-memory tests / unsupported platform):
    // require an explicit probe that confirms ownership via callback absence = deny for kill safety
    // except when probe provides a custom confirm.
    return false;
  }

  const hasGeneration =
    haystack.includes(claim.generationId) ||
    haystack.includes(`WORKSOCIAL_GENERATION=${claim.generationId}`);
  const hasService =
    haystack.includes(`--service ${claim.serviceId}`) ||
    haystack.includes(`WORKSOCIAL_SERVICE_ID=${claim.serviceId}`) ||
    haystack.includes(claim.serviceId);

  return hasGeneration && hasService && markers.length > 0;
}
