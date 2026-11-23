/**
 * T-F17 — Run Claude and Gemini evaluation suites (complete F17 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F17 evidence
 * package — EVAL_ONLY Claude + Gemini provider connections, curated cases,
 * budget consent, versioned suite + surface/purpose, condition manifest
 * (models / evidence version / repetitions / EVAL_ONLY tool mode), privacy +
 * prompt redaction check, bounded run authorization, case-level result
 * artifacts (outputs / citations / retrieval / latency / errors / claim
 * checks), human adjudication separate from model grading, and remediation
 * backlog links — without production writes or release authorization from a
 * favorable model answer. Live eval wiring stays NOT_WIRED. Pure domain —
 * no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External
 * effects: NONE.
 *
 * Distinct from T-US-033 (`EVAL_SUITE_ADJUDICATION_BACKLOG`) — this records
 * the complete F17 flow evidence package (Given prerequisites + both
 * providers + budget consent + dual suite runs + adjudication package), not
 * the single-provider adjudication+backlog happy-path summary. Distinct from
 * T-US-015 / T-US-017 (connect), T-US-018 / T-X037 (operational tool forbid),
 * and T-X038 (no-grounding fail closed).
 */

import type {
  EvalSuiteBacklogItem,
  EvalSuiteCaseArtifact,
  EvalSuiteConditionManifest,
  EvalSuiteSurfaceLabel,
} from "./eval-suite-adjudication.js";

export type EvalOnlyProviderConnection = {
  provider: "claude" | "gemini";
  connectionId: string;
  /** EVAL_ONLY readiness recorded (not operational). */
  evalOnlyReady: boolean;
  liveWiring: "NOT_WIRED";
};

export type CuratedEvalCorpus = {
  corpusId: string;
  caseIds: readonly string[];
  /** fixed_corpus | open_web | manual_consumer — F17 suite purpose family. */
  purpose: "fixed_corpus" | "open_web" | "manual_consumer";
};

export type EvalBudgetConsent = {
  consentId: string;
  budgetCapMinor: number;
  reservedMinor: number;
  /** Stop on cap / credential failure without switching providers. */
  stopOnCap: true;
  consented: boolean;
};

export type SuiteSelection = {
  suiteId: string;
  suiteVersion: string;
  surfaceLabel: EvalSuiteSurfaceLabel;
  purpose: CuratedEvalCorpus["purpose"];
};

export type CaseLevelOutcomeArtifact = EvalSuiteCaseArtifact & {
  citationCount: number;
  retrievalCondition: "GROUNDED" | "NO_GROUNDING" | "PROVIDER_ERROR";
  latencyMs: number;
  errorLabel: string | null;
  deterministicClaimCheck: "PASS" | "FAIL" | "NOT_APPLICABLE";
};

export type HumanAdjudicationRecord = {
  caseId: string;
  /** Provider run that produced the failed outcome being adjudicated. */
  provider: "claude" | "gemini";
  /** Human verdict — must stay separate from model grading. */
  humanVerdict: "pass" | "fail" | "needs_work";
  modelGrade: "pass" | "fail" | "unknown";
  adjudicated: boolean;
  backlogItemId: string | null;
  /** Favorable model answer must never authorize a release. */
  releaseAuthorizedByModel: false;
};

export type ProviderFailedOutcome = {
  provider: "claude" | "gemini";
  outcome: CaseLevelOutcomeArtifact;
};

export type RedactedConditionManifestEvidence = {
  provider: "claude" | "gemini";
  evidenceVersion: string;
  repetitions: number;
  toolMode: "EVAL_ONLY";
  models: string[];
};

export type RedactedCaseOutcomeEvidence = {
  provider: "claude" | "gemini";
  caseId: string;
  verdict: CaseLevelOutcomeArtifact["verdict"];
  citationCount: number;
  retrievalCondition: CaseLevelOutcomeArtifact["retrievalCondition"];
  latencyMs: number;
  errorLabel: string | null;
  deterministicClaimCheck: CaseLevelOutcomeArtifact["deterministicClaimCheck"];
};

export type ProviderSuiteRunEvidence = {
  provider: "claude" | "gemini";
  suite: SuiteSelection;
  conditionManifest: EvalSuiteConditionManifest;
  caseOutcomes: readonly CaseLevelOutcomeArtifact[];
  adjudications: readonly HumanAdjudicationRecord[];
};

