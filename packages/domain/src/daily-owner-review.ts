/**
 * T-US-049 — Daily owner review (F25/SC-01) — reviewed operating knowledge.
 *
 * Offline fixture gate (happy-path family): the owner opens a morning brief
 * backed by evidence, inspects overnight completed work, records decisions for
 * exceptions needing authority, reviews outcome/cost with synthetic excluded,
 * chooses a new bounded mission within approved scope, and saves useful
 * learning as versioned operating knowledge — without silently expanding
 * authority. Live provider wiring stays NOT_WIRED. Pure domain — no network
 * I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-050 (owner brief groups root cause; actionable),
 * T-US-025 (launch workstream / schedule mission outcome), and T-US-035
 * (review/revise/release receipt or blocked exception).
 */

export type OwnerDecisionKind =
  | "APPROVE"
  | "REVISE"
  | "REJECT"
  | "ASSIGN"
  | "HOLD";

export type CompletedWorkLedgerEntry = {
  workItemId: string;
  /** Revision / change id linked to overnight work. */
  revisionId: string;
  /** Receipt or observation id proving the change. */
  receiptOrObservationId: string;
  summary: string;
};

export type OwnerDecisionRecord = {
  exceptionId: string;
  decision: OwnerDecisionKind;
  reason: string;
  decidedByRoleId: string;
};

export type OutcomeCostView = {
  /** Actual spend in minor units (may be 0). */
  actualSpendMinor: number;
  /** Estimates in minor units (may be 0). */
  estimateSpendMinor: number;
  /** Pending attribution amount — must not be treated as confirmed. */
  pendingAttributionMinor: number;
  /** Synthetic / fixture amounts excluded from business denominators. */
  syntheticExcludedMinor: number;
  /** Honest label that synthetic was excluded. */
  syntheticExcluded: boolean;
};

export type BoundedMissionDraft = {
  missionId: string;
  objective: string;
  /** Approved commercial / pilot scope id. */
  approvedScopeId: string;
  /** Mission stays inside previously approved scope. */
  withinApprovedScope: boolean;
};

export type ReviewedOperatingKnowledge = {
  playbookUpdateId: string;
  /** Versioned knowledge id (e.g. playbook-v12). */
  knowledgeVersionId: string;
  learningSummary: string;
  /** True when the update would silently widen standing authority — refused. */
  expandsAuthoritySilently: boolean;
};

export type DailyOwnerReviewInput = {
  briefId: string;
  /** Evidence-backed morning summary (lost leads / unanswered / material decisions). */
  evidenceBackedSummary: string;
  completedWorkLedger: readonly CompletedWorkLedgerEntry[];
  decisionRecords: readonly OwnerDecisionRecord[];
  outcomeCostView: OutcomeCostView;
  newBoundedMission: BoundedMissionDraft;
  reviewedOperatingKnowledge: ReviewedOperatingKnowledge;
  /**
   * No material overnight findings — calm empty state is allowed when ledger
   * and decisions are empty; manufacturing urgency is refused.
   */
  manufactureUrgencyWithNoFindings: boolean;
  /**
   * Celebrate performance lift while attribution is still pending — refused.
   */
  celebrateLiftOnPendingData: boolean;
  /** Claim the daily review is live-verified — must refuse offline. */
  claimLiveVerifiedReview: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /** Attempt a production write from the owner review surface — refuse. */
  attemptProductionWrite: boolean;
};

