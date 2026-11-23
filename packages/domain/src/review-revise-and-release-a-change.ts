/**
 * T-F18 — Review, revise and release a change (complete F18 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F18 evidence
 * package — review-queue selection, why-proposed evidence summary, human-
 * readable before/after + source drawer, technical/factual/policy gate
 * inspection, QA bundle, independent decision bound to exact revision +
 * policy, and release tracking (receipt or blocked exception) with fixture
 * verification. Incomplete packages, self-approval, stale approvals, false
 * live-verified claims, and live provider wiring are refused. Live provider
 * wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-035 (`REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED`) — this
 * records the complete F18 flow evidence package (queue selection + source
 * drawer + gate inspection + release track/verify), not the receipt-or-
 * blocked happy-path summary alone. Distinct from T-US-036/T-X019 (stale
 * approval invalidated) and T-US-054/T-X018 (self-approval rejected alone).
 */

export type ReviewQueueSelection = {
  queueId: string;
  selectedItemId: string;
  /** Item opened from the review queue. */
  opened: boolean;
};

export type WhyProposedEvidence = {
  evidenceSummaryId: string;
  /** Why the change is proposed (observation / hypothesis summary). */
  whyProposed: string;
  supportingObservationIds: readonly string[];
};

export type BeforeAfterCompare = {
  compareId: string;
  beforeSummary: string;
  afterSummary: string;
  /** Human-readable before/after diff bound to revisionId. */
  humanReadableDiff: string;
};

export type SourceDrawer = {
  drawerId: string;
  /** Supporting source IDs shown in the drawer. */
  sourceIds: readonly string[];
  drawerOpened: boolean;
};

export type GateInspectionStatus = "pass" | "fail" | "not_run" | "not_applicable";

export type InspectedGate = {
  gateId: string;
  kind: "technical" | "factual" | "policy";
  status: GateInspectionStatus;
  inspected: boolean;
};

export type F18QaBundle = {
  qaBundleId: string;
  /** Exact revision the QA bundle inspected — must match decision.revisionId. */
  revisionId: string;
  technicalPassed: boolean;
  factualPassed: boolean;
  policyPassed: boolean;
};

export type F18DecisionKind = "APPROVE" | "REQUEST_REVISION" | "REJECT";

export type F18DecisionRecord = {
  decisionId: string;
  decision: F18DecisionKind;
  /** Independent reviewer — must not equal authorRoleId. */
  reviewerRoleId: string;
  authorRoleId: string;
  /** Exact revision the decision is bound to. */
  revisionId: string;
  /** Policy version the decision is bound to. */
  policyVersion: string;
  /** Required when decision is REQUEST_REVISION or REJECT. */
  decisionReason: string | null;
};

export type F18ReleaseTrack = {
  trackId: string;
  /** Exact revision the release track concerns — must match decision.revisionId. */
  revisionId: string;
  /** Fixture release receipt (approve happy path). */
  releaseReceiptId: string | null;
  /** Blocked exception when reject / request-revision / gate block. */
  blockedExceptionCode: string | null;
  /** Release tracked in fixture ledger (not live). */
  tracked: boolean;
  /** Fixture verification of receipt or blocked exception. */
  verifiedInFixture: boolean;
};

export type ReviewReviseAndReleaseAChangeInput = {
  packageId: string;
  queueSelection: ReviewQueueSelection | null;
  whyProposed: WhyProposedEvidence | null;
  beforeAfter: BeforeAfterCompare | null;
  sourceDrawer: SourceDrawer | null;
  gateInspection: readonly InspectedGate[] | null;
  qa: F18QaBundle | null;
  decision: F18DecisionRecord | null;
  releaseTrack: F18ReleaseTrack | null;
  /**
   * Author edited the revision after the decision was minted — must refuse
   * (stale approval; T-US-036/T-X019 territory but enforced here too).
   */
  revisionChangedAfterDecision: boolean;
  /** Claim the F18 path is live-verified — must refuse offline. */
  claimLiveVerifiedRelease: boolean;
  /** Request live CMS/provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /** Attempt a production write from the review surface — must refuse. */
  attemptProductionWrite: boolean;
};

