/**
 * Fixture proof for T-X072 — Customer data leaks into evaluation; redaction blocks.
 * Hillclimb: liveEvalWiring NOT_WIRED; refuse live VERIFIED / live fleet;
 * intentLabel PII; eval-safe prompt builder. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  assertCustomerEvalRedactionDecisionHonest,
  assertCustomerEvalRedactionIdempotent,
  assertEvalPromptHasNoCustomerPii,
  buildEvalSafePromptFromPayload,
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
    redacted.externalEffects === "NONE" &&
    redacted.liveEvalWiring === "NOT_WIRED" &&
    redacted.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "redact mode → REDACTED_FOR_EVAL; name/email/phone/body identifiers stripped; liveEvalWiring=NOT_WIRED",
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

  // 1c. intentLabel PII redacted.
  const intentPii = prepareCustomerDataForEvaluation({
    source: {
      ...source,
      intentLabel: "follow_up jordan.lee@example.com",
    },
    mode: "redact",
  });
  if (
    intentPii.allowed &&
    intentPii.payload != null &&
    !/jordan\.lee@example\.com/i.test(intentPii.payload.intentLabel) &&
    /\[REDACTED_EMAIL\]/.test(intentPii.payload.intentLabel)
  ) {
    details.push("intentLabel embedded email → [REDACTED_EMAIL]");
  } else {
    passed = false;
    details.push(`intentLabel PII unexpectedly ${JSON.stringify(intentPii)}`);
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
    raw.externalEffects === "NONE" &&
    raw.liveEvalWiring === "NOT_WIRED"
  ) {
    details.push(
      "raw_passthrough with customer PII → CUSTOMER_DATA_LEAK_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`raw passthrough unexpectedly ${JSON.stringify(raw)}`);
  }

  const forceDeliver = prepareCustomerDataForEvaluation({
    source,
    mode: "redact",
    forceDeliverDespiteLeak: true,
  });
  if (
    !forceDeliver.allowed &&
    forceDeliver.code === "CUSTOMER_DATA_LEAK_BLOCKED"
  ) {
    details.push("forceDeliverDespiteLeak → CUSTOMER_DATA_LEAK_BLOCKED");
  } else {
    passed = false;
    details.push(`forceDeliver unexpectedly ${JSON.stringify(forceDeliver)}`);
  }

  // 2a. Simultaneous live VERIFIED + live fleet refused.
  const dualLive = prepareCustomerDataForEvaluation({
    source,
    mode: "redact",
    claimLiveVerified: true,
    requestLiveEvalFleet: true,
  });
  if (
    !dualLive.allowed &&
    dualLive.code === "CUSTOMER_DATA_LEAK_BLOCKED" &&
    dualLive.reasons.some((r) => /LIVE_CLAIM_REFUSED/.test(r))
  ) {
    details.push(
      "simultaneous claimLiveVerified+requestLiveEvalFleet → LIVE_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(`dual live claims unexpectedly ${JSON.stringify(dualLive)}`);
  }

  const idempotent = assertCustomerEvalRedactionIdempotent({
    source,
    mode: "redact",
  });
  if (idempotent.ok) {
    details.push("reapply redact path idempotent (code/payload fields stable)");
  } else {
    passed = false;
    details.push(`idempotent redact failed: ${idempotent.reasons.join("; ")}`);
  }

  const idempotentRaw = assertCustomerEvalRedactionIdempotent({
    source,
    mode: "raw_passthrough",
  });
  const idempotentDualLive = assertCustomerEvalRedactionIdempotent({
    source,
    mode: "redact",
    claimLiveVerified: true,
    requestLiveEvalFleet: true,
  });
  if (idempotentRaw.ok && idempotentDualLive.ok) {
    details.push(
      "reapply idempotent on raw_passthrough block and dual-live refuse",
    );
  } else {
    passed = false;
    details.push(
      `idempotent block paths failed raw=${idempotentRaw.reasons} dual=${idempotentDualLive.reasons}`,
    );
  }

  if (redacted.allowed) {
    const honest = assertCustomerEvalRedactionDecisionHonest(redacted);
    if (honest.ok) {
      details.push("fixture decision honesty (liveEvalWiring/externalEffects)");
    } else {
      passed = false;
      details.push(`honesty check failed: ${honest.reasons.join("; ")}`);
    }
  }

  // 2b. Live VERIFIED / live fleet claims refused.
  const liveVerified = prepareCustomerDataForEvaluation({
    source,
    mode: "redact",
    claimLiveVerified: true,
  });
  const liveFleet = prepareCustomerDataForEvaluation({
    source,
    mode: "redact",
    requestLiveEvalFleet: true,
  });
  if (
    !liveVerified.allowed &&
    liveVerified.code === "CUSTOMER_DATA_LEAK_BLOCKED" &&
    !liveFleet.allowed &&
    liveFleet.liveEvalWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimLiveVerified / requestLiveEvalFleet → CUSTOMER_DATA_LEAK_BLOCKED (NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `live claims unexpectedly verified=${JSON.stringify(liveVerified)} fleet=${JSON.stringify(liveFleet)}`,
    );
  }

  // 2c. Conversation ID embedding email is redacted; prompt never echoes conversationId.
  const dirtyConv = prepareCustomerDataForEvaluation({
    source: {
      ...source,
      conversationId: `thread-${source.customerEmail}`,
    },
    mode: "redact",
  });
  if (
    dirtyConv.allowed &&
    dirtyConv.payload != null &&
    !/jordan\.lee@example\.com/i.test(dirtyConv.payload.conversationId) &&
    /\[REDACTED_EMAIL\]/.test(dirtyConv.payload.conversationId)
  ) {
    const promptFromDirtyConv = buildEvalSafePromptFromPayload(dirtyConv.payload);
    if (
      !/jordan\.lee@example\.com/i.test(promptFromDirtyConv) &&
      /\[REDACTED_CONVERSATION_ID\]/.test(promptFromDirtyConv)
    ) {
      details.push(
        "conversationId with embedded email redacted; eval prompt uses [REDACTED_CONVERSATION_ID]",
      );
    } else {
      passed = false;
      details.push(`dirty-conv prompt unexpectedly ${promptFromDirtyConv}`);
    }
  } else {
    passed = false;
    details.push(`dirty conversationId unexpectedly ${JSON.stringify(dirtyConv)}`);
  }

  // 2d. Short display name must not corrupt intentLabel substrings (tour vs tour_request).
  const shortName = prepareCustomerDataForEvaluation({
    source: {
      customerDisplayName: "Tour",
      customerEmail: null,
      customerPhone: null,
      messageBody: "Looking for availability.",
      conversationId: "conv-tour",
      intentLabel: "tour_request",
    },
    mode: "redact",
  });
  if (
    shortName.allowed &&
    shortName.payload?.intentLabel === "tour_request"
  ) {
    details.push(
      "short displayName Tour does not substring-corrupt intentLabel tour_request",
    );
  } else {
    passed = false;
    details.push(`short-name intent unexpectedly ${JSON.stringify(shortName)}`);
  }

  // 3. Eval prompt built from redacted payload stays clean; raw email/name blocked.
  if (redacted.allowed && redacted.payload) {
    const safePrompt = buildEvalSafePromptFromPayload(redacted.payload);
    const clean = assertEvalPromptHasNoCustomerPii(safePrompt, known);
    if (
      clean.ok &&
      clean.code === "EVAL_PROMPT_CLEAN" &&
      clean.liveEvalWiring === "NOT_WIRED" &&
      !/jordan\.lee@example\.com/i.test(safePrompt) &&
      /\[REDACTED_CONVERSATION_ID\]/.test(safePrompt)
    ) {
      details.push(
        "buildEvalSafePromptFromPayload → EVAL_PROMPT_CLEAN (liveEvalWiring=NOT_WIRED; conversationId withheld)",
      );
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

  details.push(
    "liveProviderSuccessClaimed=false liveEvalWiring=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
  );

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
