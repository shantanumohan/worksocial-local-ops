/**
 * T-X070 — Validated payload not collected: separate failure states.
 *
 * Validation failure and collection failure must never share one opaque
 * FAILURE code. A schema/signature-valid payload that fails durable
 * collection reports COLLECTION_FAILED (validated=true, collected=false).
 * Invalid payloads report VALIDATION_FAILED without attempting or claiming
 * collection. Happy path returns COLLECTED. External effects: NONE.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export type PayloadIntakeCode =
  | "COLLECTED"
  | "VALIDATION_FAILED"
  | "COLLECTION_FAILED";

export type FixtureWebhookPayload = {
  eventId: string;
  /** Canonical body bytes used for signature (fixture JSON string). */
  body: string;
  /** Hex HMAC-SHA256 of body with fixture secret (exactly 64 hex chars). */
  signatureHex: string;
};

export type PayloadCollectionAttempt =
  | { ok: true; recordId: string }
  | { ok: false; reason: string };

export type PayloadIntakeDecision = {
  code: PayloadIntakeCode;
  validated: boolean;
  collected: boolean;
  collectionAttempted: boolean;
  reasons: string[];
  recordId: string | null;
};

const DEFAULT_REQUIRED_FIELDS = ["eventId", "kind"] as const;
const HEX64 = /^[0-9a-fA-F]{64}$/;

/** Fixture-only HMAC — never a live provider secret. */
export function fixtureWebhookSignature(
  body: string,
  secret: string,
): string {
  return createHmac("sha256", secret).update(body, "utf8").digest("hex");
}

function signaturesMatch(expectedHex: string, providedHex: string): boolean {
  if (!HEX64.test(expectedHex) || !HEX64.test(providedHex)) {
    return false;
  }
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(providedHex, "hex");
    if (a.length !== 32 || b.length !== 32) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Validate fixture webhook signature + schema, then optionally collect.
 * Stages stay distinct: VALIDATION_FAILED ≠ COLLECTION_FAILED ≠ COLLECTED.
 * Schema field requirements come from trusted evaluator config — never from
 * the signed payload envelope.
 */
export function evaluateValidatedPayloadCollection(input: {
  payload: FixtureWebhookPayload;
  /** Fixture HMAC secret (local only). */
  secret: string;
  /**
   * Trusted schema field list (evaluator/host config). Defaults to
   * eventId + kind. Must not be taken from the untrusted payload.
   */
  requiredFields?: readonly string[];
  /**
   * Durable collection step. Invoked only after validation passes.
   * Thrown errors become COLLECTION_FAILED (not an uncaught exception).
   */
  collect: (parsed: Record<string, unknown>) => PayloadCollectionAttempt;
}): PayloadIntakeDecision {
  const expected = fixtureWebhookSignature(input.payload.body, input.secret);
  if (!signaturesMatch(expected, input.payload.signatureHex)) {
    return {
      code: "VALIDATION_FAILED",
      validated: false,
      collected: false,
      collectionAttempted: false,
      reasons: [
        "Webhook signature mismatch — VALIDATION_FAILED (collection not attempted)",
      ],
      recordId: null,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(input.payload.body) as unknown;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return {
        code: "VALIDATION_FAILED",
        validated: false,
        collected: false,
        collectionAttempted: false,
        reasons: [
          "Payload body must be a JSON object — VALIDATION_FAILED (collection not attempted)",
        ],
        recordId: null,
      };
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return {
      code: "VALIDATION_FAILED",
      validated: false,
      collected: false,
      collectionAttempted: false,
      reasons: [
        "Payload body is not valid JSON — VALIDATION_FAILED (collection not attempted)",
      ],
      recordId: null,
    };
  }

  const required = input.requiredFields ?? DEFAULT_REQUIRED_FIELDS;
  const missing = required.filter((field) => {
    const v = parsed[field];
    return v === undefined || v === null || v === "";
  });
  if (missing.length > 0) {
    return {
      code: "VALIDATION_FAILED",
      validated: false,
      collected: false,
      collectionAttempted: false,
      reasons: [
        `Missing required fields [${missing.join(", ")}] — VALIDATION_FAILED (collection not attempted)`,
      ],
      recordId: null,
    };
  }

  if (typeof parsed.eventId !== "string") {
    return {
      code: "VALIDATION_FAILED",
      validated: false,
      collected: false,
      collectionAttempted: false,
      reasons: [
        "Body eventId must be a string — VALIDATION_FAILED (collection not attempted)",
      ],
      recordId: null,
    };
  }
  if (parsed.eventId !== input.payload.eventId) {
    return {
      code: "VALIDATION_FAILED",
      validated: false,
      collected: false,
      collectionAttempted: false,
      reasons: [
        "Envelope eventId does not match body eventId — VALIDATION_FAILED (collection not attempted)",
      ],
      recordId: null,
    };
  }

  let attempt: PayloadCollectionAttempt;
  try {
    attempt = input.collect(parsed);
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : `collector threw: ${String(err)}`;
    return {
      code: "COLLECTION_FAILED",
      validated: true,
      collected: false,
      collectionAttempted: true,
      reasons: [
        `Signature+schema valid but durable collection threw (${reason}) — COLLECTION_FAILED (not VALIDATION_FAILED)`,
      ],
      recordId: null,
    };
  }

  if (!attempt.ok) {
    return {
      code: "COLLECTION_FAILED",
      validated: true,
      collected: false,
      collectionAttempted: true,
      reasons: [
        `Signature+schema valid but durable collection failed (${attempt.reason}) — COLLECTION_FAILED (not VALIDATION_FAILED)`,
      ],
      recordId: null,
    };
  }

  return {
    code: "COLLECTED",
    validated: true,
    collected: true,
    collectionAttempted: true,
    reasons: [
      `Validated payload collected as ${attempt.recordId} — COLLECTED`,
    ],
    recordId: attempt.recordId,
  };
}

export const VALIDATED_PAYLOAD_COLLECTION_RELATED_CASE_IDS = [
  "T-X070",
] as const;
