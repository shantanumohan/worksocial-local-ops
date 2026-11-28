import { describe, expect, it } from "vitest";
import {
  evaluateValidatedPayloadCollection,
  fixtureWebhookSignature,
} from "./validated-payload-collection.js";

const secret = "fixture-webhook-secret-tx070";

function signedBody(bodyObj: Record<string, unknown>) {
  const body = JSON.stringify(bodyObj);
  return {
    body,
    signatureHex: fixtureWebhookSignature(body, secret),
    eventId: String(bodyObj.eventId ?? "evt-missing"),
  };
}

function expectHonesty(
  decision: ReturnType<typeof evaluateValidatedPayloadCollection>,
) {
  expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  expect(decision.externalEffects).toBe("NONE");
}

describe("validated payload collection (T-X070)", () => {
  it("collects when signature+schema validate and collector succeeds", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-ok",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex },
      secret,
      collect: () => ({ ok: true, recordId: "rec-1" }),
    });
    expect(decision.code).toBe("COLLECTED");
    expect(decision.validated).toBe(true);
    expect(decision.collected).toBe(true);
    expect(decision.collectionAttempted).toBe(true);
    expect(decision.recordId).toBe("rec-1");
    expectHonesty(decision);
  });

  it("reports VALIDATION_FAILED on bad signature without collecting", () => {
    const { body, eventId } = signedBody({
      eventId: "evt-sig",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex: "00".repeat(32) },
      secret,
      collect: () => {
        throw new Error("collect must not run");
      },
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.validated).toBe(false);
    expect(decision.collected).toBe(false);
    expect(decision.collectionAttempted).toBe(false);
    expect(decision.recordId).toBeNull();
    expectHonesty(decision);
  });

  it("rejects non-64-hex signature length (T-X070 B24)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-len",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 63),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 65-char hex signature (one nibble past spec) (T-X070 B25)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b25",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: `${signatureHex}a`,
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 62-char hex signature (two nibbles short) (T-X070 B26)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b26",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 62),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 61-char hex signature (three nibbles short) (T-X070 B27)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b27",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 61),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 60-char hex signature (four nibbles short) (T-X070 B28)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b28",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 60),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 59-char hex signature (five nibbles short) (T-X070 B29)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b29",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 59),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 58-char hex signature (six nibbles short) (T-X070 B30)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b30",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 58),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 57-char hex signature (seven nibbles short) (T-X070 B31)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b31",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 57),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 56-char hex signature (eight nibbles short) (T-X070 B32)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b32",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 56),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 55-char hex signature (nine nibbles short) (T-X070 B33)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b33",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 55),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 54-char hex signature (ten nibbles short) (T-X070 B34)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b34",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 54),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 53-char hex signature (eleven nibbles short) (T-X070 B35)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b35",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 53),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 52-char hex signature (twelve nibbles short) (T-X070 B36)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b36",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 52),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 51-char hex signature (thirteen nibbles short) (T-X070 B37)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b37",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 51),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 50-char hex signature (fourteen nibbles short) (T-X070 B38)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b38",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 50),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 49-char hex signature (fifteen nibbles short) (T-X070 B39)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b39",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 49),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 48-char hex signature (sixteen nibbles short) (T-X070 B40)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b40",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 48),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 47-char hex signature (seventeen nibbles short) (T-X070 B41)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b41",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 47),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 46-char hex signature (eighteen nibbles short) (T-X070 B42)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b42",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 46),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 45-char hex signature (nineteen nibbles short) (T-X070 B43)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b43",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 45),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 44-char hex signature (twenty nibbles short) (T-X070 B44)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b44",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 44),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 43-char hex signature (twenty-one nibbles short) (T-X070 B45)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b45",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 43),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 42-char hex signature (twenty-two nibbles short) (T-X070 B46)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b46",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 42),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects 41-char hex signature (twenty-three nibbles short) (T-X070 B47)", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-b47",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId,
        body,
        signatureHex: signatureHex.slice(0, 41),
      },
      secret,
      collect: () => ({ ok: true, recordId: "must-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects signature with non-hex suffix even when prefix matches", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-suffix",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex: `${signatureHex}zz` },
      secret,
      collect: () => ({ ok: true, recordId: "should-not-collect" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("reports COLLECTION_FAILED when validated but durable write fails", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-coll",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex },
      secret,
      collect: () => ({ ok: false, reason: "durable store full" }),
    });
    expect(decision.code).toBe("COLLECTION_FAILED");
    expect(decision.validated).toBe(true);
    expect(decision.collected).toBe(false);
    expect(decision.collectionAttempted).toBe(true);
    expect(decision.recordId).toBeNull();
    expect(decision.reasons.some((r) => /COLLECTION_FAILED/.test(r))).toBe(
      true,
    );
    expect(decision.reasons.some((r) => /not VALIDATION_FAILED/.test(r))).toBe(
      true,
    );
    expectHonesty(decision);
  });

  it("maps thrown collector errors to COLLECTION_FAILED", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-throw",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex },
      secret,
      collect: () => {
        throw new Error("disk full");
      },
    });
    expect(decision.code).toBe("COLLECTION_FAILED");
    expect(decision.validated).toBe(true);
    expect(decision.collected).toBe(false);
    expect(decision.collectionAttempted).toBe(true);
    expect(decision.reasons.some((r) => /disk full/.test(r))).toBe(true);
    expectHonesty(decision);
  });

  it("maps empty collector recordId to COLLECTION_FAILED", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-empty-id",
      kind: "lead.created",
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex },
      secret,
      collect: () => ({ ok: true, recordId: "   " }),
    });
    expect(decision.code).toBe("COLLECTION_FAILED");
    expect(decision.validated).toBe(true);
    expect(decision.collected).toBe(false);
    expect(decision.collectionAttempted).toBe(true);
    expect(decision.recordId).toBeNull();
    expectHonesty(decision);
  });

  it("rejects non-string body eventId", () => {
    const body = JSON.stringify({ eventId: 42, kind: "lead.created" });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId: "42",
        body,
        signatureHex: fixtureWebhookSignature(body, secret),
      },
      secret,
      collect: () => ({ ok: true, recordId: "nope" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects envelope/body eventId mismatch without collecting", () => {
    const body = JSON.stringify({ eventId: "evt-body", kind: "lead.created" });
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId: "evt-envelope",
        body,
        signatureHex: fixtureWebhookSignature(body, secret),
      },
      secret,
      collect: () => {
        throw new Error("collect must not run");
      },
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expect(decision.reasons.some((r) => /does not match/.test(r))).toBe(true);
    expectHonesty(decision);
  });

  it("rejects non-object JSON body (array) as VALIDATION_FAILED", () => {
    const body = JSON.stringify([{ eventId: "evt-arr", kind: "lead.created" }]);
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId: "evt-arr",
        body,
        signatureHex: fixtureWebhookSignature(body, secret),
      },
      secret,
      collect: () => ({ ok: true, recordId: "nope" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("rejects invalid JSON body as VALIDATION_FAILED", () => {
    const body = "{not-json";
    const decision = evaluateValidatedPayloadCollection({
      payload: {
        eventId: "evt-badjson",
        body,
        signatureHex: fixtureWebhookSignature(body, secret),
      },
      secret,
      collect: () => ({ ok: true, recordId: "nope" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.collectionAttempted).toBe(false);
    expectHonesty(decision);
  });

  it("uses trusted requiredFields config, not payload metadata", () => {
    const { body, signatureHex, eventId } = signedBody({
      eventId: "evt-schema",
      // kind intentionally omitted
    });
    const decision = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex },
      secret,
      requiredFields: ["eventId", "kind"],
      collect: () => ({ ok: true, recordId: "nope" }),
    });
    expect(decision.code).toBe("VALIDATION_FAILED");
    expect(decision.reasons.some((r) => /kind/.test(r))).toBe(true);
    expectHonesty(decision);
  });

  it("keeps VALIDATION_FAILED and COLLECTION_FAILED as distinct codes", () => {
    const badSig = evaluateValidatedPayloadCollection({
      payload: {
        eventId: "e1",
        body: "{}",
        signatureHex: "deadbeef",
      },
      secret,
      collect: () => ({ ok: true, recordId: "x" }),
    });
    const { body, signatureHex, eventId } = signedBody({
      eventId: "e2",
      kind: "lead.created",
    });
    const badCollect = evaluateValidatedPayloadCollection({
      payload: { eventId, body, signatureHex },
      secret,
      collect: () => ({ ok: false, reason: "write denied" }),
    });
    expect(badSig.code).toBe("VALIDATION_FAILED");
    expect(badCollect.code).toBe("COLLECTION_FAILED");
    expect(badSig.code).not.toBe(badCollect.code);
    expectHonesty(badSig);
    expectHonesty(badCollect);
  });
});
