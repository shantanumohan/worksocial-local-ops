/**
 * T-F25 — Operate the daily owner review (complete F25 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F25 evidence
 * package — morning brief with evidence-backed summary, overnight change
 * inspection, completed-work ledger linked to revision/receipt, exception
 * decision records, qualified demand + outcome/cost view (synthetic
 * excluded), new bounded commercial mission within approved scope, and
 * versioned reviewed operating knowledge that never silently expands
 * authority. Incomplete packages, manufactured urgency, pending-data lift
 * celebration, silent authority expansion, false live-verified claims, and
 * live provider wiring are refused. Live provider wiring stays NOT_WIRED.
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 *
 * Distinct from T-US-049 (`DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE`) — this
 * records the complete F25 flow evidence package (structured package +
 * Given overnight accumulation + overnight inspection + qualified demand),
 * not the operating-knowledge happy-path summary alone. Distinct from
 * T-US-050 (root-cause brief), T-US-025 (launch workstream), and T-US-035
 * (review/revise/release).
 */

import type {
  BoundedMissionDraft,
  CompletedWorkLedgerEntry,
  OutcomeCostView,
  OwnerDecisionRecord,
  ReviewedOperatingKnowledge,
} from "./daily-owner-review.js";

export type MorningBriefEvidence = {
  briefId: string;
  /** Evidence-backed morning summary (lost leads / unanswered / material decisions). */
  evidenceBackedSummary: string;
  /** Brief opened by owner for the daily review. */
  opened: boolean;
};

export type OvernightChangeInspection = {
  inspectionId: string;
  /** Change IDs observed overnight (work / exceptions / signals). */
  changedItemIds: readonly string[];
  /** Owner inspected overnight changes before deciding. */
  inspected: boolean;
};

export type QualifiedDemandView = {
  demandViewId: string;
  /** Qualified demand count (tours/leads) for the period. */
  qualifiedDemandCount: number;
  /** Demand period label (e.g. overnight / trailing-24h). */
  periodLabel: string;
};

export type OperateDailyOwnerReviewInput = {
  packageId: string;
  morningBrief: MorningBriefEvidence | null;
  overnightInspection: OvernightChangeInspection | null;
  completedWorkLedger: readonly CompletedWorkLedgerEntry[] | null;
  decisionRecords: readonly OwnerDecisionRecord[] | null;
  qualifiedDemand: QualifiedDemandView | null;
  outcomeCostView: OutcomeCostView | null;
  newBoundedMission: BoundedMissionDraft | null;
  reviewedOperatingKnowledge: ReviewedOperatingKnowledge | null;
  /**
   * No material overnight findings — calm empty state is allowed when ledger
   * and decisions are empty; manufacturing urgency is refused.
   */
  manufactureUrgencyWithNoFindings: boolean;
  /**
   * Celebrate performance lift while attribution is still pending — refused.
   */
  celebrateLiftOnPendingData: boolean;
  /** Claim the F25 path is live-verified — must refuse offline. */
  claimLiveVerifiedReview: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /** Attempt a production write from the owner review surface — refuse. */
  attemptProductionWrite: boolean;
};