export type RunClaudeGeminiEvaluationSuitesInput = {
  packageId: string;
  providerConnections: readonly EvalOnlyProviderConnection[] | null;
  curatedCorpus: CuratedEvalCorpus | null;
  budgetConsent: EvalBudgetConsent | null;
  /** Dual suite runs — Claude and Gemini both required for complete F17. */
  claudeRun: ProviderSuiteRunEvidence | null;
  geminiRun: ProviderSuiteRunEvidence | null;
  backlogItems: readonly EvalSuiteBacklogItem[] | null;
  fixtureRedactionChecked: boolean;
  runAuthorized: boolean;
  authorizationReason: string | null;
  /** Claim the F17 path is live-verified — must refuse offline. */
  claimLiveVerifiedSuites: boolean;
  /** Request live Claude/Gemini eval wiring — must stay NOT_WIRED offline. */
  requestLiveEvalWiring: boolean;
  /** Attempt a production write from the eval surface — must refuse. */
  attemptProductionWrite: boolean;
  /** Attempt release authorization from a favorable model grade — refuse. */
  authorizeReleaseFromModelGrade: boolean;
};

export type RunClaudeGeminiEvaluationSuitesDecision =
  | {
      allowed: true;
      code: "RUN_CLAUDE_GEMINI_EVALUATION_SUITES_EVIDENCE_RECORDED";
      suitesRunRecorded: true;
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        claudeConnectionId: string;
        geminiConnectionId: string;
        corpusId: string;
        curatedCaseCount: number;
        purpose: CuratedEvalCorpus["purpose"];
        budgetConsentId: string;
        budgetCapMinor: number;
        reservedMinor: number;
        stopOnCap: true;
        claudeSuiteId: string;
        claudeSuiteVersion: string;
        claudeSurfaceLabel: EvalSuiteSurfaceLabel;
        geminiSuiteId: string;
        geminiSuiteVersion: string;
        geminiSurfaceLabel: EvalSuiteSurfaceLabel;
        conditionManifestComplete: true;
        conditionManifests: RedactedConditionManifestEvidence[];
        curatedCaseIds: string[];
        caseOutcomeArtifacts: RedactedCaseOutcomeEvidence[];
        fixtureRedactionChecked: true;
        runAuthorized: true;
        claudeCaseOutcomeCount: number;
        geminiCaseOutcomeCount: number;
        failedCaseCount: number;
        adjudicationCount: number;
        backlogLinkedCount: number;
        humanVerdictSeparateFromModelGrade: true;
        releaseAuthorizedByModel: false;
        suitesVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F17_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "CLAUDE_GEMINI_EVAL_SUITES_RUN_ADJUDICATED";
        recoveryPath: "KEEP_FIXTURE_EVAL_NO_LIVE_WIRING";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "EVAL_ONLY_PROVIDER_CONNECTIONS_REQUIRED"
        | "CURATED_CORPUS_REQUIRED"
        | "BUDGET_CONSENT_REQUIRED"
        | "SUITE_SELECTION_REQUIRED"
        | "CONDITION_MANIFEST_INCOMPLETE"
        | "FIXTURE_REDACTION_CHECK_REQUIRED"
        | "RUN_AUTHORIZATION_REQUIRED"
        | "CASE_OUTCOME_ARTIFACTS_REQUIRED"
        | "CURATED_CASE_OUTCOMES_REQUIRED"
        | "PROVIDER_ERROR_GRADED_REFUSED"
        | "ADJUDICATION_BACKLOG_UNLINKED"
        | "MODEL_GRADE_RELEASE_REFUSED"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_SUITES_REFUSED"
        | "LIVE_EVAL_WIRING_NOT_WIRED";
      suitesRunRecorded: false;
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        claudeConnectionId: string | null;
        geminiConnectionId: string | null;
        corpusId: string | null;
        curatedCaseCount: number;
        purpose: CuratedEvalCorpus["purpose"] | null;
        budgetConsentId: string | null;
        budgetCapMinor: number;
        reservedMinor: number;
        stopOnCap: boolean;
        claudeSuiteId: string | null;
        claudeSuiteVersion: string | null;
        claudeSurfaceLabel: EvalSuiteSurfaceLabel | null;
        geminiSuiteId: string | null;
        geminiSuiteVersion: string | null;
        geminiSurfaceLabel: EvalSuiteSurfaceLabel | null;
        conditionManifestComplete: boolean;
        conditionManifests: RedactedConditionManifestEvidence[];
        curatedCaseIds: string[];
        caseOutcomeArtifacts: RedactedCaseOutcomeEvidence[];
        fixtureRedactionChecked: boolean;
        runAuthorized: boolean;
        claudeCaseOutcomeCount: number;
        geminiCaseOutcomeCount: number;
        failedCaseCount: number;
        adjudicationCount: number;
        backlogLinkedCount: number;
        humanVerdictSeparateFromModelGrade: boolean;
        releaseAuthorizedByModel: false;
        suitesVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_EVAL_ONLY_CONNECTIONS"
          | "AWAITING_CURATED_CORPUS"
          | "AWAITING_BUDGET_CONSENT"
          | "AWAITING_SUITE_SELECTION"
          | "AWAITING_CONDITION_MANIFEST"
          | "AWAITING_REDACTION_CHECK"
          | "AWAITING_AUTHORIZATION"
          | "AWAITING_CASE_OUTCOMES"
          | "AWAITING_ADJUDICATION";
        recoveryPath:
          | "CONNECT_CLAUDE_GEMINI_EVAL_ONLY"
          | "CURATE_EVAL_CASES"
          | "CONSENT_EVAL_BUDGET"
          | "SELECT_SUITE_AND_PURPOSE"
          | "COMPLETE_CONDITION_MANIFEST"
          | "REVIEW_PROMPTS_AND_PRIVACY"
          | "AUTHORIZE_BOUNDED_EVAL_RUN"
          | "INSPECT_CASE_OUTCOMES"
          | "ADJUDICATE_AND_LINK_BACKLOG"
          | "KEEP_FIXTURE_EVAL_NO_LIVE_WIRING"
          | "REFUSE_MODEL_GRADE_RELEASE"
          | "REFUSE_GRADED_PROVIDER_ERROR";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const RUN_CLAUDE_GEMINI_EVALUATION_SUITES_RELATED_CASE_IDS = [
  "T-F17",
] as const;

function preservedInputCount(
  input: RunClaudeGeminiEvaluationSuitesInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.providerConnections && input.providerConnections.length > 0
      ? 1
      : 0) +
    (input.curatedCorpus?.corpusId.trim() ? 1 : 0) +
    (input.budgetConsent?.consentId.trim() ? 1 : 0) +
    (input.claudeRun?.suite.suiteId.trim() ? 1 : 0) +
    (input.geminiRun?.suite.suiteId.trim() ? 1 : 0) +
    (input.backlogItems && input.backlogItems.length > 0 ? 1 : 0) +
    (input.fixtureRedactionChecked ? 1 : 0) +
    (input.runAuthorized ? 1 : 0)
  );
}

