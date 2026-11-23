/**
 * T-F14 — Turn demand into a page improvement (complete F14 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F14 evidence
 * package — observation IDs, intent-to-page match, visibility mission with
 * task plan + content brief, proposed answer/metadata/internal-links review,
 * exact revision diff, independent QA (quality + customer journey), policy
 * release receipt + experiment window, and a measurable observation of the
 * source-backed change (or a clear block). Incomplete packages, keyword
 * proliferation, false live-verified claims, and live provider wiring are
 * refused. Live provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-027 (`DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT`) — this
 * records the complete F14 flow evidence package (structured package +
 * proposed-answer review + measurable observation + blocking/recovery state),
 * not the release-receipt/experiment-window summary alone. Distinct from
 * T-US-028 (keyword proliferation / one useful update) and T-US-035
 * (review/revise/release receipt-or-blocked).
 */

import type {
  DemandPageObservation,
  ExperimentWindow,
  IndependentQaBundle,
  IntentPageMatch,
  RevisionDiff,
  VisibilityMissionPlan,
} from "./demand-page-improvement.js";

export type ProposedAnswerReview = {
  proposedAnswerId: string;
  /** Reviewed proposed answer text (source-backed). */
  answerSummary: string;
  /** Metadata reviewed (title/description/etc.). */
  metadataReviewed: boolean;
  /** Internal links reviewed for relevance. */
  internalLinksReviewed: boolean;
  linkTargetCount: number;
};

export type MeasurableChangeObservation = {
  observationId: string;
  /** Fixture-measurable signal after release (not live provider). */
  measurable: boolean;
  measurementNote: string;
};

export type TurnDemandIntoPageImprovementInput = {
  packageId: string;
  observations: readonly DemandPageObservation[] | null;
  intentMatch: IntentPageMatch | null;
  mission: VisibilityMissionPlan | null;
  proposedAnswer: ProposedAnswerReview | null;
  revision: RevisionDiff | null;
  qa: IndependentQaBundle | null;
  /** Owner/policy reviewed before release. */
  policyReviewed: boolean;
  releaseReceiptId: string | null;
  experimentWindow: ExperimentWindow | null;
  measurableChange: MeasurableChangeObservation | null;
  /** Claim the F14 path is live-verified — must refuse offline. */
  claimLiveVerifiedRelease: boolean;
  /** Request live CMS/provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * Attempt to spawn many keyword-targeted thin pages instead of one useful
   * update — must refuse (T-US-028 territory).
   */
  requestKeywordProliferation: boolean;
};

