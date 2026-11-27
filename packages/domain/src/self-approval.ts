/**
 * T-X018 / T-US-054 — Self-approval rejected; independent A25 required.
 *
 * Ordinary self-approval cannot bind or approve. Author ≠ reviewer.
 * A25 cannot review its own authorship. Decision-ledger fence refuses
 * appending APPROVED entries for self-approval refuses; stale ledger
 * upgrade fence refuses REFUSED→APPROVED for the same proposalId (no
 * invented SUCCESS; distinct from T-US-036/T-X019 and T-US-035/T-F18).
 * Live review wiring stays NOT_WIRED. External effects: NONE.
 * I47: independent A25 credential binding fail-closed (broker ref required).
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

import type { AgentRoleId } from "./agent-roles.js";
import { createReviewBinding } from "./review-binding.js";
import {
  acceptReviewVerdict,
  evaluateIndependentReviewGate,
  proposeEffect,
  type EffectProposal,
  type ReviewVerdict,
} from "./role-runtime.js";

export type SelfApprovalDecisionCode =
  | "SELF_APPROVAL_FORBIDDEN"
  | "REVIEWER_CANNOT_AUTHOR_SAME"
  | "REVIEWER_UNAUTHORIZED"
  | "AUTHOR_UNKNOWN"
  | "INDEPENDENT_A25_OK"
  | "SELF_APPROVAL_LEDGER_FENCE"
  | "SELF_APPROVAL_LEDGER_STALE_UPGRADE"
  | "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED"
  | "SELF_APPROVAL_CREDENTIAL_RAW_REF_FORBIDDEN"
  | "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
  | "INVALID_INPUT"
  | null;

export type SelfApprovalLedgerOutcome = "REFUSED" | "APPROVED";

export type SelfApprovalLedgerEntry = {
  entryId: string;
  proposalId: string;
  outcome: SelfApprovalLedgerOutcome;
  decisionCode: SelfApprovalDecisionCode;
  recordedAtIso: string;
};

export type SelfApprovalDecisionLedger = {
  entries: SelfApprovalLedgerEntry[];
  liveReviewWiring: "NOT_WIRED";
  externalEffects: "NONE";
};

export type SelfApprovalHonestyDecision = {
  /** True when policy evaluation completed honestly (rejection or independent OK). */
  allowed: boolean;
  code: SelfApprovalDecisionCode;
  /** True when ordinary self-approval was refused. */
  selfApprovalRejected: boolean;
  /** Independent A25 review is always required for writer proposals. */
  independentReviewRequired: true;
  reasons: string[];
  liveReviewWiring: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

function honestyBase(): Pick<
  SelfApprovalHonestyDecision,
  | "independentReviewRequired"
  | "liveReviewWiring"
  | "liveProviderSuccessClaimed"
  | "externalEffects"
> {
  return {
    independentReviewRequired: true,
    liveReviewWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

/**
 * Classify a review attempt for T-X018 honesty: self-approval must be refused;
 * only independent A25 (author ≠ reviewer) can succeed.
 */
function rawCredentialRefForbidden(ref: string): boolean {
  const t = ref.trim();
  return t.includes("sk-") || t.includes("AIza");
}

/** Wipe15 I48 — padded / string nullish aliases are not broker bindings. */
function isLiteralNullishCredentialAlias(ref: string): boolean {
  const t = ref.trim().toLowerCase();
  return (
    t === "null" ||
    t === "undefined" ||
    t === "none" ||
    t === "nil" ||
    t === "false" ||
    t === "no" ||
    t === "off" ||
    t === "0"
  );
}

function isBrokerPrefixedCredentialRef(ref: string): boolean {
  return ref.trim().toLowerCase().startsWith("broker:");
}

function isIncompleteBrokerCredentialRef(ref: string): boolean {
  const t = ref.trim();
  if (!t.toLowerCase().startsWith("broker:")) return false;
  const body = t.slice("broker:".length).trim();
  return body.length === 0;
}

/** wipe15 I50 — refuse traversal / absolute broker bodies (fail-closed). */
function isUnsafeBrokerCredentialRef(ref: string): boolean {
  const t = ref.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith("broker:")) return false;
  const body = t.slice(t.indexOf(":") + 1).trim();
  return (
    body.includes("..") ||
    body.startsWith("/") ||
    body.startsWith("\\") ||
    body.includes("\0")
  );
}

/** wipe15 I51 — nested broker / URL-encoded / scheme smuggling in broker body. */
function hasInvisibleUnicodeInBrokerBody(ref: string): boolean {
  const t = ref.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith("broker:")) return false;
  const body = t.slice("broker:".length);
  return /[\u200b\u200c\u200d\ufeff]/.test(body);
}

