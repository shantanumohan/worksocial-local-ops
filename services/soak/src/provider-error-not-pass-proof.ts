/**
 * Fixture proof for T-US-034 — Provider error ≠ bad answer or pass.
 * Distinct outcome statuses; provider_error never graded as pass/fail;
 * pass-rate denominator excludes infrastructure errors; live NOT_WIRED.
 * Distinct from T-X039/T-US-058 (metric denominators), T-US-033
 * (adjudication+backlog), T-X038 (no-grounding). External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateProviderErrorNotPass,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-034 fixture ACCEPTED.
 */
export function proofProviderErrorNotPass(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const baseCases = [
    {
      caseId: "case-pass-hours",
      status: "pass" as const,
      claimedGradedAs: null,
      redacted: true as const,
    },
    {
      caseId: "case-fail-parking",
      status: "fail" as const,
      claimedGradedAs: null,
      redacted: true as const,
    },
    {
      caseId: "case-provider-timeout",
      status: "provider_error" as const,
      claimedGradedAs: null,
      redacted: true as const,
    },
    {
      caseId: "case-refusal-policy",
      status: "refusal" as const,
      claimedGradedAs: null,
      redacted: true as const,
    },
  ];

  const happy = evaluateProviderErrorNotPass({
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: baseCases,
    reportDenominatorHonest: true,
    claimLiveVerifiedGrading: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
  });
  if (
    happy.allowed &&
    happy.code === "PROVIDER_ERROR_DISTINCT_FROM_GRADED_ANSWER" &&
    happy.evidence.providerErrorCount === 1 &&
    happy.evidence.gradedDenominator === 2 &&
    happy.evidence.passRate === 0.5 &&
    happy.evidence.providerErrorGradedAsAnswer === false &&
    happy.evidence.providerErrorCountedAsPass === false &&
    happy.evidence.suiteVerifiedLive === false &&
    happy.liveEvalWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "provider_error distinct → PROVIDER_ERROR_DISTINCT_FROM_GRADED_ANSWER; gradedDenominator=2 (pass+fail); passRate=0.5; provider_error excluded",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const misgradeFail = evaluateProviderErrorNotPass({
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: [
      baseCases[0]!,
      {
        caseId: "case-provider-timeout",
        status: "provider_error",
        claimedGradedAs: "fail",
        redacted: true,
      },
    ],
    reportDenominatorHonest: true,
    claimLiveVerifiedGrading: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
  });
  if (
    !misgradeFail.allowed &&
    misgradeFail.code === "PROVIDER_ERROR_MISGRADED_AS_ANSWER"
  ) {
    details.push(
      "provider_error claimedGradedAs=fail → PROVIDER_ERROR_MISGRADED_AS_ANSWER",
    );
  } else {
    passed = false;
    details.push(`Misgrade-as-fail unexpectedly ${JSON.stringify(misgradeFail)}`);
  }

  const misgradePass = evaluateProviderErrorNotPass({
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: [
      baseCases[1]!,
      {
        caseId: "case-provider-timeout",
        status: "provider_error",
        claimedGradedAs: "pass",
        redacted: true,
      },
    ],
    reportDenominatorHonest: true,
    claimLiveVerifiedGrading: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
  });
  if (
    !misgradePass.allowed &&
    misgradePass.code === "PROVIDER_ERROR_MISGRADED_AS_ANSWER"
  ) {
    details.push(
      "provider_error claimedGradedAs=pass → PROVIDER_ERROR_MISGRADED_AS_ANSWER",
    );
  } else {
    passed = false;
    details.push(`Misgrade-as-pass unexpectedly ${JSON.stringify(misgradePass)}`);
  }

  const dishonestDenom = evaluateProviderErrorNotPass({
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: baseCases,
    reportDenominatorHonest: false,
    claimLiveVerifiedGrading: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
  });
  if (
    !dishonestDenom.allowed &&
    dishonestDenom.code === "PASS_RATE_DENOMINATOR_DISHONEST"
  ) {
    details.push(
      "reportDenominatorHonest=false → PASS_RATE_DENOMINATOR_DISHONEST",
    );
  } else {
    passed = false;
    details.push(
      `Dishonest denominator unexpectedly ${JSON.stringify(dishonestDenom)}`,
    );
  }

  const liveClaim = evaluateProviderErrorNotPass({
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: baseCases,
    reportDenominatorHonest: true,
    claimLiveVerifiedGrading: true,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
  });
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_GRADING_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedGrading → FALSE_LIVE_VERIFIED_GRADING_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateProviderErrorNotPass({
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: baseCases,
    reportDenominatorHonest: true,
    claimLiveVerifiedGrading: false,
    requestLiveEvalWiring: true,
    attemptProductionWrite: false,
  });
  if (!liveWire.allowed && liveWire.code === "LIVE_EVAL_WIRING_NOT_WIRED") {
    details.push("requestLiveEvalWiring → LIVE_EVAL_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  const prodWrite = evaluateProviderErrorNotPass({
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: baseCases,
    reportDenominatorHonest: true,
    claimLiveVerifiedGrading: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: true,
  });
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveEvalWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-X039/T-US-058 (metric denominators), T-US-033 (adjudication+backlog), T-X038 (no-grounding)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-provider-error-not-pass-${randomUUID()}`,
    kind: SoakProofKind.PROVIDER_ERROR_NOT_PASS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-provider-error-not-pass-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
