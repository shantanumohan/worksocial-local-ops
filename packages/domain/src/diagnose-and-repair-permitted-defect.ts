/**
 * T-F21 — Diagnose and repair a permitted defect (complete F21 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F21 evidence
 * package — incident bundle with business-impact evidence, source binding +
 * bounded repair policy, repair plan with source revision + worktree/lease,
 * patch diff + regression test results + attempt ledger, independent review
 * or standing authority (author cannot self-approve), canary release with
 * read-back + repeated original-journey test, and verified resolution or
 * acknowledged human handoff. Incomplete packages, weaken-test proposals,
 * false live-verified claims, and live CMS repair wiring are refused. Live
 * CMS repair stays NOT_WIRED. Pure domain — no network I/O. Fixture ACCEPTED ≠
 * sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from open T-US-041 (`DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF`) —
 * this records the complete F21 flow evidence package (structured package +
 * Given prerequisites + plan/diff/review/canary/close), not the canary
 * resolve/handoff path alone. Distinct from T-X010 / T-US-042 (weaken-test
 * reject) and T-X011 (attempt-limit escalate).
 */

export type IncidentBundleEvidence = {
  incidentId: string;
  /** Affected customer journey IDs. */
  affectedJourneyIds: readonly string[];
  firstFailureIso: string;
  lastFailureIso: string;
  relatedReleaseIds: readonly string[];
  /** Business-impact summary for the operator. */
  businessImpactSummary: string;
};

export type SourceBindingEvidence = {
  bindingId: string;
  sourceRootId: string;
  /** Bound asset / change-set limit (one asset). */
  assetLimit: "ONE_ASSET";
};

export type BoundedRepairPolicy = {
  policyId: string;
  maxAttempts: number;
  /** Policy forbids weakening critical tests. */
  weakenTestsForbidden: true;
  /** Author may not self-approve. */
  authorSelfApproveForbidden: true;
};

export type RepairPlanEvidence = {
  planId: string;
  sourceRevision: string;
  worktreeId: string;
  leaseId: string;
  scopeSummary: string;
};

export type PatchAndTestEvidence = {
  diffId: string;
  diffSummary: string;
  regressionSuiteId: string;
  regressionPassed: boolean;
  attemptLedgerId: string;
  attemptCount: number;
};

export type IndependentReviewEvidence = {
  reviewId: string;
  /** Independent reviewer (not the author). */
  reviewerId: string;
  authorId: string;
  decision: "APPROVED" | "STANDING_AUTHORITY_VERIFIED";
  policyDecisionId: string;
};

export type CanaryReleaseEvidence = {
  canaryReleaseId: string;
  readBackId: string;
  readBackMatched: boolean;
  repeatedJourneyTestId: string;
  repeatedJourneyPassed: boolean;
};

export type CloseOutcomeEvidence = {
  closeId: string;
  outcome: "VERIFIED_RESOLUTION" | "ACKNOWLEDGED_HUMAN_HANDOFF" | "ROLLED_BACK";
  handoffAcknowledged: boolean;
  resolutionNote: string;
};

export type DiagnoseAndRepairPermittedDefectInput = {
  packageId: string;
  incident: IncidentBundleEvidence | null;
  sourceBinding: SourceBindingEvidence | null;
  repairPolicy: BoundedRepairPolicy | null;
  repairPlan: RepairPlanEvidence | null;
  patchAndTests: PatchAndTestEvidence | null;
  independentReview: IndependentReviewEvidence | null;
  canaryRelease: CanaryReleaseEvidence | null;
  closeOutcome: CloseOutcomeEvidence | null;
  /** Claim the F21 path is live-verified — must refuse offline. */
  claimLiveVerifiedRepair: boolean;
  /** Request live CMS repair apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * Attempt to weaken / disable a critical regression test — must refuse
   * (T-X010 / T-US-042 territory).
   */
  requestWeakenTest: boolean;
};