function hasControlCharsInBrokerBody(ref: string): boolean {
  const t = ref.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith("broker:")) return false;
  const body = t.slice("broker:".length);
  return /[\x00-\x1f\x7f]/.test(body);
}

/** wipe15 I53 — placeholder-only broker bodies (dots/dashes/colons) refused. */
function isPlaceholderBrokerCredentialRef(ref: string): boolean {
  const t = ref.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith("broker:")) return false;
  const body = t.slice("broker:".length).trim();
  return (
    (body.length > 0 && /^[.\-_:\s]+$/.test(body)) ||
    (body.length > 0 && /^\d+$/.test(body))
  );
}

/** wipe15 I56 — @-shaped / too-short broker bodies refused. */
function hasShellInjectionInBrokerBody(ref: string): boolean {
  const t = ref.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith("broker:")) return false;
  const body = t.slice("broker:".length);
  return (
    body.includes("$(") ||
    body.includes("${") ||
    body.includes("`") ||
    body.includes(";") ||
    body.includes("|") ||
    body.includes("&&") ||
    body.includes("||") ||
    body.includes(">") ||
    body.includes("<") ||
    body.includes("&") ||
    body.includes("*")
  );
}

function isWeakBrokerCredentialRef(ref: string): boolean {
  const t = ref.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith("broker:")) return false;
  const body = t.slice("broker:".length).trim();
  return body.includes("@") || (body.length > 0 && body.length < 4);
}

function isSmuggledBrokerCredentialRef(ref: string): boolean {
  const t = ref.trim();
  const lower = t.toLowerCase();
  if (!lower.startsWith("broker:")) return false;
  const body = t.slice("broker:".length).trim().toLowerCase();
  return (
    body.startsWith("broker:") ||
    body.includes("://") ||
    body.includes("%2f") ||
    body.includes("%2e")
  );
}

/**
 * I47 — Independent A25 review credential binding is fail-closed: broker ref
 * required; raw secret shapes refused; bypass flags refused. NOT_WIRED / NONE.
 */
