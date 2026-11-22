/**
 * Atomic evidence writer (T-X004).
 *
 * Disk-full (ENOSPC) during evidence write must never publish a *new*
 * COMPLETED/partial final file via direct write. Staging goes to a temp
 * file; only a successful rename publishes. Failures clean up the temp
 * from this attempt and never delete a previously committed final path.
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

export function isDiskFullError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  return (err as { code?: string }).code === "ENOSPC";
}

export function classifyEvidenceWriteFailure(err: unknown): {
  code: "DISK_FULL" | "WRITE_FAILED";
  reason: string;
} {
  if (isDiskFullError(err)) {
    return {
      code: "DISK_FULL",
      reason: "ENOSPC during evidence write — no new completed manifest published",
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

export type AtomicWriteEvidenceResult =
  | {
      ok: true;
      filePath: string;
      tmpPath: string;
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
    return { ok: true, filePath, tmpPath };
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
    }
  | {
      ok: false;
      code: "DISK_FULL" | "WRITE_FAILED";
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
    };

/**
 * Write a COMPLETED evidence manifest via the shared atomic writer.
 * On ENOSPC (or any write/rename failure): clean temp from this attempt;
 * leave any previously committed COMPLETED intact.
 */
export function writeCompletedEvidenceManifest(input: {
  directory: string;
  runId: string;
  createdAtIso: string;
  summary: string;
  fs?: EvidenceWriteFs;
}): WriteEvidenceManifestResult {
  const fs = input.fs ?? realFs;
  const manifestPath = completedEvidenceManifestPath(
    input.directory,
    input.runId,
  );
  const manifest: CompletedEvidenceManifest = {
    runId: input.runId,
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

/**
 * Fixture helper: create an EvidenceWriteFs that throws ENOSPC on writeFileSync.
 */
export function createDiskFullInjectedFs(
  base: EvidenceWriteFs = realFs,
): EvidenceWriteFs {
  return {
    ...base,
    writeFileSync() {
      const err = new Error("ENOSPC: no space left on device") as Error & {
        code: string;
      };
      err.code = "ENOSPC";
      throw err;
    },
  };
}
