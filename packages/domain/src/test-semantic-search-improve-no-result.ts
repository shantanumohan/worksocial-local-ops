/**
 * T-F23 — Test semantic search and improve no-result cases (complete F23
 * evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F23 evidence
 * package — approved catalog + authoritative field ownership, representative
 * customer need with parsed intent and ambiguities, candidate eligibility
 * inspection (filter trace), answer + booking handoff review (citations /
 * destination links or explicit uncertainty), judgment record (relevant /
 * wrong / no-match), content or retrieval remediation, and golden-set
 * evaluation comparison. Incomplete packages, silent false matches, false
 * live-verified claims, and live provider wiring are refused. Live provider
 * wiring stays NOT_WIRED. Pure domain — no network I/O. Fixture ACCEPTED ≠
 * sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-045 (`SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON`) — this
 * records the complete F23 flow evidence package (Given prerequisites +
 * structured package across all six steps), not the evaluation-comparison
 * focused no-result→golden path alone. Distinct from T-US-046 / T-X048
 * (hard search constraints / no invention) and T-X038 (eval no-grounding).
 */

export type ApprovedCatalogOwnership = {
  catalogId: string;
  /** Authoritative field ownership IDs for catalog facts. */
  fieldOwnerIds: readonly string[];
  approved: boolean;
};

export type ParsedIntentEvidence = {
  intentId: string;
  /** Representative customer need text. */
  customerNeed: string;
  /** Parsed constraints (people, amenities, etc.). */
  parsedConstraints: readonly string[];
  /** Ambiguities left explicit — never invented away. */
  ambiguities: readonly string[];
};

export type CandidateEligibilityInspection = {
  inspectionId: string;
  /** Filter / eligibility trace steps. */
  filterTrace: readonly string[];
  /** Candidate entry IDs inspected (may be empty on honest no-result). */
  candidateIds: readonly string[];
  eligibleCount: number;
};

export type AnswerHandoffReview = {
  reviewId: string;
  /** Answer posture after hard constraints. */
  answerStatus: "GROUNDED" | "NO_RESULT" | "UNKNOWN" | "CLARIFY";
  /** Citation fact IDs when grounded; empty when explicit uncertainty. */
  citationIds: readonly string[];
  /** Destination / booking links — never invented without grounding. */
  destinationLinks: readonly string[];
  bookingHandoffUrl: string | null;
  /** Explicit uncertainty recorded when not grounded. */
  explicitUncertainty: boolean;
};

export type JudgmentEvidence = {
  judgmentId: string;
  queryId: string;
  label: "RELEVANT" | "WRONG" | "NO_MATCH";
  note: string;
};

export type RemediationEvidence = {
  remediationId: string;
  judgmentId: string;
  summary: string;
  kind: "CONTENT" | "RETRIEVAL";
  status: "OPEN" | "DONE";
};

export type EvaluationComparisonEvidence = {
  comparisonId: string;
  beforeAnswerStatus: "GROUNDED" | "NO_RESULT" | "UNKNOWN" | "CLARIFY";
  afterAnswerStatus: "GROUNDED" | "NO_RESULT" | "UNKNOWN" | "CLARIFY";
  beforeIndexVersion: number;
  afterIndexVersion: number;
  /** Golden set improved (or honest no silent false match). */
  goldenImproved: boolean;
  silentFalseMatch: boolean;
};

export type TestSemanticSearchImproveNoResultInput = {
  packageId: string;
  catalogOwnership: ApprovedCatalogOwnership | null;
  parsedIntent: ParsedIntentEvidence | null;
  eligibility: CandidateEligibilityInspection | null;
  answerHandoff: AnswerHandoffReview | null;
  judgment: JudgmentEvidence | null;
  remediation: RemediationEvidence | null;
  evaluationComparison: EvaluationComparisonEvidence | null;
  /** Claim the F23 path is live-verified — must refuse offline. */
  claimLiveVerifiedSearch: boolean;
  /** Request live search / CMS / eval apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * Attempt to invent a grounded match / booking handoff without citations —
   * must refuse (T-US-046 / T-X048 / silent false match territory).
   */
  requestSilentFalseMatch: boolean;
};

