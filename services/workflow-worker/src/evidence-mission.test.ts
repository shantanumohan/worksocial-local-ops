import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createClaudeRunner } from "@worksocial/claude-runner";
import { ArtifactTrustLabel, utf8ByteLength } from "@worksocial/domain";
import {
  createMemoryArtifactStore,
  createDurableExecutionService,
  createMemoryDurableStores,
  createMemoryMissionWorkflowStore,
} from "@worksocial/persistence";
import { createEvidenceMissionRuntime } from "./evidence-mission.js";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function artifacts(nowIso: string) {
  const brief = "Brief: update training room page.";
  const fact = "Fact: room holds 12.";
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
      artifactId: "src-1",
      revision: "r1",
      checksum: sha256("source note"),
      trustLabel: ArtifactTrustLabel.UNTRUSTED_SOURCE,
      byteLength: utf8ByteLength("source note"),
      capturedAtIso: nowIso,
      maxAgeSeconds: 86_400,
      allowedGrantIds: ["grant-m3"],
      kind: "source_ids",
      content: "source note",
    },
  ] as const;
}

describe("evidence mission on LOCAL_DURABLE (M3)", () => {
  it("runs writer+A25, persists artifacts, and preserves mission after restart", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const missions = createMemoryMissionWorkflowStore();
    const execution = createDurableExecutionService(createMemoryDurableStores());
    const artifactStore = createMemoryArtifactStore();
    const runtime = createEvidenceMissionRuntime({
      runner,
      missions,
      execution,
      artifacts: artifactStore,
    });

    expect(runtime.durable.temporalLabel).toBe("LOCAL_DURABLE");

    const nowIso = "2026-11-20T12:00:00.000Z";
    const workflowId = "wf-evidence-1";
    const result = await runtime.run({
      writerRoleId: "A13",
      siteId: "worksocial",
      assetId: "page-training",
      capabilityGrantId: "grant-m3",
      sourceRevision: "src-rev-1",
      nowIso,
      artifacts: [...artifacts(nowIso)],
      workflowId,
      forceFixture: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.workflow.phase).toBe("succeeded");
    expect(result.workflow.temporalWiring).toBe("LOCAL_DURABLE");
    expect(result.cycle.writerRun.summary).toMatch(/fact-capacity/);
    expect(result.persistedProposal.checksum).toBe(
      result.cycle.proposalArtifact.checksum,
    );
    expect(result.persistedReview.kind).toBe("review_verdict");
    expect(result.snapshot.usage.estimatesLabeled).toBe(true);

    // Simulate process restart with the same durable stores.
    const resumedRuntime = createEvidenceMissionRuntime({
      runner,
      missions,
      execution,
      artifacts: artifactStore,
    });
    const resumed = await resumedRuntime.resume(workflowId);
    expect(resumed.workflow?.phase).toBe("succeeded");
    expect(resumed.workflow?.workflowId).toBe(workflowId);
    expect(resumed.proposal?.artifactId).toBe(
      result.persistedProposal.artifactId,
    );
    expect(resumed.review?.metadata.bindingId).toBe(
      result.cycle.reviewBinding.bindingId,
    );

    const restartVerify = await resumedRuntime.durable.resumeAfterRestart({
      workflowId,
      observedDigest: `evidence:${result.snapshot.packageDigest}:${result.cycle.proposalArtifact.checksum}:${result.cycle.reviewBinding.bindingId}`,
      nowIso: "2026-11-20T12:30:00.000Z",
    });
    expect(restartVerify.outcome).toBe("VERIFIED");
    expect(restartVerify.applyAttemptCount).toBe(1);
  });

  it("fails the durable mission when inputs are unauthorized", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const runtime = createEvidenceMissionRuntime({ runner });
    const nowIso = "2026-11-20T12:00:00.000Z";
    const result = await runtime.run({
      writerRoleId: "A13",
      siteId: "worksocial",
      assetId: "page-training",
      capabilityGrantId: "nope",
      sourceRevision: "src-rev-1",
      nowIso,
      artifacts: [...artifacts(nowIso)],
      workflowId: "wf-evidence-unauth",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("UNAUTHORIZED");
      expect(result.workflow?.phase).toBe("failed");
    }
  });
});
