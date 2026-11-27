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

  it("numeric groundingUsed alias and claimed PASS on HYPOTHESIS-only stay fail-closed (T-X038 N1)", () => {
    const numericGround = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-num-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: 1,
    });
    expect(numericGround.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(numericGround.groundingUsed).toBe(false);

    const claimedHypo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claim-hypo",
        prompt: "Claim",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hypothesis"],
      factLabels: labels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedHypo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedHypo.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);

    const aliasNoGround = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-alias-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "TRUE",
    });
    expect(aliasNoGround.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(aliasNoGround.groundingUsed).toBe(false);

    const claimedEmpty = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claim-empty",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: [],
      factLabels: labels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedEmpty.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedEmpty.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N3: null/padded groundingUsed and claimed PASS on UNKNOWN-only (T-X038)", () => {
    const nullGround = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-null-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: null,
    });
    expect(nullGround.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(nullGround.groundingUsed).toBe(false);

    const paddedGround = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-padded-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: " true ",
    });
    expect(paddedGround.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(paddedGround.groundingUsed).toBe(false);

    const unknownLabels = new Map([
      ["fixture-fact-unknown", SupportLabel.UNKNOWN],
    ]);
    const claimedUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claim-unk",
        prompt: "Claim",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-unknown"],
      factLabels: unknownLabels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N4: yes-alias ground and claimed PASS on missing expected stays FAIL (T-X038)", () => {
    const yesAlias = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-yes-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "yes",
    });
    expect(yesAlias.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(yesAlias.groundingUsed).toBe(false);

    const extendedLabels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-missing", SupportLabel.SUPPORTED],
    ]);
    const claimedMissingExpected = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-missing-expected",
        prompt: "Full answer",
        expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: extendedLabels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedMissingExpected.verdict).toBe(EvalCaseVerdict.FAIL);
    expect(claimedMissingExpected.groundingUsed).toBe(true);
    expect(claimedMissingExpected.reasons.join(" ")).toMatch(/Missing expected SUPPORTED/);
  });

  it("retip N5: numeric zero and Titlecase True aliases stay fail-closed (T-X038)", () => {
    const zeroGround = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-zero-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: 0,
    });
    expect(zeroGround.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(zeroGround.groundingUsed).toBe(false);

    const titleTrue = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-title-true",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "True",
    });
    expect(titleTrue.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(titleTrue.groundingUsed).toBe(false);
  });

  it("retip N6: undefined and empty-string groundingUsed fail closed (T-X038)", () => {
    const undefinedGround = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-undef-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: undefined,
    });
    expect(undefinedGround.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const emptyString = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-empty-str-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "",
    });
    expect(emptyString.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(emptyString.groundingUsed).toBe(false);
  });

  it("wipe15 N7: string false alias and mixed hypo+supported pass control (T-X038)", () => {
    const stringFalse = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-str-false",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "false",
    });
    expect(stringFalse.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(stringFalse.groundingUsed).toBe(false);

    const mixedPass = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-mixed-pass",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours", "fixture-fact-hypothesis"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(mixedPass.verdict).toBe(EvalCaseVerdict.PASS);
    expect(mixedPass.supportedCitedFactIds).toContain("fixture-fact-hours");
  });

  it("retip N8: claimed PASS on missing expected stays FAIL not grounded refuse (T-X038)", () => {
    const extendedLabels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-missing", SupportLabel.SUPPORTED],
    ]);
    const claimedFail = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claim-fail",
        prompt: "Full answer",
        expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: extendedLabels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedFail.verdict).toBe(EvalCaseVerdict.FAIL);
    expect(claimedFail.reasons.join(" ")).toMatch(/Missing expected SUPPORTED/);
    expect(claimedFail.reasons.join(" ")).not.toMatch(/FALSE_GROUNDED_PASS_REFUSED/);

    const stringOne = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-str-one",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "1",
    });
    expect(stringOne.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const missingLabel = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-missing-label",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-unlabeled"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(missingLabel.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(missingLabel.supportedCitedFactIds).toHaveLength(0);
  });

  it("retip N10: boolean false ground and duplicate SUPPORTED cites (T-X038)", () => {
    const boolFalse = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-bool-false",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: false,
    });
    expect(boolFalse.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(boolFalse.groundingUsed).toBe(false);

    const dupCites = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-dup-cites",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours", "fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(dupCites.verdict).toBe(EvalCaseVerdict.PASS);
    expect(dupCites.supportedCitedFactIds).toEqual(["fixture-fact-hours", "fixture-fact-hours"]);
  });

  it("retip N11: padded TRUE alias and empty expectedFactIds PASS (T-X038)", () => {
    const paddedTrue = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-padded-true",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "TRUE ",
    });
    expect(paddedTrue.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const noExpected = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-no-expected",
        prompt: "Optional detail",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(noExpected.verdict).toBe(EvalCaseVerdict.PASS);
  });

  it("retip N12: on-alias ground and claimed PASS on FAIL path honest (T-X038)", () => {
    const onAlias = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-on-alias",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "on",
    });
    expect(onAlias.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const extendedLabels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-missing", SupportLabel.SUPPORTED],
    ]);
    const claimedStillFail = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claimed-still-fail",
        prompt: "Full",
        expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: extendedLabels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedStillFail.verdict).toBe(EvalCaseVerdict.FAIL);
    expect(claimedStillFail.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))).toBe(
      false,
    );
  });

  it("wipe15 N13: Titlecase False alias and claimed PASS on hypo+unknown mix (T-X038)", () => {
    const titleFalse = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-title-false",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "False",
    });
    expect(titleFalse.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(titleFalse.groundingUsed).toBe(false);

    const mixedNoSupported = new Map([
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
      ["fixture-fact-unknown", SupportLabel.UNKNOWN],
    ]);
    const claimedMixed = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claim-mixed-weak",
        prompt: "Claim",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hypothesis", "fixture-fact-unknown"],
      factLabels: mixedNoSupported,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedMixed.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedMixed.supportedCitedFactIds).toHaveLength(0);
    expect(claimedMixed.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N14: off alias and claimed PASS on duplicate HYPOTHESIS only (T-X038)", () => {
    const offAlias = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-off-alias",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "off",
    });
    expect(offAlias.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(offAlias.groundingUsed).toBe(false);
    const dupHypo = new Map([
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
      ["fixture-fact-hypothesis-b", SupportLabel.HYPOTHESIS],
    ]);
    const claimedDupHypo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-dup-hypo-claim",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hypothesis", "fixture-fact-hypothesis-b"],
      factLabels: dupHypo,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedDupHypo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedDupHypo.supportedCitedFactIds).toHaveLength(0);
    expect(claimedDupHypo.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N15: ENABLED alias and claimed PASS on duplicate UNKNOWN only (T-X038)", () => {
    const enabledAlias = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-enabled-alias",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "ENABLED",
    });
    expect(enabledAlias.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(enabledAlias.groundingUsed).toBe(false);

    const dupUnknown = new Map([
      ["fixture-fact-unknown", SupportLabel.UNKNOWN],
      ["fixture-fact-unknown-b", SupportLabel.UNKNOWN],
    ]);
    const claimedDupUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-dup-unk-claim",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-unknown", "fixture-fact-unknown-b"],
      factLabels: dupUnknown,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedDupUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedDupUnknown.supportedCitedFactIds).toHaveLength(0);
    expect(claimedDupUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N16: DISABLED alias and string two groundingUsed (T-X038)", () => {
    const disabledAlias = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-disabled-alias",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "DISABLED",
    });
    expect(disabledAlias.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(disabledAlias.groundingUsed).toBe(false);

    const stringTwo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-str-two",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "2",
    });
    expect(stringTwo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(stringTwo.groundingUsed).toBe(false);
    expect(normalizeGroundingUsed("2")).toBe(false);
  });

  it("retip N17: lowercase enabled/disabled and wrong-SUPPORTED cite FAIL (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-lower-enabled",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "enabled",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-lower-disabled",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "disabled",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    const altLabels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-alt", SupportLabel.SUPPORTED],
    ]);
    const wrongCite = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-wrong-supported",
        prompt: "Need alt fact",
        expectedFactIds: ["fixture-fact-alt"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: altLabels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(wrongCite.verdict).toBe(EvalCaseVerdict.FAIL);
    expect(wrongCite.reasons.join(" ")).toMatch(/Missing expected SUPPORTED/);
    expect(wrongCite.reasons.join(" ")).not.toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N18: ON alias and string null groundingUsed (T-X038)", () => {
    const onUpper = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-on-upper",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "ON",
    });
    expect(onUpper.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const stringNull = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-str-null",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "null",
    });
    expect(stringNull.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(stringNull.groundingUsed).toBe(false);

    const claimedUnlabeled = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-claim-unlabeled",
        prompt: "Hours?",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-no-label"],
      factLabels: labels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedUnlabeled.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedUnlabeled.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N19: OFF/undefined aliases and hypo+unlabeled claim (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-off-upper",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "OFF",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-str-undefined",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "undefined",
      }).groundingUsed,
    ).toBe(false);

    const claimedHypoUnlabeled = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-hypo-unlabeled",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hypothesis", "fixture-fact-no-label"],
      factLabels: labels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedHypoUnlabeled.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedHypoUnlabeled.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N20: YES/NO aliases and triplicate SUPPORTED cite PASS (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-yes-alias",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "YES",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-no-alias",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "NO",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    const triplicate = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-triplicate",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: [
        "fixture-fact-hours",
        "fixture-fact-hours",
        "fixture-fact-hours",
      ],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(triplicate.verdict).toBe(EvalCaseVerdict.PASS);
    expect(triplicate.supportedCitedFactIds).toHaveLength(3);
  });

  it("wipe15 N21: padded false alias and triple HYPOTHESIS claim (T-X038)", () => {
    const paddedFalse = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-padded-false",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "false ",
    });
    expect(paddedFalse.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(paddedFalse.groundingUsed).toBe(false);

    const tripleHypo = new Map([
      ["fixture-fact-hypothesis", SupportLabel.HYPOTHESIS],
      ["fixture-fact-hypothesis-b", SupportLabel.HYPOTHESIS],
      ["fixture-fact-hypothesis-c", SupportLabel.HYPOTHESIS],
    ]);
    const claimedTripleHypo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-triple-hypo",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: [
        "fixture-fact-hypothesis",
        "fixture-fact-hypothesis-b",
        "fixture-fact-hypothesis-c",
      ],
      factLabels: tripleHypo,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedTripleHypo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedTripleHypo.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N22: decimal string alias and SUPPORTED+UNKNOWN PASS (T-X038)", () => {
    const decimalAlias = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-decimal-ground",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "1.0",
    });
    expect(decimalAlias.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(decimalAlias.groundingUsed).toBe(false);

    const mixedLabels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-unknown", SupportLabel.UNKNOWN],
    ]);
    const supportedPlusUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-sup-unk-pass",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours", "fixture-fact-unknown"],
      factLabels: mixedLabels,
      groundingUsed: true,
    });
    expect(supportedPlusUnknown.verdict).toBe(EvalCaseVerdict.PASS);
    expect(supportedPlusUnknown.supportedCitedFactIds).toEqual(["fixture-fact-hours"]);
  });

  it("retip N23: negative/zero decimal aliases and leading-space true (T-X038)", () => {
    for (const alias of ["-1", "0.0", " true"]) {
      const result = adjudicateGroundedEvalCase({
        caseDef: {
          caseId: `c-alias-${alias.replace(/\s/g, "")}`,
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: alias,
      });
      expect(result.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
      expect(result.groundingUsed).toBe(false);
    }
    expect(normalizeGroundingUsed(" true")).toBe(false);
    expect(evalLiveWiringStatus()).toBe("NOT_WIRED");
  });

  it("wipe15 N24: FALSE alias and claimed PASS triple UNKNOWN (T-X038)", () => {
    const falseUpper = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-false-upper",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "FALSE",
    });
    expect(falseUpper.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const tripleUnknown = new Map([
      ["fixture-fact-unknown", SupportLabel.UNKNOWN],
      ["fixture-fact-unknown-b", SupportLabel.UNKNOWN],
      ["fixture-fact-unknown-c", SupportLabel.UNKNOWN],
    ]);
    const claimedTripleUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-triple-unk",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: [
        "fixture-fact-unknown",
        "fixture-fact-unknown-b",
        "fixture-fact-unknown-c",
      ],
      factLabels: tripleUnknown,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedTripleUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedTripleUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N25: padded true trailing and single-char T alias (T-X038)", () => {
    const paddedTrueTrailing = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-true-trail",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "true ",
    });
    expect(paddedTrueTrailing.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);

    const singleChar = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-char-t",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "T",
    });
    expect(singleChar.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("T")).toBe(false);

    const quadHypo = new Map([
      ["h1", SupportLabel.HYPOTHESIS],
      ["h2", SupportLabel.HYPOTHESIS],
      ["h3", SupportLabel.HYPOTHESIS],
      ["h4", SupportLabel.HYPOTHESIS],
    ]);
    const claimedQuadHypo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-quad-hypo",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["h1", "h2", "h3", "h4"],
      factLabels: quadHypo,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedQuadHypo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedQuadHypo.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N26: single-char f alias and mis-tagged cite claim (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-char-f",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "f",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    const misTagged = new Map([
      ["fixture-fact-hours", SupportLabel.HYPOTHESIS],
    ]);
    const claimedMisTagged = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-mis-tagged",
        prompt: "Hours?",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: misTagged,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedMisTagged.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedMisTagged.supportedCitedFactIds).toHaveLength(0);
    expect(claimedMisTagged.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N27: y/n single-char aliases and claimed PASS on wrong supported cite (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-char-y",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "y",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-char-n",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "n",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    const swapLabels = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-missing", SupportLabel.SUPPORTED],
    ]);
    const claimedWrongSupported = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-wrong-supported",
        prompt: "Which fact?",
        expectedFactIds: ["fixture-fact-missing"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: swapLabels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedWrongSupported.verdict).toBe(EvalCaseVerdict.FAIL);
    expect(claimedWrongSupported.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))).toBe(
      false,
    );
  });

  it("wipe15 N28: lowercase t alias and claimed PASS on dual unknown cites (T-X038)", () => {
    const lowerT = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-char-t-lower",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "t",
    });
    expect(lowerT.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("t")).toBe(false);

    const dualUnknown = new Map([
      ["u1", SupportLabel.UNKNOWN],
      ["u2", SupportLabel.UNKNOWN],
    ]);
    const claimedDualUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-dual-unknown",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["u1", "u2"],
      factLabels: dualUnknown,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedDualUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedDualUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N29: F alias and claimed PASS on hypo-labeled expected id (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-char-f-upper",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "F",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    const hypoExpectedId = new Map([
      ["fixture-fact-missing", SupportLabel.HYPOTHESIS],
    ]);
    const claimedHypoExpected = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-hypo-expected-id",
        prompt: "Which?",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-missing"],
      factLabels: hypoExpectedId,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedHypoExpected.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedHypoExpected.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N30: padded n alias and claimed PASS on hypo-unknown pair (T-X038)", () => {
    const paddedN = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-n-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "n ",
    });
    expect(paddedN.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("n ")).toBe(false);

    const hypoUnknown = new Map([
      ["h1", SupportLabel.HYPOTHESIS],
      ["u1", SupportLabel.UNKNOWN],
    ]);
    const claimedHypoUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-hypo-unknown-pair",
        prompt: "Mixed",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["h1", "u1"],
      factLabels: hypoUnknown,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedHypoUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedHypoUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N31: Y/y padded aliases and duplicate SUPPORTED pass (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-char-y-upper",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "Y",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    const paddedLowerY = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-y-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: " y ",
    });
    expect(paddedLowerY.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed(" y ")).toBe(false);

    const dupSupported = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-dup-supported-n31",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours", "fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(dupSupported.verdict).toBe(EvalCaseVerdict.PASS);
    expect(dupSupported.supportedCitedFactIds).toEqual([
      "fixture-fact-hours",
      "fixture-fact-hours",
    ]);
  });

  it("retip N32: o alias and claimed PASS hypo-only vs expected (T-X038)", () => {
    expect(
      adjudicateGroundedEvalCase({
        caseDef: {
          caseId: "c-char-o",
          prompt: "Hours?",
          expectedFactIds: ["fixture-fact-hours"],
          requiresGrounding: true,
          acceptanceCaseId: "T-X038",
        },
        citedFactIds: ["fixture-fact-hours"],
        factLabels: labels,
        groundingUsed: "o",
      }).verdict,
    ).toBe(EvalCaseVerdict.NO_GROUNDING);

    const claimedHypoOnly = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-hypo-only-expected-hours",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hypothesis"],
      factLabels: labels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedHypoOnly.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedHypoOnly.supportedCitedFactIds).toHaveLength(0);
    expect(claimedHypoOnly.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N33: padded zero alias and claimed PASS quad unknown (T-X038)", () => {
    const paddedZero = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-zero-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "0 ",
    });
    expect(paddedZero.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("0 ")).toBe(false);

    const quadUnknown = new Map([
      ["u1", SupportLabel.UNKNOWN],
      ["u2", SupportLabel.UNKNOWN],
      ["u3", SupportLabel.UNKNOWN],
      ["u4", SupportLabel.UNKNOWN],
    ]);
    const claimedQuadUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-quad-unknown",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["u1", "u2", "u3", "u4"],
      factLabels: quadUnknown,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedQuadUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedQuadUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N34: padded NO alias and claimed PASS pent unknown (T-X038)", () => {
    const paddedNo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-no-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "NO ",
    });
    expect(paddedNo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("NO ")).toBe(false);

    const pentUnknown = new Map([
      ["u1", SupportLabel.UNKNOWN],
      ["u2", SupportLabel.UNKNOWN],
      ["u3", SupportLabel.UNKNOWN],
      ["u4", SupportLabel.UNKNOWN],
      ["u5", SupportLabel.UNKNOWN],
    ]);
    const claimedPentUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-pent-unknown",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["u1", "u2", "u3", "u4", "u5"],
      factLabels: pentUnknown,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedPentUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedPentUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N35: enabled-space alias and triplicate SUPPORTED pass (T-X038)", () => {
    const enabledPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-enabled-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "enabled ",
    });
    expect(enabledPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("enabled ")).toBe(false);

    const triplicateSupported = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-triplicate-supported-n35",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours", "fixture-fact-hours", "fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(triplicateSupported.verdict).toBe(EvalCaseVerdict.PASS);
    expect(triplicateSupported.supportedCitedFactIds).toHaveLength(3);
  });

  it("retip N36: off-space alias and claimed PASS missing hours cite (T-X038)", () => {
    const offPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-off-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "off ",
    });
    expect(offPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("off ")).toBe(false);

    const bothSupported = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-missing", SupportLabel.SUPPORTED],
    ]);
    const claimedMissingHours = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-missing-hours-cite",
        prompt: "Full",
        expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-missing"],
      factLabels: bothSupported,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedMissingHours.verdict).toBe(EvalCaseVerdict.FAIL);
    expect(claimedMissingHours.reasons.some((r) => /FALSE_GROUNDED_PASS_REFUSED/.test(r))).toBe(
      false,
    );
  });

  it("wipe15 N37: on-space alias and supported-plus-unknown pass (T-X038)", () => {
    const onPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-on-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "on ",
    });
    expect(onPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("on ")).toBe(false);

    const hoursUnknown = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-unknown", SupportLabel.UNKNOWN],
    ]);
    const supportedPlusUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-sup-unk-n37",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours", "fixture-fact-unknown"],
      factLabels: hoursUnknown,
      groundingUsed: true,
    });
    expect(supportedPlusUnknown.verdict).toBe(EvalCaseVerdict.PASS);
    expect(supportedPlusUnknown.supportedCitedFactIds).toEqual(["fixture-fact-hours"]);
  });

  it("retip N38: FALSE-space alias and claimed PASS pent hypothesis (T-X038)", () => {
    const falsePad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-false-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "FALSE ",
    });
    expect(falsePad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("FALSE ")).toBe(false);

    const pentHypo = new Map([
      ["h1", SupportLabel.HYPOTHESIS],
      ["h2", SupportLabel.HYPOTHESIS],
      ["h3", SupportLabel.HYPOTHESIS],
      ["h4", SupportLabel.HYPOTHESIS],
      ["h5", SupportLabel.HYPOTHESIS],
    ]);
    const claimedPentHypo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-pent-hypo",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["h1", "h2", "h3", "h4", "h5"],
      factLabels: pentHypo,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedPentHypo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedPentHypo.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N39: yes-space alias and claimed PASS dup hypothesis (T-X038)", () => {
    const yesPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-yes-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "yes ",
    });
    expect(yesPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("yes ")).toBe(false);

    const dupHypo = new Map([
      ["h1", SupportLabel.HYPOTHESIS],
      ["h2", SupportLabel.HYPOTHESIS],
    ]);
    const claimedDupHypo = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-dup-hypo-n39",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["h1", "h2"],
      factLabels: dupHypo,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedDupHypo.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedDupHypo.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("retip N40: disabled-space alias and claimed PASS triple unknown (T-X038)", () => {
    const disabledPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-disabled-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "disabled ",
    });
    expect(disabledPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("disabled ")).toBe(false);

    const tripleUnknown = new Map([
      ["u1", SupportLabel.UNKNOWN],
      ["u2", SupportLabel.UNKNOWN],
      ["u3", SupportLabel.UNKNOWN],
    ]);
    const claimedTripleUnknown = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-triple-unk-n40",
        prompt: "Guess",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["u1", "u2", "u3"],
      factLabels: tripleUnknown,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedTripleUnknown.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(claimedTripleUnknown.reasons.join(" ")).toMatch(/FALSE_GROUNDED_PASS_REFUSED/);
  });

  it("wipe15 N41: one-space alias and empty-expected SUPPORTED pass (T-X038)", () => {
    const onePad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-one-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "1 ",
    });
    expect(onePad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("1 ")).toBe(false);

    const emptyExpectedPass = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-empty-expected-pass-n41",
        prompt: "Hours?",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: true,
    });
    expect(emptyExpectedPass.verdict).toBe(EvalCaseVerdict.PASS);
    expect(emptyExpectedPass.groundingUsed).toBe(true);
  });

  it("retip N42: decimal-space alias and claimed PASS on full expected set (T-X038)", () => {
    const decimalPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-decimal-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "2.0 ",
    });
    expect(decimalPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("2.0 ")).toBe(false);

    const extended = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-missing", SupportLabel.SUPPORTED],
    ]);
    const claimedFullExpected = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-full-expected-claim",
        prompt: "Full",
        expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
      factLabels: extended,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedFullExpected.verdict).toBe(EvalCaseVerdict.PASS);
    expect(claimedFullExpected.groundingUsed).toBe(true);
  });

  it("wipe15 N43: tri-decimal alias and claimed PASS missing expected cite (T-X038)", () => {
    const triDecimalPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-tri-decimal-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "3.0 ",
    });
    expect(triDecimalPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("3.0 ")).toBe(false);

    const extendedN43 = new Map([
      ["fixture-fact-hours", SupportLabel.SUPPORTED],
      ["fixture-fact-missing", SupportLabel.SUPPORTED],
    ]);
    const claimedPartialExpected = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-partial-expected-claim",
        prompt: "Partial",
        expectedFactIds: ["fixture-fact-hours", "fixture-fact-missing"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: extendedN43,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedPartialExpected.verdict).toBe(EvalCaseVerdict.FAIL);
  });

  it("retip N44: quad-decimal alias and triplicate SUPPORTED pass (T-X038)", () => {
    const quadDecimalPad = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-quad-decimal-pad",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: ["fixture-fact-hours"],
      factLabels: labels,
      groundingUsed: "4.0 ",
    });
    expect(quadDecimalPad.verdict).toBe(EvalCaseVerdict.NO_GROUNDING);
    expect(normalizeGroundingUsed("4.0 ")).toBe(false);

    const claimedTripleSupported = adjudicateGroundedEvalCase({
      caseDef: {
        caseId: "c-triple-supported-pass",
        prompt: "Hours?",
        expectedFactIds: ["fixture-fact-hours"],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      citedFactIds: [
        "fixture-fact-hours",
        "fixture-fact-hours",
        "fixture-fact-hours",
      ],
      factLabels: labels,
      groundingUsed: true,
      claimedVerdict: EvalCaseVerdict.PASS,
    });
    expect(claimedTripleSupported.verdict).toBe(EvalCaseVerdict.PASS);
    expect(claimedTripleSupported.groundingUsed).toBe(true);
  });
});
