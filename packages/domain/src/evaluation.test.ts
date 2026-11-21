import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import {
  EvalCaseVerdict,
  EvalCapability,
  EvalProvider,
  EvalToolClass,
  adjudicateGroundedEvalCase,
  createEvalConnection,
  emptyEvaluationState,
  evaluateEvalToolAttempt,
  reserveEvalBudget,
  settleEvalBudget,
} from "./evaluation.js";

const now = "2026-11-21T18:00:00.000Z";

describe("evaluation — EVAL_ONLY isolation", () => {
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
});