export type ReviewReviseAndReleaseAChangeDecision =
  | {
      allowed: true;
      code: "REVIEW_REVISE_AND_RELEASE_A_CHANGE_EVIDENCE_RECORDED";
      changeReviewedAndReleasedRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        queueId: string;
        selectedItemId: string;
        queueOpened: true;
        evidenceSummaryId: string;
        whyProposed: string;
        supportingObservationIds: string[];
        compareId: string;
        beforeSummary: string;
        afterSummary: string;
        humanReadableDiff: string;
        drawerId: string;
        sourceIds: string[];
        drawerOpened: true;
        inspectedGateIds: string[];
        technicalGateInspected: true;
        factualGateInspected: true;
        policyGateInspected: true;
      qaBundleId: string;
      technicalPassed: boolean;
      factualPassed: boolean;
      policyPassed: boolean;
      decisionId: string;
        decision: F18DecisionKind;
        decisionReason: string | null;
        reviewerRoleId: string;
        authorRoleId: string;
        revisionId: string;
        policyVersion: string;
        releaseTrackId: string;
        releaseReceiptId: string | null;
        blockedExceptionCode: string | null;
        releaseTracked: true;
        releaseVerifiedInFixture: true;
        releaseVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F18_EVIDENCE_PACKAGE_COMPLETE";
        currentState:
          | "RELEASED_FIXTURE_TRACKED"
          | "BLOCKED_EXCEPTION_TRACKED";
        recoveryPath: "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "REVIEW_QUEUE_SELECTION_REQUIRED"
        | "WHY_PROPOSED_EVIDENCE_REQUIRED"
        | "BEFORE_AFTER_COMPARE_REQUIRED"
        | "SOURCE_DRAWER_REQUIRED"
        | "GATE_INSPECTION_REQUIRED"
        | "QA_BUNDLE_REQUIRED"
        | "DECISION_RECORD_REQUIRED"
        | "SELF_APPROVAL_FORBIDDEN"
        | "NEGATIVE_DECISION_REASON_REQUIRED"
        | "STALE_APPROVAL_INVALIDATED"
        | "REVISION_BINDING_MISMATCH"
        | "GATE_FAILURE_BLOCKS_APPROVE"
        | "QA_FAILURE_BLOCKS_APPROVE"
        | "RELEASE_TRACK_REQUIRED"
        | "RELEASE_OUTCOME_REQUIRED"
        | "RELEASE_OUTCOME_AMBIGUOUS"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_RELEASE_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      changeReviewedAndReleasedRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        queueId: string | null;
        selectedItemId: string | null;
        queueOpened: boolean;
        evidenceSummaryId: string | null;
        whyProposed: string | null;
        supportingObservationIds: string[];
        compareId: string | null;
        beforeSummary: string | null;
        afterSummary: string | null;
        humanReadableDiff: string | null;
        drawerId: string | null;
        sourceIds: string[];
        drawerOpened: boolean;
        inspectedGateIds: string[];
        technicalGateInspected: boolean;
        factualGateInspected: boolean;
        policyGateInspected: boolean;
        qaBundleId: string | null;
        technicalPassed: boolean;
        factualPassed: boolean;
        policyPassed: boolean;
        decisionId: string | null;
        decision: F18DecisionKind | null;
        decisionReason: string | null;
        reviewerRoleId: string | null;
        authorRoleId: string | null;
        revisionId: string | null;
        policyVersion: string | null;
        releaseTrackId: string | null;
        releaseReceiptId: string | null;
        blockedExceptionCode: string | null;
        releaseTracked: boolean;
        releaseVerifiedInFixture: boolean;
        releaseVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_REVIEW_QUEUE_SELECTION"
          | "AWAITING_WHY_PROPOSED"
          | "AWAITING_BEFORE_AFTER_COMPARE"
          | "AWAITING_SOURCE_DRAWER"
          | "AWAITING_GATE_INSPECTION"
          | "AWAITING_QA_BUNDLE"
          | "AWAITING_DECISION_RECORD"
          | "AWAITING_INDEPENDENT_REVIEW"
          | "AWAITING_RELEASE_TRACK";
        recoveryPath:
          | "OPEN_REVIEW_QUEUE_AND_SELECT_ITEM"
          | "CAPTURE_WHY_PROPOSED_EVIDENCE"
          | "COMPARE_BEFORE_AFTER_AND_DIFF"
          | "OPEN_SOURCE_DRAWER"
          | "INSPECT_TECHNICAL_FACTUAL_POLICY_GATES"
          | "COMPLETE_QA_BUNDLE"
          | "RECORD_INDEPENDENT_DECISION"
          | "USE_INDEPENDENT_REVIEWER"
          | "RE_REVIEW_AFTER_REVISION"
          | "TRACK_RECEIPT_OR_BLOCKED_EXCEPTION"
          | "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const REVIEW_REVISE_AND_RELEASE_A_CHANGE_RELATED_CASE_IDS = [
  "T-F18",
] as const;

