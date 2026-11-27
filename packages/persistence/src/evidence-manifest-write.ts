/**
 * Atomic evidence writer (T-X004).
 *
 * Disk-full (ENOSPC / EDQUOT) during evidence write must never publish a
 * *new* COMPLETED/partial final file via direct write. Staging goes to a
 * temp file; only a successful rename publishes. Failures clean up the
 * temp from this attempt and never delete a previously committed final
 * path. Live provider wiring stays NOT_WIRED. ACCEPTED ≠ VERIFIED.
 *
 * Used by release:evidence and soak evidence paths — not a standalone
 * unused helper. Fixture / LOCAL_DURABLE only — never invents live VERIFIED.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export const EvidenceManifestStatus = {
  COMPLETED: "COMPLETED",
  FAILED_DISK_FULL: "FAILED_DISK_FULL",
} as const;

export type EvidenceManifestStatusValue =
  (typeof EvidenceManifestStatus)[keyof typeof EvidenceManifestStatus];

/** Body only published at the completed path after atomic rename. */
export type CompletedEvidenceManifest = {
  runId: string;
  status: typeof EvidenceManifestStatus.COMPLETED;
  createdAtIso: string;
  summary: string;
  externalEffects: "NONE";
  liveProviderSuccessClaimed: false;
};

export type EvidenceWriteFs = {
  mkdirSync: (path: string, opts?: { recursive?: boolean }) => void;
  writeFileSync: (
    path: string,
    data: string,
    encoding?: BufferEncoding,
  ) => void;
  renameSync: (from: string, to: string) => void;
  existsSync: (path: string) => boolean;
  unlinkSync: (path: string) => void;
  readFileSync: (path: string, encoding: BufferEncoding) => string;
};

const realFs: EvidenceWriteFs = {
  mkdirSync,
  writeFileSync: (path, data, encoding) =>
    writeFileSync(path, data, encoding ?? "utf8"),
  renameSync,
  existsSync,
  unlinkSync,
  readFileSync: (path, encoding) => readFileSync(path, encoding),
};

/** ENOSPC and EDQUOT both mean "no room to publish a new final". */
export function isDiskFullError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: string }).code;
  return code === "ENOSPC" || code === "EDQUOT";
}

export function classifyEvidenceWriteFailure(err: unknown): {
  code: "DISK_FULL" | "WRITE_FAILED";
  reason: string;
} {
  if (isDiskFullError(err)) {
    const code = (err as { code?: string }).code ?? "ENOSPC";
    return {
      code: "DISK_FULL",
      reason: `${code} during evidence write — no new completed manifest published`,
    };
  }
  const message =
    err instanceof Error ? err.message : `write failed: ${String(err)}`;
  return { code: "WRITE_FAILED", reason: message };
}

export function completedEvidenceManifestPath(
  directory: string,
  runId: string,
): string {
  return join(directory, `${runId}.completed.json`);
}

export function stagingEvidenceManifestPath(
  directory: string,
  runId: string,
): string {
  return join(directory, `${runId}.completed.json.tmp`);
}

const evidenceWriteHonesty = {
  liveProviderWiring: "NOT_WIRED" as const,
  externalEffects: "NONE" as const,
  fixtureOnly: true as const,
};

export type AtomicWriteEvidenceResult =
  | {
      ok: true;
      filePath: string;
      tmpPath: string;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      /** Ok path publishes only via rename — never a partial final. */
      partialFinalPublished: false;
    }
  | {
      ok: false;
      code: "DISK_FULL" | "WRITE_FAILED";
      reason: string;
      filePath: string;
      tmpPath: string;
      tmpCleaned: boolean;
      /** Prior final file left intact when this attempt failed. */
      priorFilePreserved: boolean;
      /** Failures must never leave a new truncated final. */
      partialFinalPublished: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
    };

