/**
 * Fixture proof for T-X018 / T-US-054 — self-approval rejected; independent A25 required.
 *
 * Exercises review-gate + review-binding + verdict acceptance so ordinary
 * self-approval cannot bind or approve. External effects: NONE.
 * Never invents live VERIFIED. Avoids credential rebind (#43) lane.
 *
 * Hillclimb: evaluateSelfApprovalHonesty + cross-surface refuse + A25
 * self-review + decision-ledger fence + stale REFUSED→APPROVED upgrade fence +
 * idempotent duplicate REFUSED append; I47 credential binding fail-closed.
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
  evaluateSelfApprovalCredentialBindingFailClosed,
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

  // 8. I47 — credential binding fail-closed on independent A25 path.
  const credMissing = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: null,
  });
  const credRaw = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "sk-raw-not-broker",
  });
  const credBypass = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-1",
    bypassCredentialBindingFailClosed: true,
  });
  const credOk = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-1",
  });
  const honestyCredEnforced = evaluateSelfApprovalHonesty({
    proposal: baseProposal({ proposalId: "prop-cred-enforce" }),
    reviewerRoleId: "A25",
    enforceCredentialBindingFailClosed: true,
    reviewerCredentialRef: "broker:a25-review:fixture-ref-1",
  });
  if (
    !credMissing.ok &&
    credMissing.code === "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED" &&
    !credRaw.ok &&
    credRaw.code === "SELF_APPROVAL_CREDENTIAL_RAW_REF_FORBIDDEN" &&
    !credBypass.ok &&
    credBypass.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN" &&
    credOk.ok &&
    honestyCredEnforced.code === "INDEPENDENT_A25_OK" &&
    honestyCredEnforced.externalEffects === "NONE"
  ) {
    details.push(
      "I47 credential binding fail-closed: empty/raw/bypass refused; broker ref ok with enforceCredentialBindingFailClosed (distinct from #43 rebind lane)",
    );
  } else {
    passed = false;
    details.push(
      `I47 credential binding unexpected missing=${JSON.stringify(credMissing)} raw=${JSON.stringify(credRaw)} bypass=${JSON.stringify(credBypass)} ok=${JSON.stringify(credOk)} honesty=${JSON.stringify(honestyCredEnforced)}`,
    );
  }

  // 9. wipe15 I48 — nullish aliases, incomplete broker:, padded raw/ok.
  const i48Null = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: " undefined ",
  });
  const i48BrokerOnly = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:  ",
  });
  const i48PaddedRaw = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "  AIza-padded  ",
  });
  const i48PaddedOk = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "  broker:a25-review:fixture-ref-2  ",
  });
  if (
    !i48Null.ok &&
    i48Null.code === "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED" &&
    !i48BrokerOnly.ok &&
    !i48PaddedRaw.ok &&
    i48PaddedRaw.code === "SELF_APPROVAL_CREDENTIAL_RAW_REF_FORBIDDEN" &&
    i48PaddedOk.ok
  ) {
    details.push(
      "wipe15 I48 credential retrain: nullish/incomplete broker refused; padded raw forbidden; trimmed broker ok",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I48 unexpected null=${JSON.stringify(i48Null)} brokerOnly=${JSON.stringify(i48BrokerOnly)} paddedRaw=${JSON.stringify(i48PaddedRaw)} paddedOk=${JSON.stringify(i48PaddedOk)}`,
    );
  }

  // 10. wipe15 I49 — non-broker prefix and boolean-ish aliases.
  const i49Vault = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "credential-broker:ref-only",
  });
  const i49NoAlias = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: " off ",
  });
  const i49Broker = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-3",
  });
  if (
    !i49Vault.ok &&
    i49Vault.code === "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED" &&
    !i49NoAlias.ok &&
    i49Broker.ok
  ) {
    details.push(
      "wipe15 I49 credential train: non-broker: path refused; OFF alias fail-closed; broker: ok (distinct from T-X029 #43 rebind)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I49 unexpected vault=${JSON.stringify(i49Vault)} off=${JSON.stringify(i49NoAlias)} broker=${JSON.stringify(i49Broker)}`,
    );
  }

  // 11. wipe15 I50 — unsafe broker body + case-fold BROKER: ok.
  const i50Traverse = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:ref/../other",
  });
  const i50Upper = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "BROKER:a25-review:fixture-ref-4",
  });
  if (
    !i50Traverse.ok &&
    i50Traverse.code === "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED" &&
    i50Upper.ok
  ) {
    details.push(
      "wipe15 I50 credential train: traversal broker body refused; BROKER: case-fold ok (distinct from T-X030 #266 rate-limit)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I50 unexpected traverse=${JSON.stringify(i50Traverse)} upper=${JSON.stringify(i50Upper)}`,
    );
  }

  // 12. wipe15 I51 — smuggled broker body + skipCredentialBindingCheck refused.
  const i51Nested = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:broker:nested",
  });
  const i51Skip = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-5",
    skipCredentialBindingCheck: true,
  });
  const i51Ok = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-5",
  });
  if (
    !i51Nested.ok &&
    !i51Skip.ok &&
    i51Skip.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN" &&
    i51Ok.ok
  ) {
    details.push(
      "wipe15 I51 credential train: nested/URL broker smuggle refused; skipCredentialBindingCheck forbidden (distinct from T-X039 #268 denominators)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I51 unexpected nested=${JSON.stringify(i51Nested)} skip=${JSON.stringify(i51Skip)} ok=${JSON.stringify(i51Ok)}`,
    );
  }

  // 13. wipe15 I52 — control chars in broker body; honesty skip path.
  const i52Ctrl = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25:\ninj",
  });
  const i52Honesty = evaluateSelfApprovalHonesty({
    proposal: baseProposal({ proposalId: "prop-i52-honesty" }),
    reviewerRoleId: "A25",
    reviewerCredentialRef: "broker:a25-review:fixture-ref-6",
    skipCredentialBindingCheck: true,
  });
  if (
    !i52Ctrl.ok &&
    i52Ctrl.code === "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED" &&
    i52Honesty.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I52 credential train: control chars refused; honesty skipCredentialBindingCheck forbidden (distinct from T-X011 #269 output bomb)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I52 unexpected ctrl=${JSON.stringify(i52Ctrl)} honesty=${JSON.stringify(i52Honesty)}`,
    );
  }

  // 14. wipe15 I53 — placeholder broker body; allowEmpty bypass refused; I54 digits-only on tip-moved-272.
  const i54Digits = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:999",
  });
  if (!i54Digits.ok && i54Digits.code === "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED") {
    details.push(
      "wipe15 I54 post-#272: digits-only broker body refused (distinct from T-X040 #272)",
    );
  } else {
    passed = false;
    details.push(`wipe15 I54 unexpected digits=${JSON.stringify(i54Digits)}`);
  }

  // 14b. wipe15 I53 — placeholder broker body; allowEmpty bypass refused.
  const i53Placeholder = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:___...",
  });
  const i53AllowEmpty = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-7",
    allowEmptyCredentialBinding: true,
  });
  const i53Ok = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-7",
  });
  if (
    !i53Placeholder.ok &&
    !i53AllowEmpty.ok &&
    i53AllowEmpty.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN" &&
    i53Ok.ok
  ) {
    details.push(
      "wipe15 I53 credential train: placeholder broker body refused; allowEmptyCredentialBinding forbidden (distinct from T-X040 #272 exclusive)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I53 unexpected placeholder=${JSON.stringify(i53Placeholder)} allowEmpty=${JSON.stringify(i53AllowEmpty)} ok=${JSON.stringify(i53Ok)}`,
    );
  }

  // 15. wipe15 I55 post-#273 — invisible Unicode; treatCredentialBindingAsOptional refused.
  const i55Zwsp = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25\u200b:fixture",
  });
  const i55Optional = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-8",
    treatCredentialBindingAsOptional: true,
  });
  if (
    !i55Zwsp.ok &&
    !i55Optional.ok &&
    i55Optional.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I55 post-#273: invisible Unicode refused; treatCredentialBindingAsOptional forbidden (distinct from T-X033 #273)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I55 unexpected zwsp=${JSON.stringify(i55Zwsp)} optional=${JSON.stringify(i55Optional)}`,
    );
  }

  // 16. wipe15 I56 — weak broker body; waiveCredentialBinding refused.
  const i56At = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25@fixture",
  });
  const i56Waive = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-9",
    waiveCredentialBinding: true,
  });
  if (
    !i56At.ok &&
    !i56Waive.ok &&
    i56Waive.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I56 TIMER: @ / short broker refused; waiveCredentialBinding forbidden (exclusive #274 T-X042 not Slot I)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I56 unexpected at=${JSON.stringify(i56At)} waive=${JSON.stringify(i56Waive)}`,
    );
  }

  // 17. wipe15 I57 post-#274 — shell injection; ignoreCredentialBinding refused.
  const i57Shell = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25;rm -rf",
  });
  const i57Ignore = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-10",
    ignoreCredentialBinding: true,
  });
  if (
    !i57Shell.ok &&
    !i57Ignore.ok &&
    i57Ignore.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I57 tip-moved-274: shell-metachar broker refused; ignoreCredentialBinding forbidden (distinct from T-X042 #274)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I57 unexpected shell=${JSON.stringify(i57Shell)} ignore=${JSON.stringify(i57Ignore)}`,
    );
  }

  // 18. wipe15 I58 post-#275 — pipe broker; disableCredentialBinding refused.
  const i58Pipe = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25&&true",
  });
  const i58Disable = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-11",
    disableCredentialBinding: true,
  });
  if (
    !i58Pipe.ok &&
    !i58Disable.ok &&
    i58Disable.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I58 tip-moved-275: pipe/chain broker refused; disableCredentialBinding forbidden (distinct from #275)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I58 unexpected pipe=${JSON.stringify(i58Pipe)} disable=${JSON.stringify(i58Disable)}`,
    );
  }

  // 19. wipe15 I59 post-#277 — redirect broker; omitCredentialBinding refused.
  const i59Redirect = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25</dev/null",
  });
  const i59Omit = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-12",
    omitCredentialBinding: true,
  });
  if (
    !i59Redirect.ok &&
    !i59Omit.ok &&
    i59Omit.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I59 tip-moved-277: redirect broker refused; omitCredentialBinding forbidden (distinct from #277 T-X012)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I59 unexpected redirect=${JSON.stringify(i59Redirect)} omit=${JSON.stringify(i59Omit)}`,
    );
  }

  // 20. wipe15 I60 TIMER ON_TIP 64e25ce8 — & broker; deferredCredentialBinding refused.
  const i60Amp = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25&disown",
  });
  const i60Deferred = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-13",
    deferredCredentialBinding: true,
  });
  if (
    !i60Amp.ok &&
    !i60Deferred.ok &&
    i60Deferred.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I60 TIMER ON_TIP: ampersand broker refused; deferredCredentialBinding forbidden (exclusive #278 not Slot I)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I60 unexpected amp=${JSON.stringify(i60Amp)} deferred=${JSON.stringify(i60Deferred)}`,
    );
  }

  // 21. wipe15 I61 post-#278 — glob broker; relaxCredentialBinding refused.
  const i61Glob = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25*wildcard",
  });
  const i61Relax = evaluateSelfApprovalCredentialBindingFailClosed({
    reviewerCredentialRef: "broker:a25-review:fixture-ref-14",
    relaxCredentialBinding: true,
  });
  if (
    !i61Glob.ok &&
    !i61Relax.ok &&
    i61Relax.code === "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  ) {
    details.push(
      "wipe15 I61 tip-moved-278: glob/wildcard broker refused; relaxCredentialBinding forbidden (distinct from #278 T-X013)",
    );
  } else {
    passed = false;
    details.push(
      `wipe15 I61 unexpected glob=${JSON.stringify(i61Glob)} relax=${JSON.stringify(i61Relax)}`,
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
