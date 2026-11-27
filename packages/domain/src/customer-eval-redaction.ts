/**
 * T-X072 — Customer data leaks into evaluation: redaction blocks.
 *
 * Raw customer PII (display name, email, phone, identifiers in free text)
 * must not enter EVAL_ONLY prompts/payloads. Callers either redact into a
 * fixture-safe payload (`REDACTED_FOR_EVAL`) or are refused when they insist
 * on raw passthrough (`CUSTOMER_DATA_LEAK_BLOCKED`).
 *
 * Distinct from EVAL_ONLY tool forbid (T-US-018/T-X037) and soak evidence
 * summary redaction helpers. Live eval fleet stays NOT_WIRED.
 * External effects: NONE. ChatGPT Ads stays blocked. ACCEPTED ≠ VERIFIED.
 */

export type CustomerEvalSourceRecord = {
  customerDisplayName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  messageBody: string;
  conversationId: string;
  /** Non-PII fixture context safe for evaluation — still scanned for leaks. */
  intentLabel: string;
};

export type EvalSafeCustomerPayload = {
  customerDisplayName: "[REDACTED_NAME]";
  customerEmail: "[REDACTED_EMAIL]" | null;
  customerPhone: "[REDACTED_PHONE]" | null;
  messageBody: string;
  conversationId: string;
  intentLabel: string;
  redacted: true;
  redactedFields: readonly string[];
};

export type CustomerEvalRedactionMode = "redact" | "raw_passthrough";

/** Live EVAL_ONLY fleet / provider wiring — always NOT_WIRED for fixture proofs. */
export const CUSTOMER_EVAL_LIVE_WIRING = "NOT_WIRED" as const;

export type CustomerEvalLiveWiring = typeof CUSTOMER_EVAL_LIVE_WIRING;

export type CustomerEvalRedactionDecision =
  | {
      allowed: true;
      code: "REDACTED_FOR_EVAL";
      payload: EvalSafeCustomerPayload;
      reasons: string[];
      externalEffects: "NONE";
      liveEvalWiring: CustomerEvalLiveWiring;
      liveProviderSuccessClaimed: false;
    }
  | {
      allowed: false;
      code: "CUSTOMER_DATA_LEAK_BLOCKED";
      payload: null;
      reasons: string[];
      externalEffects: "NONE";
      liveEvalWiring: CustomerEvalLiveWiring;
      liveProviderSuccessClaimed: false;
    };

export type KnownCustomerIdentifiers = {
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
};

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_RE =
  /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function knownTokens(known?: KnownCustomerIdentifiers | null): string[] {
  if (!known) return [];
  return [known.displayName, known.email, known.phone]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v.length > 0);
}

/**
 * Word/phrase-boundary match so short display names (e.g. "Tour") do not
 * corrupt unrelated tokens like intentLabel "tour_request".
 */
