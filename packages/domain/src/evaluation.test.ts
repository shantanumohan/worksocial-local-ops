import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import {
  EvalCaseVerdict,
  EvalCapability,
  EvalProvider,
  EvalToolClass,
  EVALUATION_WORKER_PRINCIPAL,
  FIXED_EVALUATION_ISOLATION,
  adjudicateGroundedEvalCase,
  normalizeGroundingUsed,
  evalLiveWiringStatus,
  assertEvaluationWorkerIsolation,
  createEvalConnection,
  emptyEvaluationState,
  DEFAULT_EVAL_TOOL_RETRY_MAX_ATTEMPTS,
  evaluateEvalToolAttempt,
  evaluateEvalToolAttemptRaw,
  evaluateEvalToolRetryBudget,
  isEvalToolForbidden,
  normalizeEvalToolClass,
  reserveEvalBudget,
  resolveEvalToolAttemptEnvelope,
  resolveEvalToolCapabilityClaim,
  resolveEvalToolOperationalEffect,
  resolveEvalToolOutcomeClaim,
  resolveEvalToolSideEffectClaim,
  resolveEvalToolReceiptClaim,
  settleEvalBudget,
  shouldRecordEvalToolAttemptOnBudgetDenial,
} from "./evaluation.js";

const now = "2026-11-21T18:00:00.000Z";

