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
}): CustomerEvalRedactionDecision {
  const { source, mode } = input;

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

export const CUSTOMER_EVAL_REDACTION_RELATED_CASE_IDS = ["T-X072"] as const;
