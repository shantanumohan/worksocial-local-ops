/**
 * M8 / NEXT-19 — isolated evaluation (Claude / Gemini EVAL_ONLY).
 *
 * Evaluation never receives publish, CRM, or customer-message tools.
 * Separate budget from operational Claude. ChatGPT Ads stays blocked.
 * Grounding configured but unused → no grounded pass (T-X038).
 * Pure types + validators. No network I/O.
 */

import {
  createBudgetAccount,
  reserveBudget,
  settleBudget,
  type BudgetAccount,
  type BudgetReservation,
  type BudgetSettlement,
} from "./budget-accounting.js";
import { SupportLabel, type SupportLabelValue } from "./knowledge.js";
import {
  AnalyticsEnvironment,
  evaluateChatGptAdsAccess,
  type ChatGptAdsAccessDecision,
} from "./analytics.js";

export const EvalProvider = {
  CLAUDE: "claude",
  GEMINI: "gemini",
} as const;

export type EvalProviderValue =
  (typeof EvalProvider)[keyof typeof EvalProvider];

/** Connection / capability mode — never production action authority. */
export const EvalCapability = {
  EVAL_ONLY: "EVAL_ONLY",
  NOT_CONFIGURED: "NOT_CONFIGURED",
} as const;

export type EvalCapabilityValue =
  (typeof EvalCapability)[keyof typeof EvalCapability];

export const EvalToolClass = {
  READ_EVIDENCE: "read_evidence",
  JUDGE_ANSWER: "judge_answer",
  COMPARE_GOLDEN: "compare_golden",
  /** Explicitly forbidden in EVAL_ONLY contexts. */
  PUBLISH: "publish",
  CRM_WRITE: "crm_write",
  CUSTOMER_MESSAGE: "customer_message",
  ADS_MUTATION: "ads_mutation",
} as const;

export type EvalToolClassValue =
  (typeof EvalToolClass)[keyof typeof EvalToolClass];

export const FORBIDDEN_EVAL_TOOLS: readonly EvalToolClassValue[] = [
  EvalToolClass.PUBLISH,
  EvalToolClass.CRM_WRITE,
  EvalToolClass.CUSTOMER_MESSAGE,
  EvalToolClass.ADS_MUTATION,
] as const;

export const ALLOWED_EVAL_TOOLS: readonly EvalToolClassValue[] = [
  EvalToolClass.READ_EVIDENCE,
  EvalToolClass.JUDGE_ANSWER,
  EvalToolClass.COMPARE_GOLDEN,
] as const;

export const EvalRunStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  BUDGET_EXHAUSTED: "budget_exhausted",
  BLOCKED_TOOL: "blocked_tool",
} as const;

export type EvalRunStatusValue =
  (typeof EvalRunStatus)[keyof typeof EvalRunStatus];

export const EvalCaseVerdict = {
  PASS: "pass",
  FAIL: "fail",
  UNKNOWN: "unknown",
  NO_GROUNDING: "no_grounding",
} as const;

export type EvalCaseVerdictValue =
  (typeof EvalCaseVerdict)[keyof typeof EvalCaseVerdict];

export type EvalConnectionRecord = {
  connectionId: string;
  provider: EvalProviderValue;
  capability: EvalCapabilityValue;
  displayName: string;
  fixtureOnly: boolean;
  /** Operational fallback is always false for EVAL_ONLY. */
  operationalFallback: false;
  createdAtIso: string;
  updatedAtIso: string;
};

export type EvalSuiteCase = {
  caseId: string;
  prompt: string;
  /** Expected grounded fact ids (SUPPORTED only for grounded pass). */
  expectedFactIds: string[];
  /** When true, grounding must be used or verdict is NO_GROUNDING. */
  requiresGrounding: boolean;
  acceptanceCaseId: string | null;
};

export type EvalSuite = {
  suiteId: string;
  title: string;
  cases: EvalSuiteCase[];
  fixtureOnly: boolean;
  createdAtIso: string;
};

export type EvalCaseResult = {
  caseId: string;
  verdict: EvalCaseVerdictValue;
  citedFactIds: string[];
  supportedCitedFactIds: string[];
  groundingUsed: boolean;
  reasons: string[];
  toolAttemptsBlocked: EvalToolClassValue[];
};

export type EvalRunRecord = {
  runId: string;
  suiteId: string;
  provider: EvalProviderValue;
  capability: EvalCapabilityValue;
  status: EvalRunStatusValue;
  reservationId: string | null;
  reservedMinor: number;
  settledMinor: number;
  results: EvalCaseResult[];
  fixtureOnly: boolean;
  chatgptAdsDecision: ChatGptAdsAccessDecision;
  createdAtIso: string;
  completedAtIso: string | null;
};

export type EvaluationState = {
  version: 1;
  updatedAtIso: string;
  connections: EvalConnectionRecord[];
  suites: EvalSuite[];
  runs: EvalRunRecord[];
  /** Isolated eval budget — never shares operational Claude pool. */
  budget: BudgetAccount;
  liveEvalWiring: "NOT_WIRED";
  chatgptAdsWiring: "NOT_WIRED";
};

export const DEFAULT_EVAL_BUDGET_LIMIT_MINOR = 5_000; // $50.00 fixture ceiling

