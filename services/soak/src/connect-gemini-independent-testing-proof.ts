/**
 * Fixture proof for T-F09 — Connect Gemini for independent testing.
 * Complete F09 evidence package: data-use decision, broker credential,
 * dated model/capability snapshot, evaluation condition, consented smoke
 * under cap + provider receipt, EVAL_ONLY save (no publish/customer reply);
 * unsafe claims refused; live NOT_WIRED. Distinct from T-US-017 EVAL_ONLY
 * connect summary and T-US-018/T-X037 operational tool forbid.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  EvalCapability,
  GeminiIndependentDataUseDecision,
  GeminiIndependentTestMode,
  SoakProofKind,
  evaluateConnectGeminiIndependentTesting,
  type ConnectGeminiIndependentTestingInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ConnectGeminiIndependentTestingInput> = {},
): ConnectGeminiIndependentTestingInput {
  return {
    packageId: "pkg-f09-soak",
    dataUseDecision:
      GeminiIndependentDataUseDecision.EVALUATION_ONLY_ACCEPTED,
    credentialBinding: {
      credentialRef: "broker:gemini-eval:fixture-ref-soak",
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
      conditionId: "cond-f09-fixed-corpus-soak",
    },
    budgetCap: {
      revision: "budget-cap-f09-soak-r1",
      maxCostMinor: 25,
      selectedModelId: "gemini-fixture-flash",
    },
    providerTestReceipt: {
      consented: true,
      artifactId: "smoke-gemini-eval-f09-soak",
      providerResponseId: "resp-gemini-fixture-soak",
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

/**
 * Complete expected proof set for T-F09 fixture ACCEPTED.
 */
export function proofConnectGeminiIndependentTesting(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateConnectGeminiIndependentTesting(baseInput());
  if (
    happy.allowed &&
    happy.code === "CONNECT_GEMINI_INDEPENDENT_TESTING_EVIDENCE_RECORDED" &&
    happy.evidence.dataUseDecision === "EVALUATION_ONLY_ACCEPTED" &&
    happy.evidence.discoveredModelCount === 2 &&
    happy.evidence.supportedToolCount === 2 &&
    happy.evidence.testMode === "FIXED_CORPUS" &&
    happy.evidence.capability === "EVAL_ONLY" &&
    happy.evidence.canPublish === false &&
    happy.evidence.canRespondToCustomers === false &&
    happy.evidence.readinessSeparated === true &&
    happy.evidence.evalVerifiedLive === false &&
    happy.evidence.usageLedgerSynthetic === true &&
    happy.liveEvalWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F09 evidence package → CONNECT_GEMINI_INDEPENDENT_TESTING_EVIDENCE_RECORDED; data-use decision; broker credential; dated model/capability snapshot; evaluation condition; consented smoke under cap + provider receipt; EVAL_ONLY save; canPublish=false; canRespondToCustomers=false; evalVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noDataUse = evaluateConnectGeminiIndependentTesting(
    baseInput({ dataUseDecision: null }),
  );
  if (
    !noDataUse.allowed &&
    noDataUse.code === "DATA_USE_DECISION_REQUIRED"
  ) {
    details.push("dataUseDecision=null → DATA_USE_DECISION_REQUIRED");
  } else {
    passed = false;
    details.push(`Data-use decision unexpectedly ${JSON.stringify(noDataUse)}`);
  }

  const noBinding = evaluateConnectGeminiIndependentTesting(
    baseInput({
      credentialBinding: {
        credentialRef: "",
        bindingAtIso: "",
      },
    }),
  );
  if (
    !noBinding.allowed &&
    noBinding.code === "CREDENTIAL_BINDING_REQUIRED"
  ) {
    details.push("empty credential binding → CREDENTIAL_BINDING_REQUIRED");
  } else {
    passed = false;
    details.push(`Credential binding unexpectedly ${JSON.stringify(noBinding)}`);
  }

  const noSnapshot = evaluateConnectGeminiIndependentTesting(
    baseInput({
      modelCapabilitySnapshot: {
        snapshotAtIso: "2026-11-23T03:11:00.000Z",
        models: [],
        supportedTools: [],
      },
    }),
  );
  if (
    !noSnapshot.allowed &&
    noSnapshot.code === "MODEL_CAPABILITY_SNAPSHOT_REQUIRED"
  ) {
    details.push(
      "empty model/capability snapshot → MODEL_CAPABILITY_SNAPSHOT_REQUIRED",
    );
  } else {
    passed = false;
    details.push(
      `Model capability snapshot unexpectedly ${JSON.stringify(noSnapshot)}`,
    );
  }

  const noCondition = evaluateConnectGeminiIndependentTesting(
    baseInput({ evaluationCondition: null }),
  );
  if (
    !noCondition.allowed &&
    noCondition.code === "EVALUATION_CONDITION_REQUIRED"
  ) {
    details.push("evaluationCondition=null → EVALUATION_CONDITION_REQUIRED");
  } else {
    passed = false;
    details.push(
      `Evaluation condition unexpectedly ${JSON.stringify(noCondition)}`,
    );
  }

  const noReceipt = evaluateConnectGeminiIndependentTesting(
    baseInput({ providerTestReceipt: null }),
  );
  if (
    !noReceipt.allowed &&
    noReceipt.code === "PROVIDER_TEST_RECEIPT_REQUIRED"
  ) {
    details.push("providerTestReceipt=null → PROVIDER_TEST_RECEIPT_REQUIRED");
  } else {
    passed = false;
    details.push(
      `Provider test receipt unexpectedly ${JSON.stringify(noReceipt)}`,
    );
  }

  const operational = evaluateConnectGeminiIndependentTesting(
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
    details.push(
      `Operational capability unexpectedly ${JSON.stringify(operational)}`,
    );
  }

  const liveClaim = evaluateConnectGeminiIndependentTesting(
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

  const liveWire = evaluateConnectGeminiIndependentTesting(
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
    "Distinct from T-US-017 (EVAL_ONLY connect summary) and T-US-018/T-X037 (operational tool forbid) — complete F09 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CONNECT_GEMINI_INDEPENDENT_TESTING,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-connect-gemini-independent-testing-f09",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
