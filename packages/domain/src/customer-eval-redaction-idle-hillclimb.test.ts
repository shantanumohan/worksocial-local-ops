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

  it("continue N97: raw prompt and structured bypass refused (T-X072)", () => {
    const rawPrompt = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      buildPromptFromRawSource: true,
    });
    expect(rawPrompt.allowed).toBe(false);
    expect(rawPrompt.reasons.some((r) => /raw customer source/i.test(r))).toBe(true);
    expectEvalHonesty(rawPrompt);

    const bypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassStructuredFieldRedaction: true,
    });
    expect(bypass.allowed).toBe(false);
    expect(bypass.reasons.some((r) => /structured customer field/i.test(r))).toBe(
      true,
    );
    expectEvalHonesty(bypass);
  });

  it("retip N98: messageBody and intentLabel bypass refused (T-X072)", () => {
    const bodyBypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassMessageBodyRedaction: true,
    });
    expect(bodyBypass.allowed).toBe(false);
    expect(bodyBypass.reasons.some((r) => /messageBody/.test(r))).toBe(true);
    expectEvalHonesty(bodyBypass);

    const intentBypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassIntentLabelRedaction: true,
    });
    expect(intentBypass.allowed).toBe(false);
    expect(intentBypass.reasons.some((r) => /intentLabel/.test(r))).toBe(true);
    expectEvalHonesty(intentBypass);
  });

  it("retip N99: conversationId bypass and residual PII refused (T-X072)", () => {
    const convBypass = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      bypassConversationIdRedaction: true,
    });
    expect(convBypass.allowed).toBe(false);
    expect(convBypass.reasons.some((r) => /conversationId/.test(r))).toBe(true);
    expectEvalHonesty(convBypass);

    const residual = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      allowResidualPiiInPayload: true,
    });
    expect(residual.allowed).toBe(false);
    expect(residual.reasons.some((r) => /residual PII/i.test(r))).toBe(true);
    expectEvalHonesty(residual);
  });

  it("edge-deepen N100: strip/defer/partial and live-export fences refused (T-X072)", () => {
    const strip = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      stripRedactionTokensFromEvalPrompt: true,
    });
    expect(strip.allowed).toBe(false);
    expect(strip.reasons.some((r) => /Strip redaction tokens/.test(r))).toBe(true);
    expectEvalHonesty(strip);

    const defer = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      deferCustomerRedactionUntilAfterEval: true,
    });
    expect(defer.allowed).toBe(false);
    expect(defer.reasons.some((r) => /Defer customer redaction/.test(r))).toBe(true);
    expectEvalHonesty(defer);

    const partial = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      allowPartialRedactionForEval: true,
    });
    expect(partial.allowed).toBe(false);
    expect(partial.reasons.some((r) => /Partial customer redaction/.test(r))).toBe(
      true,
    );
    expectEvalHonesty(partial);

    const exportLive = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      exportToLiveProvider: true,
    });
    expect(exportLive.allowed).toBe(false);
    expect(exportLive.reasons.some((r) => /NOT_WIRED/.test(r))).toBe(true);
    expectEvalHonesty(exportLive);

    const forceDeliver = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      forceDeliverDespiteLeak: true,
    });
    expect(forceDeliver.allowed).toBe(false);
    expect(forceDeliver.reasons.some((r) => /Force-deliver/.test(r))).toBe(true);
    expectEvalHonesty(forceDeliver);
  });

  it("retip N101: live VERIFIED and fleet wiring refused (T-X072)", () => {
    const verified = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      claimLiveVerified: true,
    });
    expect(verified.allowed).toBe(false);
    expect(verified.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(verified.reasons.some((r) => /VERIFIED/.test(r))).toBe(true);
    expectEvalHonesty(verified);

    const fleet = prepareCustomerDataForEvaluation({
      source,
      mode: "redact",
      requestLiveEvalFleet: true,
    });
    expect(fleet.allowed).toBe(false);
    expect(fleet.reasons.some((r) => /NOT_WIRED/.test(r))).toBe(true);
    expect(fleet.liveEvalWiring).toBe("NOT_WIRED");
    expectEvalHonesty(fleet);
  });

  it("retip N102: unredacted intentLabel and messageBody refused (T-X072)", () => {
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
  });

  it("retip N103: short display name does not substring-redact intentLabel (T-X072)", () => {
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
    expectEvalHonesty(decision);
  });

  it("retip N104: eval prompt PII check idempotent (T-X072)", () => {
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

  it("retip N105: eval prompt blocks raw email and display name (T-X072)", () => {
    const known = { displayName: source.customerDisplayName, email: source.customerEmail };
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

  it("retip N106: eval-safe prompt uses redaction tokens (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    const prompt = buildEvalSafePromptFromPayload(decision.payload);
    expect(prompt).not.toMatch(/jordan\.lee@example\.com/i);
    expect(prompt).not.toMatch(/Jordan Lee/i);
    expect(prompt).not.toMatch(/conv-jordan\.lee@example\.com-thread/);
    expect(prompt).toMatch(/\[REDACTED_NAME\]/);
    expect(prompt).toMatch(/\[REDACTED_CONVERSATION_ID\]/);
    expectEvalHonesty(decision);
  });

  it("retip N107: free-text PII detect and redact helpers (T-X072)", () => {
    const known = { displayName: source.customerDisplayName };
    expect(containsRawCustomerPii("reach a@b.co")).toBe(true);
    expect(containsRawCustomerPii(`I'm ${source.customerDisplayName}`, known)).toBe(
      true,
    );
    expect(redactTextForEvaluation("reach a@b.co")).toBe("reach [REDACTED_EMAIL]");
    expect(redactTextForEvaluation(`I'm ${source.customerDisplayName}`, known)).toBe(
      "I'm [REDACTED_NAME]",
    );
    expect(redactTextForEvaluation("call 415.555.0199")).toMatch(/\[REDACTED_PHONE\]/);
    const clean = assertEvalPromptHasNoCustomerPii(
      "Judge fixture answer for tour_request without customer identifiers",
      known,
    );
    expect(clean.ok).toBe(true);
  });

  it("assist N108: ACCEPTED≠VERIFIED pin + reclaim honesty (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("REDACTED_FOR_EVAL");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expect(decision.reasons.some((r) => /liveEvalWiring=NOT_WIRED/.test(r))).toBe(true);
    expectEvalHonesty(decision);

    const reclaim = reclaimCustomerEvalRedactionDecision(
      { source, mode: "redact" },
      decision,
    );
    expect(reclaim.ok).toBe(true);
    expect(reclaim.reasons).toEqual([]);

    const honesty = assertCustomerEvalRedactionDecisionHonest(decision);
    expect(honesty.ok).toBe(true);
    expect(honesty.code).toBe("HONEST");
  });

  it("retip N109: reclaim refuses tampered prior decision drift (T-X072)", () => {
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
      tampered as typeof blocked,
    );
    expect(drift.ok).toBe(false);
    expect(drift.reasons).toContain("reclaim block reasons drifted");
    expectEvalHonesty(blocked);
  });

  it("retip N110: eval-safe prompt passes full PII scan (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    const prompt = buildEvalSafePromptFromPayload(decision.payload);
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
    expectEvalHonesty(decision);
  });

  it("retip N111: redact and block paths idempotent reapply (T-X072)", () => {
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
    expectEvalHonesty(first);
  });

  it("retip N112: raw passthrough blocked when only intentLabel has PII (T-X072)", () => {
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
    expectEvalHonesty(decision);
  });

  it("retip N113: redacts display name embedded in messageBody (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        messageBody: `I'm ${source.customerDisplayName} — please book Suite B.`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.messageBody).not.toMatch(/Jordan Lee/i);
    expect(decision.payload.messageBody).toMatch(/\[REDACTED_NAME\]/);
    expect(decision.payload.redactedFields).toContain("messageBody");
    expectEvalHonesty(decision);
  });

  it("retip N114: redacts PII embedded in intentLabel (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        intentLabel: `follow_up ${source.customerEmail}`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.intentLabel).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload.intentLabel).toMatch(/\[REDACTED_EMAIL\]/);
    expect(decision.payload.redactedFields).toContain("intentLabel");
    expectEvalHonesty(decision);
  });

  it("retip N115: blocks raw passthrough of customer PII (T-X072)", () => {
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
    expectEvalHonesty(decision);
  });

  it("continue N116: redacts phone embedded in messageBody (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        messageBody: `Call me at ${source.customerPhone} about Suite B.`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.messageBody).not.toMatch(/415/);
    expect(decision.payload.messageBody).toMatch(/\[REDACTED_PHONE\]/);
    expect(decision.payload.redactedFields).toContain("messageBody");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N117: allows redact when no identifiable PII (T-X072)", () => {
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
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.redacted).toBe(true);
    expect(decision.payload.customerEmail).toBeNull();
    expect(decision.payload.customerPhone).toBeNull();
    expect(decision.payload.redactedFields).toEqual([]);
    expect(decision.reasons.some((r) => /No identifiable/.test(r))).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N118: redacts customer fields for evaluation (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({ source, mode: "redact" });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("REDACTED_FOR_EVAL");
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.redacted).toBe(true);
    expect(decision.payload.customerDisplayName).toBe("[REDACTED_NAME]");
    expect(decision.payload.customerEmail).toBe("[REDACTED_EMAIL]");
    expect(decision.payload.customerPhone).toBe("[REDACTED_PHONE]");
    expect(decision.payload.messageBody).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload.messageBody).not.toMatch(/415\s*555/i);
    expect(decision.payload.intentLabel).toBe("tour_request");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.liveEvalWiring).toBe(CUSTOMER_EVAL_LIVE_WIRING);
    expect(decision.liveProviderSuccessClaimed).toBe(false);
  });

  it("retip N119: redacts email embedded in messageBody (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        messageBody: `Email me at ${source.customerEmail} about Suite B.`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.messageBody).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload.messageBody).toMatch(/\[REDACTED_EMAIL\]/);
    expect(decision.payload.redactedFields).toContain("messageBody");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N120: redacts phone embedded in intentLabel (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        intentLabel: `callback ${source.customerPhone}`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.intentLabel).not.toMatch(/415/);
    expect(decision.payload.intentLabel).toMatch(/\[REDACTED_PHONE\]/);
    expect(decision.payload.redactedFields).toContain("intentLabel");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N121: redacts display name embedded in intentLabel (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        intentLabel: `follow_up for ${source.customerDisplayName}`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.intentLabel).not.toMatch(/Jordan Lee/i);
    expect(decision.payload.intentLabel).toMatch(/\[REDACTED_NAME\]/);
    expect(decision.payload.redactedFields).toContain("intentLabel");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N122: conversationId with phone digits is redacted (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        conversationId: `conv-4155550199-thread`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.conversationId).not.toMatch(/4155550199/);
    expect(decision.payload.conversationId).toMatch(/REDACTED/);
    expect(decision.payload.redactedFields).toContain("conversationId");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N123: conversationId with email is redacted (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        conversationId: `conv-${source.customerEmail}-thread`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.conversationId).not.toMatch(/jordan\.lee@example\.com/i);
    expect(decision.payload.conversationId).toMatch(/REDACTED/);
    expect(decision.payload.redactedFields).toContain("conversationId");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expectEvalHonesty(decision);
  });

  it("retip N124: conversationId with display name is redacted (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        ...source,
        conversationId: `conv-${source.customerDisplayName}-thread`,
      },
      mode: "redact",
    });
    expect(decision.allowed).toBe(true);
    if (!decision.payload) throw new Error("expected payload");
    expect(decision.payload.conversationId).not.toMatch(/Jordan/i);
    expect(decision.payload.conversationId).toMatch(/REDACTED/);
    expect(decision.payload.redactedFields).toContain("conversationId");
    expect(decision.reasons.some((r) => r === "ACCEPTED≠VERIFIED")).toBe(true);
    expectEvalHonesty(decision);
  });


  it("retip N125: raw passthrough blocked when only conversationId has phone (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        customerDisplayName: "   ",
        customerEmail: null,
        customerPhone: null,
        messageBody: "Looking for a day pass.",
        conversationId: "conv-4155550199-thread",
        intentLabel: "hours_question",
      },
      mode: "raw_passthrough",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(decision.payload).toBeNull();
    expectEvalHonesty(decision);
  });

  it("retip N126: raw passthrough blocked when only conversationId has email (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        customerDisplayName: "   ",
        customerEmail: null,
        customerPhone: null,
        messageBody: "Looking for a day pass.",
        conversationId: "conv-jordan.lee@example.com-thread",
        intentLabel: "hours_question",
      },
      mode: "raw_passthrough",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(decision.payload).toBeNull();
    expectEvalHonesty(decision);
  });

  it("retip N127: raw passthrough blocked when only messageBody has phone (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        customerDisplayName: "   ",
        customerEmail: null,
        customerPhone: null,
        messageBody: "Call me at 415-555-0199 about Suite B.",
        conversationId: "conv-clean",
        intentLabel: "hours_question",
      },
      mode: "raw_passthrough",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(decision.payload).toBeNull();
    expectEvalHonesty(decision);
  });

  it("retip N128: raw passthrough blocked when only messageBody has email (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        customerDisplayName: "   ",
        customerEmail: null,
        customerPhone: null,
        messageBody: "Email me at jordan.lee@example.com about Suite B.",
        conversationId: "conv-clean",
        intentLabel: "hours_question",
      },
      mode: "raw_passthrough",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(decision.payload).toBeNull();
    expectEvalHonesty(decision);
  });

  it("retip N129: raw passthrough blocked when only intentLabel has phone (T-X072)", () => {
    const decision = prepareCustomerDataForEvaluation({
      source: {
        customerDisplayName: "   ",
        customerEmail: null,
        customerPhone: null,
        messageBody: "Looking for a day pass.",
        conversationId: "conv-clean",
        intentLabel: "callback 415-555-0199",
      },
      mode: "raw_passthrough",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("CUSTOMER_DATA_LEAK_BLOCKED");
    expect(decision.payload).toBeNull();
    expectEvalHonesty(decision);
  });
});
