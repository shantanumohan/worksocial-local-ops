import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EvidenceManifestStatus,
  atomicWriteEvidenceJson,
  classifyEvidenceWriteFailure,
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
  isDiskFullError,
  isSafeEvidenceRunId,
  readCompletedEvidenceManifest,
  writeCompletedEvidenceManifest,
} from "./evidence-manifest-write.js";

describe("evidence-manifest-write (T-X004)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-evid-manifest-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("classifies ENOSPC and EDQUOT as DISK_FULL", () => {
    const enospc = Object.assign(new Error("full"), { code: "ENOSPC" });
    const edquot = Object.assign(new Error("quota"), { code: "EDQUOT" });
    expect(isDiskFullError(enospc)).toBe(true);
    expect(isDiskFullError(edquot)).toBe(true);
    expect(classifyEvidenceWriteFailure(enospc).code).toBe("DISK_FULL");
    expect(classifyEvidenceWriteFailure(edquot).code).toBe("DISK_FULL");
    expect(classifyEvidenceWriteFailure(enospc).reason).toContain("ENOSPC");
    expect(classifyEvidenceWriteFailure(edquot).reason).toContain("EDQUOT");
    expect(classifyEvidenceWriteFailure(enospc).reason).toContain(
      "no new completed manifest",
    );
    expect(classifyEvidenceWriteFailure(edquot).reason).toContain(
      "no new completed manifest",
    );
  });

  it("classifies EIO, EPERM, and EACCES as WRITE_FAILED", () => {
    const eio = Object.assign(new Error("io"), { code: "EIO" });
    const eperm = Object.assign(new Error("perm"), { code: "EPERM" });
    const eacces = Object.assign(new Error("access"), { code: "EACCES" });
    expect(isDiskFullError(eio)).toBe(false);
    expect(classifyEvidenceWriteFailure(eio).code).toBe("WRITE_FAILED");
    expect(classifyEvidenceWriteFailure(eperm).code).toBe("WRITE_FAILED");
    expect(classifyEvidenceWriteFailure(eacces).code).toBe("WRITE_FAILED");
    expect(classifyEvidenceWriteFailure(eio).reason).toBe("io");
    expect(classifyEvidenceWriteFailure(eperm).reason).toBe("perm");
    expect(classifyEvidenceWriteFailure(eacces).reason).toBe("access");
    expect(isDiskFullError(eperm)).toBe(false);
    expect(isDiskFullError(eacces)).toBe(false);
    expect(isDiskFullError(null)).toBe(false);
    expect(isDiskFullError(undefined)).toBe(false);
    expect(isDiskFullError({})).toBe(false);
    expect(isDiskFullError({ code: "ENOSPC" })).toBe(true);
    expect(isDiskFullError({ code: "EDQUOT" })).toBe(true);
    expect(isDiskFullError({ code: "EIO" })).toBe(false);
    expect(isDiskFullError(0 as unknown)).toBe(false);
    expect(isDiskFullError("ENOSPC" as unknown)).toBe(false);
    expect(isDiskFullError(false as unknown)).toBe(false);
    expect(isDiskFullError(Symbol("ENOSPC") as unknown)).toBe(false);
    expect(isDiskFullError([] as unknown)).toBe(false);
    expect(isDiskFullError({ code: "" })).toBe(false);
    const edquotObj = Object.assign(new Error("quota"), { code: "EDQUOT" });
    expect(classifyEvidenceWriteFailure(edquotObj).reason).toContain(
      "no new completed manifest",
    );
  });

  it("classifies unknown write errors as WRITE_FAILED", () => {
    const generic = new Error("boom");
    expect(classifyEvidenceWriteFailure(generic).code).toBe("WRITE_FAILED");
    expect(classifyEvidenceWriteFailure("string-failure").code).toBe(
      "WRITE_FAILED",
    );
    expect(classifyEvidenceWriteFailure(generic).reason).toBe("boom");
    expect(classifyEvidenceWriteFailure("string-failure").reason).toContain(
      "string-failure",
    );
  });

  it("publishes COMPLETED only after atomic rename (happy path)", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-ok",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "fixture evidence",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.status).toBe(EvidenceManifestStatus.COMPLETED);
    expect(result.completedManifestExists).toBe(true);
    expect(existsSync(result.manifestPath)).toBe(true);
    expect(existsSync(result.tmpPath)).toBe(false);
    const body = JSON.parse(readFileSync(result.manifestPath, "utf8"));
    expect(body.status).toBe("COMPLETED");
    expect(body.externalEffects).toBe("NONE");
    expect(readCompletedEvidenceManifest(result.manifestPath)?.runId).toBe(
      "run-ok",
    );
  });

  it("disk full during write leaves no completed manifest (fresh)", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-full",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "should not complete",
      fs: createDiskFullInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISK_FULL");
    expect(result.completedManifestExists).toBe(false);
    expect(result.priorCompletedPreserved).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
    expect(readCompletedEvidenceManifest(result.manifestPath)).toBeNull();
  });

  it("preserves a prior COMPLETED when a retry hits ENOSPC", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry must not delete first",
      fs: createDiskFullInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("atomicWriteEvidenceJson is the shared release-path writer", () => {
    const path = join(dir, "evidence-ledger.json");
    const ok = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", cases: [] },
    });
    expect(ok.ok).toBe(true);
    expect(existsSync(path)).toBe(true);
    if (ok.ok) {
      expect(ok.partialFinalPublished).toBe(false);
      expect(ok.liveProviderWiring).toBe("NOT_WIRED");
    }

    const fail = atomicWriteEvidenceJson({
      filePath: join(dir, "artifact.json"),
      value: { id: "x" },
      fs: createDiskFullInjectedFs(),
    });
    expect(fail.ok).toBe(false);
    if (fail.ok) return;
    expect(fail.code).toBe("DISK_FULL");
    expect(existsSync(fail.filePath)).toBe(false);
    expect(fail.priorFilePreserved).toBe(false);
    expect(fail.partialFinalPublished).toBe(false);
  });

  it("ENOSPC on rename cleans tmp and publishes no final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-rename-full",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "rename ENOSPC",
      fs: createDiskFullOnRenameInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISK_FULL");
    expect(result.partialFinalPublished).toBe(false);
    expect(result.completedManifestExists).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("EDQUOT is treated as DISK_FULL with no partial final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-edquot",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "quota",
      fs: createEdquotInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISK_FULL");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it("refuses empty runId", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "   ",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "invalid",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_RUN_ID");
    expect(result.partialFinalPublished).toBe(false);
  });

  it("refuses path-traversal runId", () => {
    expect(isSafeEvidenceRunId("../escape")).toBe(false);
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "../escape",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "traversal",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_RUN_ID");
  });

  it("ENOSPC on mkdir leaves no partial final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-mkdir-full",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "mkdir ENOSPC",
      fs: createDiskFullOnMkdirInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISK_FULL");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it("EIO on rename is WRITE_FAILED with tmp cleaned", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eio-rename",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eio rename",
      fs: createEioOnRenameInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("non-COMPLETED junk at final path is not a completed manifest", () => {
    const junkPath = join(dir, "run-junk.completed.json");
    writeFileSync(
      junkPath,
      JSON.stringify({ status: "FAILED_DISK_FULL", runId: "run-junk" }),
      "utf8",
    );
    expect(readCompletedEvidenceManifest(junkPath)).toBeNull();
    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-junk",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "overwrite junk",
      fs: createDiskFullInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.completedManifestExists).toBe(false);
    expect(retry.partialFinalPublished).toBe(false);
    expect(readCompletedEvidenceManifest(junkPath)).toBeNull();
  });

  it("EDQUOT on rename is DISK_FULL with tmp cleaned", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-edquot-rename",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "edquot rename",
      fs: createEdquotOnRenameInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISK_FULL");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("EIO on staging write is WRITE_FAILED with no final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eio-write",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eio write",
      fs: createEioOnWriteInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("truncated/corrupt JSON at final path is not a completed manifest", () => {
    const corruptPath = join(dir, "run-corrupt.completed.json");
    writeFileSync(corruptPath, '{"status":"COMPLETED","runId":', "utf8");
    expect(readCompletedEvidenceManifest(corruptPath)).toBeNull();
  });

  it("preserves prior COMPLETED when retry hits rename ENOSPC", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-rename-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-rename-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry rename ENOSPC",
      fs: createDiskFullOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("refuses slash and overlong runIds", () => {
    expect(isSafeEvidenceRunId("foo/bar")).toBe(false);
    expect(isSafeEvidenceRunId("a".repeat(129))).toBe(false);
    const slash = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "foo/bar",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "slash",
    });
    expect(slash.ok).toBe(false);
    if (!slash.ok) expect(slash.code).toBe("INVALID_RUN_ID");
    const long = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "a".repeat(129),
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "overlong",
    });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.code).toBe("INVALID_RUN_ID");
  });

  it("EDQUOT on mkdir is DISK_FULL with no partial final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-edquot-mkdir",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "edquot mkdir",
      fs: createEdquotOnMkdirInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("DISK_FULL");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it("EACCES on staging write is WRITE_FAILED with no final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eacces-write",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eacces write",
      fs: createEaccesOnWriteInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("refuses NUL in runId", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run\0evil",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "nul",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_RUN_ID");
    expect(result.partialFinalPublished).toBe(false);
  });

  it("preserves prior COMPLETED when retry hits rename EDQUOT", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-edquot-rename-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-edquot-rename-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry edquot rename",
      fs: createEdquotOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("refuses liveProviderSuccessClaimed true as completed manifest", () => {
    const path = join(dir, "run-live-claim.completed.json");
    writeFileSync(
      path,
      JSON.stringify({
        status: "COMPLETED",
        runId: "run-live-claim",
        createdAtIso: "2026-11-22T18:00:00.000Z",
        summary: "forged live claim",
        liveProviderSuccessClaimed: true,
      }),
      "utf8",
    );
    expect(readCompletedEvidenceManifest(path)).toBeNull();
  });

  it("EACCES on mkdir is WRITE_FAILED with no partial final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eacces-mkdir",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eacces mkdir",
      fs: createEaccesOnMkdirInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it("EACCES on rename is WRITE_FAILED with tmp cleaned", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eacces-rename",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eacces rename",
      fs: createEaccesOnRenameInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("empty final path is not a completed manifest", () => {
    const emptyPath = join(dir, "run-empty.completed.json");
    writeFileSync(emptyPath, "", "utf8");
    expect(readCompletedEvidenceManifest(emptyPath)).toBeNull();
  });

  it("refuses backslash runId", () => {
    expect(isSafeEvidenceRunId("foo\\bar")).toBe(false);
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "foo\\bar",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "backslash",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_RUN_ID");
  });

  it("preserves prior COMPLETED when retry hits write EDQUOT", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-edquot-write-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-edquot-write-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry edquot write",
      fs: createEdquotInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("EIO on mkdir is WRITE_FAILED with no partial final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eio-mkdir",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eio mkdir",
      fs: createEioOnMkdirInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it("EPERM on staging write is WRITE_FAILED with no final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-write",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eperm write",
      fs: createEpermOnWriteInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("refuses whitespace and leading-dash runIds", () => {
    const spaced = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run id",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "space",
    });
    expect(spaced.ok).toBe(false);
    if (!spaced.ok) expect(spaced.code).toBe("INVALID_RUN_ID");
    const dashed = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "-run",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "dash",
    });
    expect(dashed.ok).toBe(false);
    if (!dashed.ok) expect(dashed.code).toBe("INVALID_RUN_ID");
  });

  it("preserves prior COMPLETED when retry hits write EACCES", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eacces-write-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eacces-write-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry eacces write",
      fs: createEaccesOnWriteInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("EPERM on rename is WRITE_FAILED with tmp cleaned", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-rename",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eperm rename",
      fs: createEpermOnRenameInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
    expect(existsSync(result.tmpPath)).toBe(false);
  });

  it("EPERM on mkdir is WRITE_FAILED with no partial final", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-mkdir",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "eperm mkdir",
      fs: createEpermOnMkdirInjectedFs(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_FAILED");
    expect(result.partialFinalPublished).toBe(false);
    expect(existsSync(result.manifestPath)).toBe(false);
  });

  it("refuses C0 control-char runId", () => {
    const result = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run\u0001bad",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "control",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("INVALID_RUN_ID");
    expect(isSafeEvidenceRunId("run\u0001bad")).toBe(false);
  });

  it("preserves prior COMPLETED when retry hits write EPERM", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-write-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-write-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry eperm write",
      fs: createEpermOnWriteInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("preserves prior COMPLETED when retry hits rename EPERM", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-rename-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-rename-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry eperm rename",
      fs: createEpermOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(existsSync(retry.tmpPath)).toBe(false);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("preserves prior COMPLETED when retry hits mkdir EPERM", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-mkdir-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eperm-mkdir-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry eperm mkdir",
      fs: createEpermOnMkdirInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("refuses leading-dot and DEL runIds", () => {
    const dotted = writeCompletedEvidenceManifest({
      directory: dir,
      runId: ".hidden-run",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "dot",
    });
    expect(dotted.ok).toBe(false);
    if (!dotted.ok) expect(dotted.code).toBe("INVALID_RUN_ID");
    expect(isSafeEvidenceRunId(".hidden-run")).toBe(false);

    const delChar = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run\u007fbad",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "del",
    });
    expect(delChar.ok).toBe(false);
    if (!delChar.ok) expect(delChar.code).toBe("INVALID_RUN_ID");
  });

  it("refuses trailing-dot and double-dot runIds", () => {
    const trailing = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run.",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "trailing-dot",
    });
    expect(trailing.ok).toBe(false);
    if (!trailing.ok) expect(trailing.code).toBe("INVALID_RUN_ID");

    const doubled = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run..id",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "double-dot",
    });
    expect(doubled.ok).toBe(false);
    if (!doubled.ok) expect(doubled.code).toBe("INVALID_RUN_ID");
  });

  it("preserves prior COMPLETED when retry hits write EIO", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eio-write-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eio-write-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry eio write",
      fs: createEioOnWriteInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("preserves prior COMPLETED when retry hits rename EIO", () => {
    const first = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eio-rename-retry",
      createdAtIso: "2026-11-22T18:00:00.000Z",
      summary: "first completed",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const retry = writeCompletedEvidenceManifest({
      directory: dir,
      runId: "run-eio-rename-retry",
      createdAtIso: "2026-11-22T18:01:00.000Z",
      summary: "retry eio rename",
      fs: createEioOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorCompletedPreserved).toBe(true);
    expect(retry.completedManifestExists).toBe(true);
    expect(existsSync(retry.tmpPath)).toBe(false);
    expect(readCompletedEvidenceManifest(first.manifestPath)?.summary).toBe(
      "first completed",
    );
  });

  it("atomicWriteEvidenceJson preserves prior artifact when rename hits EIO", () => {
    const path = join(dir, "release-artifact.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEioOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when write hits EDQUOT", () => {
    const path = join(dir, "release-artifact-edquot.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createDiskFullInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when write hits EIO", () => {
    const path = join(dir, "release-artifact-eio-write.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEioOnWriteInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when mkdir hits EIO", () => {
    const path = join(dir, "nested", "release-artifact-eio-mkdir.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEioOnMkdirInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when mkdir hits EPERM", () => {
    const path = join(dir, "nested", "release-artifact-eperm-mkdir.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEpermOnMkdirInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when rename hits EPERM", () => {
    const path = join(dir, "release-artifact-eperm-rename.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEpermOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when mkdir hits EACCES", () => {
    const path = join(dir, "nested", "release-artifact-eacces-mkdir.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEaccesOnMkdirInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when rename hits EACCES", () => {
    const path = join(dir, "release-artifact-eacces-rename.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEaccesOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when write hits EACCES", () => {
    const path = join(dir, "release-artifact-eacces-write.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEaccesOnWriteInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when write hits EPERM", () => {
    const path = join(dir, "release-artifact-eperm-write.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEpermOnWriteInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when mkdir hits EDQUOT", () => {
    const path = join(dir, "nested", "release-artifact-edquot-mkdir.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEdquotOnMkdirInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when mkdir hits ENOSPC", () => {
    const path = join(dir, "nested-enospc", "release-artifact-enospc-mkdir.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createDiskFullOnMkdirInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when rename hits EDQUOT", () => {
    const path = join(dir, "release-artifact-edquot-rename.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEdquotOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when rename hits ENOSPC", () => {
    const path = join(dir, "release-artifact-enospc-rename.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createDiskFullOnRenameInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when write hits ENOSPC", () => {
    const path = join(dir, "release-artifact-enospc-write.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createDiskFullInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("DISK_FULL");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });

  it("atomicWriteEvidenceJson preserves prior artifact when write hits EIO", () => {
    const path = join(dir, "release-artifact-eio-write.json");
    const first = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 1 },
    });
    expect(first.ok).toBe(true);

    const retry = atomicWriteEvidenceJson({
      filePath: path,
      value: { externalEffects: "NONE", revision: 2 },
      fs: createEioOnWriteInjectedFs(),
    });
    expect(retry.ok).toBe(false);
    if (retry.ok) return;
    expect(retry.code).toBe("WRITE_FAILED");
    expect(retry.priorFilePreserved).toBe(true);
    expect(retry.partialFinalPublished).toBe(false);
    expect(existsSync(path)).toBe(true);
    expect(JSON.parse(readFileSync(path, "utf8")).revision).toBe(1);
  });
});
