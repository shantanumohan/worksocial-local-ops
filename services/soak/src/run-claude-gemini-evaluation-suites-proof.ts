/**
 * Fixture proof for T-F17 — Run Claude and Gemini evaluation suites.
 * Complete F17 evidence package: EVAL_ONLY Claude+Gemini connections,
 * curated corpus, budget consent, dual suite selection, condition
 * manifests, redaction check, bounded run authorization, case-level
 * outcomes, human adjudication + linked backlog; unsafe claims refused;
 * live eval NOT_WIRED. Distinct from T-US-033 adjudication summary,
 * T-US-015/T-US-017 connect, T-US-018/T-X037 operational tool forbid,
 * and T-X038 no-grounding. External effects: NONE. Never invents live
 * VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateRunClaudeGeminiEvaluationSuites,
  type RunClaudeGeminiEvaluationSuitesInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<RunClaudeGeminiEvaluationSuitesInput> = {},
): RunClaudeGeminiEvaluationSuitesInput {
  return {
    packageId: "pkg-f17-soak",
    providerConnections: [
      {
        provider: "claude",
        connectionId: "conn-claude-eval-soak",
        evalOnlyReady: true,
        liveWiring: "NOT_WIRED",
      },
      {
        provider: "gemini",
        connectionId: "conn-gemini-eval-soak",
        evalOnlyReady: true,
        liveWiring: "NOT_WIRED",
      },
    ],
    curatedCorpus: {
      corpusId: "corpus-f17-soak",
      caseIds: ["case-content-soak", "case-search-soak"],
      purpose: "fixed_corpus",
    },
    budgetConsent: {
      consentId: "budget-f17-soak",
      budgetCapMinor: 5000,
      reservedMinor: 1200,
      stopOnCap: true,
      consented: true,
    },
    claudeRun: {
      provider: "claude",
      suite: {
        suiteId: "suite-claude-f17-soak",
        suiteVersion: "1.0.0",
        surfaceLabel: "content_gap",
        purpose: "fixed_corpus",
      },
      conditionManifest: {
        evidenceVersion: "ev-2026-11-23-soak",
        repetitions: 2,
        toolMode: "EVAL_ONLY",
        models: ["claude-test-fixture"],
        privacyReviewed: true,
        promptsReviewed: true,
      },
      caseOutcomes: [
        {
          caseId: "case-content-soak",
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
          caseId: "case-search-soak",
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
          caseId: "case-search-soak",
          provider: "claude",
          humanVerdict: "fail",
          modelGrade: "pass",
          adjudicated: true,
          backlogItemId: "bl-search-soak",
          releaseAuthorizedByModel: false,
        },
      ],
    },
    geminiRun: {
      provider: "gemini",
      suite: {
        suiteId: "suite-gemini-f17-soak",
        suiteVersion: "1.0.0",
        surfaceLabel: "search_gap",
        purpose: "fixed_corpus",
      },
      conditionManifest: {
        evidenceVersion: "ev-2026-11-23-soak",
        repetitions: 2,
        toolMode: "EVAL_ONLY",
        models: ["gemini-test-fixture"],
        privacyReviewed: true,
        promptsReviewed: true,
      },
      caseOutcomes: [
        {
          caseId: "case-content-soak",
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
          caseId: "case-search-soak",
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
          caseId: "case-search-soak",
          provider: "gemini",
          humanVerdict: "needs_work",
          modelGrade: "fail",
          adjudicated: true,
          backlogItemId: "bl-content-soak",
          releaseAuthorizedByModel: false,
        },
      ],
    },
    backlogItems: [
      {
        backlogItemId: "bl-search-soak",
        linkedCaseId: "case-search-soak",
        title: "Add Midtown day-pass intent page",
        remediationKind: "search_fix",
      },
      {
        backlogItemId: "bl-content-soak",
        linkedCaseId: "case-search-soak",
        title: "Clarify weekday pass pricing facts",
        remediationKind: "content_fix",
      },
    ],
    fixtureRedactionChecked: true,
    runAuthorized: true,
    authorizationReason:
      "Owner approved bounded EVAL_ONLY dual-suite fixture soak",
    claimLiveVerifiedSuites: false,
    requestLiveEvalWiring: false,
    attemptProductionWrite: false,
    authorizeReleaseFromModelGrade: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F17 fixture ACCEPTED.
 */