export type DailyOwnerReviewDecision =
  | {
      allowed: true;
      code: "DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        briefId: string;
        evidenceBackedSummary: string;
        completedWorkCount: number;
        decisionRecordCount: number;
        actualSpendMinor: number;
        estimateSpendMinor: number;
        pendingAttributionMinor: number;
        syntheticExcludedMinor: number;
        syntheticExcluded: true;
        missionId: string;
        approvedScopeId: string;
        playbookUpdateId: string;
        knowledgeVersionId: string;
        learningSummary: string;
        authorityExpanded: false;
        reviewVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "OWNER_REVIEW_COMPLETE";
        currentState: "REVIEWED_OPERATING_KNOWLEDGE_RECORDED";
        recoveryPath: "TRACK_BOUNDED_MISSION_AND_PLAYBOOK";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "BRIEF_EVIDENCE_REQUIRED"
        | "COMPLETED_WORK_LEDGER_INCOMPLETE"
        | "DECISION_RECORDS_INCOMPLETE"
        | "OUTCOME_COST_VIEW_INVALID"
        | "BOUNDED_MISSION_REQUIRED"
        | "MISSION_OUTSIDE_APPROVED_SCOPE"
        | "OPERATING_KNOWLEDGE_REQUIRED"
        | "SILENT_AUTHORITY_EXPANSION_REFUSED"
        | "MANUFACTURED_URGENCY_REFUSED"
        | "PENDING_DATA_LIFT_CELEBRATION_REFUSED"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_REVIEW_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        briefId: string | null;
        evidenceBackedSummary: string | null;
        completedWorkCount: number;
        decisionRecordCount: number;
        actualSpendMinor: number | null;
        estimateSpendMinor: number | null;
        pendingAttributionMinor: number | null;
        syntheticExcludedMinor: number | null;
        syntheticExcluded: boolean | null;
        missionId: string | null;
        approvedScopeId: string | null;
        playbookUpdateId: string | null;
        knowledgeVersionId: string | null;
        learningSummary: string | null;
        authorityExpanded: boolean | null;
        reviewVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_BRIEF_EVIDENCE"
          | "AWAITING_LEDGER"
          | "AWAITING_DECISIONS"
          | "AWAITING_COST_VIEW"
          | "AWAITING_BOUNDED_MISSION"
          | "AWAITING_OPERATING_KNOWLEDGE";
        recoveryPath:
          | "COMPLETE_MORNING_BRIEF"
          | "LINK_COMPLETED_WORK_RECEIPTS"
          | "RECORD_EXCEPTION_DECISIONS"
          | "SEPARATE_ACTUAL_ESTIMATE_PENDING_SYNTHETIC"
          | "CHOOSE_BOUNDED_MISSION_IN_SCOPE"
          | "SAVE_VERSIONED_PLAYBOOK_WITHOUT_AUTHORITY_EXPAND";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const DAILY_OWNER_REVIEW_RELATED_CASE_IDS = [
  "T-US-049",
  "T-F25",
] as const;

function isFiniteNonNeg(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

function preservedInputCount(input: DailyOwnerReviewInput): number {
  return (
    (input.briefId.trim() ? 1 : 0) +
    (input.evidenceBackedSummary.trim() ? 1 : 0) +
    (input.completedWorkLedger.length > 0 ? 1 : 0) +
    (input.decisionRecords.length > 0 ? 1 : 0) +
    1 + // outcomeCostView always present as object
    (input.newBoundedMission.missionId.trim() ? 1 : 0) +
    (input.reviewedOperatingKnowledge.playbookUpdateId.trim() ? 1 : 0)
  );
}

/**
 * Evaluate the F25 daily owner review path offline.
 * Complete evidence set → DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED; live stays
 * NOT_WIRED; silent authority expansion and false live claims refused.
 */
export function evaluateDailyOwnerReview(
  input: DailyOwnerReviewInput,
): DailyOwnerReviewDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_BRIEF_EVIDENCE"
      | "AWAITING_LEDGER"
      | "AWAITING_DECISIONS"
      | "AWAITING_COST_VIEW"
      | "AWAITING_BOUNDED_MISSION"
      | "AWAITING_OPERATING_KNOWLEDGE",
    recoveryPath:
      | "COMPLETE_MORNING_BRIEF"
      | "LINK_COMPLETED_WORK_RECEIPTS"
      | "RECORD_EXCEPTION_DECISIONS"
      | "SEPARATE_ACTUAL_ESTIMATE_PENDING_SYNTHETIC"
      | "CHOOSE_BOUNDED_MISSION_IN_SCOPE"
      | "SAVE_VERSIONED_PLAYBOOK_WITHOUT_AUTHORITY_EXPAND",
  ): NonNullable<
    Extract<DailyOwnerReviewDecision, { allowed: false }>["evidence"]
  > => ({
    briefId: input.briefId.trim() || null,
    evidenceBackedSummary: input.evidenceBackedSummary.trim() || null,
    completedWorkCount: input.completedWorkLedger.length,
    decisionRecordCount: input.decisionRecords.length,
    actualSpendMinor: input.outcomeCostView.actualSpendMinor,
    estimateSpendMinor: input.outcomeCostView.estimateSpendMinor,
    pendingAttributionMinor: input.outcomeCostView.pendingAttributionMinor,
    syntheticExcludedMinor: input.outcomeCostView.syntheticExcludedMinor,
    syntheticExcluded: input.outcomeCostView.syntheticExcluded,
    missionId: input.newBoundedMission.missionId.trim() || null,
    approvedScopeId: input.newBoundedMission.approvedScopeId.trim() || null,
    playbookUpdateId:
      input.reviewedOperatingKnowledge.playbookUpdateId.trim() || null,
    knowledgeVersionId:
      input.reviewedOperatingKnowledge.knowledgeVersionId.trim() || null,
    learningSummary:
      input.reviewedOperatingKnowledge.learningSummary.trim() || null,
    authorityExpanded:
      input.reviewedOperatingKnowledge.expandsAuthoritySilently,
    reviewVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live daily owner review provider wiring remains NOT_WIRED — refuse live wiring (T-US-049)",
      ],
    };
  }

  if (input.claimLiveVerifiedReview) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_REVIEW_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified daily owner review claim offline (T-US-049) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptProductionWrite) {
    return {
      allowed: false,
      code: "PRODUCTION_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_WRITE_FROM_OWNER_REVIEW_REFUSED",
        "BLOCKED",
        "COMPLETE_MORNING_BRIEF",
      ),
      reasons: [
        "Daily owner review must not perform production writes offline (T-US-049)",
      ],
    };
  }

  if (!input.briefId.trim() || !input.evidenceBackedSummary.trim()) {
    return {
      allowed: false,
      code: "BRIEF_EVIDENCE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MORNING_BRIEF_EVIDENCE_MISSING",
        "AWAITING_BRIEF_EVIDENCE",
        "COMPLETE_MORNING_BRIEF",
      ),
      reasons: [
        "Morning brief requires evidence-backed summary (T-US-049)",
      ],
    };
  }

  const noMaterialFindings =
    input.completedWorkLedger.length === 0 &&
    input.decisionRecords.length === 0;

  if (input.manufactureUrgencyWithNoFindings && noMaterialFindings) {
    return {
      allowed: false,
      code: "MANUFACTURED_URGENCY_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "MANUFACTURED_URGENCY_WITH_EMPTY_FINDINGS",
        "BLOCKED",
        "COMPLETE_MORNING_BRIEF",
      ),
      reasons: [
        "No material findings must present a calm empty state — refuse manufactured urgency (T-US-049)",
      ],
    };
  }

  for (const entry of input.completedWorkLedger) {
    if (
      !entry.workItemId.trim() ||
      !entry.revisionId.trim() ||
      !entry.receiptOrObservationId.trim() ||
      !entry.summary.trim()
    ) {
      return {
        allowed: false,
        code: "COMPLETED_WORK_LEDGER_INCOMPLETE",
        ...base,
        evidence: blockedEvidence(
          "LEDGER_ENTRY_MISSING_LINK",
          "AWAITING_LEDGER",
          "LINK_COMPLETED_WORK_RECEIPTS",
        ),
        reasons: [
          "Completed-work ledger entries must link revision + receipt/observation (T-US-049)",
        ],
      };
    }
  }

  for (const rec of input.decisionRecords) {
    if (
      !rec.exceptionId.trim() ||
      !rec.reason.trim() ||
      !rec.decidedByRoleId.trim()
    ) {
      return {
        allowed: false,
        code: "DECISION_RECORDS_INCOMPLETE",
        ...base,
        evidence: blockedEvidence(
          "EXCEPTION_DECISION_INCOMPLETE",
          "AWAITING_DECISIONS",
          "RECORD_EXCEPTION_DECISIONS",
        ),
        reasons: [
          "Exception decision records require id, reason, and deciding role (T-US-049)",
        ],
      };
    }
  }

  const cost = input.outcomeCostView;
  if (
    !isFiniteNonNeg(cost.actualSpendMinor) ||
    !isFiniteNonNeg(cost.estimateSpendMinor) ||
    !isFiniteNonNeg(cost.pendingAttributionMinor) ||
    !isFiniteNonNeg(cost.syntheticExcludedMinor) ||
    !cost.syntheticExcluded
  ) {
    return {
      allowed: false,
      code: "OUTCOME_COST_VIEW_INVALID",
      ...base,
      evidence: blockedEvidence(
        "COST_VIEW_MUST_SEPARATE_AND_EXCLUDE_SYNTHETIC",
        "AWAITING_COST_VIEW",
        "SEPARATE_ACTUAL_ESTIMATE_PENDING_SYNTHETIC",
      ),
      reasons: [
        "Outcome/cost view must separate actual, estimate, pending attribution and exclude synthetic (T-US-049)",
      ],
    };
  }

  if (
    input.celebrateLiftOnPendingData &&
    cost.pendingAttributionMinor > 0
  ) {
    return {
      allowed: false,
      code: "PENDING_DATA_LIFT_CELEBRATION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PENDING_ATTRIBUTION_NOT_CONFIRMED_LIFT",
        "BLOCKED",
        "SEPARATE_ACTUAL_ESTIMATE_PENDING_SYNTHETIC",
      ),
      reasons: [
        "Pending attribution must schedule observation — refuse celebrating lift (T-US-049)",
      ],
    };
  }

  const mission = input.newBoundedMission;
  if (
    !mission.missionId.trim() ||
    !mission.objective.trim() ||
    !mission.approvedScopeId.trim()
  ) {
    return {
      allowed: false,
      code: "BOUNDED_MISSION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BOUNDED_MISSION_INCOMPLETE",
        "AWAITING_BOUNDED_MISSION",
        "CHOOSE_BOUNDED_MISSION_IN_SCOPE",
      ),
      reasons: [
        "Daily owner review requires a new bounded mission with approved scope (T-US-049)",
      ],
    };
  }

  if (!mission.withinApprovedScope) {
    return {
      allowed: false,
      code: "MISSION_OUTSIDE_APPROVED_SCOPE",
      ...base,
      evidence: blockedEvidence(
        "MISSION_EXCEEDS_APPROVED_SCOPE",
        "AWAITING_BOUNDED_MISSION",
        "CHOOSE_BOUNDED_MISSION_IN_SCOPE",
      ),
      reasons: [
        "New commercial objective must reuse approved scopes — refuse out-of-scope mission (T-US-049)",
      ],
    };
  }

  const knowledge = input.reviewedOperatingKnowledge;
  if (
    !knowledge.playbookUpdateId.trim() ||
    !knowledge.knowledgeVersionId.trim() ||
    !knowledge.learningSummary.trim()
  ) {
    return {
      allowed: false,
      code: "OPERATING_KNOWLEDGE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "VERSIONED_PLAYBOOK_UPDATE_MISSING",
        "AWAITING_OPERATING_KNOWLEDGE",
        "SAVE_VERSIONED_PLAYBOOK_WITHOUT_AUTHORITY_EXPAND",
      ),
      reasons: [
        "Reviewed operating knowledge requires versioned playbook update + learning (T-US-049)",
      ],
    };
  }

  if (knowledge.expandsAuthoritySilently) {
    return {
      allowed: false,
      code: "SILENT_AUTHORITY_EXPANSION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PLAYBOOK_MUST_NOT_SILENTLY_EXPAND_AUTHORITY",
        "BLOCKED",
        "SAVE_VERSIONED_PLAYBOOK_WITHOUT_AUTHORITY_EXPAND",
      ),
      reasons: [
        "Playbook learning must never silently expand standing authority (T-US-049)",
      ],
    };
  }

  return {
    allowed: true,
    code: "DAILY_OWNER_REVIEW_KNOWLEDGE_RECORDED",
    ...base,
    evidence: {
      briefId: input.briefId.trim(),
      evidenceBackedSummary: input.evidenceBackedSummary.trim(),
      completedWorkCount: input.completedWorkLedger.length,
      decisionRecordCount: input.decisionRecords.length,
      actualSpendMinor: cost.actualSpendMinor,
      estimateSpendMinor: cost.estimateSpendMinor,
      pendingAttributionMinor: cost.pendingAttributionMinor,
      syntheticExcludedMinor: cost.syntheticExcludedMinor,
      syntheticExcluded: true,
      missionId: mission.missionId.trim(),
      approvedScopeId: mission.approvedScopeId.trim(),
      playbookUpdateId: knowledge.playbookUpdateId.trim(),
      knowledgeVersionId: knowledge.knowledgeVersionId.trim(),
      learningSummary: knowledge.learningSummary.trim(),
      authorityExpanded: false,
      reviewVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "OWNER_REVIEW_COMPLETE",
      currentState: "REVIEWED_OPERATING_KNOWLEDGE_RECORDED",
      recoveryPath: "TRACK_BOUNDED_MISSION_AND_PLAYBOOK",
      preservedInputCount: preserved,
    },
    reasons: [
      "Daily owner review recorded reviewed operating knowledge with bounded mission (T-US-049); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
