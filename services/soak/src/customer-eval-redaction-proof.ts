/**
 * Fixture proof for T-X072 — Customer data leaks into evaluation; redaction blocks.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  assertEvalPromptHasNoCustomerPii,
  prepareCustomerDataForEvaluation,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X072 fixture ACCEPTED.
 */
export function proofCustomerDataEvalRedactionBlocks(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const source = {
    customerDisplayName: "Jordan Lee",
    customerEmail: "jordan.lee@example.com",
    customerPhone: "+1 (415) 555-0199",
    messageBody:
      "Please call me at +1 (415) 555-0199 or email jordan.lee@example.com about Suite B.",
    conversationId: `conv-eval-${randomUUID().slice(0, 8)}`,
    intentLabel: "tour_request",
  };

  const known = {
    displayName: source.customerDisplayName,
    email: source.customerEmail,
    phone: source.customerPhone,
  };

  // 1. Positive control: redact mode yields eval-safe payload.
  const redacted = prepareCustomerDataForEvaluation({
    source,
    mode: "redact",
  });
  if (
    redacted.allowed &&
    redacted.code === "REDACTED_FOR_EVAL" &&
    redacted.payload?.redacted === true &&
    redacted.payload.customerDisplayName === "[REDACTED_NAME]" &&
    redacted.payload.customerEmail === "[REDACTED_EMAIL]" &&
    redacted.payload.customerPhone === "[REDACTED_PHONE]" &&
    !/jordan\.lee@example\.com/i.test(redacted.payload.messageBody) &&
    !/415\s*555/i.test(redacted.payload.messageBody) &&
    redacted.externalEffects === "NONE"
  ) {
    details.push(
      "redact mode → REDACTED_FOR_EVAL; name/email/phone/body identifiers stripped",
    );
  } else {
    passed = false;
    details.push(`redact mode unexpectedly ${JSON.stringify(redacted)}`);
  }

  // 1b. Display name embedded in messageBody is also stripped.
  const nameInBody = prepareCustomerDataForEvaluation({
    source: {
      ...source,
      messageBody: "I'm Jordan Lee — please book Suite B.",
    },
    mode: "redact",
  });
  if (
    nameInBody.allowed &&
    nameInBody.payload != null &&
    !/Jordan Lee/i.test(nameInBody.payload.messageBody) &&
    /\[REDACTED_NAME\]/.test(nameInBody.payload.messageBody)
  ) {
    details.push(
      "display name embedded in messageBody → [REDACTED_NAME] (no raw name leak)",
    );
  } else {
    passed = false;
    details.push(
      `name-in-body unexpectedly ${JSON.stringify(nameInBody)}`,
    );
  }

  // 2. Raw passthrough with PII blocked.
  const raw = prepareCustomerDataForEvaluation({
    source,
    mode: "raw_passthrough",
  });
  if (
    !raw.allowed &&
    raw.code === "CUSTOMER_DATA_LEAK_BLOCKED" &&
    raw.payload === null &&
    raw.externalEffects === "NONE"
  ) {
    details.push(
      "raw_passthrough with customer PII → CUSTOMER_DATA_LEAK_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`raw passthrough unexpectedly ${JSON.stringify(raw)}`);
  }

  // 3. Eval prompt built from redacted payload stays clean; raw email/name blocked.
  if (redacted.allowed && redacted.payload) {
    const safePrompt = `Judge fixture answer for intent=${redacted.payload.intentLabel} body=${redacted.payload.messageBody}`;
    const clean = assertEvalPromptHasNoCustomerPii(safePrompt, known);
    if (clean.ok && clean.code === "EVAL_PROMPT_CLEAN") {
      details.push("eval prompt from redacted payload → EVAL_PROMPT_CLEAN");
    } else {
      passed = false;
      details.push(`safe prompt unexpectedly ${JSON.stringify(clean)}`);
    }
  }

  const dirtyEmail = assertEvalPromptHasNoCustomerPii(
    `Judge reply mentioning ${source.customerEmail}`,
    known,
  );
  if (!dirtyEmail.ok && dirtyEmail.code === "CUSTOMER_DATA_LEAK_BLOCKED") {
    details.push(
      "eval prompt with raw customer email → CUSTOMER_DATA_LEAK_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`dirty email prompt unexpectedly ${JSON.stringify(dirtyEmail)}`);
  }

  const dirtyName = assertEvalPromptHasNoCustomerPii(
    `Judge reply mentioning ${source.customerDisplayName}`,
    known,
  );
  if (!dirtyName.ok && dirtyName.code === "CUSTOMER_DATA_LEAK_BLOCKED") {
    details.push(
      "eval prompt with raw display name → CUSTOMER_DATA_LEAK_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`dirty name prompt unexpectedly ${JSON.stringify(dirtyName)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-customer-eval-redact-${randomUUID()}`,
    kind: SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx072-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
