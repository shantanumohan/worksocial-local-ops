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

export const FORBIDDEN_EVAL_TOOLS: readonly EvalToolClassValue[] = Object.freeze([
  EvalToolClass.PUBLISH,
  EvalToolClass.CRM_WRITE,
  EvalToolClass.CUSTOMER_MESSAGE,
  EvalToolClass.ADS_MUTATION,
]);

export const ALLOWED_EVAL_TOOLS: readonly EvalToolClassValue[] = Object.freeze([
  EvalToolClass.READ_EVIDENCE,
  EvalToolClass.JUDGE_ANSWER,
  EvalToolClass.COMPARE_GOLDEN,
]);

/** Alias map — casing/hyphen variants normalize into known tool classes. */
const EVAL_TOOL_ALIASES: Readonly<Record<string, EvalToolClassValue>> =
  Object.freeze({
    read_evidence: EvalToolClass.READ_EVIDENCE,
    readevidence: EvalToolClass.READ_EVIDENCE,
    judge_answer: EvalToolClass.JUDGE_ANSWER,
    judgeanswer: EvalToolClass.JUDGE_ANSWER,
    compare_golden: EvalToolClass.COMPARE_GOLDEN,
    comparegolden: EvalToolClass.COMPARE_GOLDEN,
    publish: EvalToolClass.PUBLISH,
    publish_page: EvalToolClass.PUBLISH,
    publishpage: EvalToolClass.PUBLISH,
    crm_write: EvalToolClass.CRM_WRITE,
    crmwrite: EvalToolClass.CRM_WRITE,
    crm: EvalToolClass.CRM_WRITE,
    customer_message: EvalToolClass.CUSTOMER_MESSAGE,
    customermessage: EvalToolClass.CUSTOMER_MESSAGE,
    customer_reply: EvalToolClass.CUSTOMER_MESSAGE,
    customerreply: EvalToolClass.CUSTOMER_MESSAGE,
    ads_mutation: EvalToolClass.ADS_MUTATION,
    adsmutation: EvalToolClass.ADS_MUTATION,
    ads_mutate: EvalToolClass.ADS_MUTATION,
  });

/**
 * Normalize a raw tool id. Unknown strings return null (fail closed — never
 * invent an allowed operational tool). Only exact known aliases map.
 * Own-property lookup only — never inherit Object.prototype keys.
 */
export function normalizeEvalToolClass(
  raw: unknown,
): EvalToolClassValue | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return null;
  if (!Object.prototype.hasOwnProperty.call(EVAL_TOOL_ALIASES, key)) {
    return null;
  }
  return EVAL_TOOL_ALIASES[key] ?? null;
}

/** Serialization-safe diagnostic for unknown/malformed tool ids. */
function formatEvalToolDiag(raw: unknown): string {
  if (typeof raw === "string") return JSON.stringify(raw);
  if (raw === null) return "null";
  const t = typeof raw;
  if (
    t === "number" ||
    t === "boolean" ||
    t === "bigint" ||
    t === "undefined" ||
    t === "symbol"
  ) {
    return String(raw);
  }
  try {
    const encoded = JSON.stringify(raw);
    return encoded === undefined ? `[unserializable ${t}]` : encoded;
  } catch {
    return `[unserializable ${t}]`;
  }
}

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

/** Fixed isolation flags — evaluation never holds effect credentials. */
export type EvaluationIsolationContext = {
  principal: "evaluation-worker";
  hasActionGatewayWritePrincipal: false;
  hasProductionEffectCredentials: false;
  /** Learning proposals consumed here cannot expand operational effects. */
  learningCannotExpandEffects: true;
};

export const EVALUATION_WORKER_PRINCIPAL = "evaluation-worker" as const;

export const FIXED_EVALUATION_ISOLATION: EvaluationIsolationContext = {
  principal: EVALUATION_WORKER_PRINCIPAL,
  hasActionGatewayWritePrincipal: false,
  hasProductionEffectCredentials: false,
  learningCannotExpandEffects: true,
};

