/**
 * T-US-015 — Connect Claude Code + test API (F08/SC-18) — EVAL_ONLY.
 *
 * Claude Code (local runtime) readiness and Claude test-API readiness must be
 * separately visible. Both bind as EVAL_ONLY with no operational fallback.
 * Live eval wiring stays NOT_WIRED. Synthetic smoke produces a fixture ledger
 * entry only. Distinct from T-US-016 (runtime vs API eval auth separation) and
 * T-US-018 / T-X037 (operational tool forbid). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import {
  EvalCapability,
  EvalProvider,
  EvalToolClass,
  FORBIDDEN_EVAL_TOOLS,
  createEvalConnection,
  evaluateEvalToolAttempt,
  type EvalCapabilityValue,
  type EvalConnectionRecord,
  type EvalToolClassValue,
} from "./evaluation.js";

export const ClaudeConnectSurface = {
  CLAUDE_CODE_RUNTIME: "CLAUDE_CODE_RUNTIME",
  CLAUDE_TEST_API: "CLAUDE_TEST_API",
} as const;

export type ClaudeConnectSurfaceValue =
  (typeof ClaudeConnectSurface)[keyof typeof ClaudeConnectSurface];

export const ClaudeConnectDesiredCapability = {
  EVAL_ONLY: "EVAL_ONLY",
  OPERATIONAL: "OPERATIONAL",
} as const;

export type ClaudeConnectDesiredCapabilityValue =
  (typeof ClaudeConnectDesiredCapability)[keyof typeof ClaudeConnectDesiredCapability];

export type ClaudeCodeTestApiConnectInput = {
  /** Local Claude Code runtime diagnostic present and dated. */
  runtimeDiagnosticPresent: boolean;
  runtimeDiagnosticAtIso: string | null;
  /** Broker-held Claude test-API credential reference (masked). */
  testApiBindingPresent: boolean;
  testApiCredentialRef: string | null;
  /** Dated model catalog for the evaluation model choice. */
  modelCatalogPresent: boolean;
  modelCatalogAtIso: string | null;
  selectedModelId: string | null;
  /** Budget policy revision for max cost. */
  budgetPolicyPresent: boolean;
  budgetPolicyRevision: string | null;
  maxCostMinor: number | null;
  /** Synthetic smoke-test requested. */
  smokeTestRequested: boolean;
  desiredCapability: ClaudeConnectDesiredCapabilityValue;
  /** Requested live/fleet wiring — must stay NOT_WIRED offline. */
  requestLiveEvalWiring: boolean;
};

