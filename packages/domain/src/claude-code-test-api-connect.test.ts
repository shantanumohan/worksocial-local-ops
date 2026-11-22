import { describe, expect, it } from "vitest";
import { EvalCapability, EvalToolClass } from "./evaluation.js";
import {
  ClaudeConnectDesiredCapability,
  claudeConnectOperationalToolRefused,
  evaluateClaudeCodeTestApiConnect,
} from "./claude-code-test-api-connect.js";

const now = "2026-11-22T22:20:00.000Z";

function validInput(
  overrides: Partial<Parameters<typeof evaluateClaudeCodeTestApiConnect>[0]> = {},
) {
  return {
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
    ...overrides,
  };
}

describe("evaluateClaudeCodeTestApiConnect (T-US-015)", () => {
  it("connects Claude Code + test API as separate EVAL_ONLY surfaces", () => {
    const result = evaluateClaudeCodeTestApiConnect(validInput(), now);
    expect(result.allowed).toBe(true);
    expect(result.code).toBe("CLAUDE_CODE_TEST_API_EVAL_ONLY_CONNECTED");
    expect(result.readinessSeparated).toBe(true);
    expect(result.runtimeReady).toBe(true);
    expect(result.testApiReady).toBe(true);
    expect(result.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(result.operationalFallback).toBe(false);
    expect(result.liveEvalWiring).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
    expect(result.smokeArtifactId).toBe("smoke-claude-eval-claude-fixture-eval");
    expect(result.usageLedgerEntry?.synthetic).toBe(true);
    if (!result.allowed || !result.connections) return;
    expect(result.connections.runtime.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(result.connections.testApi.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(result.connections.runtime.connectionId).not.toBe(
      result.connections.testApi.connectionId,
    );
  });

  it("refuses OPERATIONAL capability", () => {
    const result = evaluateClaudeCodeTestApiConnect(
      validInput({
        desiredCapability: ClaudeConnectDesiredCapability.OPERATIONAL,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("OPERATIONAL_CAPABILITY_REFUSED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses live eval wiring", () => {
    const result = evaluateClaudeCodeTestApiConnect(
      validInput({ requestLiveEvalWiring: true }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("LIVE_EVAL_WIRING_NOT_WIRED");
  });

  it("requires runtime diagnostic", () => {
    const result = evaluateClaudeCodeTestApiConnect(
      validInput({
        runtimeDiagnosticPresent: false,
        runtimeDiagnosticAtIso: null,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("RUNTIME_DIAGNOSTIC_MISSING");
    expect(result.runtimeReady).toBe(false);
  });

  it("requires test API binding", () => {
    const result = evaluateClaudeCodeTestApiConnect(
      validInput({
        testApiBindingPresent: false,
        testApiCredentialRef: null,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("TEST_API_BINDING_MISSING");
  });

  it("requires model catalog", () => {
    const result = evaluateClaudeCodeTestApiConnect(
      validInput({
        modelCatalogPresent: false,
        selectedModelId: null,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("MODEL_CATALOG_MISSING");
  });

  it("requires budget policy", () => {
    const result = evaluateClaudeCodeTestApiConnect(
      validInput({
        budgetPolicyPresent: false,
        maxCostMinor: null,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("BUDGET_POLICY_MISSING");
  });

  it("keeps operational tools refused on the connect surface", () => {
    expect(claudeConnectOperationalToolRefused(EvalToolClass.PUBLISH)).toBe(
      true,
    );
    expect(
      claudeConnectOperationalToolRefused(EvalToolClass.CUSTOMER_MESSAGE),
    ).toBe(true);
  });
});