export function assertEvaluationWorkerIsolation(
  ctx: EvaluationIsolationContext,
): void {
  if (ctx.principal !== EVALUATION_WORKER_PRINCIPAL) {
    throw new Error(
      `Evaluation isolation requires principal '${EVALUATION_WORKER_PRINCIPAL}', got '${ctx.principal}'`,
    );
  }
  if (ctx.hasActionGatewayWritePrincipal) {
    throw new Error(
      "evaluation-worker must not hold an action-gateway write principal",
    );
  }
  if (ctx.hasProductionEffectCredentials) {
    throw new Error(
      "evaluation-worker must not hold production effect credentials",
    );
  }
  if (ctx.learningCannotExpandEffects !== true) {
    throw new Error(
      "evaluation-worker must keep learningCannotExpandEffects=true",
    );
  }
}

/** Suite execution mode — live fleet remains NOT_WIRED until transport exists. */
export const EvalRunMode = {
  FIXTURE: "fixture",
  LIVE: "live",
} as const;

export type EvalRunModeValue = (typeof EvalRunMode)[keyof typeof EvalRunMode];

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
  isolation: EvaluationIsolationContext;
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
    isolation: { ...FIXED_EVALUATION_ISOLATION },
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

export function isEvalToolForbidden(tool: EvalToolClassValue): boolean {
  return (FORBIDDEN_EVAL_TOOLS as readonly string[]).includes(tool);
}

export type EvalToolGate =
  | {
      allowed: true;
      tool: EvalToolClassValue;
      externalEffects: "NONE";
      /** CMS repair fleet stays unwired under EVAL_ONLY (T-X037 honesty). */
      cmsRepairWiring: "NOT_WIRED";
      liveEvalWiring: "NOT_WIRED";
    }
  | {
      allowed: false;
      tool: EvalToolClassValue | "unknown";
      code: "EVAL_TOOL_FORBIDDEN" | "EVAL_TOOL_UNKNOWN_FORBIDDEN";
      reasons: string[];
      /** Operational attempts never mutate — always NONE under EVAL_ONLY. */
      externalEffects: "NONE";
      cmsRepairWiring: "NOT_WIRED";
      liveEvalWiring: "NOT_WIRED";
    };

/** Gemini (or Claude) attempting operational tools has no effect (T-X037). */
export function evaluateEvalToolAttempt(
  tool: EvalToolClassValue,
): EvalToolGate {
  if (isEvalToolAllowed(tool)) {
    return {
      allowed: true,
      tool,
      externalEffects: "NONE",
      cmsRepairWiring: "NOT_WIRED",
      liveEvalWiring: "NOT_WIRED",
    };
  }
  return {
    allowed: false,
    tool,
    code: "EVAL_TOOL_FORBIDDEN",
    reasons: [
      `EVAL_ONLY forbids ${tool} — no publish / CRM / customer-message / ads effect (T-US-018 / T-X037)`,
    ],
    externalEffects: "NONE",
    cmsRepairWiring: "NOT_WIRED",
    liveEvalWiring: "NOT_WIRED",
  };
}

/**
 * Fail-closed gate for raw / aliased tool ids (T-X037 / T-US-018).
 * Unknown tools are forbidden — never invent an allowed operational effect.
 */
export function evaluateEvalToolAttemptRaw(raw: unknown): EvalToolGate {
  const tool = normalizeEvalToolClass(raw);
  if (!tool) {
    return {
      allowed: false,
      tool: "unknown",
      code: "EVAL_TOOL_UNKNOWN_FORBIDDEN",
      reasons: [
        `EVAL_ONLY forbids unknown tool ${formatEvalToolDiag(raw)} — no effect (T-US-018 / T-X037)`,
      ],
      externalEffects: "NONE",
      cmsRepairWiring: "NOT_WIRED",
      liveEvalWiring: "NOT_WIRED",
    };
  }
  return evaluateEvalToolAttempt(tool);
}