/**
 * Atomic JSON evidence write (temp + rename) used by release:evidence
 * and completed-manifest publishing. On failure, only the staging tmp
 * from this attempt is cleaned — never unlink an existing final path.
 */
export function atomicWriteEvidenceJson(input: {
  filePath: string;
  value: unknown;
  fs?: EvidenceWriteFs;
}): AtomicWriteEvidenceResult {
  const fs = input.fs ?? realFs;
  const filePath = input.filePath;
  const tmpPath = `${filePath}.tmp`;
  const priorExisted = fs.existsSync(filePath);
  const payload = JSON.stringify(input.value, null, 2);

  try {
    fs.mkdirSync(dirname(filePath), { recursive: true });
    // Never write directly to the final path (avoids truncated/partial finals).
    fs.writeFileSync(tmpPath, payload, "utf8");
    fs.renameSync(tmpPath, filePath);
    return {
      ok: true,
      filePath,
      tmpPath,
      partialFinalPublished: false,
      ...evidenceWriteHonesty,
    };
  } catch (err) {
    const classified = classifyEvidenceWriteFailure(err);
    let tmpCleaned = false;
    try {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
        tmpCleaned = true;
      }
    } catch {
      // Best-effort tmp cleanup only.
    }
    // P2: never delete a previously committed final file on retry failure.
    const priorFilePreserved = priorExisted && fs.existsSync(filePath);
    return {
      ok: false,
      code: classified.code,
      reason: classified.reason,
      filePath,
      tmpPath,
      tmpCleaned,
      priorFilePreserved,
      partialFinalPublished: false,
      ...evidenceWriteHonesty,
    };
  }
}

export type WriteEvidenceManifestResult =
  | {
      ok: true;
      manifestPath: string;
      tmpPath: string;
      status: typeof EvidenceManifestStatus.COMPLETED;
      completedManifestExists: true;
      manifest: CompletedEvidenceManifest;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      partialFinalPublished: false;
    }
  | {
      ok: false;
      code: "DISK_FULL" | "WRITE_FAILED" | "INVALID_RUN_ID";
      reason: string;
      manifestPath: string;
      tmpPath: string;
      /**
       * True only when a prior COMPLETED at the final path remains
       * (retry failure). Fresh ENOSPC → false (no partial COMPLETED).
       */
      completedManifestExists: boolean;
      tmpCleaned: boolean;
      priorCompletedPreserved: boolean;
      partialFinalPublished: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
    };

/** Safe run ids only — no path separators / traversal (T-X004 deepen). */
const SAFE_RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isSafeEvidenceRunId(runId: string): boolean {
  return SAFE_RUN_ID.test(runId);
}

/**
 * Write a COMPLETED evidence manifest via the shared atomic writer.
 * On ENOSPC/EDQUOT (or any write/rename failure): clean temp from this
 * attempt; leave any previously committed COMPLETED intact.
 */