export function proofRunClaudeGeminiEvaluationSuites(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateRunClaudeGeminiEvaluationSuites(baseInput());
  if (
    happy.allowed &&
    happy.code === "RUN_CLAUDE_GEMINI_EVALUATION_SUITES_EVIDENCE_RECORDED" &&
    happy.evidence.suitesVerifiedLive === false &&
    happy.suitesRunRecorded === true &&
    happy.evidence.humanVerdictSeparateFromModelGrade === true &&
    happy.evidence.releaseAuthorizedByModel === false &&
    happy.evidence.failedCaseCount >= 1 &&
    happy.evidence.backlogLinkedCount >= 1 &&
    happy.evidence.conditionManifests.length === 2 &&
    happy.evidence.caseOutcomeArtifacts.length >= 2 &&
    happy.evidence.curatedCaseIds.length >= 1 &&
    happy.liveEvalWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F17 evidence package → RUN_CLAUDE_GEMINI_EVALUATION_SUITES_EVIDENCE_RECORDED; EVAL_ONLY Claude+Gemini connections; curated corpus; budget consent stopOnCap; dual suite selection; condition manifests; redaction check; bounded run authorization; case-level outcomes; human adjudication + linked backlog; suitesVerifiedLive=false; live NOT_WIRED",
    );
    details.push(
      `conditionManifests=${JSON.stringify(happy.evidence.conditionManifests)}`,
    );
    details.push(
      `curatedCaseIds=${JSON.stringify(happy.evidence.curatedCaseIds)}`,
    );
    details.push(
      `caseOutcomeArtifacts=${JSON.stringify(happy.evidence.caseOutcomeArtifacts)}`,
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noConn = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ providerConnections: null }),
  );
  if (
    !noConn.allowed &&
    noConn.code === "EVAL_ONLY_PROVIDER_CONNECTIONS_REQUIRED"
  ) {
    details.push(
      "providerConnections=null → EVAL_ONLY_PROVIDER_CONNECTIONS_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Connections unexpectedly ${JSON.stringify(noConn)}`);
  }

  const noCorpus = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ curatedCorpus: null }),
  );
  if (!noCorpus.allowed && noCorpus.code === "CURATED_CORPUS_REQUIRED") {
    details.push("curatedCorpus=null → CURATED_CORPUS_REQUIRED");
  } else {
    passed = false;
    details.push(`Corpus unexpectedly ${JSON.stringify(noCorpus)}`);
  }

  const noBudget = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ budgetConsent: null }),
  );
  if (!noBudget.allowed && noBudget.code === "BUDGET_CONSENT_REQUIRED") {
    details.push("budgetConsent=null → BUDGET_CONSENT_REQUIRED");
  } else {
    passed = false;
    details.push(`Budget unexpectedly ${JSON.stringify(noBudget)}`);
  }

  const noClaude = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ claudeRun: null }),
  );
  if (!noClaude.allowed && noClaude.code === "SUITE_SELECTION_REQUIRED") {
    details.push("claudeRun=null → SUITE_SELECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Claude suite unexpectedly ${JSON.stringify(noClaude)}`);
  }

  const input = baseInput();
  const badManifest = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({
      claudeRun: input.claudeRun
        ? {
            ...input.claudeRun,
            conditionManifest: {
              ...input.claudeRun.conditionManifest,
              models: [],
              privacyReviewed: false,
            },
          }
        : null,
    }),
  );
  if (
    !badManifest.allowed &&
    badManifest.code === "CONDITION_MANIFEST_INCOMPLETE"
  ) {
    details.push(
      "incomplete conditionManifest → CONDITION_MANIFEST_INCOMPLETE",
    );
  } else {
    passed = false;
    details.push(`Manifest unexpectedly ${JSON.stringify(badManifest)}`);
  }

  const noRedact = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ fixtureRedactionChecked: false }),
  );
  if (
    !noRedact.allowed &&
    noRedact.code === "FIXTURE_REDACTION_CHECK_REQUIRED"
  ) {
    details.push(
      "fixtureRedactionChecked=false → FIXTURE_REDACTION_CHECK_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Redaction unexpectedly ${JSON.stringify(noRedact)}`);
  }

  const noAuth = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ runAuthorized: false, authorizationReason: null }),
  );
  if (!noAuth.allowed && noAuth.code === "RUN_AUTHORIZATION_REQUIRED") {
    details.push("runAuthorized=false → RUN_AUTHORIZATION_REQUIRED");
  } else {
    passed = false;
    details.push(`Authorization unexpectedly ${JSON.stringify(noAuth)}`);
  }

  const noBacklog = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ backlogItems: [] }),
  );
  if (
    !noBacklog.allowed &&
    noBacklog.code === "ADJUDICATION_BACKLOG_UNLINKED"
  ) {
    details.push("backlogItems=[] → ADJUDICATION_BACKLOG_UNLINKED");
  } else {
    passed = false;
    details.push(`Backlog unexpectedly ${JSON.stringify(noBacklog)}`);
  }

  const fracRep = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({
      claudeRun: baseInput().claudeRun
        ? {
            ...baseInput().claudeRun!,
            conditionManifest: {
              ...baseInput().claudeRun!.conditionManifest,
              repetitions: 2.5,
            },
          }
        : null,
    }),
  );
  if (
    !fracRep.allowed &&
    fracRep.code === "CONDITION_MANIFEST_INCOMPLETE"
  ) {
    details.push("repetitions=2.5 → CONDITION_MANIFEST_INCOMPLETE");
  } else {
    passed = false;
    details.push(`Fractional repetitions unexpectedly ${JSON.stringify(fracRep)}`);
  }

  const missingCorpusCase = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({
      claudeRun: baseInput().claudeRun
        ? {
            ...baseInput().claudeRun!,
            caseOutcomes: baseInput().claudeRun!.caseOutcomes.filter(
              (o) => o.caseId !== "case-search-soak",
            ),
            adjudications: [],
          }
        : null,
    }),
  );
  if (
    !missingCorpusCase.allowed &&
    missingCorpusCase.code === "CURATED_CASE_OUTCOMES_REQUIRED"
  ) {
    details.push(
      "omit curated case outcome → CURATED_CASE_OUTCOMES_REQUIRED",
    );
  } else {
    passed = false;
    details.push(
      `Corpus coverage unexpectedly ${JSON.stringify(missingCorpusCase)}`,
    );
  }

  const gradedProviderError = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({
      claudeRun: baseInput().claudeRun
        ? {
            ...baseInput().claudeRun!,
            caseOutcomes: [
              ...baseInput().claudeRun!.caseOutcomes,
              {
                caseId: "case-infra-soak",
                verdict: "fail",
                gapKind: "none",
                gapSummary: "Timeout graded as fail",
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
      curatedCorpus: {
        corpusId: "corpus-f17-soak",
        caseIds: ["case-content-soak", "case-search-soak", "case-infra-soak"],
        purpose: "fixed_corpus",
      },
    }),
  );
  if (
    !gradedProviderError.allowed &&
    gradedProviderError.code === "PROVIDER_ERROR_GRADED_REFUSED"
  ) {
    details.push(
      "graded PROVIDER_ERROR → PROVIDER_ERROR_GRADED_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `Provider error unexpectedly ${JSON.stringify(gradedProviderError)}`,
    );
  }

  const missingGeminiAdj = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({
      geminiRun: baseInput().geminiRun
        ? { ...baseInput().geminiRun!, adjudications: [] }
        : null,
      backlogItems: (baseInput().backlogItems ?? []).filter(
        (b) => b.backlogItemId !== "bl-content-soak",
      ),
    }),
  );
  if (
    !missingGeminiAdj.allowed &&
    missingGeminiAdj.code === "ADJUDICATION_BACKLOG_UNLINKED"
  ) {
    details.push(
      "gemini adjudications=[] → ADJUDICATION_BACKLOG_UNLINKED (provider-scoped)",
    );
  } else {
    passed = false;
    details.push(
      `Provider-scoped adjudication unexpectedly ${JSON.stringify(missingGeminiAdj)}`,
    );
  }

  const modelRelease = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ authorizeReleaseFromModelGrade: true }),
  );
  if (
    !modelRelease.allowed &&
    modelRelease.code === "MODEL_GRADE_RELEASE_REFUSED"
  ) {
    details.push(
      "authorizeReleaseFromModelGrade → MODEL_GRADE_RELEASE_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Model release unexpectedly ${JSON.stringify(modelRelease)}`);
  }

  const prodWrite = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ attemptProductionWrite: true }),
  );
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  const liveClaim = evaluateRunClaudeGeminiEvaluationSuites(
    baseInput({ claimLiveVerifiedSuites: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_SUITES_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedSuites → FALSE_LIVE_VERIFIED_SUITES_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateRunClaudeGeminiEvaluationSuites(
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
    "Distinct from T-US-033 (eval suite adjudication + backlog summary), T-US-015/T-US-017 (connect), T-US-018/T-X037 (operational tool forbid), and T-X038 (no-grounding) — complete F17 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.RUN_CLAUDE_GEMINI_EVALUATION_SUITES,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-run-claude-gemini-evaluation-suites-f17",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