/**
 * Default EVAL_ONLY forbidden-tool retry fence (T-X037 / T-US-018) — one
 * recorded honest forbid; further starts refuse without operational effect.
 */
export const DEFAULT_EVAL_TOOL_RETRY_MAX_ATTEMPTS = 1 as const;

export type EvalToolRetryBudgetDecision = {
  allowed: boolean;
  code: "RETRY_BUDGET_EXHAUSTED" | null;
  reason: string;
  attemptCount: number;
  maxAttempts: number;
  recordAttempt: boolean;
  /** True when the gate denial is a forbidden/unknown operational tool. */
  consumesBudget: boolean;
  externalEffects: "NONE";
  cmsRepairWiring: "NOT_WIRED";
  liveEvalWiring: "NOT_WIRED";
};

function evalToolGateConsumesRetryBudget(gate: EvalToolGate): boolean {
  return (
    !gate.allowed &&
    (gate.code === "EVAL_TOOL_FORBIDDEN" ||
      gate.code === "EVAL_TOOL_UNKNOWN_FORBIDDEN")
  );
}

/**
 * T-X037 retry fence: forbidden / unknown EVAL tool denials consume budget.
 * Starting another forbidden attempt past maxAttempts → RETRY_BUDGET_EXHAUSTED
 * without recording (never invent an operational effect to "recover").
 * Allowed judge/read tools do not consume. Live eval + CMS repair stay NOT_WIRED.
 */
export function evaluateEvalToolRetryBudget(input: {
  gate: EvalToolGate;
  /** Forbidden/unknown attempts already recorded. */
  attemptCount: number;
  /** True when deciding whether to start another forbidden-tool attempt. */
  startingNewAttempt: boolean;
  maxAttempts?: number;
}): EvalToolRetryBudgetDecision {
  const maxAttempts = Math.max(
    1,
    Math.floor(input.maxAttempts ?? DEFAULT_EVAL_TOOL_RETRY_MAX_ATTEMPTS),
  );
  const used = Math.max(0, Math.floor(input.attemptCount));
  const consumesBudget = evalToolGateConsumesRetryBudget(input.gate);

  if (!consumesBudget) {
    return {
      allowed: true,
      code: null,
      reason: "Allowed EVAL tool — retry budget not consumed",
      attemptCount: used,
      maxAttempts,
      recordAttempt: false,
      consumesBudget: false,
      externalEffects: "NONE",
      cmsRepairWiring: "NOT_WIRED",
      liveEvalWiring: "NOT_WIRED",
    };
  }

  const next = input.startingNewAttempt ? used + 1 : used;
  if (next > maxAttempts) {
    return {
      allowed: false,
      code: "RETRY_BUDGET_EXHAUSTED",
      reason: `EVAL_ONLY forbidden-tool retry attempt ${next} exceeds max ${maxAttempts} — refuse without operational effect`,
      attemptCount: used,
      maxAttempts,
      recordAttempt: false,
      consumesBudget: true,
      externalEffects: "NONE",
      cmsRepairWiring: "NOT_WIRED",
      liveEvalWiring: "NOT_WIRED",
    };
  }

  return {
    allowed: true,
    code: null,
    reason: `EVAL_ONLY forbid attempt ${Math.max(next, 1)} within retry budget ${maxAttempts}`,
    attemptCount: used,
    maxAttempts,
    recordAttempt: true,
    consumesBudget: true,
    externalEffects: "NONE",
    cmsRepairWiring: "NOT_WIRED",
    liveEvalWiring: "NOT_WIRED",
  };
}

/**
 * T-X037: RETRY_BUDGET_EXHAUSTED denials must not be persisted as another
 * forbidden-tool attempt (would inflate attemptCount past maxAttempts).
 */
export function shouldRecordEvalToolAttemptOnBudgetDenial(
  code: string | null,
): boolean {
  return code !== "RETRY_BUDGET_EXHAUSTED";
}