export type DiagnoseAndRepairPermittedDefectDecision =
  | {
      allowed: true;
      code: "DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_EVIDENCE_RECORDED";
      defectRecoveredOrEscalatedRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        incidentId: string;
        affectedJourneyIds: string[];
        firstFailureIso: string;
        lastFailureIso: string;
        relatedReleaseIds: string[];
        businessImpactSummary: string;
        bindingId: string;
        sourceRootId: string;
        policyId: string;
        maxAttempts: number;
        planId: string;
        sourceRevision: string;
        worktreeId: string;
        leaseId: string;
        diffId: string;
        regressionSuiteId: string;
        regressionPassed: true;
        attemptLedgerId: string;
        attemptCount: number;
        reviewId: string;
        reviewerId: string;
        authorId: string;
        reviewDecision: IndependentReviewEvidence["decision"];
        policyDecisionId: string;
        canaryReleaseId: string;
        readBackId: string;
        readBackMatched: true;
        repeatedJourneyTestId: string;
        repeatedJourneyPassed: true;
        closeId: string;
        closeOutcome: CloseOutcomeEvidence["outcome"];
        handoffAcknowledged: boolean;
        repairVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F21_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "DEFECT_RECOVERED_OR_ESCALATED";
        recoveryPath: "KEEP_FIXTURE_REPAIR_NO_LIVE_CMS";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "INCIDENT_BUNDLE_REQUIRED"
        | "SOURCE_BINDING_REQUIRED"
        | "BOUNDED_REPAIR_POLICY_REQUIRED"
        | "REPAIR_PLAN_REQUIRED"
        | "PATCH_AND_TESTS_REQUIRED"
        | "INDEPENDENT_REVIEW_REQUIRED"
        | "AUTHOR_SELF_APPROVE_REFUSED"
        | "CANARY_RELEASE_REQUIRED"
        | "CLOSE_OUTCOME_REQUIRED"
        | "HANDOFF_ACKNOWLEDGEMENT_REQUIRED"
        | "WEAKEN_TEST_REFUSED"
        | "FALSE_LIVE_VERIFIED_REPAIR_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      defectRecoveredOrEscalatedRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        incidentId: string | null;
        affectedJourneyIds: string[];
        firstFailureIso: string | null;
        lastFailureIso: string | null;
        relatedReleaseIds: string[];
        businessImpactSummary: string | null;
        bindingId: string | null;
        sourceRootId: string | null;
        policyId: string | null;
        maxAttempts: number;
        planId: string | null;
        sourceRevision: string | null;
        worktreeId: string | null;
        leaseId: string | null;
        diffId: string | null;
        regressionSuiteId: string | null;
        regressionPassed: boolean;
        attemptLedgerId: string | null;
        attemptCount: number;
        reviewId: string | null;
        reviewerId: string | null;
        authorId: string | null;
        reviewDecision: IndependentReviewEvidence["decision"] | null;
        policyDecisionId: string | null;
        canaryReleaseId: string | null;
        readBackId: string | null;
        readBackMatched: boolean;
        repeatedJourneyTestId: string | null;
        repeatedJourneyPassed: boolean;
        closeId: string | null;
        closeOutcome: CloseOutcomeEvidence["outcome"] | null;
        handoffAcknowledged: boolean;
        repairVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_INCIDENT_BUNDLE"
          | "AWAITING_SOURCE_BINDING"
          | "AWAITING_BOUNDED_REPAIR_POLICY"
          | "AWAITING_REPAIR_PLAN"
          | "AWAITING_PATCH_AND_TESTS"
          | "AWAITING_INDEPENDENT_REVIEW"
          | "AWAITING_CANARY_RELEASE"
          | "AWAITING_CLOSE_OUTCOME";
        recoveryPath:
          | "OPEN_INCIDENT_AND_IMPACT"
          | "BIND_SOURCE_AND_ASSET_LIMIT"
          | "APPLY_BOUNDED_REPAIR_POLICY"
          | "REVIEW_REPAIR_SCOPE_AND_LEASE"
          | "RUN_PATCH_AND_REGRESSION"
          | "OBTAIN_INDEPENDENT_APPROVAL"
          | "RELEASE_CANARY_AND_RERUN_JOURNEY"
          | "CLOSE_RESOLVE_OR_ESCALATE"
          | "KEEP_FIXTURE_REPAIR_NO_LIVE_CMS"
          | "REFUSE_WEAKEN_TEST";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_RELATED_CASE_IDS = [
  "T-F21",
] as const;

function preservedInputCount(
  input: DiagnoseAndRepairPermittedDefectInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.incident?.incidentId.trim() ? 1 : 0) +
    (input.sourceBinding?.bindingId.trim() ? 1 : 0) +
    (input.repairPolicy?.policyId.trim() ? 1 : 0) +
    (input.repairPlan?.planId.trim() ? 1 : 0) +
    (input.patchAndTests?.diffId.trim() ? 1 : 0) +
    (input.independentReview?.reviewId.trim() ? 1 : 0) +
    (input.canaryRelease?.canaryReleaseId.trim() ? 1 : 0) +
    (input.closeOutcome?.closeId.trim() ? 1 : 0)
  );
}

