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
  });
});
