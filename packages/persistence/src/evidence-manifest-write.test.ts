import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EvidenceManifestStatus,
  atomicWriteEvidenceJson,
  classifyEvidenceWriteFailure,
  createDiskFullInjectedFs,
  isDiskFullError,
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

  it("classifies ENOSPC as DISK_FULL", () => {
    const err = Object.assign(new Error("full"), { code: "ENOSPC" });
    expect(isDiskFullError(err)).toBe(true);
    expect(classifyEvidenceWriteFailure(err).code).toBe("DISK_FULL");
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
  });
});
