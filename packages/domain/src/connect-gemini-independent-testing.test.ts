import { describe, expect, it } from "vitest";
import { EvalCapability } from "./evaluation.js";
import {
  CONNECT_GEMINI_INDEPENDENT_TESTING_RELATED_CASE_IDS,
  GeminiIndependentDataUseDecision,
  GeminiIndependentTestMode,
  evaluateConnectGeminiIndependentTesting,
  type ConnectGeminiIndependentTestingInput,
} from "./connect-gemini-independent-testing.js";

function baseInput(
  overrides: Partial<ConnectGeminiIndependentTestingInput> = {},
): ConnectGeminiIndependentTestingInput {
  return {
    packageId: "pkg-f09-1",
    dataUseDecision:
      GeminiIndependentDataUseDecision.EVALUATION_ONLY_ACCEPTED,
    credentialBinding: {
      credentialRef: "broker:gemini-eval:fixture-ref-1",
      bindingAtIso: "2026-11-23T03:10:00.000Z",
    },
    modelCapabilitySnapshot: {
      snapshotAtIso: "2026-11-23T03:11:00.000Z",
      models: [
        { modelId: "gemini-fixture-flash", displayName: "Fixture Flash" },
        { modelId: "gemini-fixture-pro", displayName: "Fixture Pro" },
      ],
      supportedTools: ["generateContent", "countTokens"],
    },
    evaluationCondition: {
      testMode: GeminiIndependentTestMode.FIXED_CORPUS,
      conditionId: "cond-f09-fixed-corpus-1",
    },
    budgetCap: {
      revision: "budget-cap-f09-r1",
      maxCostMinor: 25,
      selectedModelId: "gemini-fixture-flash",
    },
    providerTestReceipt: {
      consented: true,
      artifactId: "smoke-gemini-eval-f09-1",
      providerResponseId: "resp-gemini-fixture-1",
      usageLedgerEntry: {
        modelId: "gemini-fixture-flash",
        costMinor: 1,
        synthetic: true,
        testMode: GeminiIndependentTestMode.FIXED_CORPUS,
      },
    },
    evalOnlyReady: {
      capability: EvalCapability.EVAL_ONLY,
      operationalFallback: false,
      canPublish: false,
      canRespondToCustomers: false,
      productionWrites: false,
    },
    attemptOperationalCapability: false,
    claimLiveVerifiedEval: false,
    requestLiveEvalWiring: false,
    ...overrides,
  };
}

describe("evaluateConnectGeminiIndependentTesting (T-F09)", () => {
  it("records complete F09 evidence package", () => {
    const decision = evaluateConnectGeminiIndependentTesting(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "CONNECT_GEMINI_INDEPENDENT_TESTING_EVIDENCE_RECORDED",
    );
    expect(decision.liveEvalWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.dataUseDecision).toBe(
      "EVALUATION_ONLY_ACCEPTED",
    );
    expect(decision.evidence.discoveredModelCount).toBe(2);
    expect(decision.evidence.supportedToolCount).toBe(2);
    expect(decision.evidence.selectedModelId).toBe("gemini-fixture-flash");
    expect(decision.evidence.testMode).toBe("FIXED_CORPUS");
    expect(decision.evidence.smokeArtifactId).toBe("smoke-gemini-eval-f09-1");
    expect(decision.evidence.providerResponseId).toBe("resp-gemini-fixture-1");
    expect(decision.evidence.usageLedgerSynthetic).toBe(true);
    expect(decision.evidence.capability).toBe("EVAL_ONLY");
    expect(decision.evidence.canPublish).toBe(false);
    expect(decision.evidence.canRespondToCustomers).toBe(false);
    expect(decision.evidence.readinessSeparated).toBe(true);
    expect(decision.evidence.evalVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F09_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CONNECT_GEMINI_INDEPENDENT_TESTING_RELATED_CASE_IDS).toEqual([
      "T-F09",
    ]);
  });

  it("refuses missing data-use decision", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({ dataUseDecision: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DATA_USE_DECISION_REQUIRED");
  });

  it("refuses rejected data-use decision", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({
        dataUseDecision: GeminiIndependentDataUseDecision.REJECTED,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DATA_USE_REJECTED");
  });

  it("refuses raw-looking credential refs", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({
        credentialBinding: {
          credentialRef: "AIza-raw-secret-not-broker",
          bindingAtIso: "2026-11-23T03:10:00.000Z",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CREDENTIAL_BINDING_REQUIRED");
  });

  it("refuses empty model capability snapshot", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({
        modelCapabilitySnapshot: {
          snapshotAtIso: "2026-11-23T03:11:00.000Z",
          models: [],
          supportedTools: [],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MODEL_CAPABILITY_SNAPSHOT_REQUIRED");
  });

  it("refuses missing evaluation condition", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({ evaluationCondition: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("EVALUATION_CONDITION_REQUIRED");
  });

  it("refuses budget cap selecting unknown model", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({
        budgetCap: {
          revision: "budget-cap-f09-r1",
          maxCostMinor: 25,
          selectedModelId: "not-in-catalog",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BUDGET_CAP_REQUIRED");
  });

  it("refuses missing provider test receipt", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({ providerTestReceipt: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROVIDER_TEST_RECEIPT_REQUIRED");
  });

  it("refuses smoke over the displayed budget cap", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({
        providerTestReceipt: {
          consented: true,
          artifactId: "smoke-over-cap",
          providerResponseId: "resp-over",
          usageLedgerEntry: {
            modelId: "gemini-fixture-flash",
            costMinor: 100,
            synthetic: true,
            testMode: GeminiIndependentTestMode.FIXED_CORPUS,
          },
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROVIDER_TEST_RECEIPT_REQUIRED");
  });

  it("refuses operational capability", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({ attemptOperationalCapability: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OPERATIONAL_CAPABILITY_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({ claimLiveVerifiedEval: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_EVAL_REFUSED");
  });

  it("refuses live eval wiring", () => {
    const decision = evaluateConnectGeminiIndependentTesting(
      baseInput({ requestLiveEvalWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_EVAL_WIRING_NOT_WIRED");
    expect(decision.evidence).toBeNull();
  });
});
