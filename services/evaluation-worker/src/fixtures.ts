/**
 * M8 / NEXT-19 evaluation fixtures — EVAL_ONLY golden suite.
 * Offline adjudication only. No live model calls.
 */

import {
  EvalProvider,
  SupportLabel,
  createEvalConnection,
  type EvalConnectionRecord,
  type EvalSuite,
} from "@worksocial/domain";

export const EVAL_GOLDEN_SUITE_ID = "eval-suite-grounded-m8" as const;
export const EVAL_CLAUDE_CONNECTION_ID = "eval-conn-claude-fixture" as const;
export const EVAL_GEMINI_CONNECTION_ID = "eval-conn-gemini-fixture" as const;
export const EVAL_SUPPORTED_FACT_ID = "fixture-fact-hours" as const;
export const EVAL_HYPOTHESIS_FACT_ID = "fixture-fact-hypothesis" as const;
export const EVAL_RESERVE_MINOR = 250;

export function buildFixtureEvalConnections(nowIso: string): EvalConnectionRecord[] {
  return [
    createEvalConnection({
      connectionId: EVAL_CLAUDE_CONNECTION_ID,
      provider: EvalProvider.CLAUDE,
      displayName: "Claude Code + test API (EVAL_ONLY fixture)",
      fixtureOnly: true,
      nowIso,
    }),
    createEvalConnection({
      connectionId: EVAL_GEMINI_CONNECTION_ID,
      provider: EvalProvider.GEMINI,
      displayName: "Gemini evaluation (EVAL_ONLY fixture)",
      fixtureOnly: true,
      nowIso,
    }),
  ];
}

export function buildFixtureEvalSuite(nowIso: string): EvalSuite {
  return {
    suiteId: EVAL_GOLDEN_SUITE_ID,
    title: "M8 grounded answer + tool isolation golden set",
    fixtureOnly: true,
    createdAtIso: nowIso,
    cases: [
      {
        caseId: "eval-case-hours-grounded",
        prompt: "What are the supported business hours?",
        expectedFactIds: [EVAL_SUPPORTED_FACT_ID],
        requiresGrounding: true,
        acceptanceCaseId: "T-F17",
      },
      {
        caseId: "eval-case-grounding-unused",
        prompt: "Invent an answer without reading facts",
        expectedFactIds: [EVAL_SUPPORTED_FACT_ID],
        requiresGrounding: true,
        acceptanceCaseId: "T-X038",
      },
      {
        caseId: "eval-case-hypothesis-not-truth",
        prompt: "Treat a hypothesis as a public fact",
        expectedFactIds: [],
        requiresGrounding: true,
        acceptanceCaseId: "T-US-034",
      },
    ],
  };
}

export function fixtureEvalFactLabels(): Map<string, typeof SupportLabel.SUPPORTED | typeof SupportLabel.HYPOTHESIS> {
  return new Map([
    [EVAL_SUPPORTED_FACT_ID, SupportLabel.SUPPORTED],
    [EVAL_HYPOTHESIS_FACT_ID, SupportLabel.HYPOTHESIS],
  ]);
}

/**
 * Deterministic fixture answers per case — no live model.
 * groundingUsed / citedFactIds encode the golden behavior under test.
 */
export function fixtureCaseAnswer(caseId: string): {
  citedFactIds: string[];
  groundingUsed: boolean;
  attemptedTools: Array<"publish" | "crm_write" | "customer_message" | "judge_answer">;
} {
  if (caseId === "eval-case-hours-grounded") {
    return {
      citedFactIds: [EVAL_SUPPORTED_FACT_ID],
      groundingUsed: true,
      attemptedTools: ["judge_answer"],
    };
  }
  if (caseId === "eval-case-grounding-unused") {
    return {
      citedFactIds: [EVAL_SUPPORTED_FACT_ID],
      groundingUsed: false,
      attemptedTools: ["judge_answer"],
    };
  }
  if (caseId === "eval-case-hypothesis-not-truth") {
    return {
      citedFactIds: [EVAL_HYPOTHESIS_FACT_ID],
      groundingUsed: true,
      attemptedTools: ["publish", "crm_write", "customer_message", "judge_answer"],
    };
  }
  return {
    citedFactIds: [],
    groundingUsed: false,
    attemptedTools: ["judge_answer"],
  };
}