describe("evaluation — EVAL_ONLY isolation", () => {
  it("asserts fixed isolation context (no gateway write / effect credentials)", () => {
    expect(() =>
      assertEvaluationWorkerIsolation(FIXED_EVALUATION_ISOLATION),
    ).not.toThrow();
    expect(FIXED_EVALUATION_ISOLATION.principal).toBe(
      EVALUATION_WORKER_PRINCIPAL,
    );
    expect(FIXED_EVALUATION_ISOLATION.learningCannotExpandEffects).toBe(true);
    expect(() =>
      assertEvaluationWorkerIsolation({
        ...FIXED_EVALUATION_ISOLATION,
        hasActionGatewayWritePrincipal: true as unknown as false,
      }),
    ).toThrow(/action-gateway write principal/i);
  });

  it("creates connections as EVAL_ONLY with no operational fallback", () => {
    const conn = createEvalConnection({
      connectionId: "eval-claude-1",
      provider: EvalProvider.CLAUDE,
      displayName: "Claude fixture eval",
      nowIso: now,
    });
    expect(conn.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(conn.operationalFallback).toBe(false);
  });

  it("empty state pins live fleet NOT_WIRED and isolation flags", () => {
    const state = emptyEvaluationState(now);
    expect(state.liveEvalWiring).toBe("NOT_WIRED");
    expect(state.chatgptAdsWiring).toBe("NOT_WIRED");
    expect(state.isolation).toEqual(FIXED_EVALUATION_ISOLATION);
  });

  it("blocks publish / CRM / customer-message tools (T-X037)", () => {
    for (const tool of [
      EvalToolClass.PUBLISH,
      EvalToolClass.CRM_WRITE,
      EvalToolClass.CUSTOMER_MESSAGE,
      EvalToolClass.ADS_MUTATION,
    ] as const) {
      const gate = evaluateEvalToolAttempt(tool);
      expect(gate.allowed).toBe(false);
      if (!gate.allowed) {
        expect(gate.code).toBe("EVAL_TOOL_FORBIDDEN");
        expect(gate.externalEffects).toBe("NONE");
        expect(gate.cmsRepairWiring).toBe("NOT_WIRED");
        expect(gate.liveEvalWiring).toBe("NOT_WIRED");
      }
    }
    const judge = evaluateEvalToolAttempt(EvalToolClass.JUDGE_ANSWER);
    expect(judge.allowed).toBe(true);
    expect(judge.externalEffects).toBe("NONE");
    expect(judge.cmsRepairWiring).toBe("NOT_WIRED");
    expect(judge.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("forbids aliases and unknown tools fail-closed (T-X037)", () => {
    const publishAlias = evaluateEvalToolAttemptRaw("Publish-Page");
    expect(publishAlias.allowed).toBe(false);
    if (!publishAlias.allowed) {
      expect(publishAlias.tool).toBe(EvalToolClass.PUBLISH);
      expect(publishAlias.code).toBe("EVAL_TOOL_FORBIDDEN");
      expect(publishAlias.externalEffects).toBe("NONE");
      expect(publishAlias.cmsRepairWiring).toBe("NOT_WIRED");
      expect(publishAlias.liveEvalWiring).toBe("NOT_WIRED");
    }
    const replyAlias = evaluateEvalToolAttemptRaw("customer_reply");
    expect(replyAlias.allowed).toBe(false);
    if (!replyAlias.allowed) {
      expect(replyAlias.tool).toBe(EvalToolClass.CUSTOMER_MESSAGE);
    }
    const unknown = evaluateEvalToolAttemptRaw("shell_exec");
    expect(unknown.allowed).toBe(false);
    if (!unknown.allowed) {
      expect(unknown.tool).toBe("unknown");
      expect(unknown.code).toBe("EVAL_TOOL_UNKNOWN_FORBIDDEN");
      expect(unknown.externalEffects).toBe("NONE");
      expect(unknown.cmsRepairWiring).toBe("NOT_WIRED");
      expect(unknown.liveEvalWiring).toBe("NOT_WIRED");
    }
    expect(normalizeEvalToolClass("compare-golden")).toBe(
      EvalToolClass.COMPARE_GOLDEN,
    );
    expect(evaluateEvalToolAttemptRaw("compare-golden").allowed).toBe(true);
    expect(isEvalToolForbidden(EvalToolClass.ADS_MUTATION)).toBe(true);
    expect(normalizeEvalToolClass("not-a-tool")).toBeNull();
    expect(normalizeEvalToolClass("constructor")).toBeNull();
    expect(normalizeEvalToolClass("__proto__")).toBeNull();
    const bigintGate = evaluateEvalToolAttemptRaw(1n);
    expect(bigintGate.allowed).toBe(false);
    if (!bigintGate.allowed) {
      expect(bigintGate.code).toBe("EVAL_TOOL_UNKNOWN_FORBIDDEN");
      expect(bigintGate.reasons[0]).toContain("1");
    }
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const circularGate = evaluateEvalToolAttemptRaw(circular);
    expect(circularGate.allowed).toBe(false);
    if (!circularGate.allowed) {
      expect(circularGate.code).toBe("EVAL_TOOL_UNKNOWN_FORBIDDEN");
      expect(circularGate.reasons[0]).toContain("unserializable");
    }
  });

  it("retry fence: forbidden attempts consume budget; past max exhausts (T-X037)", () => {
    expect(DEFAULT_EVAL_TOOL_RETRY_MAX_ATTEMPTS).toBe(1);
    const forbid = evaluateEvalToolAttempt(EvalToolClass.PUBLISH);
    const first = evaluateEvalToolRetryBudget({
      gate: forbid,
      attemptCount: 0,
      startingNewAttempt: true,
    });
    expect(first.allowed).toBe(true);
    expect(first.recordAttempt).toBe(true);
    expect(first.consumesBudget).toBe(true);
    expect(first.externalEffects).toBe("NONE");
    expect(first.cmsRepairWiring).toBe("NOT_WIRED");
    expect(first.liveEvalWiring).toBe("NOT_WIRED");

    const second = evaluateEvalToolRetryBudget({
      gate: forbid,
      attemptCount: 1,
      startingNewAttempt: true,
    });
    expect(second.allowed).toBe(false);
    expect(second.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(second.recordAttempt).toBe(false);
    expect(shouldRecordEvalToolAttemptOnBudgetDenial(second.code)).toBe(false);

    const unknown = evaluateEvalToolAttemptRaw("shell_exec");
    const unknownExhausted = evaluateEvalToolRetryBudget({
      gate: unknown,
      attemptCount: 1,
      startingNewAttempt: true,
    });
    expect(unknownExhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");

    const allowed = evaluateEvalToolRetryBudget({
      gate: evaluateEvalToolAttempt(EvalToolClass.JUDGE_ANSWER),
      attemptCount: 0,
      startingNewAttempt: true,
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.consumesBudget).toBe(false);
    expect(allowed.recordAttempt).toBe(false);
    expect(shouldRecordEvalToolAttemptOnBudgetDenial(null)).toBe(true);
  });

  it("operational-effect honesty under retry fence (T-X037 E15)", () => {
    const forbid = evaluateEvalToolAttempt(EvalToolClass.PUBLISH);
    const exhaustedBudget = evaluateEvalToolRetryBudget({
      gate: forbid,
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const exhausted = resolveEvalToolOperationalEffect({
      gate: forbid,
      retryBudget: exhaustedBudget,
    });
    expect(exhausted.mayExecute).toBe(false);
    expect(exhausted.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(exhausted.externalEffects).toBe("NONE");
    expect(exhausted.cmsRepairWiring).toBe("NOT_WIRED");
    expect(exhausted.liveEvalWiring).toBe("NOT_WIRED");

    const within = evaluateEvalToolRetryBudget({
      gate: forbid,
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const forbidden = resolveEvalToolOperationalEffect({
      gate: forbid,
      retryBudget: within,
    });
    expect(forbidden.mayExecute).toBe(false);
    expect(forbidden.code).toBe("EVAL_TOOL_FORBIDDEN");

    const unknown = evaluateEvalToolAttemptRaw("shell_exec");
    const unknownEffect = resolveEvalToolOperationalEffect({
      gate: unknown,
      retryBudget: evaluateEvalToolRetryBudget({
        gate: unknown,
        attemptCount: 0,
        startingNewAttempt: true,
      }),
    });
    expect(unknownEffect.mayExecute).toBe(false);
    expect(unknownEffect.code).toBe("EVAL_TOOL_UNKNOWN_FORBIDDEN");

    const judge = evaluateEvalToolAttempt(EvalToolClass.JUDGE_ANSWER);
    const allowed = resolveEvalToolOperationalEffect({
      gate: judge,
      retryBudget: evaluateEvalToolRetryBudget({
        gate: judge,
        attemptCount: 0,
        startingNewAttempt: true,
      }),
    });
    expect(allowed.mayExecute).toBe(true);
    expect(allowed.code).toBeNull();
    expect(allowed.externalEffects).toBe("NONE");
  });

  it("capability claim stays EVAL_ONLY under retry fence (T-X037 E17)", () => {
    const forbid = evaluateEvalToolAttempt(EvalToolClass.PUBLISH);
    const exhaustedEffect = resolveEvalToolOperationalEffect({
      gate: forbid,
      retryBudget: evaluateEvalToolRetryBudget({
        gate: forbid,
        attemptCount: 1,
        startingNewAttempt: true,
      }),
    });
    const exhaustedCap = resolveEvalToolCapabilityClaim({
      effect: exhaustedEffect,
    });
    expect(exhaustedCap.mayExecute).toBe(false);
    expect(exhaustedCap.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(exhaustedCap.operationalFallback).toBe(false);
    expect(exhaustedCap.inventedOperationalCapability).toBe(false);
    expect(exhaustedCap.code).toBe("RETRY_BUDGET_EXHAUSTED");
    expect(exhaustedCap.liveEvalWiring).toBe("NOT_WIRED");

    const judge = evaluateEvalToolAttempt(EvalToolClass.JUDGE_ANSWER);
    const allowedCap = resolveEvalToolCapabilityClaim({
      effect: resolveEvalToolOperationalEffect({
        gate: judge,
        retryBudget: evaluateEvalToolRetryBudget({
          gate: judge,
          attemptCount: 0,
          startingNewAttempt: true,
        }),
      }),
    });
    expect(allowedCap.mayExecute).toBe(true);
    expect(allowedCap.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(allowedCap.operationalFallback).toBe(false);
    expect(allowedCap.inventedOperationalCapability).toBe(false);
    expect(allowedCap.externalEffects).toBe("NONE");
  });

  it("attempt envelope seals honesty without live invent (T-X037 E18)", () => {
    const refused = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.PUBLISH,
      attemptCount: 1,
      startingNewAttempt: true,
    });
    expect(refused.mayExecute).toBe(false);
    expect(refused.liveVerifiedClaimed).toBe(false);
    expect(refused.operationalSuccessClaimed).toBe(false);
    expect(refused.chatgptAdsWiring).toBe("NOT_WIRED");
    expect(refused.capability.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(refused.retryBudget.code).toBe("RETRY_BUDGET_EXHAUSTED");

    const allowed = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.JUDGE_ANSWER,
      attemptCount: 0,
      startingNewAttempt: true,
    });
    expect(allowed.mayExecute).toBe(true);
    expect(allowed.liveVerifiedClaimed).toBe(false);
    expect(allowed.operationalSuccessClaimed).toBe(false);
    expect(allowed.externalEffects).toBe("NONE");
    expect(allowed.liveEvalWiring).toBe("NOT_WIRED");
    expect(allowed.cmsRepairWiring).toBe("NOT_WIRED");
    expect(allowed.chatgptAdsWiring).toBe("NOT_WIRED");
  });

  it("outcome claim refuses VERIFIED invent from envelope (T-X037 E19)", () => {
    const refusedEnv = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.PUBLISH,
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const refused = resolveEvalToolOutcomeClaim({ envelope: refusedEnv });
    expect(refused.outcome).toBe("REFUSED");
    expect(refused.inventedSuccess).toBe(false);
    expect(refused.verifiedClaimed).toBe(false);
    expect(refused.sandboxVerifiedClaimed).toBe(false);
    expect(refused.liveVerifiedClaimed).toBe(false);
    expect(refused.acceptedIsNotVerified).toBe(true);
    expect(refused.chatgptAdsWiring).toBe("NOT_WIRED");

    const allowedEnv = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.JUDGE_ANSWER,
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const allowed = resolveEvalToolOutcomeClaim({ envelope: allowedEnv });
    expect(allowed.outcome).toBe("EXECUTE_EVAL_ONLY");
    expect(allowed.inventedLivePass).toBe(false);
    expect(allowed.verifiedClaimed).toBe(false);
    expect(allowed.acceptedIsNotVerified).toBe(true);
    expect(allowed.externalEffects).toBe("NONE");
    expect(allowed.liveEvalWiring).toBe("NOT_WIRED");
  });

  it("side-effect claim never invents mutations (T-X037 E20)", () => {
    const refusedEnv = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.PUBLISH,
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const refusedOut = resolveEvalToolOutcomeClaim({ envelope: refusedEnv });
    const refused = resolveEvalToolSideEffectClaim({ outcome: refusedOut });
    expect(refused.sideEffects).toBe("NONE");
    expect(refused.inventedSideEffect).toBe(false);
    expect(refused.publishAttempted).toBe(false);
    expect(refused.crmWriteAttempted).toBe(false);
    expect(refused.customerMessageAttempted).toBe(false);
    expect(refused.adsMutationAttempted).toBe(false);
    expect(refused.chatgptAdsWiring).toBe("NOT_WIRED");

    const allowedEnv = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.JUDGE_ANSWER,
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const allowedOut = resolveEvalToolOutcomeClaim({ envelope: allowedEnv });
    const allowed = resolveEvalToolSideEffectClaim({ outcome: allowedOut });
    expect(allowedOut.outcome).toBe("EXECUTE_EVAL_ONLY");
    expect(allowed.sideEffects).toBe("NONE");
    expect(allowed.publishAttempted).toBe(false);
    expect(allowed.adsMutationAttempted).toBe(false);
    expect(allowed.verifiedClaimed).toBe(false);
    expect(allowed.acceptedIsNotVerified).toBe(true);
    expect(allowed.externalEffects).toBe("NONE");
  });

  it("receipt claim never invents live or measured receipts (T-X037 E21)", () => {
    const refusedEnv = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.PUBLISH,
      attemptCount: 1,
      startingNewAttempt: true,
    });
    const refusedOut = resolveEvalToolOutcomeClaim({ envelope: refusedEnv });
    const refusedSide = resolveEvalToolSideEffectClaim({ outcome: refusedOut });
    const refusedReceipt = resolveEvalToolReceiptClaim({
      sideEffect: refusedSide,
    });
    expect(refusedReceipt.receipt).toBe("NONE");
    expect(refusedReceipt.inventedReceipt).toBe(false);
    expect(refusedReceipt.providerReceiptClaimed).toBe(false);
    expect(refusedReceipt.liveVerifiedClaimed).toBe(false);
    expect(refusedReceipt.acceptedIsNotVerified).toBe(true);

    const allowedEnv = resolveEvalToolAttemptEnvelope({
      rawTool: EvalToolClass.JUDGE_ANSWER,
      attemptCount: 0,
      startingNewAttempt: true,
    });
    const allowedOut = resolveEvalToolOutcomeClaim({ envelope: allowedEnv });
    const allowedSide = resolveEvalToolSideEffectClaim({ outcome: allowedOut });
    const allowedReceipt = resolveEvalToolReceiptClaim({
      sideEffect: allowedSide,
    });
    expect(allowedReceipt.receipt).toBe("FIXTURE_ACCEPTED");
    expect(allowedReceipt.measuredReceiptClaimed).toBe(false);
    expect(allowedReceipt.verifiedClaimed).toBe(false);
    expect(allowedReceipt.chatgptAdsWiring).toBe("NOT_WIRED");

    const falseLive = resolveEvalToolReceiptClaim({
      sideEffect: allowedSide,
      claimLiveVerifiedReceipt: true,
    });
    expect(falseLive.receipt).toBe("NONE");
    expect(falseLive.inventedLiveReceipt).toBe(false);
    expect(falseLive.liveReceiptClaimed).toBe(false);
  });

  it("uses a separate eval budget account", () => {
    let state = emptyEvaluationState(now);
    const reserved = reserveEvalBudget(state.budget, "res-1", 100);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    state = { ...state, budget: reserved.account };
    const settled = settleEvalBudget(state.budget, "res-1", 75);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.account.settledMinor).toBe(75);
    expect(settled.account.reservedMinor).toBe(0);
  });
});

describe("evaluation — grounded adjudication", () => {
  const labels = new Map([
    ["fixture-fact-hours", SupportLabel.SUPPORTED],
    ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
  ]);

  it("fails grounded pass when grounding configured but unused (T-X038)", () => {
    const result = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c1",
        prompt: "What are hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: false,
    });
    expect(result.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
  });

  it("rejects HYPOTHESIS-only citations as grounded", () => {
    const result = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c2",
        prompt: "Claim",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: null,
      },
      citedFactIds: ["fixture-fact-hypothesis"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(result.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(result.supportedCitedFactIds).toHaveLength(0);
  });

  it("passes when SUPPORTED citations are used", () => {
    const result = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c3",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-F17",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(result.verdict).toBe(EvalCaseVerdict.PASS);
  });

  it("fails closed on empty citations, UNKNOWN labels, and claimed PASS (T-X038)", () => {
    const empty = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-empty",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: [],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(empty.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const unknownLabels = new Map([
      ["fixture-fact-unknown", SupportLabel.UNKNOWN],
    ]);
    const unk = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-unk",
        prompt: "Hours?",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-unknown"],
      factLabels: unknownLabels,
      groundingUsed: true,
    });
    expect(unk.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const claimed = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claim",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: false,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimed.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimed.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);

    expect(normalizeGroundingUsed(true)).toBe(true);
    expect(normalizeGroundingUsed("true")).toBe(true);
    expect(normalizeGroundingUsed(1)).toBe(false);
    expect(normalizeGroundingUsed("yes")).toBe(false);
    expect(normalizeGroundingUsed("TRUE")).toBe(false);
    expect(normalizeGroundingUsed(" true ")).toBe(false);
    expect(evalLiveWiringStatus()).toBe("NOT_WIRED");
  });
});
