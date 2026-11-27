/**
 * Fixture proof for T-US-018 / T-X037 — Gemini/Claude EVAL_ONLY never used
 * for publish / CRM / customer reply / ads mutation.
 *
 * Connections are EVAL_ONLY with operationalFallback=false; forbidden tools
 * (incl. aliases / unknown) return EVAL_TOOL_FORBIDDEN with externalEffects
 * NONE; every gate pins cmsRepairWiring + liveEvalWiring NOT_WIRED.
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  EvalCapability,
  EvalProvider,
  EvalToolClass,
  FIXED_EVALUATION_ISOLATION,
  FORBIDDEN_EVAL_TOOLS,
  SoakProofKind,
  assertEvaluationWorkerIsolation,
  DEFAULT_EVAL_TOOL_RETRY_MAX_ATTEMPTS,
  cmsRepairWiringStatus,
  createEvalConnection,
  emptyEvaluationState,
  evaluateEvalToolAttempt,
  evaluateEvalToolAttemptRaw,
  evaluateEvalToolRetryBudget,
  isEvalToolForbidden,
  normalizeEvalToolClass,
  resolveEvalToolAttemptEnvelope,
  resolveEvalToolCapabilityClaim,
  resolveEvalToolOperationalEffect,
  resolveEvalToolOutcomeClaim,
  resolveEvalToolSideEffectClaim,
  resolveEvalToolReceiptClaim,
  shouldRecordEvalToolAttemptOnBudgetDenial,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-018 / T-X037 fixture ACCEPTED.
 */
