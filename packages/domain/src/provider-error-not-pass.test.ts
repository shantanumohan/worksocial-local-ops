import { describe, expect, it } from "vitest";
import {
  evaluateProviderErrorNotPass,
  type EvalOutcomeCase,
  type ProviderErrorNotPassInput,
} from "./provider-error-not-pass.js";

function caseRow(
  overrides: Partial<EvalOutcomeCase> &
    Pick<EvalOutcomeCase, "caseId" | "status">,
): EvalOutcomeCase {
  return {
    redacted: true,
    claimedGradedAs: null,
    ...overrides,
  };
}

function validInput(
  overrides: Partial<ProviderErrorNotPassInput> = {},
): ProviderErrorNotPassInput {
  return {
    suiteId: "suite-provider-error-v1",
    suiteVersion: "1.0.0",
    cases: [
      caseRow({ caseId: "case-pass-hours", status: "pass" }),
      caseRow({ caseId: "case-fail-parking", status: "fail" }),
      caseRow({ caseId: "case-provider-timeout", status: "provider_error" }),
      caseRow({ caseId: "case-refusal", status: "refusal" }),
    ],
    reportDenominatorHonest: true,
    claimLiveVerifiedGrading: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

describe("evaluateProviderErrorNotPass (T-US-034)", () => {
  it("accepts distinct provider_error with honest pass-rate denominator", () => {
    const decision = evaluateProviderErrorNotPass(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("PROVIDER_ERROR_DISTINCT_FROM_GRADED_ANSWER");
    expect(decision.evidence.providerErrorCount).toBe(1);
    expect(decision.evidence.passCount).toBe(1);
    expect(decision.evidence.failCount).toBe(1);
    expect(decision.evidence.gradedDenominator).toBe(2);
    expect(decision.evidence.passRate).toBe(0.5);
    expect(decision.evidence.providerErrorGradedAsAnswer).toBe(false);
    expect(decision.evidence.providerErrorCountedAsPass).toBe(false);
    expect(decision.liveEvalWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.evidence.suiteVerifiedLive).toBe(false);
  });

  it("refuses provider_error misgraded as fail", () => {
    const decision = evaluateProviderErrorNotPass(
      validInput({
        cases: [
          caseRow({ caseId: "case-pass-hours", status: "pass" }),
          caseRow({
            caseId: "case-provider-timeout",
            status: "provider_error",
            claimedGradedAs: "fail",
          }),
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PROVIDER_ERROR_MISGRADED_AS_ANSWER");
  });

  it("refuses provider_error misgraded as pass", () => {
    const decision = evaluateProviderErrorNotPass(
      validInput({
        cases: [
          caseRow({ caseId: "case-fail-parking", status: "fail" }),
          caseRow({
            caseId: "case-provider-timeout",
            status: "provider_error",
            claimedGradedAs: "pass",
          }),
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PROVIDER_ERROR_MISGRADED_AS_ANSWER");
  });

  it("refuses dishonest pass-rate denominator", () => {
    const decision = evaluateProviderErrorNotPass(
      validInput({ reportDenominatorHonest: false }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PASS_RATE_DENOMINATOR_DISHONEST");
  });

  it("refuses production writes", () => {
    const decision = evaluateProviderErrorNotPass(
      validInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified grading claim", () => {
    const decision = evaluateProviderErrorNotPass(
      validInput({ claimLiveVerifiedGrading: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_GRADING_REFUSED");
  });

  it("refuses live eval wiring request", () => {
    const decision = evaluateProviderErrorNotPass(
      validInput({ requestLiveEvalWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("LIVE_EVAL_WIRING_NOT_WIRED");
  });

  it("requires suite identity", () => {
    const decision = evaluateProviderErrorNotPass(
      validInput({ suiteId: "  " }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("SUITE_IDENTITY_INCOMPLETE");
  });
});