function connectionsOk(
  connections: readonly EvalOnlyProviderConnection[] | null,
): connections is readonly EvalOnlyProviderConnection[] {
  if (!connections || connections.length < 2) return false;
  const claude = connections.find((c) => c.provider === "claude");
  const gemini = connections.find((c) => c.provider === "gemini");
  if (!claude || !gemini) return false;
  return (
    claude.connectionId.trim().length > 0 &&
    gemini.connectionId.trim().length > 0 &&
    claude.evalOnlyReady === true &&
    gemini.evalOnlyReady === true &&
    claude.liveWiring === "NOT_WIRED" &&
    gemini.liveWiring === "NOT_WIRED"
  );
}

function corpusOk(
  corpus: CuratedEvalCorpus | null,
): corpus is CuratedEvalCorpus {
  if (!corpus) return false;
  return (
    corpus.corpusId.trim().length > 0 &&
    corpus.caseIds.length > 0 &&
    corpus.caseIds.every((id) => id.trim().length > 0) &&
    (corpus.purpose === "fixed_corpus" ||
      corpus.purpose === "open_web" ||
      corpus.purpose === "manual_consumer")
  );
}

function budgetOk(
  budget: EvalBudgetConsent | null,
): budget is EvalBudgetConsent {
  if (!budget) return false;
  return (
    budget.consentId.trim().length > 0 &&
    budget.consented === true &&
    budget.stopOnCap === true &&
    Number.isFinite(budget.budgetCapMinor) &&
    budget.budgetCapMinor > 0 &&
    Number.isFinite(budget.reservedMinor) &&
    budget.reservedMinor > 0 &&
    budget.reservedMinor <= budget.budgetCapMinor
  );
}

