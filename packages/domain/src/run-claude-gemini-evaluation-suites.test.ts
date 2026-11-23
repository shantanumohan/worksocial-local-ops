import { describe, expect, it } from "vitest";
import {
  RUN_CLAUDE_GEMINI_EVALUATION_SUITES_RELATED_CASE_IDS,
  evaluateRunClaudeGeminiEvaluationSuites,
  type RunClaudeGeminiEvaluationSuitesInput,
} from "./run-claude-gemini-evaluation-suites.js";

function baseInput(
  overrides: Partial<RunClaudeGeminiEvaluationSuitesInput> = {},
): RunClaudeGeminiEvaluationSuitesInput {
  return {
    packageId: "pkg-f17-1",
    providerConnections: [
      {
        provider: "claude",
        connectionId: "conn-claude-eval-1",
        evalOnlyReady: true,
        liveWiring: "NOT_WIRED",
      },
      {
        provider: "gemini",
        connectionId: "conn-gemini-eval-1",
        evalOnlyReady: true,
        liveWiring: "NOT_WIRED",
      },
    ],
    curatedCorpus: {
      corpusId: "corpus-f17-1",
      caseIds: ["case-content-1", "case-search-1"],
      purpose: "fixed_corpus",
    },
    budgetConsent: {
      consentId: "budget-f17-1",
      budgetCapMinor: 5000,
      reservedMinor: 1200,
      stopOnCap: true,
      consented: true,
    },
    claudeRun: {
      provider: "claude",
      suite: {
        suiteId: "suite-claude-f17",
        suiteVersion: "1.0.0",
        surfaceLabel: "content_gap",
        purpose: "fixed_corpus",
      },
      conditionManifest: {
        evidenceVersion: "ev-2026-11-23",
        repetitions: 2,
        toolMode: "EVAL_ONLY",
        models: ["claude-test-fixture"],
        privacyReviewed: true,
        promptsReviewed: true,
      },
      caseOutcomes: [
        {
          caseId: "case-content-1",
          verdict: "pass",
          gapKind: "none",
          gapSummary: "Answer matched approved facts",
          redacted: true,
          citationCount: 2,
          retrievalCondition: "GROUNDED",
          latencyMs: 410,
          errorLabel: null,
          deterministicClaimCheck: "PASS",
        },
        {
          caseId: "case-search-1",
          verdict: "fail",
          gapKind: "search",
          gapSummary: "Missed Midtown day-pass intent page",
          redacted: true,
          citationCount: 0,
          retrievalCondition: "GROUNDED",
          latencyMs: 380,
          errorLabel: null,
          deterministicClaimCheck: "FAIL",
        },
      ],
      adjudications: [
        {
          caseId: "case-search-1",
          provider: "claude",
          humanVerdict: "fail",
          modelGrade: "pass",
          adjudicated: true,
          backlogItemId: "bl-search-1",
          releaseAuthorizedByModel: false,
        },
      ],
    },
    geminiRun: {
      provider: "gemini",
      suite: {
        suiteId: "suite-gemini-f17",
        suiteVersion: "1.0.0",
        surfaceLabel: "search_gap",
        purpose: "fixed_corpus",
      },
      conditionManifest: {
        evidenceVersion: "ev-2026-11-23",
        repetitions: 2,
        toolMode: "EVAL_ONLY",
        models: ["gemini-test-fixture"],
        privacyReviewed: true,
        promptsReviewed: true,
      },
      caseOutcomes: [
        {
          caseId: "case-content-1",
          verdict: "pass",
          gapKind: "none",
          gapSummary: "Gemini matched approved facts",
          redacted: true,
          citationCount: 1,
          retrievalCondition: "GROUNDED",
          latencyMs: 290,
          errorLabel: null,
          deterministicClaimCheck: "PASS",
        },
        {
          caseId: "case-search-1",
          verdict: "fail",
          gapKind: "content",
          gapSummary: "Thin answer on weekday pass pricing",
          redacted: true,
          citationCount: 1,
          retrievalCondition: "GROUNDED",
          latencyMs: 305,
          errorLabel: null,
          deterministicClaimCheck: "FAIL",
        },
      ],
      adjudications: [
        {
          caseId: "case-search-1",
          provider: "gemini",
          humanVerdict: "needs_work",
          modelGrade: "fail",
          adjudicated: true,
          backlogItemId: "bl-content-1",
          releaseAuthorizedByModel: false,
        },
      ],
    },
    backlogItems: [
      {
        backlogItemId: "bl-search-1",
        linkedCaseId: "case-search-1",
        title: "Add Midtown day-pass intent page",
        remediationKind: "search_fix",
      },
      {
        backlogItemId: "bl-content-1",
        linkedCaseId: "case-search-1",
        title: "Clarify weekday pass pricing facts",
        remediationKind: "content_fix",
      },
    ],
    fixtureRedactionChecked: true,
    runAuthorized: true,
    authorizationReason: "Owner approved bounded EVAL_ONLY dual-suite fixture run",
    claimLiveVerifiedSuites: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
    authorizeReleaseFromModelGrade: false,
    ...overrides,
  };
}