export type EvalToolOperationalEffectDecision = {
  /** True only for allowed EVAL tools within retry budget — still no publish/CRM/ads. */
  mayExecute: boolean;
  externalEffects: "NONE";
  cmsRepairWiring: "NOT_WIRED";
  liveEvalWiring: "NOT_WIRED";
  reason: string;
  code:
    | "EVAL_TOOL_FORBIDDEN"
    | "EVAL_TOOL_UNKNOWN_FORBIDDEN"
    | "RETRY_BUDGET_EXHAUSTED"
    | null;
};

/**
 * T-X037 operational-effect honesty under the retry fence: never invent a
 * publish / CRM / customer-message / ads side effect when the gate forbids or
 * retry budget is exhausted. Allowed judge/read tools may execute but still
 * pin externalEffects=NONE + live/CMS NOT_WIRED.
 */
export function resolveEvalToolOperationalEffect(input: {
  gate: EvalToolGate;
  retryBudget: EvalToolRetryBudgetDecision;
}): EvalToolOperationalEffectDecision {
  const wiring = {
    externalEffects: "NONE" as const,
    cmsRepairWiring: "NOT_WIRED" as const,
    liveEvalWiring: "NOT_WIRED" as const,
  };

  if (
    !input.retryBudget.allowed ||
    input.retryBudget.code === "RETRY_BUDGET_EXHAUSTED"
  ) {
    return {
      mayExecute: false,
      reason:
        "Retry budget exhausted / refused — no invented operational effect",
      code: "RETRY_BUDGET_EXHAUSTED",
      ...wiring,
    };
  }

  if (!input.gate.allowed) {
    return {
      mayExecute: false,
      reason: input.gate.reasons[0] ?? "EVAL_ONLY forbids operational tool",
      code: input.gate.code,
      ...wiring,
    };
  }

  return {
    mayExecute: true,
    reason:
      "Allowed EVAL tool within retry budget — execute with externalEffects NONE",
    code: null,
    ...wiring,
  };
}

export type EvalToolCapabilityClaimDecision = {
  /** Always EVAL_ONLY — never invent production/operational capability. */
  capability: typeof EvalCapability.EVAL_ONLY;
  operationalFallback: false;
  mayExecute: boolean;
  inventedOperationalCapability: false;
  externalEffects: "NONE";
  cmsRepairWiring: "NOT_WIRED";
  liveEvalWiring: "NOT_WIRED";
  reason: string;
  code:
    | "EVAL_TOOL_FORBIDDEN"
    | "EVAL_TOOL_UNKNOWN_FORBIDDEN"
    | "RETRY_BUDGET_EXHAUSTED"
    | null;
};

/**
 * T-X037 capability-claim honesty under the retry fence: never invent
 * production/operational capability (or operationalFallback) when the gate
 * forbids or retry budget is exhausted. Allowed EVAL tools may execute but
 * remain EVAL_ONLY with externalEffects NONE.
 */
export function resolveEvalToolCapabilityClaim(input: {
  effect: EvalToolOperationalEffectDecision;
}): EvalToolCapabilityClaimDecision {
  const wiring = {
    capability: EvalCapability.EVAL_ONLY,
    operationalFallback: false as const,
    inventedOperationalCapability: false as const,
    externalEffects: "NONE" as const,
    cmsRepairWiring: "NOT_WIRED" as const,
    liveEvalWiring: "NOT_WIRED" as const,
  };

  if (!input.effect.mayExecute) {
    return {
      mayExecute: false,
      reason:
        input.effect.reason ||
        "Capability claim refused — no invented operational authority",
      code: input.effect.code,
      ...wiring,
    };
  }

  return {
    mayExecute: true,
    reason:
      "EVAL_ONLY capability within retry budget — no operationalFallback invent",
    code: null,
    ...wiring,
  };
}

export type EvalToolAttemptEnvelope = {
  gate: EvalToolGate;
  retryBudget: EvalToolRetryBudgetDecision;
  effect: EvalToolOperationalEffectDecision;
  capability: EvalToolCapabilityClaimDecision;
  mayExecute: boolean;
  liveVerifiedClaimed: false;
  operationalSuccessClaimed: false;
  externalEffects: "NONE";
  cmsRepairWiring: "NOT_WIRED";
  liveEvalWiring: "NOT_WIRED";
  chatgptAdsWiring: "NOT_WIRED";
  reason: string;
};

