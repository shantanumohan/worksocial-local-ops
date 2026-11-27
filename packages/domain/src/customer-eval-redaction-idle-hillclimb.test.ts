import { describe, expect, it } from "vitest";
import {
  SoakProofKind,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "./soak-acceptance.js";
import {
  CUSTOMER_EVAL_LIVE_WIRING,
  CUSTOMER_EVAL_REDACTION_RELATED_CASE_IDS,
  assertCustomerEvalRedactionDecisionHonest,
  assertCustomerEvalRedactionIdempotent,
  assertEvalPromptCheckIdempotent,
  assertEvalPromptHasNoCustomerPii,
  reclaimCustomerEvalRedactionDecision,
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
  conversationId: "conv-jordan.lee@example.com-thread",
  intentLabel: "tour_request",
} as const;

function expectEvalHonesty(decision: {
  externalEffects: string;
  liveEvalWiring: string;
  liveProviderSuccessClaimed: boolean;
}): void {
  expect(decision.externalEffects).toBe("NONE");
  expect(decision.liveEvalWiring).toBe(CUSTOMER_EVAL_LIVE_WIRING);
  expect(decision.liveProviderSuccessClaimed).toBe(false);
}

describe("customer eval redaction idle hillclimb (T-X072)", () => {
  it("pins T-X072 proof map and honesty constants", () => {
    expect(expectedProofsForFixtureCase("T-X072")).toEqual([
      SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS),
    ).toEqual(["T-X072"]);
    expect(CUSTOMER_EVAL_LIVE_WIRING).toBe("NOT_WIRED");
  });

  it("idle N72: conversationId redacted and eval prompt withholds PII (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("REDACTED_FOR_EVAL");
    expect(decision.payload?.conversationId).not.toBe(source.conversationId);
    expect(decision.payload?.conversationId).toMatch(/REDACTED/);
    expectEvalHonesty(decision);

    const prompt = buildEvalSafePromptFromPayload(decision.payload!);
    expect(prompt).not.toMatch(/jordan\.lee@example\.com/i);
    expect(prompt).not.toMatch(/Jordan Lee/i);
    expect(prompt).not.toMatch(/conv-jordan\.lee@example\.com-thread/);
    const check = assertEvalPromptHasNoCustomerPii(prompt, {
      displayName: source.customerDisplayName,
      email: source.customerEmail,
      phone: source.customerPhone,
    });
    expect(check.ok).toBe(true);
    expect(check.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("idle N72: raw passthrough and unredacted phone fence (T-X072)", () => {
    const leak = prepareCustomerDataForEvaluation({
      source,
      mode: "raw_passthrough",
    });
    expect(leak.allowed).toBe(false);
    expect(leak.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expectEvalHonesty(leak);

    const rawPhone = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedCustomerPhoneInEval: true,
    });
    expect(rawPhone.allowed).toBe(false);
    expect(
      rawPhone.reasons.some((r) => /Unredacted customer phone/.test(r)),
    ).toBe(true);
    expectEvalHonesty(rawPhone);
  });

  it("wipe15 N73: unredacted email fence and redaction idempotency (T-X072)", () => {
    const rawEmail = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedCustomerEmailInEval: true,
    });
    expect(rawEmail.allowed).toBe(false);
    expect(
      rawEmail.reasons.some((r) => /Unredacted customer email/.test(r)),
    ).toBe(true);
    expectEvalHonesty(rawEmail);

    const idem = assertCustomerEvalRedactionIdempotent({ source, mode: "redact" });
    expect(idem.ok).toBe(true);
    expect(idem.reasons).toEqual([]);
  });

  it("retip N74: unredacted display name and conversationId fences (T-X072)", () => {
    const rawName = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedCustomerDisplayNameInEval: true,
    });
    expect(rawName.allowed).toBe(false);
    expect(
      rawName.reasons.some((r) => /Unredacted customer display name/.test(r)),
    ).toBe(true);
    expectEvalHonesty(rawName);

    const rawConv = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedConversationIdInEval: true,
    });
    expect(rawConv.allowed).toBe(false);
    expect(
      rawConv.reasons.some((r) => /Unredacted customer conversationId/.test(r)),
    ).toBe(true);
    expectEvalHonesty(rawConv);
  });

  it("retip N75: intentLabel fence and decision honesty on redact (T-X072)", () => {
    const rawIntent = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedIntentLabelInEval: true,
    });
    expect(rawIntent.allowed).toBe(false);
    expect(
      rawIntent.reasons.some((r) => /Unredacted customer intentLabel/.test(r)),
    ).toBe(true);
    expectEvalHonesty(rawIntent);

    const redacted = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    const honesty = assertCustomerEvalRedactionDecisionHonest(redacted);
    expect(honesty.ok).toBe(true);
    expect(honesty.code).toBe("HONEST");
  });

  it("wipe15 N76: messageBody fence and live-claim refusal (T-X072)", () => {
    const rawBody = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useUnredactedMessageBodyInEval: true,
    });
    expect(rawBody.allowed).toBe(false);
    expect(
      rawBody.reasons.some((r) => /Unredacted customer messageBody/.test(r)),
    ).toBe(true);
    expectEvalHonesty(rawBody);

    const verified = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      claimLiveVerified: true,
    });
    expect(verified.allowed).toBe(false);
    expect(verified.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expectEvalHonesty(verified);

    const fleet = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      requestLiveEvalFleet: true,
    });
    expect(fleet.allowed).toBe(false);
    expect(fleet.reasons.some((r) => /NOT_WIRED/.test(r))).toBe(true);
    expectEvalHonesty(fleet);
  });

  it("retip N77: reclaim drift and eval-prompt check idempotency (T-X072)", () => {
    const prior = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    const reclaim = reclaimCustomerEvalRedactionDecision(
      { source, mode: "redact" },
      prior,
    );
    expect(reclaim.ok).toBe(true);

    const blocked = prepareCustomerDataForEvaluation({
      source,
      mode: "raw_passthrough",
    });
    const drift = reclaimCustomerEvalRedactionDecision(
      { source, mode: "raw_passthrough" },
      { ...blocked, reasons: ["invented reason"] },
    );
    expect(drift.ok).toBe(false);
    expect(drift.reasons).toContain("reclaim block reasons drifted");

    const prompt = buildEvalSafePromptFromPayload(prior.payload!);
    const check = assertEvalPromptCheckIdempotent(prompt, {
      displayName: source.customerDisplayName,
      email: source.customerEmail,
      phone: source.customerPhone,
    });
    expect(check.ok).toBe(true);
    const pii = assertEvalPromptHasNoCustomerPii(prompt, {
      displayName: source.customerDisplayName,
      email: source.customerEmail,
      phone: source.customerPhone,
    });
    expect(pii.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("retip N78: text PII detect and redact helpers (T-X072)", () => {
    const known = {
      displayName: source.customerDisplayName,
      email: source.customerEmail,
      phone: source.customerPhone,
    };
    expect(containsRawCustomerPii(source.customerEmail, known)).toBe(true);
    expect(containsRawCustomerPii("tour_request only", known)).toBe(false);
    expect(redactTextForEvaluation(source.customerEmail)).toBe(
      "[REDACTED_EMAIL]",
    );
    expect(redactTextForEvaluation(source.messageBody, known)).not.toMatch(
      /jordan\.lee@example\.com/i,
    );
  });

  it("wipe15 N79: dual live-claim refusal and block idempotency (T-X072)", () => {
    const dual = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      claimLiveVerified: true,
      requestLiveEvalFleet: true,
    });
    expect(dual.allowed).toBe(false);
    expect(dual.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(dual.reasons.some((r) => /LIVE_CLAIM_REFUSED/.test(r))).toBe(true);
    expectEvalHonesty(dual);

    const blockIdem = assertCustomerEvalRedactionIdempotent({
      source,
      mode: "raw_passthrough",
    });
    expect(blockIdem.ok).toBe(true);
    expect(blockIdem.reasons).toEqual([]);
  });

  it("retip N80: dishonest liveProviderSuccessClaimed rejected (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.allowed).toBe(true);
    const tampered = {
      ...decision,
      liveProviderSuccessClaimed: true as false,
    };
    const honesty = assertCustomerEvalRedactionDecisionHonest(
      tampered as typeof decision,
    );
    expect(honesty.ok).toBe(false);
    expect(honesty.code).toBe("DISHONEST_LIVE_CLAIM");
    expectEvalHonesty(decision);
  });

  it("retip N81: dishonest externalEffects rejected (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    const tampered = {
      ...decision,
      externalEffects: "LIVE_EVAL" as typeof decision.externalEffects,
    };
    const honesty = assertCustomerEvalRedactionDecisionHonest(
      tampered as typeof decision,
    );
    expect(honesty.ok).toBe(false);
    expect(honesty.code).toBe("DISHONEST_LIVE_CLAIM");
    expect(honesty.reasons.some((r) => /externalEffects/.test(r))).toBe(true);
  });

  it("wipe15 N82: intentLabel PII block and clean label preserve (T-X072)", () => {
    const leak = prepareCustomerDataForEvaluation({
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
    expect(leak.allowed).toBe(false);
    expect(leak.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expectEvalHonesty(leak);

    const clean = prepareCustomerDataForEvaluation({
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
    expect(clean.allowed).toBe(true);
    expect(clean.payload?.intentLabel).toBe("tour_request");
    expect(clean.payload?.redactedFields).not.toContain("intentLabel");
    expectEvalHonesty(clean);
  });

  it("retip N83: no-PII redact and conversationId email embed (T-X072)", () => {
    const anon = prepareCustomerDataForEvaluation({
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
    expect(anon.allowed).toBe(true);
    expect(anon.payload?.redactedFields).toEqual([]);
    expect(anon.reasons.some((r) => /No identifiable/.test(r))).toBe(true);
    expectEvalHonesty(anon);

    const conv = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        conversationId: "thread-jordan.lee@example.com",
      },
      mode: "redact",
    });
    expect(conv.allowed).toBe(true);
    expect(conv.payload?.conversationId).toMatch(/\[REDACTED_EMAIL\]/);
    expect(conv.payload?.redactedFields).toContain("conversationId");
    const prompt = buildEvalSafePromptFromPayload(conv.payload!);
    expect(prompt).not.toMatch(/jordan\.lee@example\.com/i);
  });

  it("retip N84: skipRedactionForEval refused (T-X072)", () => {
    const skip = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      skipRedactionForEval: true,
    });
    expect(skip.allowed).toBe(false);
    expect(skip.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(skip.reasons.some((r) => /Skip redaction/.test(r))).toBe(true);
    expectEvalHonesty(skip);
  });

  it("retip N85: dishonest liveEvalWiring rejected (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    const tampered = {
      ...decision,
      liveEvalWiring: "WIRED" as typeof decision.liveEvalWiring,
    };
    const honesty = assertCustomerEvalRedactionDecisionHonest(
      tampered as typeof decision,
    );
    expect(honesty.ok).toBe(false);
    expect(honesty.code).toBe("DISHONEST_LIVE_CLAIM");
    expect(honesty.reasons.some((r) => /liveEvalWiring/.test(r))).toBe(true);
  });

  it("wipe15 N86: related case export pin (T-X072)", () => {
    expect(CUSTOMER_EVAL_REDACTION_RELATED_CASE_IDS).toEqual(["T-X072"]);
  });

  it("retip N87: name-in-body redact and prompt PII block (T-X072)", () => {
    const nameInBody = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        messageBody: "I'm Jordan Lee — please book Suite B.",
      },
      mode: "redact",
    });
    expect(nameInBody.allowed).toBe(true);
    expect(nameInBody.payload?.messageBody).not.toMatch(/Jordan Lee/i);
    expect(nameInBody.payload?.redactedFields).toContain("messageBody");
    expectEvalHonesty(nameInBody);

    const dirtyPrompt = `contact ${source.customerEmail}`;
    const pii = assertEvalPromptHasNoCustomerPii(dirtyPrompt, {
      email: source.customerEmail,
    });
    expect(pii.ok).toBe(false);
    const idem = assertEvalPromptCheckIdempotent(dirtyPrompt, {
      email: source.customerEmail,
    });
    expect(idem.ok).toBe(true);
  });

  it("retip N88: intentLabel email redact in payload (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        intentLabel: "email jordan.lee@example.com for tour",
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    expect(decision.payload?.intentLabel).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload?.redactedFields).toContain("intentLabel");
    const prompt = buildEvalSafePromptFromPayload(decision.payload!);
    expect(prompt).not.toMatch(/jordan\.lee@example\.com/i);
    expectEvalHonesty(decision);
  });

  it("wipe15 N89: phone redact in free text (T-X072)", () => {
    const redacted = redactTextForEvaluation(source.messageBody, {
      displayName: source.customerDisplayName,
      email: source.customerEmail,
      phone: source.customerPhone,
    });
    expect(redacted).not.toMatch(/415\s*555/i);
    expect(redacted).toMatch(/\[REDACTED_PHONE\]/);
    expect(containsRawCustomerPii(redacted, {
      displayName: source.customerDisplayName,
      email: source.customerEmail,
      phone: source.customerPhone,
    })).toBe(false);
  });

  it("retip N90: reclaim matches fresh redact decision (T-X072)", () => {
    const fresh = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    const reclaim = reclaimCustomerEvalRedactionDecision(
      { source, mode: "redact" },
      fresh,
    );
    expect(reclaim.ok).toBe(true);
    expect(reclaim.reasons).toEqual([]);
    expectEvalHonesty(fresh);
  });

  it("retip N91: displayName tokenized in redact payload (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.allowed).toBe(true);
    expect(decision.payload?.customerDisplayName).toBe("[REDACTED_NAME]");
    expect(decision.payload?.redactedFields).toContain("customerDisplayName");
    const idem = assertCustomerEvalRedactionIdempotent({ source, mode: "redact" });
    expect(idem.ok).toBe(true);
    expectEvalHonesty(decision);
  });

  it("wipe15 N92: email and phone tokenized in payload (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.payload?.customerEmail).toBe("[REDACTED_EMAIL]");
    expect(decision.payload?.customerPhone).toBe("[REDACTED_PHONE]");
    expect(decision.payload?.redactedFields).toEqual(
      expect.arrayContaining(["customerEmail", "customerPhone"]),
    );
    const check = assertEvalPromptHasNoCustomerPii(
      buildEvalSafePromptFromPayload(decision.payload!),
      {
        displayName: source.customerDisplayName,
        email: source.customerEmail,
        phone: source.customerPhone,
      },
    );
    expect(check.ok).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N93: redacted flag and intentLabel on standard redact (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("REDACTED_FOR_EVAL");
    expect(decision.payload?.redacted).toBe(true);
    expect(decision.payload?.intentLabel).toBe("tour_request");
    expect(decision.reasons.some((r) => /Redacted fields for evaluation/.test(r))).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N94: stale payload and mirror-raw fences (T-X072)", () => {
    const stale = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      reuseStaleRedactedEvalPayload: true,
    });
    expect(stale.allowed).toBe(false);
    expect(stale.reasons.some((r) => /stale redacted/.test(r))).toBe(true);
    expectEvalHonesty(stale);

    const mirror = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      mirrorRawFieldsInRedactedPayload: true,
    });
    expect(mirror.allowed).toBe(false);
    expect(mirror.reasons.some((r) => /Mirror raw/.test(r))).toBe(true);
    expectEvalHonesty(mirror);
  });

  it("wipe15 N95: degrade passthrough and eval-without-fence refused (T-X072)", () => {
    const degrade = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      degradeToRawPassthrough: true,
    });
    expect(degrade.allowed).toBe(false);
    expect(degrade.reasons.some((r) => /Degrade redact/.test(r))).toBe(true);
    expectEvalHonesty(degrade);

    const naked = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      useEvalOnlyWithoutRedactionFence: true,
    });
    expect(naked.allowed).toBe(false);
    expect(naked.reasons.some((r) => /redaction fence/.test(r))).toBe(true);
    expectEvalHonesty(naked);
  });

  it("retip N96: PII scan skip, optional redaction, trust-source refused (T-X072)", () => {
    const skip = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      skipEvalPromptPiiScan: true,
    });
    expect(skip.allowed).toBe(false);
    expect(skip.reasons.some((r) => /PII scan/.test(r))).toBe(true);
    expectEvalHonesty(skip);

    const optional = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      claimRedactionOptional: true,
    });
    expect(optional.allowed).toBe(false);
    expect(optional.reasons.some((r) => /Optional customer redaction/.test(r))).toBe(
      true,
    );
    expectEvalHonesty(optional);

    const trust = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      trustUnredactedSourceAsSafe: true,
    });
    expect(trust.allowed).toBe(false);
    expect(trust.reasons.some((r) => /Trust unredacted/.test(r))).toBe(true);
    expectEvalHonesty(trust);
  });
});