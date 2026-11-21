/**
 * Fixture proof for T-X019 / T-US-036 — approved payload edited (digest
 * conflict) and stale approval invalidated on revision change.
 *
 * A25 review binding is pinned to exact proposal revision + checksum +
 * evidence digest. Editing any of those invalidates the binding; a prior
 * acceptance cannot be reused. External effects: NONE.
 * Avoids credential rebind (#43) lane.
 */

import { randomUUID } from "node:crypto";
import {
  ReviewBindingStatus,
  SoakProofKind,
  acceptBoundReviewVerdict,
  createReviewBinding,
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
 */
export function proofApprovedPayloadEditInvalidated(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

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
  if (valid.ok) {
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
    if (
      !digestConflict.ok &&
      digestConflict.code === "BINDING_INVALIDATED" &&
      digestConflict.binding.status === ReviewBindingStatus.INVALIDATED &&
      /proposalChecksum/.test(digestConflict.reason)
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

    // 4. Verdict after edit must fail (cannot ship on stale acceptance).
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

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