export type OperateDailyOwnerReviewDecision =
  | {
      allowed: true;
      code: "OPERATE_DAILY_OWNER_REVIEW_EVIDENCE_RECORDED";
      dailyOwnerReviewRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        briefId: string;
        evidenceBackedSummary: string;
        briefOpened: true;
        inspectionId: string;
        changedItemIds: string[];
        overnightInspected: true;
        completedWorkCount: number;
        completedWorkItemIds: string[];
        decisionRecordCount: number;
        exceptionIds: string[];
        demandViewId: string;
        qualifiedDemandCount: number;
        demandPeriodLabel: string;
        actualSpendMinor: number;
        estimateSpendMinor: number;
        pendingAttributionMinor: number;
        syntheticExcludedMinor: number;
        syntheticExcluded: true;
        missionId: string;
        missionObjective: string;
        approvedScopeId: string;
        playbookUpdateId: string;
        knowledgeVersionId: string;
        learningSummary: string;
        authorityExpanded: false;
        reviewVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F25_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "DAILY_OWNER_REVIEW_COMPLETE";
        recoveryPath: "KEEP_FIXTURE_OWNER_REVIEW_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "MORNING_BRIEF_REQUIRED"
        | "OVERNIGHT_INSPECTION_REQUIRED"
        | "COMPLETED_WORK_LEDGER_REQUIRED"
        | "DECISION_RECORDS_REQUIRED"
        | "QUALIFIED_DEMAND_REQUIRED"
        | "OUTCOME_COST_VIEW_REQUIRED"
        | "BOUNDED_MISSION_REQUIRED"
        | "OPERATING_KNOWLEDGE_REQUIRED"
        | "MANUFACTURED_URGENCY_REFUSED"
        | "PENDING_DATA_LIFT_CELEBRATION_REFUSED"
        | "SILENT_AUTHORITY_EXPANSION_REFUSED"
        | "MISSION_OUTSIDE_APPROVED_SCOPE"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_REVIEW_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      dailyOwnerReviewRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        briefId: string | null;
        evidenceBackedSummary: string | null;
        briefOpened: boolean;
        inspectionId: string | null;
        changedItemIds: string[];
        overnightInspected: boolean;
        completedWorkCount: number;
        completedWorkItemIds: string[];
        decisionRecordCount: number;
        exceptionIds: string[];
        demandViewId: string | null;
        qualifiedDemandCount: number;
        demandPeriodLabel: string | null;
        actualSpendMinor: number;
        estimateSpendMinor: number;
        pendingAttributionMinor: number;
        syntheticExcludedMinor: number;
        syntheticExcluded: boolean;
        missionId: string | null;
        missionObjective: string | null;
        approvedScopeId: string | null;
        playbookUpdateId: string | null;
        knowledgeVersionId: string | null;
        learningSummary: string | null;
        authorityExpanded: boolean;
        reviewVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_MORNING_BRIEF"
          | "AWAITING_OVERNIGHT_INSPECTION"
          | "AWAITING_COMPLETED_WORK_LEDGER"
          | "AWAITING_DECISION_RECORDS"
          | "AWAITING_QUALIFIED_DEMAND"
          | "AWAITING_OUTCOME_COST_VIEW"
          | "AWAITING_BOUNDED_MISSION"
          | "AWAITING_OPERATING_KNOWLEDGE";
        recoveryPath:
          | "OPEN_MORNING_BRIEF"
          | "INSPECT_OVERNIGHT_CHANGES"
          | "RECORD_COMPLETED_WORK_LEDGER"
          | "RESOLVE_EXCEPTIONS_NEEDING_AUTHORITY"
          | "REVIEW_QUALIFIED_DEMAND_AND_COSTS"
          | "CHOOSE_BOUNDED_COMMERCIAL_OBJECTIVE"
          | "SAVE_REVIEWED_OPERATING_KNOWLEDGE"
          | "KEEP_FIXTURE_OWNER_REVIEW_NO_LIVE_PROVIDER"
          | "REFUSE_MANUFACTURED_URGENCY"
          | "REFUSE_PENDING_DATA_LIFT"
          | "REFUSE_SILENT_AUTHORITY_EXPANSION"
          | "KEEP_MISSION_WITHIN_APPROVED_SCOPE"
          | "REFUSE_PRODUCTION_WRITE";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const OPERATE_DAILY_OWNER_REVIEW_RELATED_CASE_IDS = [
  "T-F25",
] as const;

function preservedInputCount(input: OperateDailyOwnerReviewInput): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.morningBrief?.briefId.trim() ? 1 : 0) +
    (input.overnightInspection?.inspectionId.trim() ? 1 : 0) +
    (input.completedWorkLedger && input.completedWorkLedger.length >= 0
      ? 1
      : 0) +
    (input.decisionRecords && input.decisionRecords.length >= 0 ? 1 : 0) +
    (input.qualifiedDemand?.demandViewId.trim() ? 1 : 0) +
    (input.outcomeCostView ? 1 : 0) +
    (input.newBoundedMission?.missionId.trim() ? 1 : 0) +
    (input.reviewedOperatingKnowledge?.playbookUpdateId.trim() ? 1 : 0)
  );
}

