/**
 * T-US-033 — Claude/Gemini eval suites (F17/SC-14) — adjudication + backlog.
 *
 * Offline fixture gate (happy-path family): select a versioned EVAL_ONLY suite,
 * authorize a bounded fixture run, record case results, adjudicate failures,
 * and link remediation backlog items — without production writes. Live eval
 * wiring stays NOT_WIRED. Distinct from T-US-015 (Claude Code + test API
 * connect), T-US-017 (Gemini connect), T-US-018/T-X037 (operational tool
 * forbid), and T-X038 (no-grounding fail closed). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type EvalSuiteProvider = "claude" | "gemini";

export type EvalSuiteSurfaceLabel =
  | "content_gap"
  | "search_gap"
  | "answer_quality";

export type EvalSuiteConditionManifest = {
  evidenceVersion: string;
  repetitions: number;
  toolMode: "EVAL_ONLY";
  models: string[];
  privacyReviewed: boolean;
  promptsReviewed: boolean;
};

export type EvalSuiteCaseArtifact = {
  caseId: string;
  verdict: "pass" | "fail" | "unknown";
  gapKind: "content" | "search" | "none";
  gapSummary: string;
  redacted: true;
};

export type EvalSuiteBacklogItem = {
  backlogItemId: string;
  linkedCaseId: string;
  title: string;
  remediationKind: "content_fix" | "search_fix" | "prompt_fix";
};

export type EvalSuiteAdjudicationInput = {
  suiteId: string;
  suiteVersion: string;
  surfaceLabel: EvalSuiteSurfaceLabel;
  provider: EvalSuiteProvider;
  conditionManifest: EvalSuiteConditionManifest;
  /** Owner/agent authorization for the bounded fixture run. */
  runAuthorized: boolean;
  authorizationReason: string | null;
  caseArtifacts: EvalSuiteCaseArtifact[];
  adjudications: Array<{
    caseId: string;
    adjudicated: boolean;
    backlogItemId: string | null;
  }>;
  backlogItems: EvalSuiteBacklogItem[];
  /** Fixture/redaction check passed for all case artifacts. */
  fixtureRedactionChecked: boolean;
  /** Claim live eval suite already verified — must refuse offline. */
  claimLiveVerifiedSuite: boolean;
  /** Request live provider eval wiring — must stay NOT_WIRED offline. */
  requestLiveEvalWiring: boolean;
  /** Attempt a production write from the eval surface — must refuse. */
  attemptProductionWrite: boolean;
};