export type TestSemanticSearchImproveNoResultDecision =
  | {
      allowed: true;
      code: "TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_EVIDENCE_RECORDED";
      semanticSearchImprovedRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        catalogId: string;
        fieldOwnerIds: string[];
        intentId: string;
        customerNeed: string;
        parsedConstraints: string[];
        ambiguities: string[];
        inspectionId: string;
        filterTrace: string[];
        candidateIds: string[];
        eligibleCount: number;
        answerReviewId: string;
        answerStatus: AnswerHandoffReview["answerStatus"];
        citationIds: string[];
        destinationLinks: string[];
        bookingHandoffUrl: string | null;
        explicitUncertainty: boolean;
        judgmentId: string;
        judgmentLabel: JudgmentEvidence["label"];
        remediationId: string;
        remediationKind: RemediationEvidence["kind"];
        remediationStatus: RemediationEvidence["status"];
        comparisonId: string;
        beforeAnswerStatus: EvaluationComparisonEvidence["beforeAnswerStatus"];
        afterAnswerStatus: EvaluationComparisonEvidence["afterAnswerStatus"];
        beforeIndexVersion: number;
        afterIndexVersion: number;
        goldenImproved: true;
        silentFalseMatch: false;
        searchVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F23_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "SEMANTIC_SEARCH_NO_RESULT_IMPROVED";
        recoveryPath: "KEEP_FIXTURE_SEARCH_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "CATALOG_OWNERSHIP_REQUIRED"
        | "PARSED_INTENT_REQUIRED"
        | "ELIGIBILITY_INSPECTION_REQUIRED"
        | "ANSWER_HANDOFF_REVIEW_REQUIRED"
        | "JUDGMENT_RECORD_REQUIRED"
        | "REMEDIATION_TASK_REQUIRED"
        | "EVALUATION_COMPARISON_REQUIRED"
        | "SILENT_FALSE_MATCH_REFUSED"
        | "FALSE_LIVE_VERIFIED_SEARCH_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      semanticSearchImprovedRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        catalogId: string | null;
        fieldOwnerIds: string[];
        intentId: string | null;
        customerNeed: string | null;
        parsedConstraints: string[];
        ambiguities: string[];
        inspectionId: string | null;
        filterTrace: string[];
        candidateIds: string[];
        eligibleCount: number | null;
        answerReviewId: string | null;
        answerStatus: AnswerHandoffReview["answerStatus"] | null;
        citationIds: string[];
        destinationLinks: string[];
        bookingHandoffUrl: string | null;
        explicitUncertainty: boolean | null;
        judgmentId: string | null;
        judgmentLabel: JudgmentEvidence["label"] | null;
        remediationId: string | null;
        remediationKind: RemediationEvidence["kind"] | null;
        remediationStatus: RemediationEvidence["status"] | null;
        comparisonId: string | null;
        beforeAnswerStatus:
          | EvaluationComparisonEvidence["beforeAnswerStatus"]
          | null;
        afterAnswerStatus:
          | EvaluationComparisonEvidence["afterAnswerStatus"]
          | null;
        beforeIndexVersion: number | null;
        afterIndexVersion: number | null;
        goldenImproved: boolean | null;
        silentFalseMatch: boolean | null;
        searchVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_CATALOG_OWNERSHIP"
          | "AWAITING_PARSED_INTENT"
          | "AWAITING_ELIGIBILITY_INSPECTION"
          | "AWAITING_ANSWER_HANDOFF_REVIEW"
          | "AWAITING_JUDGMENT_RECORD"
          | "AWAITING_REMEDIATION_TASK"
          | "AWAITING_EVALUATION_COMPARISON"
          | "REFUSED_SILENT_FALSE_MATCH"
          | "REFUSED_FALSE_LIVE_VERIFIED"
          | "REFUSED_LIVE_PROVIDER_WIRING";
        recoveryPath:
          | "RECORD_APPROVED_CATALOG_AND_FIELD_OWNERSHIP"
          | "PARSE_CUSTOMER_NEED_WITH_AMBIGUITIES"
          | "INSPECT_CANDIDATE_ELIGIBILITY_FILTER_TRACE"
          | "REVIEW_ANSWER_AND_BOOKING_HANDOFF"
          | "RECORD_JUDGMENT_RELEVANT_WRONG_OR_NO_MATCH"
          | "CREATE_CONTENT_OR_RETRIEVAL_REMEDIATION"
          | "RE_RUN_GOLDEN_SET_EVALUATION_COMPARISON"
          | "KEEP_FIXTURE_SEARCH_NO_LIVE_PROVIDER"
          | "REFUSE_SILENT_FALSE_MATCH";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_RELATED_CASE_IDS = [
  "T-F23",
] as const;

function preservedInputCount(
  input: TestSemanticSearchImproveNoResultInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.catalogOwnership?.catalogId.trim() ? 1 : 0) +
    (input.parsedIntent?.intentId.trim() ? 1 : 0) +
    (input.eligibility?.inspectionId.trim() ? 1 : 0) +
    (input.answerHandoff?.reviewId.trim() ? 1 : 0) +
    (input.judgment?.judgmentId.trim() ? 1 : 0) +
    (input.remediation?.remediationId.trim() ? 1 : 0) +
    (input.evaluationComparison?.comparisonId.trim() ? 1 : 0)
  );
}

