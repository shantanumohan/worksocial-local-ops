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

  // B47 — short hex signature (41 chars) → VALIDATION_FAILED without collection.
  const b47Env = signedEnvelope({
    eventId: `evt-b47-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b47Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b47Env,
      signatureHex: b47Env.signatureHex.slice(0, 41),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b47Sig.code === "VALIDATION_FAILED" &&
    b47Sig.collectionAttempted === false &&
    honestyOk(b47Sig)
  ) {
    details.push(
      "Short signature hex (B47, 41 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B47 short signature unexpectedly ${JSON.stringify(b47Sig)}`);
  }

  // B46 — short hex signature (42 chars) → VALIDATION_FAILED without collection.
  const b46Env = signedEnvelope({
    eventId: `evt-b46-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b46Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b46Env,
      signatureHex: b46Env.signatureHex.slice(0, 42),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b46Sig.code === "VALIDATION_FAILED" &&
    b46Sig.collectionAttempted === false &&
    honestyOk(b46Sig)
  ) {
    details.push(
      "Short signature hex (B46, 42 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B46 short signature unexpectedly ${JSON.stringify(b46Sig)}`);
  }

  // B45 — short hex signature (43 chars) → VALIDATION_FAILED without collection.
  const b45Env = signedEnvelope({
    eventId: `evt-b45-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b45Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b45Env,
      signatureHex: b45Env.signatureHex.slice(0, 43),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b45Sig.code === "VALIDATION_FAILED" &&
    b45Sig.collectionAttempted === false &&
    honestyOk(b45Sig)
  ) {
    details.push(
      "Short signature hex (B45, 43 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B45 short signature unexpectedly ${JSON.stringify(b45Sig)}`);
  }

  // B44 — short hex signature (44 chars) → VALIDATION_FAILED without collection.
  const b44Env = signedEnvelope({
    eventId: `evt-b44-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b44Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b44Env,
      signatureHex: b44Env.signatureHex.slice(0, 44),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b44Sig.code === "VALIDATION_FAILED" &&
    b44Sig.collectionAttempted === false &&
    honestyOk(b44Sig)
  ) {
    details.push(
      "Short signature hex (B44, 44 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B44 short signature unexpectedly ${JSON.stringify(b44Sig)}`);
  }

  // B43 — short hex signature (45 chars) → VALIDATION_FAILED without collection.
  const b43Env = signedEnvelope({
    eventId: `evt-b43-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b43Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b43Env,
      signatureHex: b43Env.signatureHex.slice(0, 45),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b43Sig.code === "VALIDATION_FAILED" &&
    b43Sig.collectionAttempted === false &&
    honestyOk(b43Sig)
  ) {
    details.push(
      "Short signature hex (B43, 45 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B43 short signature unexpectedly ${JSON.stringify(b43Sig)}`);
  }

  // B42 — short hex signature (46 chars) → VALIDATION_FAILED without collection.
  const b42Env = signedEnvelope({
    eventId: `evt-b42-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b42Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b42Env,
      signatureHex: b42Env.signatureHex.slice(0, 46),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b42Sig.code === "VALIDATION_FAILED" &&
    b42Sig.collectionAttempted === false &&
    honestyOk(b42Sig)
  ) {
    details.push(
      "Short signature hex (B42, 46 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B42 short signature unexpectedly ${JSON.stringify(b42Sig)}`);
  }

  // B41 — short hex signature (47 chars) → VALIDATION_FAILED without collection.
  const b41Env = signedEnvelope({
    eventId: `evt-b41-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b41Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b41Env,
      signatureHex: b41Env.signatureHex.slice(0, 47),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b41Sig.code === "VALIDATION_FAILED" &&
    b41Sig.collectionAttempted === false &&
    honestyOk(b41Sig)
  ) {
    details.push(
      "Short signature hex (B41, 47 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B41 short signature unexpectedly ${JSON.stringify(b41Sig)}`);
  }

  // B40 — short hex signature (48 chars) → VALIDATION_FAILED without collection.
  const b40Env = signedEnvelope({
    eventId: `evt-b40-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b40Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b40Env,
      signatureHex: b40Env.signatureHex.slice(0, 48),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b40Sig.code === "VALIDATION_FAILED" &&
    b40Sig.collectionAttempted === false &&
    honestyOk(b40Sig)
  ) {
    details.push(
      "Short signature hex (B40, 48 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B40 short signature unexpectedly ${JSON.stringify(b40Sig)}`);
  }

  // B39 — short hex signature (49 chars) → VALIDATION_FAILED without collection.
  const b39Env = signedEnvelope({
    eventId: `evt-b39-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b39Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b39Env,
      signatureHex: b39Env.signatureHex.slice(0, 49),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b39Sig.code === "VALIDATION_FAILED" &&
    b39Sig.collectionAttempted === false &&
    honestyOk(b39Sig)
  ) {
    details.push(
      "Short signature hex (B39, 49 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B39 short signature unexpectedly ${JSON.stringify(b39Sig)}`);
  }

  // B38 — short hex signature (50 chars) → VALIDATION_FAILED without collection.
  const b38Env = signedEnvelope({
    eventId: `evt-b38-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b38Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b38Env,
      signatureHex: b38Env.signatureHex.slice(0, 50),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b38Sig.code === "VALIDATION_FAILED" &&
    b38Sig.collectionAttempted === false &&
    honestyOk(b38Sig)
  ) {
    details.push(
      "Short signature hex (B38, 50 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B38 short signature unexpectedly ${JSON.stringify(b38Sig)}`);
  }

  // B37 — short hex signature (51 chars) → VALIDATION_FAILED without collection.
  const b37Env = signedEnvelope({
    eventId: `evt-b37-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b37Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b37Env,
      signatureHex: b37Env.signatureHex.slice(0, 51),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b37Sig.code === "VALIDATION_FAILED" &&
    b37Sig.collectionAttempted === false &&
    honestyOk(b37Sig)
  ) {
    details.push(
      "Short signature hex (B37, 51 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B37 short signature unexpectedly ${JSON.stringify(b37Sig)}`);
  }

  // B36 — short hex signature (52 chars) → VALIDATION_FAILED without collection.
  const b36Env = signedEnvelope({
    eventId: `evt-b36-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b36Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b36Env,
      signatureHex: b36Env.signatureHex.slice(0, 52),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b36Sig.code === "VALIDATION_FAILED" &&
    b36Sig.collectionAttempted === false &&
    honestyOk(b36Sig)
  ) {
    details.push(
      "Short signature hex (B36, 52 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B36 short signature unexpectedly ${JSON.stringify(b36Sig)}`);
  }

  // B35 — short hex signature (53 chars) → VALIDATION_FAILED without collection.
  const b35Env = signedEnvelope({
    eventId: `evt-b35-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b35Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b35Env,
      signatureHex: b35Env.signatureHex.slice(0, 53),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b35Sig.code === "VALIDATION_FAILED" &&
    b35Sig.collectionAttempted === false &&
    honestyOk(b35Sig)
  ) {
    details.push(
      "Short signature hex (B35, 53 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B35 short signature unexpectedly ${JSON.stringify(b35Sig)}`);
  }

  // B34 — short hex signature (54 chars) → VALIDATION_FAILED without collection.
  const b34Env = signedEnvelope({
    eventId: `evt-b34-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b34Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b34Env,
      signatureHex: b34Env.signatureHex.slice(0, 54),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b34Sig.code === "VALIDATION_FAILED" &&
    b34Sig.collectionAttempted === false &&
    honestyOk(b34Sig)
  ) {
    details.push(
      "Short signature hex (B34, 54 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B34 short signature unexpectedly ${JSON.stringify(b34Sig)}`);
  }

  // B33 — short hex signature (55 chars) → VALIDATION_FAILED without collection.
  const b33Env = signedEnvelope({
    eventId: `evt-b33-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b33Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b33Env,
      signatureHex: b33Env.signatureHex.slice(0, 55),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b33Sig.code === "VALIDATION_FAILED" &&
    b33Sig.collectionAttempted === false &&
    honestyOk(b33Sig)
  ) {
    details.push(
      "Short signature hex (B33, 55 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B33 short signature unexpectedly ${JSON.stringify(b33Sig)}`);
  }

  // B32 — short hex signature (56 chars) → VALIDATION_FAILED without collection.
  const b32Env = signedEnvelope({
    eventId: `evt-b32-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b32Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b32Env,
      signatureHex: b32Env.signatureHex.slice(0, 56),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b32Sig.code === "VALIDATION_FAILED" &&
    b32Sig.collectionAttempted === false &&
    honestyOk(b32Sig)
  ) {
    details.push(
      "Short signature hex (B32, 56 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B32 short signature unexpectedly ${JSON.stringify(b32Sig)}`);
  }

  // B31 — short hex signature (57 chars) → VALIDATION_FAILED without collection.
  const b31Env = signedEnvelope({
    eventId: `evt-b31-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b31Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b31Env,
      signatureHex: b31Env.signatureHex.slice(0, 57),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b31Sig.code === "VALIDATION_FAILED" &&
    b31Sig.collectionAttempted === false &&
    honestyOk(b31Sig)
  ) {
    details.push(
      "Short signature hex (B31, 57 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B31 short signature unexpectedly ${JSON.stringify(b31Sig)}`);
  }

  // B30 — short hex signature (58 chars) → VALIDATION_FAILED without collection.
  const b30Env = signedEnvelope({
    eventId: `evt-b30-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b30Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b30Env,
      signatureHex: b30Env.signatureHex.slice(0, 58),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b30Sig.code === "VALIDATION_FAILED" &&
    b30Sig.collectionAttempted === false &&
    honestyOk(b30Sig)
  ) {
    details.push(
      "Short signature hex (B30, 58 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B30 short signature unexpectedly ${JSON.stringify(b30Sig)}`);
  }

  // B29 — short hex signature (59 chars) → VALIDATION_FAILED without collection.
  const b29Env = signedEnvelope({
    eventId: `evt-b29-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b29Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b29Env,
      signatureHex: b29Env.signatureHex.slice(0, 59),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b29Sig.code === "VALIDATION_FAILED" &&
    b29Sig.collectionAttempted === false &&
    honestyOk(b29Sig)
  ) {
    details.push(
      "Short signature hex (B29, 59 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B29 short signature unexpectedly ${JSON.stringify(b29Sig)}`);
  }

  // B28 — short hex signature (60 chars) → VALIDATION_FAILED without collection.
  const b28Env = signedEnvelope({
    eventId: `evt-b28-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b28Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b28Env,
      signatureHex: b28Env.signatureHex.slice(0, 60),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b28Sig.code === "VALIDATION_FAILED" &&
    b28Sig.collectionAttempted === false &&
    honestyOk(b28Sig)
  ) {
    details.push(
      "Short signature hex (B28, 60 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B28 short signature unexpectedly ${JSON.stringify(b28Sig)}`);
  }

  // B27 — short hex signature (61 chars) → VALIDATION_FAILED without collection.
  const b27Env = signedEnvelope({
    eventId: `evt-b27-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const b27Sig = evaluateValidatedPayloadCollection({
    payload: {
      ...b27Env,
      signatureHex: b27Env.signatureHex.slice(0, 61),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    b27Sig.code === "VALIDATION_FAILED" &&
    b27Sig.collectionAttempted === false &&
    honestyOk(b27Sig)
  ) {
    details.push(
      "Short signature hex (B27, 61 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B27 short signature unexpectedly ${JSON.stringify(b27Sig)}`);
  }

  // B26 — short hex signature (62 chars) → VALIDATION_FAILED without collection.
  const b26Env = signedEnvelope({
    eventId: `evt-b26-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const shortSig = evaluateValidatedPayloadCollection({
    payload: {
      ...b26Env,
      signatureHex: b26Env.signatureHex.slice(0, 62),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    shortSig.code === "VALIDATION_FAILED" &&
    shortSig.collectionAttempted === false &&
    honestyOk(shortSig)
  ) {
    details.push(
      "Short signature hex (B26, 62 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B26 short signature unexpectedly ${JSON.stringify(shortSig)}`);
  }

  // B25 — extended hex signature (65 chars) → VALIDATION_FAILED without collection.
  const b25Env = signedEnvelope({
    eventId: `evt-b25-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const extendedSig = evaluateValidatedPayloadCollection({
    payload: {
      ...b25Env,
      signatureHex: `${b25Env.signatureHex}a`,
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    extendedSig.code === "VALIDATION_FAILED" &&
    extendedSig.collectionAttempted === false &&
    honestyOk(extendedSig)
  ) {
    details.push(
      "Extended signature hex (B25, 65 chars) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B25 extended signature unexpectedly ${JSON.stringify(extendedSig)}`);
  }

  // B24 — truncated hex signature (not 64) → VALIDATION_FAILED without collection.
  const truncHexEnv = signedEnvelope({
    eventId: `evt-b24-${randomUUID().slice(0, 8)}`,
    kind: "lead.created",
  });
  const truncSig = evaluateValidatedPayloadCollection({
    payload: {
      ...truncHexEnv,
      signatureHex: truncHexEnv.signatureHex.slice(0, 63),
    },
    secret: FIXTURE_SECRET,
    collect: () => {
      throw new Error("collect must not run on VALIDATION_FAILED");
    },
  });
  if (
    truncSig.code === "VALIDATION_FAILED" &&
    truncSig.collectionAttempted === false &&
    honestyOk(truncSig)
  ) {
    details.push(
      "Truncated signature hex (B24) → VALIDATION_FAILED (collectionAttempted=false)",
    );
  } else {
    passed = false;
    details.push(`B24 trunc signature unexpectedly ${JSON.stringify(truncSig)}`);
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