export function evaluateSelfApprovalCredentialBindingFailClosed(input: {
  reviewerCredentialRef?: string | null;
  bypassCredentialBindingFailClosed?: boolean;
  claimLiveCredentialVerified?: boolean;
  skipCredentialBindingCheck?: boolean;
  allowEmptyCredentialBinding?: boolean;
  treatCredentialBindingAsOptional?: boolean;
  waiveCredentialBinding?: boolean;
  ignoreCredentialBinding?: boolean;
  disableCredentialBinding?: boolean;
  omitCredentialBinding?: boolean;
  deferredCredentialBinding?: boolean;
  relaxCredentialBinding?: boolean;
}): {
  ok: boolean;
  code:
    | "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED"
    | "SELF_APPROVAL_CREDENTIAL_RAW_REF_FORBIDDEN"
    | "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN"
    | "INDEPENDENT_A25_OK";
  reasons: string[];
  liveReviewWiring: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
} {
  const trailer =
    "liveReviewWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE";
  if (
    input.bypassCredentialBindingFailClosed === true ||
    input.skipCredentialBindingCheck === true ||
    input.allowEmptyCredentialBinding === true ||
    input.treatCredentialBindingAsOptional === true ||
    input.waiveCredentialBinding === true ||
    input.ignoreCredentialBinding === true ||
    input.disableCredentialBinding === true ||
    input.omitCredentialBinding === true ||
    input.deferredCredentialBinding === true ||
    input.relaxCredentialBinding === true
  ) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN",
      reasons: [
        "credential binding bypass/skip flags forbidden (T-X018 I47/I51 fail-closed)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (input.claimLiveCredentialVerified === true) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BYPASS_FORBIDDEN",
      reasons: [
        "claimLiveCredentialVerified=true refused on fixture-only credential binding (T-X018 I47)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  const ref = input.reviewerCredentialRef;
  if (ref === undefined || ref === null || ref.trim() === "") {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef missing/empty → SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED (fail-closed)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (isLiteralNullishCredentialAlias(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef nullish string alias refused (wipe15 I48 fail-closed)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (isIncompleteBrokerCredentialRef(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef broker: prefix without body → SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED (I48)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (rawCredentialRefForbidden(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_RAW_REF_FORBIDDEN",
      reasons: [
        "reviewerCredentialRef must be broker-shaped; raw secret patterns forbidden (T-X018 I47)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (!isBrokerPrefixedCredentialRef(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef must be broker:-prefixed (non-broker path refused; wipe15 I49)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (isUnsafeBrokerCredentialRef(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef unsafe broker body (traversal/absolute) refused (wipe15 I50)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (hasInvisibleUnicodeInBrokerBody(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef invisible Unicode in broker body refused (wipe15 I55)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (hasControlCharsInBrokerBody(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef control chars in broker body refused (wipe15 I52)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (isSmuggledBrokerCredentialRef(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef smuggled broker/URL body refused (wipe15 I51)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (isPlaceholderBrokerCredentialRef(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef placeholder-only broker body refused (wipe15 I53)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (isWeakBrokerCredentialRef(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef weak broker body (@ or too-short) refused (wipe15 I56)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  if (hasShellInjectionInBrokerBody(ref)) {
    return {
      ok: false,
      code: "SELF_APPROVAL_CREDENTIAL_BINDING_REQUIRED",
      reasons: [
        "reviewerCredentialRef shell-metachar broker body refused (wipe15 I57–I60)",
        trailer,
      ],
      liveReviewWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
    };
  }
  return {
    ok: true,
    code: "INDEPENDENT_A25_OK",
    reasons: [
      "Independent A25 credential binding ok (broker ref present)",
      trailer,
    ],
    liveReviewWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

export function evaluateSelfApprovalHonesty(input: {
  proposal: EffectProposal;
  reviewerRoleId?: AgentRoleId | null;
  reviewerCredentialRef?: string | null;
  bypassCredentialBindingFailClosed?: boolean;
  claimLiveCredentialVerified?: boolean;
  /** When true, independent A25 OK requires credential binding (I47). */
  enforceCredentialBindingFailClosed?: boolean;
  skipCredentialBindingCheck?: boolean;
}): SelfApprovalHonestyDecision {
  const base = honestyBase();

  if (!input.proposal.proposalId?.trim()) {
    return {
      allowed: false,
      code: "INVALID_INPUT",
      selfApprovalRejected: false,
      reasons: ["proposalId required for T-X018 self-approval evaluation"],
      ...base,
    };
  }

  if (input.proposal.selfApprovalAttempted === true) {
    return {
      allowed: true,
      code: "SELF_APPROVAL_FORBIDDEN",
      selfApprovalRejected: true,
      reasons: [
        "selfApprovalAttempted=true → SELF_APPROVAL_FORBIDDEN (T-X018/T-US-054)",
        "liveReviewWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
      ],
      ...base,
    };
  }

  const gate =
    input.reviewerRoleId === undefined
      ? evaluateIndependentReviewGate({ proposal: input.proposal })
      : evaluateIndependentReviewGate({
          proposal: input.proposal,
          reviewerRoleId: input.reviewerRoleId,
        });

  if (!gate.ok) {
    const code: SelfApprovalDecisionCode =
      gate.code === "SELF_APPROVAL_FORBIDDEN" ||
      gate.code === "REVIEWER_CANNOT_AUTHOR_SAME" ||
      gate.code === "REVIEWER_UNAUTHORIZED" ||
      gate.code === "AUTHOR_UNKNOWN"
        ? gate.code
        : "INVALID_INPUT";
    const rejected =
      code === "SELF_APPROVAL_FORBIDDEN" ||
      code === "REVIEWER_CANNOT_AUTHOR_SAME";
    return {
      allowed: true,
      code,
      selfApprovalRejected: rejected,
      reasons: [
        `Independent review gate refused code=${gate.code}: ${gate.reason}`,
        "liveReviewWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
      ],
      ...base,
    };
  }

  if (!gate.requiresReview || gate.reviewerRoleId !== "A25") {
    return {
      allowed: true,
      code: "REVIEWER_UNAUTHORIZED",
      selfApprovalRejected: false,
      reasons: [
        `Expected independent A25; got ${
          gate.requiresReview ? gate.reviewerRoleId : "no-review"
        }`,
        "liveReviewWiring=NOT_WIRED externalEffects=NONE",
      ],
      ...base,
    };
  }

  const enforce =
    input.enforceCredentialBindingFailClosed === true ||
    input.reviewerCredentialRef !== undefined ||
    input.bypassCredentialBindingFailClosed === true ||
    input.claimLiveCredentialVerified === true ||
    input.skipCredentialBindingCheck === true;

  if (enforce) {
    const bindingInput: {
      reviewerCredentialRef?: string | null;
      bypassCredentialBindingFailClosed?: boolean;
      claimLiveCredentialVerified?: boolean;
      skipCredentialBindingCheck?: boolean;
    } = {};
    if (input.reviewerCredentialRef !== undefined) {
      bindingInput.reviewerCredentialRef = input.reviewerCredentialRef;
    }
    if (input.bypassCredentialBindingFailClosed !== undefined) {
      bindingInput.bypassCredentialBindingFailClosed =
        input.bypassCredentialBindingFailClosed;
    }
    if (input.claimLiveCredentialVerified !== undefined) {
      bindingInput.claimLiveCredentialVerified =
        input.claimLiveCredentialVerified;
    }
    if (input.skipCredentialBindingCheck !== undefined) {
      bindingInput.skipCredentialBindingCheck = input.skipCredentialBindingCheck;
    }
    const binding =
      evaluateSelfApprovalCredentialBindingFailClosed(bindingInput);
    if (!binding.ok) {
      return {
        allowed: true,
        code: binding.code,
        selfApprovalRejected: false,
        reasons: binding.reasons,
        ...base,
      };
    }
  }

  return {
    allowed: true,
    code: "INDEPENDENT_A25_OK",
    selfApprovalRejected: false,
    reasons: [
      "Independent A25 path ok — author ≠ reviewer; self-approval not attempted",
      "liveReviewWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
    ],
    ...base,
  };
}

/**
 * True when reviewerRoleId equals authorRoleId (ordinary self-approval shape).
 */
export function isAuthorActingAsReviewer(input: {
  authorRoleId: AgentRoleId;
  reviewerRoleId: AgentRoleId;
}): boolean {
  return input.authorRoleId === input.reviewerRoleId;
}

/**
 * Run the three refuse surfaces used by the soak proof: gate, binding, verdict.
 * All must refuse when selfApprovalAttempted or author===reviewer.
 */
export function assertSelfApprovalRefusedAcrossSurfaces(input: {
  proposal: EffectProposal;
  nowIso: string;
  /** Required author-as-reviewer verdict — never report omitted verdict as rejected. */
  authorAsReviewerVerdict: Omit<ReviewVerdict, "proposalId" | "authorRoleId" | "reviewerRoleId"> & {
    proposalId?: string;
    authorRoleId?: AgentRoleId;
    reviewerRoleId?: AgentRoleId;
  };
}): {
  gateRejected: boolean;
  bindingRejected: boolean;
  proposeRejected: boolean;
  verdictRejected: boolean;
  liveReviewWiring: "NOT_WIRED";
  externalEffects: "NONE";
} {
  const gate = evaluateIndependentReviewGate({
    proposal: input.proposal,
    reviewerRoleId: "A25",
  });
  const bind = createReviewBinding({
    bindingId: `bind-assert-${input.proposal.proposalId}`,
    proposal: input.proposal,
    proposalArtifactId: "art-assert",
    proposalRevision: "rev-a",
    proposalChecksum: "cc".repeat(32),
    evidencePackageDigest: "pkg:assert:1",
    createdAtIso: input.nowIso,
  });
  const proposed = proposeEffect(input.proposal);

  const verdict = acceptReviewVerdict({
    proposal: {
      ...input.proposal,
      selfApprovalAttempted: false,
    },
    verdict: {
      verdictId: input.authorAsReviewerVerdict.verdictId,
      proposalId: input.proposal.proposalId,
      reviewerRoleId: input.proposal.authorRoleId,
      authorRoleId: input.proposal.authorRoleId,
      approved: input.authorAsReviewerVerdict.approved,
      reason: input.authorAsReviewerVerdict.reason,
      decidedAtIso: input.authorAsReviewerVerdict.decidedAtIso,
    },
  });

  return {
    gateRejected: !gate.ok,
    bindingRejected: !bind.ok,
    proposeRejected: !proposed.ok,
    verdictRejected: !verdict.ok,
    liveReviewWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export function createSelfApprovalDecisionLedger(): SelfApprovalDecisionLedger {
  return {
    entries: [],
    liveReviewWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export type SelfApprovalLedgerAppendResult =
  | {
      ok: true;
      ledger: SelfApprovalDecisionLedger;
      entry: SelfApprovalLedgerEntry;
      /** True when a prior REFUSED for the same proposalId was reused (no second write). */
      idempotent?: true;
    }
  | {
      ok: false;
      code: "SELF_APPROVAL_LEDGER_FENCE" | "SELF_APPROVAL_LEDGER_STALE_UPGRADE";
      reason: string;
      ledger: SelfApprovalDecisionLedger;
      liveReviewWiring: "NOT_WIRED";
      externalEffects: "NONE";
    };

function findRefusedEntryForProposal(
  ledger: SelfApprovalDecisionLedger,
  proposalId: string,
): SelfApprovalLedgerEntry | undefined {
  return ledger.entries.find(
    (e) => e.proposalId === proposalId && e.outcome === "REFUSED",
  );
}

function hasRefusedEntryForProposal(
  ledger: SelfApprovalDecisionLedger,
  proposalId: string,
): boolean {
  return findRefusedEntryForProposal(ledger, proposalId) !== undefined;
}

/**
 * Ledger fence: self-approval refuses must not invent APPROVED ledger entries.
 * Stale upgrade fence: a prior REFUSED for the same proposalId cannot be
 * upgraded to APPROVED (even under independent A25 honesty) — use a new
 * proposalId. Idempotent duplicate REFUSED: a second REFUSED for the same
 * proposalId reuses the existing entry (no invented SUCCESS / no double-write).
 * Distinct from T-US-036/T-X019 and T-US-035/T-F18.
 */
export function appendSelfApprovalLedgerEntry(
  ledger: SelfApprovalDecisionLedger,
  input: {
    entryId: string;
    proposalId: string;
    honesty: SelfApprovalHonestyDecision;
    /** Caller-requested outcome — APPROVED is fenced when self-approval rejected. */
    requestedOutcome: SelfApprovalLedgerOutcome;
    recordedAtIso: string;
  },
): SelfApprovalLedgerAppendResult {
  if (
    input.honesty.selfApprovalRejected &&
    input.requestedOutcome === "APPROVED"
  ) {
    return {
      ok: false,
      code: "SELF_APPROVAL_LEDGER_FENCE",
      reason:
        "SELF_APPROVAL_LEDGER_FENCE — refused self-approval cannot append APPROVED (no invented SUCCESS)",
      ledger,
      liveReviewWiring: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }

  if (
    input.requestedOutcome === "APPROVED" &&
    hasRefusedEntryForProposal(ledger, input.proposalId)
  ) {
    return {
      ok: false,
      code: "SELF_APPROVAL_LEDGER_STALE_UPGRADE",
      reason:
        "SELF_APPROVAL_LEDGER_STALE_UPGRADE — prior REFUSED for proposalId cannot upgrade to APPROVED (no invented SUCCESS; distinct from T-US-036/T-X019)",
      ledger,
      liveReviewWiring: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }

  if (
    input.honesty.selfApprovalRejected &&
    input.requestedOutcome === "REFUSED"
  ) {
    const existing = findRefusedEntryForProposal(ledger, input.proposalId);
    if (existing) {
      return {
        ok: true,
        ledger: {
          ...ledger,
          liveReviewWiring: "NOT_WIRED",
          externalEffects: "NONE",
        },
        entry: existing,
        idempotent: true,
      };
    }
    const entry: SelfApprovalLedgerEntry = {
      entryId: input.entryId,
      proposalId: input.proposalId,
      outcome: "REFUSED",
      decisionCode: input.honesty.code,
      recordedAtIso: input.recordedAtIso,
    };
    return {
      ok: true,
      ledger: {
        ...ledger,
        entries: [...ledger.entries, entry],
        liveReviewWiring: "NOT_WIRED",
        externalEffects: "NONE",
      },
      entry,
    };
  }

  if (
    input.honesty.code === "INDEPENDENT_A25_OK" &&
    input.requestedOutcome === "APPROVED"
  ) {
    const entry: SelfApprovalLedgerEntry = {
      entryId: input.entryId,
      proposalId: input.proposalId,
      outcome: "APPROVED",
      decisionCode: "INDEPENDENT_A25_OK",
      recordedAtIso: input.recordedAtIso,
    };
    return {
      ok: true,
      ledger: {
        ...ledger,
        entries: [...ledger.entries, entry],
        liveReviewWiring: "NOT_WIRED",
        externalEffects: "NONE",
      },
      entry,
    };
  }

  return {
    ok: false,
    code: "SELF_APPROVAL_LEDGER_FENCE",
    reason: `SELF_APPROVAL_LEDGER_FENCE — honesty code=${input.honesty.code} cannot append outcome=${input.requestedOutcome}`,
    ledger,
    liveReviewWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export const SELF_APPROVAL_RELATED_CASE_IDS = ["T-X018", "T-US-054"] as const;