export type EvalSuiteAdjudicationDecision =
  | {
      allowed: true;
      code: "EVAL_SUITE_ADJUDICATED_BACKLOG_LINKED";
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        suiteId: string;
        suiteVersion: string;
        surfaceLabel: EvalSuiteSurfaceLabel;
        provider: EvalSuiteProvider;
        conditionManifestComplete: true;
        runAuthorized: true;
        fixtureRedactionChecked: true;
        caseArtifactCount: number;
        failedCaseCount: number;
        adjudicationCount: number;
        backlogLinkedCount: number;
        productionWrites: false;
        suiteVerifiedLive: false;
        blockingDecision: string;
        currentState: "ADJUDICATED_WITH_BACKLOG";
        recoveryPath: "AUTHORIZE_RUN_ADJUDICATE_LINK_BACKLOG";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "SUITE_IDENTITY_INCOMPLETE"
        | "CONDITION_MANIFEST_INCOMPLETE"
        | "RUN_AUTHORIZATION_REQUIRED"
        | "FIXTURE_REDACTION_CHECK_REQUIRED"
        | "CASE_ARTIFACTS_REQUIRED"
        | "ADJUDICATION_BACKLOG_UNLINKED"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_SUITE_REFUSED"
        | "LIVE_EVAL_WIRING_NOT_WIRED";
      liveEvalWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        suiteId: string | null;
        suiteVersion: string | null;
        surfaceLabel: EvalSuiteSurfaceLabel | null;
        provider: EvalSuiteProvider | null;
        conditionManifestComplete: boolean;
        runAuthorized: boolean;
        fixtureRedactionChecked: boolean;
        caseArtifactCount: number;
        failedCaseCount: number;
        adjudicationCount: number;
        backlogLinkedCount: number;
        productionWrites: false;
        suiteVerifiedLive: false;
        blockingDecision: string;
        currentState: "BLOCKED" | "AWAITING_AUTHORIZATION" | "AWAITING_ADJUDICATION";
        recoveryPath: "AUTHORIZE_RUN_ADJUDICATE_LINK_BACKLOG";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const EVAL_SUITE_ADJUDICATION_RELATED_CASE_IDS = [
  "T-US-033",
  "T-F17",
] as const;

function preservedInputCount(input: EvalSuiteAdjudicationInput): number {
  const m = input.conditionManifest;
  return (
    (input.suiteId.trim() ? 1 : 0) +
    (input.suiteVersion.trim() ? 1 : 0) +
    (input.surfaceLabel ? 1 : 0) +
    (input.provider ? 1 : 0) +
    (m.evidenceVersion.trim() ? 1 : 0) +
    (m.repetitions > 0 ? 1 : 0) +
    (m.toolMode === "EVAL_ONLY" ? 1 : 0) +
    (m.models.length > 0 ? 1 : 0) +
    (m.privacyReviewed ? 1 : 0) +
    (m.promptsReviewed ? 1 : 0) +
    (input.runAuthorized ? 1 : 0) +
    (input.fixtureRedactionChecked ? 1 : 0) +
    (input.caseArtifacts.length > 0 ? 1 : 0) +
    (input.adjudications.length > 0 ? 1 : 0) +
    (input.backlogItems.length > 0 ? 1 : 0)
  );
}

function suiteIdentityComplete(input: EvalSuiteAdjudicationInput): boolean {
  return (
    !!input.suiteId.trim() &&
    !!input.suiteVersion.trim() &&
    (input.surfaceLabel === "content_gap" ||
      input.surfaceLabel === "search_gap" ||
      input.surfaceLabel === "answer_quality") &&
    (input.provider === "claude" || input.provider === "gemini")
  );
}

function conditionManifestComplete(
  manifest: EvalSuiteConditionManifest,
): boolean {
  return (
    !!manifest.evidenceVersion.trim() &&
    manifest.repetitions > 0 &&
    manifest.toolMode === "EVAL_ONLY" &&
    manifest.models.length > 0 &&
    manifest.models.every((m) => !!m.trim()) &&
    manifest.privacyReviewed &&
    manifest.promptsReviewed
  );
}

function failedCases(
  artifacts: EvalSuiteCaseArtifact[],
): EvalSuiteCaseArtifact[] {
  return artifacts.filter((a) => a.verdict === "fail");
}

function backlogLinkedCount(
  input: EvalSuiteAdjudicationInput,
  fails: EvalSuiteCaseArtifact[],
): number {
  let linked = 0;
  for (const fail of fails) {
    const adj = input.adjudications.find((a) => a.caseId === fail.caseId);
    if (!adj || !adj.adjudicated || !adj.backlogItemId?.trim()) continue;
    const item = input.backlogItems.find(
      (b) =>
        b.backlogItemId === adj.backlogItemId &&
        b.linkedCaseId === fail.caseId &&
        !!b.title.trim(),
    );
    if (item) linked += 1;
  }
  return linked;
}

/**
 * Evaluate Claude/Gemini eval suite run → adjudication → linked backlog.
 * Offline: successful adjudication links backlog without production writes;
 * false live verified claims and live wiring requests refused;
 * externalEffects NONE.
 */
export function evaluateEvalSuiteAdjudication(
  input: EvalSuiteAdjudicationInput,
): EvalSuiteAdjudicationDecision {
  const base = {
    liveEvalWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const fails = failedCases(input.caseArtifacts);
  const linked = backlogLinkedCount(input, fails);
  const manifestOk = conditionManifestComplete(input.conditionManifest);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_AUTHORIZATION"
      | "AWAITING_ADJUDICATION",
  ): NonNullable<
    Extract<EvalSuiteAdjudicationDecision, { allowed: false }>["evidence"]
  > => ({
    suiteId: input.suiteId.trim() || null,
    suiteVersion: input.suiteVersion.trim() || null,
    surfaceLabel: input.surfaceLabel ?? null,
    provider: input.provider ?? null,
    conditionManifestComplete: manifestOk,
    runAuthorized: input.runAuthorized,
    fixtureRedactionChecked: input.fixtureRedactionChecked,
    caseArtifactCount: input.caseArtifacts.length,
    failedCaseCount: fails.length,
    adjudicationCount: input.adjudications.filter((a) => a.adjudicated).length,
    backlogLinkedCount: linked,
    productionWrites: false,
    suiteVerifiedLive: false,
    blockingDecision,
    currentState,
    recoveryPath: "AUTHORIZE_RUN_ADJUDICATE_LINK_BACKLOG",
    preservedInputCount: preserved,
  });

  if (input.requestLiveEvalWiring) {
    return {
      allowed: false,
      code: "LIVE_EVAL_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live Claude/Gemini eval suite wiring remains NOT_WIRED — refuse live wiring (T-US-033)",
      ],
    };
  }

  if (input.claimLiveVerifiedSuite) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_SUITE_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified eval suite claim offline (T-US-033) — fixture ACCEPTED ≠ VERIFIED",
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
        "Eval suite adjudication must not perform production writes (T-US-033 / F17)",
      ],
    };
  }

  if (!suiteIdentityComplete(input)) {
    return {
      allowed: false,
      code: "SUITE_IDENTITY_INCOMPLETE",
      ...base,
      evidence: blockedEvidence("SUITE_IDENTITY_INCOMPLETE", "BLOCKED"),
      reasons: [
        "Versioned suite ID, surface label, and Claude/Gemini provider required (T-US-033 / F17)",
      ],
    };
  }

  if (!manifestOk) {
    return {
      allowed: false,
      code: "CONDITION_MANIFEST_INCOMPLETE",
      ...base,
      evidence: blockedEvidence("CONDITION_MANIFEST_INCOMPLETE", "BLOCKED"),
      reasons: [
        "Condition manifest requires evidence version, repetitions, EVAL_ONLY tool mode, models, and privacy/prompt review (T-US-033 / F17)",
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
      ),
      reasons: [
        "Bounded eval suite run requires explicit authorization (T-US-033 / F17)",
      ],
    };
  }

  if (!input.fixtureRedactionChecked) {
    return {
      allowed: false,
      code: "FIXTURE_REDACTION_CHECK_REQUIRED",
      ...base,
      evidence: blockedEvidence("FIXTURE_REDACTION_CHECK_REQUIRED", "BLOCKED"),
      reasons: [
        "Redaction and fixture check required before accepting case artifacts (T-US-033 / F17)",
      ],
    };
  }

  if (
    input.caseArtifacts.length === 0 ||
    !input.caseArtifacts.every(
      (a) => a.caseId.trim() && a.redacted === true && a.gapSummary.trim(),
    )
  ) {
    return {
      allowed: false,
      code: "CASE_ARTIFACTS_REQUIRED",
      ...base,
      evidence: blockedEvidence("CASE_RESULT_ARTIFACTS_REQUIRED", "BLOCKED"),
      reasons: [
        "Case result artifacts with redacted gap summaries are required (T-US-033 / F17)",
      ],
    };
  }

  if (fails.length === 0) {
    // Happy-path still requires at least one failure to exercise adjudication+backlog.
    return {
      allowed: false,
      code: "ADJUDICATION_BACKLOG_UNLINKED",
      ...base,
      evidence: blockedEvidence(
        "FAILURE_ADJUDICATION_REQUIRED",
        "AWAITING_ADJUDICATION",
      ),
      reasons: [
        "Eval suite adjudication proof requires at least one failed case with linked backlog (T-US-033 / F17)",
      ],
    };
  }

  if (linked !== fails.length) {
    return {
      allowed: false,
      code: "ADJUDICATION_BACKLOG_UNLINKED",
      ...base,
      evidence: blockedEvidence(
        "ADJUDICATION_MUST_LINK_BACKLOG",
        "AWAITING_ADJUDICATION",
      ),
      reasons: [
        "Every failed case must be adjudicated with a linked remediation backlog item (T-US-033 / F17)",
      ],
    };
  }

  return {
    allowed: true,
    code: "EVAL_SUITE_ADJUDICATED_BACKLOG_LINKED",
    ...base,
    evidence: {
      suiteId: input.suiteId,
      suiteVersion: input.suiteVersion,
      surfaceLabel: input.surfaceLabel,
      provider: input.provider,
      conditionManifestComplete: true,
      runAuthorized: true,
      fixtureRedactionChecked: true,
      caseArtifactCount: input.caseArtifacts.length,
      failedCaseCount: fails.length,
      adjudicationCount: input.adjudications.filter((a) => a.adjudicated).length,
      backlogLinkedCount: linked,
      productionWrites: false,
      suiteVerifiedLive: false,
      blockingDecision: "NONE",
      currentState: "ADJUDICATED_WITH_BACKLOG",
      recoveryPath: "AUTHORIZE_RUN_ADJUDICATE_LINK_BACKLOG",
      preservedInputCount: preserved,
    },
    reasons: [
      "Fixture EVAL_ONLY suite adjudicated with linked backlog — no production writes (T-US-033 / F17)",
    ],
  };
}
