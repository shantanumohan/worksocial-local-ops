import { describe, expect, it } from "vitest";
import {
  REVIEW_BINDING_EXTERNAL_EFFECTS,
  REVIEW_BINDING_LIVE_CLAIM_REFUSED,
  REVIEW_BINDING_LIVE_WIRING,
  REVIEW_BINDING_RELATED_CASE_IDS,
  ReviewBindingStatus,
  acceptBoundReviewVerdict,
  assertReviewBindingFixtureHonesty,
  classifyReviewBindingMismatch,
  createReviewBinding,
  isReviewBindingTerminal,
  reviewBindingSnapshotMatches,
  summarizeReviewBindingHonesty,
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

  it("classifies single- and multi-field snapshot mismatches (T-X019)", () => {
    const created = createReviewBinding({
      bindingId: "bind-class",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "11".repeat(32),
      evidencePackageDigest: "pkg:class:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const match = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "11".repeat(32),
      evidencePackageDigest: "pkg:class:1",
    };
    expect(classifyReviewBindingMismatch(created.binding, match)).toEqual([]);
    expect(reviewBindingSnapshotMatches(created.binding, match)).toBe(true);

    expect(
      classifyReviewBindingMismatch(created.binding, {
        ...match,
        proposalChecksum: "22".repeat(32),
      }),
    ).toEqual(["proposalChecksum"]);

    expect(
      classifyReviewBindingMismatch(created.binding, {
        ...match,
        proposalArtifactId: "art-swapped",
        evidencePackageDigest: "pkg:changed",
      }),
    ).toEqual(["proposalArtifactId", "evidencePackageDigest"]);
  });

  it("invalidates on proposalArtifactId and evidencePackageDigest edits", () => {
    const created = createReviewBinding({
      bindingId: "bind-art-ev",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "33".repeat(32),
      evidencePackageDigest: "pkg:ev:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const artifact = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-other",
      proposalRevision: "rev-a",
      proposalChecksum: "33".repeat(32),
      evidencePackageDigest: "pkg:ev:1",
    });
    expect(artifact.ok).toBe(false);
    if (!artifact.ok) {
      expect(artifact.reason).toMatch(/proposalArtifactId/);
    }

    const evidence = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "33".repeat(32),
      evidencePackageDigest: "pkg:ev:edited",
    });
    expect(evidence.ok).toBe(false);
    if (!evidence.ok) {
      expect(evidence.reason).toMatch(/evidencePackageDigest/);
    }
  });

  // T-X019 R25 idle: triple-field digest conflict idempotent on re-validate.
  it("R25: triple revision+checksum+evidence mismatch is stable across two validates", () => {
    const created = createReviewBinding({
      bindingId: "bind-r25",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-r25",
      proposalChecksum: "r5".repeat(32),
      evidencePackageDigest: "pkg:r25:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const edited = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-r25b",
      proposalChecksum: "5r".repeat(32),
      evidencePackageDigest: "pkg:r25:2",
    };
    const pass1 = validateReviewBinding(created.binding, edited);
    expect(pass1.ok).toBe(false);
    if (!pass1.ok) {
      expect(pass1.code).toBe("BINDING_INVALIDATED");
      expect(pass1.mismatchedFields).toEqual([
        "proposalRevision",
        "proposalChecksum",
        "evidencePackageDigest",
      ]);
    }
    const pass2 = validateReviewBinding(pass1.ok ? created.binding : pass1.binding, edited);
    expect(pass2.ok).toBe(false);
    if (!pass2.ok) {
      expect(pass2.code).toBe("BINDING_INVALIDATED");
    }
  });

  it("pins honesty constants for T-X019 / T-US-036", () => {
    expect(REVIEW_BINDING_LIVE_WIRING).toBe("NOT_WIRED");
    expect(REVIEW_BINDING_EXTERNAL_EFFECTS).toBe("NONE");
    expect(REVIEW_BINDING_RELATED_CASE_IDS).toContain("T-X019");
    expect(REVIEW_BINDING_RELATED_CASE_IDS).toContain("T-US-036");
  });

  it("returns mismatchedFields on multi-field digest conflict", () => {
    const created = createReviewBinding({
      bindingId: "bind-multi",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "44".repeat(32),
      evidencePackageDigest: "pkg:multi:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const multi = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-b",
      proposalChecksum: "55".repeat(32),
      evidencePackageDigest: "pkg:multi:1",
    });
    expect(multi.ok).toBe(false);
    if (!multi.ok) {
      expect(multi.mismatchedFields).toEqual([
        "proposalRevision",
        "proposalChecksum",
      ]);
    }
  });

  it("refuses reuse of terminal REJECTED binding", () => {
    const created = createReviewBinding({
      bindingId: "bind-rej",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "66".repeat(32),
      evidencePackageDigest: "pkg:rej:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "66".repeat(32),
      evidencePackageDigest: "pkg:rej:1",
    };
    const rejected = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-rej-1",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: false,
        reason: "insufficient evidence",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.binding.status).toBe(ReviewBindingStatus.REJECTED);
    const reuse = acceptBoundReviewVerdict({
      binding: rejected.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-rej-2",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "flip after reject",
        decidedAtIso: "2026-11-20T03:06:00.000Z",
      },
    });
    expect(reuse.ok).toBe(false);
    if (!reuse.ok) {
      expect(reuse.reason).toMatch(/terminal/);
    }
  });

  it("keeps INVALIDATED sticky even when snapshot rematches", () => {
    const created = createReviewBinding({
      bindingId: "bind-sticky",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "99".repeat(32),
      evidencePackageDigest: "pkg:sticky:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const match = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "99".repeat(32),
      evidencePackageDigest: "pkg:sticky:1",
    };
    const invalidated = validateReviewBinding(created.binding, {
      ...match,
      proposalChecksum: "aa".repeat(32),
    });
    expect(invalidated.ok).toBe(false);
    if (!invalidated.ok) {
      expect(invalidated.binding.status).toBe(ReviewBindingStatus.INVALIDATED);
      const rematch = validateReviewBinding(invalidated.binding, match);
      expect(rematch.ok).toBe(false);
      if (!rematch.ok) {
        expect(rematch.code).toBe("BINDING_INVALIDATED");
        expect(rematch.binding.status).toBe(ReviewBindingStatus.INVALIDATED);
      }
    }
  });

  it("refuses verdict proposalId and evidenceArtifactIds mismatches", () => {
    const created = createReviewBinding({
      bindingId: "bind-mm",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ab".repeat(32),
      evidencePackageDigest: "pkg:mm:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ab".repeat(32),
      evidencePackageDigest: "pkg:mm:1",
    };
    const badProposalId = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-bad-id",
        proposalId: "prop-other",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "wrong proposal",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(badProposalId.ok).toBe(false);

    const badEvidence = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), evidenceArtifactIds: ["fact-other"] },
      current,
      verdict: {
        verdictId: "v-bad-ev",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "swapped evidence",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(badEvidence.ok).toBe(false);
  });

  it("classifies terminal statuses", () => {
    expect(isReviewBindingTerminal(ReviewBindingStatus.ACCEPTED)).toBe(true);
    expect(isReviewBindingTerminal(ReviewBindingStatus.REJECTED)).toBe(true);
    expect(isReviewBindingTerminal(ReviewBindingStatus.BOUND)).toBe(false);
    expect(isReviewBindingTerminal(ReviewBindingStatus.INVALIDATED)).toBe(false);
  });

  it("refuses whitespace-only pin fields at create", () => {
    const base = {
      bindingId: "bind-blank",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "cd".repeat(32),
      evidencePackageDigest: "pkg:blank:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    };
    expect(
      createReviewBinding({ ...base, proposalChecksum: "   " }).ok,
    ).toBe(false);
    expect(
      createReviewBinding({ ...base, evidencePackageDigest: "\t" }).ok,
    ).toBe(false);
    expect(
      createReviewBinding({ ...base, proposalRevision: "  " }).ok,
    ).toBe(false);
    expect(
      createReviewBinding({ ...base, proposalArtifactId: "" }).ok,
    ).toBe(false);
  });

  it("refuses accept on already-INVALIDATED and verdict authorRoleId mismatch", () => {
    const created = createReviewBinding({
      bindingId: "bind-inv-auth",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "de".repeat(32),
      evidencePackageDigest: "pkg:inv:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "de".repeat(32),
      evidencePackageDigest: "pkg:inv:1",
    };
    const invalidated = validateReviewBinding(created.binding, {
      ...current,
      proposalChecksum: "ef".repeat(32),
    });
    expect(invalidated.ok).toBe(false);
    if (!invalidated.ok) {
      const onInvalid = acceptBoundReviewVerdict({
        binding: invalidated.binding,
        proposal: proposal(),
        current,
        verdict: {
          verdictId: "v-on-inv",
          proposalId: "prop-writer-1",
          reviewerRoleId: "A25",
          authorRoleId: "A13",
          approved: true,
          reason: "after invalidate",
          decidedAtIso: "2026-11-20T03:05:00.000Z",
        },
      });
      expect(onInvalid.ok).toBe(false);
    }

    const authorMismatch = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-auth-mm",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A14",
        approved: true,
        reason: "wrong author on verdict",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(authorMismatch.ok).toBe(false);
  });

  it("refuses empty bindingId at create", () => {
    const created = createReviewBinding({
      bindingId: "   ",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "33".repeat(32),
      evidencePackageDigest: "pkg:empty-bind:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.code).toBe("BINDING_ID_REQUIRED");
      expect(created.reason).toMatch(/bindingId/i);
    }
  });

  it("still invalidates padded wrong checksum and evidence digest", () => {
    const created = createReviewBinding({
      bindingId: "bind-pad-cksum",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "55".repeat(32),
      evidencePackageDigest: "pkg:pad-ck:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const badChecksum = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "  " + "66".repeat(32) + "  ",
      evidencePackageDigest: "pkg:pad-ck:1",
    });
    expect(badChecksum.ok).toBe(false);
    if (!badChecksum.ok) {
      expect(badChecksum.mismatchedFields).toEqual(["proposalChecksum"]);
    }
    const badEvidence = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "55".repeat(32),
      evidencePackageDigest: "  pkg:pad-ck:edited  ",
    });
    expect(badEvidence.ok).toBe(false);
    if (!badEvidence.ok) {
      expect(badEvidence.mismatchedFields).toEqual(["evidencePackageDigest"]);
    }
  });

  it("still invalidates padded wrong proposalArtifactId", () => {
    const created = createReviewBinding({
      bindingId: "bind-pad-art",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "77".repeat(32),
      evidencePackageDigest: "pkg:pad-art:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const broken = validateReviewBinding(created.binding, {
      proposalArtifactId: "  art-edited  ",
      proposalRevision: "rev-a",
      proposalChecksum: "77".repeat(32),
      evidencePackageDigest: "pkg:pad-art:1",
    });
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      expect(broken.binding.status).toBe(ReviewBindingStatus.INVALIDATED);
      expect(broken.mismatchedFields).toEqual(["proposalArtifactId"]);
    }
  });

  it("refuses padded supplied proposal authorRoleId as BINDING_MISMATCH", () => {
    const created = createReviewBinding({
      bindingId: "bind-pad-prop-auth",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ag".repeat(32),
      evidencePackageDigest: "pkg:padpauth:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ag".repeat(32),
      evidencePackageDigest: "pkg:padpauth:1",
    };
    const padded = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: {
        ...proposal(),
        proposalId: created.binding.proposalId,
        authorRoleId: "  A13  " as never,
      },
      current,
      verdict: {
        verdictId: "v-pad-pauth",
        proposalId: created.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "padded supplied author",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(padded.ok).toBe(false);
    if (!padded.ok) {
      expect(padded.code).toBe("BINDING_MISMATCH");
      expect(padded.reason).toMatch(/Supplied proposal.authorRoleId/);
    }
  });

  it("refuses padded supplied proposal proposalId as BINDING_MISMATCH", () => {
    const created = createReviewBinding({
      bindingId: "bind-pad-prop-id",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "af".repeat(32),
      evidencePackageDigest: "pkg:padprop:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "af".repeat(32),
      evidencePackageDigest: "pkg:padprop:1",
    };
    const padded = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: {
        ...proposal(),
        proposalId: `  ${created.binding.proposalId}  `,
      },
      current,
      verdict: {
        verdictId: "v-pad-prop",
        proposalId: created.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "padded supplied proposalId",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(padded.ok).toBe(false);
    if (!padded.ok) {
      expect(padded.code).toBe("BINDING_MISMATCH");
      expect(padded.reason).toMatch(/Supplied proposal.proposalId/);
    }
  });

  it("refuses blank verdict proposalId as BINDING_MISMATCH", () => {
    const created = createReviewBinding({
      bindingId: "bind-blank-verdict-id",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ae".repeat(32),
      evidencePackageDigest: "pkg:blankvid:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ae".repeat(32),
      evidencePackageDigest: "pkg:blankvid:1",
    };
    const blankId = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), proposalId: created.binding.proposalId },
      current,
      verdict: {
        verdictId: "v-blank-id",
        proposalId: "   ",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "blank verdict proposalId",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(blankId.ok).toBe(false);
    if (!blankId.ok) {
      expect(blankId.code).toBe("BINDING_MISMATCH");
      expect(blankId.reason).toMatch(/Verdict proposalId/);
    }
  });

  it("refuses verdict authorRoleId mismatch as BINDING_MISMATCH", () => {
    const created = createReviewBinding({
      bindingId: "bind-verdict-auth-mm",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ad".repeat(32),
      evidencePackageDigest: "pkg:vauth:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ad".repeat(32),
      evidencePackageDigest: "pkg:vauth:1",
    };
    const wrongAuthor = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), proposalId: created.binding.proposalId },
      current,
      verdict: {
        verdictId: "v-auth-mm",
        proposalId: created.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A14",
        approved: true,
        reason: "verdict author mismatch",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(wrongAuthor.ok).toBe(false);
    if (!wrongAuthor.ok) {
      expect(wrongAuthor.code).toBe("BINDING_MISMATCH");
      expect(wrongAuthor.reason).toMatch(/Verdict authorRoleId/);
    }
  });

  it("refuses padded verdict proposalId as BINDING_MISMATCH", () => {
    const created = createReviewBinding({
      bindingId: "bind-verdict-pad-id",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ac".repeat(32),
      evidencePackageDigest: "pkg:vpad:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ac".repeat(32),
      evidencePackageDigest: "pkg:vpad:1",
    };
    const paddedVerdict = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), proposalId: created.binding.proposalId },
      current,
      verdict: {
        verdictId: "v-pad-id",
        proposalId: `  ${created.binding.proposalId}  `,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "padded verdict proposalId",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(paddedVerdict.ok).toBe(false);
    if (!paddedVerdict.ok) {
      expect(paddedVerdict.code).toBe("BINDING_MISMATCH");
      expect(paddedVerdict.reason).toMatch(/Verdict proposalId/);
    }
  });

  it("refuses padded verdict authorRoleId as BINDING_MISMATCH", () => {
    const created = createReviewBinding({
      bindingId: "bind-verdict-pad-auth",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ad".repeat(32),
      evidencePackageDigest: "pkg:vpadauth:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "ad".repeat(32),
      evidencePackageDigest: "pkg:vpadauth:1",
    };
    const paddedAuth = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), proposalId: created.binding.proposalId },
      current,
      verdict: {
        verdictId: "v-pad-auth",
        proposalId: created.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "  A13  " as never,
        approved: true,
        reason: "padded verdict authorRoleId",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(paddedAuth.ok).toBe(false);
    if (!paddedAuth.ok) {
      expect(paddedAuth.code).toBe("BINDING_MISMATCH");
      expect(paddedAuth.reason).toMatch(/Verdict authorRoleId/);
    }
  });

  it("refuses supplied proposal proposalId mismatch at accept", () => {
    const created = createReviewBinding({
      bindingId: "bind-prop-id-mm",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "aa".repeat(30) + "bb",
      evidencePackageDigest: "pkg:prop-id:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "aa".repeat(30) + "bb",
      evidencePackageDigest: "pkg:prop-id:1",
    };
    const swappedId = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), proposalId: "prop-other-id" },
      current,
      verdict: {
        verdictId: "v-prop-id",
        proposalId: created.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "proposal id swapped",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(swappedId.ok).toBe(false);
    if (!swappedId.ok) {
      expect(swappedId.code).toBe("BINDING_MISMATCH");
      expect(swappedId.reason).toMatch(/Supplied proposal.proposalId/);
    }
  });

  it("refuses supplied proposal authorRoleId mismatch at accept", () => {
    const created = createReviewBinding({
      bindingId: "bind-prop-author-mm",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "99".repeat(32),
      evidencePackageDigest: "pkg:prop-auth:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "99".repeat(32),
      evidencePackageDigest: "pkg:prop-auth:1",
    };
    const swappedAuthor = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: { ...proposal(), authorRoleId: "A14" },
      current,
      verdict: {
        verdictId: "v-prop-auth",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "proposal author swapped",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(swappedAuthor.ok).toBe(false);
    if (!swappedAuthor.ok) {
      expect(swappedAuthor.code).toBe("BINDING_MISMATCH");
      expect(swappedAuthor.reason).toMatch(/Supplied proposal.authorRoleId/);
    }
  });

  it("refuses blank verdict authorRoleId as BINDING_MISMATCH", () => {
    const created = createReviewBinding({
      bindingId: "bind-blank-author",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "88".repeat(32),
      evidencePackageDigest: "pkg:blank-auth:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "88".repeat(32),
      evidencePackageDigest: "pkg:blank-auth:1",
    };
    const blankAuthor = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-blank-auth",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "   " as never,
        approved: true,
        reason: "blank author",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(blankAuthor.ok).toBe(false);
    if (!blankAuthor.ok) {
      expect(blankAuthor.code).toBe("BINDING_MISMATCH");
    }
  });

  it("summarizes fixture honesty pins for T-X019 / T-US-036", () => {
    const summary = summarizeReviewBindingHonesty();
    expect(summary.relatedCaseIds).toEqual(["T-X019", "T-US-036"]);
    expect(summary.liveWiring).toBe(REVIEW_BINDING_LIVE_WIRING);
    expect(summary.externalEffects).toBe(REVIEW_BINDING_EXTERNAL_EFFECTS);
    expect(summary.liveClaimRefused).toBe(REVIEW_BINDING_LIVE_CLAIM_REFUSED);
    expect(summary.fixtureOnly).toBe(true);
    expect(summary.claimLiveVerified).toBe(false);
  });

  it("still invalidates when wrong revision is whitespace-padded", () => {
    const created = createReviewBinding({
      bindingId: "bind-pad-mismatch",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "44".repeat(32),
      evidencePackageDigest: "pkg:pad-mm:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const broken = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "  rev-b  ",
      proposalChecksum: "44".repeat(32),
      evidencePackageDigest: "pkg:pad-mm:1",
    });
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      expect(broken.binding.status).toBe(ReviewBindingStatus.INVALIDATED);
      expect(broken.mismatchedFields).toEqual(["proposalRevision"]);
    }
  });

  it("trim-normalizes pin fields so padded snapshot still matches", () => {
    const created = createReviewBinding({
      bindingId: "  bind-trim  ",
      proposal: proposal(),
      proposalArtifactId: "  art-draft-1  ",
      proposalRevision: "  rev-a  ",
      proposalChecksum: "  " + "ef".repeat(32) + "  ",
      evidencePackageDigest: "  pkg:trim:1  ",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.binding.bindingId).toBe("bind-trim");
    expect(created.binding.proposalArtifactId).toBe("art-draft-1");
    expect(created.binding.proposalRevision).toBe("rev-a");
    expect(created.binding.proposalChecksum).toBe("ef".repeat(32));
    expect(created.binding.evidencePackageDigest).toBe("pkg:trim:1");
    const padded = validateReviewBinding(created.binding, {
      proposalArtifactId: " art-draft-1 ",
      proposalRevision: " rev-a ",
      proposalChecksum: " " + "ef".repeat(32) + " ",
      evidencePackageDigest: " pkg:trim:1 ",
    });
    expect(padded.ok).toBe(true);
  });

  it("refuses reject verdict on already-INVALIDATED binding", () => {
    const created = createReviewBinding({
      bindingId: "bind-rej-inv",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "11".repeat(32),
      evidencePackageDigest: "pkg:rej-inv:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const broken = validateReviewBinding(created.binding, {
      proposalArtifactId: "art-edited",
      proposalRevision: "rev-a",
      proposalChecksum: "11".repeat(32),
      evidencePackageDigest: "pkg:rej-inv:1",
    });
    expect(broken.ok).toBe(false);
    if (broken.ok) return;
    const rejected = acceptBoundReviewVerdict({
      binding: broken.binding,
      proposal: proposal(),
      current: {
        proposalArtifactId: "art-draft-1",
        proposalRevision: "rev-a",
        proposalChecksum: "11".repeat(32),
        evidencePackageDigest: "pkg:rej-inv:1",
      },
      verdict: {
        verdictId: "v-rej-inv",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: false,
        reason: "reject after invalidate",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(rejected.ok).toBe(false);
  });

  it("refuses unknown authorRoleId at create", () => {
    const created = createReviewBinding({
      bindingId: "bind-unk-author",
      proposal: { ...proposal(), authorRoleId: "A99" as never },
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "22".repeat(32),
      evidencePackageDigest: "pkg:unk:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.code).toBe("AUTHOR_UNKNOWN");
    }
  });

  it("refuses blank artifact and revision at create", () => {
    const blankArt = createReviewBinding({
      bindingId: "bind-blank-art",
      proposal: proposal(),
      proposalArtifactId: "  ",
      proposalRevision: "rev-a",
      proposalChecksum: "ab".repeat(32),
      evidencePackageDigest: "pkg:blank-art:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(blankArt.ok).toBe(false);
    if (!blankArt.ok) {
      expect(blankArt.code).toBe("ARTIFACT_REVISION_REQUIRED");
    }
    const blankRev = createReviewBinding({
      bindingId: "bind-blank-rev",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "\t",
      proposalChecksum: "ab".repeat(32),
      evidencePackageDigest: "pkg:blank-rev:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(blankRev.ok).toBe(false);
    if (!blankRev.ok) {
      expect(blankRev.code).toBe("ARTIFACT_REVISION_REQUIRED");
    }
  });

  it("refuses rematch validate after terminal ACCEPTED", () => {
    const created = createReviewBinding({
      bindingId: "bind-acc-rematch",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "cd".repeat(32),
      evidencePackageDigest: "pkg:acc-re:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "cd".repeat(32),
      evidencePackageDigest: "pkg:acc-re:1",
    };
    const accepted = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-acc-re",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "ok",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const rematch = validateReviewBinding(accepted.binding, current);
    expect(rematch.ok).toBe(false);
    if (!rematch.ok) {
      expect(rematch.reason).toMatch(/terminal/);
    }
  });

  it("refuses live VERIFIED claim via fixture honesty helper", () => {
    expect(
      assertReviewBindingFixtureHonesty({
        fixtureOnly: true,
        claimLiveVerified: false,
      }).ok,
    ).toBe(true);
    const live = assertReviewBindingFixtureHonesty({
      fixtureOnly: true,
      claimLiveVerified: true,
    });
    expect(live.ok).toBe(false);
    if (!live.ok) {
      expect(live.code).toBe(REVIEW_BINDING_LIVE_CLAIM_REFUSED);
    }
    const nonFixture = assertReviewBindingFixtureHonesty({
      fixtureOnly: false,
    });
    expect(nonFixture.ok).toBe(false);
  });

  it("refuses empty proposalId at create", () => {
    const created = createReviewBinding({
      bindingId: "bind-empty-prop",
      proposal: { ...proposal(), proposalId: "   " },
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "fe".repeat(32),
      evidencePackageDigest: "pkg:empty:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(false);
    if (!created.ok) {
      expect(created.code).toBe("PROPOSAL_REQUIRED");
    }
  });

  it("refuses rematch validate after terminal REJECTED", () => {
    const created = createReviewBinding({
      bindingId: "bind-rej-rematch",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "01".repeat(32),
      evidencePackageDigest: "pkg:rej-re:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const current = {
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "01".repeat(32),
      evidencePackageDigest: "pkg:rej-re:1",
    };
    const rejected = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current,
      verdict: {
        verdictId: "v-rej-re",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: false,
        reason: "reject",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(isReviewBindingTerminal(rejected.binding.status)).toBe(true);
    const rematch = validateReviewBinding(rejected.binding, current);
    expect(rematch.ok).toBe(false);
    if (!rematch.ok) {
      expect(rematch.reason).toMatch(/terminal/);
    }
  });

  it("refuses non-A25 reviewer and self-approval bind", () => {
    const created = createReviewBinding({
      bindingId: "bind-a25",
      proposal: proposal(),
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "77".repeat(32),
      evidencePackageDigest: "pkg:a25:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const nonA25 = acceptBoundReviewVerdict({
      binding: created.binding,
      proposal: proposal(),
      current: {
        proposalArtifactId: "art-draft-1",
        proposalRevision: "rev-a",
        proposalChecksum: "77".repeat(32),
        evidencePackageDigest: "pkg:a25:1",
      },
      verdict: {
        verdictId: "v-non",
        proposalId: "prop-writer-1",
        reviewerRoleId: "A13",
        authorRoleId: "A13",
        approved: true,
        reason: "author as reviewer",
        decidedAtIso: "2026-11-20T03:05:00.000Z",
      },
    });
    expect(nonA25.ok).toBe(false);

    const selfBind = createReviewBinding({
      bindingId: "bind-self",
      proposal: { ...proposal(), selfApprovalAttempted: true },
      proposalArtifactId: "art-draft-1",
      proposalRevision: "rev-a",
      proposalChecksum: "88".repeat(32),
      evidencePackageDigest: "pkg:self:1",
      createdAtIso: "2026-11-20T03:00:00.000Z",
    });
    expect(selfBind.ok).toBe(false);
  });
});