function catalogOk(
  catalog: ApprovedCatalogOwnership | null,
): catalog is ApprovedCatalogOwnership {
  if (!catalog) return false;
  return (
    catalog.catalogId.trim().length > 0 &&
    catalog.approved === true &&
    catalog.fieldOwnerIds.length > 0 &&
    catalog.fieldOwnerIds.every((id) => id.trim().length > 0)
  );
}

function intentOk(
  intent: ParsedIntentEvidence | null,
): intent is ParsedIntentEvidence {
  if (!intent) return false;
  return (
    intent.intentId.trim().length > 0 &&
    intent.customerNeed.trim().length > 0 &&
    intent.parsedConstraints.length > 0 &&
    intent.parsedConstraints.every((c) => c.trim().length > 0) &&
    Array.isArray(intent.ambiguities)
  );
}

function eligibilityOk(
  eligibility: CandidateEligibilityInspection | null,
): eligibility is CandidateEligibilityInspection {
  if (!eligibility) return false;
  return (
    eligibility.inspectionId.trim().length > 0 &&
    eligibility.filterTrace.length > 0 &&
    eligibility.filterTrace.every((s) => s.trim().length > 0) &&
    Number.isFinite(eligibility.eligibleCount) &&
    eligibility.eligibleCount >= 0
  );
}

function answerOk(
  answer: AnswerHandoffReview | null,
): answer is AnswerHandoffReview {
  if (!answer) return false;
  if (!answer.reviewId.trim()) return false;
  const statusOk =
    answer.answerStatus === "GROUNDED" ||
    answer.answerStatus === "NO_RESULT" ||
    answer.answerStatus === "UNKNOWN" ||
    answer.answerStatus === "CLARIFY";
  if (!statusOk) return false;
  if (answer.answerStatus === "GROUNDED") {
    return (
      answer.citationIds.length > 0 &&
      answer.citationIds.every((id) => id.trim().length > 0) &&
      answer.explicitUncertainty === false
    );
  }
  // Explicit uncertainty required when not grounded; no invented booking.
  return (
    answer.explicitUncertainty === true &&
    answer.bookingHandoffUrl === null &&
    answer.citationIds.length === 0
  );
}

function judgmentOk(
  judgment: JudgmentEvidence | null,
): judgment is JudgmentEvidence {
  if (!judgment) return false;
  return (
    judgment.judgmentId.trim().length > 0 &&
    judgment.queryId.trim().length > 0 &&
    (judgment.label === "RELEVANT" ||
      judgment.label === "WRONG" ||
      judgment.label === "NO_MATCH") &&
    judgment.note.trim().length > 0
  );
}

function remediationOk(
  remediation: RemediationEvidence | null,
): remediation is RemediationEvidence {
  if (!remediation) return false;
  return (
    remediation.remediationId.trim().length > 0 &&
    remediation.judgmentId.trim().length > 0 &&
    remediation.summary.trim().length > 0 &&
    (remediation.kind === "CONTENT" || remediation.kind === "RETRIEVAL") &&
    (remediation.status === "OPEN" || remediation.status === "DONE")
  );
}

