/**
 * T-US-034 — Provider error ≠ bad answer or pass.
 *
 * Offline fixture gate (failure/gate family): eval/case outcomes keep distinct
 * statuses — pass, fail (bad answer), provider_error, refusal, not_run,
 * cancelled, partial. Infrastructure/provider errors must never be graded as
 * pass or fail, and must be excluded from the pass-rate denominator. Distinct
 * from T-X039/T-US-058 (metric observation denominators), T-US-033 (suite
 * adjudication + backlog), and T-X038 (no-grounding fail closed). Pure domain
 * — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External
 * effects: NONE.
 */

export type EvalOutcomeStatus =
  | "pass"
  | "fail"
  | "provider_error"
  | "refusal"
  | "not_run"
  | "cancelled"
  | "partial"
  | "queued"
  | "running";

/** Statuses that count in the graded answer denominator (pass rate). */
export const GRADED_ANSWER_STATUSES: readonly EvalOutcomeStatus[] = [
  "pass",
  "fail",
] as const;

/** Statuses that must never be silently remapped into graded answers. */
export const NON_GRADED_OUTCOME_STATUSES: readonly EvalOutcomeStatus[] = [
  "provider_error",
  "refusal",
  "not_run",
  "cancelled",
  "partial",
  "queued",
  "running",
] as const;

export type EvalOutcomeCase = {
  caseId: string;
  /** Honest recorded status — must not silently map provider_error → fail/pass. */
  status: EvalOutcomeStatus;
  /**
   * Optional misgrade attempt: claim the case was graded as pass/fail despite
   * a non-graded infrastructure status. Must be refused.
   */
  claimedGradedAs?: "pass" | "fail" | null;
  redacted: true;
};

export type ProviderErrorNotPassInput = {
  suiteId: string;
  suiteVersion: string;
  cases: EvalOutcomeCase[];
  /** Pass-rate report already computed with honest denominator. */
  reportDenominatorHonest: boolean;
  /** Claim live suite grading already verified — must refuse offline. */
  claimLiveVerifiedGrading: boolean;
  /** Request live provider eval wiring — must stay NOT_WIRED offline. */
  requestLiveEvalWiring: boolean;
  /** Attempt a production write from the eval surface — must refuse. */
  attemptProductionWrite: boolean;
};