function briefOk(
  brief: MorningBriefEvidence | null,
): brief is MorningBriefEvidence {
  if (!brief) return false;
  return (
    brief.briefId.trim().length > 0 &&
    brief.evidenceBackedSummary.trim().length > 0 &&
    brief.opened === true
  );
}

function inspectionOk(
  inspection: OvernightChangeInspection | null,
): inspection is OvernightChangeInspection {
  if (!inspection) return false;
  return (
    inspection.inspectionId.trim().length > 0 &&
    inspection.inspected === true &&
    inspection.changedItemIds.every((id) => id.trim().length > 0)
  );
}

function ledgerOk(
  ledger: readonly CompletedWorkLedgerEntry[] | null,
): ledger is readonly CompletedWorkLedgerEntry[] {
  if (!ledger) return false;
  return ledger.every(
    (e) =>
      e.workItemId.trim().length > 0 &&
      e.revisionId.trim().length > 0 &&
      e.receiptOrObservationId.trim().length > 0 &&
      e.summary.trim().length > 0,
  );
}

function decisionsOk(
  decisions: readonly OwnerDecisionRecord[] | null,
): decisions is readonly OwnerDecisionRecord[] {
  if (!decisions) return false;
  return decisions.every(
    (d) =>
      d.exceptionId.trim().length > 0 &&
      d.reason.trim().length > 0 &&
      d.decidedByRoleId.trim().length > 0 &&
      (d.decision === "APPROVE" ||
        d.decision === "REVISE" ||
        d.decision === "REJECT" ||
        d.decision === "ASSIGN" ||
        d.decision === "HOLD"),
  );
}

function demandOk(
  demand: QualifiedDemandView | null,
): demand is QualifiedDemandView {
  if (!demand) return false;
  return (
    demand.demandViewId.trim().length > 0 &&
    demand.periodLabel.trim().length > 0 &&
    Number.isFinite(demand.qualifiedDemandCount) &&
    demand.qualifiedDemandCount >= 0
  );
}

function costOk(
  cost: OutcomeCostView | null,
): cost is OutcomeCostView {
  if (!cost) return false;
  return (
    Number.isFinite(cost.actualSpendMinor) &&
    Number.isFinite(cost.estimateSpendMinor) &&
    Number.isFinite(cost.pendingAttributionMinor) &&
    Number.isFinite(cost.syntheticExcludedMinor) &&
    cost.actualSpendMinor >= 0 &&
    cost.estimateSpendMinor >= 0 &&
    cost.pendingAttributionMinor >= 0 &&
    cost.syntheticExcludedMinor >= 0 &&
    cost.syntheticExcluded === true
  );
}

function missionOk(
  mission: BoundedMissionDraft | null,
): mission is BoundedMissionDraft {
  if (!mission) return false;
  return (
    mission.missionId.trim().length > 0 &&
    mission.objective.trim().length > 0 &&
    mission.approvedScopeId.trim().length > 0 &&
    mission.withinApprovedScope === true
  );
}

function knowledgeOk(
  knowledge: ReviewedOperatingKnowledge | null,
): knowledge is ReviewedOperatingKnowledge {
  if (!knowledge) return false;
  return (
    knowledge.playbookUpdateId.trim().length > 0 &&
    knowledge.knowledgeVersionId.trim().length > 0 &&
    knowledge.learningSummary.trim().length > 0 &&
    knowledge.expandsAuthoritySilently === false
  );
}

