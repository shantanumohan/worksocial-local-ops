/**
 * T-F09 — Connect Gemini for independent testing (complete F09 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F09 evidence
 * package — data-use decision, broker-held masked credential, dated
 * model/capability snapshot with supported tools, evaluation condition
 * (fixed-corpus or open-web), consented synthetic smoke under the displayed
 * budget cap with provider response receipt, and EVAL_ONLY connection state
 * (cannot publish or respond to customers). Incomplete packages, operational
 * capability, production writes, and false live-verified claims are refused.
 * Live eval wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-017 (`CONNECT_GEMINI_EVALUATION_EVAL_ONLY`) — this
 * records the complete F09 flow evidence package (condition definition +
 * provider receipt + EVAL_ONLY save required), not the EVAL_ONLY connect
 * summary alone. Distinct from T-US-018 / T-X037 (operational tool forbid).
 */

import { EvalCapability } from "./evaluation.js";

export const GeminiIndependentTestMode = {
  FIXED_CORPUS: "FIXED_CORPUS",
  OPEN_WEB: "OPEN_WEB",
} as const;

export type GeminiIndependentTestModeValue =
  (typeof GeminiIndependentTestMode)[keyof typeof GeminiIndependentTestMode];

export const GeminiIndependentDataUseDecision = {
  EVALUATION_ONLY_ACCEPTED: "EVALUATION_ONLY_ACCEPTED",
  REJECTED: "REJECTED",
} as const;

export type GeminiIndependentDataUseDecisionValue =
  (typeof GeminiIndependentDataUseDecision)[keyof typeof GeminiIndependentDataUseDecision];

export type GeminiCredentialBinding = {
  /** Broker-held credential reference (masked; never raw secret). */
  credentialRef: string;
  bindingAtIso: string;
};

export type GeminiModelCapabilityEntry = {
  modelId: string;
  displayName: string;
};

export type GeminiModelCapabilitySnapshot = {
  snapshotAtIso: string;
  models: readonly GeminiModelCapabilityEntry[];
  supportedTools: readonly string[];
};

export type GeminiEvaluationCondition = {
  testMode: GeminiIndependentTestModeValue;
  conditionId: string;
};

export type GeminiBudgetCap = {
  revision: string;
  maxCostMinor: number;
  selectedModelId: string;
};

export type GeminiProviderTestReceipt = {
  /** Owner/admin consented to synthetic smoke under the displayed cap. */
  consented: true;
  artifactId: string;
  providerResponseId: string;
  usageLedgerEntry: {
    modelId: string;
    costMinor: number;
    synthetic: true;
    testMode: GeminiIndependentTestModeValue;
  };
};

export type GeminiEvalOnlyReadyStatus = {
  capability: typeof EvalCapability.EVAL_ONLY;
  operationalFallback: false;
  canPublish: false;
  canRespondToCustomers: false;
  productionWrites: false;
};

export type ConnectGeminiIndependentTestingInput = {
  packageId: string;
  dataUseDecision: GeminiIndependentDataUseDecisionValue | null;
  credentialBinding: GeminiCredentialBinding;
  modelCapabilitySnapshot: GeminiModelCapabilitySnapshot;
  evaluationCondition: GeminiEvaluationCondition | null;
  budgetCap: GeminiBudgetCap;
  providerTestReceipt: GeminiProviderTestReceipt | null;
  evalOnlyReady: GeminiEvalOnlyReadyStatus;
  /** Attempt OPERATIONAL capability — must refuse. */
  attemptOperationalCapability: boolean;
  /** Claim the F09 path is live-verified — must refuse offline. */
  claimLiveVerifiedEval: boolean;
  /** Request live eval wiring — must stay NOT_WIRED offline. */
  requestLiveEvalWiring: boolean;
};