export type ProviderErrorNotPassDecision =
  | {
      allowed: true;
      code: "PROVIDER_ERROR_DISTINCT_FROM_GRADED_ANSWER";
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        suiteId: string;
        suiteVersion: string;
        caseCount: number;
        passCount: number;
        failCount: number;
        providerErrorCount: number;
        nonGradedCount: number;
        gradedDenominator: number;
        passRate: number | null;
        providerErrorGradedAsAnswer: false;
        providerErrorCountedAsPass: false;
        productionWrites: false;
        suiteVerifiedLive: false;
        blockingDecision: string;
        currentState: "OUTCOMES_CLASSIFIED_HONEST";
        recoveryPath: "KEEP_PROVIDER_ERROR_DISTINCT_RECOMPUTE_DENOMINATOR";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "SUITE_IDENTITY_INCOMPLETE"
        | "CASE_OUTCOMES_REQUIRED"
        | "PROVIDER_ERROR_MISGRADED_AS_ANSWER"
        | "PASS_RATE_DENOMINATOR_DISHONEST"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_GRADING_REFUSED"
        | "LIVE_EVAL_WIRING_NOT_WIRED";
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        suiteId: string | null;
        suiteVersion: string | null;
        caseCount: number;
        passCount: number;
        failCount: number;
        providerErrorCount: number;
        nonGradedCount: number;
        gradedDenominator: number;
        passRate: number | null;
        providerErrorGradedAsAnswer: boolean;
        providerErrorCountedAsPass: boolean;
        productionWrites: false;
        suiteVerifiedLive: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_HONEST_CLASSIFICATION"
          | "AWAITING_DENOMINATOR_FIX";
        recoveryPath: "KEEP_PROVIDER_ERROR_DISTINCT_RECOMPUTE_DENOMINATOR";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const PROVIDER_ERROR_NOT_PASS_RELATED_CASE_IDS = [
  "T-US-034",
  "T-F17",
] as const;

function isEvalOutcomeStatus(value: string): value is EvalOutcomeStatus {
  return (
    value === "pass" ||
    value === "fail" ||
    value === "provider_error" ||
    value === "refusal" ||
    value === "not_run" ||
    value === "cancelled" ||
    value === "partial" ||
    value === "queued" ||
    value === "running"
  );
}

function countBy(
  cases: EvalOutcomeCase[],
  status: EvalOutcomeStatus,
): number {
  return cases.filter((c) => c.status === status).length;
}

function summarizeCases(cases: EvalOutcomeCase[]) {
  const passCount = countBy(cases, "pass");
  const failCount = countBy(cases, "fail");
  const providerErrorCount = countBy(cases, "provider_error");
  const gradedDenominator = passCount + failCount;
  const nonGradedCount = cases.length - gradedDenominator;
  const passRate =
    gradedDenominator > 0 ? passCount / gradedDenominator : null;
  const providerErrorGradedAsAnswer = cases.some(
    (c) =>
      (c.status === "provider_error" ||
        NON_GRADED_OUTCOME_STATUSES.includes(c.status)) &&
      (c.claimedGradedAs === "pass" || c.claimedGradedAs === "fail"),
  );
  const providerErrorCountedAsPass = cases.some(
    (c) => c.status === "provider_error" && c.claimedGradedAs === "pass",
  );
  return {
    passCount,
    failCount,
    providerErrorCount,
    nonGradedCount,
    gradedDenominator,
    passRate,
    providerErrorGradedAsAnswer,
    providerErrorCountedAsPass,
  };
}

function preservedInputCount(input: ProviderErrorNotPassInput): number {
  return (
    (input.suiteId.trim() ? 1 : 0) +
    (input.suiteVersion.trim() ? 1 : 0) +
    (input.cases.length > 0 ? 1 : 0) +
    (input.reportDenominatorHonest ? 1 : 0)
  );
}

/**
 * Evaluate that provider/infrastructure errors stay distinct from graded
 * answers and are excluded from the pass-rate denominator.
 * Offline: externalEffects NONE; live wiring NOT_WIRED; never VERIFIED.
 */
export function evaluateProviderErrorNotPass(
  input: ProviderErrorNotPassInput,
): ProviderErrorNotPassDecision {
  const base = {
    liveEvalWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const summary = summarizeCases(input.cases);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_HONEST_CLASSIFICATION"
      | "AWAITING_DENOMINATOR_FIX",
  ): NonNullable<
    Extract<ProviderErrorNotPassDecision, { allowed: false }>["evidence"]
  > => ({
    suiteId: input.suiteId.trim() || null,
    suiteVersion: input.suiteVersion.trim() || null,
    caseCount: input.cases.length,
    ...summary,
    productionWrites: false,
    suiteVerifiedLive: false,
    blockingDecision,
    currentState,
    recoveryPath: "KEEP_PROVIDER_ERROR_DISTINCT_RECOMPUTE_DENOMINATOR",
    preservedInputCount: preserved,
  });

  if (input.requestLiveEvalWiring) {
    return {
      allowed: false,
      code: "LIVE_EVAL_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live eval grading wiring remains NOT_WIRED — refuse live wiring (T-US-034)",
      ],
    };
  }

  if (input.claimLiveVerifiedGrading) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_GRADING_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified grading claim offline (T-US-034) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptProductionWrite) {
    return {
      allowed: false,
      code: "PRODUCTION_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_WRITE_FROM_EVAL_REFUSED",
        "BLOCKED",
      ),
      reasons: [
        "Provider-error classification must not perform production writes (T-US-034)",
      ],
    };
  }

  if (!input.suiteId.trim() || !input.suiteVersion.trim()) {
    return {
      allowed: false,
      code: "SUITE_IDENTITY_INCOMPLETE",
      ...base,
      evidence: blockedEvidence("SUITE_IDENTITY_INCOMPLETE", "BLOCKED"),
      reasons: [
        "Versioned suite ID required before classifying provider errors (T-US-034)",
      ],
    };
  }

  if (
    input.cases.length === 0 ||
    !input.cases.every(
      (c) =>
        !!c.caseId.trim() &&
        c.redacted === true &&
        isEvalOutcomeStatus(c.status),
    )
  ) {
    return {
      allowed: false,
      code: "CASE_OUTCOMES_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CASE_OUTCOMES_REQUIRED",
        "AWAITING_HONEST_CLASSIFICATION",
      ),
      reasons: [
        "Redacted case outcomes with distinct statuses are required (T-US-034)",
      ],
    };
  }

  if (summary.providerErrorGradedAsAnswer || summary.providerErrorCountedAsPass) {
    return {
      allowed: false,
      code: "PROVIDER_ERROR_MISGRADED_AS_ANSWER",
      ...base,
      evidence: blockedEvidence(
        "PROVIDER_ERROR_MUST_NOT_BE_PASS_OR_FAIL",
        "AWAITING_HONEST_CLASSIFICATION",
      ),
      reasons: [
        "Provider/infrastructure errors must not be graded as pass or fail (T-US-034)",
      ],
    };
  }

  // Require at least one provider_error and one graded answer to exercise the gate.
  if (summary.providerErrorCount < 1 || summary.gradedDenominator < 1) {
    return {
      allowed: false,
      code: "CASE_OUTCOMES_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PROVIDER_ERROR_AND_GRADED_CASES_REQUIRED",
        "AWAITING_HONEST_CLASSIFICATION",
      ),
      reasons: [
        "Proof requires at least one provider_error and one graded pass/fail outcome (T-US-034)",
      ],
    };
  }

  if (!input.reportDenominatorHonest) {
    return {
      allowed: false,
      code: "PASS_RATE_DENOMINATOR_DISHONEST",
      ...base,
      evidence: blockedEvidence(
        "PASS_RATE_MUST_EXCLUDE_PROVIDER_ERROR",
        "AWAITING_DENOMINATOR_FIX",
      ),
      reasons: [
        "Pass-rate denominator must exclude provider_error (and other non-graded statuses) (T-US-034)",
      ],
    };
  }

  return {
    allowed: true,
    code: "PROVIDER_ERROR_DISTINCT_FROM_GRADED_ANSWER",
    ...base,
    evidence: {
      suiteId: input.suiteId,
      suiteVersion: input.suiteVersion,
      caseCount: input.cases.length,
      passCount: summary.passCount,
      failCount: summary.failCount,
      providerErrorCount: summary.providerErrorCount,
      nonGradedCount: summary.nonGradedCount,
      gradedDenominator: summary.gradedDenominator,
      passRate: summary.passRate,
      providerErrorGradedAsAnswer: false,
      providerErrorCountedAsPass: false,
      productionWrites: false,
      suiteVerifiedLive: false,
      blockingDecision: "NONE",
      currentState: "OUTCOMES_CLASSIFIED_HONEST",
      recoveryPath: "KEEP_PROVIDER_ERROR_DISTINCT_RECOMPUTE_DENOMINATOR",
      preservedInputCount: preserved,
    },
    reasons: [
      "Provider errors kept distinct from pass/fail; pass-rate denominator excludes infrastructure errors (T-US-034)",
    ],
  };
}
