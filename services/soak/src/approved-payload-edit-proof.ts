/**
 * Fixture proof for T-X019 / T-US-036 — approved payload edited (digest
 * conflict) and stale approval invalidated on revision change.
 *
 * A25 review binding is pinned to exact proposal revision + checksum +
 * evidence digest. Editing any of those invalidates the binding; a prior
 * acceptance cannot be reused. External effects: NONE. Live wiring: NOT_WIRED.
 * Fixture ACCEPTED ≠ VERIFIED. Avoids credential rebind (#43) lane.
 */

import { randomUUID } from "node:crypto";
import {
  REVIEW_BINDING_EXTERNAL_EFFECTS,
  REVIEW_BINDING_LIVE_CLAIM_REFUSED,
  REVIEW_BINDING_LIVE_WIRING,
  REVIEW_BINDING_RELATED_CASE_IDS,
  ReviewBindingStatus,
  SoakProofKind,
  acceptBoundReviewVerdict,
  assertReviewBindingFixtureHonesty,
  classifyReviewBindingMismatch,
  createReviewBinding,
  isReviewBindingTerminal,
  reviewBindingSnapshotMatches,
  summarizeReviewBindingHonesty,
  validateReviewBinding,
  type EffectProposal,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseProposal(
  overrides: Partial<EffectProposal> = {},
): EffectProposal {
  return {
    proposalId: `prop-edit-${randomUUID().slice(0, 8)}`,
    authorRoleId: "A13",
    actionClass: "create",
    operation: "stage_artifact",
    assetId: "page-training",
    channelId: "local-artifact",
    payloadDigest: "digest-approved-1",
    evidenceArtifactIds: ["fact-capacity"],
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-X019 / T-US-036 fixture ACCEPTED.
 * Hillclimb: evidence/artifact digest hops, terminal ACCEPTED refuse,
 * classifier match, liveProviderWiring=NOT_WIRED honesty.
 */
export function proofApprovedPayloadEditInvalidated(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  if (
    !REVIEW_BINDING_RELATED_CASE_IDS.includes("T-X019") ||
    !REVIEW_BINDING_RELATED_CASE_IDS.includes("T-US-036")
  ) {
    passed = false;
    details.push("RELATED_CASE_IDS missing T-X019/T-US-036");
  }

  const proposal = baseProposal();
  const snapshot = {
    proposalArtifactId: "art-draft-1",
    proposalRevision: "rev-a",
    proposalChecksum: "aa".repeat(32),
    evidencePackageDigest: "pkg:ok:1",
  };

  const created = createReviewBinding({
    bindingId: `bind-edit-${randomUUID().slice(0, 8)}`,
    proposal,
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (!created.ok) {
    return {
      proofId: `proof-approved-edit-${randomUUID()}`,
      kind: SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED,
      passed: false,
      details: [`Failed to create review binding: ${created.code}`],
      applyAttemptCount: 1,
      operationId: `op-tx019-${randomUUID().slice(0, 8)}`,
      createdAtIso: nowIso,
      fixtureOnly: true,
    };
  }

  // 1. Positive: matching snapshot validates; A25 can accept.
  const valid = validateReviewBinding(created.binding, snapshot);
  if (
    valid.ok &&
    reviewBindingSnapshotMatches(created.binding, snapshot) &&
    classifyReviewBindingMismatch(created.binding, snapshot).length === 0
  ) {
    details.push("Bound review validates against exact revision/digest");
  } else {
    passed = false;
    details.push("Matching snapshot unexpectedly invalidated binding");
  }

  const accepted = acceptBoundReviewVerdict({
    binding: created.binding,
    proposal,
    current: snapshot,
    verdict: {
      verdictId: `verdict-ok-${randomUUID().slice(0, 8)}`,
      proposalId: proposal.proposalId,
      reviewerRoleId: "A25",
      authorRoleId: "A13",
      approved: true,
      reason: "Citations match measured evidence",
      decidedAtIso: nowIso,
    },
  });
  if (accepted.ok && accepted.binding.status === ReviewBindingStatus.ACCEPTED) {
    details.push("A25 accepted while digests matched");
  } else {
    passed = false;
    details.push("A25 accept on matching binding failed");
  }

  // Fresh BOUND binding for edit scenarios (terminal ACCEPTED cannot re-verify).
  const fresh = createReviewBinding({
    bindingId: `bind-edit2-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal(),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (!fresh.ok) {
    passed = false;
    details.push("Failed to create fresh binding for edit checks");
  } else {
    // 2. T-X019: approved payload edited → checksum digest conflict.
    const digestConflict = validateReviewBinding(fresh.binding, {
      ...snapshot,
      proposalChecksum: "bb".repeat(32),
    });
    const digestFields = classifyReviewBindingMismatch(fresh.binding, {
      ...snapshot,
      proposalChecksum: "bb".repeat(32),
    });
    if (
      !digestConflict.ok &&
      digestConflict.code === "BINDING_INVALIDATED" &&
      digestConflict.binding.status === ReviewBindingStatus.INVALIDATED &&
      /proposalChecksum/.test(digestConflict.reason) &&
      digestFields.length === 1 &&
      digestFields[0] === "proposalChecksum"
    ) {
      details.push(
        "T-X019: payload checksum edit invalidated binding (digest conflict)",
      );
    } else {
      passed = false;
      details.push("T-X019 digest conflict check failed");
    }

    // 3. T-US-036: revision change invalidates stale approval binding.
    const staleRevision = validateReviewBinding(fresh.binding, {
      ...snapshot,
      proposalRevision: "rev-b",
    });
    if (
      !staleRevision.ok &&
      staleRevision.code === "BINDING_INVALIDATED" &&
      staleRevision.binding.status === ReviewBindingStatus.INVALIDATED &&
      /proposalRevision/.test(staleRevision.reason)
    ) {
      details.push(
        "T-US-036: revision change invalidated stale approval binding",
      );
    } else {
      passed = false;
      details.push("T-US-036 stale revision check failed");
    }

    // 4. Evidence package digest edit (T-X019 family).
    const evidenceEdit = validateReviewBinding(fresh.binding, {
      ...snapshot,
      evidencePackageDigest: "pkg:edited:9",
    });
    if (
      !evidenceEdit.ok &&
      evidenceEdit.code === "BINDING_INVALIDATED" &&
      /evidencePackageDigest/.test(evidenceEdit.reason)
    ) {
      details.push(
        "T-X019: evidencePackageDigest edit invalidated binding",
      );
    } else {
      passed = false;
      details.push("evidencePackageDigest edit check failed");
    }

    // 5. proposalArtifactId edit (T-X019 family).
    const artifactEdit = validateReviewBinding(fresh.binding, {
      ...snapshot,
      proposalArtifactId: "art-draft-swapped",
    });
    if (
      !artifactEdit.ok &&
      artifactEdit.code === "BINDING_INVALIDATED" &&
      /proposalArtifactId/.test(artifactEdit.reason)
    ) {
      details.push(
        "T-X019: proposalArtifactId edit invalidated binding",
      );
    } else {
      passed = false;
      details.push("proposalArtifactId edit check failed");
    }

    // 6. Multi-field simultaneous edit (revision + checksum) — structured fields.
    const multiEdit = validateReviewBinding(fresh.binding, {
      ...snapshot,
      proposalRevision: "rev-multi",
      proposalChecksum: "dd".repeat(32),
    });
    if (
      !multiEdit.ok &&
      multiEdit.code === "BINDING_INVALIDATED" &&
      Array.isArray(multiEdit.mismatchedFields) &&
      multiEdit.mismatchedFields.includes("proposalRevision") &&
      multiEdit.mismatchedFields.includes("proposalChecksum")
    ) {
      details.push(
        "T-X019: multi-field revision+checksum edit invalidated (mismatchedFields)",
      );
    } else {
      passed = false;
      details.push("multi-field mismatchedFields check failed");
    }

    // 7. Verdict after edit must fail (cannot ship on stale acceptance).
    const afterEdit = acceptBoundReviewVerdict({
      binding: fresh.binding,
      proposal: baseProposal(),
      current: { ...snapshot, proposalChecksum: "cc".repeat(32) },
      verdict: {
        verdictId: `verdict-stale-${randomUUID().slice(0, 8)}`,
        proposalId: proposal.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "stale after edit",
        decidedAtIso: nowIso,
      },
    });
    if (!afterEdit.ok) {
      details.push("Verdict after payload edit rejected (stale binding)");
    } else {
      passed = false;
      details.push("Verdict unexpectedly accepted after payload edit");
    }
  }

  // 8. Terminal ACCEPTED cannot be reused for a second verdict.
  if (accepted.ok) {
    const reuse = acceptBoundReviewVerdict({
      binding: accepted.binding,
      proposal,
      current: snapshot,
      verdict: {
        verdictId: `verdict-reuse-${randomUUID().slice(0, 8)}`,
        proposalId: proposal.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "reuse terminal",
        decidedAtIso: nowIso,
      },
    });
    if (!reuse.ok && /terminal/.test(reuse.reason)) {
      details.push("Terminal ACCEPTED binding refuse reuse (new binding required)");
    } else {
      passed = false;
      details.push("Terminal ACCEPTED reuse unexpectedly allowed");
    }
  }

  // 9. Terminal REJECTED likewise cannot flip to accept without new binding.
  const rejectBind = createReviewBinding({
    bindingId: `bind-rej-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ proposalId: `prop-rej-${randomUUID().slice(0, 8)}` }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (rejectBind.ok) {
    const rejected = acceptBoundReviewVerdict({
      binding: rejectBind.binding,
      proposal: {
        ...baseProposal(),
        proposalId: rejectBind.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-rej-${randomUUID().slice(0, 8)}`,
        proposalId: rejectBind.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: false,
        reason: "insufficient evidence",
        decidedAtIso: nowIso,
      },
    });
    if (rejected.ok && rejected.binding.status === ReviewBindingStatus.REJECTED) {
      const flip = acceptBoundReviewVerdict({
        binding: rejected.binding,
        proposal: {
          ...baseProposal(),
          proposalId: rejectBind.binding.proposalId,
        },
        current: snapshot,
        verdict: {
          verdictId: `verdict-flip-${randomUUID().slice(0, 8)}`,
          proposalId: rejectBind.binding.proposalId,
          reviewerRoleId: "A25",
          authorRoleId: "A13",
          approved: true,
          reason: "flip after reject",
          decidedAtIso: nowIso,
        },
      });
      if (!flip.ok && /terminal/.test(flip.reason)) {
        details.push("Terminal REJECTED binding refuse reuse (new binding required)");
      } else {
        passed = false;
        details.push("Terminal REJECTED reuse unexpectedly allowed");
      }
    } else {
      passed = false;
      details.push("REJECTED terminal setup failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for REJECTED reuse check");
  }

  // 10. Non-A25 reviewer refused (control; Distinct from full T-X018 path).
  const a25Only = createReviewBinding({
    bindingId: `bind-a25-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ proposalId: `prop-a25-${randomUUID().slice(0, 8)}` }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (a25Only.ok) {
    const nonA25 = acceptBoundReviewVerdict({
      binding: a25Only.binding,
      proposal: {
        ...baseProposal(),
        proposalId: a25Only.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-non-${randomUUID().slice(0, 8)}`,
        proposalId: a25Only.binding.proposalId,
        reviewerRoleId: "A13",
        authorRoleId: "A13",
        approved: true,
        reason: "author as reviewer",
        decidedAtIso: nowIso,
      },
    });
    if (!nonA25.ok) {
      details.push("Non-A25 reviewer verdict refused");
    } else {
      passed = false;
      details.push("Non-A25 reviewer unexpectedly accepted");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for non-A25 check");
  }

  // 11. Self-approval bind refuse (control; Distinct from T-US-054/T-X018 alone).
  const selfBind = createReviewBinding({
    bindingId: `bind-self-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ selfApprovalAttempted: true }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (!selfBind.ok) {
    details.push("Self-approval bind refused (distinct from T-X018 alone)");
  } else {
    passed = false;
    details.push("Self-approval bind unexpectedly allowed");
  }

  // 12. Sticky INVALIDATED: rematching snapshot cannot heal (T-X019).
  const sticky = createReviewBinding({
    bindingId: `bind-sticky-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ proposalId: `prop-sticky-${randomUUID().slice(0, 8)}` }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (sticky.ok) {
    const broken = validateReviewBinding(sticky.binding, {
      ...snapshot,
      proposalChecksum: "ee".repeat(32),
    });
    if (
      !broken.ok &&
      broken.binding.status === ReviewBindingStatus.INVALIDATED
    ) {
      const rematch = validateReviewBinding(broken.binding, snapshot);
      if (
        !rematch.ok &&
        rematch.code === "BINDING_INVALIDATED" &&
        rematch.binding.status === ReviewBindingStatus.INVALIDATED
      ) {
        details.push(
          "T-X019: sticky INVALIDATED refuses rematch snapshot heal",
        );
      } else {
        passed = false;
        details.push("sticky INVALIDATED rematch unexpectedly healed");
      }
    } else {
      passed = false;
      details.push("sticky INVALIDATED setup failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for sticky INVALIDATED check");
  }

  // 13. Verdict proposalId mismatch + evidenceArtifactIds swap refused.
  const mm = createReviewBinding({
    bindingId: `bind-mm-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ proposalId: `prop-mm-${randomUUID().slice(0, 8)}` }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (mm.ok) {
    const badId = acceptBoundReviewVerdict({
      binding: mm.binding,
      proposal: {
        ...baseProposal(),
        proposalId: mm.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-badid-${randomUUID().slice(0, 8)}`,
        proposalId: "prop-wrong-id",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "wrong proposal id",
        decidedAtIso: nowIso,
      },
    });
    const badEv = acceptBoundReviewVerdict({
      binding: mm.binding,
      proposal: {
        ...baseProposal(),
        proposalId: mm.binding.proposalId,
        evidenceArtifactIds: ["fact-swapped"],
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-badev-${randomUUID().slice(0, 8)}`,
        proposalId: mm.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "swapped evidence",
        decidedAtIso: nowIso,
      },
    });
    if (!badId.ok && !badEv.ok) {
      details.push(
        "Verdict proposalId mismatch and evidenceArtifactIds swap refused",
      );
    } else {
      passed = false;
      details.push("proposalId/evidenceArtifactIds mismatch checks failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for mismatch checks");
  }

  // 14. All four snapshot fields mismatch at once.
  const four = createReviewBinding({
    bindingId: `bind-four-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ proposalId: `prop-four-${randomUUID().slice(0, 8)}` }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (four.ok) {
    const all = validateReviewBinding(four.binding, {
      proposalArtifactId: "art-other",
      proposalRevision: "rev-z",
      proposalChecksum: "ff".repeat(32),
      evidencePackageDigest: "pkg:other",
    });
    if (
      !all.ok &&
      Array.isArray(all.mismatchedFields) &&
      all.mismatchedFields.length === 4 &&
      !isReviewBindingTerminal(all.binding.status) &&
      all.binding.status === ReviewBindingStatus.INVALIDATED
    ) {
      details.push(
        "T-X019: all-four-field snapshot mismatch invalidated (mismatchedFields=4)",
      );
    } else {
      passed = false;
      details.push("all-four-field mismatch check failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for all-four-field check");
  }

  // 15. Blank/whitespace pin fields refused at create (edge honesty).
  const blankChecksum = createReviewBinding({
    bindingId: `bind-blank-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal(),
    ...snapshot,
    proposalChecksum: "   ",
    createdAtIso: nowIso,
  });
  const blankEvidence = createReviewBinding({
    bindingId: `bind-blank-ev-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal(),
    ...snapshot,
    evidencePackageDigest: "\t",
    createdAtIso: nowIso,
  });
  if (!blankChecksum.ok && !blankEvidence.ok) {
    details.push("Blank/whitespace pin fields refused at create");
  } else {
    passed = false;
    details.push("Blank pin create unexpectedly allowed");
  }

  // 16. Accept on already-INVALIDATED binding refused.
  const invBind = createReviewBinding({
    bindingId: `bind-inv-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ proposalId: `prop-inv-${randomUUID().slice(0, 8)}` }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (invBind.ok) {
    const broken = validateReviewBinding(invBind.binding, {
      ...snapshot,
      proposalArtifactId: "art-edited",
    });
    if (!broken.ok && broken.binding.status === ReviewBindingStatus.INVALIDATED) {
      const onInv = acceptBoundReviewVerdict({
        binding: broken.binding,
        proposal: {
          ...baseProposal(),
          proposalId: invBind.binding.proposalId,
        },
        current: snapshot,
        verdict: {
          verdictId: `verdict-oninv-${randomUUID().slice(0, 8)}`,
          proposalId: invBind.binding.proposalId,
          reviewerRoleId: "A25",
          authorRoleId: "A13",
          approved: true,
          reason: "after invalidate",
          decidedAtIso: nowIso,
        },
      });
      if (!onInv.ok) {
        details.push("Accept on already-INVALIDATED binding refused");
      } else {
        passed = false;
        details.push("Accept on INVALIDATED unexpectedly allowed");
      }
    } else {
      passed = false;
      details.push("INVALIDATED setup for accept-refuse failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for INVALIDATED accept refuse");
  }

  // 17. Empty proposalId refused at create.
  const emptyProp = createReviewBinding({
    bindingId: `bind-empty-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ proposalId: "  " }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (!emptyProp.ok && emptyProp.code === "PROPOSAL_REQUIRED") {
    details.push("Empty proposalId refused at create (PROPOSAL_REQUIRED)");
  } else {
    passed = false;
    details.push("Empty proposalId create unexpectedly allowed");
  }

  // 18. Terminal REJECTED rematch validate refused.
  const rejRematch = createReviewBinding({
    bindingId: `bind-rejre-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-rejre-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (rejRematch.ok) {
    const rejected = acceptBoundReviewVerdict({
      binding: rejRematch.binding,
      proposal: {
        ...baseProposal(),
        proposalId: rejRematch.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-rejre-${randomUUID().slice(0, 8)}`,
        proposalId: rejRematch.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: false,
        reason: "reject for rematch",
        decidedAtIso: nowIso,
      },
    });
    if (
      rejected.ok &&
      rejected.binding.status === ReviewBindingStatus.REJECTED &&
      isReviewBindingTerminal(rejected.binding.status)
    ) {
      const rematch = validateReviewBinding(rejected.binding, snapshot);
      if (!rematch.ok && /terminal/.test(rematch.reason)) {
        details.push(
          "Terminal REJECTED rematch validate refused (new binding required)",
        );
      } else {
        passed = false;
        details.push("REJECTED rematch validate unexpectedly allowed");
      }
    } else {
      passed = false;
      details.push("REJECTED rematch setup failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for REJECTED rematch");
  }

  // 19. Blank artifact/revision pin fields refused at create.
  const blankArt = createReviewBinding({
    bindingId: `bind-blank-art-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal(),
    ...snapshot,
    proposalArtifactId: "  ",
    createdAtIso: nowIso,
  });
  const blankRev = createReviewBinding({
    bindingId: `bind-blank-rev-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal(),
    ...snapshot,
    proposalRevision: "\t",
    createdAtIso: nowIso,
  });
  if (
    !blankArt.ok &&
    blankArt.code === "ARTIFACT_REVISION_REQUIRED" &&
    !blankRev.ok &&
    blankRev.code === "ARTIFACT_REVISION_REQUIRED"
  ) {
    details.push(
      "Blank artifact/revision pin fields refused at create (ARTIFACT_REVISION_REQUIRED)",
    );
  } else {
    passed = false;
    details.push("Blank artifact/revision create unexpectedly allowed");
  }

  // 20. Terminal ACCEPTED rematch validate refused.
  const accRematch = createReviewBinding({
    bindingId: `bind-accre-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-accre-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (accRematch.ok) {
    const accepted = acceptBoundReviewVerdict({
      binding: accRematch.binding,
      proposal: {
        ...baseProposal(),
        proposalId: accRematch.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-accre-${randomUUID().slice(0, 8)}`,
        proposalId: accRematch.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "accept for rematch",
        decidedAtIso: nowIso,
      },
    });
    if (
      accepted.ok &&
      accepted.binding.status === ReviewBindingStatus.ACCEPTED &&
      isReviewBindingTerminal(accepted.binding.status)
    ) {
      const rematch = validateReviewBinding(accepted.binding, snapshot);
      if (!rematch.ok && /terminal/.test(rematch.reason)) {
        details.push(
          "Terminal ACCEPTED rematch validate refused (new binding required)",
        );
      } else {
        passed = false;
        details.push("ACCEPTED rematch validate unexpectedly allowed");
      }
    } else {
      passed = false;
      details.push("ACCEPTED rematch setup failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for ACCEPTED rematch");
  }

  // 21. Live VERIFIED claim refused (fixture honesty).
  const liveClaim = assertReviewBindingFixtureHonesty({
    fixtureOnly: true,
    claimLiveVerified: true,
  });
  const nonFixture = assertReviewBindingFixtureHonesty({
    fixtureOnly: false,
  });
  const fixtureOk = assertReviewBindingFixtureHonesty({
    fixtureOnly: true,
    claimLiveVerified: false,
  });
  if (
    fixtureOk.ok &&
    !liveClaim.ok &&
    liveClaim.code === REVIEW_BINDING_LIVE_CLAIM_REFUSED &&
    !nonFixture.ok
  ) {
    details.push(
      `Live VERIFIED claim refused (${REVIEW_BINDING_LIVE_CLAIM_REFUSED})`,
    );
  } else {
    passed = false;
    details.push("Live VERIFIED claim refuse check failed");
  }

  // 22. Whitespace-padded snapshot still matches after trim-normalize.
  const trimBind = createReviewBinding({
    bindingId: `bind-trim-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-trim-${randomUUID().slice(0, 8)}`,
    }),
    proposalArtifactId: `  ${snapshot.proposalArtifactId}  `,
    proposalRevision: `  ${snapshot.proposalRevision}  `,
    proposalChecksum: `  ${snapshot.proposalChecksum}  `,
    evidencePackageDigest: `  ${snapshot.evidencePackageDigest}  `,
    createdAtIso: nowIso,
  });
  if (trimBind.ok) {
    const paddedOk = validateReviewBinding(trimBind.binding, {
      proposalArtifactId: ` ${snapshot.proposalArtifactId} `,
      proposalRevision: ` ${snapshot.proposalRevision} `,
      proposalChecksum: ` ${snapshot.proposalChecksum} `,
      evidencePackageDigest: ` ${snapshot.evidencePackageDigest} `,
    });
    if (
      paddedOk.ok &&
      trimBind.binding.proposalArtifactId === snapshot.proposalArtifactId &&
      reviewBindingSnapshotMatches(trimBind.binding, {
        proposalArtifactId: ` ${snapshot.proposalArtifactId} `,
        proposalRevision: ` ${snapshot.proposalRevision} `,
        proposalChecksum: ` ${snapshot.proposalChecksum} `,
        evidencePackageDigest: ` ${snapshot.evidencePackageDigest} `,
      })
    ) {
      details.push(
        "Whitespace-padded snapshot trim-matches bound pins",
      );
    } else {
      passed = false;
      details.push("Trim-match padded snapshot check failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for trim-match check");
  }

  // 23. Reject verdict on already-INVALIDATED binding refused.
  const rejInv = createReviewBinding({
    bindingId: `bind-rejinv-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-rejinv-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (rejInv.ok) {
    const broken = validateReviewBinding(rejInv.binding, {
      ...snapshot,
      proposalRevision: "rev-edited",
    });
    if (!broken.ok && broken.binding.status === ReviewBindingStatus.INVALIDATED) {
      const onInv = acceptBoundReviewVerdict({
        binding: broken.binding,
        proposal: {
          ...baseProposal(),
          proposalId: rejInv.binding.proposalId,
        },
        current: snapshot,
        verdict: {
          verdictId: `verdict-rejinv-${randomUUID().slice(0, 8)}`,
          proposalId: rejInv.binding.proposalId,
          reviewerRoleId: "A25",
          authorRoleId: "A13",
          approved: false,
          reason: "reject after invalidate",
          decidedAtIso: nowIso,
        },
      });
      if (!onInv.ok) {
        details.push("Reject on already-INVALIDATED binding refused");
      } else {
        passed = false;
        details.push("Reject on INVALIDATED unexpectedly allowed");
      }
    } else {
      passed = false;
      details.push("INVALIDATED setup for reject-refuse failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for INVALIDATED reject refuse");
  }

  // 24. Unknown authorRoleId refused at create.
  const unkAuthor = createReviewBinding({
    bindingId: `bind-unk-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ authorRoleId: "A99" as never }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (!unkAuthor.ok && unkAuthor.code === "AUTHOR_UNKNOWN") {
    details.push("Unknown authorRoleId refused at create (AUTHOR_UNKNOWN)");
  } else {
    passed = false;
    details.push("Unknown authorRoleId create unexpectedly allowed");
  }

  // 25. Empty bindingId refused at create.
  const emptyBind = createReviewBinding({
    bindingId: "   ",
    proposal: baseProposal(),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (!emptyBind.ok && emptyBind.code === "BINDING_ID_REQUIRED") {
    details.push("Empty bindingId refused at create (BINDING_ID_REQUIRED)");
  } else {
    passed = false;
    details.push("Empty bindingId create unexpectedly allowed");
  }

  // 26. Padded wrong revision still INVALIDATED (trim does not heal edits).
  const padMm = createReviewBinding({
    bindingId: `bind-padmm-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-padmm-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (padMm.ok) {
    const broken = validateReviewBinding(padMm.binding, {
      ...snapshot,
      proposalRevision: `  ${snapshot.proposalRevision}-edited  `,
    });
    if (
      !broken.ok &&
      broken.binding.status === ReviewBindingStatus.INVALIDATED &&
      broken.mismatchedFields?.includes("proposalRevision")
    ) {
      details.push(
        "Padded wrong revision still INVALIDATED (trim does not heal edits)",
      );
    } else {
      passed = false;
      details.push("Padded wrong-revision invalidate check failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for padded mismatch check");
  }

  // 27. Padded wrong checksum still INVALIDATED.
  const padCk = createReviewBinding({
    bindingId: `bind-padck-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-padck-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (padCk.ok) {
    const broken = validateReviewBinding(padCk.binding, {
      ...snapshot,
      // Distinct from snapshot.proposalChecksum ("aa".repeat(32)).
      proposalChecksum: `  ${"bb".repeat(32)}  `,
    });
    if (
      !broken.ok &&
      broken.binding.status === ReviewBindingStatus.INVALIDATED &&
      broken.mismatchedFields?.includes("proposalChecksum")
    ) {
      details.push(
        "Padded wrong checksum still INVALIDATED (trim does not heal edits)",
      );
    } else {
      passed = false;
      details.push("Padded wrong-checksum invalidate check failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for padded checksum check");
  }

  // 28. Padded wrong evidence digest still INVALIDATED.
  const padEv = createReviewBinding({
    bindingId: `bind-padev-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-padev-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (padEv.ok) {
    const broken = validateReviewBinding(padEv.binding, {
      ...snapshot,
      evidencePackageDigest: `  ${snapshot.evidencePackageDigest}-edited  `,
    });
    if (
      !broken.ok &&
      broken.binding.status === ReviewBindingStatus.INVALIDATED &&
      broken.mismatchedFields?.includes("evidencePackageDigest")
    ) {
      details.push(
        "Padded wrong evidence digest still INVALIDATED (trim does not heal edits)",
      );
    } else {
      passed = false;
      details.push("Padded wrong-evidence invalidate check failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for padded evidence check");
  }

  // 29. Padded wrong proposalArtifactId still INVALIDATED.
  const padArt = createReviewBinding({
    bindingId: `bind-padart-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-padart-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (padArt.ok) {
    const broken = validateReviewBinding(padArt.binding, {
      ...snapshot,
      proposalArtifactId: `  ${snapshot.proposalArtifactId}-edited  `,
    });
    if (
      !broken.ok &&
      broken.binding.status === ReviewBindingStatus.INVALIDATED &&
      broken.mismatchedFields?.includes("proposalArtifactId")
    ) {
      details.push(
        "Padded wrong proposalArtifactId still INVALIDATED (trim does not heal edits)",
      );
    } else {
      passed = false;
      details.push("Padded wrong-artifactId invalidate check failed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for padded artifactId check");
  }

  // 30. Blank verdict authorRoleId refused (BINDING_MISMATCH).
  const blankAuth = createReviewBinding({
    bindingId: `bind-blauth-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-blauth-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (blankAuth.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: blankAuth.binding,
      proposal: {
        ...baseProposal(),
        proposalId: blankAuth.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-blauth-${randomUUID().slice(0, 8)}`,
        proposalId: blankAuth.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "   " as never,
        approved: true,
        reason: "blank author",
        decidedAtIso: nowIso,
      },
    });
    if (!refused.ok && refused.code === "BINDING_MISMATCH") {
      details.push(
        "Blank verdict authorRoleId refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push("Blank verdict authorRoleId unexpectedly allowed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for blank author check");
  }

  // 31. Supplied proposal authorRoleId mismatch refused (BINDING_MISMATCH).
  const propAuth = createReviewBinding({
    bindingId: `bind-propauth-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-propauth-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (propAuth.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: propAuth.binding,
      proposal: {
        ...baseProposal(),
        proposalId: propAuth.binding.proposalId,
        authorRoleId: "A14",
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-propauth-${randomUUID().slice(0, 8)}`,
        proposalId: propAuth.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "proposal author swapped",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Supplied proposal.authorRoleId")
    ) {
      details.push(
        "Supplied proposal authorRoleId mismatch refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push("Supplied proposal authorRoleId mismatch unexpectedly allowed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for proposal author mismatch check");
  }

  // 32. Supplied proposal proposalId mismatch refused (BINDING_MISMATCH).
  const propId = createReviewBinding({
    bindingId: `bind-propid-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-propid-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (propId.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: propId.binding,
      proposal: {
        ...baseProposal(),
        proposalId: "prop-swapped-id",
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-propid-${randomUUID().slice(0, 8)}`,
        proposalId: propId.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "proposal id swapped",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Supplied proposal.proposalId")
    ) {
      details.push(
        "Supplied proposal proposalId mismatch refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push("Supplied proposal proposalId mismatch unexpectedly allowed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for proposal id mismatch check");
  }

  // 33. Padded verdict proposalId refused (BINDING_MISMATCH).
  const vPadId = createReviewBinding({
    bindingId: `bind-vpadid-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-vpadid-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (vPadId.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: vPadId.binding,
      proposal: {
        ...baseProposal(),
        proposalId: vPadId.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-vpadid-${randomUUID().slice(0, 8)}`,
        proposalId: `  ${vPadId.binding.proposalId}  `,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "padded verdict proposalId",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Verdict proposalId")
    ) {
      details.push(
        "Padded verdict proposalId refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push("Padded verdict proposalId unexpectedly allowed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for padded verdict proposalId check");
  }

  // 34. Verdict authorRoleId mismatch refused (BINDING_MISMATCH).
  const vAuth = createReviewBinding({
    bindingId: `bind-vauth-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-vauth-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (vAuth.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: vAuth.binding,
      proposal: {
        ...baseProposal(),
        proposalId: vAuth.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-vauth-${randomUUID().slice(0, 8)}`,
        proposalId: vAuth.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A14",
        approved: true,
        reason: "verdict author mismatch",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Verdict authorRoleId")
    ) {
      details.push(
        "Verdict authorRoleId mismatch refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push("Verdict authorRoleId mismatch unexpectedly allowed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for verdict author mismatch check");
  }

  // 35. Blank verdict proposalId refused (BINDING_MISMATCH).
  const vBlankId = createReviewBinding({
    bindingId: `bind-vblankid-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-vblankid-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (vBlankId.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: vBlankId.binding,
      proposal: {
        ...baseProposal(),
        proposalId: vBlankId.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-vblankid-${randomUUID().slice(0, 8)}`,
        proposalId: "   ",
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "blank verdict proposalId",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Verdict proposalId")
    ) {
      details.push(
        "Blank verdict proposalId refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push("Blank verdict proposalId unexpectedly allowed");
    }
  } else {
    passed = false;
    details.push("Failed to create binding for blank verdict proposalId check");
  }

  // 36. Padded supplied proposal proposalId refused (BINDING_MISMATCH).
  const padPropId = createReviewBinding({
    bindingId: `bind-padpropid-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-padpropid-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (padPropId.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: padPropId.binding,
      proposal: {
        ...baseProposal(),
        proposalId: `  ${padPropId.binding.proposalId}  `,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-padpropid-${randomUUID().slice(0, 8)}`,
        proposalId: padPropId.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "padded supplied proposalId",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Supplied proposal.proposalId")
    ) {
      details.push(
        "Padded supplied proposal proposalId refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push(
        "Padded supplied proposal proposalId unexpectedly allowed",
      );
    }
  } else {
    passed = false;
    details.push(
      "Failed to create binding for padded supplied proposalId check",
    );
  }

  // 37. Padded supplied proposal authorRoleId refused (BINDING_MISMATCH).
  const padPropAuth = createReviewBinding({
    bindingId: `bind-padpropauth-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-padpropauth-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (padPropAuth.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: padPropAuth.binding,
      proposal: {
        ...baseProposal(),
        proposalId: padPropAuth.binding.proposalId,
        authorRoleId: "  A13  " as never,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-padpropauth-${randomUUID().slice(0, 8)}`,
        proposalId: padPropAuth.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "A13",
        approved: true,
        reason: "padded supplied author",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Supplied proposal.authorRoleId")
    ) {
      details.push(
        "Padded supplied proposal authorRoleId refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push(
        "Padded supplied proposal authorRoleId unexpectedly allowed",
      );
    }
  } else {
    passed = false;
    details.push(
      "Failed to create binding for padded supplied authorRoleId check",
    );
  }

  // 38. Padded verdict authorRoleId refused (BINDING_MISMATCH).
  const padVerdictAuth = createReviewBinding({
    bindingId: `bind-padverdictauth-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({
      proposalId: `prop-padverdictauth-${randomUUID().slice(0, 8)}`,
    }),
    ...snapshot,
    createdAtIso: nowIso,
  });
  if (padVerdictAuth.ok) {
    const refused = acceptBoundReviewVerdict({
      binding: padVerdictAuth.binding,
      proposal: {
        ...baseProposal(),
        proposalId: padVerdictAuth.binding.proposalId,
      },
      current: snapshot,
      verdict: {
        verdictId: `verdict-padverdictauth-${randomUUID().slice(0, 8)}`,
        proposalId: padVerdictAuth.binding.proposalId,
        reviewerRoleId: "A25",
        authorRoleId: "  A13  " as never,
        approved: true,
        reason: "padded verdict authorRoleId",
        decidedAtIso: nowIso,
      },
    });
    if (
      !refused.ok &&
      refused.code === "BINDING_MISMATCH" &&
      refused.reason.includes("Verdict authorRoleId")
    ) {
      details.push(
        "Padded verdict authorRoleId refused (BINDING_MISMATCH)",
      );
    } else {
      passed = false;
      details.push(
        "Padded verdict authorRoleId unexpectedly allowed",
      );
    }
  } else {
    passed = false;
    details.push(
      "Failed to create binding for padded verdict authorRoleId check",
    );
  }

  const honesty = summarizeReviewBindingHonesty();
  if (
    honesty.relatedCaseIds.join(",") ===
      REVIEW_BINDING_RELATED_CASE_IDS.join(",") &&
    honesty.liveWiring === REVIEW_BINDING_LIVE_WIRING &&
    honesty.externalEffects === REVIEW_BINDING_EXTERNAL_EFFECTS &&
    honesty.liveClaimRefused === REVIEW_BINDING_LIVE_CLAIM_REFUSED &&
    honesty.fixtureOnly === true &&
    honesty.claimLiveVerified === false
  ) {
    details.push(
      `honestySummary=relatedCaseIds:${honesty.relatedCaseIds.join(",")},liveWiring:${honesty.liveWiring},liveClaimRefused:${honesty.liveClaimRefused}`,
    );
  } else {
    passed = false;
    details.push("honestySummary helper mismatch");
  }

  details.push(
    `relatedCaseIds=${REVIEW_BINDING_RELATED_CASE_IDS.join(",")}`,
  );
  details.push(
    `liveProviderSuccessClaimed=false liveProviderWiring=${REVIEW_BINDING_LIVE_WIRING} externalEffects=${REVIEW_BINDING_EXTERNAL_EFFECTS} liveClaimRefused=${REVIEW_BINDING_LIVE_CLAIM_REFUSED}`,
  );
  details.push(
    "fixtureOnly=true ACCEPTED≠VERIFIED claimLiveVerified=false applyAttemptCount=1",
  );
  details.push(
    "Distinct from T-US-035 (review/revise/release receipt-or-blocked) and T-US-054/T-X018 (self-approval alone)",
  );

  return {
    proofId: `proof-approved-edit-${randomUUID()}`,
    kind: SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx019-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