function incidentOk(
  incident: IncidentBundleEvidence | null,
): incident is IncidentBundleEvidence {
  if (!incident) return false;
  return (
    incident.incidentId.trim().length > 0 &&
    incident.affectedJourneyIds.length > 0 &&
    incident.affectedJourneyIds.every((id) => id.trim().length > 0) &&
    incident.firstFailureIso.trim().length > 0 &&
    incident.lastFailureIso.trim().length > 0 &&
    incident.relatedReleaseIds.length > 0 &&
    incident.relatedReleaseIds.every((id) => id.trim().length > 0) &&
    incident.businessImpactSummary.trim().length > 0
  );
}

function bindingOk(
  binding: SourceBindingEvidence | null,
): binding is SourceBindingEvidence {
  if (!binding) return false;
  return (
    binding.bindingId.trim().length > 0 &&
    binding.sourceRootId.trim().length > 0 &&
    binding.assetLimit === "ONE_ASSET"
  );
}

function policyOk(
  policy: BoundedRepairPolicy | null,
): policy is BoundedRepairPolicy {
  if (!policy) return false;
  return (
    policy.policyId.trim().length > 0 &&
    Number.isFinite(policy.maxAttempts) &&
    policy.maxAttempts >= 1 &&
    policy.weakenTestsForbidden === true &&
    policy.authorSelfApproveForbidden === true
  );
}

function planOk(
  plan: RepairPlanEvidence | null,
): plan is RepairPlanEvidence {
  if (!plan) return false;
  return (
    plan.planId.trim().length > 0 &&
    plan.sourceRevision.trim().length > 0 &&
    plan.worktreeId.trim().length > 0 &&
    plan.leaseId.trim().length > 0 &&
    plan.scopeSummary.trim().length > 0
  );
}

function patchOk(
  patch: PatchAndTestEvidence | null,
  maxAttempts: number,
): patch is PatchAndTestEvidence {
  if (!patch) return false;
  return (
    patch.diffId.trim().length > 0 &&
    patch.diffSummary.trim().length > 0 &&
    patch.regressionSuiteId.trim().length > 0 &&
    patch.regressionPassed === true &&
    patch.attemptLedgerId.trim().length > 0 &&
    Number.isFinite(patch.attemptCount) &&
    patch.attemptCount >= 1 &&
    patch.attemptCount <= maxAttempts
  );
}

function reviewOk(
  review: IndependentReviewEvidence | null,
): review is IndependentReviewEvidence {
  if (!review) return false;
  if (
    !review.reviewId.trim() ||
    !review.reviewerId.trim() ||
    !review.authorId.trim() ||
    !review.policyDecisionId.trim()
  ) {
    return false;
  }
  if (review.reviewerId.trim() === review.authorId.trim()) {
    return false;
  }
  return (
    review.decision === "APPROVED" ||
    review.decision === "STANDING_AUTHORITY_VERIFIED"
  );
}

function canaryOk(
  canary: CanaryReleaseEvidence | null,
): canary is CanaryReleaseEvidence {
  if (!canary) return false;
  return (
    canary.canaryReleaseId.trim().length > 0 &&
    canary.readBackId.trim().length > 0 &&
    canary.readBackMatched === true &&
    canary.repeatedJourneyTestId.trim().length > 0 &&
    canary.repeatedJourneyPassed === true
  );
}