export type ConnectGeminiIndependentTestingDecision =
  | {
      allowed: true;
      code: "CONNECT_GEMINI_INDEPENDENT_TESTING_EVIDENCE_RECORDED";
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        dataUseDecision: "EVALUATION_ONLY_ACCEPTED";
        credentialRef: string;
        credentialBindingAtIso: string;
        modelSnapshotAtIso: string;
        discoveredModelCount: number;
        supportedToolCount: number;
        selectedModelId: string;
        testMode: GeminiIndependentTestModeValue;
        conditionId: string;
        budgetCapRevision: string;
        maxCostMinor: number;
        smokeArtifactId: string;
        providerResponseId: string;
        usageLedgerSynthetic: true;
        usageLedgerCostMinor: number;
        capability: "EVAL_ONLY";
        operationalFallback: false;
        canPublish: false;
        canRespondToCustomers: false;
        readinessSeparated: true;
        evalVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F09_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "GEMINI_INDEPENDENT_TESTING_EVAL_ONLY_RECORDED";
        recoveryPath: "KEEP_EVAL_ONLY_NO_PUBLISH_NO_CUSTOMER_REPLY";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "DATA_USE_DECISION_REQUIRED"
        | "DATA_USE_REJECTED"
        | "CREDENTIAL_BINDING_REQUIRED"
        | "MODEL_CAPABILITY_SNAPSHOT_REQUIRED"
        | "EVALUATION_CONDITION_REQUIRED"
        | "BUDGET_CAP_REQUIRED"
        | "PROVIDER_TEST_RECEIPT_REQUIRED"
        | "EVAL_ONLY_READY_REQUIRED"
        | "OPERATIONAL_CAPABILITY_REFUSED"
        | "FALSE_LIVE_VERIFIED_EVAL_REFUSED"
        | "LIVE_EVAL_WIRING_NOT_WIRED";
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        dataUseDecision: string | null;
        credentialRef: string | null;
        credentialBindingAtIso: string | null;
        modelSnapshotAtIso: string | null;
        discoveredModelCount: number;
        supportedToolCount: number;
        selectedModelId: string | null;
        testMode: string | null;
        conditionId: string | null;
        budgetCapRevision: string | null;
        maxCostMinor: number | null;
        smokeArtifactId: string | null;
        providerResponseId: string | null;
        usageLedgerSynthetic: boolean;
        usageLedgerCostMinor: number | null;
        capability: string | null;
        operationalFallback: false;
        canPublish: false;
        canRespondToCustomers: false;
        readinessSeparated: true;
        evalVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_DATA_USE_DECISION"
          | "AWAITING_CREDENTIAL_BINDING"
          | "AWAITING_MODEL_CAPABILITY_SNAPSHOT"
          | "AWAITING_EVALUATION_CONDITION"
          | "AWAITING_BUDGET_CAP"
          | "AWAITING_PROVIDER_TEST_RECEIPT"
          | "AWAITING_EVAL_ONLY_READY";
        recoveryPath:
          | "REVIEW_AND_ACCEPT_GEMINI_DATA_USE"
          | "BIND_BROKER_HELD_RESTRICTED_CREDENTIAL"
          | "DISCOVER_MODELS_AND_SUPPORTED_TOOLS"
          | "CHOOSE_FIXED_CORPUS_OR_OPEN_WEB"
          | "SET_DISPLAYED_BUDGET_CAP"
          | "RUN_CONSENTED_SYNTHETIC_SMOKE_UNDER_CAP"
          | "SAVE_EVALUATION_ONLY"
          | "KEEP_EVAL_ONLY_NO_PUBLISH_NO_CUSTOMER_REPLY";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CONNECT_GEMINI_INDEPENDENT_TESTING_RELATED_CASE_IDS = [
  "T-F09",
] as const;

function preservedInputCount(
  input: ConnectGeminiIndependentTestingInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.dataUseDecision ? 1 : 0) +
    (input.credentialBinding.credentialRef.trim() ? 1 : 0) +
    (input.modelCapabilitySnapshot.snapshotAtIso.trim() ? 1 : 0) +
    (input.evaluationCondition?.conditionId.trim() ? 1 : 0) +
    (input.budgetCap.revision.trim() ? 1 : 0) +
    (input.providerTestReceipt?.artifactId.trim() ? 1 : 0) +
    (input.evalOnlyReady.capability === EvalCapability.EVAL_ONLY ? 1 : 0)
  );
}

function credentialBindingOk(b: GeminiCredentialBinding): boolean {
  return (
    b.credentialRef.trim().length > 0 &&
    !b.credentialRef.includes("AIza") &&
    !b.credentialRef.includes("sk-") &&
    b.bindingAtIso.trim().length > 0
  );
}