describe("evaluateRunClaudeGeminiEvaluationSuites (T-F17)", () => {
  it("records complete F17 evidence package", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "RUN_CLAUDE_GEMINI_EVALUATION_SUITES_EVIDENCE_RECORDED",
    );
    expect(decision.liveEvalWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.suitesRunRecorded).toBe(true);
    expect(decision.evidence.claudeConnectionId).toBe("conn-claude-eval-1");
    expect(decision.evidence.geminiConnectionId).toBe("conn-gemini-eval-1");
    expect(decision.evidence.corpusId).toBe("corpus-f17-1");
    expect(decision.evidence.stopOnCap).toBe(true);
    expect(decision.evidence.failedCaseCount).toBe(2);
    expect(decision.evidence.backlogLinkedCount).toBe(2);
    expect(decision.evidence.humanVerdictSeparateFromModelGrade).toBe(true);
    expect(decision.evidence.releaseAuthorizedByModel).toBe(false);
    expect(decision.evidence.suitesVerifiedLive).toBe(false);
    expect(decision.evidence.curatedCaseIds).toEqual([
      "case-content-1",
      "case-search-1",
    ]);
    expect(decision.evidence.conditionManifests).toHaveLength(2);
    expect(decision.evidence.conditionManifests[0]?.models).toEqual([
      "claude-test-fixture",
    ]);
    expect(decision.evidence.conditionManifests[0]?.repetitions).toBe(2);
    expect(decision.evidence.caseOutcomeArtifacts).toHaveLength(4);
    expect(
      decision.evidence.caseOutcomeArtifacts.every(
        (o) => o.citationCount >= 0 && o.latencyMs >= 0,
      ),
    ).toBe(true);
    expect(decision.evidence.blockingDecision).toBe(
      "F17_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(RUN_CLAUDE_GEMINI_EVALUATION_SUITES_RELATED_CASE_IDS).toEqual([
      "T-F17",
    ]);
  });

  it("refuses missing EVAL_ONLY connections", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ providerConnections: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("EVAL_ONLY_PROVIDER_CONNECTIONS_REQUIRED");
    expect(decision.evidence?.currentState).toBe(
      "AWAITING_EVAL_ONLY_CONNECTIONS",
    );
  });

  it("refuses missing curated corpus", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ curatedCorpus: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CURATED_CORPUS_REQUIRED");
  });

  it("refuses missing budget consent", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ budgetConsent: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BUDGET_CONSENT_REQUIRED");
  });

  it("refuses missing Claude suite selection", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ claudeRun: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SUITE_SELECTION_REQUIRED");
  });

  it("refuses incomplete condition manifest", () => {
    const input = baseInput();
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({
        claudeRun: input.claudeRun
          ? {
              ...input.claudeRun,
              conditionManifest: {
                ...input.claudeRun.conditionManifest,
                toolMode: "EVAL_ONLY",
                models: [],
                privacyReviewed: false,
              },
            }
          : null,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CONDITION_MANIFEST_INCOMPLETE");
  });

  it("refuses non-integer repetitions", () => {
    const input = baseInput();
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({
        claudeRun: input.claudeRun
          ? {
              ...input.claudeRun,
              conditionManifest: {
                ...input.claudeRun.conditionManifest,
                repetitions: 1.5,
              },
            }
          : null,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CONDITION_MANIFEST_INCOMPLETE");
  });

  it("refuses outcomes that omit curated corpus cases", () => {
    const input = baseInput();
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({
        claudeRun: input.claudeRun
          ? {
              ...input.claudeRun,
              caseOutcomes: input.claudeRun.caseOutcomes.filter(
                (o) => o.caseId !== "case-search-1",
              ),
              adjudications: [],
            }
          : null,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CURATED_CASE_OUTCOMES_REQUIRED");
  });

  it("refuses graded PROVIDER_ERROR outcomes", () => {
    const input = baseInput();
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({
        claudeRun: input.claudeRun
          ? {
              ...input.claudeRun,
              caseOutcomes: [
                ...input.claudeRun.caseOutcomes,
                {
                  caseId: "case-infra-1",
                  verdict: "fail",
                  gapKind: "none",
                  gapSummary: "Provider timeout treated as fail",
                  redacted: true,
                  citationCount: 0,
                  retrievalCondition: "PROVIDER_ERROR",
                  latencyMs: 0,
                  errorLabel: null,
                  deterministicClaimCheck: "FAIL",
                },
              ],
            }
          : null,
        curatedCorpus: input.curatedCorpus
          ? {
              ...input.curatedCorpus,
              caseIds: [...input.curatedCorpus.caseIds, "case-infra-1"],
            }
          : null,
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROVIDER_ERROR_GRADED_REFUSED");
  });

  it("refuses when Gemini failure lacks provider-scoped adjudication", () => {
    const input = baseInput();
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({
        geminiRun: input.geminiRun
          ? { ...input.geminiRun, adjudications: [] }
          : null,
        backlogItems: (input.backlogItems ?? []).filter(
          (b) => b.backlogItemId !== "bl-content-1",
        ),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ADJUDICATION_BACKLOG_UNLINKED");
  });

  it("refuses missing redaction check", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ fixtureRedactionChecked: false }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FIXTURE_REDACTION_CHECK_REQUIRED");
  });

  it("refuses unauthorized run", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ runAuthorized: false, authorizationReason: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("RUN_AUTHORIZATION_REQUIRED");
  });

  it("refuses unlinked adjudication backlog", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ backlogItems: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ADJUDICATION_BACKLOG_UNLINKED");
  });

  it("refuses model-grade release authorization", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ authorizeReleaseFromModelGrade: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MODEL_GRADE_RELEASE_REFUSED");
  });

  it("refuses production writes", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified claims", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ claimLiveVerifiedSuites: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_SUITES_REFUSED");
  });

  it("refuses live eval wiring", () => {
    const decision = evaluateRunClaudeGeminiEvaluationSuites(
      baseInput({ requestLiveEvalWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_EVAL_WIRING_NOT_WIRED");
  });
});
