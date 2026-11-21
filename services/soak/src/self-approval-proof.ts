/**
 * Fixture proof for T-X018 / T-US-054 — self-approval rejected; independent A25 required.
 *
 * Exercises review-gate + review-binding + verdict acceptance so ordinary
 * self-approval cannot bind or approve. External effects: NONE.
 * Never invents live VERIFIED. Avoids credential rebind (#43) lane.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  acceptReviewVerdict,
  createReviewBinding,
  evaluateIndependentReviewGate,
  type EffectProposal,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseProposal(
  overrides: Partial<EffectProposal> = {},
): EffectProposal {
  return {
    proposalId: `prop-self-${randomUUID().slice(0, 8)}`,
    authorRoleId: "A13",
    actionClass: "create",
    operation: "stage_artifact",
    assetId: "page-training",
    channelId: "local-artifact",
    payloadDigest: "digest-self-approval-1",
    evidenceArtifactIds: ["fact-capacity"],
    ...overrides,
  };
}

/**
 * Complete expected proof set for self-approval / independent-approval fixture ACCEPTED.
 */
export function proofSelfApprovalRejected(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Explicit self-approval attempt rejected at independent review gate (T-X018).
  const selfGate = evaluateIndependentReviewGate({
    proposal: baseProposal({ selfApprovalAttempted: true }),
    reviewerRoleId: "A25",
  });
  if (selfGate.ok || selfGate.code !== "SELF_APPROVAL_FORBIDDEN") {
    passed = false;
    details.push(
      `Self-approval gate did not forbid attempt ok=${selfGate.ok} code=${"code" in selfGate ? selfGate.code : "n/a"}`,
    );
  } else {
    details.push(
      `Self-approval gate rejected code=${selfGate.code} reason=${selfGate.reason}`,
    );
  }

  // 2. Review binding refuses self-approval proposals (T-US-054).
  const bindSelf = createReviewBinding({
    bindingId: `bind-self-${randomUUID().slice(0, 8)}`,
    proposal: baseProposal({ selfApprovalAttempted: true }),
    proposalArtifactId: "art-draft-self",
    proposalRevision: "rev-a",
    proposalChecksum: "aa".repeat(32),
    evidencePackageDigest: "pkg:self:1",
    createdAtIso: nowIso,
  });
  if (bindSelf.ok || bindSelf.code !== "SELF_APPROVAL_FORBIDDEN") {
    passed = false;
    details.push(
      `Review binding unexpectedly allowed self-approval ok=${bindSelf.ok}`,
    );
  } else {
    details.push(
      `Review binding refused self-approval code=${bindSelf.code}`,
    );
  }

  // 3. Author cannot act as reviewer (ordinary self-approval).
  const proposal = baseProposal();
  const sameAuthorReviewer = acceptReviewVerdict({
    proposal,
    verdict: {
      verdictId: `verdict-self-${randomUUID().slice(0, 8)}`,
      proposalId: proposal.proposalId,
      reviewerRoleId: "A13",
      authorRoleId: "A13",
      approved: true,
      reason: "author self-approve",
      decidedAtIso: nowIso,
    },
  });
  if (sameAuthorReviewer.ok) {
    passed = false;
    details.push("Author-as-reviewer verdict unexpectedly accepted");
  } else {
    details.push(
      `Author-as-reviewer rejected code=${sameAuthorReviewer.code}`,
    );
  }

  // 4. Independent A25 path succeeds (positive control for T-US-054).
  const independentGate = evaluateIndependentReviewGate({
    proposal,
    reviewerRoleId: "A25",
  });
  const bindOk = createReviewBinding({
    bindingId: `bind-ok-${randomUUID().slice(0, 8)}`,
    proposal,
    proposalArtifactId: "art-draft-ok",
    proposalRevision: "rev-a",
    proposalChecksum: "bb".repeat(32),
    evidencePackageDigest: "pkg:ok:1",
    createdAtIso: nowIso,
  });
  const independentVerdict = acceptReviewVerdict({
    proposal,
    verdict: {
      verdictId: `verdict-a25-${randomUUID().slice(0, 8)}`,
      proposalId: proposal.proposalId,
      reviewerRoleId: "A25",
      authorRoleId: "A13",
      approved: true,
      reason: "independent A25 approve",
      decidedAtIso: nowIso,
    },
  });
  if (!independentGate.ok || !bindOk.ok || !independentVerdict.ok) {
    passed = false;
    details.push(
      `Independent A25 path failed gateOk=${independentGate.ok} bindOk=${bindOk.ok} verdictOk=${independentVerdict.ok}`,
    );
  } else {
    details.push(
      `Independent A25 path ok binding=${bindOk.binding.bindingId} reviewer=${bindOk.binding.reviewerRoleId}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-self-approval-${randomUUID()}`,
    kind: SoakProofKind.SELF_APPROVAL_REJECTED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: proposal.proposalId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