function preservedInputCount(
  input: ReviewReviseAndReleaseAChangeInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.queueSelection?.queueId.trim() ? 1 : 0) +
    (input.whyProposed?.evidenceSummaryId.trim() ? 1 : 0) +
    (input.beforeAfter?.compareId.trim() ? 1 : 0) +
    (input.sourceDrawer?.drawerId.trim() ? 1 : 0) +
    (input.gateInspection && input.gateInspection.length > 0 ? 1 : 0) +
    (input.qa?.qaBundleId.trim() ? 1 : 0) +
    (input.decision?.decisionId.trim() ? 1 : 0) +
    (input.releaseTrack?.trackId.trim() ? 1 : 0)
  );
}

function queueOk(
  queue: ReviewQueueSelection | null,
): queue is ReviewQueueSelection {
  if (!queue) return false;
  return (
    queue.queueId.trim().length > 0 &&
    queue.selectedItemId.trim().length > 0 &&
    queue.opened === true
  );
}

function whyOk(
  why: WhyProposedEvidence | null,
): why is WhyProposedEvidence {
  if (!why) return false;
  return (
    why.evidenceSummaryId.trim().length > 0 &&
    why.whyProposed.trim().length > 0 &&
    why.supportingObservationIds.length > 0 &&
    why.supportingObservationIds.every((id) => id.trim().length > 0)
  );
}

function compareOk(
  compare: BeforeAfterCompare | null,
): compare is BeforeAfterCompare {
  if (!compare) return false;
  return (
    compare.compareId.trim().length > 0 &&
    compare.beforeSummary.trim().length > 0 &&
    compare.afterSummary.trim().length > 0 &&
    compare.humanReadableDiff.trim().length > 0
  );
}

function drawerOk(drawer: SourceDrawer | null): drawer is SourceDrawer {
  if (!drawer) return false;
  return (
    drawer.drawerId.trim().length > 0 &&
    drawer.sourceIds.length > 0 &&
    drawer.sourceIds.every((id) => id.trim().length > 0) &&
    drawer.drawerOpened === true
  );
}

function gatesOk(
  gates: readonly InspectedGate[] | null,
): gates is readonly InspectedGate[] {
  if (!gates || gates.length === 0) return false;
  const kinds = new Set(gates.map((g) => g.kind));
  if (
    !kinds.has("technical") ||
    !kinds.has("factual") ||
    !kinds.has("policy")
  ) {
    return false;
  }
  return gates.every(
    (g) =>
      g.gateId.trim().length > 0 &&
      g.inspected === true &&
      (g.status === "pass" ||
        g.status === "fail" ||
        g.status === "not_run" ||
        g.status === "not_applicable"),
  );
}

function qaPresent(qa: F18QaBundle | null): qa is F18QaBundle {
  if (!qa) return false;
  return qa.qaBundleId.trim().length > 0 && qa.revisionId.trim().length > 0;
}

function qaAllPassed(qa: F18QaBundle): boolean {
  return (
    qa.technicalPassed === true &&
    qa.factualPassed === true &&
    qa.policyPassed === true
  );
}

function gatesAllPassed(gates: readonly InspectedGate[]): boolean {
  const byKind = {
    technical: gates.find((g) => g.kind === "technical"),
    factual: gates.find((g) => g.kind === "factual"),
    policy: gates.find((g) => g.kind === "policy"),
  };
  return (
    byKind.technical?.status === "pass" &&
    byKind.factual?.status === "pass" &&
    byKind.policy?.status === "pass"
  );
}

