/**
 * Fixture proof for T-US-017 — Connect Gemini evaluation EVAL_ONLY.
 * Data-use decision, broker credential, model snapshot, test mode;
 * EVAL_ONLY only; live NOT_WIRED; synthetic smoke ledger only.
 * External effects: NONE. Distinct from T-US-015 / T-US-018 / T-X037.
 */

import { randomUUID } from "node:crypto";
import {
  EvalCapability,
  EvalToolClass,
  GeminiDataUseDecision,
  GeminiEvalDesiredCapability,
  GeminiEvalTestMode,
  SoakProofKind,
  evaluateGeminiEvaluationConnect,
  geminiConnectOperationalToolRefused,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-017 fixture ACCEPTED.
 */
export function proofConnectGeminiEvaluationEvalOnly(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateGeminiEvaluationConnect(
    {
      dataUseDecision: GeminiDataUseDecision.EVALUATION_ONLY_ACCEPTED,
      credentialBindingPresent: true,
      credentialRef: "cred-ref-gemini-eval-masked",
      modelCapabilitySnapshotPresent: true,
      modelCapabilitySnapshotAtIso: "2026-11-22T21:30:00.000Z",
      selectedModelId: "gemini-fixture-eval",
      supportedToolSnapshot: [
        "read_evidence",
        "judge_answer",
        "compare_golden",
      ],
      testMode: GeminiEvalTestMode.FIXED_CORPUS,
      budgetCapPresent: true,
      budgetCapRevision: "gemini-bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: true,
      desiredCapability: GeminiEvalDesiredCapability.EVAL_ONLY,
      requestLiveEvalWiring: false,
    },
    nowIso,
  );
  if (
    happy.allowed &&
    happy.code === "GEMINI_EVALUATION_EVAL_ONLY_CONNECTED" &&
    happy.dataUseAccepted === true &&
    happy.credentialReady === true &&
    happy.modelSnapshotReady === true &&
    happy.testModeReady === true &&
    happy.capability === EvalCapability.EVAL_ONLY &&
    happy.operationalFallback === false &&
    happy.liveEvalWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE" &&
    happy.canPublish === false &&
    happy.canRespondToCustomers === false &&
    happy.connection !== null &&
    happy.smokeArtifactId !== null &&
    happy.usageLedgerEntry?.synthetic === true
  ) {
    details.push(
      "Gemini Evaluation → GEMINI_EVALUATION_EVAL_ONLY_CONNECTED; data-use accepted; EVAL_ONLY; live NOT_WIRED; cannot publish/respond",
    );
  } else {
    passed = false;
    details.push(`Happy connect unexpectedly ${JSON.stringify(happy)}`);
  }

  const operational = evaluateGeminiEvaluationConnect(
    {
      dataUseDecision: GeminiDataUseDecision.EVALUATION_ONLY_ACCEPTED,
      credentialBindingPresent: true,
      credentialRef: "cred-ref-gemini-eval-masked",
      modelCapabilitySnapshotPresent: true,
      modelCapabilitySnapshotAtIso: "2026-11-22T21:30:00.000Z",
      selectedModelId: "gemini-fixture-eval",
      supportedToolSnapshot: ["read_evidence"],
      testMode: GeminiEvalTestMode.OPEN_WEB,
      budgetCapPresent: true,
      budgetCapRevision: "gemini-bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: false,
      desiredCapability: GeminiEvalDesiredCapability.OPERATIONAL,
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

  const live = evaluateGeminiEvaluationConnect(
    {
      dataUseDecision: GeminiDataUseDecision.EVALUATION_ONLY_ACCEPTED,
      credentialBindingPresent: true,
      credentialRef: "cred-ref-gemini-eval-masked",
      modelCapabilitySnapshotPresent: true,
      modelCapabilitySnapshotAtIso: "2026-11-22T21:30:00.000Z",
      selectedModelId: "gemini-fixture-eval",
      supportedToolSnapshot: ["read_evidence"],
      testMode: GeminiEvalTestMode.FIXED_CORPUS,
      budgetCapPresent: true,
      budgetCapRevision: "gemini-bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: false,
      desiredCapability: GeminiEvalDesiredCapability.EVAL_ONLY,
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

  const missingDataUse = evaluateGeminiEvaluationConnect(
    {
      dataUseDecision: null,
      credentialBindingPresent: true,
      credentialRef: "cred-ref-gemini-eval-masked",
      modelCapabilitySnapshotPresent: true,
      modelCapabilitySnapshotAtIso: "2026-11-22T21:30:00.000Z",
      selectedModelId: "gemini-fixture-eval",
      supportedToolSnapshot: ["read_evidence"],
      testMode: GeminiEvalTestMode.FIXED_CORPUS,
      budgetCapPresent: true,
      budgetCapRevision: "gemini-bp-rev-1",
      maxCostMinor: 25,
      smokeTestRequested: false,
      desiredCapability: GeminiEvalDesiredCapability.EVAL_ONLY,
      requestLiveEvalWiring: false,
    },
    nowIso,
  );
  if (
    !missingDataUse.allowed &&
    missingDataUse.code === "DATA_USE_DECISION_MISSING" &&
    missingDataUse.dataUseAccepted === false
  ) {
    details.push("Missing data-use decision → DATA_USE_DECISION_MISSING");
  } else {
    passed = false;
    details.push(
      `Missing data-use unexpectedly ${JSON.stringify(missingDataUse)}`,
    );
  }

  if (
    geminiConnectOperationalToolRefused(EvalToolClass.PUBLISH) &&
    geminiConnectOperationalToolRefused(EvalToolClass.CUSTOMER_MESSAGE)
  ) {
    details.push(
      "Operational tools remain EVAL_TOOL_FORBIDDEN on Gemini connect surface",
    );
  } else {
    passed = false;
    details.push("Operational tool refuse check failed");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  details.push(
    "Distinct from T-US-015 (Claude Code + test API) and T-US-018/T-X037 (operational tool forbid)",
  );

  return {
    proofId: `proof-gemini-evaluation-${randomUUID()}`,
    kind: SoakProofKind.CONNECT_GEMINI_EVALUATION_EVAL_ONLY,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us017-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
