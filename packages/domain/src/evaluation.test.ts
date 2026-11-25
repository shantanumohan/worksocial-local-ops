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
  assertEvaluationWorkerIsolation,
  createEvalConnection,
  emptyEvaluationState,
  evalLiveWiringStatus,
  evaluateEvalToolAttempt,
  normalizeGroundingUsed,
  reserveEvalBudget,
  settleEvalBudget,
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
    }
    expect(evaluateEvalToolAttempt(EvalToolClass.JUDGE_ANSWER).allowed).toBe(
      true,
    );
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
