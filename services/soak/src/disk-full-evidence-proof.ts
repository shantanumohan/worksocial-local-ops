/**
 * Fixture proof for T-X004 — disk full during evidence write.
 * ENOSPC/EDQUOT must not leave a partial/new COMPLETED evidence manifest.
 * Exercises the same atomicWriteEvidenceJson writer used by release:evidence.
 * Hillclimb/deepen: honesty stamps; rename/mkdir ENOSPC; EDQUOT; EIO≠disk-full;
 * safe runId; junk non-COMPLETED ignored. Wave-12: EDQUOT-on-rename;
 * EIO-on-write; corrupt JSON; rename-ENOSPC preserves prior; slash/overlong
 * runId. Wave-14: EDQUOT-on-mkdir; EACCES-on-write; NUL runId; rename-EDQUOT
 * preserves prior; refuse liveProviderSuccessClaimed. Wave-16: EACCES
 * mkdir/rename; empty final; backslash runId; write-EDQUOT preserves prior.
 * Wave-18: EIO-on-mkdir; EPERM-on-write; whitespace/leading-dash runId;
 * write-EACCES preserves prior. Wave-20: EPERM-on-rename/mkdir; C0 control
 * runId refuse; write-EPERM preserves prior. Wave-21: EPERM rename/mkdir
 * prior-preserve; leading-dot / DEL runId refuse. Wave-22: trailing-dot /
 * `..` runId refuse; EIO write/rename prior-preserve. Wave-23: release-path
 * atomicWriteEvidenceJson rename-EIO prior-file preserve. Wave-24: release-path
 * write-EIO prior-file preserve. Wave-25: release-path write-EDQUOT
 * prior-file preserve. External effects: NONE.
 * NOT_WIRED. ACCEPTED ≠ VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SoakProofKind, type SoakProofRecord } from "@worksocial/domain";
import {
  atomicWriteEvidenceJson,
  createDiskFullInjectedFs,
  createDiskFullOnMkdirInjectedFs,
  createDiskFullOnRenameInjectedFs,
  createEaccesOnMkdirInjectedFs,
  createEaccesOnRenameInjectedFs,
  createEaccesOnWriteInjectedFs,
  createEdquotInjectedFs,
  createEdquotOnMkdirInjectedFs,
  createEdquotOnRenameInjectedFs,
  createEioOnMkdirInjectedFs,
  createEioOnRenameInjectedFs,
  createEioOnWriteInjectedFs,
  createEpermOnMkdirInjectedFs,
  createEpermOnRenameInjectedFs,
  createEpermOnWriteInjectedFs,
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
      ok.partialFinalPublished === false &&
      ok.liveProviderWiring === "NOT_WIRED" &&
      ok.externalEffects === "NONE" &&
      readCompletedEvidenceManifest(ok.manifestPath)?.status === "COMPLETED"
    ) {
      details.push(
        "Happy-path evidence write → COMPLETED manifest published atomically; honesty stamps",
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
      full.partialFinalPublished === false &&
      !existsSync(full.manifestPath) &&
      !existsSync(full.tmpPath) &&
      readCompletedEvidenceManifest(full.manifestPath) === null
    ) {
      details.push(
        "ENOSPC during evidence write → no completed manifest (tmp cleaned); partialFinalPublished=false",
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
      releaseOk.partialFinalPublished === false &&
      existsSync(releasePath) &&
      !releaseFull.ok &&
      releaseFull.code === "DISK_FULL" &&
      releaseFull.partialFinalPublished === false &&
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
      retry.partialFinalPublished === false &&
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

    // 5. ENOSPC on rename — tmp cleaned; no final.
    const renameFull = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-rename-enospc",
      createdAtIso: nowIso,
      summary: "rename ENOSPC",
      fs: createDiskFullOnRenameInjectedFs(),
    });
    if (
      !renameFull.ok &&
      renameFull.code === "DISK_FULL" &&
      renameFull.partialFinalPublished === false &&
      !existsSync(renameFull.manifestPath) &&
      !existsSync(renameFull.tmpPath)
    ) {
      details.push(
        "ENOSPC on rename → tmp cleaned; no completed/partial final",
      );
    } else {
      passed = false;
      details.push(`Rename ENOSPC unexpectedly ${JSON.stringify(renameFull)}`);
    }

    // 6. EDQUOT classified as DISK_FULL.
    const edquot = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-edquot",
      createdAtIso: nowIso,
      summary: "quota",
      fs: createEdquotInjectedFs(),
    });
    if (
      !edquot.ok &&
      edquot.code === "DISK_FULL" &&
      edquot.partialFinalPublished === false &&
      !existsSync(edquot.manifestPath)
    ) {
      details.push("EDQUOT → DISK_FULL; no partial final");
    } else {
      passed = false;
      details.push(`EDQUOT unexpectedly ${JSON.stringify(edquot)}`);
    }

    // 7. Empty runId refused.
    const badId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "  ",
      createdAtIso: nowIso,
      summary: "invalid",
    });
    if (
      !badId.ok &&
      badId.code === "INVALID_RUN_ID" &&
      badId.partialFinalPublished === false
    ) {
      details.push("Empty runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(`Empty runId unexpectedly ${JSON.stringify(badId)}`);
    }

    // 8. Path-traversal runId refused (deepen).
    const traversal = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "../escape",
      createdAtIso: nowIso,
      summary: "traversal",
    });
    if (
      !traversal.ok &&
      traversal.code === "INVALID_RUN_ID" &&
      traversal.partialFinalPublished === false
    ) {
      details.push("Path-traversal runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(`Traversal runId unexpectedly ${JSON.stringify(traversal)}`);
    }

    // 9. ENOSPC on mkdir (deepen).
    const mkdirFull = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-mkdir-enospc",
      createdAtIso: nowIso,
      summary: "mkdir ENOSPC",
      fs: createDiskFullOnMkdirInjectedFs(),
    });
    if (
      !mkdirFull.ok &&
      mkdirFull.code === "DISK_FULL" &&
      mkdirFull.partialFinalPublished === false &&
      !existsSync(mkdirFull.manifestPath)
    ) {
      details.push("ENOSPC on mkdir → DISK_FULL; no partial final");
    } else {
      passed = false;
      details.push(`Mkdir ENOSPC unexpectedly ${JSON.stringify(mkdirFull)}`);
    }

    // 10. EIO on rename → WRITE_FAILED; tmp cleaned (deepen).
    const eioRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eio-rename",
      createdAtIso: nowIso,
      summary: "eio rename",
      fs: createEioOnRenameInjectedFs(),
    });
    if (
      !eioRename.ok &&
      eioRename.code === "WRITE_FAILED" &&
      eioRename.partialFinalPublished === false &&
      !existsSync(eioRename.manifestPath) &&
      !existsSync(eioRename.tmpPath)
    ) {
      details.push("EIO on rename → WRITE_FAILED; tmp cleaned; no partial final");
    } else {
      passed = false;
      details.push(`EIO rename unexpectedly ${JSON.stringify(eioRename)}`);
    }

    // 11. Non-COMPLETED junk at final path is not a completed manifest (deepen).
    const junkPath = join(workDir, "run-junk.completed.json");
    writeFileSync(
      junkPath,
      JSON.stringify({ status: "FAILED_DISK_FULL", runId: "run-junk" }),
      "utf8",
    );
    const junkRead = readCompletedEvidenceManifest(junkPath);
    const junkRetry = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-junk",
      createdAtIso: nowIso,
      summary: "overwrite junk",
      fs: createDiskFullInjectedFs(),
    });
    if (
      junkRead === null &&
      !junkRetry.ok &&
      junkRetry.completedManifestExists === false &&
      junkRetry.partialFinalPublished === false
    ) {
      details.push(
        "Non-COMPLETED junk at final path ignored; ENOSPC retry → completedManifestExists=false",
      );
    } else {
      passed = false;
      details.push(
        `Junk path unexpectedly read=${JSON.stringify(junkRead)} retry=${JSON.stringify(junkRetry)}`,
      );
    }

    // 12. EDQUOT on rename (wave-12 deepen).
    const edquotRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-edquot-rename",
      createdAtIso: nowIso,
      summary: "edquot rename",
      fs: createEdquotOnRenameInjectedFs(),
    });
    if (
      !edquotRename.ok &&
      edquotRename.code === "DISK_FULL" &&
      edquotRename.partialFinalPublished === false &&
      !existsSync(edquotRename.manifestPath) &&
      !existsSync(edquotRename.tmpPath)
    ) {
      details.push("EDQUOT on rename → DISK_FULL; tmp cleaned; no partial final");
    } else {
      passed = false;
      details.push(`EDQUOT rename unexpectedly ${JSON.stringify(edquotRename)}`);
    }

    // 13. EIO on staging write (wave-12 deepen).
    const eioWrite = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eio-write",
      createdAtIso: nowIso,
      summary: "eio write",
      fs: createEioOnWriteInjectedFs(),
    });
    if (
      !eioWrite.ok &&
      eioWrite.code === "WRITE_FAILED" &&
      eioWrite.partialFinalPublished === false &&
      !existsSync(eioWrite.manifestPath) &&
      !existsSync(eioWrite.tmpPath)
    ) {
      details.push("EIO on staging write → WRITE_FAILED; no partial final");
    } else {
      passed = false;
      details.push(`EIO write unexpectedly ${JSON.stringify(eioWrite)}`);
    }

    // 14. Truncated/corrupt JSON at final path ≠ COMPLETED (wave-12 deepen).
    const corruptPath = join(workDir, "run-corrupt.completed.json");
    writeFileSync(corruptPath, '{"status":"COMPLETED","runId":', "utf8");
    if (readCompletedEvidenceManifest(corruptPath) === null) {
      details.push("Truncated/corrupt JSON at final path ignored (not COMPLETED)");
    } else {
      passed = false;
      details.push("Corrupt JSON unexpectedly parsed as COMPLETED");
    }

    // 15. Prior COMPLETED preserved when retry hits rename ENOSPC (wave-12).
    const priorRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-rename-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-rename-preserve",
      createdAtIso: nowIso,
      summary: "retry rename ENOSPC",
      fs: createDiskFullOnRenameInjectedFs(),
    });
    if (
      priorRename.ok &&
      !retryRename.ok &&
      retryRename.code === "DISK_FULL" &&
      retryRename.priorCompletedPreserved &&
      retryRename.completedManifestExists &&
      retryRename.partialFinalPublished === false &&
      readCompletedEvidenceManifest(priorRename.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry rename ENOSPC preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `Rename-preserve unexpectedly prior=${JSON.stringify(priorRename)} retry=${JSON.stringify(retryRename)}`,
      );
    }

    // 16. Slash / overlong runId refused (wave-12 deepen).
    const slashId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "foo/bar",
      createdAtIso: nowIso,
      summary: "slash",
    });
    const longId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "a".repeat(129),
      createdAtIso: nowIso,
      summary: "overlong",
    });
    if (
      !slashId.ok &&
      slashId.code === "INVALID_RUN_ID" &&
      slashId.partialFinalPublished === false &&
      !longId.ok &&
      longId.code === "INVALID_RUN_ID" &&
      longId.partialFinalPublished === false
    ) {
      details.push("Slash/overlong runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(
        `Slash/overlong unexpectedly slash=${JSON.stringify(slashId)} long=${JSON.stringify(longId)}`,
      );
    }

    // 17. EDQUOT on mkdir (wave-14 deepen).
    const edquotMkdir = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-edquot-mkdir",
      createdAtIso: nowIso,
      summary: "edquot mkdir",
      fs: createEdquotOnMkdirInjectedFs(),
    });
    if (
      !edquotMkdir.ok &&
      edquotMkdir.code === "DISK_FULL" &&
      edquotMkdir.partialFinalPublished === false &&
      !existsSync(edquotMkdir.manifestPath)
    ) {
      details.push("EDQUOT on mkdir → DISK_FULL; no partial final");
    } else {
      passed = false;
      details.push(`EDQUOT mkdir unexpectedly ${JSON.stringify(edquotMkdir)}`);
    }

    // 18. EACCES on staging write (wave-14 deepen).
    const eaccesWrite = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eacces-write",
      createdAtIso: nowIso,
      summary: "eacces write",
      fs: createEaccesOnWriteInjectedFs(),
    });
    if (
      !eaccesWrite.ok &&
      eaccesWrite.code === "WRITE_FAILED" &&
      eaccesWrite.partialFinalPublished === false &&
      !existsSync(eaccesWrite.manifestPath) &&
      !existsSync(eaccesWrite.tmpPath)
    ) {
      details.push("EACCES on staging write → WRITE_FAILED; no partial final");
    } else {
      passed = false;
      details.push(`EACCES write unexpectedly ${JSON.stringify(eaccesWrite)}`);
    }

    // 19. NUL in runId refused (wave-14 deepen).
    const nulId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run\0evil",
      createdAtIso: nowIso,
      summary: "nul",
    });
    if (
      !nulId.ok &&
      nulId.code === "INVALID_RUN_ID" &&
      nulId.partialFinalPublished === false
    ) {
      details.push("NUL in runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(`NUL runId unexpectedly ${JSON.stringify(nulId)}`);
    }

    // 20. Prior COMPLETED preserved when retry hits rename EDQUOT (wave-14).
    const priorEdquot = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-edquot-rename-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEdquot = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-edquot-rename-preserve",
      createdAtIso: nowIso,
      summary: "retry edquot rename",
      fs: createEdquotOnRenameInjectedFs(),
    });
    if (
      priorEdquot.ok &&
      !retryEdquot.ok &&
      retryEdquot.code === "DISK_FULL" &&
      retryEdquot.priorCompletedPreserved &&
      retryEdquot.completedManifestExists &&
      retryEdquot.partialFinalPublished === false &&
      readCompletedEvidenceManifest(priorEdquot.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry rename EDQUOT preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EDQUOT-rename-preserve unexpectedly prior=${JSON.stringify(priorEdquot)} retry=${JSON.stringify(retryEdquot)}`,
      );
    }

    // 21. Refuse liveProviderSuccessClaimed=true (wave-14 deepen).
    const liveClaimPath = join(workDir, "run-live-claim.completed.json");
    writeFileSync(
      liveClaimPath,
      JSON.stringify({
        status: "COMPLETED",
        runId: "run-live-claim",
        createdAtIso: nowIso,
        summary: "forged live claim",
        liveProviderSuccessClaimed: true,
      }),
      "utf8",
    );
    if (readCompletedEvidenceManifest(liveClaimPath) === null) {
      details.push(
        "liveProviderSuccessClaimed=true refused as completed manifest",
      );
    } else {
      passed = false;
      details.push("liveProviderSuccessClaimed=true unexpectedly accepted");
    }

    // 22. EACCES on mkdir (wave-16 deepen).
    const eaccesMkdir = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eacces-mkdir",
      createdAtIso: nowIso,
      summary: "eacces mkdir",
      fs: createEaccesOnMkdirInjectedFs(),
    });
    if (
      !eaccesMkdir.ok &&
      eaccesMkdir.code === "WRITE_FAILED" &&
      eaccesMkdir.partialFinalPublished === false &&
      !existsSync(eaccesMkdir.manifestPath)
    ) {
      details.push("EACCES on mkdir → WRITE_FAILED; no partial final");
    } else {
      passed = false;
      details.push(`EACCES mkdir unexpectedly ${JSON.stringify(eaccesMkdir)}`);
    }

    // 23. EACCES on rename (wave-16 deepen).
    const eaccesRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eacces-rename",
      createdAtIso: nowIso,
      summary: "eacces rename",
      fs: createEaccesOnRenameInjectedFs(),
    });
    if (
      !eaccesRename.ok &&
      eaccesRename.code === "WRITE_FAILED" &&
      eaccesRename.partialFinalPublished === false &&
      !existsSync(eaccesRename.manifestPath) &&
      !existsSync(eaccesRename.tmpPath)
    ) {
      details.push("EACCES on rename → WRITE_FAILED; tmp cleaned; no partial final");
    } else {
      passed = false;
      details.push(
        `EACCES rename unexpectedly ${JSON.stringify(eaccesRename)}`,
      );
    }

    // 24. Empty final path ≠ COMPLETED (wave-16 deepen).
    const emptyPath = join(workDir, "run-empty.completed.json");
    writeFileSync(emptyPath, "", "utf8");
    if (readCompletedEvidenceManifest(emptyPath) === null) {
      details.push("Empty final path ignored (not COMPLETED)");
    } else {
      passed = false;
      details.push("Empty final unexpectedly parsed as COMPLETED");
    }

    // 25. Backslash runId refused (wave-16 deepen).
    const backslashId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "foo\\bar",
      createdAtIso: nowIso,
      summary: "backslash",
    });
    if (
      !backslashId.ok &&
      backslashId.code === "INVALID_RUN_ID" &&
      backslashId.partialFinalPublished === false
    ) {
      details.push("Backslash runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(
        `Backslash runId unexpectedly ${JSON.stringify(backslashId)}`,
      );
    }

    // 26. Prior COMPLETED preserved when retry hits write EDQUOT (wave-16).
    const priorEdquotWrite = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-edquot-write-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEdquotWrite = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-edquot-write-preserve",
      createdAtIso: nowIso,
      summary: "retry edquot write",
      fs: createEdquotInjectedFs(),
    });
    if (
      priorEdquotWrite.ok &&
      !retryEdquotWrite.ok &&
      retryEdquotWrite.code === "DISK_FULL" &&
      retryEdquotWrite.priorCompletedPreserved &&
      retryEdquotWrite.completedManifestExists &&
      retryEdquotWrite.partialFinalPublished === false &&
      readCompletedEvidenceManifest(priorEdquotWrite.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry write EDQUOT preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EDQUOT-write-preserve unexpectedly prior=${JSON.stringify(priorEdquotWrite)} retry=${JSON.stringify(retryEdquotWrite)}`,
      );
    }

    // 27. EIO on mkdir (wave-18 deepen).
    const eioMkdir = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eio-mkdir",
      createdAtIso: nowIso,
      summary: "eio mkdir",
      fs: createEioOnMkdirInjectedFs(),
    });
    if (
      !eioMkdir.ok &&
      eioMkdir.code === "WRITE_FAILED" &&
      eioMkdir.partialFinalPublished === false &&
      !existsSync(eioMkdir.manifestPath)
    ) {
      details.push("EIO on mkdir → WRITE_FAILED; no partial final");
    } else {
      passed = false;
      details.push(`EIO mkdir unexpectedly ${JSON.stringify(eioMkdir)}`);
    }

    // 28. EPERM on staging write (wave-18 deepen).
    const epermWrite = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-write",
      createdAtIso: nowIso,
      summary: "eperm write",
      fs: createEpermOnWriteInjectedFs(),
    });
    if (
      !epermWrite.ok &&
      epermWrite.code === "WRITE_FAILED" &&
      epermWrite.partialFinalPublished === false &&
      !existsSync(epermWrite.manifestPath) &&
      !existsSync(epermWrite.tmpPath)
    ) {
      details.push("EPERM on staging write → WRITE_FAILED; no partial final");
    } else {
      passed = false;
      details.push(`EPERM write unexpectedly ${JSON.stringify(epermWrite)}`);
    }

    // 29. Whitespace / leading-dash runId refused (wave-18 deepen).
    const spacedId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run id",
      createdAtIso: nowIso,
      summary: "space",
    });
    const dashId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "-run",
      createdAtIso: nowIso,
      summary: "dash",
    });
    if (
      !spacedId.ok &&
      spacedId.code === "INVALID_RUN_ID" &&
      spacedId.partialFinalPublished === false &&
      !dashId.ok &&
      dashId.code === "INVALID_RUN_ID" &&
      dashId.partialFinalPublished === false
    ) {
      details.push("Whitespace/leading-dash runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(
        `Whitespace/dash unexpectedly spaced=${JSON.stringify(spacedId)} dash=${JSON.stringify(dashId)}`,
      );
    }

    // 30. Prior COMPLETED preserved when retry hits write EACCES (wave-18).
    const priorEacces = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eacces-write-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEacces = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eacces-write-preserve",
      createdAtIso: nowIso,
      summary: "retry eacces write",
      fs: createEaccesOnWriteInjectedFs(),
    });
    if (
      priorEacces.ok &&
      !retryEacces.ok &&
      retryEacces.code === "WRITE_FAILED" &&
      retryEacces.priorCompletedPreserved &&
      retryEacces.completedManifestExists &&
      retryEacces.partialFinalPublished === false &&
      readCompletedEvidenceManifest(priorEacces.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry write EACCES preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EACCES-write-preserve unexpectedly prior=${JSON.stringify(priorEacces)} retry=${JSON.stringify(retryEacces)}`,
      );
    }

    // 31. EPERM on rename (wave-20 deepen).
    const epermRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-rename",
      createdAtIso: nowIso,
      summary: "eperm rename",
      fs: createEpermOnRenameInjectedFs(),
    });
    if (
      !epermRename.ok &&
      epermRename.code === "WRITE_FAILED" &&
      epermRename.partialFinalPublished === false &&
      epermRename.tmpCleaned &&
      !existsSync(epermRename.manifestPath) &&
      !existsSync(epermRename.tmpPath)
    ) {
      details.push("EPERM on rename → WRITE_FAILED; tmp cleaned; no partial final");
    } else {
      passed = false;
      details.push(
        `EPERM rename unexpectedly ${JSON.stringify(epermRename)}`,
      );
    }

    // 32. EPERM on mkdir (wave-20 deepen).
    const epermMkdir = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-mkdir",
      createdAtIso: nowIso,
      summary: "eperm mkdir",
      fs: createEpermOnMkdirInjectedFs(),
    });
    if (
      !epermMkdir.ok &&
      epermMkdir.code === "WRITE_FAILED" &&
      epermMkdir.partialFinalPublished === false &&
      !existsSync(epermMkdir.manifestPath)
    ) {
      details.push("EPERM on mkdir → WRITE_FAILED; no partial final");
    } else {
      passed = false;
      details.push(`EPERM mkdir unexpectedly ${JSON.stringify(epermMkdir)}`);
    }

    // 33. C0 control-char runId refused (wave-20 deepen).
    const controlId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run\u0001bad",
      createdAtIso: nowIso,
      summary: "control",
    });
    if (
      !controlId.ok &&
      controlId.code === "INVALID_RUN_ID" &&
      controlId.partialFinalPublished === false
    ) {
      details.push("C0 control-char runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(`Control runId unexpectedly ${JSON.stringify(controlId)}`);
    }

    // 34. Prior COMPLETED preserved when retry hits write EPERM (wave-20).
    const priorEperm = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-write-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEperm = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-write-preserve",
      createdAtIso: nowIso,
      summary: "retry eperm write",
      fs: createEpermOnWriteInjectedFs(),
    });
    if (
      priorEperm.ok &&
      !retryEperm.ok &&
      retryEperm.code === "WRITE_FAILED" &&
      retryEperm.priorCompletedPreserved &&
      retryEperm.completedManifestExists &&
      retryEperm.partialFinalPublished === false &&
      readCompletedEvidenceManifest(priorEperm.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry write EPERM preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EPERM-write-preserve unexpectedly prior=${JSON.stringify(priorEperm)} retry=${JSON.stringify(retryEperm)}`,
      );
    }

    // 35. Prior COMPLETED preserved when retry hits rename EPERM (wave-21).
    const priorEpermRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-rename-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEpermRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-rename-preserve",
      createdAtIso: nowIso,
      summary: "retry eperm rename",
      fs: createEpermOnRenameInjectedFs(),
    });
    if (
      priorEpermRename.ok &&
      !retryEpermRename.ok &&
      retryEpermRename.code === "WRITE_FAILED" &&
      retryEpermRename.priorCompletedPreserved &&
      retryEpermRename.completedManifestExists &&
      retryEpermRename.partialFinalPublished === false &&
      !existsSync(retryEpermRename.tmpPath) &&
      readCompletedEvidenceManifest(priorEpermRename.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry rename EPERM preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EPERM-rename-preserve unexpectedly prior=${JSON.stringify(priorEpermRename)} retry=${JSON.stringify(retryEpermRename)}`,
      );
    }

    // 36. Prior COMPLETED preserved when retry hits mkdir EPERM (wave-21).
    const priorEpermMkdir = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-mkdir-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEpermMkdir = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eperm-mkdir-preserve",
      createdAtIso: nowIso,
      summary: "retry eperm mkdir",
      fs: createEpermOnMkdirInjectedFs(),
    });
    if (
      priorEpermMkdir.ok &&
      !retryEpermMkdir.ok &&
      retryEpermMkdir.code === "WRITE_FAILED" &&
      retryEpermMkdir.priorCompletedPreserved &&
      retryEpermMkdir.completedManifestExists &&
      retryEpermMkdir.partialFinalPublished === false &&
      readCompletedEvidenceManifest(priorEpermMkdir.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry mkdir EPERM preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EPERM-mkdir-preserve unexpectedly prior=${JSON.stringify(priorEpermMkdir)} retry=${JSON.stringify(retryEpermMkdir)}`,
      );
    }

    // 37. Leading-dot / DEL runId refused (wave-21 deepen).
    const dottedId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: ".hidden-run",
      createdAtIso: nowIso,
      summary: "dot",
    });
    const delId = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run\u007fbad",
      createdAtIso: nowIso,
      summary: "del",
    });
    if (
      !dottedId.ok &&
      dottedId.code === "INVALID_RUN_ID" &&
      dottedId.partialFinalPublished === false &&
      !delId.ok &&
      delId.code === "INVALID_RUN_ID" &&
      delId.partialFinalPublished === false
    ) {
      details.push("Leading-dot/DEL runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(
        `Dot/DEL unexpectedly dotted=${JSON.stringify(dottedId)} del=${JSON.stringify(delId)}`,
      );
    }

    // 38. Trailing-dot / double-dot runId refused (wave-22 deepen).
    const trailingDot = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run.",
      createdAtIso: nowIso,
      summary: "trailing-dot",
    });
    const doubleDot = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run..id",
      createdAtIso: nowIso,
      summary: "double-dot",
    });
    if (
      !trailingDot.ok &&
      trailingDot.code === "INVALID_RUN_ID" &&
      trailingDot.partialFinalPublished === false &&
      !doubleDot.ok &&
      doubleDot.code === "INVALID_RUN_ID" &&
      doubleDot.partialFinalPublished === false
    ) {
      details.push("Trailing-dot/.. runId refused (INVALID_RUN_ID)");
    } else {
      passed = false;
      details.push(
        `Trailing/double-dot unexpectedly trailing=${JSON.stringify(trailingDot)} double=${JSON.stringify(doubleDot)}`,
      );
    }

    // 39. Prior COMPLETED preserved when retry hits write EIO (wave-22).
    const priorEioWrite = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eio-write-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEioWrite = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eio-write-preserve",
      createdAtIso: nowIso,
      summary: "retry eio write",
      fs: createEioOnWriteInjectedFs(),
    });
    if (
      priorEioWrite.ok &&
      !retryEioWrite.ok &&
      retryEioWrite.code === "WRITE_FAILED" &&
      retryEioWrite.priorCompletedPreserved &&
      retryEioWrite.completedManifestExists &&
      retryEioWrite.partialFinalPublished === false &&
      readCompletedEvidenceManifest(priorEioWrite.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry write EIO preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EIO-write-preserve unexpectedly prior=${JSON.stringify(priorEioWrite)} retry=${JSON.stringify(retryEioWrite)}`,
      );
    }

    // 40. Prior COMPLETED preserved when retry hits rename EIO (wave-22).
    const priorEioRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eio-rename-preserve",
      createdAtIso: nowIso,
      summary: "prior completed",
    });
    const retryEioRename = writeCompletedEvidenceManifest({
      directory: workDir,
      runId: "run-eio-rename-preserve",
      createdAtIso: nowIso,
      summary: "retry eio rename",
      fs: createEioOnRenameInjectedFs(),
    });
    if (
      priorEioRename.ok &&
      !retryEioRename.ok &&
      retryEioRename.code === "WRITE_FAILED" &&
      retryEioRename.priorCompletedPreserved &&
      retryEioRename.completedManifestExists &&
      retryEioRename.partialFinalPublished === false &&
      !existsSync(retryEioRename.tmpPath) &&
      readCompletedEvidenceManifest(priorEioRename.manifestPath)?.summary ===
        "prior completed"
    ) {
      details.push(
        "Retry rename EIO preserves prior COMPLETED (no delete-on-failure)",
      );
    } else {
      passed = false;
      details.push(
        `EIO-rename-preserve unexpectedly prior=${JSON.stringify(priorEioRename)} retry=${JSON.stringify(retryEioRename)}`,
      );
    }

    // 41. Release-path writer preserves prior artifact on rename EIO (wave-23).
    const releasePriorPath = join(workDir, "release-prior.json");
    const releaseFirst = atomicWriteEvidenceJson({
      filePath: releasePriorPath,
      value: { externalEffects: "NONE", revision: 1 },
    });
    const releaseEio = atomicWriteEvidenceJson({
      filePath: releasePriorPath,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEioOnRenameInjectedFs(),
    });
    if (
      releaseFirst.ok &&
      !releaseEio.ok &&
      releaseEio.priorFilePreserved &&
      releaseEio.partialFinalPublished === false &&
      existsSync(releasePriorPath) &&
      JSON.parse(String(readFileSync(releasePriorPath, "utf8"))).revision === 1
    ) {
      details.push(
        "release:evidence atomicWriteEvidenceJson rename-EIO → prior artifact preserved",
      );
    } else {
      passed = false;
      details.push(
        `Release-EIO-prior unexpectedly first=${JSON.stringify(releaseFirst)} eio=${JSON.stringify(releaseEio)}`,
      );
    }

    // 42. Release-path writer preserves prior artifact on write EDQUOT (wave-25).
    const releaseEdquotPath = join(workDir, "release-edquot-prior.json");
    const releaseEdquotFirst = atomicWriteEvidenceJson({
      filePath: releaseEdquotPath,
      value: { externalEffects: "NONE", revision: 1 },
    });
    const releaseEdquotRetry = atomicWriteEvidenceJson({
      filePath: releaseEdquotPath,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createDiskFullInjectedFs(),
    });
    if (
      releaseEdquotFirst.ok &&
      !releaseEdquotRetry.ok &&
      releaseEdquotRetry.code === "DISK_FULL" &&
      releaseEdquotRetry.priorFilePreserved &&
      releaseEdquotRetry.partialFinalPublished === false &&
      existsSync(releaseEdquotPath) &&
      JSON.parse(String(readFileSync(releaseEdquotPath, "utf8"))).revision === 1
    ) {
      details.push(
        "release:evidence atomicWriteEvidenceJson write-EDQUOT → prior artifact preserved",
      );
    } else {
      passed = false;
      details.push(
        `Release-EDQUOT-prior unexpectedly first=${JSON.stringify(releaseEdquotFirst)} retry=${JSON.stringify(releaseEdquotRetry)}`,
      );
    }

    // 43. Release-path writer preserves prior artifact on write EIO (wave-24).
    const releaseWritePath = join(workDir, "release-write-prior.json");
    const releaseWriteFirst = atomicWriteEvidenceJson({
      filePath: releaseWritePath,
      value: { externalEffects: "NONE", revision: 1 },
    });
    const releaseWriteEio = atomicWriteEvidenceJson({
      filePath: releaseWritePath,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEioOnWriteInjectedFs(),
    });
    if (
      releaseWriteFirst.ok &&
      !releaseWriteEio.ok &&
      releaseWriteEio.code === "WRITE_FAILED" &&
      releaseWriteEio.priorFilePreserved &&
      releaseWriteEio.partialFinalPublished === false &&
      existsSync(releaseWritePath) &&
      JSON.parse(String(readFileSync(releaseWritePath, "utf8"))).revision === 1
    ) {
      details.push(
        "release:evidence atomicWriteEvidenceJson write-EIO → prior artifact preserved",
      );
    } else {
      passed = false;
      details.push(
        `Release-write-EIO-prior unexpectedly first=${JSON.stringify(releaseWriteFirst)} eio=${JSON.stringify(releaseWriteEio)}`,
      );
    }

    details.push(
      "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
    );
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