function modelCapabilitySnapshotOk(
  s: GeminiModelCapabilitySnapshot,
): boolean {
  if (!s.snapshotAtIso.trim() || s.models.length === 0) return false;
  const ids = s.models.map((m) => m.modelId.trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return false;
  if (!s.models.every((m) => m.displayName.trim().length > 0)) return false;
  if (s.supportedTools.length === 0) return false;
  const tools = s.supportedTools.map((t) => t.trim());
  if (tools.some((t) => !t) || new Set(tools).size !== tools.length) {
    return false;
  }
  return true;
}

function evaluationConditionOk(
  c: GeminiEvaluationCondition | null,
): c is GeminiEvaluationCondition {
  if (!c) return false;
  return (
    (c.testMode === GeminiIndependentTestMode.FIXED_CORPUS ||
      c.testMode === GeminiIndependentTestMode.OPEN_WEB) &&
    c.conditionId.trim().length > 0
  );
}

function budgetCapOk(
  p: GeminiBudgetCap,
  snapshot: GeminiModelCapabilitySnapshot,
): boolean {
  if (
    !p.revision.trim() ||
    !p.selectedModelId.trim() ||
    p.maxCostMinor < 0 ||
    !Number.isFinite(p.maxCostMinor)
  ) {
    return false;
  }
  return snapshot.models.some(
    (m) => m.modelId.trim() === p.selectedModelId.trim(),
  );
}

function providerTestReceiptOk(
  s: GeminiProviderTestReceipt | null,
  selectedModelId: string,
  testMode: GeminiIndependentTestModeValue,
  maxCostMinor: number,
): s is GeminiProviderTestReceipt {
  if (!s) return false;
  return (
    s.consented === true &&
    s.artifactId.trim().length > 0 &&
    s.providerResponseId.trim().length > 0 &&
    s.usageLedgerEntry.synthetic === true &&
    s.usageLedgerEntry.modelId.trim() === selectedModelId.trim() &&
    s.usageLedgerEntry.testMode === testMode &&
    s.usageLedgerEntry.costMinor >= 0 &&
    Number.isFinite(s.usageLedgerEntry.costMinor) &&
    s.usageLedgerEntry.costMinor <= maxCostMinor
  );
}

function evalOnlyReadyOk(r: GeminiEvalOnlyReadyStatus): boolean {
  return (
    r.capability === EvalCapability.EVAL_ONLY &&
    r.operationalFallback === false &&
    r.canPublish === false &&
    r.canRespondToCustomers === false &&
    r.productionWrites === false
  );
}

/**
 * Evaluate the T-F09 connect-gemini-independent-testing path offline.
 * Complete F09 evidence package → CONNECT_GEMINI_INDEPENDENT_TESTING_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateConnectGeminiIndependentTesting(
  input: ConnectGeminiIndependentTestingInput,
): ConnectGeminiIndependentTestingDecision {
  const base = {
    liveEvalWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_DATA_USE_DECISION"
      | "AWAITING_CREDENTIAL_BINDING"
      | "AWAITING_MODEL_CAPABILITY_SNAPSHOT"
      | "AWAITING_EVALUATION_CONDITION"
      | "AWAITING_BUDGET_CAP"
      | "AWAITING_PROVIDER_TEST_RECEIPT"
      | "AWAITING_EVAL_ONLY_READY",
    recoveryPath:
      | "REVIEW_AND_ACCEPT_GEMINI_DATA_USE"
      | "BIND_BROKER_HELD_RESTRICTED_CREDENTIAL"
      | "DISCOVER_MODELS_AND_SUPPORTED_TOOLS"
      | "CHOOSE_FIXED_CORPUS_OR_OPEN_WEB"
      | "SET_DISPLAYED_BUDGET_CAP"
      | "RUN_CONSENTED_SYNTHETIC_SMOKE_UNDER_CAP"
      | "SAVE_EVALUATION_ONLY"
      | "KEEP_EVAL_ONLY_NO_PUBLISH_NO_CUSTOMER_REPLY",
  ): NonNullable<
    Extract<
      ConnectGeminiIndependentTestingDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    dataUseDecision: input.dataUseDecision,
    credentialRef: input.credentialBinding.credentialRef.trim() || null,
    credentialBindingAtIso:
      input.credentialBinding.bindingAtIso.trim() || null,
    modelSnapshotAtIso:
      input.modelCapabilitySnapshot.snapshotAtIso.trim() || null,
    discoveredModelCount: input.modelCapabilitySnapshot.models.length,
    supportedToolCount: input.modelCapabilitySnapshot.supportedTools.length,
    selectedModelId: input.budgetCap.selectedModelId.trim() || null,
    testMode: input.evaluationCondition?.testMode ?? null,
    conditionId: input.evaluationCondition?.conditionId.trim() || null,
    budgetCapRevision: input.budgetCap.revision.trim() || null,
    maxCostMinor:
      input.budgetCap.maxCostMinor >= 0 ? input.budgetCap.maxCostMinor : null,
    smokeArtifactId: input.providerTestReceipt?.artifactId.trim() || null,
    providerResponseId:
      input.providerTestReceipt?.providerResponseId.trim() || null,
    usageLedgerSynthetic:
      input.providerTestReceipt?.usageLedgerEntry.synthetic === true,
    usageLedgerCostMinor:
      input.providerTestReceipt?.usageLedgerEntry.costMinor ?? null,
    capability: input.evalOnlyReady.capability || null,
    operationalFallback: false,
    canPublish: false,
    canRespondToCustomers: false,
    readinessSeparated: true,
    evalVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveEvalWiring) {
    return {
      allowed: false,
      code: "LIVE_EVAL_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live Gemini eval wiring remains NOT_WIRED — refuse live wiring (T-F09)",
      ],
    };
  }

  if (input.claimLiveVerifiedEval) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_EVAL_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified Gemini eval claim offline (T-F09) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptOperationalCapability) {
    return {
      allowed: false,
      code: "OPERATIONAL_CAPABILITY_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "OPERATIONAL_CAPABILITY_REFUSED",
        "BLOCKED",
        "SAVE_EVALUATION_ONLY",
      ),
      reasons: [
        "Gemini independent testing F09 bind refuses OPERATIONAL capability — EVAL_ONLY only; cannot publish or respond to customers (T-F09)",
      ],
    };
  }

  if (!input.packageId.trim() || input.dataUseDecision === null) {
    return {
      allowed: false,
      code: "DATA_USE_DECISION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DATA_USE_DECISION_INCOMPLETE",
        "AWAITING_DATA_USE_DECISION",
        "REVIEW_AND_ACCEPT_GEMINI_DATA_USE",
      ),
      reasons: [
        "F09 requires an explicit Gemini Evaluation data-use decision (T-F09)",
      ],
    };
  }

  if (
    input.dataUseDecision === GeminiIndependentDataUseDecision.REJECTED
  ) {
    return {
      allowed: false,
      code: "DATA_USE_REJECTED",
      ...base,
      evidence: blockedEvidence(
        "DATA_USE_REJECTED",
        "BLOCKED",
        "REVIEW_AND_ACCEPT_GEMINI_DATA_USE",
      ),
      reasons: [
        "F09 refuses bind when Gemini data-use policy is rejected (T-F09)",
      ],
    };
  }

  if (!credentialBindingOk(input.credentialBinding)) {
    return {
      allowed: false,
      code: "CREDENTIAL_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CREDENTIAL_BINDING_INCOMPLETE",
        "AWAITING_CREDENTIAL_BINDING",
        "BIND_BROKER_HELD_RESTRICTED_CREDENTIAL",
      ),
      reasons: [
        "F09 requires broker-held masked Gemini restricted credential reference (T-F09)",
      ],
    };
  }

  if (!modelCapabilitySnapshotOk(input.modelCapabilitySnapshot)) {
    return {
      allowed: false,
      code: "MODEL_CAPABILITY_SNAPSHOT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MODEL_CAPABILITY_SNAPSHOT_INCOMPLETE",
        "AWAITING_MODEL_CAPABILITY_SNAPSHOT",
        "DISCOVER_MODELS_AND_SUPPORTED_TOOLS",
      ),
      reasons: [
        "F09 requires dated model/capability snapshot with discovered models and supported tools (T-F09)",
      ],
    };
  }

  if (!evaluationConditionOk(input.evaluationCondition)) {
    return {
      allowed: false,
      code: "EVALUATION_CONDITION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "EVALUATION_CONDITION_INCOMPLETE",
        "AWAITING_EVALUATION_CONDITION",
        "CHOOSE_FIXED_CORPUS_OR_OPEN_WEB",
      ),
      reasons: [
        "F09 requires evaluation condition definition (fixed-corpus or open-web) (T-F09)",
      ],
    };
  }

  if (!budgetCapOk(input.budgetCap, input.modelCapabilitySnapshot)) {
    return {
      allowed: false,
      code: "BUDGET_CAP_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BUDGET_CAP_INCOMPLETE",
        "AWAITING_BUDGET_CAP",
        "SET_DISPLAYED_BUDGET_CAP",
      ),
      reasons: [
        "F09 requires displayed budget-cap revision, selected catalog model, and non-negative max cost (T-F09)",
      ],
    };
  }

  if (
    !providerTestReceiptOk(
      input.providerTestReceipt,
      input.budgetCap.selectedModelId,
      input.evaluationCondition.testMode,
      input.budgetCap.maxCostMinor,
    )
  ) {
    return {
      allowed: false,
      code: "PROVIDER_TEST_RECEIPT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PROVIDER_TEST_RECEIPT_INCOMPLETE",
        "AWAITING_PROVIDER_TEST_RECEIPT",
        "RUN_CONSENTED_SYNTHETIC_SMOKE_UNDER_CAP",
      ),
      reasons: [
        "F09 requires consented synthetic smoke under the displayed cap with provider response receipt (T-F09)",
      ],
    };
  }

  if (!evalOnlyReadyOk(input.evalOnlyReady)) {
    return {
      allowed: false,
      code: "EVAL_ONLY_READY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "EVAL_ONLY_READY_INCOMPLETE",
        "AWAITING_EVAL_ONLY_READY",
        "SAVE_EVALUATION_ONLY",
      ),
      reasons: [
        "F09 requires EVAL_ONLY ready status with publish and customer-reply denied (T-F09)",
      ],
    };
  }

  const receipt = input.providerTestReceipt;
  const condition = input.evaluationCondition;

  return {
    allowed: true,
    code: "CONNECT_GEMINI_INDEPENDENT_TESTING_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      dataUseDecision: "EVALUATION_ONLY_ACCEPTED",
      credentialRef: input.credentialBinding.credentialRef.trim(),
      credentialBindingAtIso: input.credentialBinding.bindingAtIso.trim(),
      modelSnapshotAtIso: input.modelCapabilitySnapshot.snapshotAtIso.trim(),
      discoveredModelCount: input.modelCapabilitySnapshot.models.length,
      supportedToolCount: input.modelCapabilitySnapshot.supportedTools.length,
      selectedModelId: input.budgetCap.selectedModelId.trim(),
      testMode: condition.testMode,
      conditionId: condition.conditionId.trim(),
      budgetCapRevision: input.budgetCap.revision.trim(),
      maxCostMinor: input.budgetCap.maxCostMinor,
      smokeArtifactId: receipt.artifactId.trim(),
      providerResponseId: receipt.providerResponseId.trim(),
      usageLedgerSynthetic: true,
      usageLedgerCostMinor: receipt.usageLedgerEntry.costMinor,
      capability: "EVAL_ONLY",
      operationalFallback: false,
      canPublish: false,
      canRespondToCustomers: false,
      readinessSeparated: true,
      evalVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F09_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "GEMINI_INDEPENDENT_TESTING_EVAL_ONLY_RECORDED",
      recoveryPath: "KEEP_EVAL_ONLY_NO_PUBLISH_NO_CUSTOMER_REPLY",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F09 evidence package recorded (data-use decision, broker credential, dated model/capability snapshot, evaluation condition, consented smoke under cap + provider receipt, EVAL_ONLY save; cannot publish or respond to customers); readinessSeparated; live NOT_WIRED; externalEffects NONE",
    ],
  };
}