export type TurnDemandIntoPageImprovementDecision =
  | {
      allowed: true;
      code: "TURN_DEMAND_INTO_PAGE_IMPROVEMENT_EVIDENCE_RECORDED";
      sourceBackedChangeRecorded: true;
      measurableOrBlockedClear: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        observationIds: string[];
        intentId: string;
        pageId: string;
        pagePath: string;
        matchConfidence: IntentPageMatch["matchConfidence"];
        missionId: string;
        taskPlanId: string;
        contentBriefId: string;
        proposedAnswerId: string;
        metadataReviewed: true;
        internalLinksReviewed: true;
        linkTargetCount: number;
        revisionId: string;
        exactDiff: string;
        changedPathCount: number;
        qaBundleId: string;
        qualityPassed: true;
        customerJourneyPassed: true;
        releaseReceiptId: string;
        experimentId: string;
        experimentStartsAtIso: string;
        experimentEndsAtIso: string;
        measurableChangeObservationId: string;
        changeMeasurable: true;
        measurementNote: string;
        releaseVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F14_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "DEMAND_PAGE_IMPROVEMENT_RELEASED_MEASURABLE";
        recoveryPath: "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "OBSERVATIONS_REQUIRED"
        | "INTENT_PAGE_MATCH_REQUIRED"
        | "MISSION_PLAN_REQUIRED"
        | "PROPOSED_ANSWER_REVIEW_REQUIRED"
        | "REVISION_DIFF_REQUIRED"
        | "QA_BUNDLE_REQUIRED"
        | "POLICY_RELEASE_REQUIRED"
        | "EXPERIMENT_WINDOW_REQUIRED"
        | "MEASURABLE_CHANGE_REQUIRED"
        | "KEYWORD_PROLIFERATION_REFUSED"
        | "FALSE_LIVE_VERIFIED_RELEASE_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      sourceBackedChangeRecorded: false;
      measurableOrBlockedClear: boolean;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        observationIds: string[];
        intentId: string | null;
        pageId: string | null;
        pagePath: string | null;
        matchConfidence: IntentPageMatch["matchConfidence"] | null;
        missionId: string | null;
        taskPlanId: string | null;
        contentBriefId: string | null;
        proposedAnswerId: string | null;
        metadataReviewed: boolean;
        internalLinksReviewed: boolean;
        linkTargetCount: number;
        revisionId: string | null;
        exactDiff: string | null;
        changedPathCount: number;
        qaBundleId: string | null;
        qualityPassed: boolean;
        customerJourneyPassed: boolean;
        releaseReceiptId: string | null;
        experimentId: string | null;
        experimentStartsAtIso: string | null;
        experimentEndsAtIso: string | null;
        measurableChangeObservationId: string | null;
        changeMeasurable: boolean;
        measurementNote: string | null;
        releaseVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_OBSERVATIONS"
          | "AWAITING_INTENT_PAGE_MATCH"
          | "AWAITING_MISSION_PLAN"
          | "AWAITING_PROPOSED_ANSWER_REVIEW"
          | "AWAITING_REVISION_DIFF"
          | "AWAITING_QA_BUNDLE"
          | "AWAITING_POLICY_RELEASE"
          | "AWAITING_EXPERIMENT_WINDOW"
          | "AWAITING_MEASURABLE_CHANGE";
        recoveryPath:
          | "OPEN_TREND_OR_RECURRING_QUESTION"
          | "CONFIRM_TARGET_INTENT_AND_PAGE"
          | "CREATE_VISIBILITY_MISSION_WITH_BRIEF"
          | "REVIEW_ANSWER_METADATA_INTERNAL_LINKS"
          | "CAPTURE_EXACT_REVISION_DIFF"
          | "RUN_QUALITY_AND_JOURNEY_TESTS"
          | "POLICY_REVIEW_AND_RELEASE_RECEIPT"
          | "RECORD_EXPERIMENT_WINDOW"
          | "OBSERVE_MEASURABLE_OR_BLOCK_CLEARLY"
          | "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER"
          | "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const TURN_DEMAND_INTO_PAGE_IMPROVEMENT_RELATED_CASE_IDS = [
  "T-F14",
] as const;

function preservedInputCount(
  input: TurnDemandIntoPageImprovementInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.observations && input.observations.length > 0 ? 1 : 0) +
    (input.intentMatch?.intentId.trim() ? 1 : 0) +
    (input.mission?.missionId.trim() ? 1 : 0) +
    (input.proposedAnswer?.proposedAnswerId.trim() ? 1 : 0) +
    (input.revision?.revisionId.trim() ? 1 : 0) +
    (input.qa?.qaBundleId.trim() ? 1 : 0) +
    (input.releaseReceiptId?.trim() ? 1 : 0) +
    (input.experimentWindow?.experimentId.trim() ? 1 : 0) +
    (input.measurableChange?.observationId.trim() ? 1 : 0)
  );
}

function observationsOk(
  observations: readonly DemandPageObservation[] | null,
): observations is readonly DemandPageObservation[] {
  if (!observations || observations.length === 0) return false;
  return observations.every(
    (o) => o.observationId.trim().length > 0 && o.demandLabel.trim().length > 0,
  );
}

function intentMatchOk(
  match: IntentPageMatch | null,
): match is IntentPageMatch {
  if (!match) return false;
  return (
    match.intentId.trim().length > 0 &&
    match.pageId.trim().length > 0 &&
    match.pagePath.trim().length > 0 &&
    match.editableVerified === true &&
    match.matchConfidence !== "LOW"
  );
}

function missionOk(
  mission: VisibilityMissionPlan | null,
): mission is VisibilityMissionPlan {
  if (!mission) return false;
  return (
    mission.missionId.trim().length > 0 &&
    mission.taskPlanId.trim().length > 0 &&
    mission.contentBriefId.trim().length > 0 &&
    mission.briefSummary.trim().length > 0
  );
}