/**
 * T-X037 attempt-envelope honesty (E18): seal gate + retry + effect +
 * capability into one record. Never invent live-verified success or
 * operational authority; ChatGPT Ads stay soft-skipped / NOT_WIRED.
 */
export function resolveEvalToolAttemptEnvelope(input: {
  rawTool: unknown;
  attemptCount: number;
  startingNewAttempt?: boolean;
  maxAttempts?: number;
}): EvalToolAttemptEnvelope {
  const gate = evaluateEvalToolAttemptRaw(input.rawTool);
  const retryBudget = evaluateEvalToolRetryBudget({
    gate,
    attemptCount: input.attemptCount,
    startingNewAttempt: input.startingNewAttempt ?? true,
    ...(input.maxAttempts !== undefined
      ? { maxAttempts: input.maxAttempts }
      : {}),
  });
  const effect = resolveEvalToolOperationalEffect({ gate, retryBudget });
  const capability = resolveEvalToolCapabilityClaim({ effect });
  const mayExecute = effect.mayExecute && capability.mayExecute;

  return {
    gate,
    retryBudget,
    effect,
    capability,
    mayExecute,
    liveVerifiedClaimed: false,
    operationalSuccessClaimed: false,
    externalEffects: "NONE",
    cmsRepairWiring: "NOT_WIRED",
    liveEvalWiring: "NOT_WIRED",
    chatgptAdsWiring: "NOT_WIRED",
    reason: mayExecute
      ? "EVAL_ONLY attempt envelope — execute without live/operational invent"
      : capability.reason || effect.reason || "EVAL_ONLY attempt envelope refused",
  };
}

export type EvalToolOutcomeClaimDecision = {
  outcome: "EXECUTE_EVAL_ONLY" | "REFUSED";
  inventedSuccess: false;
  inventedLivePass: false;
  verifiedClaimed: false;
  sandboxVerifiedClaimed: false;
  liveVerifiedClaimed: false;
  acceptedIsNotVerified: true;
  externalEffects: "NONE";
  cmsRepairWiring: "NOT_WIRED";
  liveEvalWiring: "NOT_WIRED";
  chatgptAdsWiring: "NOT_WIRED";
  reason: string;
};

/**
 * T-X037 outcome-claim honesty (E19): from a sealed attempt envelope, never
 * invent live/sandbox VERIFIED success or an operational pass. Fixture
 * ACCEPTED ≠ VERIFIED; Ads stay soft-skipped / NOT_WIRED.
 */
export function resolveEvalToolOutcomeClaim(input: {
  envelope: EvalToolAttemptEnvelope;
}): EvalToolOutcomeClaimDecision {
  const wiring = {
    inventedSuccess: false as const,
    inventedLivePass: false as const,
    verifiedClaimed: false as const,
    sandboxVerifiedClaimed: false as const,
    liveVerifiedClaimed: false as const,
    acceptedIsNotVerified: true as const,
    externalEffects: "NONE" as const,
    cmsRepairWiring: "NOT_WIRED" as const,
    liveEvalWiring: "NOT_WIRED" as const,
    chatgptAdsWiring: "NOT_WIRED" as const,
  };

  if (!input.envelope.mayExecute) {
    return {
      outcome: "REFUSED",
      reason:
        "Outcome claim refused — no invented VERIFIED/live success under EVAL_ONLY fence",
      ...wiring,
    };
  }

  return {
    outcome: "EXECUTE_EVAL_ONLY",
    reason:
      "EVAL_ONLY outcome within envelope — ACCEPTED ≠ VERIFIED; no live invent",
    ...wiring,
  };
}

