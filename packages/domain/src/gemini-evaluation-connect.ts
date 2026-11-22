/**
 * T-US-017 — Connect Gemini evaluation (F09/SC-18) — EVAL_ONLY.
 *
 * Gemini Evaluation binds as EVAL_ONLY with a data-use decision, broker-held
 * masked credential, model/capability snapshot, and fixed-corpus or open-web
 * test mode. Live eval wiring stays NOT_WIRED. Synthetic smoke produces a
 * fixture ledger entry only. Cannot publish or respond to customers.
 * Distinct from T-US-015 (Claude Code + test API) and T-US-018 / T-X037
 * (operational tool forbid). Pure domain — no network I/O.
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

export const GeminiEvalTestMode = {
  FIXED_CORPUS: "FIXED_CORPUS",
  OPEN_WEB: "OPEN_WEB",
} as const;

export type GeminiEvalTestModeValue =
  (typeof GeminiEvalTestMode)[keyof typeof GeminiEvalTestMode];

export const GeminiEvalDesiredCapability = {
  EVAL_ONLY: "EVAL_ONLY",
  OPERATIONAL: "OPERATIONAL",
} as const;

export type GeminiEvalDesiredCapabilityValue =
  (typeof GeminiEvalDesiredCapability)[keyof typeof GeminiEvalDesiredCapability];

export const GeminiDataUseDecision = {
  EVALUATION_ONLY_ACCEPTED: "EVALUATION_ONLY_ACCEPTED",
  REJECTED: "REJECTED",
} as const;

export type GeminiDataUseDecisionValue =
  (typeof GeminiDataUseDecision)[keyof typeof GeminiDataUseDecision];

export type GeminiEvaluationConnectInput = {
  /** Owner reviewed Gemini Evaluation data-use policy. */
  dataUseDecision: GeminiDataUseDecisionValue | null;
  /** Broker-held restricted credential reference (masked). */
  credentialBindingPresent: boolean;
  credentialRef: string | null;
  /** Dated model/capability snapshot. */
  modelCapabilitySnapshotPresent: boolean;
  modelCapabilitySnapshotAtIso: string | null;
  selectedModelId: string | null;
  supportedToolSnapshot: readonly string[] | null;
  /** Evaluation condition: fixed-corpus or open-web. */
  testMode: GeminiEvalTestModeValue | null;
  /** Budget / displayed cost cap. */
  budgetCapPresent: boolean;
  budgetCapRevision: string | null;
  maxCostMinor: number | null;
  /** Minimal synthetic test under the displayed cap. */
  smokeTestRequested: boolean;
  desiredCapability: GeminiEvalDesiredCapabilityValue;
  /** Requested live/fleet wiring — must stay NOT_WIRED offline. */
  requestLiveEvalWiring: boolean;
};

export type GeminiEvaluationConnectDecision =
  | {
      allowed: true;
      code: "GEMINI_EVALUATION_EVAL_ONLY_CONNECTED";
      dataUseAccepted: true;
      credentialReady: true;
      modelSnapshotReady: true;
      testModeReady: true;
      capability: typeof EvalCapability.EVAL_ONLY;
      operationalFallback: false;
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      canPublish: false;
      canRespondToCustomers: false;
      smokeArtifactId: string;
      usageLedgerEntry: {
        modelId: string;
        costMinor: number;
        synthetic: true;
        testMode: GeminiEvalTestModeValue;
      };
      connection: EvalConnectionRecord;
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "DATA_USE_DECISION_MISSING"
        | "DATA_USE_REJECTED"
        | "CREDENTIAL_BINDING_MISSING"
        | "MODEL_CAPABILITY_SNAPSHOT_MISSING"
        | "TEST_MODE_MISSING"
        | "BUDGET_CAP_MISSING"
        | "SMOKE_TEST_REQUIRED"
        | "OPERATIONAL_CAPABILITY_REFUSED"
        | "LIVE_EVAL_WIRING_NOT_WIRED";
      dataUseAccepted: boolean;
      credentialReady: boolean;
      modelSnapshotReady: boolean;
      testModeReady: boolean;
      capability: EvalCapabilityValue | null;
      operationalFallback: false;
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      canPublish: false;
      canRespondToCustomers: false;
      smokeArtifactId: null;
      usageLedgerEntry: null;
      connection: null;
      reasons: string[];
    };