export function proofEvalOnlyOperationalToolForbidden(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Isolation context refuses gateway-write / effect credentials.
  try {
    assertEvaluationWorkerIsolation(FIXED_EVALUATION_ISOLATION);
    details.push(
      "Evaluation worker isolation asserts no gateway-write / effect credentials",
    );
  } catch (err) {
    passed = false;
    details.push(
      `Isolation assert unexpectedly threw: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 2. Gemini + Claude connections are EVAL_ONLY with no operational fallback.
  for (const provider of [EvalProvider.GEMINI, EvalProvider.CLAUDE] as const) {
    const conn = createEvalConnection({
      connectionId: `eval-${provider}-soak`,
      provider,
      displayName: `${provider} fixture eval`,
      fixtureOnly: true,
      nowIso,
    });
    if (
      conn.capability === EvalCapability.EVAL_ONLY &&
      conn.operationalFallback === false
    ) {
      details.push(
        `${provider} connection EVAL_ONLY with operationalFallback=false`,
      );
    } else {
      passed = false;
      details.push(
        `${provider} connection not EVAL_ONLY (capability=${conn.capability} fallback=${conn.operationalFallback})`,
      );
    }
  }

  // 3. Empty eval state pins live fleet / ads NOT_WIRED.
  const state = emptyEvaluationState(nowIso);
  if (
    state.liveEvalWiring === "NOT_WIRED" &&
    state.chatgptAdsWiring === "NOT_WIRED"
  ) {
    details.push("Eval state live fleet + ChatGPT Ads wiring NOT_WIRED");
  } else {
    passed = false;
    details.push("Eval state unexpectedly claims live wiring");
  }

  // 4. Positive control: judge/read/compare tools allowed; effects NONE.
  const judge = evaluateEvalToolAttempt(EvalToolClass.JUDGE_ANSWER);
  const read = evaluateEvalToolAttempt(EvalToolClass.READ_EVIDENCE);
  const compare = evaluateEvalToolAttemptRaw("compare-golden");
  if (
    judge.allowed &&
    read.allowed &&
    compare.allowed &&
    judge.externalEffects === "NONE" &&
    compare.externalEffects === "NONE" &&
    judge.cmsRepairWiring === "NOT_WIRED" &&
    judge.liveEvalWiring === "NOT_WIRED"
  ) {
    details.push(
      "Allowed EVAL tools (judge/read/compare) pass gate; effects NONE; CMS+live eval NOT_WIRED",
    );
  } else {
    passed = false;
    details.push("Allowed EVAL tools unexpectedly forbidden or mis-wired");
  }

  // 5. Forbidden operational tools: publish / CRM / customer message / ads.
  for (const tool of FORBIDDEN_EVAL_TOOLS) {
    const gate = evaluateEvalToolAttempt(tool);
    if (
      !gate.allowed &&
      gate.code === "EVAL_TOOL_FORBIDDEN" &&
      gate.externalEffects === "NONE" &&
      gate.cmsRepairWiring === "NOT_WIRED" &&
      gate.liveEvalWiring === "NOT_WIRED" &&
      isEvalToolForbidden(tool)
    ) {
      details.push(`${tool} forbidden (EVAL_TOOL_FORBIDDEN) — no effect; CMS NOT_WIRED`);
    } else {
      passed = false;
      details.push(`${tool} unexpectedly allowed under EVAL_ONLY`);
    }
  }

  // 6. Aliases map into forbidden classes — still no effect.
  const publishAlias = evaluateEvalToolAttemptRaw("Publish-Page");
  const replyAlias = evaluateEvalToolAttemptRaw("customer_reply");
  if (
    !publishAlias.allowed &&
    publishAlias.tool === EvalToolClass.PUBLISH &&
    publishAlias.externalEffects === "NONE" &&
    !replyAlias.allowed &&
    replyAlias.tool === EvalToolClass.CUSTOMER_MESSAGE &&
    replyAlias.externalEffects === "NONE" &&
    normalizeEvalToolClass("ads-mutate") === EvalToolClass.ADS_MUTATION
  ) {
    details.push(
      "Operational aliases (Publish-Page/customer_reply/ads-mutate) forbidden — no effect",
    );
  } else {
    passed = false;
    details.push("Operational aliases unexpectedly allowed or mis-normalized");
  }

  // 7. Unknown tools fail closed — never invent allowed operational effect.
  const unknown = evaluateEvalToolAttemptRaw("shell_exec");
  if (
    !unknown.allowed &&
    unknown.tool === "unknown" &&
    unknown.code === "EVAL_TOOL_UNKNOWN_FORBIDDEN" &&
    unknown.externalEffects === "NONE" &&
    unknown.cmsRepairWiring === "NOT_WIRED" &&
    unknown.liveEvalWiring === "NOT_WIRED" &&
    normalizeEvalToolClass("shell_exec") === null
  ) {
    details.push(
      "Unknown tool shell_exec → EVAL_TOOL_UNKNOWN_FORBIDDEN; effects NONE; CMS NOT_WIRED",
    );
  } else {
    passed = false;
    details.push("Unknown tool unexpectedly allowed under EVAL_ONLY");
  }

  // 8. E11 — CMS repair wiring honesty (must stay NOT_WIRED under EVAL_ONLY).
  if (
    cmsRepairWiringStatus() === "NOT_WIRED" &&
    publishAlias.cmsRepairWiring === "NOT_WIRED" &&
    unknown.cmsRepairWiring === "NOT_WIRED"
  ) {
    details.push(
      "cmsRepairWiringStatus=NOT_WIRED on status + forbid gates (E11 CMS honesty)",
    );
  } else {
    passed = false;
    details.push("CMS repair wiring unexpectedly claimed under EVAL_ONLY");
  }

  // 9. E13 — retry fence: first forbid recorded; second start RETRY_BUDGET_EXHAUSTED.
  const firstForbid = evaluateEvalToolRetryBudget({
    gate: publishAlias,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  const secondStart = evaluateEvalToolRetryBudget({
    gate: unknown,
    attemptCount: 1,
    startingNewAttempt: true,
  });
  const allowedNoBudget = evaluateEvalToolRetryBudget({
    gate: judge,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  if (
    DEFAULT_EVAL_TOOL_RETRY_MAX_ATTEMPTS === 1 &&
    firstForbid.allowed &&
    firstForbid.recordAttempt &&
    firstForbid.consumesBudget &&
    firstForbid.externalEffects === "NONE" &&
    firstForbid.cmsRepairWiring === "NOT_WIRED" &&
    firstForbid.liveEvalWiring === "NOT_WIRED" &&
    !secondStart.allowed &&
    secondStart.code === "RETRY_BUDGET_EXHAUSTED" &&
    !secondStart.recordAttempt &&
    !shouldRecordEvalToolAttemptOnBudgetDenial(secondStart.code) &&
    allowedNoBudget.allowed &&
    !allowedNoBudget.consumesBudget
  ) {
    details.push(
      "EVAL_ONLY retry fence: first forbid recorded; second start RETRY_BUDGET_EXHAUSTED (no effect)",
    );
  } else {
    passed = false;
    details.push(
      `Retry fence unexpectedly first=${JSON.stringify(firstForbid)} second=${JSON.stringify(secondStart)}`,
    );
  }

  // 10. E15 — operational-effect honesty under retry fence.
  const effectExhausted = resolveEvalToolOperationalEffect({
    gate: publishAlias,
    retryBudget: secondStart,
  });
  const effectForbidden = resolveEvalToolOperationalEffect({
    gate: publishAlias,
    retryBudget: firstForbid,
  });
  const effectUnknown = resolveEvalToolOperationalEffect({
    gate: unknown,
    retryBudget: firstForbid,
  });
  const effectAllowed = resolveEvalToolOperationalEffect({
    gate: judge,
    retryBudget: allowedNoBudget,
  });
  if (
    !effectExhausted.mayExecute &&
    effectExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    effectExhausted.externalEffects === "NONE" &&
    effectExhausted.cmsRepairWiring === "NOT_WIRED" &&
    effectExhausted.liveEvalWiring === "NOT_WIRED" &&
    !effectForbidden.mayExecute &&
    effectForbidden.code === "EVAL_TOOL_FORBIDDEN" &&
    !effectUnknown.mayExecute &&
    effectUnknown.code === "EVAL_TOOL_UNKNOWN_FORBIDDEN" &&
    effectAllowed.mayExecute &&
    effectAllowed.code === null &&
    effectAllowed.externalEffects === "NONE"
  ) {
    details.push(
      "Operational-effect honesty: exhausted/forbid/unknown refuse; allowed EVAL still externalEffects NONE",
    );
  } else {
    passed = false;
    details.push(
      `Operational effect unexpectedly exhausted=${JSON.stringify(effectExhausted)} allowed=${JSON.stringify(effectAllowed)}`,
    );
  }

  // 11. E17 — capability-claim honesty: never invent operational authority.
  const capExhausted = resolveEvalToolCapabilityClaim({
    effect: effectExhausted,
  });
  const capForbidden = resolveEvalToolCapabilityClaim({
    effect: effectForbidden,
  });
  const capAllowed = resolveEvalToolCapabilityClaim({ effect: effectAllowed });
  if (
    !capExhausted.mayExecute &&
    capExhausted.capability === EvalCapability.EVAL_ONLY &&
    capExhausted.operationalFallback === false &&
    capExhausted.inventedOperationalCapability === false &&
    capExhausted.code === "RETRY_BUDGET_EXHAUSTED" &&
    capExhausted.liveEvalWiring === "NOT_WIRED" &&
    !capForbidden.mayExecute &&
    capForbidden.inventedOperationalCapability === false &&
    capAllowed.mayExecute &&
    capAllowed.capability === EvalCapability.EVAL_ONLY &&
    capAllowed.operationalFallback === false &&
    capAllowed.inventedOperationalCapability === false &&
    capAllowed.externalEffects === "NONE"
  ) {
    details.push(
      "Capability-claim honesty: exhausted/forbid refuse; allowed stays EVAL_ONLY (no operational invent)",
    );
  } else {
    passed = false;
    details.push(
      `Capability claim unexpectedly exhausted=${JSON.stringify(capExhausted)} allowed=${JSON.stringify(capAllowed)}`,
    );
  }

  // 12. E18 — attempt envelope seals gate+retry+effect+capability honesty.
  const envRefused = resolveEvalToolAttemptEnvelope({
    rawTool: EvalToolClass.PUBLISH,
    attemptCount: 1,
    startingNewAttempt: true,
  });
  const envAllowed = resolveEvalToolAttemptEnvelope({
    rawTool: EvalToolClass.JUDGE_ANSWER,
    attemptCount: 0,
    startingNewAttempt: true,
  });
  if (
    !envRefused.mayExecute &&
    envRefused.liveVerifiedClaimed === false &&
    envRefused.operationalSuccessClaimed === false &&
    envRefused.chatgptAdsWiring === "NOT_WIRED" &&
    envRefused.capability.capability === EvalCapability.EVAL_ONLY &&
    envRefused.retryBudget.code === "RETRY_BUDGET_EXHAUSTED" &&
    envAllowed.mayExecute &&
    envAllowed.liveVerifiedClaimed === false &&
    envAllowed.operationalSuccessClaimed === false &&
    envAllowed.externalEffects === "NONE" &&
    envAllowed.liveEvalWiring === "NOT_WIRED" &&
    envAllowed.cmsRepairWiring === "NOT_WIRED" &&
    envAllowed.chatgptAdsWiring === "NOT_WIRED"
  ) {
    details.push(
      "Attempt-envelope honesty: sealed refuse/allow without live or Ads invent",
    );
  } else {
    passed = false;
    details.push(
      `Attempt envelope unexpectedly refused=${JSON.stringify(envRefused)} allowed=${JSON.stringify(envAllowed)}`,
    );
  }

  // 13. E19 — outcome claim never invents VERIFIED/live success from envelope.
  const outRefused = resolveEvalToolOutcomeClaim({ envelope: envRefused });
  const outAllowed = resolveEvalToolOutcomeClaim({ envelope: envAllowed });
  if (
    outRefused.outcome === "REFUSED" &&
    outRefused.inventedSuccess === false &&
    outRefused.verifiedClaimed === false &&
    outRefused.sandboxVerifiedClaimed === false &&
    outRefused.liveVerifiedClaimed === false &&
    outRefused.acceptedIsNotVerified === true &&
    outRefused.chatgptAdsWiring === "NOT_WIRED" &&
    outAllowed.outcome === "EXECUTE_EVAL_ONLY" &&
    outAllowed.inventedLivePass === false &&
    outAllowed.verifiedClaimed === false &&
    outAllowed.acceptedIsNotVerified === true &&
    outAllowed.externalEffects === "NONE" &&
    outAllowed.liveEvalWiring === "NOT_WIRED"
  ) {
    details.push(
      "Outcome-claim honesty: ACCEPTED≠VERIFIED; refuse invents no live/sandbox pass",
    );
  } else {
    passed = false;
    details.push(
      `Outcome claim unexpectedly refused=${JSON.stringify(outRefused)} allowed=${JSON.stringify(outAllowed)}`,
    );
  }

  // 14. E20 — side-effect claim never invents publish/CRM/message/ads mutations.
  const sideRefused = resolveEvalToolSideEffectClaim({ outcome: outRefused });
  const sideAllowed = resolveEvalToolSideEffectClaim({ outcome: outAllowed });
  if (
    sideRefused.sideEffects === "NONE" &&
    sideRefused.inventedSideEffect === false &&
    sideRefused.publishAttempted === false &&
    sideRefused.crmWriteAttempted === false &&
    sideRefused.customerMessageAttempted === false &&
    sideRefused.adsMutationAttempted === false &&
    sideRefused.chatgptAdsWiring === "NOT_WIRED" &&
    sideAllowed.sideEffects === "NONE" &&
    sideAllowed.publishAttempted === false &&
    sideAllowed.adsMutationAttempted === false &&
    sideAllowed.verifiedClaimed === false &&
    sideAllowed.acceptedIsNotVerified === true &&
    sideAllowed.externalEffects === "NONE"
  ) {
    details.push(
      "Side-effect-claim honesty: EXECUTE/REFUSED both keep sideEffects NONE (no Ads invent)",
    );
  } else {
    passed = false;
    details.push(
      `Side-effect claim unexpectedly refused=${JSON.stringify(sideRefused)} allowed=${JSON.stringify(sideAllowed)}`,
    );
  }

  // 15. E21 — receipt claim never invents live/provider/measured receipts.
  const receiptRefused = resolveEvalToolReceiptClaim({ sideEffect: sideRefused });
  const receiptAllowed = resolveEvalToolReceiptClaim({ sideEffect: sideAllowed });
  const falseReceipt = resolveEvalToolReceiptClaim({
    sideEffect: sideAllowed,
    claimProviderReceipt: true,
  });
  if (
    receiptRefused.receipt === "NONE" &&
    receiptRefused.inventedReceipt === false &&
    receiptRefused.providerReceiptClaimed === false &&
    receiptRefused.liveVerifiedClaimed === false &&
    receiptRefused.acceptedIsNotVerified === true &&
    receiptRefused.chatgptAdsWiring === "NOT_WIRED" &&
    receiptAllowed.receipt === "FIXTURE_ACCEPTED" &&
    receiptAllowed.measuredReceiptClaimed === false &&
    receiptAllowed.verifiedClaimed === false &&
    receiptAllowed.acceptedIsNotVerified === true &&
    receiptAllowed.externalEffects === "NONE" &&
    falseReceipt.receipt === "NONE" &&
    falseReceipt.inventedLiveReceipt === false &&
    falseReceipt.liveReceiptClaimed === false
  ) {
    details.push(
      "Receipt-claim honesty: FIXTURE_ACCEPTED≠VERIFIED; refuse live/provider/measured invent",
    );
  } else {
    passed = false;
    details.push(
      `Receipt claim unexpectedly refused=${JSON.stringify(receiptRefused)} allowed=${JSON.stringify(receiptAllowed)} false=${JSON.stringify(falseReceipt)}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-eval-only-${randomUUID()}`,
    kind: SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us018-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