export type EvalToolSideEffectClaimDecision = {
  sideEffects: "NONE";
  inventedSideEffect: false;
  publishAttempted: false;
  crmWriteAttempted: false;
  customerMessageAttempted: false;
  adsMutationAttempted: false;
  verifiedClaimed: false;
  acceptedIsNotVerified: true;
  externalEffects: "NONE";
  cmsRepairWiring: "NOT_WIRED";
  liveEvalWiring: "NOT_WIRED";
  chatgptAdsWiring: "NOT_WIRED";
  reason: string;
};

/**
 * T-X037 side-effect-claim honesty (E20): from an outcome claim, never invent
 * publish / CRM / customer-message / ads mutations. Even EXECUTE_EVAL_ONLY
 * keeps sideEffects=NONE; Ads soft-skip NOT_WIRED; ACCEPTED ≠ VERIFIED.
 */
export function resolveEvalToolSideEffectClaim(input: {
  outcome: EvalToolOutcomeClaimDecision;
}): EvalToolSideEffectClaimDecision {
  const base = {
    sideEffects: "NONE" as const,
    inventedSideEffect: false as const,
    publishAttempted: false as const,
    crmWriteAttempted: false as const,
    customerMessageAttempted: false as const,
    adsMutationAttempted: false as const,
    verifiedClaimed: false as const,
    acceptedIsNotVerified: true as const,
    externalEffects: "NONE" as const,
    cmsRepairWiring: "NOT_WIRED" as const,
    liveEvalWiring: "NOT_WIRED" as const,
    chatgptAdsWiring: "NOT_WIRED" as const,
  };

  if (input.outcome.outcome === "REFUSED") {
    return {
      ...base,
      reason:
        "Side-effect claim refused — no invented operational mutations under EVAL_ONLY fence",
    };
  }

  return {
    ...base,
    reason:
      "EVAL_ONLY execute — sideEffects NONE; no publish/CRM/message/ads invent",
  };
}

export type EvalToolReceiptClaimDecision = {
  receipt: "NONE" | "FIXTURE_ACCEPTED";
  inventedReceipt: false;
  inventedLiveReceipt: false;
  providerReceiptClaimed: false;
  liveReceiptClaimed: false;
  measuredReceiptClaimed: false;
  verifiedClaimed: false;
  sandboxVerifiedClaimed: false;
  liveVerifiedClaimed: false;
  acceptedIsNotVerified: true;
  externalEffects: "NONE";
  cmsRepairWiring: "NOT_WIRED";
  liveEvalWiring: "NOT_WIRED";
  chatgptAdsWiring: "NOT_WIRED";
  reason: string;
};

function sideEffectChainRefused(
  sideEffect: EvalToolSideEffectClaimDecision,
): boolean {
  return sideEffect.reason.startsWith("Side-effect claim refused");
}

/**
 * T-X037 receipt-claim honesty (E21): from a side-effect claim, never invent
 * live/provider/measured receipts or VERIFIED delivery. Fixture ACCEPTED only
 * when the chain executed under EVAL_ONLY; Ads stay NOT_WIRED.
 */
