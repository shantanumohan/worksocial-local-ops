/**
 * T-F08 — Connect Claude Code and the Claude test API (complete F08 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F08 evidence
 * package — local Claude Code installation + authentication diagnostic,
 * broker-held test-API credential binding (masked), dated model catalog with
 * discovered models, evaluation model + max-cost budget policy revision,
 * consented synthetic smoke-test artifact + usage ledger, EVAL_ONLY capability,
 * and test adapter enabled. Incomplete packages, operational capability,
 * production writes, and false live-verified claims are refused. Live eval
 * wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-015 (`CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY`) — this
 * records the complete F08 flow evidence package (smoke+consent+adapter
 * enablement required), not the EVAL_ONLY connect summary alone.
 * Distinct from open T-US-016 (runtime vs API eval auth separation).
 */

import { EvalCapability } from "./evaluation.js";

export type ClaudeCodeInstallationDiagnostic = {
  /** Installation path or binary id (redacted evidence — name only). */
  installId: string;
  /** Authentication status for the local Claude Code runtime. */
  authStatus: "AUTHENTICATED" | "UNAUTHENTICATED";
  /** Timestamped diagnostic receipt. */
  diagnosticAtIso: string;
};

export type ClaudeTestApiBinding = {
  /** Broker-held credential reference (masked; never raw secret). */
  credentialRef: string;
  bindingAtIso: string;
};

export type ClaudeModelCatalogEntry = {
  modelId: string;
  displayName: string;
};

export type ClaudeModelCatalog = {
  catalogAtIso: string;
  models: readonly ClaudeModelCatalogEntry[];
};

export type ClaudeBudgetPolicy = {
  revision: string;
  maxCostMinor: number;
  selectedModelId: string;
};

export type ClaudeSmokeTestEvidence = {
  /** Owner/admin consented to synthetic smoke. */
  consented: true;
  artifactId: string;
  usageLedgerEntry: {
    modelId: string;
    costMinor: number;
    synthetic: true;
  };
};

export type ClaudeEvalOnlyReadyStatus = {
  capability: typeof EvalCapability.EVAL_ONLY;
  operationalFallback: false;
  testAdapterEnabled: true;
  productionWrites: false;
};

export type ConnectClaudeCodeAndTestApiInput = {
  packageId: string;
  installation: ClaudeCodeInstallationDiagnostic;
  testApiBinding: ClaudeTestApiBinding;
  modelCatalog: ClaudeModelCatalog;
  budgetPolicy: ClaudeBudgetPolicy;
  smokeTest: ClaudeSmokeTestEvidence | null;
  evalOnlyReady: ClaudeEvalOnlyReadyStatus;
  /** Attempt OPERATIONAL capability — must refuse. */
  attemptOperationalCapability: boolean;
  /** Claim the F08 path is live-verified — must refuse offline. */
  claimLiveVerifiedEval: boolean;
  /** Request live eval wiring — must stay NOT_WIRED offline. */
  requestLiveEvalWiring: boolean;
};