export const GEMINI_EVALUATION_RELATED_CASE_IDS = [
  "T-US-017",
  "T-F09",
] as const;

/**
 * Connect Gemini Evaluation as EVAL_ONLY.
 * Operational capability and live eval wiring are always refused offline.
 */
export function evaluateGeminiEvaluationConnect(
  input: GeminiEvaluationConnectInput,
  nowIso: string,
): GeminiEvaluationConnectDecision {
  const base = {
    operationalFallback: false as const,
    liveEvalWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    canPublish: false as const,
    canRespondToCustomers: false as const,
    smokeArtifactId: null as null,
    usageLedgerEntry: null as null,
    connection: null as null,
  };

  const dataUseAccepted =
    input.dataUseDecision === GeminiDataUseDecision.EVALUATION_ONLY_ACCEPTED;
  const credentialReady =
    input.credentialBindingPresent &&
    !!input.credentialRef &&
    input.credentialRef.trim() !== "";
  const modelSnapshotReady =
    input.modelCapabilitySnapshotPresent &&
    !!input.modelCapabilitySnapshotAtIso &&
    !!input.selectedModelId &&
    input.selectedModelId.trim() !== "" &&
    Array.isArray(input.supportedToolSnapshot);
  const testModeReady =
    input.testMode === GeminiEvalTestMode.FIXED_CORPUS ||
    input.testMode === GeminiEvalTestMode.OPEN_WEB;

  if (input.requestLiveEvalWiring) {
    return {
      allowed: false,
      code: "LIVE_EVAL_WIRING_NOT_WIRED",
      dataUseAccepted,
      credentialReady,
      modelSnapshotReady,
      testModeReady,
      capability: null,
      ...base,
      reasons: [
        "Live Gemini eval wiring remains NOT_WIRED — refuse live connect (T-US-017)",
      ],
    };
  }

  if (input.desiredCapability === GeminiEvalDesiredCapability.OPERATIONAL) {
    return {
      allowed: false,
      code: "OPERATIONAL_CAPABILITY_REFUSED",
      dataUseAccepted,
      credentialReady,
      modelSnapshotReady,
      testModeReady,
      capability: EvalCapability.EVAL_ONLY,
      ...base,
      reasons: [
        "Gemini Evaluation connect refuses OPERATIONAL capability — EVAL_ONLY only (T-US-017)",
      ],
    };
  }

  if (input.dataUseDecision === null) {
    return {
      allowed: false,
      code: "DATA_USE_DECISION_MISSING",
      dataUseAccepted: false,
      credentialReady,
      modelSnapshotReady,
      testModeReady,
      capability: null,
      ...base,
      reasons: [
        "Gemini Evaluation data-use decision required before EVAL_ONLY connect (T-US-017)",
      ],
    };
  }

  if (input.dataUseDecision === GeminiDataUseDecision.REJECTED) {
    return {
      allowed: false,
      code: "DATA_USE_REJECTED",
      dataUseAccepted: false,
      credentialReady,
      modelSnapshotReady,
      testModeReady,
      capability: null,
      ...base,
      reasons: [
        "Gemini Evaluation data-use policy rejected — no EVAL_ONLY connect (T-US-017)",
      ],
    };
  }

  if (!credentialReady) {
    return {
      allowed: false,
      code: "CREDENTIAL_BINDING_MISSING",
      dataUseAccepted: true,
      credentialReady: false,
      modelSnapshotReady,
      testModeReady,
      capability: null,
      ...base,
      reasons: [
        "Broker-held restricted Gemini credential reference required (T-US-017)",
      ],
    };
  }

  if (!modelSnapshotReady) {
    return {
      allowed: false,
      code: "MODEL_CAPABILITY_SNAPSHOT_MISSING",
      dataUseAccepted: true,
      credentialReady: true,
      modelSnapshotReady: false,
      testModeReady,
      capability: null,
      ...base,
      reasons: [
        "Dated Gemini model/capability snapshot and selected evaluation model required (T-US-017)",
      ],
    };
  }

  if (!testModeReady || input.testMode === null) {
    return {
      allowed: false,
      code: "TEST_MODE_MISSING",
      dataUseAccepted: true,
      credentialReady: true,
      modelSnapshotReady: true,
      testModeReady: false,
      capability: null,
      ...base,
      reasons: [
        "Gemini evaluation condition (FIXED_CORPUS or OPEN_WEB) required (T-US-017)",
      ],
    };
  }

  if (
    !input.budgetCapPresent ||
    !input.budgetCapRevision ||
    input.maxCostMinor === null ||
    !Number.isFinite(input.maxCostMinor) ||
    input.maxCostMinor < 0
  ) {
    return {
      allowed: false,
      code: "BUDGET_CAP_MISSING",
      dataUseAccepted: true,
      credentialReady: true,
      modelSnapshotReady: true,
      testModeReady: true,
      capability: null,
      ...base,
      reasons: [
        "Displayed Gemini evaluation budget cap and finite non-negative max cost required (T-US-017)",
      ],
    };
  }

  if (!input.smokeTestRequested) {
    return {
      allowed: false,
      code: "SMOKE_TEST_REQUIRED",
      dataUseAccepted: true,
      credentialReady: true,
      modelSnapshotReady: true,
      testModeReady: true,
      capability: null,
      ...base,
      reasons: [
        "Minimal Gemini evaluation smoke test receipt required before EVAL_ONLY connect (T-US-017 / T-F09)",
      ],
    };
  }

  const connection = createEvalConnection({
    connectionId: `gemini-eval-${input.credentialRef}`,
    provider: EvalProvider.GEMINI,
    displayName: "Gemini Evaluation (EVAL_ONLY)",
    fixtureOnly: true,
    nowIso,
  });

  const smokeArtifactId = `smoke-gemini-eval-${input.selectedModelId}-${input.testMode}`;
  const usageLedgerEntry = {
    modelId: input.selectedModelId!,
    costMinor: Math.min(input.maxCostMinor, 1),
    synthetic: true as const,
    testMode: input.testMode,
  };

  return {
    allowed: true,
    code: "GEMINI_EVALUATION_EVAL_ONLY_CONNECTED",
    dataUseAccepted: true,
    credentialReady: true,
    modelSnapshotReady: true,
    testModeReady: true,
    capability: EvalCapability.EVAL_ONLY,
    operationalFallback: false,
    liveEvalWiring: "NOT_WIRED",
    externalEffects: "NONE",
    canPublish: false,
    canRespondToCustomers: false,
    smokeArtifactId,
    usageLedgerEntry,
    connection,
    reasons: [
      "Gemini Evaluation connected as EVAL_ONLY — cannot publish or respond to customers",
      `dataUseDecision=${input.dataUseDecision}`,
      `credentialRef=${input.credentialRef}`,
      `modelSnapshotAt=${input.modelCapabilitySnapshotAtIso} selected=${input.selectedModelId}`,
      `supportedTools=${(input.supportedToolSnapshot ?? []).join(",")}`,
      `testMode=${input.testMode}`,
      `budgetCapRevision=${input.budgetCapRevision} maxCostMinor=${input.maxCostMinor}`,
      "liveEvalWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}

/** Operational tools remain forbidden on the Gemini EVAL_ONLY connect surface. */
export function geminiConnectOperationalToolRefused(
  tool: EvalToolClassValue = EvalToolClass.PUBLISH,
): boolean {
  if (!(FORBIDDEN_EVAL_TOOLS as readonly string[]).includes(tool)) {
    return false;
  }
  const gate = evaluateEvalToolAttempt(tool);
  return !gate.allowed && gate.code === "EVAL_TOOL_FORBIDDEN";
}