function decisionOk(
  decision: F18DecisionRecord | null,
): decision is F18DecisionRecord {
  if (!decision) return false;
  return (
    decision.decisionId.trim().length > 0 &&
    decision.revisionId.trim().length > 0 &&
    decision.policyVersion.trim().length > 0 &&
    decision.reviewerRoleId.trim().length > 0 &&
    decision.authorRoleId.trim().length > 0 &&
    (decision.decision === "APPROVE" ||
      decision.decision === "REQUEST_REVISION" ||
      decision.decision === "REJECT")
  );
}

function trackOk(
  track: F18ReleaseTrack | null,
): track is F18ReleaseTrack {
  if (!track) return false;
  return (
    track.trackId.trim().length > 0 &&
    track.revisionId.trim().length > 0 &&
    track.tracked === true &&
    track.verifiedInFixture === true
  );
}

function normalizeOutcomeField(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Evaluate the T-F18 review → revise → release path offline.
 * Complete F18 evidence package → REVIEW_REVISE_AND_RELEASE_A_CHANGE_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateReviewReviseAndReleaseAChange(
  input: ReviewReviseAndReleaseAChangeInput,
): ReviewReviseAndReleaseAChangeDecision {
  const base = {
    changeReviewedAndReleasedRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const queue = input.queueSelection;
  const why = input.whyProposed;
  const compare = input.beforeAfter;
  const drawer = input.sourceDrawer;
  const gates = input.gateInspection;
  const qa = input.qa;
  const decision = input.decision;
  const track = input.releaseTrack;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_REVIEW_QUEUE_SELECTION"
      | "AWAITING_WHY_PROPOSED"
      | "AWAITING_BEFORE_AFTER_COMPARE"
      | "AWAITING_SOURCE_DRAWER"
      | "AWAITING_GATE_INSPECTION"
      | "AWAITING_QA_BUNDLE"
      | "AWAITING_DECISION_RECORD"
      | "AWAITING_INDEPENDENT_REVIEW"
      | "AWAITING_RELEASE_TRACK",
    recoveryPath:
      | "OPEN_REVIEW_QUEUE_AND_SELECT_ITEM"
      | "CAPTURE_WHY_PROPOSED_EVIDENCE"
      | "COMPARE_BEFORE_AFTER_AND_DIFF"
      | "OPEN_SOURCE_DRAWER"
      | "INSPECT_TECHNICAL_FACTUAL_POLICY_GATES"
      | "COMPLETE_QA_BUNDLE"
      | "RECORD_INDEPENDENT_DECISION"
      | "USE_INDEPENDENT_REVIEWER"
      | "RE_REVIEW_AFTER_REVISION"
      | "TRACK_RECEIPT_OR_BLOCKED_EXCEPTION"
      | "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER",
  ): NonNullable<
    Extract<
      ReviewReviseAndReleaseAChangeDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    queueId: queue?.queueId.trim() || null,
    selectedItemId: queue?.selectedItemId.trim() || null,
    queueOpened: queue?.opened === true,
    evidenceSummaryId: why?.evidenceSummaryId.trim() || null,
    whyProposed: why?.whyProposed.trim() || null,
    supportingObservationIds:
      why?.supportingObservationIds.map((id) => id.trim()) ?? [],
    compareId: compare?.compareId.trim() || null,
    beforeSummary: compare?.beforeSummary.trim() || null,
    afterSummary: compare?.afterSummary.trim() || null,
    humanReadableDiff: compare?.humanReadableDiff.trim() || null,
    drawerId: drawer?.drawerId.trim() || null,
    sourceIds: drawer?.sourceIds.map((id) => id.trim()) ?? [],
    drawerOpened: drawer?.drawerOpened === true,
    inspectedGateIds: gates?.map((g) => g.gateId.trim()) ?? [],
    technicalGateInspected:
      gates?.some((g) => g.kind === "technical" && g.inspected) === true,
    factualGateInspected:
      gates?.some((g) => g.kind === "factual" && g.inspected) === true,
    policyGateInspected:
      gates?.some((g) => g.kind === "policy" && g.inspected) === true,
    qaBundleId: qa?.qaBundleId.trim() || null,
    technicalPassed: qa?.technicalPassed === true,
    factualPassed: qa?.factualPassed === true,
    policyPassed: qa?.policyPassed === true,
    decisionId: decision?.decisionId.trim() || null,
    decision: decision?.decision ?? null,
    decisionReason: decision?.decisionReason ?? null,
    reviewerRoleId: decision?.reviewerRoleId.trim() || null,
    authorRoleId: decision?.authorRoleId.trim() || null,
    revisionId: decision?.revisionId.trim() || null,
    policyVersion: decision?.policyVersion.trim() || null,
    releaseTrackId: track?.trackId.trim() || null,
    releaseReceiptId: track?.releaseReceiptId ?? null,
    blockedExceptionCode: track?.blockedExceptionCode ?? null,
    releaseTracked: track?.tracked === true,
    releaseVerifiedInFixture: track?.verifiedInFixture === true,
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
      evidence: null,
      reasons: [
        "Live review/revise/release CMS/provider apply remains NOT_WIRED — refuse live wiring (T-F18)",
      ],
    };
  }

  if (input.claimLiveVerifiedRelease) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_RELEASE_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified review/revise/release claim offline (T-F18) — fixture ACCEPTED ≠ VERIFIED",
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
        "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER",
      ),
      reasons: [
        "Production write from review surface refused offline (T-F18); externalEffects NONE",
      ],
    };
  }

  if (!input.packageId.trim() || !queueOk(queue)) {
    return {
      allowed: false,
      code: "REVIEW_QUEUE_SELECTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "REVIEW_QUEUE_SELECTION_INCOMPLETE",
        "AWAITING_REVIEW_QUEUE_SELECTION",
        "OPEN_REVIEW_QUEUE_AND_SELECT_ITEM",
      ),
      reasons: [
        "F18 requires package id and review-queue selection with queueId, selectedItemId, opened=true (T-F18)",
      ],
    };
  }

  if (!whyOk(why)) {
    return {
      allowed: false,
      code: "WHY_PROPOSED_EVIDENCE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "WHY_PROPOSED_INCOMPLETE",
        "AWAITING_WHY_PROPOSED",
        "CAPTURE_WHY_PROPOSED_EVIDENCE",
      ),
      reasons: [
        "F18 requires why-proposed evidence with evidenceSummaryId, whyProposed, and supportingObservationIds (T-F18)",
      ],
    };
  }

  if (!compareOk(compare)) {
    return {
      allowed: false,
      code: "BEFORE_AFTER_COMPARE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BEFORE_AFTER_COMPARE_INCOMPLETE",
        "AWAITING_BEFORE_AFTER_COMPARE",
        "COMPARE_BEFORE_AFTER_AND_DIFF",
      ),
      reasons: [
        "F18 requires before/after compare with compareId, beforeSummary, afterSummary, and humanReadableDiff (T-F18)",
      ],
    };
  }

  if (!drawerOk(drawer)) {
    return {
      allowed: false,
      code: "SOURCE_DRAWER_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SOURCE_DRAWER_INCOMPLETE",
        "AWAITING_SOURCE_DRAWER",
        "OPEN_SOURCE_DRAWER",
      ),
      reasons: [
        "F18 requires source drawer with drawerId, sourceIds, and drawerOpened=true (T-F18)",
      ],
    };
  }

  if (!gatesOk(gates)) {
    return {
      allowed: false,
      code: "GATE_INSPECTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "GATE_INSPECTION_INCOMPLETE",
        "AWAITING_GATE_INSPECTION",
        "INSPECT_TECHNICAL_FACTUAL_POLICY_GATES",
      ),
      reasons: [
        "F18 requires inspected technical, factual, and policy gates (T-F18)",
      ],
    };
  }

  if (!qaPresent(qa)) {
    return {
      allowed: false,
      code: "QA_BUNDLE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "QA_BUNDLE_INCOMPLETE",
        "AWAITING_QA_BUNDLE",
        "COMPLETE_QA_BUNDLE",
      ),
      reasons: [
        "F18 requires QA bundle with qaBundleId and revisionId (pass/fail outcome evaluated after decision) (T-F18)",
      ],
    };
  }

  if (!decisionOk(decision)) {
    return {
      allowed: false,
      code: "DECISION_RECORD_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DECISION_RECORD_INCOMPLETE",
        "AWAITING_DECISION_RECORD",
        "RECORD_INDEPENDENT_DECISION",
      ),
      reasons: [
        "F18 requires decision record bound to revisionId + policyVersion with independent reviewer (T-F18)",
      ],
    };
  }

  if (
    decision.reviewerRoleId.trim() === decision.authorRoleId.trim()
  ) {
    return {
      allowed: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      ...base,
      evidence: blockedEvidence(
        "SELF_APPROVAL_FORBIDDEN",
        "AWAITING_INDEPENDENT_REVIEW",
        "USE_INDEPENDENT_REVIEWER",
      ),
      reasons: [
        "Self-approval refused (T-F18); independent reviewer required — also T-US-054/T-X018 territory",
      ],
    };
  }

  if (input.revisionChangedAfterDecision) {
    return {
      allowed: false,
      code: "STALE_APPROVAL_INVALIDATED",
      ...base,
      evidence: blockedEvidence(
        "STALE_APPROVAL_INVALIDATED",
        "AWAITING_DECISION_RECORD",
        "RE_REVIEW_AFTER_REVISION",
      ),
      reasons: [
        "Stale approval invalidated after revision change (T-F18); re-review required — also T-US-036/T-X019 territory",
      ],
    };
  }

  if (
    (decision.decision === "REQUEST_REVISION" ||
      decision.decision === "REJECT") &&
    (!decision.decisionReason || !decision.decisionReason.trim())
  ) {
    return {
      allowed: false,
      code: "NEGATIVE_DECISION_REASON_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "NEGATIVE_DECISION_REASON_MISSING",
        "AWAITING_DECISION_RECORD",
        "RECORD_INDEPENDENT_DECISION",
      ),
      reasons: [
        "REQUEST_REVISION / REJECT requires a decisionReason (T-F18)",
      ],
    };
  }

  if (
    decision.decision === "APPROVE" &&
    !gatesAllPassed(gates)
  ) {
    return {
      allowed: false,
      code: "GATE_FAILURE_BLOCKS_APPROVE",
      ...base,
      evidence: blockedEvidence(
        "GATE_FAILURE_OR_NOT_RUN_BLOCKS_APPROVE",
        "AWAITING_GATE_INSPECTION",
        "INSPECT_TECHNICAL_FACTUAL_POLICY_GATES",
      ),
      reasons: [
        "APPROVE refused while a technical/factual/policy gate is fail or not_run (T-F18)",
      ],
    };
  }

  if (decision.decision === "APPROVE" && !qaAllPassed(qa)) {
    return {
      allowed: false,
      code: "QA_FAILURE_BLOCKS_APPROVE",
      ...base,
      evidence: blockedEvidence(
        "QA_FAILURE_BLOCKS_APPROVE",
        "AWAITING_QA_BUNDLE",
        "COMPLETE_QA_BUNDLE",
      ),
      reasons: [
        "APPROVE refused while QA technical/factual/policy is not all passing (T-F18); use REJECT/REQUEST_REVISION with blocked exception",
      ],
    };
  }

  if (!trackOk(track)) {
    return {
      allowed: false,
      code: "RELEASE_TRACK_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "RELEASE_TRACK_INCOMPLETE",
        "AWAITING_RELEASE_TRACK",
        "TRACK_RECEIPT_OR_BLOCKED_EXCEPTION",
      ),
      reasons: [
        "F18 requires release track with trackId, revisionId, tracked=true, and verifiedInFixture=true (T-F18)",
      ],
    };
  }

  const boundRevision = decision.revisionId.trim();
  if (
    qa.revisionId.trim() !== boundRevision ||
    track.revisionId.trim() !== boundRevision
  ) {
    return {
      allowed: false,
      code: "REVISION_BINDING_MISMATCH",
      ...base,
      evidence: blockedEvidence(
        "REVISION_BINDING_MISMATCH",
        "AWAITING_DECISION_RECORD",
        "RECORD_INDEPENDENT_DECISION",
      ),
      reasons: [
        "QA bundle and release track must bind to the same revisionId as the decision (T-F18)",
      ],
    };
  }

  const normalizedReceipt = normalizeOutcomeField(track.releaseReceiptId);
  const normalizedBlocked = normalizeOutcomeField(track.blockedExceptionCode);
  const hasReceipt = normalizedReceipt !== null;
  const hasBlocked = normalizedBlocked !== null;

  if (hasReceipt && hasBlocked) {
    return {
      allowed: false,
      code: "RELEASE_OUTCOME_AMBIGUOUS",
      ...base,
      evidence: blockedEvidence(
        "RELEASE_OUTCOME_AMBIGUOUS",
        "AWAITING_RELEASE_TRACK",
        "TRACK_RECEIPT_OR_BLOCKED_EXCEPTION",
      ),
      reasons: [
        "Release track must not record both a receipt and a blocked exception (T-F18)",
      ],
    };
  }

  if (decision.decision === "APPROVE") {
    if (!hasReceipt) {
      return {
        allowed: false,
        code: "RELEASE_OUTCOME_REQUIRED",
        ...base,
        evidence: blockedEvidence(
          "RELEASE_RECEIPT_REQUIRED_ON_APPROVE",
          "AWAITING_RELEASE_TRACK",
          "TRACK_RECEIPT_OR_BLOCKED_EXCEPTION",
        ),
        reasons: [
          "APPROVE requires a releaseReceiptId on the release track (T-F18)",
        ],
      };
    }
  } else if (!hasBlocked) {
    return {
      allowed: false,
      code: "RELEASE_OUTCOME_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BLOCKED_EXCEPTION_REQUIRED_ON_NEGATIVE",
        "AWAITING_RELEASE_TRACK",
        "TRACK_RECEIPT_OR_BLOCKED_EXCEPTION",
      ),
      reasons: [
        "REQUEST_REVISION / REJECT requires a blockedExceptionCode on the release track (T-F18)",
      ],
    };
  }

  const currentState =
    decision.decision === "APPROVE"
      ? ("RELEASED_FIXTURE_TRACKED" as const)
      : ("BLOCKED_EXCEPTION_TRACKED" as const);

  return {
    allowed: true,
    code: "REVIEW_REVISE_AND_RELEASE_A_CHANGE_EVIDENCE_RECORDED",
    ...base,
    changeReviewedAndReleasedRecorded: true,
    evidence: {
      packageId: input.packageId.trim(),
      queueId: queue.queueId.trim(),
      selectedItemId: queue.selectedItemId.trim(),
      queueOpened: true,
      evidenceSummaryId: why.evidenceSummaryId.trim(),
      whyProposed: why.whyProposed.trim(),
      supportingObservationIds: why.supportingObservationIds.map((id) =>
        id.trim(),
      ),
      compareId: compare.compareId.trim(),
      beforeSummary: compare.beforeSummary.trim(),
      afterSummary: compare.afterSummary.trim(),
      humanReadableDiff: compare.humanReadableDiff.trim(),
      drawerId: drawer.drawerId.trim(),
      sourceIds: drawer.sourceIds.map((id) => id.trim()),
      drawerOpened: true,
      inspectedGateIds: gates.map((g) => g.gateId.trim()),
      technicalGateInspected: true,
      factualGateInspected: true,
      policyGateInspected: true,
      qaBundleId: qa.qaBundleId.trim(),
      technicalPassed: qa.technicalPassed === true,
      factualPassed: qa.factualPassed === true,
      policyPassed: qa.policyPassed === true,
      decisionId: decision.decisionId.trim(),
      decision: decision.decision,
      decisionReason: decision.decisionReason,
      reviewerRoleId: decision.reviewerRoleId.trim(),
      authorRoleId: decision.authorRoleId.trim(),
      revisionId: boundRevision,
      policyVersion: decision.policyVersion.trim(),
      releaseTrackId: track.trackId.trim(),
      releaseReceiptId: normalizedReceipt,
      blockedExceptionCode: normalizedBlocked,
      releaseTracked: true,
      releaseVerifiedInFixture: true,
      releaseVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F18_EVIDENCE_PACKAGE_COMPLETE",
      currentState,
      recoveryPath: "KEEP_FIXTURE_RELEASE_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F18 evidence package recorded (review-queue selection, why-proposed, before/after + source drawer, gate inspection, QA, independent decision bound to revision+policy, release track/verify); live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}
