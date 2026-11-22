/**
 * Fixture proof for T-US-015 — Connect Claude Code + test API EVAL_ONLY.
 * Runtime and test-API readiness separated; EVAL_ONLY only; live NOT_WIRED;
 * synthetic smoke ledger only. External effects: NONE.
 * Distinct from T-US-016 / T-US-018 / T-X037.
 */

import { randomUUID } from "node:crypto";
import {
  ClaudeConnectDesiredCapability,
  EvalCapability,
  EvalToolClass,
  SoakProofKind,
  claudeConnectOperationalToolRefused,
  evaluateClaudeCodeTestApiConnect,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-015 fixture ACCEPTED.
 */
export function proofConnectClaudeCodeTestApiEvalOnly(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateClaudeCodeTestApiConnect(
    {
      runtimeDiagnosticPresent: true,
      runtimeDiagnosticAtIso: "2026-11-22T22:00:00.000Z",
      testApiBindingPresent: true,
      testApiCredentialRef: "cred-ref-claude-test-masked",
      modelCatalogPresent: true,
      modelCatalogAtIso: "2026-11-22T21:00:00.000Z",
      selectedModelId: "claude-fixture-eval",
      budgetPolicyPresent: true,
      budgetPolicyRevision: "bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: true,
      desiredCapability: ClaudeConnectDesiredCapability.EVAL_ONLY,
      requestLiveEvalWiring: false,
    },
    nowIso,
  );
  if (
    happy.allowed &&
    happy.code === "CLAUDE_CODE_TEST_API_EVAL_ONLY_CONNECTED" &&
    happy.readinessSeparated === true &&
    happy.runtimeReady === true &&
    happy.testApiReady === true &&
    happy.capability === EvalCapability.EVAL_ONLY &&
    happy.operationalFallback === false &&
    happy.liveEvalWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE" &&
    happy.connections !== null &&
    happy.connections.runtime.connectionId !==
      happy.connections.testApi.connectionId &&
    happy.smokeArtifactId !== null &&
    happy.usageLedgerEntry?.synthetic === true
  ) {
    details.push(
      "Claude Code runtime + test API → CLAUDE_CODE_TEST_API_EVAL_ONLY_CONNECTED; readinessSeparated; EVAL_ONLY; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy connect unexpectedly ${JSON.stringify(happy)}`);
  }

  const operational = evaluateClaudeCodeTestApiConnect(
    {
      runtimeDiagnosticPresent: true,
      runtimeDiagnosticAtIso: "2026-11-22T22:00:00.000Z",
      testApiBindingPresent: true,
      testApiCredentialRef: "cred-ref-claude-test-masked",
      modelCatalogPresent: true,
      modelCatalogAtIso: "2026-11-22T21:00:00.000Z",
      selectedModelId: "claude-fixture-eval",
      budgetPolicyPresent: true,
      budgetPolicyRevision: "bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: false,
      desiredCapability: ClaudeConnectDesiredCapability.OPERATIONAL,
      requestLiveEvalWiring: false,
    },
    nowIso,
  );
  if (
    !operational.allowed &&
    operational.code === "OPERATIONAL_CAPABILITY_REFUSED"
  ) {
    details.push("OPERATIONAL capability → OPERATIONAL_CAPABILITY_REFUSED");
  } else {
    passed = false;
    details.push(
      `Operational refuse unexpectedly ${JSON.stringify(operational)}`,
    );
  }

  const live = evaluateClaudeCodeTestApiConnect(
    {
      runtimeDiagnosticPresent: true,
      runtimeDiagnosticAtIso: "2026-11-22T22:00:00.000Z",
      testApiBindingPresent: true,
      testApiCredentialRef: "cred-ref-claude-test-masked",
      modelCatalogPresent: true,
      modelCatalogAtIso: "2026-11-22T21:00:00.000Z",
      selectedModelId: "claude-fixture-eval",
      budgetPolicyPresent: true,
      budgetPolicyRevision: "bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: false,
      desiredCapability: ClaudeConnectDesiredCapability.EVAL_ONLY,
      requestLiveEvalWiring: true,
    },
    nowIso,
  );
  if (!live.allowed && live.code === "LIVE_EVAL_WIRING_NOT_WIRED") {
    details.push("requestLiveEvalWiring → LIVE_EVAL_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live refuse unexpectedly ${JSON.stringify(live)}`);
  }

  const missingRuntime = evaluateClaudeCodeTestApiConnect(
    {
      runtimeDiagnosticPresent: false,
      runtimeDiagnosticAtIso: null,
      testApiBindingPresent: true,
      testApiCredentialRef: "cred-ref-claude-test-masked",
      modelCatalogPresent: true,
      modelCatalogAtIso: "2026-11-22T21:00:00.000Z",
      selectedModelId: "claude-fixture-eval",
      budgetPolicyPresent: true,
      budgetPolicyRevision: "bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: false,
      desiredCapability: ClaudeConnectDesiredCapability.EVAL_ONLY,
      requestLiveEvalWiring: false,
    },
    nowIso,
  );
  if (
    !missingRuntime.allowed &&
    missingRuntime.code === "RUNTIME_DIAGNOSTIC_MISSING" &&
    missingRuntime.runtimeReady === false
  ) {
    details.push("Missing runtime diagnostic → RUNTIME_DIAGNOSTIC_MISSING");
  } else {
    passed = false;
    details.push(
      `Missing runtime unexpectedly ${JSON.stringify(missingRuntime)}`,
    );
  }

  if (
    claudeConnectOperationalToolRefused(EvalToolClass.PUBLISH) &&
    claudeConnectOperationalToolRefused(EvalToolClass.CRM_WRITE)
  ) {
    details.push(
      "Operational tools remain EVAL_TOOL_FORBIDDEN on connect surface",
    );
  } else {
    passed = false;
    details.push("Operational tool refuse check failed");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  details.push(
    "Distinct from T-US-016 (runtime vs API eval auth) and T-US-018/T-X037 (operational tool forbid)",
  );

  return {
    proofId: `proof-claude-code-test-api-${randomUUID()}`,
    kind: SoakProofKind.CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us015-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
