import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ArtifactTrustLabel,
  ReviewBindingStatus,
  utf8ByteLength,
} from "@worksocial/domain";
import { createClaudeRunner } from "./runner.js";
import {
  invalidateBindingAfterEdit,
  runEvidenceCycle,
} from "./evidence-cycle.js";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function evidenceArtifacts(nowIso: string) {
  const brief = "Write a bounded landing update for training rooms.";
  const fact = "Measured capacity is 12 seats for the Menlo Park room.";
  const source = "Untrusted SERP note: training room near PATH.";
  return [
    {
      artifactId: "brief-1",
      revision: "r1",
      checksum: sha256(brief),
      trustLabel: ArtifactTrustLabel.TRUSTED_INSTRUCTION,
      byteLength: utf8ByteLength(brief),
      capturedAtIso: nowIso,
      maxAgeSeconds: 0,
      allowedGrantIds: ["grant-m3"],
      kind: "content_brief",
      content: brief,
    },
    {
      artifactId: "fact-capacity",
      revision: "r1",
      checksum: sha256(fact),
      trustLabel: ArtifactTrustLabel.MEASURED_EVIDENCE,
      byteLength: utf8ByteLength(fact),
      capturedAtIso: nowIso,
      maxAgeSeconds: 86_400,
      allowedGrantIds: ["grant-m3"],
      kind: "approved_facts",
      content: fact,
    },
    {
      artifactId: "src-serp",
      revision: "r1",
      checksum: sha256(source),
      trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
      byteLength: utf8ByteLength(source),
      capturedAtIso: nowIso,
      maxAgeSeconds: 86_400,
      allowedGrantIds: ["grant-m3"],
      kind: "source_ids",
      content: source,
    },
  ] as const;
}

describe("evidence cycle (M3/NEXT-12)", () => {
  it("writer cites supplied evidence and A25 review binds exact revisions", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const nowIso = "2026-11-20T10:00:00.000Z";
    const result = await runEvidenceCycle(runner, {
      writerRoleId: "A13",
      siteId: "worksocial",
      assetId: "page-training",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src-1",
      nowIso,
      artifacts: [...evidenceArtifacts(nowIso)],
      forceFixture: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.writerRun.summary).toMatch(/fact-capacity/);
    expect(result.proposal.evidenceArtifactIds).toEqual(
      expect.arrayContaining(["fact-capacity", "src-serp"]),
    );
    expect(result.proposalArtifact.checksum).toHaveLength(64);
    expect(result.reviewBinding.reviewerRoleId).toBe("A25");
    expect(result.reviewBinding.status).toBe(ReviewBindingStatus.ACCEPTED);
    expect(result.reviewerRun.roleId).toBe("A25");
    expect(result.reviewerRun.runId).not.toBe(result.writerRun.runId);
    expect(result.usage.writerCostKind).toBe("fixture");
    expect(result.usage.reviewerCostKind).toBe("fixture");
    expect(result.usage.estimatesLabeled).toBe(true);
    expect([25, 50, 75]).not.toContain(result.usage.writerCostMinor);
  });

  it("fails clearly for unauthorized and stale inputs", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const nowIso = "2026-11-20T10:00:00.000Z";
    const unauthorized = await runEvidenceCycle(runner, {
      writerRoleId: "A13",
      siteId: "worksocial",
      assetId: "page-training",
      capabilityGrantId: "wrong-grant",
      sourceRevision: "src-1",
      nowIso,
      artifacts: [...evidenceArtifacts(nowIso)],
    });
    expect(unauthorized.ok).toBe(false);
    if (!unauthorized.ok) {
      expect(unauthorized.code).toBe("UNAUTHORIZED");
    }

    const stale = await runEvidenceCycle(runner, {
      writerRoleId: "A13",
      siteId: "worksocial",
      assetId: "page-training",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src-1",
      nowIso: "2026-11-25T10:00:00.000Z",
      artifacts: evidenceArtifacts("2026-11-20T10:00:00.000Z").map((a) => ({
        ...a,
        maxAgeSeconds: 60,
      })),
    });
    expect(stale.ok).toBe(false);
    if (!stale.ok) {
      expect(stale.code).toBe("STALE_ARTIFACT");
    }
  });

  it("requireLive fails closed without silent fixture SUCCESS", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: false,
    });
    const nowIso = "2026-11-20T10:00:00.000Z";
    const result = await runEvidenceCycle(runner, {
      writerRoleId: "A13",
      siteId: "worksocial",
      assetId: "page-training",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src-1",
      nowIso,
      artifacts: [...evidenceArtifacts(nowIso)],
      requireLive: true,
      forceFixture: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("WRITER_LIVE_FAILED");
      expect(result.reason).toMatch(/refusing silent fixture/i);
    }
  });

  it("editing proposal or evidence invalidates review binding", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const nowIso = "2026-11-20T10:00:00.000Z";
    const result = await runEvidenceCycle(runner, {
      writerRoleId: "A13",
      siteId: "worksocial",
      assetId: "page-training",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src-1",
      nowIso,
      artifacts: [...evidenceArtifacts(nowIso)],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const afterProposalEdit = invalidateBindingAfterEdit({
      binding: {
        ...result.reviewBinding,
        status: ReviewBindingStatus.BOUND,
      },
      editedProposalRevision: "rev-tampered",
    });
    expect(afterProposalEdit.status).toBe(ReviewBindingStatus.INVALIDATED);

    const afterEvidenceEdit = invalidateBindingAfterEdit({
      binding: {
        ...result.reviewBinding,
        status: ReviewBindingStatus.BOUND,
      },
      editedEvidenceDigest: "pkg:tampered:9",
    });
    expect(afterEvidenceEdit.status).toBe(ReviewBindingStatus.INVALIDATED);
  });
});
