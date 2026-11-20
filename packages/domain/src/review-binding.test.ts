import { describe, expect, it } from "vitest";
import {
  ReviewBindingStatus,
  acceptBoundReviewVerdict,
  createReviewBinding,
  validateReviewBinding,
} from "./review-binding.js";
import type { EffectProposal } from "./role-runtime.js";

const proposal = (): EffectProposal => ({
  proposalId: "prop-writer-1",
  authorRoleId: "A13",
  actionClass: "create",
  operation: "stage_artifact",
  assetId: "page-training",
  channelId: "local-artifact",
  payloadDigest: "digest-draft-1",
  evidenceArtifactIds: ["fact-capacity"],
});

describe("A25 review binding (M3/NEXT-12)", () => {
  it("binds review to exact proposal artifact + evidence digest", () => {
    const created = createReviewBinding({
      bindingId: "bind-1",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "aa".repeat(32),
      evidencePackageDigest: "pkg:deadbeef:2",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.binding.reviewerRoleId).toBe("A25");
    expect(created.binding.status).toBe(ReviewBindingStatus.BOUND);
  });

  it("invalidates review when proposal or evidence is edited", () => {
    const created = createReviewBinding({
      bindingId: "bind-2",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "bb".repeat(32),
      evidencePackageDigest: "pkg:cafe:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const editedProposal = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-b",
      proposalChecksum: "bb".repeat(32),
      evidencePackageDigest: "pkg:cafe:1",
    });
    expect(editedProposal.ok).toBe(false);
    if (!editedProposal.ok) {
      expect(editedProposal.binding.status).toBe(
        ReviewBindingStatus.INVALIDATED,
      );
      expect(editedProposal.reason).toMatch(/proposalRevision/);
    }

    const editedEvidence = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "bb".repeat(32),
      evidencePackageDigest: "pkg:changed:1",
    });
    expect(editedEvidence.ok).toBe(false);
    if (!editedEvidence.ok) {
      expect(editedEvidence.reason).toMatch(/evidencePackageDigest/);
    }
  });

  it("accepts A25 verdict only while binding matches", () => {
    const created = createReviewBinding({
      bindingId: "bind-3",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "cc".repeat(32),
      evidencePackageDigest: "pkg:ok:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "cc".repeat(32),
      evidencePackageDigest: "pkg:ok:1",
    };

    const accepted = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-1",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "Citations match measured evidence",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.binding.status).toBe(ReviewBindingStatus.ACCEPTED);
    }

    const afterEdit = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current: { ...current, proposalChecksum: "dd".repeat(32) },
      verdict: {
        verdictId: "v-2",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "stale",
        decidedAtIso: "2026-11-20T03:06:00.000Z",
      },
    });
    expect(afterEdit.ok).toBe(false);
  });

  it("rejects a second verdict on a terminal ACCEPTED binding", () => {
    const created = createReviewBinding({
      bindingId: "bind-4",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ee".repeat(32),
      evidencePackageDigest: "pkg:term:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ee".repeat(32),
      evidencePackageDigest: "pkg:term:1",
    };
    const first = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-term-1",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "first",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = acceptBoundReviewVerdict({
      binding: first.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-term-2",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: false,
        reason: "flip",
        decidedAtIso: "2026-11-20T03:06:00.000Z",
      },
    });
    expect(second.ok).toBe(false);
  });

  it("rejects proposal author mismatch against binding", () => {
    const created = createReviewBinding({
      bindingId: "bind-5",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ff".repeat(32),
      evidencePackageDigest: "pkg:auth:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const spoofed = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), authorRoleId: "A14" },
      current: {
        proposalArtifactId: "art-draft-1",
        proposalRevision: "rev-a",
        proposalChecksum: "ff".repeat(32),
        evidencePackageDigest: "pkg:auth:1",
      },
      verdict: {
        verdictId: "v-spoof",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A14",
        approved: true,
        reason: "spoof",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(spoofed.ok).toBe(false);
  });
});
