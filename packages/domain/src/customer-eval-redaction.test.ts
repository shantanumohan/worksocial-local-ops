import { describe, expect, it } from "vitest";
import {
  assertEvalPromptHasNoCustomerPii,
  containsRawCustomerPii,
  prepareCustomerDataForEvaluation,
  redactTextForEvaluation,
} from "./customer-eval-redaction.js";

const source = {
  customerDisplayName: "Jordan Lee",
  customerEmail: "jordan.lee@example.com",
  customerPhone: "+1 (415) 555-0199",
  messageBody:
    "Please call me at +1 (415) 555-0199 or email jordan.lee@example.com about Suite B.",
  conversationId: "conv-fixture-1",
  intentLabel: "tour_request",
};

describe("customer eval redaction (T-X072)", () => {
  it("redacts customer fields for evaluation", () => {
    const decision = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("REDACTED_FOR_EVAL");
    expect(decision.payload?.redacted).toBe(true);
    expect(decision.payload?.customerDisplayName).toBe("[REDACTED_NAME]");
    expect(decision.payload?.customerEmail).toBe("[REDACTED_EMAIL]");
    expect(decision.payload?.customerPhone).toBe("[REDACTED_PHONE]");
    expect(decision.payload?.messageBody).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload?.messageBody).not.toMatch(/415\s*555/i);
    expect(decision.payload?.intentLabel).toBe("tour_request");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("redacts display name when embedded in messageBody", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        messageBody: "I'm Jordan Lee — please book Suite B.",
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.payload?.messageBody).not.toMatch(/Jordan Lee/i);
    expect(decision.payload?.messageBody).toMatch(/\[REDACTED_NAME\]/);
  });

  it("blocks raw passthrough of customer PII into evaluation", () => {
    const decision = prepareCustomerDataForEvaluation({
      source,
      mode: "raw_passthrough",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(decision.payload).toBeNull();
    expect(decision.reasons.some((r) => /T-X072/.test(r))).toBe(true);
  });

  it("detects and redacts PII in free text including known names", () => {
    const known = { displayName: "Jordan Lee" };
    expect(containsRawCustomerPii("reach a@b.co")).toBe(true);
    expect(containsRawCustomerPii("I'm Jordan Lee", known)).toBe(true);
    expect(redactTextForEvaluation("reach a@b.co")).toBe(
      "reach [REDACTED_EMAIL]",
    );
    expect(redactTextForEvaluation("I'm Jordan Lee", known)).toBe(
      "I'm [REDACTED_NAME]",
    );
    const clean = assertEvalPromptHasNoCustomerPii(
      "Judge fixture answer for tour_request without customer identifiers",
      known,
    );
    expect(clean.ok).toBe(true);
    const dirtyEmail = assertEvalPromptHasNoCustomerPii(
      "Judge reply for jordan.lee@example.com",
    );
    expect(dirtyEmail.ok).toBe(false);
    expect(dirtyEmail.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    const dirtyName = assertEvalPromptHasNoCustomerPii(
      "Judge reply mentioning Jordan Lee",
      known,
    );
    expect(dirtyName.ok).toBe(false);
    expect(dirtyName.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
  });
});
