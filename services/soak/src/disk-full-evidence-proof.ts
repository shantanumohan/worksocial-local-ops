/**
 * Fixture proof for T-X004 — disk full during evidence write.
 * ENOSPC must not leave a partial/new COMPLETED evidence manifest.
 * Exercises the same atomicWriteEvidenceJson writer used by release:evidence.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SoakProofKind, type SoakProofRecord } from "@worksocial/domain";
import {
  atomicWriteEvidenceJson,
  createDiskFullInjectedFs,
  readCompletedEvidenceManifest,
  writeCompletedEvidenceManifest,
} from "@worksocial/persistence";

/**
 * Complete expected proof set for T-X004 fixture ACCEPTED.
 */
export function proofDiskFullEvidenceNoPartialCompleted(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const workDir = mkdtempSync(join(tmpdir(), "ws-disk-full-evid-"));

  try {
    // 1. Happy path: atomic write publishes COMPLETED manifest.
    const ok = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-ok",
      createdAtIso: nowIso,
      summary: "fixture evidence happy path",
    });
    if (
      ok.ok &&
      ok.completedManifestExists &&
      ok.status === "COMPLETED" &&
      readCompletedEvidenceManifest(ok.manifestPath)?.status === "COMPLETED"
    ) {
      details.push(
        "Happy-path evidence write → COMPLETED manifest published atomically",
      );
    } else {
      passed = false;
      details.push(`Happy-path unexpectedly ${JSON.stringify(ok)}`);
    }

    // 2. Disk full (ENOSPC) during staging write → no completed manifest.
    const full = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-enospc",
      createdAtIso: nowIso,
      summary: "must not complete under ENOSPC",
      fs: createDiskFullInjectedFs(),
    });
    if (
      !full.ok &&
      full.code === "DISK_FULL" &&
      full.completedManifestExists === false &&
      full.priorCompletedPreserved === false &&
      !existsSync(full.manifestPath) &&
      !existsSync(full.tmpPath) &&
      readCompletedEvidenceManifest(full.manifestPath) === null
    ) {
      details.push(
        "ENOSPC during evidence write → no completed manifest (tmp cleaned)",
      );
    } else {
      passed = false;
      details.push(`Disk-full unexpectedly ${JSON.stringify(full)}`);
    }

    // 3. Shared release-path writer (atomicWriteEvidenceJson) under ENOSPC.
    const releasePath = join(workDir, "evidence-ledger.json");
    const releaseOk = atomicWriteEvidenceJson({
      filePath: releasePath,
      value: { externalEffects: "NONE", note: "release ledger" },
    });
    const releaseFull = atomicWriteEvidenceJson({
      filePath: join(workDir, "art-fixture-t-x004.json"),
      value: { caseId: "T-X004" },
      fs: createDiskFullInjectedFs(),
    });
    if (
      releaseOk.ok &&
      existsSync(releasePath) &&
      !releaseFull.ok &&
      releaseFull.code === "DISK_FULL" &&
      !existsSync(releaseFull.filePath) &&
      releaseFull.priorFilePreserved === false
    ) {
      details.push(
        "release:evidence atomicWriteEvidenceJson ENOSPC → no partial final artifact",
      );
    } else {
      passed = false;
      details.push(
        `Release-path writer unexpectedly ok=${JSON.stringify(releaseOk)} full=${JSON.stringify(releaseFull)}`,
      );
    }

    // 4. Retry ENOSPC must preserve a prior COMPLETED (no data loss).
    const prior = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retry = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-preserve",
      createdAtIso: nowIso,
      summary: "retry",
      fs: createDiskFullInjectedFs(),
    });
    if (
      prior.ok &&
      !retry.ok &&
      retry.priorCompletedPreserved &&
      retry.completedManifestExists &&
      readCompletedEvidenceManifest(prior.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry ENOSPC preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `Preserve-prior unexpectedly prior=${JSON.stringify(prior)} retry=${JSON.stringify(retry)}`,
      );
    }

    details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  return {
    proofId: `proof-disk-full-evidence-${randomUUID()}`,
    kind: SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-disk-full-evid-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