function conditionManifestComplete(
  manifest: EvalSuiteConditionManifest,
): boolean {
  return (
    !!manifest.evidenceVersion.trim() &&
    Number.isFinite(manifest.repetitions) &&
    Number.isInteger(manifest.repetitions) &&
    manifest.repetitions > 0 &&
    manifest.toolMode === "EVAL_ONLY" &&
    manifest.models.length > 0 &&
    manifest.models.every((m) => !!m.trim()) &&
    manifest.privacyReviewed &&
    manifest.promptsReviewed
  );
}

function suiteSelectionOk(suite: SuiteSelection | undefined): boolean {
  if (!suite) return false;
  return (
    suite.suiteId.trim().length > 0 &&
    suite.suiteVersion.trim().length > 0 &&
    (suite.surfaceLabel === "content_gap" ||
      suite.surfaceLabel === "search_gap" ||
      suite.surfaceLabel === "answer_quality") &&
    (suite.purpose === "fixed_corpus" ||
      suite.purpose === "open_web" ||
      suite.purpose === "manual_consumer")
  );
}

function providerErrorHonest(o: CaseLevelOutcomeArtifact): boolean {
  if (o.retrievalCondition !== "PROVIDER_ERROR") return true;
  // Infrastructure errors are never graded as pass/fail answers.
  return (
    o.verdict === "unknown" &&
    !!o.errorLabel?.trim() &&
    o.deterministicClaimCheck === "NOT_APPLICABLE"
  );
}

function caseOutcomesStructurallyOk(
  outcomes: readonly CaseLevelOutcomeArtifact[] | undefined,
): boolean {
  if (!outcomes || outcomes.length === 0) return false;
  return outcomes.every(
    (o) =>
      o.caseId.trim().length > 0 &&
      o.redacted === true &&
      o.gapSummary.trim().length > 0 &&
      Number.isFinite(o.citationCount) &&
      o.citationCount >= 0 &&
      Number.isFinite(o.latencyMs) &&
      o.latencyMs >= 0 &&
      (o.retrievalCondition === "GROUNDED" ||
        o.retrievalCondition === "NO_GROUNDING" ||
        o.retrievalCondition === "PROVIDER_ERROR") &&
      (o.deterministicClaimCheck === "PASS" ||
        o.deterministicClaimCheck === "FAIL" ||
        o.deterministicClaimCheck === "NOT_APPLICABLE") &&
      providerErrorHonest(o),
  );
}

function coversCuratedCorpus(
  outcomes: readonly CaseLevelOutcomeArtifact[],
  curatedCaseIds: readonly string[],
): boolean {
  const outcomeIds = new Set(outcomes.map((o) => o.caseId.trim()));
  return curatedCaseIds.every((id) => outcomeIds.has(id.trim()));
}

function hasGradedProviderError(
  outcomes: readonly CaseLevelOutcomeArtifact[] | undefined,
): boolean {
  if (!outcomes) return false;
  return outcomes.some(
    (o) => o.retrievalCondition === "PROVIDER_ERROR" && !providerErrorHonest(o),
  );
}

function providerRunOk(
  run: ProviderSuiteRunEvidence | null,
  expectedProvider: "claude" | "gemini",
  curatedCaseIds: readonly string[],
): run is ProviderSuiteRunEvidence {
  if (!run) return false;
  return (
    run.provider === expectedProvider &&
    suiteSelectionOk(run.suite) &&
    conditionManifestComplete(run.conditionManifest) &&
    caseOutcomesStructurallyOk(run.caseOutcomes) &&
    coversCuratedCorpus(run.caseOutcomes, curatedCaseIds) &&
    run.adjudications.every((a) => a.provider === expectedProvider)
  );
}

function failedOutcomes(
  runs: readonly ProviderSuiteRunEvidence[],
): ProviderFailedOutcome[] {
  return runs.flatMap((r) =>
    r.caseOutcomes
      .filter((o) => o.verdict === "fail")
      .map((outcome) => ({ provider: r.provider, outcome })),
  );
}

function backlogLinkedCount(
  fails: readonly ProviderFailedOutcome[],
  adjudications: readonly HumanAdjudicationRecord[],
  backlogItems: readonly EvalSuiteBacklogItem[],
): number {
  let linked = 0;
  for (const fail of fails) {
    const adj = adjudications.find(
      (a) =>
        a.caseId === fail.outcome.caseId && a.provider === fail.provider,
    );
    if (
      !adj ||
      !adj.adjudicated ||
      !adj.backlogItemId?.trim() ||
      adj.releaseAuthorizedByModel !== false
    ) {
      continue;
    }
    const item = backlogItems.find(
      (b) =>
        b.backlogItemId === adj.backlogItemId &&
        b.linkedCaseId === fail.outcome.caseId &&
        !!b.title.trim(),
    );
    if (item) linked += 1;
  }
  return linked;
}

