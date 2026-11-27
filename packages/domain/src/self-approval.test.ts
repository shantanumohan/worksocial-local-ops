import { describe, expect, it } from "vitest";
import {
  SELF_APPROVAL_RELATED_CASE_IDS,
  appendSelfApprovalLedgerEntry,
  assertSelfApprovalRefusedAcrossSurfaces,
  createSelfApprovalDecisionLedger,
  evaluateSelfApprovalHonesty,
  evaluateSelfApprovalCredentialBindingFailClosed,
  isAuthorActingAsReviewer,
} from "./self-approval.js";
import type { EffectProposal } from "./role-runtime.js";

const now = "2026-11-24T22:00:00.000Z";

function baseProposal(
  overrides: Partial<EffectProposal> = {},
): EffectProposal {
  return {
    proposalId: "prop-self-test",
    authorRoleId: "A13",
    actionClass: "create",
    operation: "stage_artifact",
    assetId: "page-training",
    channelId: "local-artifact",
    payloadDigest: "digest-1",
    evidenceArtifactIds: ["fact-capacity"],
    ...overrides,
  };
}

describe("self-approval honesty (T-X018 / T-US-054)", () => {
  it("refuses explicit selfApprovalAttempted with honesty fields", () => {
    const d = evaluateSelfApprovalHonesty({
      proposal: baseProposal({ selfApprovalAttempted: true }),
      reviewerRoleId: "A25",
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("SELF_APPROVAL_FORBIDDEN");
    expect(d.selfApprovalRejected).toBe(true);
    expect(d.independentReviewRequired).toBe(true);
    expect(d.liveReviewWiring).toBe("NOT_WIRED");
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.externalEffects).toBe("NONE");
  });

  it("accepts independent A25 path", () => {
    const d = evaluateSelfApprovalHonesty({
      proposal: baseProposal(),
      reviewerRoleId: "A25",
    });
    expect(d.code).toBe("INDEPENDENT_A25_OK");
    expect(d.selfApprovalRejected).toBe(false);
    expect(d.externalEffects).toBe("NONE");
    expect(d.liveReviewWiring).toBe("NOT_WIRED");
  });

  it("refuses author-as-reviewer and A25 self-review", () => {
    expect(
      isAuthorActingAsReviewer({ authorRoleId: "A13", reviewerRoleId: "A13" }),
    ).toBe(true);
    expect(
      isAuthorActingAsReviewer({ authorRoleId: "A13", reviewerRoleId: "A25" }),
    ).toBe(false);

    const same = evaluateSelfApprovalHonesty({
      proposal: baseProposal(),
      reviewerRoleId: "A13",
    });
    expect(same.selfApprovalRejected).toBe(true);
    expect(same.code).toBe("REVIEWER_CANNOT_AUTHOR_SAME");

    const a25Self = evaluateSelfApprovalHonesty({
      proposal: baseProposal({ authorRoleId: "A25", proposalId: "prop-a25" }),
      reviewerRoleId: "A25",
    });
    expect(a25Self.code).toBe("REVIEWER_CANNOT_AUTHOR_SAME");
    expect(a25Self.selfApprovalRejected).toBe(true);
  });

  it("refuses self-approval across gate, binding, proposeEffect, and verdict", () => {
    const surfaces = assertSelfApprovalRefusedAcrossSurfaces({
      proposal: baseProposal({ selfApprovalAttempted: true }),
      nowIso: now,
      authorAsReviewerVerdict: {
        verdictId: "v-self",
        approved: true,
        reason: "author self-approve",
        decidedAtIso: now,
        reviewerRoleId: "A13",
      },
    });
    expect(surfaces.gateRejected).toBe(true);
    expect(surfaces.bindingRejected).toBe(true);
    expect(surfaces.proposeRejected).toBe(true);
    expect(surfaces.verdictRejected).toBe(true);
    expect(surfaces.liveReviewWiring).toBe("NOT_WIRED");
    expect(surfaces.externalEffects).toBe("NONE");
  });

  it("surfaces AUTHOR_UNKNOWN for unregistered authorRoleId", () => {
    const d = evaluateSelfApprovalHonesty({
      proposal: baseProposal({
        // Runtime-only unknown author (JS callers); cast for the type hole.
        authorRoleId: "A99" as EffectProposal["authorRoleId"],
      }),
      reviewerRoleId: "A25",
    });
    expect(d.code).toBe("AUTHOR_UNKNOWN");
    expect(d.selfApprovalRejected).toBe(false);
    expect(d.liveReviewWiring).toBe("NOT_WIRED");
  });

  it("maps only T-X018 and T-US-054", () => {
    expect([...SELF_APPROVAL_RELATED_CASE_IDS]).toEqual(["T-X018", "T-US-054"]);
  });

  it("ledger fence refuses APPROVED append for self-approval reject", () => {
    const honesty = evaluateSelfApprovalHonesty({
      proposal: baseProposal({ selfApprovalAttempted: true }),
      reviewerRoleId: "A25",
    });
    expect(honesty.selfApprovalRejected).toBe(true);
    let ledger = createSelfApprovalDecisionLedger();

    const fenced = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-approved-forbid",
      proposalId: "prop-self-test",
      honesty,
      requestedOutcome: "APPROVED",
      recordedAtIso: now,
    });
    expect(fenced.ok).toBe(false);
    if (fenced.ok) throw new Error("expected ledger fence");
    expect(fenced.code).toBe("SELF_APPROVAL_LEDGER_FENCE");
    expect(fenced.ledger.entries).toHaveLength(0);
    expect(fenced.liveReviewWiring).toBe("NOT_WIRED");
    expect(fenced.externalEffects).toBe("NONE");

    const refused = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-refused",
      proposalId: "prop-self-test",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(refused.ok).toBe(true);
    if (!refused.ok) throw new Error("expected REFUSED append");
    expect(refused.entry.outcome).toBe("REFUSED");
    expect(refused.ledger.entries).toHaveLength(1);
    ledger = refused.ledger;

    const independent = evaluateSelfApprovalHonesty({
      proposal: baseProposal({ proposalId: "prop-ok" }),
      reviewerRoleId: "A25",
    });
    const approved = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-approved-ok",
      proposalId: "prop-ok",
      honesty: independent,
      requestedOutcome: "APPROVED",
      recordedAtIso: now,
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error("expected independent APPROVED");
    expect(approved.entry.outcome).toBe("APPROVED");
    expect(approved.ledger.entries).toHaveLength(2);
    expect(approved.ledger.externalEffects).toBe("NONE");
  });

  it("stale ledger upgrade fence blocks REFUSED→APPROVED for same proposalId", () => {
    const refusedHonesty = evaluateSelfApprovalHonesty({
      proposal: baseProposal({
        proposalId: "prop-stale",
        selfApprovalAttempted: true,
      }),
      reviewerRoleId: "A25",
    });
    let ledger = createSelfApprovalDecisionLedger();
    const refused = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-refused-stale",
      proposalId: "prop-stale",
      honesty: refusedHonesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(refused.ok).toBe(true);
    if (!refused.ok) throw new Error("expected REFUSED");
    ledger = refused.ledger;

    // Even with independent A25 honesty, same proposalId cannot upgrade.
    const independent = evaluateSelfApprovalHonesty({
      proposal: baseProposal({ proposalId: "prop-stale" }),
      reviewerRoleId: "A25",
    });
    expect(independent.code).toBe("INDEPENDENT_A25_OK");
    const stale = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-stale-upgrade",
      proposalId: "prop-stale",
      honesty: independent,
      requestedOutcome: "APPROVED",
      recordedAtIso: now,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error("expected stale upgrade fence");
    expect(stale.code).toBe("SELF_APPROVAL_LEDGER_STALE_UPGRADE");
    expect(stale.ledger.entries).toHaveLength(1);
    expect(stale.ledger.entries[0]?.outcome).toBe("REFUSED");
    expect(stale.liveReviewWiring).toBe("NOT_WIRED");
    expect(stale.externalEffects).toBe("NONE");

    // Fresh proposalId still may APPROVED.
    const fresh = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-fresh-ok",
      proposalId: "prop-fresh",
      honesty: evaluateSelfApprovalHonesty({
        proposal: baseProposal({ proposalId: "prop-fresh" }),
        reviewerRoleId: "A25",
      }),
      requestedOutcome: "APPROVED",
      recordedAtIso: now,
    });
    expect(fresh.ok).toBe(true);
    if (!fresh.ok) throw new Error("expected fresh APPROVED");
    expect(fresh.entry.outcome).toBe("APPROVED");
  });

  it("idempotent duplicate REFUSED reuses existing entry (no double-write)", () => {
    const honesty = evaluateSelfApprovalHonesty({
      proposal: baseProposal({
        proposalId: "prop-dup",
        selfApprovalAttempted: true,
      }),
      reviewerRoleId: "A25",
    });
    let ledger = createSelfApprovalDecisionLedger();
    const first = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-dup-1",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("expected first REFUSED");
    expect(first.idempotent).toBeUndefined();
    ledger = first.ledger;

    const second = appendSelfApprovalLedgerEntry(ledger, {
      entryId: "e-dup-2",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("expected idempotent REFUSED");
    expect(second.idempotent).toBe(true);
    expect(second.entry.entryId).toBe("e-dup-1");
    expect(second.ledger.entries).toHaveLength(1);
    expect(second.ledger.entries[0]?.outcome).toBe("REFUSED");
    expect(second.ledger.liveReviewWiring).toBe("NOT_WIRED");
    expect(second.ledger.externalEffects).toBe("NONE");

    const third = appendSelfApprovalLedgerEntry(second.ledger, {
      entryId: "e-dup-3",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(third.ok).toBe(true);
    if (!third.ok) throw new Error("expected third idempotent REFUSED");
    expect(third.idempotent).toBe(true);
    expect(third.ledger.entries).toHaveLength(1);

    const fourth = appendSelfApprovalLedgerEntry(third.ledger, {
      entryId: "e-dup-4",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(fourth.ok).toBe(true);
    if (!fourth.ok) throw new Error("expected fourth idempotent REFUSED");
    expect(fourth.idempotent).toBe(true);
    expect(fourth.ledger.entries).toHaveLength(1);
    expect(fourth.ledger.externalEffects).toBe("NONE");

    const fifth = appendSelfApprovalLedgerEntry(fourth.ledger, {
      entryId: "e-dup-5",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(fifth.ok).toBe(true);
    if (!fifth.ok) throw new Error("expected fifth idempotent REFUSED");
    expect(fifth.idempotent).toBe(true);
    expect(fifth.entry.outcome).toBe("REFUSED");
    expect(fifth.ledger.entries).toHaveLength(1);

    const sixth = appendSelfApprovalLedgerEntry(fifth.ledger, {
      entryId: "e-dup-6",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(sixth.ok).toBe(true);
    if (!sixth.ok) throw new Error("expected sixth idempotent REFUSED");
    expect(sixth.idempotent).toBe(true);
    expect(sixth.ledger.entries).toHaveLength(1);

    const seventh = appendSelfApprovalLedgerEntry(sixth.ledger, {
      entryId: "e-dup-7",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(seventh.ok).toBe(true);
    if (!seventh.ok) throw new Error("expected seventh idempotent REFUSED");
    expect(seventh.idempotent).toBe(true);
    expect(seventh.ledger.entries).toHaveLength(1);

    const eighth = appendSelfApprovalLedgerEntry(seventh.ledger, {
      entryId: "e-dup-8",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(eighth.ok).toBe(true);
    if (!eighth.ok) throw new Error("expected eighth idempotent REFUSED");
    expect(eighth.idempotent).toBe(true);
    expect(eighth.ledger.entries).toHaveLength(1);

    const ninth = appendSelfApprovalLedgerEntry(eighth.ledger, {
      entryId: "e-dup-9",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(ninth.ok).toBe(true);
    if (!ninth.ok) throw new Error("expected ninth idempotent REFUSED");
    expect(ninth.idempotent).toBe(true);
    expect(ninth.ledger.entries).toHaveLength(1);

    const tenth = appendSelfApprovalLedgerEntry(ninth.ledger, {
      entryId: "e-dup-10",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(tenth.ok).toBe(true);
    if (!tenth.ok) throw new Error("expected tenth idempotent REFUSED");
    expect(tenth.idempotent).toBe(true);
    expect(tenth.ledger.entries).toHaveLength(1);

    const eleventh = appendSelfApprovalLedgerEntry(tenth.ledger, {
      entryId: "e-dup-11",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(eleventh.ok).toBe(true);
    if (!eleventh.ok) throw new Error("expected eleventh idempotent REFUSED");
    expect(eleventh.idempotent).toBe(true);
    expect(eleventh.ledger.entries).toHaveLength(1);

    const twelfth = appendSelfApprovalLedgerEntry(eleventh.ledger, {
      entryId: "e-dup-12",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(twelfth.ok).toBe(true);
    if (!twelfth.ok) throw new Error("expected twelfth idempotent REFUSED");
    expect(twelfth.idempotent).toBe(true);
    expect(twelfth.ledger.entries).toHaveLength(1);

    const thirteenth = appendSelfApprovalLedgerEntry(twelfth.ledger, {
      entryId: "e-dup-13",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(thirteenth.ok).toBe(true);
    if (!thirteenth.ok) throw new Error("expected thirteenth idempotent REFUSED");
    expect(thirteenth.idempotent).toBe(true);
    expect(thirteenth.ledger.entries).toHaveLength(1);

    const fourteenth = appendSelfApprovalLedgerEntry(thirteenth.ledger, {
      entryId: "e-dup-14",
      proposalId: "prop-dup",
      honesty,
      requestedOutcome: "REFUSED",
      recordedAtIso: now,
    });
    expect(fourteenth.ok).toBe(true);
    if (!fourteenth.ok) throw new Error("expected fourteenth idempotent REFUSED");
    expect(fourteenth.idempotent).toBe(true);
    expect(fourteenth.ledger.entries).toHaveLength(1);
    expect(fourteenth.ledger.externalEffects).toBe("NONE");
  });

  it("I47 credential binding fail-closed on independent A25 path", () => {
    const missing = evaluateSelfApprovalHonesty({
      proposal: baseProposal(),
      reviewerRoleId: "A25",
      enforceCredentialBindingFailClosed: true,
    });
    expect(missing.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");
    expect(missing.selfApprovalRejected).toBe(false);
    expect(missing.externalEffects).toBe("NONE");

    const raw = evaluateSelfApprovalHonesty({
      proposal: baseProposal(),
      reviewerRoleId: "A25",
      reviewerCredentialRef: "AIza-not-broker",
    });
    expect(raw.code).toBe("SELF_APPROVAL_CREDENTIAL_RAW_REF_FORBIDDEN");

    const ok = evaluateSelfApprovalHonesty({
      proposal: baseProposal(),
      reviewerRoleId: "A25",
      reviewerCredentialRef: "broker:a25-review:fixture-ref-1",
    });
    expect(ok.code).toBe("INDEPENDENT_A25_OK");
  });

  it("wipe15 I48: nullish aliases and padded raw secret (T-X018)", () => {
    const nullAlias = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: " null ",
    });
    expect(nullAlias.ok).toBe(false);
    expect(nullAlias.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const brokerOnly = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:",
    });
    expect(brokerOnly.ok).toBe(false);
    expect(brokerOnly.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const paddedRaw = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "  sk-padded-raw  ",
    });
    expect(paddedRaw.ok).toBe(false);
    expect(paddedRaw.code).toBe("SELF_APPROVAL_CREDENTIAL_RAW_REF_FORBIDDEN");

    const paddedOk = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "  broker:a25-review:fixture-ref-2  ",
    });
    expect(paddedOk.ok).toBe(true);
    expect(paddedOk.externalEffects).toBe("NONE");
  });

  it("wipe15 I49: non-broker path and boolean-ish aliases (T-X018)", () => {
    const vaultPath = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "vault:a25-review:fixture",
    });
    expect(vaultPath.ok).toBe(false);
    expect(vaultPath.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const falseAlias = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: " NO ",
    });
    expect(falseAlias.ok).toBe(false);
    expect(falseAlias.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const brokerOk = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-3",
    });
    expect(brokerOk.ok).toBe(true);
  });

  it("wipe15 I50: unsafe broker body and case-fold prefix (T-X018)", () => {
    const traversal = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25:../escape",
    });
    expect(traversal.ok).toBe(false);
    expect(traversal.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const upper = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "BROKER:a25-review:fixture-ref-4",
    });
    expect(upper.ok).toBe(true);
    expect(upper.externalEffects).toBe("NONE");
  });

  it("wipe15 I51: smuggled broker body and skip bypass (T-X018)", () => {
    const nested = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:broker:double-prefix",
    });
    expect(nested.ok).toBe(false);
    expect(nested.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const urlSmuggle = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:https://not-allowed",
    });
    expect(urlSmuggle.ok).toBe(false);

    const skip = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-5",
      skipCredentialBindingCheck: true,
    });
    expect(skip.ok).toBe(false);
    expect(skip.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I52: control chars in broker body (T-X018)", () => {
    const ctrl = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:\nfixture",
    });
    expect(ctrl.ok).toBe(false);
    expect(ctrl.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const honestySkip = evaluateSelfApprovalHonesty({
      proposal: baseProposal(),
      reviewerRoleId: "A25",
      reviewerCredentialRef: "broker:a25-review:fixture-ref-6",
      skipCredentialBindingCheck: true,
    });
    expect(honestySkip.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I53: placeholder broker body and allowEmpty bypass (T-X018)", () => {
    const placeholder = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:...---",
    });
    expect(placeholder.ok).toBe(false);
    expect(placeholder.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const allowEmpty = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-7",
      allowEmptyCredentialBinding: true,
    });
    expect(allowEmpty.ok).toBe(false);
    expect(allowEmpty.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");

    const digitsOnly = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:00042",
    });
    expect(digitsOnly.ok).toBe(false);
    expect(digitsOnly.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");
  });

  it("wipe15 I55: invisible Unicode and optional bypass (T-X018)", () => {
    const zwsp = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25\u200b-review:fixture",
    });
    expect(zwsp.ok).toBe(false);
    expect(zwsp.code).toBe("SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED");

    const optional = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-8",
      treatCredentialBindingAsOptional: true,
    });
    expect(optional.ok).toBe(false);
    expect(optional.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I56: weak broker body and waive bypass (T-X018)", () => {
    const atSign = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:reviewer@fixture",
    });
    expect(atSign.ok).toBe(false);

    const short = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:ab",
    });
    expect(short.ok).toBe(false);

    const waive = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-9",
      waiveCredentialBinding: true,
    });
    expect(waive.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I57: shell injection broker body post-#274 (T-X018)", () => {
    const shell = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-$(inject)",
    });
    expect(shell.ok).toBe(false);

    const ignore = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-10",
      ignoreCredentialBinding: true,
    });
    expect(ignore.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I58: pipe/chain broker body post-#275 (T-X018)", () => {
    const pipe = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25|cat /etc/passwd",
    });
    expect(pipe.ok).toBe(false);

    const disable = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-11",
      disableCredentialBinding: true,
    });
    expect(disable.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I59: redirect broker body post-#277 (T-X018)", () => {
    const redirect = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25>/tmp/leak",
    });
    expect(redirect.ok).toBe(false);

    const omit = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-12",
      omitCredentialBinding: true,
    });
    expect(omit.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I60 TIMER ON_TIP: ampersand broker; deferred bypass (T-X018)", () => {
    const amp = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25&background",
    });
    expect(amp.ok).toBe(false);

    const deferred = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-13",
      deferredCredentialBinding: true,
    });
    expect(deferred.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });

  it("wipe15 I61: glob broker post-#278 (T-X018)", () => {
    const glob = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25*",
    });
    expect(glob.ok).toBe(false);

    const relax = evaluateSelfApprovalCredentialBindingFailClosed({
      reviewerCredentialRef: "broker:a25-review:fixture-ref-14",
      relaxCredentialBinding: true,
    });
    expect(relax.code).toBe("SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN");
  });
});
