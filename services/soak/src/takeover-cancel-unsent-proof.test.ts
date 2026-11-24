import { describe, expect, it } from "vitest";
import { proofTakeoverCancelsUnsentReplies } from "./takeover-cancel-unsent-proof.js";

describe("proofTakeoverCancelsUnsentReplies", () => {
  it("passes with VERSION_MISMATCH via real takeover and multi-queue cancel", () => {
    const proof = proofTakeoverCancelsUnsentReplies("2026-11-21T19:00:00.000Z");
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(
      proof.details.some((d) =>
        d.includes("VERSION_MISMATCH (stale preparedAtVersion via applyConversationTakeover)"),
      ),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("Multi-queue"))).toBe(true);
    expect(proof.details.some((d) => d.includes("SENT message preserved"))).toBe(
      true,
    );
    expect(
      proof.details.some((d) =>
        d.includes("CONVERSATION_TAKEOVER at matching version"),
      ),
    ).toBe(true);
  });
});