export function writeCompletedEvidenceManifest(input: {
  directory: string;
  runId: string;
  createdAtIso: string;
  summary: string;
  fs?: EvidenceWriteFs;
}): WriteEvidenceManifestResult {
  const fs = input.fs ?? realFs;
  const runId = input.runId.trim();
  const manifestPath = completedEvidenceManifestPath(
    input.directory,
    runId || "invalid",
  );
  const tmpPath = stagingEvidenceManifestPath(
    input.directory,
    runId || "invalid",
  );

  if (
    !runId ||
    runId.includes("\0") ||
    runId.includes("\\") ||
    /\s/.test(runId) ||
    /[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(runId) ||
    runId.startsWith("-") ||
    runId.startsWith(".") ||
    runId.endsWith(".") ||
    runId.includes("..") ||
    !isSafeEvidenceRunId(runId)
  ) {
    return {
      ok: false,
      code: "INVALID_RUN_ID",
      reason:
        "runId must be a plain token without path separators/traversal/NUL/whitespace/control/dot-edge/.. (T-X004)",
      manifestPath,
      tmpPath,
      completedManifestExists: false,
      tmpCleaned: true,
      priorCompletedPreserved: false,
      partialFinalPublished: false,
      ...evidenceWriteHonesty,
    };
  }

  const manifest: CompletedEvidenceManifest = {
    runId,
    status: EvidenceManifestStatus.COMPLETED,
    createdAtIso: input.createdAtIso,
    summary: input.summary,
    externalEffects: "NONE",
    liveProviderSuccessClaimed: false,
  };

  const written = atomicWriteEvidenceJson({
    filePath: manifestPath,
    value: manifest,
    fs,
  });

  if (written.ok) {
    return {
      ok: true,
      manifestPath,
      tmpPath: written.tmpPath,
      status: EvidenceManifestStatus.COMPLETED,
      completedManifestExists: true,
      manifest,
      partialFinalPublished: false,
      ...evidenceWriteHonesty,
    };
  }

  const completedStillThere =
    written.priorFilePreserved &&
    readCompletedEvidenceManifest(manifestPath, fs) !== null;

  return {
    ok: false,
    code: written.code,
    reason: written.reason,
    manifestPath,
    tmpPath: written.tmpPath,
    completedManifestExists: completedStillThere,
    tmpCleaned: written.tmpCleaned,
    priorCompletedPreserved: written.priorFilePreserved,
    partialFinalPublished: false,
    ...evidenceWriteHonesty,
  };
}

/**
 * Read a completed evidence manifest, or null if missing / not COMPLETED.
 * Partial or non-COMPLETED files do not count as completed manifests.
 */
export function readCompletedEvidenceManifest(
  manifestPath: string,
  fs: EvidenceWriteFs = realFs,
): CompletedEvidenceManifest | null {
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      status?: string;
      runId?: string;
      createdAtIso?: string;
      summary?: string;
      externalEffects?: string;
      liveProviderSuccessClaimed?: boolean;
    };
    if (parsed.status !== EvidenceManifestStatus.COMPLETED) {
      return null;
    }
    if (
      typeof parsed.runId !== "string" ||
      typeof parsed.createdAtIso !== "string" ||
      typeof parsed.summary !== "string"
    ) {
      return null;
    }
    // Honesty: never treat a live-success claim as a completed fixture manifest.
    if (parsed.liveProviderSuccessClaimed === true) {
      return null;
    }
    return {
      runId: parsed.runId,
      status: EvidenceManifestStatus.COMPLETED,
      createdAtIso: parsed.createdAtIso,
      summary: parsed.summary,
      externalEffects: "NONE",
      liveProviderSuccessClaimed: false,
    };
  } catch {
    return null;
  }
}

function diskFullError(code: "ENOSPC" | "EDQUOT", message: string): Error & {
  code: string;
} {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  return err;
}

/**
 * Fixture helper: create an EvidenceWriteFs that throws ENOSPC on writeFileSync.
 */
export function createDiskFullInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    writeFileSync() {
      throw diskFullError("ENOSPC", "ENOSPC: no space left on device");
    },
  };
}

/**
 * Fixture helper: staging write succeeds; rename throws ENOSPC (T-X004).
 * Must still clean tmp and never publish a partial final.
 */
export function createDiskFullOnRenameInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    renameSync() {
      throw diskFullError("ENOSPC", "ENOSPC: no space left on device (rename)");
    },
  };
}

/**
 * Fixture helper: quota exhaustion (EDQUOT) on write — same as disk-full.
 */
export function createEdquotInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    writeFileSync() {
      throw diskFullError("EDQUOT", "EDQUOT: disk quota exceeded");
    },
  };
}

/**
 * Fixture helper: mkdir throws ENOSPC before any staging write (T-X004 deepen).
 */
export function createDiskFullOnMkdirInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    mkdirSync() {
      throw diskFullError("ENOSPC", "ENOSPC: no space left on device (mkdir)");
    },
  };
}

