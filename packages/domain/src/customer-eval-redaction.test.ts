import { describe, expect, it } from "vitest";
import {
  CUSTOMER_EVAL_LIVE_WIRING,
  assertCustomerEvalRedactionDecisionHonest,
  assertCustomerEvalRedactionIdempotent,
  reclaimCustomerEvalRedactionDecision,
  assertEvalPromptCheckIdempotent,
  assertEvalPromptHasNoCustomerPii,
  buildEvalSafePromptFromPayload,
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
    expect(decision.liveEvalWiring).toBe(CUSTOMER_EVAL_LIVE_WIRING);
    expect(decision.liveProviderSuccessClaimed).toBe(false);
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

  it("redacts PII embedded in intentLabel", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        intentLabel: "follow_up jordan.lee@example.com",
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.payload?.intentLabel).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload?.intentLabel).toMatch(/\[REDACTED_EMAIL\]/);
    expect(decision.payload?.redactedFields).toContain("intentLabel");
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
    expect(decision.liveEvalWiring).toBe("NOT_WIRED");
    expect(decision.liveProviderSuccessClaimed).toBe(false);
  });

  it("blocks raw passthrough when only intentLabel carries PII", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        customerDisplayName: "   ",
        customerEmail: null,
        customerPhone: null,
        messageBody: "Looking for a day pass.",
        conversationId: "conv-clean",
        intentLabel: "reach me at jordan.lee@example.com",
      },
      mode: "raw_passthrough",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
  });

  it("allows redact mode when source has no identifiable PII", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        customerDisplayName: "  ",
        customerEmail: null,
        customerPhone: null,
        messageBody: "Generic fixture question about hours.",
        conversationId: "conv-anon",
        intentLabel: "hours_question",
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("REDACTED_FOR_EVAL");
    expect(decision.payload?.redacted).toBe(true);
    expect(decision.payload?.customerEmail).toBeNull();
    expect(decision.payload?.customerPhone).toBeNull();
    expect(decision.payload?.redactedFields).toEqual([]);
    expect(decision.reasons.some((r) => /No identifiable/.test(r))).toBe(true);
  });

  it("reclaim refuses tampered prior decision drift", () => {
    const prior = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(prior.allowed).toBe(true);
    const ok = reclaimCustomerEvalRedactionDecision(
      { source, mode: "redact" },
      prior,
    );
    expect(ok.ok).toBe(true);

    const blocked = prepareCustomerDataForEvaluation({
      source,
      mode: "raw_passthrough",
    });
    expect(blocked.allowed).toBe(false);
    const tampered = {
      ...blocked,
      reasons: ["invented reason"],
    };
    const drift = reclaimCustomerEvalRedactionDecision(
      { source, mode: "raw_passthrough" },
      tampered,
    );
    expect(drift.ok).toBe(false);
    expect(drift.reasons).toContain("reclaim block reasons drifted");
  });

  it("refuses useUnredactedCustomerEmailInEval", () => {
    const rawEmail = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedCustomerEmailInEval: true,
    });
    expect(rawEmail.allowed).toBe(false);
    expect(rawEmail.reasons.some((r) => /Unredacted customer email/.test(r))).toBe(
      true,
    );
  });

  it("refuses useUnredactedConversationIdInEval", () => {
    const rawConv = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedConversationIdInEval: true,
    });
    expect(rawConv.allowed).toBe(false);
    expect(
      rawConv.reasons.some((r) => /Unredacted customer conversationId/.test(r)),
    ).toBe(true);
  });

  it("refuses useUnredactedIntentLabelInEval", () => {
    const rawIntent = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedIntentLabelInEval: true,
    });
    expect(rawIntent.allowed).toBe(false);
    expect(
      rawIntent.reasons.some((r) => /Unredacted customer intentLabel/.test(r)),
    ).toBe(true);
  });

  it("refuses useUnredactedMessageBodyInEval", () => {
    const rawBody = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedMessageBodyInEval: true,
    });
    expect(rawBody.allowed).toBe(false);
    expect(
      rawBody.reasons.some((r) => /Unredacted customer messageBody/.test(r)),
    ).toBe(true);
  });

  it("refuses stripRedactionTokensFromEvalPrompt", () => {
    const strip = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      stripRedactionTokensFromEvalPrompt: true,
    });
    expect(strip.allowed).toBe(false);
    expect(strip.reasons.some((r) => /Strip redaction tokens/.test(r))).toBe(true);
  });

  it("refuses deferCustomerRedactionUntilAfterEval", () => {
    const deferred = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      deferCustomerRedactionUntilAfterEval: true,
    });
    expect(deferred.allowed).toBe(false);
    expect(
      deferred.reasons.some((r) => /Defer customer redaction/.test(r)),
    ).toBe(true);
  });

  it("refuses allowPartialRedactionForEval", () => {
    const partial = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      allowPartialRedactionForEval: true,
    });
    expect(partial.allowed).toBe(false);
    expect(partial.reasons.some((r) => /Partial customer redaction/.test(r))).toBe(
      true,
    );
  });

  it("refuses reuseStaleRedactedEvalPayload", () => {
    const stale = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      reuseStaleRedactedEvalPayload: true,
    });
    expect(stale.allowed).toBe(false);
    expect(stale.reasons.some((r) => /stale redacted/.test(r))).toBe(true);
  });

  it("refuses useEvalOnlyWithoutRedactionFence", () => {
    const naked = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useEvalOnlyWithoutRedactionFence: true,
    });
    expect(naked.allowed).toBe(false);
    expect(naked.reasons.some((r) => /redaction fence/.test(r))).toBe(true);
  });

  it("refuses skipEvalPromptPiiScan", () => {
    const skip = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      skipEvalPromptPiiScan: true,
    });
    expect(skip.allowed).toBe(false);
    expect(skip.reasons.some((r) => /PII scan/.test(r))).toBe(true);
  });

  it("refuses trustUnredactedSourceAsSafe", () => {
    const trust = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      trustUnredactedSourceAsSafe: true,
    });
    expect(trust.allowed).toBe(false);
    expect(trust.reasons.some((r) => /Trust unredacted/.test(r))).toBe(true);
  });

  it("refuses claimRedactionOptional", () => {
    const optional = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      claimRedactionOptional: true,
    });
    expect(optional.allowed).toBe(false);
    expect(optional.reasons.some((r) => /Optional customer redaction/.test(r))).toBe(
      true,
    );
  });

  it("refuses mirrorRawFieldsInRedactedPayload", () => {
    const mirror = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      mirrorRawFieldsInRedactedPayload: true,
    });
    expect(mirror.allowed).toBe(false);
    expect(mirror.reasons.some((r) => /Mirror raw/.test(r))).toBe(true);
  });

  it("refuses degradeToRawPassthrough", () => {
    const degrade = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      degradeToRawPassthrough: true,
    });
    expect(degrade.allowed).toBe(false);
    expect(degrade.reasons.some((r) => /Degrade redact/.test(r))).toBe(true);
  });

  it("refuses buildPromptFromRawSource", () => {
    const rawPrompt = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      buildPromptFromRawSource: true,
    });
    expect(rawPrompt.allowed).toBe(false);
    expect(rawPrompt.reasons.some((r) => /raw customer source/i.test(r))).toBe(
      true,
    );
  });

  it("refuses bypassStructuredFieldRedaction", () => {
    const bypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassStructuredFieldRedaction: true,
    });
    expect(bypass.allowed).toBe(false);
    expect(bypass.reasons.some((r) => /structured customer field/i.test(r))).toBe(
      true,
    );
  });

  it("refuses bypassMessageBodyRedaction", () => {
    const bypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassMessageBodyRedaction: true,
    });
    expect(bypass.allowed).toBe(false);
    expect(bypass.reasons.some((r) => /messageBody/.test(r))).toBe(true);
  });

  it("refuses bypassIntentLabelRedaction", () => {
    const bypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassIntentLabelRedaction: true,
    });
    expect(bypass.allowed).toBe(false);
    expect(bypass.reasons.some((r) => /intentLabel/.test(r))).toBe(true);
  });

  it("refuses bypassConversationIdRedaction", () => {
    const bypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassConversationIdRedaction: true,
    });
    expect(bypass.allowed).toBe(false);
    expect(bypass.reasons.some((r) => /conversationId/.test(r))).toBe(true);
  });

  it("refuses allowResidualPiiInPayload", () => {
    const waive = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      allowResidualPiiInPayload: true,
    });
    expect(waive.allowed).toBe(false);
    expect(waive.reasons.some((r) => /residual PII/i.test(r))).toBe(true);
  });

  it("refuses exportToLiveProvider", () => {
    const live = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      exportToLiveProvider: true,
    });
    expect(live.allowed).toBe(false);
    expect(live.reasons.some((r) => /NOT_WIRED/.test(r))).toBe(true);
  });

  it("refuses skipRedactionForEval", () => {
    const skip = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      skipRedactionForEval: true,
    });
    expect(skip.allowed).toBe(false);
    expect(skip.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(skip.reasons.some((r) => /Skip redaction/.test(r))).toBe(true);
  });

  it("refuses forceDeliverDespiteLeak", () => {
    const forced = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      forceDeliverDespiteLeak: true,
    });
    expect(forced.allowed).toBe(false);
    expect(forced.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(forced.reasons.some((r) => /Force-deliver/.test(r))).toBe(true);
  });

  it("refuses simultaneous claimLiveVerified and requestLiveEvalFleet", () => {
    const dual = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      claimLiveVerified: true,
      requestLiveEvalFleet: true,
    });
    expect(dual.allowed).toBe(false);
    expect(dual.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(dual.reasons.some((r) => /LIVE_CLAIM_REFUSED/.test(r))).toBe(true);
  });

  it("reapply is idempotent for redact and block paths", () => {
    const redactOk = assertCustomerEvalRedactionIdempotent({
      source,
      mode: "redact",
    });
    expect(redactOk.ok).toBe(true);
    const rawBlock = assertCustomerEvalRedactionIdempotent({
      source,
      mode: "raw_passthrough",
    });
    expect(rawBlock.ok).toBe(true);

    const first = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    if (!first.allowed || !first.payload) throw new Error("expected redact");
    const tampered = {
      ...first,
      liveProviderSuccessClaimed: true as false,
    };
    const honesty = assertCustomerEvalRedactionDecisionHonest(
      tampered as typeof first,
    );
    expect(honesty.ok).toBe(false);
    expect(honesty.code).toBe("DISHONEST_LIVE_CLAIM");
  });

  it("refuses claimLiveVerified and requestLiveEvalFleet", () => {
    const verified = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      claimLiveVerified: true,
    });
    expect(verified.allowed).toBe(false);
    expect(verified.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(verified.reasons.some((r) => /VERIFIED/.test(r))).toBe(true);

    const fleet = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      requestLiveEvalFleet: true,
    });
    expect(fleet.allowed).toBe(false);
    expect(fleet.reasons.some((r) => /NOT_WIRED/.test(r))).toBe(true);
    expect(fleet.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("builds eval-safe prompts only from redacted payloads", () => {
    const decision = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.allowed || !decision.payload) return;
    const prompt = buildEvalSafePromptFromPayload(decision.payload);
    expect(prompt).not.toMatch(/jordan\.lee@example\.com/i);
    expect(prompt).not.toMatch(/Jordan Lee/i);
    expect(prompt).not.toMatch(/conv-fixture-1/);
    expect(prompt).toMatch(/\[REDACTED_NAME\]/);
    expect(prompt).toMatch(/\[REDACTED_CONVERSATION_ID\]/);
    const check = assertEvalPromptHasNoCustomerPii(prompt, {
      displayName: source.customerDisplayName,
      email: source.customerEmail,
      phone: source.customerPhone,
    });
    expect(check.ok).toBe(true);
    expect(check.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("does not substring-redact clean intent labels against short display names", () => {
    const decision = prepareCustomerDataForEvaluation({
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
    expect(decision.allowed).toBe(true);
    expect(decision.payload?.intentLabel).toBe("tour_request");
    expect(decision.payload?.redactedFields).not.toContain("intentLabel");
  });

  it("redacts conversationId when it embeds customer email", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        conversationId: "thread-jordan.lee@example.com",
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.payload?.conversationId).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload?.conversationId).toMatch(/\[REDACTED_EMAIL\]/);
    expect(decision.payload?.redactedFields).toContain("conversationId");
    if (!decision.payload) return;
    const prompt = buildEvalSafePromptFromPayload(decision.payload);
    expect(prompt).not.toMatch(/jordan\.lee@example\.com/i);
    expect(prompt).toMatch(/\[REDACTED_CONVERSATION_ID\]/);
  });

  it("prompt PII check is idempotent", () => {
    const clean = assertEvalPromptCheckIdempotent(
      "Judge fixture answer for tour_request",
      { displayName: source.customerDisplayName },
    );
    expect(clean.ok).toBe(true);
    const dirty = assertEvalPromptCheckIdempotent(
      `mention ${source.customerEmail}`,
      { email: source.customerEmail },
    );
    expect(dirty.ok).toBe(true);
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
    expect(redactTextForEvaluation("call 415.555.0199")).toMatch(
      /\[REDACTED_PHONE\]/,
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
