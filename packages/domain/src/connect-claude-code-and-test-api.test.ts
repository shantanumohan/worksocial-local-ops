import { describe, expect, it } from "vitest";
import { EvalCapability } from "./evaluation.js";
import {
  CONNECT_CLAUDE_CODE_AND_TEST_API_RELATED_CASE_IDS,
  evaluateConnectClaudeCodeAndTestApi,
  type ConnectClaudeCodeAndTestApiInput,
} from "./connect-claude-code-and-test-api.js";

function baseInput(
  overrides: Partial<ConnectClaudeCodeAndTestApiInput> = {},
): ConnectClaudeCodeAndTestApiInput {
  return {
    packageId: "pkg-f08-1",
    installation: {
      installId: "claude-code-fixture-bin",
      authStatus: "AUTHENTICATED",
      diagnosticAtIso: "2026-11-23T02:10:00.000Z",
    },
    testApiBinding: {
      credentialRef: "broker:claude-test-api:fixture-ref-1",
      bindingAtIso: "2026-11-23T02:11:00.000Z",
    },
    modelCatalog: {
      catalogAtIso: "2026-11-23T02:12:00.000Z",
      models: [
        { modelId: "claude-fixture-haiku", displayName: "Fixture Haiku" },
        { modelId: "claude-fixture-sonnet", displayName: "Fixture Sonnet" },
      ],
    },
    budgetPolicy: {
      revision: "budget-pol-f08-r1",
      maxCostMinor: 25,
      selectedModelId: "claude-fixture-haiku",
    },
    smokeTest: {
      consented: true,
      artifactId: "smoke-claude-eval-f08-1",
      usageLedgerEntry: {
        modelId: "claude-fixture-haiku",
        costMinor: 1,
        synthetic: true,
      },
    },
    evalOnlyReady: {
      capability: EvalCapability.EVAL_ONLY,
      operationalFallback: false,
      testAdapterEnabled: true,
      productionWrites: false,
    },
    attemptOperationalCapability: false,
    claimLiveVerifiedEval: false,
    requestLiveEvalWiring: false,
    ...overrides,
  };
}

describe("evaluateConnectClaudeCodeAndTestApi (T-F08)", () => {
  it("records complete F08 evidence package", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "CONNECT_CLAUDE_CODE_AND_TEST_API_EVIDENCE_RECORDED",
    );
    expect(decision.liveEvalWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.authStatus).toBe("AUTHENTICATED");
    expect(decision.evidence.discoveredModelCount).toBe(2);
    expect(decision.evidence.selectedModelId).toBe("claude-fixture-haiku");
    expect(decision.evidence.smokeArtifactId).toBe("smoke-claude-eval-f08-1");
    expect(decision.evidence.usageLedgerSynthetic).toBe(true);
    expect(decision.evidence.capability).toBe("EVAL_ONLY");
    expect(decision.evidence.testAdapterEnabled).toBe(true);
    expect(decision.evidence.readinessSeparated).toBe(true);
    expect(decision.evidence.evalVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F08_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CONNECT_CLAUDE_CODE_AND_TEST_API_RELATED_CASE_IDS).toEqual([
      "T-F08",
    ]);
  });

  it("refuses missing installation diagnostic", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({
        installation: {
          installId: "",
          authStatus: "UNAUTHENTICATED",
          diagnosticAtIso: "",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INSTALLATION_DIAGNOSTIC_REQUIRED");
  });

  it("refuses raw-looking test API secret refs", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({
        testApiBinding: {
          credentialRef: "sk-raw-secret-not-broker",
          bindingAtIso: "2026-11-23T02:11:00.000Z",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("TEST_API_BINDING_REQUIRED");
  });

  it("refuses empty model catalog", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({
        modelCatalog: {
          catalogAtIso: "2026-11-23T02:12:00.000Z",
          models: [],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MODEL_CATALOG_REQUIRED");
  });

  it("refuses budget policy selecting unknown model", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({
        budgetPolicy: {
          revision: "budget-pol-f08-r1",
          maxCostMinor: 25,
          selectedModelId: "not-in-catalog",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BUDGET_POLICY_REQUIRED");
  });

  it("refuses missing consented smoke test", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({ smokeTest: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SMOKE_TEST_REQUIRED");
  });

  it("refuses operational capability", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({ attemptOperationalCapability: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OPERATIONAL_CAPABILITY_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({ claimLiveVerifiedEval: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_EVAL_REFUSED");
  });

  it("refuses live eval wiring", () => {
    const decision = evaluateConnectClaudeCodeAndTestApi(
      baseInput({ requestLiveEvalWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_EVAL_WIRING_NOT_WIRED");
    expect(decision.evidence).toBeNull();
  });
});