/**
 * Evaluate the T-F25 operate-daily-owner-review path offline.
 * Complete F25 evidence package → OPERATE_DAILY_OWNER_REVIEW_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateOperateDailyOwnerReview(
  input: OperateDailyOwnerReviewInput,
): OperateDailyOwnerReviewDecision {
  const base = {
    dailyOwnerReviewRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const brief = input.morningBrief;
  const inspection = input.overnightInspection;
  const ledger = input.completedWorkLedger;
  const decisions = input.decisionRecords;
  const demand = input.qualifiedDemand;
  const cost = input.outcomeCostView;
  const mission = input.newBoundedMission;
  const knowledge = input.reviewedOperatingKnowledge;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_MORNING_BRIEF"
      | "AWAITING_OVERNIGHT_INSPECTION"
      | "AWAITING_COMPLETED_WORK_LEDGER"
      | "AWAITING_DECISION_RECORDS"
      | "AWAITING_QUALIFIED_DEMAND"
      | "AWAITING_OUTCOME_COST_VIEW"
      | "AWAITING_BOUNDED_MISSION"
      | "AWAITING_OPERATING_KNOWLEDGE",
    recoveryPath:
      | "OPEN_MORNING_BRIEF"
      | "INSPECT_OVERNIGHT_CHANGES"
      | "RECORD_COMPLETED_WORK_LEDGER"
      | "RESOLVE_EXCEPTIONS_NEEDING_AUTHORITY"
      | "REVIEW_QUALIFIED_DEMAND_AND_COSTS"
      | "CHOOSE_BOUNDED_COMMERCIAL_OBJECTIVE"
      | "SAVE_REVIEWED_OPERATING_KNOWLEDGE"
      | "KEEP_FIXTURE_OWNER_REVIEW_NO_LIVE_PROVIDER"
      | "REFUSE_MANUFACTURED_URGENCY"
      | "REFUSE_PENDING_DATA_LIFT"
      | "REFUSE_SILENT_AUTHORITY_EXPANSION"
      | "KEEP_MISSION_WITHIN_APPROVED_SCOPE"
      | "REFUSE_PRODUCTION_WRITE",
  ): NonNullable<
    Extract<OperateDailyOwnerReviewDecision, { allowed: false }>["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    briefId: brief?.briefId.trim() || null,
    evidenceBackedSummary: brief?.evidenceBackedSummary.trim() || null,
    briefOpened: brief?.opened === true,
    inspectionId: inspection?.inspectionId.trim() || null,
    changedItemIds: inspection?.changedItemIds.map((id) => id.trim()) ?? [],
    overnightInspected: inspection?.inspected === true,
    completedWorkCount: ledger?.length ?? 0,
    completedWorkItemIds: ledger?.map((e) => e.workItemId.trim()) ?? [],
    decisionRecordCount: decisions?.length ?? 0,
    exceptionIds: decisions?.map((d) => d.exceptionId.trim()) ?? [],
    demandViewId: demand?.demandViewId.trim() || null,
    qualifiedDemandCount: demand?.qualifiedDemandCount ?? 0,
    demandPeriodLabel: demand?.periodLabel.trim() || null,
    actualSpendMinor: cost?.actualSpendMinor ?? 0,
    estimateSpendMinor: cost?.estimateSpendMinor ?? 0,
    pendingAttributionMinor: cost?.pendingAttributionMinor ?? 0,
    syntheticExcludedMinor: cost?.syntheticExcludedMinor ?? 0,
    syntheticExcluded: cost?.syntheticExcluded === true,
    missionId: mission?.missionId.trim() || null,
    missionObjective: mission?.objective.trim() || null,
    approvedScopeId: mission?.approvedScopeId.trim() || null,
    playbookUpdateId: knowledge?.playbookUpdateId.trim() || null,
    knowledgeVersionId: knowledge?.knowledgeVersionId.trim() || null,
    learningSummary: knowledge?.learningSummary.trim() || null,
    authorityExpanded: knowledge?.expandsAuthoritySilently === true,
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
        "Live daily owner review provider apply remains NOT_WIRED — refuse live wiring (T-F25)",
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
        "Refused false live-verified daily owner review claim offline (T-F25) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptProductionWrite) {
    return {
      allowed: false,
      code: "PRODUCTION_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_WRITE_REFUSED",
        "BLOCKED",
        "REFUSE_PRODUCTION_WRITE",
      ),
      reasons: [
        "Production write from daily owner review surface refused offline (T-F25)",
      ],
    };
  }

  if (!input.packageId.trim() || !briefOk(brief)) {
    return {
      allowed: false,
      code: "MORNING_BRIEF_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MORNING_BRIEF_INCOMPLETE",
        "AWAITING_MORNING_BRIEF",
        "OPEN_MORNING_BRIEF",
      ),
      reasons: [
        "F25 requires package id and opened morning brief with evidence-backed summary (T-F25)",
      ],
    };
  }

  if (!inspectionOk(inspection)) {
    return {
      allowed: false,
      code: "OVERNIGHT_INSPECTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OVERNIGHT_INSPECTION_INCOMPLETE",
        "AWAITING_OVERNIGHT_INSPECTION",
        "INSPECT_OVERNIGHT_CHANGES",
      ),
      reasons: [
        "F25 requires overnight change inspection with inspectionId and inspected=true (T-F25)",
      ],
    };
  }

  if (!ledgerOk(ledger)) {
    return {
      allowed: false,
      code: "COMPLETED_WORK_LEDGER_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "COMPLETED_WORK_LEDGER_INCOMPLETE",
        "AWAITING_COMPLETED_WORK_LEDGER",
        "RECORD_COMPLETED_WORK_LEDGER",
      ),
      reasons: [
        "F25 requires completed-work ledger (possibly empty) with revision/receipt links when present (T-F25)",
      ],
    };
  }

  if (!decisionsOk(decisions)) {
    return {
      allowed: false,
      code: "DECISION_RECORDS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DECISION_RECORDS_INCOMPLETE",
        "AWAITING_DECISION_RECORDS",
        "RESOLVE_EXCEPTIONS_NEEDING_AUTHORITY",
      ),
      reasons: [
        "F25 requires decision records array (possibly empty) for exceptions needing authority (T-F25)",
      ],
    };
  }

  const noMaterialFindings = ledger.length === 0 && decisions.length === 0;
  if (input.manufactureUrgencyWithNoFindings && noMaterialFindings) {
    return {
      allowed: false,
      code: "MANUFACTURED_URGENCY_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "MANUFACTURED_URGENCY_REFUSED",
        "BLOCKED",
        "REFUSE_MANUFACTURED_URGENCY",
      ),
      reasons: [
        "Manufactured urgency with no material overnight findings refused (T-F25)",
      ],
    };
  }

  if (!demandOk(demand)) {
    return {
      allowed: false,
      code: "QUALIFIED_DEMAND_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "QUALIFIED_DEMAND_INCOMPLETE",
        "AWAITING_QUALIFIED_DEMAND",
        "REVIEW_QUALIFIED_DEMAND_AND_COSTS",
      ),
      reasons: [
        "F25 requires qualified demand view with demandViewId, periodLabel, and non-negative count (T-F25)",
      ],
    };
  }

  if (!costOk(cost)) {
    return {
      allowed: false,
      code: "OUTCOME_COST_VIEW_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OUTCOME_COST_VIEW_INCOMPLETE",
        "AWAITING_OUTCOME_COST_VIEW",
        "REVIEW_QUALIFIED_DEMAND_AND_COSTS",
      ),
      reasons: [
        "F25 requires outcome/cost view with syntheticExcluded=true and finite non-negative amounts (T-F25)",
      ],
    };
  }

  if (input.celebrateLiftOnPendingData && cost.pendingAttributionMinor > 0) {
    return {
      allowed: false,
      code: "PENDING_DATA_LIFT_CELEBRATION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PENDING_DATA_LIFT_CELEBRATION_REFUSED",
        "BLOCKED",
        "REFUSE_PENDING_DATA_LIFT",
      ),
      reasons: [
        "Celebrating performance lift while attribution is pending refused (T-F25)",
      ],
    };
  }

  if (!mission) {
    return {
      allowed: false,
      code: "BOUNDED_MISSION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BOUNDED_MISSION_INCOMPLETE",
        "AWAITING_BOUNDED_MISSION",
        "CHOOSE_BOUNDED_COMMERCIAL_OBJECTIVE",
      ),
      reasons: [
        "F25 requires a new bounded commercial mission draft (T-F25)",
      ],
    };
  }

  if (mission.withinApprovedScope === false) {
    return {
      allowed: false,
      code: "MISSION_OUTSIDE_APPROVED_SCOPE",
      ...base,
      evidence: blockedEvidence(
        "MISSION_OUTSIDE_APPROVED_SCOPE",
        "BLOCKED",
        "KEEP_MISSION_WITHIN_APPROVED_SCOPE",
      ),
      reasons: [
        "Mission outside previously approved scope refused (T-F25)",
      ],
    };
  }

  if (!missionOk(mission)) {
    return {
      allowed: false,
      code: "BOUNDED_MISSION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BOUNDED_MISSION_INCOMPLETE",
        "AWAITING_BOUNDED_MISSION",
        "CHOOSE_BOUNDED_COMMERCIAL_OBJECTIVE",
      ),
      reasons: [
        "F25 requires missionId, objective, approvedScopeId, and withinApprovedScope=true (T-F25)",
      ],
    };
  }

  if (!knowledge) {
    return {
      allowed: false,
      code: "OPERATING_KNOWLEDGE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OPERATING_KNOWLEDGE_INCOMPLETE",
        "AWAITING_OPERATING_KNOWLEDGE",
        "SAVE_REVIEWED_OPERATING_KNOWLEDGE",
      ),
      reasons: [
        "F25 requires reviewed operating knowledge with versioned playbook learning (T-F25)",
      ],
    };
  }

  if (knowledge.expandsAuthoritySilently === true) {
    return {
      allowed: false,
      code: "SILENT_AUTHORITY_EXPANSION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "SILENT_AUTHORITY_EXPANSION_REFUSED",
        "BLOCKED",
        "REFUSE_SILENT_AUTHORITY_EXPANSION",
      ),
      reasons: [
        "Silent standing-authority expansion via operating knowledge refused (T-F25)",
      ],
    };
  }

  if (!knowledgeOk(knowledge)) {
    return {
      allowed: false,
      code: "OPERATING_KNOWLEDGE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OPERATING_KNOWLEDGE_INCOMPLETE",
        "AWAITING_OPERATING_KNOWLEDGE",
        "SAVE_REVIEWED_OPERATING_KNOWLEDGE",
      ),
      reasons: [
        "F25 requires playbookUpdateId, knowledgeVersionId, learningSummary, expandsAuthoritySilently=false (T-F25)",
      ],
    };
  }

  return {
    allowed: true,
    code: "OPERATE_DAILY_OWNER_REVIEW_EVIDENCE_RECORDED",
    dailyOwnerReviewRecorded: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    productionWrites: false,
    evidence: {
      packageId: input.packageId.trim(),
      briefId: brief.briefId.trim(),
      evidenceBackedSummary: brief.evidenceBackedSummary.trim(),
      briefOpened: true,
      inspectionId: inspection.inspectionId.trim(),
      changedItemIds: inspection.changedItemIds.map((id) => id.trim()),
      overnightInspected: true,
      completedWorkCount: ledger.length,
      completedWorkItemIds: ledger.map((e) => e.workItemId.trim()),
      decisionRecordCount: decisions.length,
      exceptionIds: decisions.map((d) => d.exceptionId.trim()),
      demandViewId: demand.demandViewId.trim(),
      qualifiedDemandCount: demand.qualifiedDemandCount,
      demandPeriodLabel: demand.periodLabel.trim(),
      actualSpendMinor: cost.actualSpendMinor,
      estimateSpendMinor: cost.estimateSpendMinor,
      pendingAttributionMinor: cost.pendingAttributionMinor,
      syntheticExcludedMinor: cost.syntheticExcludedMinor,
      syntheticExcluded: true,
      missionId: mission.missionId.trim(),
      missionObjective: mission.objective.trim(),
      approvedScopeId: mission.approvedScopeId.trim(),
      playbookUpdateId: knowledge.playbookUpdateId.trim(),
      knowledgeVersionId: knowledge.knowledgeVersionId.trim(),
      learningSummary: knowledge.learningSummary.trim(),
      authorityExpanded: false,
      reviewVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F25_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "DAILY_OWNER_REVIEW_COMPLETE",
      recoveryPath: "KEEP_FIXTURE_OWNER_REVIEW_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F25 daily owner review evidence package recorded offline; reviewVerifiedLive=false; live NOT_WIRED; externalEffects=NONE",
    ],
  };
}