export function resolveEvalToolReceiptClaim(input: {
  sideEffect: EvalToolSideEffectClaimDecision;
  claimLiveVerifiedReceipt?: boolean;
  claimProviderReceipt?: boolean;
  claimMeasuredReceipt?: boolean;
}): EvalToolReceiptClaimDecision {
  const wiring = {
    inventedReceipt: false as const,
    inventedLiveReceipt: false as const,
    providerReceiptClaimed: false as const,
    liveReceiptClaimed: false as const,
    measuredReceiptClaimed: false as const,
    verifiedClaimed: false as const,
    sandboxVerifiedClaimed: false as const,
    liveVerifiedClaimed: false as const,
    acceptedIsNotVerified: true as const,
    externalEffects: "NONE" as const,
    cmsRepairWiring: "NOT_WIRED" as const,
    liveEvalWiring: "NOT_WIRED" as const,
    chatgptAdsWiring: "NOT_WIRED" as const,
  };

  if (
    input.claimLiveVerifiedReceipt ||
    input.claimProviderReceipt ||
    input.claimMeasuredReceipt
  ) {
    return {
      receipt: "NONE",
      reason:
        "FALSE_LIVE_RECEIPT_REFUSED — no invented live/provider/measured receipt under EVAL_ONLY",
      ...wiring,
    };
  }

  if (sideEffectChainRefused(input.sideEffect)) {
    return {
      receipt: "NONE",
      reason:
        "Receipt claim refused — side-effect chain refused; no fixture receipt invent",
      ...wiring,
    };
  }

  return {
    receipt: "FIXTURE_ACCEPTED",
    reason:
      "EVAL_ONLY fixture receipt — ACCEPTED ≠ VERIFIED; no live/provider invent",
    ...wiring,
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
 * Fail-closed grounding-used flag (T-X038). Only boolean `true` or the
 * exact literal string `"true"` counts — no trim/case folding, so
 * `"TRUE"` / `" true "` never invent grounding use.
 */
export function normalizeGroundingUsed(value: unknown): boolean {
  return value === true || value === "true";
}

/** Live eval transport stays NOT_WIRED for fixture evidence (T-X038). */
export function evalLiveWiringStatus(): "NOT_WIRED" {
  return "NOT_WIRED";
}

/**
 * Adjudicate a fixture answer. Grounding configured but unused → no grounded
 * pass (T-X038). Only SUPPORTED facts count as grounding.
 */
export function adjudicateGroundedEvalCase(input: {
  caseDef: EvalSuiteCase;
  citedFactIds: string[];
  factLabels: ReadonlyMap<string, SupportLabelValue>;
  /** When false, model produced an answer without consulting grounding. */
  groundingUsed: boolean | string | number | null | undefined;
  /**
   * Optional claimed verdict — PASS while grounding is unmet is refused
   * (still returns NO_GROUNDING; never invents a grounded pass).
   */
  claimedVerdict?: EvalCaseVerdictValue;
}): GroundedEvalAdjudication {
  const groundingUsed = normalizeGroundingUsed(input.groundingUsed);
  const supportedCited = input.citedFactIds.filter(
    (id) => input.factLabels.get(id) === SupportLabel.SUPPORTED,
  );
  const reasons: string[] = [];

  if (input.caseDef.requiresGrounding && !groundingUsed) {
    const result: GroundedEvalAdjudication = {
      verdict: EvalCaseVerdict.NO_GROUNDING,
      citedFactIds: input.citedFactIds,
      supportedCitedFactIds: supportedCited,
      groundingUsed: false,
      reasons: [
        "Grounding configured but unused — no grounded pass (T-X038)",
      ],
    };
    if (input.claimedVerdict === EvalCaseVerdict.PASS) {
      result.reasons.push(
        "FALSE_GROUNDED_PASS_REFUSED — claimed PASS while grounding unused",
      );
    }
    return result;
  }

  if (
    input.caseDef.requiresGrounding &&
    (supportedCited.length === 0 || input.citedFactIds.length === 0)
  ) {
    const result: GroundedEvalAdjudication = {
      verdict: EvalCaseVerdict.NO_GROUNDING,
      citedFactIds: input.citedFactIds,
      supportedCitedFactIds: [],
      groundingUsed,
      reasons: [
        input.citedFactIds.length === 0
          ? "Empty citations — cannot claim grounded answer (T-X038)"
          : "No SUPPORTED fact citations — cannot claim grounded answer; UNKNOWN/HYPOTHESIS/missing labels do not count",
      ],
    };
    if (input.claimedVerdict === EvalCaseVerdict.PASS) {
      result.reasons.push(
        "FALSE_GROUNDED_PASS_REFUSED — claimed PASS without SUPPORTED grounding",
      );
    }
    return result;
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
      groundingUsed,
      reasons,
    };
  }

  reasons.push("Fixture EVAL_ONLY adjudication — SUPPORTED citations present");
  return {
    verdict: EvalCaseVerdict.PASS,
    citedFactIds: input.citedFactIds,
    supportedCitedFactIds: supportedCited,
    groundingUsed,
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