function knownIdentifierBoundaryRe(token: string, flags: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(token)}\\b`, flags);
}

function containsKnownIdentifier(
  text: string,
  known?: KnownCustomerIdentifiers | null,
): boolean {
  for (const token of knownTokens(known)) {
    if (knownIdentifierBoundaryRe(token, "i").test(text)) return true;
  }
  return false;
}

function redactKnownIdentifiers(
  raw: string,
  known?: KnownCustomerIdentifiers | null,
): string {
  let out = raw;
  // Longest-first so full display names redact before shorter fragments.
  const tokens = knownTokens(known).sort((a, b) => b.length - a.length);
  for (const token of tokens) {
    out = out.replace(knownIdentifierBoundaryRe(token, "gi"), "[REDACTED_NAME]");
  }
  return out;
}

/** Strip emails/phones and optional known identifiers from free text. */
export function redactTextForEvaluation(
  raw: string,
  known?: KnownCustomerIdentifiers | null,
): string {
  return redactKnownIdentifiers(
    raw
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
      .replace(
        /(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/g,
        "[REDACTED_PHONE]",
      ),
    known,
  );
}

/** True when text still contains raw email, phone, or known identifiers. */
export function containsRawCustomerPii(
  text: string,
  known?: KnownCustomerIdentifiers | null,
): boolean {
  return (
    EMAIL_RE.test(text) ||
    PHONE_RE.test(text) ||
    containsKnownIdentifier(text, known)
  );
}

function sourceHasIdentifiablePii(source: CustomerEvalSourceRecord): boolean {
  if (source.customerDisplayName.trim().length > 0) return true;
  if (source.customerEmail && source.customerEmail.trim().length > 0) return true;
  if (source.customerPhone && source.customerPhone.trim().length > 0) return true;
  if (containsRawCustomerPii(source.messageBody)) return true;
  if (containsRawCustomerPii(source.intentLabel)) return true;
  if (containsRawCustomerPii(source.conversationId)) return true;
  return false;
}

function blockedLeak(reasons: string[]): CustomerEvalRedactionDecision {
  return {
    allowed: false,
    code: "CUSTOMER_DATA_LEAK_BLOCKED",
    payload: null,
    reasons,
    externalEffects: "NONE",
    liveEvalWiring: CUSTOMER_EVAL_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
  };
}

/**
 * Compose an EVAL_ONLY judge prompt from an already-redacted payload only.
 * Callers must not concatenate raw source fields into prompts.
 * Conversation IDs are never echoed — they may embed provider/customer identifiers.
 */
export function buildEvalSafePromptFromPayload(
  payload: EvalSafeCustomerPayload,
): string {
  return [
    "Judge fixture answer",
    `intent=${payload.intentLabel}`,
    "conversationRef=[REDACTED_CONVERSATION_ID]",
    `body=${payload.messageBody}`,
    "customerDisplayName=[REDACTED_NAME]",
  ].join(" ");
}

/**
 * Prepare customer-origin data for an EVAL_ONLY surface.
 * Raw passthrough with identifiable PII is blocked; redact mode yields a
 * fixture-safe payload that evaluation may consume.
 * Live-verified / live-fleet claims are refused (NOT_WIRED).
 */
export function prepareCustomerDataForEvaluation(input: {
  source: CustomerEvalSourceRecord;
  mode: CustomerEvalRedactionMode;
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — live EVAL fleet stays NOT_WIRED. */
  requestLiveEvalFleet?: boolean;
  /** Forbidden — fixture must not deliver raw PII despite leak detection. */
  forceDeliverDespiteLeak?: boolean;
  /** Forbidden — eval gate must redact, not skip. */
  skipRedactionForEval?: boolean;
  /** Forbidden — fixture must not export eval payload to live provider. */
  exportToLiveProvider?: boolean;
  /** Forbidden — must not waive residual-PII post-check. */
  allowResidualPiiInPayload?: boolean;
  /** Forbidden — conversationId must stay redacted when it carries identifiers. */
  bypassConversationIdRedaction?: boolean;
  /** Forbidden — intentLabel must stay scanned/redacted when it carries identifiers. */
  bypassIntentLabelRedaction?: boolean;
  /** Forbidden — messageBody must stay scanned/redacted when it carries identifiers. */
  bypassMessageBodyRedaction?: boolean;
  /** Forbidden — structured name/email/phone fields must stay tokenized. */
  bypassStructuredFieldRedaction?: boolean;
  /** Forbidden — prompts must come from redacted payload builder only. */
  buildPromptFromRawSource?: boolean;
  /** Forbidden — must not downgrade redact mode into raw passthrough. */
  degradeToRawPassthrough?: boolean;
  /** Forbidden — redacted payload must not echo raw structured fields. */
  mirrorRawFieldsInRedactedPayload?: boolean;
  /** Forbidden — eval may not treat customer redaction as optional. */
  claimRedactionOptional?: boolean;
  /** Forbidden — cannot trust raw source as already eval-safe. */
  trustUnredactedSourceAsSafe?: boolean;
  /** Forbidden — eval prompts must stay PII-scanned. */
  skipEvalPromptPiiScan?: boolean;
  /** Forbidden — EVAL_ONLY path must not bypass redaction fence. */
  useEvalOnlyWithoutRedactionFence?: boolean;
  /** Forbidden — cannot reuse prior redacted eval payload without fresh PII scan. */
  reuseStaleRedactedEvalPayload?: boolean;
  /** Forbidden — eval gate must not accept partial redaction short-cuts. */
  allowPartialRedactionForEval?: boolean;
  /** Forbidden — redaction cannot be deferred until after eval consumes data. */
  deferCustomerRedactionUntilAfterEval?: boolean;
}): CustomerEvalRedactionDecision {
  const { source, mode } = input;

  if (input.deferCustomerRedactionUntilAfterEval === true) {
    return blockedLeak([
      "Defer customer redaction until after eval refused — pre-eval gate (T-X072)",
    ]);
  }

  if (input.allowPartialRedactionForEval === true) {
    return blockedLeak([
      "Partial customer redaction for eval refused — full gate required (T-X072)",
    ]);
  }

  if (input.reuseStaleRedactedEvalPayload === true) {
    return blockedLeak([
      "Reuse stale redacted eval payload refused — fresh scan required (T-X072)",
    ]);
  }

  if (input.useEvalOnlyWithoutRedactionFence === true) {
    return blockedLeak([
      "EVAL_ONLY without redaction fence refused — T-X072",
    ]);
  }

  if (input.skipEvalPromptPiiScan === true) {
    return blockedLeak([
      "Skip eval prompt PII scan refused — fixture gate (T-X072)",
    ]);
  }

  if (input.trustUnredactedSourceAsSafe === true) {
    return blockedLeak([
      "Trust unredacted customer source as eval-safe refused — T-X072",
    ]);
  }

  if (input.claimRedactionOptional === true) {
    return blockedLeak([
      "Optional customer redaction claims refused — eval gate (T-X072)",
    ]);
  }

  if (input.mirrorRawFieldsInRedactedPayload === true) {
    return blockedLeak([
      "Mirror raw customer fields in redacted payload refused — T-X072",
    ]);
  }

  if (input.degradeToRawPassthrough === true) {
    return blockedLeak([
      "Degrade redact mode to raw passthrough refused — T-X072",
    ]);
  }

  if (input.buildPromptFromRawSource === true) {
    return blockedLeak([
      "Build eval prompt from raw customer source refused — T-X072",
    ]);
  }

  if (input.bypassStructuredFieldRedaction === true) {
    return blockedLeak([
      "Bypass structured customer field redaction refused — eval gate (T-X072)",
    ]);
  }

  if (input.bypassMessageBodyRedaction === true) {
    return blockedLeak([
      "Bypass messageBody redaction refused — eval gate (T-X072)",
    ]);
  }

  if (input.bypassIntentLabelRedaction === true) {
    return blockedLeak([
      "Bypass intentLabel redaction refused — eval gate (T-X072)",
    ]);
  }

  if (input.bypassConversationIdRedaction === true) {
    return blockedLeak([
      "Bypass conversationId redaction refused — eval gate (T-X072)",
    ]);
  }

  if (input.allowResidualPiiInPayload === true) {
    return blockedLeak([
      "Waive residual PII in eval payload refused — redaction gate (T-X072)",
    ]);
  }

  if (input.exportToLiveProvider === true) {
    return blockedLeak([
      "Export customer eval payload to live provider refused — NOT_WIRED (T-X072)",
    ]);
  }

  if (input.skipRedactionForEval === true) {
    return blockedLeak([
      "Skip redaction for eval refused — customer data must be redacted (T-X072)",
    ]);
  }

  if (input.forceDeliverDespiteLeak === true) {
    return blockedLeak([
      "Force-deliver despite customer PII leak refused — fixture eval gate (T-X072)",
    ]);
  }

  if (input.claimLiveVerified === true && input.requestLiveEvalFleet === true) {
    return blockedLeak([
      "Simultaneous live VERIFIED and live-fleet claims refused — LIVE_CLAIM_REFUSED (T-X072)",
    ]);
  }

  if (input.claimLiveVerified === true) {
    return blockedLeak([
      "Live VERIFIED customer-eval claims are forbidden — fixture ACCEPTED only (T-X072)",
    ]);
  }
  if (input.requestLiveEvalFleet === true) {
    return blockedLeak([
      "Live EVAL fleet remains NOT_WIRED — refuse live eval wiring (T-X072)",
    ]);
  }

  const known: KnownCustomerIdentifiers = {
    displayName: source.customerDisplayName,
    email: source.customerEmail,
    phone: source.customerPhone,
  };

  if (mode === "raw_passthrough" && sourceHasIdentifiablePii(source)) {
    return blockedLeak([
      "Raw customer PII cannot enter evaluation — redaction required (T-X072)",
    ]);
  }

  const redactedFields: string[] = [];
  if (source.customerDisplayName.trim().length > 0) {
    redactedFields.push("customerDisplayName");
  }
  if (source.customerEmail && source.customerEmail.trim().length > 0) {
    redactedFields.push("customerEmail");
  }
  if (source.customerPhone && source.customerPhone.trim().length > 0) {
    redactedFields.push("customerPhone");
  }
  const redactedBody = redactTextForEvaluation(source.messageBody, known);
  if (redactedBody !== source.messageBody) {
    redactedFields.push("messageBody");
  }
  const redactedIntent = redactTextForEvaluation(source.intentLabel, known);
  if (redactedIntent !== source.intentLabel) {
    redactedFields.push("intentLabel");
  }
  const redactedConversationId = redactTextForEvaluation(
    source.conversationId,
    known,
  );
  if (redactedConversationId !== source.conversationId) {
    redactedFields.push("conversationId");
  }

  const payload: EvalSafeCustomerPayload = {
    customerDisplayName: "[REDACTED_NAME]",
    customerEmail:
      source.customerEmail && source.customerEmail.trim().length > 0
        ? "[REDACTED_EMAIL]"
        : null,
    customerPhone:
      source.customerPhone && source.customerPhone.trim().length > 0
        ? "[REDACTED_PHONE]"
        : null,
    messageBody: redactedBody,
    conversationId: redactedConversationId,
    intentLabel: redactedIntent,
    redacted: true,
    redactedFields,
  };

  if (
    containsRawCustomerPii(payload.messageBody, known) ||
    containsRawCustomerPii(payload.intentLabel, known) ||
    containsRawCustomerPii(payload.conversationId, known)
  ) {
    return blockedLeak([
      "Redaction left residual customer PII in evaluation payload — blocked (T-X072)",
    ]);
  }

  return {
    allowed: true,
    code: "REDACTED_FOR_EVAL",
    payload,
    reasons: [
      redactedFields.length > 0
        ? `Redacted fields for evaluation: ${redactedFields.join(", ")}`
        : "No identifiable customer PII present; eval payload marked redacted",
      "liveEvalWiring=NOT_WIRED",
      "ACCEPTED≠VERIFIED",
    ],
    externalEffects: "NONE",
    liveEvalWiring: CUSTOMER_EVAL_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
  };
}

/**
 * Fail-closed check that an EVAL_ONLY prompt string does not embed raw PII.
 * Pass `known` when the caller has the customer's display name / email / phone
 * so embedded names in free text are also refused.
 */
export function assertEvalPromptHasNoCustomerPii(
  prompt: string,
  known?: KnownCustomerIdentifiers | null,
): {
  ok: boolean;
  code: "EVAL_PROMPT_CLEAN" | "CUSTOMER_DATA_LEAK_BLOCKED";
  reasons: string[];
  liveEvalWiring: CustomerEvalLiveWiring;
} {
  if (containsRawCustomerPii(prompt, known)) {
    return {
      ok: false,
      code: "CUSTOMER_DATA_LEAK_BLOCKED",
      reasons: [
        "Evaluation prompt contains raw customer identifiers — blocked (T-X072)",
      ],
      liveEvalWiring: CUSTOMER_EVAL_LIVE_WIRING,
    };
  }
  return {
    ok: true,
    code: "EVAL_PROMPT_CLEAN",
    reasons: ["Evaluation prompt has no raw customer identifiers"],
    liveEvalWiring: CUSTOMER_EVAL_LIVE_WIRING,
  };
}

/** Idempotent re-check of the same eval prompt must not drift clean/blocked code. */
export function assertEvalPromptCheckIdempotent(
  prompt: string,
  known?: KnownCustomerIdentifiers | null,
): { ok: boolean; reasons: string[] } {
  const first = assertEvalPromptHasNoCustomerPii(prompt, known);
  const second = assertEvalPromptHasNoCustomerPii(prompt, known);
  const reasons: string[] = [];
  if (first.ok !== second.ok) reasons.push("prompt check ok drifted");
  if (first.code !== second.code) reasons.push("prompt check code drifted");
  if (first.liveEvalWiring !== second.liveEvalWiring) {
    reasons.push("prompt check liveEvalWiring drifted");
  }
  if (
    !first.ok &&
    !second.ok &&
    first.code === second.code &&
    first.reasons.join("|") !== second.reasons.join("|")
  ) {
    reasons.push("prompt check block reasons drifted");
  }
  return { ok: reasons.length === 0, reasons };
}

/**
 * Re-verify a prior fixture decision against a fresh prepare() — refuse reason/code drift.
 */
export function reclaimCustomerEvalRedactionDecision(
  input: Parameters<typeof prepareCustomerDataForEvaluation>[0],
  prior: CustomerEvalRedactionDecision,
): { ok: boolean; reasons: string[] } {
  const next = prepareCustomerDataForEvaluation(input);
  const reasons: string[] = [];

  if (prior.allowed !== next.allowed) {
    reasons.push("reclaim allowed drifted");
  }
  if (prior.code !== next.code) {
    reasons.push("reclaim code drifted");
  }
  if (prior.liveEvalWiring !== next.liveEvalWiring) {
    reasons.push("reclaim liveEvalWiring drifted");
  }
  if (
    prior.liveProviderSuccessClaimed !== next.liveProviderSuccessClaimed
  ) {
    reasons.push("reclaim liveProviderSuccessClaimed drifted");
  }
  if (
    !prior.allowed &&
    !next.allowed &&
    prior.code === next.code &&
    prior.reasons.join("|") !== next.reasons.join("|")
  ) {
    reasons.push("reclaim block reasons drifted");
  }

  if (prior.allowed && next.allowed && prior.payload && next.payload) {
    if (prior.payload.messageBody !== next.payload.messageBody) {
      reasons.push("reclaim messageBody drifted");
    }
    if (prior.payload.intentLabel !== next.payload.intentLabel) {
      reasons.push("reclaim intentLabel drifted");
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/** Idempotent re-apply of the same source/mode must not drift codes or redacted payload shape. */
export function assertCustomerEvalRedactionIdempotent(
  input: Parameters<typeof prepareCustomerDataForEvaluation>[0],
): { ok: boolean; reasons: string[] } {
  const first = prepareCustomerDataForEvaluation(input);
  const second = prepareCustomerDataForEvaluation(input);
  const reasons: string[] = [];

  if (first.allowed !== second.allowed) {
    reasons.push("reapply allowed drifted");
  }
  if (first.code !== second.code) {
    reasons.push("reapply code drifted");
  }
  if (first.liveEvalWiring !== second.liveEvalWiring) {
    reasons.push("reapply liveEvalWiring drifted");
  }
  if (
    first.liveProviderSuccessClaimed !== second.liveProviderSuccessClaimed
  ) {
    reasons.push("reapply liveProviderSuccessClaimed drifted");
  }

  if (first.allowed && second.allowed && first.payload && second.payload) {
    if (
      first.payload.redactedFields.join(",") !==
      second.payload.redactedFields.join(",")
    ) {
      reasons.push("reapply redactedFields drifted");
    }
    if (first.payload.messageBody !== second.payload.messageBody) {
      reasons.push("reapply messageBody drifted");
    }
    if (first.payload.intentLabel !== second.payload.intentLabel) {
      reasons.push("reapply intentLabel drifted");
    }
    if (first.payload.conversationId !== second.payload.conversationId) {
      reasons.push("reapply conversationId drifted");
    }
  }

  if (
    !first.allowed &&
    !second.allowed &&
    first.reasons.join("|") !== second.reasons.join("|")
  ) {
    reasons.push("reapply block reasons drifted");
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * Refuse dishonest post-hoc tampering on fixture decisions (live success scrub).
 */
export function assertCustomerEvalRedactionDecisionHonest(
  decision: CustomerEvalRedactionDecision,
): { ok: boolean; code: "HONEST" | "DISHONEST_LIVE_CLAIM"; reasons: string[] } {
  if (decision.liveProviderSuccessClaimed !== false) {
    return {
      ok: false,
      code: "DISHONEST_LIVE_CLAIM",
      reasons: [
        "liveProviderSuccessClaimed must stay false on T-X072 fixture decisions",
      ],
    };
  }
  if (decision.liveEvalWiring !== CUSTOMER_EVAL_LIVE_WIRING) {
    return {
      ok: false,
      code: "DISHONEST_LIVE_CLAIM",
      reasons: ["liveEvalWiring must stay NOT_WIRED (T-X072)"],
    };
  }
  if (decision.externalEffects !== "NONE") {
    return {
      ok: false,
      code: "DISHONEST_LIVE_CLAIM",
      reasons: ["externalEffects must stay NONE (T-X072)"],
    };
  }
  return {
    ok: true,
    code: "HONEST",
    reasons: ["fixture decision fields honest"],
  };
}

export const CUSTOMER_EVAL_REDACTION_RELATED_CASE_IDS = ["T-X072"] as const;
