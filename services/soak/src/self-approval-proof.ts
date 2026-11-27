/**
 * Fixture proof for T-X018 / T-US-054 — self-approval rejected; independent A25 required.
 *
 * Exercises review-gate + review-binding + verdict acceptance so ordinary
 * self-approval cannot bind or approve. External effects: NONE.
 * Never invents live VERIFIED. Avoids credential rebind (#43) lane.
 *
 * Hillclimb: evaluateSelfApprovalHonesty + cross-surface refuse + A25
 * self-review + decision-ledger fence + stale REFUSED→APPROVED upgrade fence +
 * idempotent duplicate REFUSED append.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  acceptReviewVerdict,
  appendSelfApprovalLedgerEntry,
  assertSelfApprovalRefusedAcrossSurfaces,
  createReviewBinding,
  createSelfApprovalDecisionLedger,
  evaluateIndependentReviewGate,
  evaluateSelfApprovalHonesty,
  isAuthorActingAsReviewer,
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

  // 1b. Honesty wrapper on explicit self-approval.
  const honestySelf = evaluateSelfApprovalHonesty({
    proposal: baseProposal({ selfApprovalAttempted: true }),
    reviewerRoleId: "A25",
  });
  if (
    honestySelf.code !== "SELF_APPROVAL_FORBIDDEN" ||
    honestySelf.selfApprovalRejected !== true ||
    honestySelf.liveReviewWiring !== "NOT_WIRED" ||
    honestySelf.externalEffects !== "NONE" ||
    honestySelf.liveProviderSuccessClaimed !== false
  ) {
    passed = false;
    details.push(
      `Self-approval honesty unexpectedly ${JSON.stringify(honestySelf)}`,
    );
  } else {
    details.push(
      "evaluateSelfApprovalHonesty(selfApprovalAttempted) → SELF_APPROVAL_FORBIDDEN; NOT_WIRED/NONE",
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
  if (!isAuthorActingAsReviewer({ authorRoleId: "A13", reviewerRoleId: "A13" })) {
    passed = false;
    details.push("Expected isAuthorActingAsReviewer(A13,A13)=true");
  }
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

  // 3b. Cross-surface refuse for selfApprovalAttempted.
  const surfaces = assertSelfApprovalRefusedAcrossSurfaces({
    proposal: baseProposal({ selfApprovalAttempted: true }),
    nowIso,
    authorAsReviewerVerdict: {
      verdictId: `verdict-x-${randomUUID().slice(0, 8)}`,
      reviewerRoleId: "A13",
      approved: true,
      reason: "cross-surface self",
      decidedAtIso: nowIso,
    },
  });
  if (
    !surfaces.gateRejected ||
    !surfaces.bindingRejected ||
    !surfaces.proposeRejected ||
    !surfaces.verdictRejected ||
    surfaces.externalEffects !== "NONE"
  ) {
    passed = false;
    details.push(`Cross-surface refuse unexpectedly ${JSON.stringify(surfaces)}`);
  } else {
    details.push(
      "assertSelfApprovalRefusedAcrossSurfaces → gate/binding/propose/verdict all reject; NONE",
    );
  }

  // 3c. A25 cannot review its own authorship.
  const a25Self = evaluateSelfApprovalHonesty({
    proposal: baseProposal({ authorRoleId: "A25", proposalId: `prop-a25-${randomUUID().slice(0, 8)}` }),
    reviewerRoleId: "A25",
  });
  if (
    a25Self.code !== "REVIEWER_CANNOT_AUTHOR_SAME" ||
    a25Self.selfApprovalRejected !== true
  ) {
    passed = false;
    details.push(`A25 self-review unexpectedly ${JSON.stringify(a25Self)}`);
  } else {
    details.push("A25 author+reviewer → REVIEWER_CANNOT_AUTHOR_SAME (self-approval rejected)");
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
  const honestyOk = evaluateSelfApprovalHonesty({
    proposal,
    reviewerRoleId: "A25",
  });
  if (
    !independentGate.ok ||
    !bindOk.ok ||
    !independentVerdict.ok ||
    honestyOk.code !== "INDEPENDENT_A25_OK"
  ) {
    passed = false;
    details.push(
      `Independent A25 path failed gateOk=${independentGate.ok} bindOk=${bindOk.ok} verdictOk=${independentVerdict.ok} honesty=${honestyOk.code}`,
    );
  } else {
    details.push(
      `Independent A25 path ok binding=${bindOk.binding.bindingId} reviewer=${bindOk.binding.reviewerRoleId}; honesty=INDEPENDENT_A25_OK`,
    );
  }

  // 5. Ledger fence: self-approval refuse cannot invent APPROVED ledger entry.
  let ledger = createSelfApprovalDecisionLedger();
  const ledgerHonesty = evaluateSelfApprovalHonesty({
    proposal: baseProposal({
      proposalId: "prop-ledger-self",
      selfApprovalAttempted: true,
    }),
    reviewerRoleId: "A25",
  });
  const fenced = appendSelfApprovalLedgerEntry(ledger, {
    entryId: `ledger-fence-${randomUUID().slice(0, 8)}`,
    proposalId: "prop-ledger-self",
    honesty: ledgerHonesty,
    requestedOutcome: "APPROVED",
    recordedAtIso: nowIso,
  });
  const refusedAppend = appendSelfApprovalLedgerEntry(ledger, {
    entryId: `ledger-refused-${randomUUID().slice(0, 8)}`,
    proposalId: "prop-ledger-self",
    honesty: ledgerHonesty,
    requestedOutcome: "REFUSED",
    recordedAtIso: nowIso,
  });
  if (refusedAppend.ok) ledger = refusedAppend.ledger;
  const independentAppend = appendSelfApprovalLedgerEntry(ledger, {
    entryId: `ledger-ok-${randomUUID().slice(0, 8)}`,
    proposalId: proposal.proposalId,
    honesty: honestyOk,
    requestedOutcome: "APPROVED",
    recordedAtIso: nowIso,
  });
  if (
    !fenced.ok &&
    fenced.code === "SELF_APPROVAL_LEDGER_FENCE" &&
    fenced.ledger.entries.length === 0 &&
    fenced.externalEffects === "NONE" &&
    refusedAppend.ok &&
    refusedAppend.entry.outcome === "REFUSED" &&
    independentAppend.ok &&
    independentAppend.entry.outcome === "APPROVED"
  ) {
    details.push(
      "Ledger fence: SELF_APPROVAL_LEDGER_FENCE blocks APPROVED invent; REFUSED recorded; independent A25 APPROVED ok (distinct from T-US-035/T-F18)",
    );
  } else {
    passed = false;
    details.push(
      `Ledger fence unexpected fenced=${JSON.stringify(fenced)} refused=${JSON.stringify(refusedAppend)} independent=${JSON.stringify(independentAppend)}`,
    );
  }

  // 6. Stale ledger upgrade fence: REFUSED for proposalId cannot upgrade to APPROVED.
  let staleLedger = createSelfApprovalDecisionLedger();
  const staleHonesty = evaluateSelfApprovalHonesty({
    proposal: baseProposal({
      proposalId: "prop-stale-upgrade",
      selfApprovalAttempted: true,
    }),
    reviewerRoleId: "A25",
  });
  const staleRefused = appendSelfApprovalLedgerEntry(staleLedger, {
    entryId: `stale-refused-${randomUUID().slice(0, 8)}`,
    proposalId: "prop-stale-upgrade",
    honesty: staleHonesty,
    requestedOutcome: "REFUSED",
    recordedAtIso: nowIso,
  });
  if (staleRefused.ok) staleLedger = staleRefused.ledger;
  const staleUpgrade = appendSelfApprovalLedgerEntry(staleLedger, {
    entryId: `stale-upgrade-${randomUUID().slice(0, 8)}`,
    proposalId: "prop-stale-upgrade",
    honesty: evaluateSelfApprovalHonesty({
      proposal: baseProposal({ proposalId: "prop-stale-upgrade" }),
      reviewerRoleId: "A25",
    }),
    requestedOutcome: "APPROVED",
    recordedAtIso: nowIso,
  });
  if (
    staleRefused.ok &&
    !staleUpgrade.ok &&
    staleUpgrade.code === "SELF_APPROVAL_LEDGER_STALE_UPGRADE" &&
    staleUpgrade.ledger.entries.length === 1 &&
    staleUpgrade.ledger.entries[0]?.outcome === "REFUSED" &&
    staleUpgrade.externalEffects === "NONE"
  ) {
    details.push(
      "Stale ledger upgrade fence: SELF_APPROVAL_LEDGER_STALE_UPGRADE blocks REFUSED→APPROVED for same proposalId (distinct from T-US-036/T-X019)",
    );
  } else {
    passed = false;
    details.push(
      `Stale upgrade unexpected refused=${JSON.stringify(staleRefused)} upgrade=${JSON.stringify(staleUpgrade)}`,
    );
  }

  // 7. Idempotent duplicate REFUSED: second REFUSED for same proposalId reuses entry.
  let dupLedger = createSelfApprovalDecisionLedger();
  const dupHonesty = evaluateSelfApprovalHonesty({
    proposal: baseProposal({
      proposalId: "prop-dup-refused",
      selfApprovalAttempted: true,
    }),
    reviewerRoleId: "A25",
  });
  const dupFirst = appendSelfApprovalLedgerEntry(dupLedger, {
    entryId: `dup-1-${randomUUID().slice(0, 8)}`,
    proposalId: "prop-dup-refused",
    honesty: dupHonesty,
    requestedOutcome: "REFUSED",
    recordedAtIso: nowIso,
  });
  if (dupFirst.ok) dupLedger = dupFirst.ledger;
  const dupSecond = appendSelfApprovalLedgerEntry(dupLedger, {
    entryId: `dup-2-${randomUUID().slice(0, 8)}`,
    proposalId: "prop-dup-refused",
    honesty: dupHonesty,
    requestedOutcome: "REFUSED",
    recordedAtIso: nowIso,
  });
  if (
    dupFirst.ok &&
    dupSecond.ok &&
    dupSecond.idempotent === true &&
    dupSecond.entry.entryId === dupFirst.entry.entryId &&
    dupSecond.ledger.entries.length === 1 &&
    dupSecond.ledger.externalEffects === "NONE" &&
    dupSecond.ledger.liveReviewWiring === "NOT_WIRED"
  ) {
    details.push(
      "Idempotent duplicate REFUSED: second append reuses existing entry (no invented SUCCESS / no double-write; distinct from T-US-036/T-X019)",
    );
  } else {
    passed = false;
    details.push(
      `Idempotent duplicate unexpected first=${JSON.stringify(dupFirst)} second=${JSON.stringify(dupSecond)}`,
    );
  }

  details.push(
    "liveReviewWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
  );

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