export type ClaudeCodeTestApiConnectDecision =
  | {
      allowed: true;
      code: "CLAUDE_CODE_TEST_API_EVAL_ONLY_CONNECTED";
      runtimeReady: true;
      testApiReady: true;
      readinessSeparated: true;
      capability: typeof EvalCapability.EVAL_ONLY;
      operationalFallback: false;
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      smokeArtifactId: string | null;
      usageLedgerEntry: {
        modelId: string;
        costMinor: number;
        synthetic: true;
      } | null;
      connections: {
        runtime: EvalConnectionRecord;
        testApi: EvalConnectionRecord;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "RUNTIME_DIAGNOSTIC_MISSING"
        | "TEST_API_BINDING_MISSING"
        | "MODEL_CATALOG_MISSING"
        | "BUDGET_POLICY_MISSING"
        | "OPERATIONAL_CAPABILITY_REFUSED"
        | "LIVE_EVAL_WIRING_NOT_WIRED";
      runtimeReady: boolean;
      testApiReady: boolean;
      readinessSeparated: true;
      capability: EvalCapabilityValue | null;
      operationalFallback: false;
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      smokeArtifactId: null;
      usageLedgerEntry: null;
      connections: null;
      reasons: string[];
    };

export const CLAUDE_CODE_TEST_API_RELATED_CASE_IDS = [
  "T-US-015",
  "T-F08",
] as const;

/**
 * Connect Claude Code runtime + Claude test API as separate EVAL_ONLY surfaces.
 * Operational capability and live eval wiring are always refused offline.
 */
export function evaluateClaudeCodeTestApiConnect(
  input: ClaudeCodeTestApiConnectInput,
  nowIso: string,
): ClaudeCodeTestApiConnectDecision {
  const base = {
    readinessSeparated: true as const,
    operationalFallback: false as const,
    liveEvalWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    smokeArtifactId: null as null,
    usageLedgerEntry: null as null,
    connections: null as null,
  };

  if (input.requestLiveEvalWiring) {
    return {
      allowed: false,
      code: "LIVE_EVAL_WIRING_NOT_WIRED",
      runtimeReady: input.runtimeDiagnosticPresent,
      testApiReady: input.testApiBindingPresent,
      capability: null,
      ...base,
      reasons: [
        "Live Claude eval wiring remains NOT_WIRED — refuse live connect (T-US-015)",
      ],
    };
  }

  if (input.desiredCapability === ClaudeConnectDesiredCapability.OPERATIONAL) {
    return {
      allowed: false,
      code: "OPERATIONAL_CAPABILITY_REFUSED",
      runtimeReady: input.runtimeDiagnosticPresent,
      testApiReady: input.testApiBindingPresent,
      capability: EvalCapability.EVAL_ONLY,
      ...base,
      reasons: [
        "Claude Code / test API connect refuses OPERATIONAL capability — EVAL_ONLY only (T-US-015)",
      ],
    };
  }

  if (!input.runtimeDiagnosticPresent || !input.runtimeDiagnosticAtIso) {
    return {
      allowed: false,
      code: "RUNTIME_DIAGNOSTIC_MISSING",
      runtimeReady: false,
      testApiReady: input.testApiBindingPresent,
      capability: null,
      ...base,
      reasons: [
        "Claude Code runtime diagnostic receipt required before EVAL_ONLY connect (T-US-015)",
      ],
    };
  }

  if (
    !input.testApiBindingPresent ||
    !input.testApiCredentialRef ||
    input.testApiCredentialRef.trim() === ""
  ) {
    return {
      allowed: false,
      code: "TEST_API_BINDING_MISSING",
      runtimeReady: true,
      testApiReady: false,
      capability: null,
      ...base,
      reasons: [
        "Broker-held Claude test-API credential reference required (T-US-015)",
      ],
    };
  }

  if (
    !input.modelCatalogPresent ||
    !input.modelCatalogAtIso ||
    !input.selectedModelId ||
    input.selectedModelId.trim() === ""
  ) {
    return {
      allowed: false,
      code: "MODEL_CATALOG_MISSING",
      runtimeReady: true,
      testApiReady: true,
      capability: null,
      ...base,
      reasons: [
        "Dated model catalog and selected evaluation model required (T-US-015)",
      ],
    };
  }

  if (
    !input.budgetPolicyPresent ||
    !input.budgetPolicyRevision ||
    input.maxCostMinor === null ||
    input.maxCostMinor < 0
  ) {
    return {
      allowed: false,
      code: "BUDGET_POLICY_MISSING",
      runtimeReady: true,
      testApiReady: true,
      capability: null,
      ...base,
      reasons: [
        "Budget policy revision and non-negative max cost required (T-US-015)",
      ],
    };
  }

  const runtime = createEvalConnection({
    connectionId: `claude-code-runtime-${input.runtimeDiagnosticAtIso}`,
    provider: EvalProvider.CLAUDE,
    displayName: "Claude Code runtime (EVAL_ONLY)",
    fixtureOnly: true,
    nowIso,
  });
  const testApi = createEvalConnection({
    connectionId: `claude-test-api-${input.testApiCredentialRef}`,
    provider: EvalProvider.CLAUDE,
    displayName: "Claude test API (EVAL_ONLY)",
    fixtureOnly: true,
    nowIso,
  });

  const smokeArtifactId = input.smokeTestRequested
    ? `smoke-claude-eval-${input.selectedModelId}`
    : null;
  const usageLedgerEntry = input.smokeTestRequested
    ? {
        modelId: input.selectedModelId,
        costMinor: Math.min(input.maxCostMinor, 1),
        synthetic: true as const,
      }
    : null;

  return {
    allowed: true,
    code: "CLAUDE_CODE_TEST_API_EVAL_ONLY_CONNECTED",
    runtimeReady: true,
    testApiReady: true,
    readinessSeparated: true,
    capability: EvalCapability.EVAL_ONLY,
    operationalFallback: false,
    liveEvalWiring: "NOT_WIRED",
    externalEffects: "NONE",
    smokeArtifactId,
    usageLedgerEntry,
    connections: { runtime, testApi },
    reasons: [
      "Claude Code runtime and Claude test API connected as separate EVAL_ONLY surfaces",
      `runtimeDiagnosticAt=${input.runtimeDiagnosticAtIso}`,
      `testApiCredentialRef=${input.testApiCredentialRef}`,
      `modelCatalogAt=${input.modelCatalogAtIso} selected=${input.selectedModelId}`,
      `budgetPolicyRevision=${input.budgetPolicyRevision} maxCostMinor=${input.maxCostMinor}`,
      "liveEvalWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}

/** Operational tools remain forbidden on the EVAL_ONLY connect surface. */
export function claudeConnectOperationalToolRefused(
  tool: EvalToolClassValue = EvalToolClass.PUBLISH,
): boolean {
  if (!(FORBIDDEN_EVAL_TOOLS as readonly string[]).includes(tool)) {
    return false;
  }
  const gate = evaluateEvalToolAttempt(tool);
  return !gate.allowed && gate.code === "EVAL_TOOL_FORBIDDEN";
}