function closeOk(
  close: CloseOutcomeEvidence | null,
): close is CloseOutcomeEvidence {
  if (!close) return false;
  if (
    !close.closeId.trim() ||
    !close.resolutionNote.trim() ||
    (close.outcome !== "VERIFIED_RESOLUTION" &&
      close.outcome !== "ACKNOWLEDGED_HUMAN_HANDOFF" &&
      close.outcome !== "ROLLED_BACK")
  ) {
    return false;
  }
  if (
    close.outcome === "ACKNOWLEDGED_HUMAN_HANDOFF" &&
    close.handoffAcknowledged !== true
  ) {
    return false;
  }
  return true;
}

/**
 * Evaluate the T-F21 diagnose-and-repair-permitted-defect path offline.
 * Complete F21 evidence package → DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_EVIDENCE_RECORDED;
 * live CMS repair stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateDiagnoseAndRepairPermittedDefect(
  input: DiagnoseAndRepairPermittedDefectInput,
): DiagnoseAndRepairPermittedDefectDecision {
  const base = {
    defectRecoveredOrEscalatedRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const incident = input.incident;
  const binding = input.sourceBinding;
  const policy = input.repairPolicy;
  const plan = input.repairPlan;
  const patch = input.patchAndTests;
  const review = input.independentReview;
  const canary = input.canaryRelease;
  const close = input.closeOutcome;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_INCIDENT_BUNDLE"
      | "AWAITING_SOURCE_BINDING"
      | "AWAITING_BOUNDED_REPAIR_POLICY"
      | "AWAITING_REPAIR_PLAN"
      | "AWAITING_PATCH_AND_TESTS"
      | "AWAITING_INDEPENDENT_REVIEW"
      | "AWAITING_CANARY_RELEASE"
      | "AWAITING_CLOSE_OUTCOME",
    recoveryPath:
      | "OPEN_INCIDENT_AND_IMPACT"
      | "BIND_SOURCE_AND_ASSET_LIMIT"
      | "APPLY_BOUNDED_REPAIR_POLICY"
      | "REVIEW_REPAIR_SCOPE_AND_LEASE"
      | "RUN_PATCH_AND_REGRESSION"
      | "OBTAIN_INDEPENDENT_APPROVAL"
      | "RELEASE_CANARY_AND_RERUN_JOURNEY"
      | "CLOSE_RESOLVE_OR_ESCALATE"
      | "KEEP_FIXTURE_REPAIR_NO_LIVE_CMS"
      | "REFUSE_WEAKEN_TEST",
  ): NonNullable<
    Extract<
      DiagnoseAndRepairPermittedDefectDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    incidentId: incident?.incidentId.trim() || null,
    affectedJourneyIds:
      incident?.affectedJourneyIds.map((id) => id.trim()) ?? [],
    firstFailureIso: incident?.firstFailureIso.trim() || null,
    lastFailureIso: incident?.lastFailureIso.trim() || null,
    relatedReleaseIds:
      incident?.relatedReleaseIds.map((id) => id.trim()) ?? [],
    businessImpactSummary: incident?.businessImpactSummary.trim() || null,
    bindingId: binding?.bindingId.trim() || null,
    sourceRootId: binding?.sourceRootId.trim() || null,
    policyId: policy?.policyId.trim() || null,
    maxAttempts: policy?.maxAttempts ?? 0,
    planId: plan?.planId.trim() || null,
    sourceRevision: plan?.sourceRevision.trim() || null,
    worktreeId: plan?.worktreeId.trim() || null,
    leaseId: plan?.leaseId.trim() || null,
    diffId: patch?.diffId.trim() || null,
    regressionSuiteId: patch?.regressionSuiteId.trim() || null,
    regressionPassed: patch?.regressionPassed === true,
    attemptLedgerId: patch?.attemptLedgerId.trim() || null,
    attemptCount: patch?.attemptCount ?? 0,
    reviewId: review?.reviewId.trim() || null,
    reviewerId: review?.reviewerId.trim() || null,
    authorId: review?.authorId.trim() || null,
    reviewDecision: review?.decision ?? null,
    policyDecisionId: review?.policyDecisionId.trim() || null,
    canaryReleaseId: canary?.canaryReleaseId.trim() || null,
    readBackId: canary?.readBackId.trim() || null,
    readBackMatched: canary?.readBackMatched === true,
    repeatedJourneyTestId: canary?.repeatedJourneyTestId.trim() || null,
    repeatedJourneyPassed: canary?.repeatedJourneyPassed === true,
    closeId: close?.closeId.trim() || null,
    closeOutcome: close?.outcome ?? null,
    handoffAcknowledged: close?.handoffAcknowledged === true,
    repairVerifiedLive: false,
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
      evidence: blockedEvidence(
        "LIVE_CMS_REPAIR_NOT_WIRED",
        "BLOCKED",
        "KEEP_FIXTURE_REPAIR_NO_LIVE_CMS",
      ),
      reasons: [
        "Live CMS repair wiring is NOT_WIRED for offline fixture soak",
      ],
    };
  }

  if (input.claimLiveVerifiedRepair) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_REPAIR_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "FALSE_LIVE_VERIFIED_REPAIR_REFUSED",
        "BLOCKED",
        "KEEP_FIXTURE_REPAIR_NO_LIVE_CMS",
      ),
      reasons: [
        "Cannot claim live VERIFIED repair from offline fixture evidence",
      ],
    };
  }

  if (input.requestWeakenTest) {
    return {
      allowed: false,
      code: "WEAKEN_TEST_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "WEAKEN_TEST_REFUSED",
        "BLOCKED",
        "REFUSE_WEAKEN_TEST",
      ),
      reasons: [
        "Repair must not weaken or disable critical regression tests",
      ],
    };
  }

  if (!incidentOk(incident)) {
    return {
      allowed: false,
      code: "INCIDENT_BUNDLE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INCIDENT_BUNDLE_REQUIRED",
        "AWAITING_INCIDENT_BUNDLE",
        "OPEN_INCIDENT_AND_IMPACT",
      ),
      reasons: [
        "Incident bundle with journeys, failures, releases, and impact required",
      ],
    };
  }

  if (!bindingOk(binding)) {
    return {
      allowed: false,
      code: "SOURCE_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SOURCE_BINDING_REQUIRED",
        "AWAITING_SOURCE_BINDING",
        "BIND_SOURCE_AND_ASSET_LIMIT",
      ),
      reasons: ["Source binding with one-asset limit required"],
    };
  }

  if (!policyOk(policy)) {
    return {
      allowed: false,
      code: "BOUNDED_REPAIR_POLICY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BOUNDED_REPAIR_POLICY_REQUIRED",
        "AWAITING_BOUNDED_REPAIR_POLICY",
        "APPLY_BOUNDED_REPAIR_POLICY",
      ),
      reasons: [
        "Bounded repair policy (max attempts, no weaken, no self-approve) required",
      ],
    };
  }

  if (!planOk(plan)) {
    return {
      allowed: false,
      code: "REPAIR_PLAN_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "REPAIR_PLAN_REQUIRED",
        "AWAITING_REPAIR_PLAN",
        "REVIEW_REPAIR_SCOPE_AND_LEASE",
      ),
      reasons: [
        "Repair plan with source revision, worktree, and lease required",
      ],
    };
  }

  if (!patchOk(patch, policy.maxAttempts)) {
    return {
      allowed: false,
      code: "PATCH_AND_TESTS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PATCH_AND_TESTS_REQUIRED",
        "AWAITING_PATCH_AND_TESTS",
        "RUN_PATCH_AND_REGRESSION",
      ),
      reasons: [
        "Patch diff, passing regression, and attempt ledger within max attempts required",
      ],
    };
  }

  if (
    review &&
    review.reviewerId.trim() &&
    review.authorId.trim() &&
    review.reviewerId.trim() === review.authorId.trim()
  ) {
    return {
      allowed: false,
      code: "AUTHOR_SELF_APPROVE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "AUTHOR_SELF_APPROVE_REFUSED",
        "AWAITING_INDEPENDENT_REVIEW",
        "OBTAIN_INDEPENDENT_APPROVAL",
      ),
      reasons: ["Author cannot approve their own repair"],
    };
  }

  if (!reviewOk(review)) {
    return {
      allowed: false,
      code: "INDEPENDENT_REVIEW_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INDEPENDENT_REVIEW_REQUIRED",
        "AWAITING_INDEPENDENT_REVIEW",
        "OBTAIN_INDEPENDENT_APPROVAL",
      ),
      reasons: [
        "Independent review or verified standing authority (not author) required",
      ],
    };
  }

  if (!canaryOk(canary)) {
    return {
      allowed: false,
      code: "CANARY_RELEASE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CANARY_RELEASE_REQUIRED",
        "AWAITING_CANARY_RELEASE",
        "RELEASE_CANARY_AND_RERUN_JOURNEY",
      ),
      reasons: [
        "Canary release with matching read-back and passing repeated journey required",
      ],
    };
  }

  if (
    close &&
    close.outcome === "ACKNOWLEDGED_HUMAN_HANDOFF" &&
    close.handoffAcknowledged !== true
  ) {
    return {
      allowed: false,
      code: "HANDOFF_ACKNOWLEDGEMENT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "HANDOFF_ACKNOWLEDGEMENT_REQUIRED",
        "AWAITING_CLOSE_OUTCOME",
        "CLOSE_RESOLVE_OR_ESCALATE",
      ),
      reasons: ["Human handoff close requires acknowledgement"],
    };
  }

  if (!closeOk(close)) {
    return {
      allowed: false,
      code: "CLOSE_OUTCOME_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CLOSE_OUTCOME_REQUIRED",
        "AWAITING_CLOSE_OUTCOME",
        "CLOSE_RESOLVE_OR_ESCALATE",
      ),
      reasons: [
        "Close with verified resolution, acknowledged handoff, or rollback required",
      ],
    };
  }

  return {
    allowed: true,
    code: "DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT_EVIDENCE_RECORDED",
    defectRecoveredOrEscalatedRecorded: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    productionWrites: false,
    evidence: {
      packageId: input.packageId.trim(),
      incidentId: incident.incidentId.trim(),
      affectedJourneyIds: incident.affectedJourneyIds.map((id) => id.trim()),
      firstFailureIso: incident.firstFailureIso.trim(),
      lastFailureIso: incident.lastFailureIso.trim(),
      relatedReleaseIds: incident.relatedReleaseIds.map((id) => id.trim()),
      businessImpactSummary: incident.businessImpactSummary.trim(),
      bindingId: binding.bindingId.trim(),
      sourceRootId: binding.sourceRootId.trim(),
      policyId: policy.policyId.trim(),
      maxAttempts: policy.maxAttempts,
      planId: plan.planId.trim(),
      sourceRevision: plan.sourceRevision.trim(),
      worktreeId: plan.worktreeId.trim(),
      leaseId: plan.leaseId.trim(),
      diffId: patch.diffId.trim(),
      regressionSuiteId: patch.regressionSuiteId.trim(),
      regressionPassed: true,
      attemptLedgerId: patch.attemptLedgerId.trim(),
      attemptCount: patch.attemptCount,
      reviewId: review.reviewId.trim(),
      reviewerId: review.reviewerId.trim(),
      authorId: review.authorId.trim(),
      reviewDecision: review.decision,
      policyDecisionId: review.policyDecisionId.trim(),
      canaryReleaseId: canary.canaryReleaseId.trim(),
      readBackId: canary.readBackId.trim(),
      readBackMatched: true,
      repeatedJourneyTestId: canary.repeatedJourneyTestId.trim(),
      repeatedJourneyPassed: true,
      closeId: close.closeId.trim(),
      closeOutcome: close.outcome,
      handoffAcknowledged: close.handoffAcknowledged === true,
      repairVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F21_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "DEFECT_RECOVERED_OR_ESCALATED",
      recoveryPath: "KEEP_FIXTURE_REPAIR_NO_LIVE_CMS",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F21 evidence package recorded; original journey recovered or safely escalated (fixture only)",
    ],
  };
}