function comparisonOk(
  comparison: EvaluationComparisonEvidence | null,
): comparison is EvaluationComparisonEvidence {
  if (!comparison) return false;
  return (
    comparison.comparisonId.trim().length > 0 &&
    Number.isFinite(comparison.beforeIndexVersion) &&
    Number.isFinite(comparison.afterIndexVersion) &&
    comparison.afterIndexVersion > comparison.beforeIndexVersion &&
    comparison.goldenImproved === true &&
    comparison.silentFalseMatch === false
  );
}

/**
 * Evaluate the T-F23 test-semantic-search-improve-no-result path offline.
 * Complete F23 evidence package →
 * TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_EVIDENCE_RECORDED; live providers
 * stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateTestSemanticSearchImproveNoResult(
  input: TestSemanticSearchImproveNoResultInput,
): TestSemanticSearchImproveNoResultDecision {
  const base = {
    semanticSearchImprovedRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const catalog = input.catalogOwnership;
  const intent = input.parsedIntent;
  const eligibility = input.eligibility;
  const answer = input.answerHandoff;
  const judgment = input.judgment;
  const remediation = input.remediation;
  const comparison = input.evaluationComparison;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_CATALOG_OWNERSHIP"
      | "AWAITING_PARSED_INTENT"
      | "AWAITING_ELIGIBILITY_INSPECTION"
      | "AWAITING_ANSWER_HANDOFF_REVIEW"
      | "AWAITING_JUDGMENT_RECORD"
      | "AWAITING_REMEDIATION_TASK"
      | "AWAITING_EVALUATION_COMPARISON"
      | "REFUSED_SILENT_FALSE_MATCH"
      | "REFUSED_FALSE_LIVE_VERIFIED"
      | "REFUSED_LIVE_PROVIDER_WIRING",
    recoveryPath:
      | "RECORD_APPROVED_CATALOG_AND_FIELD_OWNERSHIP"
      | "PARSE_CUSTOMER_NEED_WITH_AMBIGUITIES"
      | "INSPECT_CANDIDATE_ELIGIBILITY_FILTER_TRACE"
      | "REVIEW_ANSWER_AND_BOOKING_HANDOFF"
      | "RECORD_JUDGMENT_RELEVANT_WRONG_OR_NO_MATCH"
      | "CREATE_CONTENT_OR_RETRIEVAL_REMEDIATION"
      | "RE_RUN_GOLDEN_SET_EVALUATION_COMPARISON"
      | "KEEP_FIXTURE_SEARCH_NO_LIVE_PROVIDER"
      | "REFUSE_SILENT_FALSE_MATCH",
  ): NonNullable<
    Extract<
      TestSemanticSearchImproveNoResultDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    catalogId: catalog?.catalogId.trim() || null,
    fieldOwnerIds: catalog?.fieldOwnerIds.map((id) => id.trim()) ?? [],
    intentId: intent?.intentId.trim() || null,
    customerNeed: intent?.customerNeed.trim() || null,
    parsedConstraints: intent?.parsedConstraints.map((c) => c.trim()) ?? [],
    ambiguities: intent?.ambiguities.map((a) => a.trim()) ?? [],
    inspectionId: eligibility?.inspectionId.trim() || null,
    filterTrace: eligibility?.filterTrace.map((s) => s.trim()) ?? [],
    candidateIds: eligibility?.candidateIds.map((id) => id.trim()) ?? [],
    eligibleCount:
      eligibility && Number.isFinite(eligibility.eligibleCount)
        ? eligibility.eligibleCount
        : null,
    answerReviewId: answer?.reviewId.trim() || null,
    answerStatus: answer?.answerStatus ?? null,
    citationIds: answer?.citationIds.map((id) => id.trim()) ?? [],
    destinationLinks: answer?.destinationLinks.map((l) => l.trim()) ?? [],
    bookingHandoffUrl: answer?.bookingHandoffUrl ?? null,
    explicitUncertainty: answer?.explicitUncertainty ?? null,
    judgmentId: judgment?.judgmentId.trim() || null,
    judgmentLabel: judgment?.label ?? null,
    remediationId: remediation?.remediationId.trim() || null,
    remediationKind: remediation?.kind ?? null,
    remediationStatus: remediation?.status ?? null,
    comparisonId: comparison?.comparisonId.trim() || null,
    beforeAnswerStatus: comparison?.beforeAnswerStatus ?? null,
    afterAnswerStatus: comparison?.afterAnswerStatus ?? null,
    beforeIndexVersion: comparison?.beforeIndexVersion ?? null,
    afterIndexVersion: comparison?.afterIndexVersion ?? null,
    goldenImproved: comparison?.goldenImproved ?? null,
    silentFalseMatch: comparison?.silentFalseMatch ?? null,
    searchVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.claimLiveVerifiedSearch) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_SEARCH_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "FALSE_LIVE_VERIFIED_CLAIM",
        "REFUSED_FALSE_LIVE_VERIFIED",
        "KEEP_FIXTURE_SEARCH_NO_LIVE_PROVIDER",
      ),
      reasons: [
        "Offline F23 fixture cannot claim live-verified semantic search (T-F23)",
      ],
    };
  }

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: blockedEvidence(
        "LIVE_PROVIDER_REQUESTED",
        "REFUSED_LIVE_PROVIDER_WIRING",
        "KEEP_FIXTURE_SEARCH_NO_LIVE_PROVIDER",
      ),
      reasons: [
        "Live search/CMS/eval providers stay NOT_WIRED for offline F23 fixture (T-F23)",
      ],
    };
  }

  if (input.requestSilentFalseMatch) {
    return {
      allowed: false,
      code: "SILENT_FALSE_MATCH_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "SILENT_FALSE_MATCH_ATTEMPTED",
        "REFUSED_SILENT_FALSE_MATCH",
        "REFUSE_SILENT_FALSE_MATCH",
      ),
      reasons: [
        "Silent false match / invented grounded booking without citations refused (T-F23 / T-US-046)",
      ],
    };
  }

  if (!input.packageId.trim()) {
    return {
      allowed: false,
      code: "CATALOG_OWNERSHIP_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PACKAGE_ID_MISSING",
        "BLOCKED",
        "RECORD_APPROVED_CATALOG_AND_FIELD_OWNERSHIP",
      ),
      reasons: ["F23 requires a packageId for the evidence package (T-F23)"],
    };
  }

  if (!catalogOk(catalog)) {
    return {
      allowed: false,
      code: "CATALOG_OWNERSHIP_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CATALOG_OWNERSHIP_INCOMPLETE",
        "AWAITING_CATALOG_OWNERSHIP",
        "RECORD_APPROVED_CATALOG_AND_FIELD_OWNERSHIP",
      ),
      reasons: [
        "F23 Given requires approved catalog and authoritative field ownership (T-F23)",
      ],
    };
  }

  if (!intentOk(intent)) {
    return {
      allowed: false,
      code: "PARSED_INTENT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PARSED_INTENT_INCOMPLETE",
        "AWAITING_PARSED_INTENT",
        "PARSE_CUSTOMER_NEED_WITH_AMBIGUITIES",
      ),
      reasons: [
        "F23 requires parsed intent with customer need, constraints, and explicit ambiguities (T-F23)",
      ],
    };
  }

  if (!eligibilityOk(eligibility)) {
    return {
      allowed: false,
      code: "ELIGIBILITY_INSPECTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ELIGIBILITY_INSPECTION_INCOMPLETE",
        "AWAITING_ELIGIBILITY_INSPECTION",
        "INSPECT_CANDIDATE_ELIGIBILITY_FILTER_TRACE",
      ),
      reasons: [
        "F23 requires candidate eligibility inspection with filter trace (T-F23)",
      ],
    };
  }

  if (!answerOk(answer)) {
    return {
      allowed: false,
      code: "ANSWER_HANDOFF_REVIEW_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ANSWER_HANDOFF_REVIEW_INCOMPLETE",
        "AWAITING_ANSWER_HANDOFF_REVIEW",
        "REVIEW_ANSWER_AND_BOOKING_HANDOFF",
      ),
      reasons: [
        "F23 requires answer/handoff review with citations when grounded or explicit uncertainty otherwise (T-F23)",
      ],
    };
  }

  if (!judgmentOk(judgment)) {
    return {
      allowed: false,
      code: "JUDGMENT_RECORD_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "JUDGMENT_RECORD_INCOMPLETE",
        "AWAITING_JUDGMENT_RECORD",
        "RECORD_JUDGMENT_RELEVANT_WRONG_OR_NO_MATCH",
      ),
      reasons: [
        "F23 requires judgment record (relevant / wrong / no-match) (T-F23)",
      ],
    };
  }

  if (!remediationOk(remediation)) {
    return {
      allowed: false,
      code: "REMEDIATION_TASK_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "REMEDIATION_TASK_INCOMPLETE",
        "AWAITING_REMEDIATION_TASK",
        "CREATE_CONTENT_OR_RETRIEVAL_REMEDIATION",
      ),
      reasons: [
        "F23 requires content or retrieval remediation linked to judgment (T-F23)",
      ],
    };
  }

  if (remediation.judgmentId.trim() !== judgment.judgmentId.trim()) {
    return {
      allowed: false,
      code: "REMEDIATION_TASK_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "REMEDIATION_JUDGMENT_MISMATCH",
        "AWAITING_REMEDIATION_TASK",
        "CREATE_CONTENT_OR_RETRIEVAL_REMEDIATION",
      ),
      reasons: [
        "F23 remediation must link to the recorded judgment id (T-F23)",
      ],
    };
  }

  if (!comparisonOk(comparison)) {
    return {
      allowed: false,
      code: "EVALUATION_COMPARISON_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "EVALUATION_COMPARISON_INCOMPLETE",
        "AWAITING_EVALUATION_COMPARISON",
        "RE_RUN_GOLDEN_SET_EVALUATION_COMPARISON",
      ),
      reasons: [
        "F23 requires golden-set evaluation comparison with improved index and no silent false match (T-F23)",
      ],
    };
  }

  return {
    allowed: true,
    code: "TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT_EVIDENCE_RECORDED",
    ...base,
    semanticSearchImprovedRecorded: true,
    evidence: {
      packageId: input.packageId.trim(),
      catalogId: catalog.catalogId.trim(),
      fieldOwnerIds: catalog.fieldOwnerIds.map((id) => id.trim()),
      intentId: intent.intentId.trim(),
      customerNeed: intent.customerNeed.trim(),
      parsedConstraints: intent.parsedConstraints.map((c) => c.trim()),
      ambiguities: intent.ambiguities.map((a) => a.trim()),
      inspectionId: eligibility.inspectionId.trim(),
      filterTrace: eligibility.filterTrace.map((s) => s.trim()),
      candidateIds: eligibility.candidateIds.map((id) => id.trim()),
      eligibleCount: eligibility.eligibleCount,
      answerReviewId: answer.reviewId.trim(),
      answerStatus: answer.answerStatus,
      citationIds: answer.citationIds.map((id) => id.trim()),
      destinationLinks: answer.destinationLinks.map((l) => l.trim()),
      bookingHandoffUrl: answer.bookingHandoffUrl,
      explicitUncertainty: answer.explicitUncertainty,
      judgmentId: judgment.judgmentId.trim(),
      judgmentLabel: judgment.label,
      remediationId: remediation.remediationId.trim(),
      remediationKind: remediation.kind,
      remediationStatus: remediation.status,
      comparisonId: comparison.comparisonId.trim(),
      beforeAnswerStatus: comparison.beforeAnswerStatus,
      afterAnswerStatus: comparison.afterAnswerStatus,
      beforeIndexVersion: comparison.beforeIndexVersion,
      afterIndexVersion: comparison.afterIndexVersion,
      goldenImproved: true,
      silentFalseMatch: false,
      searchVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F23_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "SEMANTIC_SEARCH_NO_RESULT_IMPROVED",
      recoveryPath: "KEEP_FIXTURE_SEARCH_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F23 evidence package recorded (approved catalog/ownership, parsed intent+ambiguities, eligibility filter trace, answer/handoff review, judgment, remediation, golden evaluation comparison); live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}
