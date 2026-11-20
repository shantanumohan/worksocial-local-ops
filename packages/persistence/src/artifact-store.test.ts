import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ArtifactTrustLabel } from "@worksocial/domain";
import {
  createFileArtifactStore,
  createMemoryArtifactStore,
} from "./artifact-store.js";

describe("artifact-store (M3)", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const d of dirs) {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it("persists immutable revisions and dedupes identical content", () => {
    const store = createMemoryArtifactStore();
    const first = store.put({
      artifactId: "draft-1",
      trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
      kind: "article_draft",
      content: "Draft A citing fact-capacity",
      createdAtIso: "2026-11-20T04:00:00.000Z",
    });
    const same = store.put({
      artifactId: "draft-1",
      trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
      kind: "article_draft",
      content: "Draft A citing fact-capacity",
      createdAtIso: "2026-11-20T04:01:00.000Z",
    });
    expect(same.revision).toBe(first.revision);

    const edited = store.put({
      artifactId: "draft-1",
      trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
      kind: "article_draft",
      content: "Draft B edited",
      createdAtIso: "2026-11-20T04:02:00.000Z",
    });
    expect(edited.revision).not.toBe(first.revision);
    expect(edited.previousRevision).toBe(first.revision);
    expect(store.get("draft-1", first.revision)?.content).toContain("Draft A");
    expect(store.getLatest("draft-1")?.revision).toBe(edited.revision);
  });

  it("survives file reload", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-art-"));
    dirs.push(dir);
    const a = createFileArtifactStore(dir);
    const put = a.put({
      artifactId: "ev-1",
      trustLabel: ArtifactTrustLabel.MEASURED_EVIDENCE,
      kind: "approved_facts",
      content: "fact body",
      createdAtIso: "2026-11-20T04:00:00.000Z",
    });
    const b = createFileArtifactStore(dir);
    expect(b.get(put.artifactId, put.revision)?.checksum).toBe(put.checksum);
  });
});