function redactConditionManifest(
  provider: "claude" | "gemini",
  manifest: EvalSuiteConditionManifest,
): RedactedConditionManifestEvidence {
  return {
    provider,
    evidenceVersion: manifest.evidenceVersion.trim(),
    repetitions: manifest.repetitions,
    toolMode: "EVAL_ONLY",
    models: manifest.models.map((m) => m.trim()),
  };
}

function redactCaseOutcomes(
  provider: "claude" | "gemini",
  outcomes: readonly CaseLevelOutcomeArtifact[],
): RedactedCaseOutcomeEvidence[] {
  return outcomes.map((o) => ({
    provider,
    caseId: o.caseId.trim(),
    verdict: o.verdict,
    citationCount: o.citationCount,
    retrievalCondition: o.retrievalCondition,
    latencyMs: o.latencyMs,
    errorLabel: o.errorLabel,
    deterministicClaimCheck: o.deterministicClaimCheck,
  }));
}

function humanSeparateFromModel(
  adjudications: readonly HumanAdjudicationRecord[],
): boolean {
  if (adjudications.length === 0) return false;
  return adjudications.every(
    (a) =>
      a.adjudicated &&
      a.releaseAuthorizedByModel === false &&
      // At least one failure path where human disagrees or marks needs_work
      // is not required for every record; separation is structural.
      (a.humanVerdict === "pass" ||
        a.humanVerdict === "fail" ||
        a.humanVerdict === "needs_work"),
  );
}