function proposedAnswerOk(
  review: ProposedAnswerReview | null,
): review is ProposedAnswerReview {
  if (!review) return false;
  return (
    review.proposedAnswerId.trim().length > 0 &&
    review.answerSummary.trim().length > 0 &&
    review.metadataReviewed === true &&
    review.internalLinksReviewed === true &&
    Number.isFinite(review.linkTargetCount) &&
    review.linkTargetCount >= 0
  );
}

function revisionOk(revision: RevisionDiff | null): revision is RevisionDiff {
  if (!revision) return false;
  return (
    revision.revisionId.trim().length > 0 &&
    revision.exactDiff.trim().length > 0 &&
    Number.isFinite(revision.changedPathCount) &&
    revision.changedPathCount >= 1
  );
}

function qaOk(qa: IndependentQaBundle | null): qa is IndependentQaBundle {
  if (!qa) return false;
  return (
    qa.qaBundleId.trim().length > 0 &&
    qa.qualityPassed === true &&
    qa.customerJourneyPassed === true
  );
}

function experimentOk(
  window: ExperimentWindow | null,
): window is ExperimentWindow {
  if (!window) return false;
  if (
    !window.experimentId.trim() ||
    !window.startsAtIso.trim() ||
    !window.endsAtIso.trim()
  ) {
    return false;
  }
  const startMs = Date.parse(window.startsAtIso);
  const endMs = Date.parse(window.endsAtIso);
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
}

function measurableOk(
  change: MeasurableChangeObservation | null,
): change is MeasurableChangeObservation {
  if (!change) return false;
  return (
    change.observationId.trim().length > 0 &&
    change.measurable === true &&
    change.measurementNote.trim().length > 0
  );
}

