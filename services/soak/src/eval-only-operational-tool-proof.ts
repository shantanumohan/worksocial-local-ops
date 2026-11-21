/**
 * Fixture proof for T-US-018 / T-X037 — Gemini/Claude EVAL_ONLY never used
 * for publish / CRM / customer reply / ads mutation.
 *
 * Connections are EVAL_ONLY with operationalFallback=false; forbidden tools
 * return EVAL_TOOL_FORBIDDEN with no effect. External effects: NONE.
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
  createEvalConnection,
  emptyEvaluationState,
  evaluateEvalToolAttempt,
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

  // 4. Positive control: judge/read tools allowed.
  const judge = evaluateEvalToolAttempt(EvalToolClass.JUDGE_ANSWER);
  const read = evaluateEvalToolAttempt(EvalToolClass.READ_EVIDENCE);
  if (judge.allowed && read.allowed) {
    details.push("Allowed EVAL tools (judge/read) pass gate");
  } else {
    passed = false;
    details.push("Allowed EVAL tools unexpectedly forbidden");
  }

  // 5. Forbidden operational tools: publish / CRM / customer message / ads.
  for (const tool of FORBIDDEN_EVAL_TOOLS) {
    const gate = evaluateEvalToolAttempt(tool);
    if (!gate.allowed && gate.code === "EVAL_TOOL_FORBIDDEN") {
      details.push(`${tool} forbidden (EVAL_TOOL_FORBIDDEN) — no effect`);
    } else {
      passed = false;
      details.push(`${tool} unexpectedly allowed under EVAL_ONLY`);
    }
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
