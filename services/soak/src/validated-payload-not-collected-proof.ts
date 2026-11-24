/**
 * Fixture proof for T-X070 — Validated payload not collected; separate failure states.
 * External effects: NONE. Live wiring NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * Hillclimb: empty recordId, envelope mismatch, JSON array body, honesty fields.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateValidatedPayloadCollection,
  fixtureWebhookSignature,
  type SoakProofRecord,
} from "@worksocial/domain";

const FIXTURE_SECRET = "fixture-webhook-secret-tx070-soak";

function signedEnvelope(bodyObj: Record<string, unknown>) {
  const body = JSON.stringify(bodyObj);
  return {
    eventId: String(bodyObj.eventId),
    body,
    signatureHex: fixtureWebhookSignature(body, FIXTURE_SECRET),
  };
}

function honestyOk(decision: {
  liveProviderWiring: string;
  chatgptAdsAccess: string;
  externalEffects: string;
}): boolean {
  return (
    decision.liveProviderWiring === "NOT_WIRED" &&
    decision.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    decision.externalEffects === "NONE"
  );
}

/**
 * Complete expected proof set for T-X070 fixture ACCEPTED.
 */
export function proofValidatedPayloadNotCollectedSeparateStates(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // Positive control: valid signature+schema → COLLECTED.
  const okEnv = signedEnvelope({
    eventId: `evt-ok-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const collected = evaluateValidatedPayloadCollection({
    payload: okEnv,
    secret: FIXTURE_SECRET,
    collect: () => ({
      ok: true,
      recordId: `rec-${randomUUID().slice(0, 8)}`,
    }),
  });
  if (
    collected.code === "COLLECTED" &&
    collected.validated === true &&
    collected.collected === true &&
    collected.collectionAttempted === true &&
    collected.recordId != null &&
    honestyOk(collected)
  ) {
    details.push(
      "Valid signature+schema + durable write → COLLECTED (validated=true collected=true); liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`COLLECTED unexpectedly ${JSON.stringify(collected)}`);
  }

  // Validation failure (bad signature) — collection never attempted.
  const badSig = evaluateValidatedPayloadCollection({
    payload: {
      ...okEnv,
      signatureHex: "11".repeat(32),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    badSig.code === "VALIDATION_FAILED" &&
    badSig.validated === false &&
    badSig.collected === false &&
    badSig.collectionAttempted === false &&
    badSig.recordId === null &&
    honestyOk(badSig)
  ) {
    details.push(
      "Bad webhook signature → VALIDATION_FAILED (collectionAttempted=false); liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`VALIDATION_FAILED unexpectedly ${JSON.stringify(badSig)}`);
  }

  // Validated but not collected — separate COLLECTION_FAILED state.
  const validEnv = signedEnvelope({
    eventId: `evt-coll-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const notCollected = evaluateValidatedPayloadCollection({
    payload: validEnv,
    secret: FIXTURE_SECRET,
    collect: () => ({ ok: false, reason: "durable ledger unavailable" }),
  });
  if (
    notCollected.code === "COLLECTION_FAILED" &&
    notCollected.validated === true &&
    notCollected.collected === false &&
    notCollected.collectionAttempted === true &&
    notCollected.recordId === null &&
    honestyOk(notCollected)
  ) {
    details.push(
      "Validated payload not collected → COLLECTION_FAILED (validated=true collected=false; not VALIDATION_FAILED)",
    );
  } else {
    passed = false;
    details.push(
      `COLLECTION_FAILED unexpectedly ${JSON.stringify(notCollected)}`,
    );
  }

  // Thrown collector → still COLLECTION_FAILED (not uncaught / not VALIDATION_FAILED).
  const throwEnv = signedEnvelope({
    eventId: `evt-throw-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const thrown = evaluateValidatedPayloadCollection({
    payload: throwEnv,
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("durable write rejected");
    },
  });
  if (
    thrown.code === "COLLECTION_FAILED" &&
    thrown.validated === true &&
    thrown.collected === false &&
    thrown.collectionAttempted === true &&
    honestyOk(thrown)
  ) {
    details.push(
      "Collector throw → COLLECTION_FAILED (validated=true; not VALIDATION_FAILED)",
    );
  } else {
    passed = false;
    details.push(`Thrown collector unexpectedly ${JSON.stringify(thrown)}`);
  }

  // Empty recordId → COLLECTION_FAILED (validated path; not VALIDATION_FAILED).
  const emptyIdEnv = signedEnvelope({
    eventId: `evt-empty-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const emptyId = evaluateValidatedPayloadCollection({
    payload: emptyIdEnv,
    secret: FIXTURE_SECRET,
    collect: () => ({ ok: true, recordId: "  " }),
  });
  if (
    emptyId.code === "COLLECTION_FAILED" &&
    emptyId.validated === true &&
    emptyId.collected === false &&
    emptyId.collectionAttempted === true &&
    emptyId.recordId === null &&
    honestyOk(emptyId)
  ) {
    details.push(
      "Empty collector recordId → COLLECTION_FAILED (validated=true; not VALIDATION_FAILED)",
    );
  } else {
    passed = false;
    details.push(`Empty recordId unexpectedly ${JSON.stringify(emptyId)}`);
  }

  // Envelope/body eventId mismatch → VALIDATION_FAILED without collection.
  const mismatchBody = JSON.stringify({
    eventId: "evt-body",
    kind: "lead.created",
  });
  const mismatch = evaluateValidatedPayloadCollection({
    payload: {
      eventId: "evt-envelope",
      body: mismatchBody,
      signatureHex: fixtureWebhookSignature(mismatchBody, FIXTURE_SECRET),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on envelope mismatch");
    },
  });
  if (
    mismatch.code === "VALIDATION_FAILED" &&
    mismatch.collectionAttempted === false &&
    honestyOk(mismatch)
  ) {
    details.push(
      "Envelope/body eventId mismatch → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`Envelope mismatch unexpectedly ${JSON.stringify(mismatch)}`);
  }

  // Malformed hex suffix must not validate.
  const suffixReject = evaluateValidatedPayloadCollection({
    payload: {
      ...okEnv,
      signatureHex: `${okEnv.signatureHex}zz`,
    },
    secret: FIXTURE_SECRET,
    collect: () => ({ ok: true, recordId: "should-not" }),
  });
  if (
    suffixReject.code === "VALIDATION_FAILED" &&
    suffixReject.collectionAttempted === false &&
    honestyOk(suffixReject)
  ) {
    details.push("Non-hex signature suffix → VALIDATION_FAILED");
  } else {
    passed = false;
    details.push(
      `Signature suffix unexpectedly ${JSON.stringify(suffixReject)}`,
    );
  }

  // Honesty: the two failure codes must remain distinct.
  if (badSig.code !== notCollected.code) {
    details.push(
      `Separate failure states: ${badSig.code} ≠ ${notCollected.code}`,
    );
  } else {
    passed = false;
    details.push("Failure states were conflated into one code");
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
  );

  return {
    proofId: `proof-validated-payload-${randomUUID()}`,
    kind: SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx070-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
