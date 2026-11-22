import { describe, expect, it } from "vitest";
import { EvalCapability, EvalProvider, EvalToolClass } from "./evaluation.js";
import {
  GeminiDataUseDecision,
  GeminiEvalDesiredCapability,
  GeminiEvalTestMode,
  evaluateGeminiEvaluationConnect,
  geminiConnectOperationalToolRefused,
} from "./gemini-evaluation-connect.js";

const now = "2026-11-22T22:30:00.000Z";

function validInput(
  overrides: Partial<
    Parameters<typeof evaluateGeminiEvaluationConnect>[0]
  > = {},
) {
  return {
    dataUseDecision: GeminiDataUseDecision.EVALUATION_ONLY_ACCEPTED,
    credentialBindingPresent: true,
    credentialRef: "cred-ref-gemini-eval-masked",
    modelCapabilitySnapshotPresent: true,
    modelCapabilitySnapshotAtIso: "2026-11-22T21:30:00.000Z",
    selectedModelId: "gemini-fixture-eval",
    supportedToolSnapshot: ["read_evidence", "judge_answer", "compare_golden"],
    testMode: GeminiEvalTestMode.FIXED_CORPUS,
    budgetCapPresent: true,
    budgetCapRevision: "gemini-bp-rev-1",
    maxCostMinor: 25,
    smokeTestRequested: true,
    desiredCapability: GeminiEvalDesiredCapability.EVAL_ONLY,
    requestLiveEvalWiring: false,
    ...overrides,
  };
}

describe("evaluateGeminiEvaluationConnect (T-US-017)", () => {
  it("connects Gemini Evaluation as EVAL_ONLY", () => {
    const result = evaluateGeminiEvaluationConnect(validInput(), now);
    expect(result.allowed).toBe(true);
    expect(result.code).toBe("GEMINI_EVALUATION_EVAL_ONLY_CONNECTED");
    expect(result.dataUseAccepted).toBe(true);
    expect(result.credentialReady).toBe(true);
    expect(result.modelSnapshotReady).toBe(true);
    expect(result.testModeReady).toBe(true);
    expect(result.capability).toBe(EvalCapability.EVAL_ONLY);
    expect(result.operationalFallback).toBe(false);
    expect(result.liveEvalWiring).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
    expect(result.canPublish).toBe(false);
    expect(result.canRespondToCustomers).toBe(false);
    expect(result.smokeArtifactId).toBe(
      "smoke-gemini-eval-gemini-fixture-eval-FIXED_CORPUS",
    );
    expect(result.usageLedgerEntry?.synthetic).toBe(true);
    expect(result.usageLedgerEntry?.testMode).toBe(
      GeminiEvalTestMode.FIXED_CORPUS,
    );
    if (!result.allowed || !result.connection) return;
    expect(result.connection.provider).toBe(EvalProvider.GEMINI);
    expect(result.connection.capability).toBe(EvalCapability.EVAL_ONLY);
  });

  it("accepts OPEN_WEB test mode", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({ testMode: GeminiEvalTestMode.OPEN_WEB }),
      now,
    );
    expect(result.allowed).toBe(true);
    expect(result.smokeArtifactId).toContain("OPEN_WEB");
  });

  it("refuses OPERATIONAL capability", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({
        desiredCapability: GeminiEvalDesiredCapability.OPERATIONAL,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("OPERATIONAL_CAPABILITY_REFUSED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses live eval wiring", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({ requestLiveEvalWiring: true }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("LIVE_EVAL_WIRING_NOT_WIRED");
  });

  it("requires data-use decision", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({ dataUseDecision: null }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("DATA_USE_DECISION_MISSING");
  });

  it("refuses rejected data-use", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({ dataUseDecision: GeminiDataUseDecision.REJECTED }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("DATA_USE_REJECTED");
  });

  it("requires credential binding", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({
        credentialBindingPresent: false,
        credentialRef: null,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("CREDENTIAL_BINDING_MISSING");
  });

  it("requires model/capability snapshot", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({
        modelCapabilitySnapshotPresent: false,
        selectedModelId: null,
        supportedToolSnapshot: null,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("MODEL_CAPABILITY_SNAPSHOT_MISSING");
  });

  it("requires test mode", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({ testMode: null }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("TEST_MODE_MISSING");
  });

  it("requires budget cap", () => {
    const result = evaluateGeminiEvaluationConnect(
      validInput({
        budgetCapPresent: false,
        maxCostMinor: null,
      }),
      now,
    );
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("BUDGET_CAP_MISSING");
  });

  it("keeps operational tools refused on the connect surface", () => {
    expect(geminiConnectOperationalToolRefused(EvalToolClass.PUBLISH)).toBe(
      true,
    );
    expect(
      geminiConnectOperationalToolRefused(EvalToolClass.CUSTOMER_MESSAGE),
    ).toBe(true);
  });
});
