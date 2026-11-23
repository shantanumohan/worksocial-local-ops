/**
 * Fixture proof for T-F08 — Connect Claude Code and the Claude test API.
 * Complete F08 evidence package: install+auth diagnostic, broker test-API
 * bind, dated model catalog, budget policy+selected model, consented
 * smoke+usage ledger, EVAL_ONLY test adapter enabled; unsafe claims refused;
 * live NOT_WIRED. Distinct from T-US-015 EVAL_ONLY connect summary and
 * open T-US-016 runtime vs API eval auth. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  EvalCapability,
  SoakProofKind,
  evaluateConnectClaudeCodeAndTestApi,
  type ConnectClaudeCodeAndTestApiInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ConnectClaudeCodeAndTestApiInput> = {},
): ConnectClaudeCodeAndTestApiInput {
  return {
    packageId: "pkg-f08-soak",
    installation: {
      installId: "claude-code-fixture-bin",
      authStatus: "AUTHENTICATED",
      diagnosticAtIso: "2026-11-23T02:10:00.000Z",
    },
    testApiBinding: {
      credentialRef: "broker:claude-test-api:fixture-ref-soak",
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
      revision: "budget-pol-f08-soak-r1",
      maxCostMinor: 25,
      selectedModelId: "claude-fixture-haiku",
    },
    smokeTest: {
      consented: true,
      artifactId: "smoke-claude-eval-f08-soak",
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

/**
 * Complete expected proof set for T-F08 fixture ACCEPTED.
 */
export function proofConnectClaudeCodeAndTestApi(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateConnectClaudeCodeAndTestApi(baseInput());
  if (
    happy.allowed &&
    happy.code === "CONNECT_CLAUDE_CODE_AND_TEST_API_EVIDENCE_RECORDED" &&
    happy.evidence.authStatus === "AUTHENTICATED" &&
    happy.evidence.discoveredModelCount === 2 &&
    happy.evidence.capability === "EVAL_ONLY" &&
    happy.evidence.testAdapterEnabled === true &&
    happy.evidence.readinessSeparated === true &&
    happy.evidence.evalVerifiedLive === false &&
    happy.evidence.usageLedgerSynthetic === true &&
    happy.liveEvalWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F08 evidence package → CONNECT_CLAUDE_CODE_AND_TEST_API_EVIDENCE_RECORDED; install+auth diagnostic; broker test-API bind; dated model catalog; budget policy+selected model; consented smoke+usage ledger; EVAL_ONLY test adapter enabled; evalVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noInstall = evaluateConnectClaudeCodeAndTestApi(
    baseInput({
      installation: {
        installId: "",
        authStatus: "UNAUTHENTICATED",
        diagnosticAtIso: "",
      },
    }),
  );
  if (
    !noInstall.allowed &&
    noInstall.code === "INSTALLATION_DIAGNOSTIC_REQUIRED"
  ) {
    details.push("empty install diagnostic → INSTALLATION_DIAGNOSTIC_REQUIRED");
  } else {
    passed = false;
    details.push(`Install diagnostic unexpectedly ${JSON.stringify(noInstall)}`);
  }

  const noBinding = evaluateConnectClaudeCodeAndTestApi(
    baseInput({
      testApiBinding: {
        credentialRef: "",
        bindingAtIso: "",
      },
    }),
  );
  if (!noBinding.allowed && noBinding.code === "TEST_API_BINDING_REQUIRED") {
    details.push("empty test-API binding → TEST_API_BINDING_REQUIRED");
  } else {
    passed = false;
    details.push(`Test-API binding unexpectedly ${JSON.stringify(noBinding)}`);
  }

  const noCatalog = evaluateConnectClaudeCodeAndTestApi(
    baseInput({
      modelCatalog: {
        catalogAtIso: "2026-11-23T02:12:00.000Z",
        models: [],
      },
    }),
  );
  if (!noCatalog.allowed && noCatalog.code === "MODEL_CATALOG_REQUIRED") {
    details.push("empty model catalog → MODEL_CATALOG_REQUIRED");
  } else {
    passed = false;
    details.push(`Model catalog unexpectedly ${JSON.stringify(noCatalog)}`);
  }

  const noSmoke = evaluateConnectClaudeCodeAndTestApi(
    baseInput({ smokeTest: null }),
  );
  if (!noSmoke.allowed && noSmoke.code === "SMOKE_TEST_REQUIRED") {
    details.push("smokeTest=null → SMOKE_TEST_REQUIRED");
  } else {
    passed = false;
    details.push(`Smoke test unexpectedly ${JSON.stringify(noSmoke)}`);
  }

  const operational = evaluateConnectClaudeCodeAndTestApi(
    baseInput({ attemptOperationalCapability: true }),
  );
  if (
    !operational.allowed &&
    operational.code === "OPERATIONAL_CAPABILITY_REFUSED"
  ) {
    details.push(
      "attemptOperationalCapability → OPERATIONAL_CAPABILITY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Operational capability unexpectedly ${JSON.stringify(operational)}`);
  }

  const liveClaim = evaluateConnectClaudeCodeAndTestApi(
    baseInput({ claimLiveVerifiedEval: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_EVAL_REFUSED"
  ) {
    details.push("claimLiveVerifiedEval → FALSE_LIVE_VERIFIED_EVAL_REFUSED");
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateConnectClaudeCodeAndTestApi(
    baseInput({ requestLiveEvalWiring: true }),
  );
  if (!liveWire.allowed && liveWire.code === "LIVE_EVAL_WIRING_NOT_WIRED") {
    details.push("requestLiveEvalWiring → LIVE_EVAL_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveEvalWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-015 (EVAL_ONLY connect summary) and T-US-016 (runtime vs API eval auth) — complete F08 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CONNECT_CLAUDE_CODE_AND_TEST_API,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-connect-claude-code-and-test-api-f08",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