export type ConnectClaudeCodeAndTestApiDecision =
  | {
      allowed: true;
      code: "CONNECT_CLAUDE_CODE_AND_TEST_API_EVIDENCE_RECORDED";
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        installId: string;
        authStatus: "AUTHENTICATED";
        runtimeDiagnosticAtIso: string;
        testApiCredentialRef: string;
        testApiBindingAtIso: string;
        modelCatalogAtIso: string;
        discoveredModelCount: number;
        selectedModelId: string;
        budgetPolicyRevision: string;
        maxCostMinor: number;
        smokeArtifactId: string;
        usageLedgerSynthetic: true;
        usageLedgerCostMinor: number;
        capability: "EVAL_ONLY";
        operationalFallback: false;
        testAdapterEnabled: true;
        readinessSeparated: true;
        evalVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F08_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "CLAUDE_CODE_AND_TEST_API_EVAL_ONLY_RECORDED";
        recoveryPath: "KEEP_EVAL_ONLY_TEST_ADAPTER_ENABLED";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "INSTALLATION_DIAGNOSTIC_REQUIRED"
        | "TEST_API_BINDING_REQUIRED"
        | "MODEL_CATALOG_REQUIRED"
        | "BUDGET_POLICY_REQUIRED"
        | "SMOKE_TEST_REQUIRED"
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
        installId: string | null;
        authStatus: string | null;
        runtimeDiagnosticAtIso: string | null;
        testApiCredentialRef: string | null;
        testApiBindingAtIso: string | null;
        modelCatalogAtIso: string | null;
        discoveredModelCount: number;
        selectedModelId: string | null;
        budgetPolicyRevision: string | null;
        maxCostMinor: number | null;
        smokeArtifactId: string | null;
        usageLedgerSynthetic: boolean;
        usageLedgerCostMinor: number | null;
        capability: string | null;
        operationalFallback: false;
        testAdapterEnabled: boolean;
        readinessSeparated: true;
        evalVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_INSTALLATION_DIAGNOSTIC"
          | "AWAITING_TEST_API_BINDING"
          | "AWAITING_MODEL_CATALOG"
          | "AWAITING_BUDGET_POLICY"
          | "AWAITING_SMOKE_TEST"
          | "AWAITING_EVAL_ONLY_READY";
        recoveryPath:
          | "VALIDATE_CLAUDE_CODE_INSTALL_AND_AUTH"
          | "BIND_BROKER_HELD_TEST_API_CREDENTIAL"
          | "DISCOVER_MODELS_AND_DATE_CATALOG"
          | "CHOOSE_EVAL_MODEL_AND_MAX_COST"
          | "RUN_CONSENTED_SYNTHETIC_SMOKE"
          | "ENABLE_TEST_ADAPTER_EVAL_ONLY"
          | "KEEP_EVAL_ONLY_TEST_ADAPTER_ENABLED";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CONNECT_CLAUDE_CODE_AND_TEST_API_RELATED_CASE_IDS = [
  "T-F08",
] as const;

function preservedInputCount(
  input: ConnectClaudeCodeAndTestApiInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.installation.installId.trim() ? 1 : 0) +
    (input.installation.diagnosticAtIso.trim() ? 1 : 0) +
    (input.testApiBinding.credentialRef.trim() ? 1 : 0) +
    (input.modelCatalog.catalogAtIso.trim() ? 1 : 0) +
    (input.budgetPolicy.revision.trim() ? 1 : 0) +
    (input.smokeTest?.artifactId.trim() ? 1 : 0) +
    (input.evalOnlyReady.capability === EvalCapability.EVAL_ONLY ? 1 : 0)
  );
}

function installationOk(d: ClaudeCodeInstallationDiagnostic): boolean {
  return (
    d.installId.trim().length > 0 &&
    d.authStatus === "AUTHENTICATED" &&
    d.diagnosticAtIso.trim().length > 0
  );
}

function testApiBindingOk(b: ClaudeTestApiBinding): boolean {
  return (
    b.credentialRef.trim().length > 0 &&
    !b.credentialRef.includes("sk-") &&
    b.bindingAtIso.trim().length > 0
  );
}

function modelCatalogOk(c: ClaudeModelCatalog): boolean {
  if (!c.catalogAtIso.trim() || c.models.length === 0) return false;
  const ids = c.models.map((m) => m.modelId.trim());
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return false;
  return c.models.every((m) => m.displayName.trim().length > 0);
}

function budgetPolicyOk(
  p: ClaudeBudgetPolicy,
  catalog: ClaudeModelCatalog,
): boolean {
  if (
    !p.revision.trim() ||
    !p.selectedModelId.trim() ||
    p.maxCostMinor < 0 ||
    !Number.isFinite(p.maxCostMinor)
  ) {
    return false;
  }
  return catalog.models.some(
    (m) => m.modelId.trim() === p.selectedModelId.trim(),
  );
}