/**
 * Fixture helper: rename throws EIO (not disk-full) — WRITE_FAILED, still no
 * partial final; tmp cleaned (T-X004 deepen).
 */
export function createEioOnRenameInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    renameSync() {
      const err = new Error("EIO: i/o error (rename)") as Error & {
        code: string;
      };
      err.code = "EIO";
      throw err;
    },
  };
}

/**
 * Fixture helper: EDQUOT on rename — same DISK_FULL honesty as write EDQUOT
 * (T-X004 wave-12 deepen).
 */
export function createEdquotOnRenameInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    renameSync() {
      throw diskFullError("EDQUOT", "EDQUOT: disk quota exceeded (rename)");
    },
  };
}

/**
 * Fixture helper: EIO on staging writeFileSync — WRITE_FAILED; no final
 * (T-X004 wave-12 deepen).
 */
export function createEioOnWriteInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    writeFileSync() {
      const err = new Error("EIO: i/o error (write)") as Error & {
        code: string;
      };
      err.code = "EIO";
      throw err;
    },
  };
}

/**
 * Fixture helper: EDQUOT on mkdir (T-X004 wave-14 deepen).
 */
export function createEdquotOnMkdirInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    mkdirSync() {
      throw diskFullError("EDQUOT", "EDQUOT: disk quota exceeded (mkdir)");
    },
  };
}

/**
 * Fixture helper: EACCES on staging write — WRITE_FAILED; no final
 * (T-X004 wave-14 deepen).
 */
export function createEaccesOnWriteInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    writeFileSync() {
      const err = new Error("EACCES: permission denied (write)") as Error & {
        code: string;
      };
      err.code = "EACCES";
      throw err;
    },
  };
}

/**
 * Fixture helper: EACCES on mkdir (T-X004 wave-16 deepen).
 */
export function createEaccesOnMkdirInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    mkdirSync() {
      const err = new Error("EACCES: permission denied (mkdir)") as Error & {
        code: string;
      };
      err.code = "EACCES";
      throw err;
    },
  };
}

/**
 * Fixture helper: EACCES on rename — WRITE_FAILED; tmp cleaned
 * (T-X004 wave-16 deepen).
 */
export function createEaccesOnRenameInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    renameSync() {
      const err = new Error("EACCES: permission denied (rename)") as Error & {
        code: string;
      };
      err.code = "EACCES";
      throw err;
    },
  };
}

/**
 * Fixture helper: EIO on mkdir (T-X004 wave-18 deepen).
 */
export function createEioOnMkdirInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    mkdirSync() {
      const err = new Error("EIO: i/o error (mkdir)") as Error & {
        code: string;
      };
      err.code = "EIO";
      throw err;
    },
  };
}

/**
 * Fixture helper: EPERM on staging write — WRITE_FAILED; no final
 * (T-X004 wave-18 deepen).
 */
export function createEpermOnWriteInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    writeFileSync() {
      const err = new Error("EPERM: operation not permitted (write)") as Error & {
        code: string;
      };
      err.code = "EPERM";
      throw err;
    },
  };
}

/**
 * Fixture helper: EPERM on rename — WRITE_FAILED; tmp cleaned
 * (T-X004 wave-20 deepen).
 */
export function createEpermOnRenameInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    renameSync() {
      const err = new Error("EPERM: operation not permitted (rename)") as Error & {
        code: string;
      };
      err.code = "EPERM";
      throw err;
    },
  };
}

/**
 * Fixture helper: EPERM on mkdir — WRITE_FAILED; no partial final
 * (T-X004 wave-20 deepen).
 */
export function createEpermOnMkdirInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    mkdirSync() {
      const err = new Error("EPERM: operation not permitted (mkdir)") as Error & {
        code: string;
      };
      err.code = "EPERM";
      throw err;
    },
  };
}