export function emptyEvaluationState(nowIso: string): EvaluationState {
  const dayKey = nowIso.slice(0, 10);
  return {
    version: 1,
    updatedAtIso: nowIso,
    connections: [],
    suites: [],
    runs: [],
    budget: createBudgetAccount({
      dayKey,
      currency: "USD",
      limitMinor: DEFAULT_EVAL_BUDGET_LIMIT_MINOR,
    }),
    liveEvalWiring: "NOT_WIRED",
    chatgptAdsWiring: "NOT_WIRED",
  };
}

export function createEvalConnection(input: {
  connectionId: string;
  provider: EvalProviderValue;
  displayName: string;
  fixtureOnly?: boolean;
  nowIso: string;
}): EvalConnectionRecord {
  return {
    connectionId: input.connectionId,
    provider: input.provider,
    capability: EvalCapability.EVAL_ONLY,
    displayName: input.displayName,
    fixtureOnly: input.fixtureOnly ?? true,
    operationalFallback: false,
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

export function isEvalToolAllowed(tool: EvalToolClassValue): boolean {
  return (ALLOWED_EVAL_TOOLS as readonly string[]).includes(tool);
}

export type EvalToolGate =
  | { allowed: true; tool: EvalToolClassValue }
  | {
      allowed: false;
      tool: EvalToolClassValue;
      code: "EVAL_TOOL_FORBIDDEN";
      reasons: string[];
    };

/** Gemini (or Claude) attempting operational tools has no effect (T-X037). */
export function evaluateEvalToolAttempt(
  tool: EvalToolClassValue,
): EvalToolGate {
  if (isEvalToolAllowed(tool)) {
    return { allowed: true, tool };
  }
  return {
    allowed: false,
    tool,
    code: "EVAL_TOOL_FORBIDDEN",
    reasons: [
      `EVAL_ONLY forbids ${tool} — no publish / CRM / customer-message / ads effect (T-US-018 / T-X037)`,
    ],
  };
}

export type GroundedEvalAdjudication = {
  verdict: EvalCaseVerdictValue;
  citedFactIds: string[];
  supportedCitedFactIds: string[];
  groundingUsed: boolean;
  reasons: string[];
};

/**
 * Adjudicate a fixture answer. Grounding configured but unused → no grounded
 * pass (T-X038). Only SUPPORTED facts count as grounding.
 */
export function adjudicateGroundedEvalCase(input: {
  caseDef: EvalSuiteCase;
  citedFactIds: string[];
  factLabels: ReadonlyMap<string, SupportLabelValue>;
  /** When false, model produced an answer without consulting grounding. */
  groundingUsed: boolean;
}): GroundedEvalAdjudication {
  const supportedCited = input.citedFactIds.filter(
    (id) => input.factLabels.get(id) === SupportLabel.SUPPORTED,
  );
  const reasons: string[] = [];

  if (input.caseDef.requiresGrounding && !input.groundingUsed) {
    return {
      verdict: EvalCaseVerdict.NO_GROUNDING,
      citedFactIds: input.citedFactIds,
      supportedCitedFactIds: supportedCited,
      groundingUsed: false,
      reasons: [
        "Grounding configured but unused — no grounded pass (T-X038)",
      ],
    };
  }

  if (input.caseDef.requiresGrounding && supportedCited.length === 0) {
    return {
      verdict: EvalCaseVerdict.NO_GROUNDING,
      citedFactIds: input.citedFactIds,
      supportedCitedFactIds: [],
      groundingUsed: input.groundingUsed,
      reasons: [
        "No SUPPORTED fact citations — cannot claim grounded answer; UNKNOWN/HYPOTHESIS citations do not count",
      ],
    };
  }

  const missingExpected = input.caseDef.expectedFactIds.filter(
    (id) => !supportedCited.includes(id),
  );
  if (missingExpected.length > 0) {
    reasons.push(
      `Missing expected SUPPORTED citations: ${missingExpected.join(", ")}`,
    );
    return {
      verdict: EvalCaseVerdict.FAIL,
      citedFactIds: input.citedFactIds,
      supportedCitedFactIds: supportedCited,
      groundingUsed: input.groundingUsed,
      reasons,
    };
  }

  reasons.push("Fixture EVAL_ONLY adjudication — SUPPORTED citations present");
  return {
    verdict: EvalCaseVerdict.PASS,
    citedFactIds: input.citedFactIds,
    supportedCitedFactIds: supportedCited,
    groundingUsed: input.groundingUsed,
    reasons,
  };
}

export function reserveEvalBudget(
  account: BudgetAccount,
  reservationId: string,
  amountMinor: number,
): BudgetReservation {
  return reserveBudget(account, reservationId, amountMinor);
}

export function settleEvalBudget(
  account: BudgetAccount,
  reservationId: string,
  actualMinor: number,
): BudgetSettlement {
  return settleBudget(account, reservationId, actualMinor);
}

/** Always-blocked Ads probe for eval surfaces. */
export function evalChatGptAdsProbe(): ChatGptAdsAccessDecision {
  return evaluateChatGptAdsAccess({
    localTransportVerified: false,
    entitlementVerified: false,
    authVerified: false,
    projectEnvironment: AnalyticsEnvironment.FIXTURE,
    requestedEnvironment: AnalyticsEnvironment.LIVE,
  });
}

export const EVAL_RELATED_CASE_IDS = [
  "T-F08",
  "T-F09",
  "T-F17",
  "T-F23",
  "T-US-015",
  "T-US-016",
  "T-US-017",
  "T-US-018",
  "T-US-033",
  "T-US-034",
  "T-US-045",
  "T-US-046",
  "T-X037",
  "T-X038",
] as const;