function smokeTestOk(
  s: ClaudeSmokeTestEvidence | null,
  selectedModelId: string,
): s is ClaudeSmokeTestEvidence {
  if (!s) return false;
  return (
    s.consented === true &&
    s.artifactId.trim().length > 0 &&
    s.usageLedgerEntry.synthetic === true &&
    s.usageLedgerEntry.modelId.trim() === selectedModelId.trim() &&
    s.usageLedgerEntry.costMinor >= 0 &&
    Number.isFinite(s.usageLedgerEntry.costMinor)
  );
}

function evalOnlyReadyOk(r: ClaudeEvalOnlyReadyStatus): boolean {
  return (
    r.capability === EvalCapability.EVAL_ONLY &&
    r.operationalFallback === false &&
    r.testAdapterEnabled === true &&
    r.productionWrites === false
  );
}

/**
 * Evaluate the T-F08 connect-claude-code-and-test-api path offline.
 * Complete F08 evidence package → CONNECT_CLAUDE_CODE_AND_TEST_API_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateConnectClaudeCodeAndTestApi(
  input: ConnectClaudeCodeAndTestApiInput,
): ConnectClaudeCodeAndTestApiDecision {
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
      | "AWAITING_INSTALLATION_DIAGNOSTIC"
      | "AWAITING_TEST_API_BINDING"
      | "AWAITING_MODEL_CATALOG"
      | "AWAITING_BUDGET_POLICY"
      | "AWAITING_SMOKE_TEST"
      | "AWAITING_EVAL_ONLY_READY",
    recoveryPath:
      | "VALIDATE_CLAUDE_CODE_INSTALL_AND_AUTH"
      | "BIND_BROKER_HELD_TEST_API_CREDENTIAL"
      | "DISCOVER_MODELS_AND_DATE_CATALOG"
      | "CHOOSE_EVAL_MODEL_AND_MAX_COST"
      | "RUN_CONSENTED_SYNTHETIC_SMOKE"
      | "ENABLE_TEST_ADAPTER_EVAL_ONLY"
      | "KEEP_EVAL_ONLY_TEST_ADAPTER_ENABLED",
  ): NonNullable<
    Extract<
      ConnectClaudeCodeAndTestApiDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    installId: input.installation.installId.trim() || null,
    authStatus: input.installation.authStatus || null,
    runtimeDiagnosticAtIso: input.installation.diagnosticAtIso.trim() || null,
    testApiCredentialRef: input.testApiBinding.credentialRef.trim() || null,
    testApiBindingAtIso: input.testApiBinding.bindingAtIso.trim() || null,
    modelCatalogAtIso: input.modelCatalog.catalogAtIso.trim() || null,
    discoveredModelCount: input.modelCatalog.models.length,
    selectedModelId: input.budgetPolicy.selectedModelId.trim() || null,
    budgetPolicyRevision: input.budgetPolicy.revision.trim() || null,
    maxCostMinor:
      input.budgetPolicy.maxCostMinor >= 0
        ? input.budgetPolicy.maxCostMinor
        : null,
    smokeArtifactId: input.smokeTest?.artifactId.trim() || null,
    usageLedgerSynthetic: input.smokeTest?.usageLedgerEntry.synthetic === true,
    usageLedgerCostMinor: input.smokeTest?.usageLedgerEntry.costMinor ?? null,
    capability: input.evalOnlyReady.capability || null,
    operationalFallback: false,
    testAdapterEnabled: input.evalOnlyReady.testAdapterEnabled === true,
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
        "Live Claude eval wiring remains NOT_WIRED — refuse live wiring (T-F08)",
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
        "Refused false live-verified Claude eval claim offline (T-F08) — fixture ACCEPTED ≠ VERIFIED",
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
        "ENABLE_TEST_ADAPTER_EVAL_ONLY",
      ),
      reasons: [
        "Claude Code / test API F08 bind refuses OPERATIONAL capability — EVAL_ONLY only (T-F08)",
      ],
    };
  }

  if (!input.packageId.trim() || !installationOk(input.installation)) {
    return {
      allowed: false,
      code: "INSTALLATION_DIAGNOSTIC_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INSTALLATION_DIAGNOSTIC_INCOMPLETE",
        "AWAITING_INSTALLATION_DIAGNOSTIC",
        "VALIDATE_CLAUDE_CODE_INSTALL_AND_AUTH",
      ),
      reasons: [
        "F08 requires Claude Code install id, AUTHENTICATED status, and dated diagnostic (T-F08)",
      ],
    };
  }

  if (!testApiBindingOk(input.testApiBinding)) {
    return {
      allowed: false,
      code: "TEST_API_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "TEST_API_BINDING_INCOMPLETE",
        "AWAITING_TEST_API_BINDING",
        "BIND_BROKER_HELD_TEST_API_CREDENTIAL",
      ),
      reasons: [
        "F08 requires broker-held masked Claude test-API credential reference (T-F08)",
      ],
    };
  }

  if (!modelCatalogOk(input.modelCatalog)) {
    return {
      allowed: false,
      code: "MODEL_CATALOG_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MODEL_CATALOG_INCOMPLETE",
        "AWAITING_MODEL_CATALOG",
        "DISCOVER_MODELS_AND_DATE_CATALOG",
      ),
      reasons: [
        "F08 requires dated model catalog with at least one discovered model (T-F08)",
      ],
    };
  }

  if (!budgetPolicyOk(input.budgetPolicy, input.modelCatalog)) {
    return {
      allowed: false,
      code: "BUDGET_POLICY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BUDGET_POLICY_INCOMPLETE",
        "AWAITING_BUDGET_POLICY",
        "CHOOSE_EVAL_MODEL_AND_MAX_COST",
      ),
      reasons: [
        "F08 requires budget policy revision, selected catalog model, and non-negative max cost (T-F08)",
      ],
    };
  }

  if (!smokeTestOk(input.smokeTest, input.budgetPolicy.selectedModelId)) {
    return {
      allowed: false,
      code: "SMOKE_TEST_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SMOKE_TEST_INCOMPLETE",
        "AWAITING_SMOKE_TEST",
        "RUN_CONSENTED_SYNTHETIC_SMOKE",
      ),
      reasons: [
        "F08 requires consented synthetic smoke artifact and usage ledger matching selected model (T-F08)",
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
        "ENABLE_TEST_ADAPTER_EVAL_ONLY",
      ),
      reasons: [
        "F08 requires EVAL_ONLY ready status with test adapter enabled and production writes false (T-F08)",
      ],
    };
  }

  const smoke = input.smokeTest;

  return {
    allowed: true,
    code: "CONNECT_CLAUDE_CODE_AND_TEST_API_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      installId: input.installation.installId.trim(),
      authStatus: "AUTHENTICATED",
      runtimeDiagnosticAtIso: input.installation.diagnosticAtIso.trim(),
      testApiCredentialRef: input.testApiBinding.credentialRef.trim(),
      testApiBindingAtIso: input.testApiBinding.bindingAtIso.trim(),
      modelCatalogAtIso: input.modelCatalog.catalogAtIso.trim(),
      discoveredModelCount: input.modelCatalog.models.length,
      selectedModelId: input.budgetPolicy.selectedModelId.trim(),
      budgetPolicyRevision: input.budgetPolicy.revision.trim(),
      maxCostMinor: input.budgetPolicy.maxCostMinor,
      smokeArtifactId: smoke.artifactId.trim(),
      usageLedgerSynthetic: true,
      usageLedgerCostMinor: smoke.usageLedgerEntry.costMinor,
      capability: "EVAL_ONLY",
      operationalFallback: false,
      testAdapterEnabled: true,
      readinessSeparated: true,
      evalVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F08_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "CLAUDE_CODE_AND_TEST_API_EVAL_ONLY_RECORDED",
      recoveryPath: "KEEP_EVAL_ONLY_TEST_ADAPTER_ENABLED",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F08 evidence package recorded (install+auth diagnostic, broker test-API bind, dated model catalog, budget policy+selected model, consented smoke+usage ledger, EVAL_ONLY test adapter enabled); readinessSeparated; live NOT_WIRED; externalEffects NONE",
    ],
  };
}
