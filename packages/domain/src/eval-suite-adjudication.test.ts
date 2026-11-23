import { describe, expect, it } from "vitest";
import { evaluateEvalSuiteAdjudication } from "./eval-suite-adjudication.js";

function validManifest(
  overrides: Partial<
    Parameters<typeof evaluateEvalSuiteAdjudication>[0]["conditionManifest"]
  > = {},
) {
  return {
    evidenceVersion: "ev-suite-2026-11-21",
    repetitions: 2,
    toolMode: "EVAL_ONLY" as const,
    models: ["claude-fixture-judge", "gemini-fixture-judge"],
    privacyReviewed: true,
    promptsReviewed: true,
    ...overrides,
  };
}

function validArtifacts() {
  return [
    {
      caseId: "case-pass-hours",
      verdict: "pass" as const,
      gapKind: "none" as const,
      gapSummary: "Hours answer matched SUPPORTED fact",
      redacted: true as const,
    },
    {
      caseId: "case-fail-parking",
      verdict: "fail" as const,
      gapKind: "content" as const,
      gapSummary: "Parking FAQ missing on booth page",
      redacted: true as const,
    },
  ];
}

function validInput(
  overrides: Partial<Parameters<typeof evaluateEvalSuiteAdjudication>[0]> = {},
) {
  return {
    suiteId: "suite-acoustic-eval-v1",
    suiteVersion: "1.0.0",
    surfaceLabel: "content_gap" as const,
    provider: "claude" as const,
    conditionManifest: validManifest(),
    runAuthorized: true,
    authorizationReason: "Owner approved bounded fixture eval suite",
    caseArtifacts: validArtifacts(),
    adjudications: [
      {
        caseId: "case-fail-parking",
        adjudicated: true,
        backlogItemId: "bl-parking-faq",
      },
    ],
    backlogItems: [
      {
        backlogItemId: "bl-parking-faq",
        linkedCaseId: "case-fail-parking",
        title: "Add parking FAQ to booth landing page",
        remediationKind: "content_fix" as const,
      },
    ],
    fixtureRedactionChecked: true,
    claimLiveVerifiedSuite: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

describe("eval-suite-adjudication (T-US-033)", () => {
  it("adjudicates failed cases with linked backlog and no production writes", () => {
    const decision = evaluateEvalSuiteAdjudication(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("EVAL_SUITE_ADJUDICATED_BACKLOG_LINKED");
    expect(decision.liveEvalWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.failedCaseCount).toBe(1);
    expect(decision.evidence.backlogLinkedCount).toBe(1);
    expect(decision.evidence.suiteVerifiedLive).toBe(false);
    expect(decision.evidence.currentState).toBe("ADJUDICATED_WITH_BACKLOG");
  });

  it("accepts gemini provider on the same adjudication path", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({ provider: "gemini", surfaceLabel: "search_gap" }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.evidence.provider).toBe("gemini");
    expect(decision.evidence.surfaceLabel).toBe("search_gap");
  });

  it("refuses unlinked failure adjudication", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({
        adjudications: [
          {
            caseId: "case-fail-parking",
            adjudicated: true,
            backlogItemId: null,
          },
        ],
        backlogItems: [],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("ADJUDICATION_BACKLOG_UNLINKED");
  });

  it("requires run authorization", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({ runAuthorized: false, authorizationReason: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("RUN_AUTHORIZATION_REQUIRED");
  });

  it("requires fixture redaction check", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({ fixtureRedactionChecked: false }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FIXTURE_REDACTION_CHECK_REQUIRED");
  });

  it("refuses production writes from eval surface", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified suite claim", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({ claimLiveVerifiedSuite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_SUITE_REFUSED");
  });

  it("refuses live eval wiring request", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({ requestLiveEvalWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("LIVE_EVAL_WIRING_NOT_WIRED");
  });

  it("requires complete condition manifest", () => {
    const decision = evaluateEvalSuiteAdjudication(
      validInput({
        conditionManifest: validManifest({ privacyReviewed: false }),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("CONDITION_MANIFEST_INCOMPLETE");
  });
});