/**
 * Evaluate the T-F14 turn-demand-into-page-improvement path offline.
 * Complete F14 evidence package → TURN_DEMAND_INTO_PAGE_IMPROVEMENT_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateTurnDemandIntoPageImprovement(
  input: TurnDemandIntoPageImprovementInput,
): TurnDemandIntoPageImprovementDecision {
  const base = {
    sourceBackedChangeRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const observations = input.observations;
  const intentMatch = input.intentMatch;
  const mission = input.mission;
  const proposedAnswer = input.proposedAnswer;
  const revision = input.revision;
  const qa = input.qa;
  const experimentWindow = input.experimentWindow;
  const measurableChange = input.measurableChange;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_OBSERVATIONS"
      | "AWAITING_INTENT_PAGE_MATCH"
      | "AWAITING_MISSION_PLAN"
      | "AWAITING_PROPOSED_ANSWER_REVIEW"
      | "AWAITING_REVISION_DIFF"
      | "AWAITING_QA_BUNDLE"
      | "AWAITING_POLICY_RELEASE"
      | "AWAITING_EXPERIMENT_WINDOW"
      | "AWAITING_MEASURABLE_CHANGE",
    recoveryPath:
      | "OPEN_TREND_OR_RECURRING_QUESTION"
      | "CONFIRM_TARGET_INTENT_AND_PAGE"
      | "CREATE_VISIBILITY_MISSION_WITH_BRIEF"
      | "REVIEW_ANSWER_METADATA_INTERNAL_LINKS"
      | "CAPTURE_EXACT_REVISION_DIFF"
      | "RUN_QUALITY_AND_JOURNEY_TESTS"
      | "POLICY_REVIEW_AND_RELEASE_RECEIPT"
      | "RECORD_EXPERIMENT_WINDOW"
      | "OBSERVE_MEASURABLE_OR_BLOCK_CLEARLY"
      | "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER"
      | "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
  ): NonNullable<
    Extract<
      TurnDemandIntoPageImprovementDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    observationIds: observations?.map((o) => o.observationId) ?? [],
    intentId: intentMatch?.intentId.trim() || null,
    pageId: intentMatch?.pageId.trim() || null,
    pagePath: intentMatch?.pagePath.trim() || null,
    matchConfidence: intentMatch?.matchConfidence ?? null,
    missionId: mission?.missionId.trim() || null,
    taskPlanId: mission?.taskPlanId.trim() || null,
    contentBriefId: mission?.contentBriefId.trim() || null,
    proposedAnswerId: proposedAnswer?.proposedAnswerId.trim() || null,
    metadataReviewed: proposedAnswer?.metadataReviewed === true,
    internalLinksReviewed: proposedAnswer?.internalLinksReviewed === true,
    linkTargetCount: proposedAnswer?.linkTargetCount ?? 0,
    revisionId: revision?.revisionId.trim() || null,
    exactDiff: revision?.exactDiff.trim() || null,
    changedPathCount: revision?.changedPathCount ?? 0,
    qaBundleId: qa?.qaBundleId.trim() || null,
    qualityPassed: qa?.qualityPassed === true,
    customerJourneyPassed: qa?.customerJourneyPassed === true,
    releaseReceiptId: input.releaseReceiptId?.trim() || null,
    experimentId: experimentWindow?.experimentId.trim() || null,
    experimentStartsAtIso: experimentWindow?.startsAtIso.trim() || null,
    experimentEndsAtIso: experimentWindow?.endsAtIso.trim() || null,
    measurableChangeObservationId:
      measurableChange?.observationId.trim() || null,
    changeMeasurable: measurableChange?.measurable === true,
    measurementNote: measurableChange?.measurementNote.trim() || null,
    releaseVerifiedLive: false,
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
      measurableOrBlockedClear: true,
      evidence: null,
      reasons: [
        "Live demand→page improvement CMS/provider apply remains NOT_WIRED — refuse live wiring (T-F14)",
      ],
    };
  }

  if (input.claimLiveVerifiedRelease) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_RELEASE_REFUSED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: null,
      reasons: [
        "Refused false live-verified demand→page improvement claim offline (T-F14) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.requestKeywordProliferation) {
    return {
      allowed: false,
      code: "KEYWORD_PROLIFERATION_REFUSED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "KEYWORD_PROLIFERATION_REFUSED",
        "BLOCKED",
        "COLLAPSE_TO_ONE_USEFUL_PAGE_UPDATE",
      ),
      reasons: [
        "Keyword proliferation refused — prefer one useful page update (T-F14); proliferation gate is T-US-028",
      ],
    };
  }

  if (!input.packageId.trim() || !observationsOk(observations)) {
    return {
      allowed: false,
      code: "OBSERVATIONS_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "OBSERVATIONS_INCOMPLETE",
        "AWAITING_OBSERVATIONS",
        "OPEN_TREND_OR_RECURRING_QUESTION",
      ),
      reasons: [
        "F14 requires package id and at least one observation with observationId + demandLabel (T-F14)",
      ],
    };
  }

  if (!intentMatchOk(intentMatch)) {
    return {
      allowed: false,
      code: "INTENT_PAGE_MATCH_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "INTENT_PAGE_MATCH_INCOMPLETE",
        "AWAITING_INTENT_PAGE_MATCH",
        "CONFIRM_TARGET_INTENT_AND_PAGE",
      ),
      reasons: [
        "F14 requires intent-to-page match with intentId, verified editable page, path, and non-LOW confidence (T-F14)",
      ],
    };
  }

  if (!missionOk(mission)) {
    return {
      allowed: false,
      code: "MISSION_PLAN_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "MISSION_PLAN_INCOMPLETE",
        "AWAITING_MISSION_PLAN",
        "CREATE_VISIBILITY_MISSION_WITH_BRIEF",
      ),
      reasons: [
        "F14 requires visibility mission with missionId, taskPlanId, contentBriefId, and briefSummary (T-F14)",
      ],
    };
  }

  if (!proposedAnswerOk(proposedAnswer)) {
    return {
      allowed: false,
      code: "PROPOSED_ANSWER_REVIEW_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "PROPOSED_ANSWER_REVIEW_INCOMPLETE",
        "AWAITING_PROPOSED_ANSWER_REVIEW",
        "REVIEW_ANSWER_METADATA_INTERNAL_LINKS",
      ),
      reasons: [
        "F14 requires proposed answer review with answerSummary, metadataReviewed, and internalLinksReviewed (T-F14)",
      ],
    };
  }

  if (!revisionOk(revision)) {
    return {
      allowed: false,
      code: "REVISION_DIFF_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "REVISION_DIFF_INCOMPLETE",
        "AWAITING_REVISION_DIFF",
        "CAPTURE_EXACT_REVISION_DIFF",
      ),
      reasons: [
        "F14 requires exact revision diff with revisionId, non-empty exactDiff, and changedPathCount>=1 (T-F14)",
      ],
    };
  }

  if (!qaOk(qa)) {
    return {
      allowed: false,
      code: "QA_BUNDLE_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "QA_BUNDLE_INCOMPLETE",
        "AWAITING_QA_BUNDLE",
        "RUN_QUALITY_AND_JOURNEY_TESTS",
      ),
      reasons: [
        "F14 requires independent QA bundle with qaBundleId and passing quality + customer-journey tests (T-F14)",
      ],
    };
  }

  if (!input.policyReviewed || !input.releaseReceiptId?.trim()) {
    return {
      allowed: false,
      code: "POLICY_RELEASE_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "POLICY_RELEASE_INCOMPLETE",
        "AWAITING_POLICY_RELEASE",
        "POLICY_REVIEW_AND_RELEASE_RECEIPT",
      ),
      reasons: [
        "F14 requires policy review and release receipt to release the page improvement (T-F14)",
      ],
    };
  }

  if (!experimentOk(experimentWindow)) {
    return {
      allowed: false,
      code: "EXPERIMENT_WINDOW_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "EXPERIMENT_WINDOW_INCOMPLETE",
        "AWAITING_EXPERIMENT_WINDOW",
        "RECORD_EXPERIMENT_WINDOW",
      ),
      reasons: [
        "F14 requires experiment window with experimentId and endsAtIso after startsAtIso (T-F14)",
      ],
    };
  }

  if (!measurableOk(measurableChange)) {
    return {
      allowed: false,
      code: "MEASURABLE_CHANGE_REQUIRED",
      ...base,
      measurableOrBlockedClear: true,
      evidence: blockedEvidence(
        "MEASURABLE_CHANGE_INCOMPLETE",
        "AWAITING_MEASURABLE_CHANGE",
        "OBSERVE_MEASURABLE_OR_BLOCK_CLEARLY",
      ),
      reasons: [
        "F14 requires a measurable change observation (or clear block) after release — observationId, measurable=true, measurementNote (T-F14)",
      ],
    };
  }

  return {
    allowed: true,
    code: "TURN_DEMAND_INTO_PAGE_IMPROVEMENT_EVIDENCE_RECORDED",
    ...base,
    sourceBackedChangeRecorded: true,
    measurableOrBlockedClear: true,
    evidence: {
      packageId: input.packageId.trim(),
      observationIds: observations.map((o) => o.observationId.trim()),
      intentId: intentMatch.intentId.trim(),
      pageId: intentMatch.pageId.trim(),
      pagePath: intentMatch.pagePath.trim(),
      matchConfidence: intentMatch.matchConfidence,
      missionId: mission.missionId.trim(),
      taskPlanId: mission.taskPlanId.trim(),
      contentBriefId: mission.contentBriefId.trim(),
      proposedAnswerId: proposedAnswer.proposedAnswerId.trim(),
      metadataReviewed: true,
      internalLinksReviewed: true,
      linkTargetCount: proposedAnswer.linkTargetCount,
      revisionId: revision.revisionId.trim(),
      exactDiff: revision.exactDiff.trim(),
      changedPathCount: revision.changedPathCount,
      qaBundleId: qa.qaBundleId.trim(),
      qualityPassed: true,
      customerJourneyPassed: true,
      releaseReceiptId: input.releaseReceiptId.trim(),
      experimentId: experimentWindow.experimentId.trim(),
      experimentStartsAtIso: experimentWindow.startsAtIso.trim(),
      experimentEndsAtIso: experimentWindow.endsAtIso.trim(),
      measurableChangeObservationId: measurableChange.observationId.trim(),
      changeMeasurable: true,
      measurementNote: measurableChange.measurementNote.trim(),
      releaseVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F14_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "DEMAND_PAGE_IMPROVEMENT_RELEASED_MEASURABLE",
      recoveryPath: "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F14 evidence package recorded (observations, intent-to-page, mission/brief, proposed answer/metadata/links review, exact revision diff, independent QA, policy release receipt + experiment window, measurable change observation); source-backed change recorded; live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}

export type {
  DemandPageObservation,
  IntentPageMatch,
  VisibilityMissionPlan,
  RevisionDiff,
  IndependentQaBundle,
  ExperimentWindow,
};