/**
 * Evaluate the T-F17 run-Claude-and-Gemini-evaluation-suites path offline.
 * Complete F17 evidence package → RUN_CLAUDE_GEMINI_EVALUATION_SUITES_EVIDENCE_RECORDED;
 * live eval stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateRunClaudeGeminiEvaluationSuites(
  input: RunClaudeGeminiEvaluationSuitesInput,
): RunClaudeGeminiEvaluationSuitesDecision {
  const base = {
    suitesRunRecorded: false as const,
    liveEvalWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const connections = input.providerConnections;
  const corpus = input.curatedCorpus;
  const budget = input.budgetConsent;
  const claudeRun = input.claudeRun;
  const geminiRun = input.geminiRun;
  const backlog = input.backlogItems ?? [];
  const allAdjudications = [
    ...(claudeRun?.adjudications ?? []),
    ...(geminiRun?.adjudications ?? []),
  ];
  const runs = [claudeRun, geminiRun].filter(
    (r): r is ProviderSuiteRunEvidence => r !== null,
  );
  const fails = failedOutcomes(runs);
  const linked = backlogLinkedCount(fails, allAdjudications, backlog);
  const claudeManifestOk = claudeRun
    ? conditionManifestComplete(claudeRun.conditionManifest)
    : false;
  const geminiManifestOk = geminiRun
    ? conditionManifestComplete(geminiRun.conditionManifest)
    : false;
  const manifestsOk = claudeManifestOk && geminiManifestOk;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_EVAL_ONLY_CONNECTIONS"
      | "AWAITING_CURATED_CORPUS"
      | "AWAITING_BUDGET_CONSENT"
      | "AWAITING_SUITE_SELECTION"
      | "AWAITING_CONDITION_MANIFEST"
      | "AWAITING_REDACTION_CHECK"
      | "AWAITING_AUTHORIZATION"
      | "AWAITING_CASE_OUTCOMES"
      | "AWAITING_ADJUDICATION",
    recoveryPath:
      | "CONNECT_CLAUDE_GEMINI_EVAL_ONLY"
      | "CURATE_EVAL_CASES"
      | "CONSENT_EVAL_BUDGET"
      | "SELECT_SUITE_AND_PURPOSE"
      | "COMPLETE_CONDITION_MANIFEST"
      | "REVIEW_PROMPTS_AND_PRIVACY"
      | "AUTHORIZE_BOUNDED_EVAL_RUN"
      | "INSPECT_CASE_OUTCOMES"
      | "ADJUDICATE_AND_LINK_BACKLOG"
      | "KEEP_FIXTURE_EVAL_NO_LIVE_WIRING"
      | "REFUSE_MODEL_GRADE_RELEASE"
      | "REFUSE_GRADED_PROVIDER_ERROR",
  ): NonNullable<
    Extract<
      RunClaudeGeminiEvaluationSuitesDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    claudeConnectionId:
      connections?.find((c) => c.provider === "claude")?.connectionId.trim() ||
      null,
    geminiConnectionId:
      connections?.find((c) => c.provider === "gemini")?.connectionId.trim() ||
      null,
    corpusId: corpus?.corpusId.trim() || null,
    curatedCaseCount: corpus?.caseIds.length ?? 0,
    purpose: corpus?.purpose ?? null,
    budgetConsentId: budget?.consentId.trim() || null,
    budgetCapMinor: budget?.budgetCapMinor ?? 0,
    reservedMinor: budget?.reservedMinor ?? 0,
    stopOnCap: budget?.stopOnCap === true,
    claudeSuiteId: claudeRun?.suite.suiteId.trim() || null,
    claudeSuiteVersion: claudeRun?.suite.suiteVersion.trim() || null,
    claudeSurfaceLabel: claudeRun?.suite.surfaceLabel ?? null,
    geminiSuiteId: geminiRun?.suite.suiteId.trim() || null,
    geminiSuiteVersion: geminiRun?.suite.suiteVersion.trim() || null,
    geminiSurfaceLabel: geminiRun?.suite.surfaceLabel ?? null,
    conditionManifestComplete: manifestsOk,
    conditionManifests: [
      ...(claudeRun
        ? [redactConditionManifest("claude", claudeRun.conditionManifest)]
        : []),
      ...(geminiRun
        ? [redactConditionManifest("gemini", geminiRun.conditionManifest)]
        : []),
    ],
    curatedCaseIds: corpus?.caseIds.map((id) => id.trim()) ?? [],
    caseOutcomeArtifacts: [
      ...(claudeRun ? redactCaseOutcomes("claude", claudeRun.caseOutcomes) : []),
      ...(geminiRun ? redactCaseOutcomes("gemini", geminiRun.caseOutcomes) : []),
    ],
    fixtureRedactionChecked: input.fixtureRedactionChecked,
    runAuthorized: input.runAuthorized,
    claudeCaseOutcomeCount: claudeRun?.caseOutcomes.length ?? 0,
    geminiCaseOutcomeCount: geminiRun?.caseOutcomes.length ?? 0,
    failedCaseCount: fails.length,
    adjudicationCount: allAdjudications.filter((a) => a.adjudicated).length,
    backlogLinkedCount: linked,
    humanVerdictSeparateFromModelGrade: humanSeparateFromModel(allAdjudications),
    releaseAuthorizedByModel: false,
    suitesVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveEvalWiring) {
    return {
      allowed: false,
      code: "LIVE_EVAL_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live Claude/Gemini evaluation suite wiring remains NOT_WIRED — refuse live wiring (T-F17)",
      ],
    };
  }

  if (input.claimLiveVerifiedSuites) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_SUITES_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified Claude/Gemini evaluation suite claim offline (T-F17) — fixture ACCEPTED ≠ VERIFIED",
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
        "KEEP_FIXTURE_EVAL_NO_LIVE_WIRING",
      ),
      reasons: [
        "Claude/Gemini evaluation suites must not perform production writes (T-F17)",
      ],
    };
  }

  if (input.authorizeReleaseFromModelGrade) {
    return {
      allowed: false,
      code: "MODEL_GRADE_RELEASE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "MODEL_GRADE_MUST_NOT_AUTHORIZE_RELEASE",
        "BLOCKED",
        "REFUSE_MODEL_GRADE_RELEASE",
      ),
      reasons: [
        "Favorable model grade must never authorize a release — human adjudication stays separate (T-F17)",
      ],
    };
  }

  if (!input.packageId.trim() || !connectionsOk(connections)) {
    return {
      allowed: false,
      code: "EVAL_ONLY_PROVIDER_CONNECTIONS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "EVAL_ONLY_CONNECTIONS_INCOMPLETE",
        "AWAITING_EVAL_ONLY_CONNECTIONS",
        "CONNECT_CLAUDE_GEMINI_EVAL_ONLY",
      ),
      reasons: [
        "F17 requires EVAL_ONLY Claude and Gemini provider connections with liveWiring NOT_WIRED (T-F17)",
      ],
    };
  }

  if (!corpusOk(corpus)) {
    return {
      allowed: false,
      code: "CURATED_CORPUS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CURATED_CORPUS_INCOMPLETE",
        "AWAITING_CURATED_CORPUS",
        "CURATE_EVAL_CASES",
      ),
      reasons: [
        "F17 requires curated cases with corpusId, caseIds, and purpose (fixed_corpus|open_web|manual_consumer) (T-F17)",
      ],
    };
  }

  if (!budgetOk(budget)) {
    return {
      allowed: false,
      code: "BUDGET_CONSENT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BUDGET_CONSENT_INCOMPLETE",
        "AWAITING_BUDGET_CONSENT",
        "CONSENT_EVAL_BUDGET",
      ),
      reasons: [
        "F17 requires budget consent with consentId, positive reserved<=cap, and stopOnCap (T-F17)",
      ],
    };
  }

  const curatedIds = corpus.caseIds;
  if (
    hasGradedProviderError(claudeRun?.caseOutcomes) ||
    hasGradedProviderError(geminiRun?.caseOutcomes)
  ) {
    return {
      allowed: false,
      code: "PROVIDER_ERROR_GRADED_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PROVIDER_ERROR_MUST_REMAIN_UNGRADED",
        "BLOCKED",
        "REFUSE_GRADED_PROVIDER_ERROR",
      ),
      reasons: [
        "PROVIDER_ERROR outcomes must stay ungraded (verdict unknown, errorLabel set, claim check NOT_APPLICABLE) — never pass/fail (T-F17 / T-US-034)",
      ],
    };
  }

  if (
    !providerRunOk(claudeRun, "claude", curatedIds) ||
    !providerRunOk(geminiRun, "gemini", curatedIds)
  ) {
    if (
      !suiteSelectionOk(claudeRun?.suite) ||
      !suiteSelectionOk(geminiRun?.suite)
    ) {
      return {
        allowed: false,
        code: "SUITE_SELECTION_REQUIRED",
        ...base,
        evidence: blockedEvidence(
          "SUITE_SELECTION_INCOMPLETE",
          "AWAITING_SUITE_SELECTION",
          "SELECT_SUITE_AND_PURPOSE",
        ),
        reasons: [
          "F17 requires Claude and Gemini suite selection with suiteId, version, surface label, and purpose (T-F17)",
        ],
      };
    }
    if (!claudeManifestOk || !geminiManifestOk) {
      return {
        allowed: false,
        code: "CONDITION_MANIFEST_INCOMPLETE",
        ...base,
        evidence: blockedEvidence(
          "CONDITION_MANIFEST_INCOMPLETE",
          "AWAITING_CONDITION_MANIFEST",
          "COMPLETE_CONDITION_MANIFEST",
        ),
        reasons: [
          "F17 condition manifests require evidence version, finite integer repetitions, EVAL_ONLY tool mode, models, and privacy/prompt review for both providers (T-F17)",
        ],
      };
    }
    if (
      (claudeRun &&
        caseOutcomesStructurallyOk(claudeRun.caseOutcomes) &&
        !coversCuratedCorpus(claudeRun.caseOutcomes, curatedIds)) ||
      (geminiRun &&
        caseOutcomesStructurallyOk(geminiRun.caseOutcomes) &&
        !coversCuratedCorpus(geminiRun.caseOutcomes, curatedIds))
    ) {
      return {
        allowed: false,
        code: "CURATED_CASE_OUTCOMES_REQUIRED",
        ...base,
        evidence: blockedEvidence(
          "CURATED_CORPUS_OUTCOMES_INCOMPLETE",
          "AWAITING_CASE_OUTCOMES",
          "INSPECT_CASE_OUTCOMES",
        ),
        reasons: [
          "Each provider's case outcomes must cover every curatedCorpus.caseId (T-F17)",
        ],
      };
    }
    return {
      allowed: false,
      code: "CASE_OUTCOME_ARTIFACTS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CASE_OUTCOME_ARTIFACTS_INCOMPLETE",
        "AWAITING_CASE_OUTCOMES",
        "INSPECT_CASE_OUTCOMES",
      ),
      reasons: [
        "F17 requires case-level outcome artifacts (redacted, citations, retrieval, latency, claim checks) for Claude and Gemini (T-F17)",
      ],
    };
  }

  if (!input.fixtureRedactionChecked) {
    return {
      allowed: false,
      code: "FIXTURE_REDACTION_CHECK_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "FIXTURE_REDACTION_CHECK_REQUIRED",
        "AWAITING_REDACTION_CHECK",
        "REVIEW_PROMPTS_AND_PRIVACY",
      ),
      reasons: [
        "Redaction and fixture check required before accepting eval case outcomes (T-F17)",
      ],
    };
  }

  if (!input.runAuthorized || !input.authorizationReason?.trim()) {
    return {
      allowed: false,
      code: "RUN_AUTHORIZATION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BOUNDED_RUN_AUTHORIZATION_REQUIRED",
        "AWAITING_AUTHORIZATION",
        "AUTHORIZE_BOUNDED_EVAL_RUN",
      ),
      reasons: [
        "Bounded Claude/Gemini evaluation suite run requires explicit authorization (T-F17)",
      ],
    };
  }

  if (fails.length === 0) {
    return {
      allowed: false,
      code: "ADJUDICATION_BACKLOG_UNLINKED",
      ...base,
      evidence: blockedEvidence(
        "FAILURE_ADJUDICATION_REQUIRED",
        "AWAITING_ADJUDICATION",
        "ADJUDICATE_AND_LINK_BACKLOG",
      ),
      reasons: [
        "F17 complete evidence requires at least one failed case with human adjudication and linked backlog (T-F17)",
      ],
    };
  }

  if (
    linked !== fails.length ||
    !humanSeparateFromModel(allAdjudications) ||
    backlog.length === 0
  ) {
    return {
      allowed: false,
      code: "ADJUDICATION_BACKLOG_UNLINKED",
      ...base,
      evidence: blockedEvidence(
        "ADJUDICATION_MUST_LINK_BACKLOG",
        "AWAITING_ADJUDICATION",
        "ADJUDICATE_AND_LINK_BACKLOG",
      ),
      reasons: [
        "Every failed case must be human-adjudicated with a linked remediation backlog item; model grade stays non-authorizing (T-F17)",
      ],
    };
  }

  const claude = connections.find((c) => c.provider === "claude")!;
  const gemini = connections.find((c) => c.provider === "gemini")!;

  return {
    allowed: true,
    code: "RUN_CLAUDE_GEMINI_EVALUATION_SUITES_EVIDENCE_RECORDED",
    suitesRunRecorded: true,
    liveEvalWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    productionWrites: false,
    evidence: {
      packageId: input.packageId.trim(),
      claudeConnectionId: claude.connectionId.trim(),
      geminiConnectionId: gemini.connectionId.trim(),
      corpusId: corpus.corpusId.trim(),
      curatedCaseCount: corpus.caseIds.length,
      purpose: corpus.purpose,
      budgetConsentId: budget.consentId.trim(),
      budgetCapMinor: budget.budgetCapMinor,
      reservedMinor: budget.reservedMinor,
      stopOnCap: true,
      claudeSuiteId: claudeRun.suite.suiteId.trim(),
      claudeSuiteVersion: claudeRun.suite.suiteVersion.trim(),
      claudeSurfaceLabel: claudeRun.suite.surfaceLabel,
      geminiSuiteId: geminiRun.suite.suiteId.trim(),
      geminiSuiteVersion: geminiRun.suite.suiteVersion.trim(),
      geminiSurfaceLabel: geminiRun.suite.surfaceLabel,
      conditionManifestComplete: true,
      conditionManifests: [
        redactConditionManifest("claude", claudeRun.conditionManifest),
        redactConditionManifest("gemini", geminiRun.conditionManifest),
      ],
      curatedCaseIds: curatedIds.map((id) => id.trim()),
      caseOutcomeArtifacts: [
        ...redactCaseOutcomes("claude", claudeRun.caseOutcomes),
        ...redactCaseOutcomes("gemini", geminiRun.caseOutcomes),
      ],
      fixtureRedactionChecked: true,
      runAuthorized: true,
      claudeCaseOutcomeCount: claudeRun.caseOutcomes.length,
      geminiCaseOutcomeCount: geminiRun.caseOutcomes.length,
      failedCaseCount: fails.length,
      adjudicationCount: allAdjudications.filter((a) => a.adjudicated).length,
      backlogLinkedCount: linked,
      humanVerdictSeparateFromModelGrade: true,
      releaseAuthorizedByModel: false,
      suitesVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F17_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "CLAUDE_GEMINI_EVAL_SUITES_RUN_ADJUDICATED",
      recoveryPath: "KEEP_FIXTURE_EVAL_NO_LIVE_WIRING",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F17 Claude+Gemini evaluation suite evidence recorded — no production writes; live NOT_WIRED (T-F17)",
    ],
  };
}
