/**
 * T-F26 — Calibrate the design and release readiness (complete F26 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F26 evidence
 * package — working prototype + agreed acceptance cases (Given), test context
 * (role/viewport/keyboard/theme), configure-to-outcome interaction trace,
 * accessibility findings, dangerous-actions review, empty/loading/stale/
 * partial/failed state coverage, handoff-requirements vs implemented-behavior
 * comparison, SC-01..SC-25 route-state verification register, and a release
 * acceptance packet with outcome evidence. Incomplete packages, evidence-free
 * approvals, false live-verified claims, and live provider wiring are refused.
 * Live provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-051 (`DESIGN_RELEASE_READINESS_PACKET`) — this records the
 * complete F26 flow evidence package (structured package + Given prerequisites
 * + dangerous-actions review + handoff comparison + route-state verification),
 * not the release-acceptance-packet summary alone. Distinct from T-US-035
 * (review/revise/release), T-US-049 (daily owner review), and T-US-055
 * (keyboard journey).
 */

import {
  REQUIRED_SCREEN_IDS,
  REQUIRED_UI_STATES,
  type AccessibilityFinding,
  type DesignTestContext,
  type InteractionTraceStep,
  type ReleaseAcceptancePacket,
  type RequiredScreenId,
  type ScreenCoverageEntry,
  type StateCoverageEntry,
  type UiStateKind,
} from "./design-release-readiness.js";

export type WorkingPrototypeEvidence = {
  prototypeId: string;
  /** Working prototype or implementation label. */
  implementationLabel: string;
  /** Prototype is present and walkable offline. */
  walkable: boolean;
};

export type AgreedAcceptanceCase = {
  caseId: string;
  /** Agreed acceptance case title. */
  title: string;
};

export type DangerousActionReview = {
  reviewId: string;
  /** Dangerous actions inspected (confirm/undo/stop). */
  actionsReviewed: readonly string[];
  /** All reviewed dangerous actions have honest confirmation UX. */
  confirmationHonest: boolean;
};

export type HandoffRequirementsComparison = {
  comparisonId: string;
  /** Handoff requirements reviewed against implemented behavior. */
  requirementsCompared: boolean;
  /** Gaps remaining between handoff and implementation (0 = aligned). */
  openGapCount: number;
  summary: string;
};

export type RouteStateVerification = {
  screenId: RequiredScreenId;
  routeVerified: boolean;
  /** At least one UI state sample verified on this screen. */
  stateSampleVerified: boolean;
};

export type CalibrateDesignReleaseReadinessInput = {
  packageId: string;
  workingPrototype: WorkingPrototypeEvidence | null;
  agreedAcceptanceCases: readonly AgreedAcceptanceCase[] | null;
  testContext: DesignTestContext | null;
  interactionTrace: readonly InteractionTraceStep[] | null;
  accessibilityFindings: readonly AccessibilityFinding[] | null;
  dangerousActions: DangerousActionReview | null;
  stateCoverage: readonly StateCoverageEntry[] | null;
  handoffComparison: HandoffRequirementsComparison | null;
  routeStateRegister: readonly RouteStateVerification[] | null;
  /** Optional legacy coverage register — must align when present. */
  coverageRegister: readonly ScreenCoverageEntry[] | null;
  releaseAcceptancePacket: ReleaseAcceptancePacket | null;
  /**
   * Attempt to approve the release while omitting outcome evidence —
   * refused.
   */
  approveWithoutOutcomeEvidence: boolean;
  /** Claim the F26 path is live-verified — must refuse offline. */
  claimLiveVerifiedCalibration: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /** Attempt a production write from the calibration surface — refuse. */
  attemptProductionWrite: boolean;
};

export type CalibrateDesignReleaseReadinessDecision =
  | {
      allowed: true;
      code: "CALIBRATE_DESIGN_RELEASE_READINESS_EVIDENCE_RECORDED";
      designCalibratedRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        prototypeId: string;
        implementationLabel: string;
        agreedCaseIds: string[];
        roleId: string;
        viewport: string;
        keyboardMode: string;
        theme: string;
        interactionStepCount: number;
        accessibilityFindingCount: number;
        unresolvedBlockerCount: 0;
        dangerousActionReviewId: string;
        dangerousActionsReviewedCount: number;
        confirmationHonest: true;
        stateCoverageCount: number;
        allRequiredStatesCovered: true;
        handoffComparisonId: string;
        handoffOpenGapCount: 0;
        routeStateVerifiedCount: number;
        requiredScreenCount: number;
        allScreensRouteStateVerified: true;
        packetId: string;
        outcomeEvidenceId: string;
        calibrationVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F26_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "DESIGN_RELEASE_READINESS_CALIBRATED";
        recoveryPath: "KEEP_FIXTURE_CALIBRATION_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "WORKING_PROTOTYPE_REQUIRED"
        | "AGREED_ACCEPTANCE_CASES_REQUIRED"
        | "TEST_CONTEXT_REQUIRED"
        | "INTERACTION_TRACE_REQUIRED"
        | "ACCESSIBILITY_FINDINGS_REQUIRED"
        | "ACCESSIBILITY_BLOCKER_UNRESOLVED"
        | "DANGEROUS_ACTIONS_REVIEW_REQUIRED"
        | "STATE_COVERAGE_INCOMPLETE"
        | "HANDOFF_COMPARISON_REQUIRED"
        | "HANDOFF_GAPS_OPEN"
        | "ROUTE_STATE_REGISTER_INCOMPLETE"
        | "RELEASE_PACKET_REQUIRED"
        | "OUTCOME_EVIDENCE_REQUIRED"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_CALIBRATION_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      designCalibratedRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        prototypeId: string | null;
        implementationLabel: string | null;
        agreedCaseIds: string[];
        roleId: string | null;
        viewport: string | null;
        keyboardMode: string | null;
        theme: string | null;
        interactionStepCount: number;
        accessibilityFindingCount: number;
        unresolvedBlockerCount: number;
        dangerousActionReviewId: string | null;
        dangerousActionsReviewedCount: number;
        confirmationHonest: boolean;
        stateCoverageCount: number;
        allRequiredStatesCovered: boolean;
        handoffComparisonId: string | null;
        handoffOpenGapCount: number;
        routeStateVerifiedCount: number;
        requiredScreenCount: number;
        allScreensRouteStateVerified: boolean;
        packetId: string | null;
        outcomeEvidenceId: string | null;
        calibrationVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_WORKING_PROTOTYPE"
          | "AWAITING_AGREED_ACCEPTANCE_CASES"
          | "AWAITING_TEST_CONTEXT"
          | "AWAITING_INTERACTION_TRACE"
          | "AWAITING_ACCESSIBILITY"
          | "AWAITING_DANGEROUS_ACTIONS_REVIEW"
          | "AWAITING_STATE_COVERAGE"
          | "AWAITING_HANDOFF_COMPARISON"
          | "AWAITING_ROUTE_STATE_REGISTER"
          | "AWAITING_RELEASE_PACKET"
          | "AWAITING_OUTCOME_EVIDENCE";
        recoveryPath:
          | "PROVIDE_WORKING_PROTOTYPE"
          | "AGREE_ACCEPTANCE_CASES"
          | "COMPLETE_TEST_CONTEXT"
          | "WALK_CONFIGURE_TO_OUTCOME_PATH"
          | "RESOLVE_ACCESSIBILITY_FINDINGS"
          | "REVIEW_DANGEROUS_ACTIONS"
          | "COVER_EMPTY_LOADING_STALE_PARTIAL_FAILED"
          | "COMPARE_HANDOFF_TO_IMPLEMENTED_BEHAVIOR"
          | "VERIFY_ALL_SC_01_TO_SC_25_ROUTE_STATE"
          | "ATTACH_OUTCOME_EVIDENCE_BEFORE_APPROVE"
          | "KEEP_FIXTURE_CALIBRATION_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CALIBRATE_DESIGN_RELEASE_READINESS_RELATED_CASE_IDS = [
  "T-F26",
] as const;

function preservedInputCount(
  input: CalibrateDesignReleaseReadinessInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.workingPrototype?.prototypeId.trim() ? 1 : 0) +
    (input.agreedAcceptanceCases && input.agreedAcceptanceCases.length > 0
      ? 1
      : 0) +
    (input.testContext?.roleId.trim() ? 1 : 0) +
    (input.interactionTrace && input.interactionTrace.length > 0 ? 1 : 0) +
    (input.accessibilityFindings && input.accessibilityFindings.length > 0
      ? 1
      : 0) +
    (input.dangerousActions?.reviewId.trim() ? 1 : 0) +
    (input.stateCoverage && input.stateCoverage.length > 0 ? 1 : 0) +
    (input.handoffComparison?.comparisonId.trim() ? 1 : 0) +
    (input.routeStateRegister && input.routeStateRegister.length > 0 ? 1 : 0) +
    (input.releaseAcceptancePacket?.packetId.trim() ? 1 : 0)
  );
}

function prototypeOk(
  prototype: WorkingPrototypeEvidence | null,
): prototype is WorkingPrototypeEvidence {
  if (!prototype) return false;
  return (
    prototype.prototypeId.trim().length > 0 &&
    prototype.implementationLabel.trim().length > 0 &&
    prototype.walkable === true
  );
}

function agreedCasesOk(
  cases: readonly AgreedAcceptanceCase[] | null,
): cases is readonly AgreedAcceptanceCase[] {
  if (!cases || cases.length === 0) return false;
  return cases.every(
    (c) => c.caseId.trim().length > 0 && c.title.trim().length > 0,
  );
}

function testContextOk(
  ctx: DesignTestContext | null,
): ctx is DesignTestContext {
  if (!ctx) return false;
  return (
    ctx.roleId.trim().length > 0 &&
    ctx.viewport.trim().length > 0 &&
    ctx.keyboardMode.trim().length > 0 &&
    ctx.theme.trim().length > 0
  );
}

function interactionTraceOk(
  trace: readonly InteractionTraceStep[] | null,
): trace is readonly InteractionTraceStep[] {
  if (!trace || trace.length === 0) return false;
  return trace.every(
    (s) =>
      s.stepId.trim().length > 0 &&
      s.action.trim().length > 0 &&
      s.screenId.trim().length > 0,
  );
}

function accessibilityOk(
  findings: readonly AccessibilityFinding[] | null,
): findings is readonly AccessibilityFinding[] {
  if (!findings || findings.length === 0) return false;
  return findings.every(
    (f) => f.findingId.trim().length > 0 && f.summary.trim().length > 0,
  );
}

function dangerousActionsOk(
  review: DangerousActionReview | null,
): review is DangerousActionReview {
  if (!review) return false;
  return (
    review.reviewId.trim().length > 0 &&
    review.actionsReviewed.length > 0 &&
    review.actionsReviewed.every((a) => a.trim().length > 0) &&
    review.confirmationHonest === true
  );
}

function coveredStates(
  entries: readonly StateCoverageEntry[],
): Set<UiStateKind> {
  const set = new Set<UiStateKind>();
  for (const e of entries) {
    if (e.evidenceId.trim()) set.add(e.state);
  }
  return set;
}

function allRequiredStatesCovered(
  entries: readonly StateCoverageEntry[] | null,
): boolean {
  if (!entries || entries.length === 0) return false;
  const covered = coveredStates(entries);
  return REQUIRED_UI_STATES.every((s) => covered.has(s));
}

function handoffOk(
  comparison: HandoffRequirementsComparison | null,
): comparison is HandoffRequirementsComparison {
  if (!comparison) return false;
  return (
    comparison.comparisonId.trim().length > 0 &&
    comparison.requirementsCompared === true &&
    comparison.summary.trim().length > 0 &&
    Number.isFinite(comparison.openGapCount) &&
    comparison.openGapCount === 0
  );
}

function routeStateRegisterOk(
  register: readonly RouteStateVerification[] | null,
): register is readonly RouteStateVerification[] {
  if (!register || register.length === 0) return false;
  const byId = new Map(register.map((e) => [e.screenId, e]));
  return REQUIRED_SCREEN_IDS.every((id) => {
    const entry = byId.get(id);
    return (
      entry !== undefined &&
      entry.routeVerified === true &&
      entry.stateSampleVerified === true
    );
  });
}

function coverageRegisterAligned(
  routeState: readonly RouteStateVerification[],
  coverage: readonly ScreenCoverageEntry[] | null,
): boolean {
  if (!coverage) return true;
  const byId = new Map(coverage.map((e) => [e.screenId, e]));
  return routeState.every((r) => {
    const c = byId.get(r.screenId);
    return c === undefined || c.routeVerified === r.routeVerified;
  });
}

/**
 * Evaluate the T-F26 calibrate-design-release-readiness path offline.
 * Complete F26 evidence package → CALIBRATE_DESIGN_RELEASE_READINESS_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateCalibrateDesignReleaseReadiness(
  input: CalibrateDesignReleaseReadinessInput,
): CalibrateDesignReleaseReadinessDecision {
  const base = {
    designCalibratedRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const prototype = input.workingPrototype;
  const agreedCases = input.agreedAcceptanceCases;
  const ctx = input.testContext;
  const trace = input.interactionTrace;
  const findings = input.accessibilityFindings;
  const dangerous = input.dangerousActions;
  const states = input.stateCoverage;
  const handoff = input.handoffComparison;
  const routeState = input.routeStateRegister;
  const packet = input.releaseAcceptancePacket;
  const unresolvedBlockers =
    findings?.filter((f) => f.severity === "blocker" && !f.resolved).length ??
    0;
  const statesOk = allRequiredStatesCovered(states);
  const routeOk = routeStateRegisterOk(routeState);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_WORKING_PROTOTYPE"
      | "AWAITING_AGREED_ACCEPTANCE_CASES"
      | "AWAITING_TEST_CONTEXT"
      | "AWAITING_INTERACTION_TRACE"
      | "AWAITING_ACCESSIBILITY"
      | "AWAITING_DANGEROUS_ACTIONS_REVIEW"
      | "AWAITING_STATE_COVERAGE"
      | "AWAITING_HANDOFF_COMPARISON"
      | "AWAITING_ROUTE_STATE_REGISTER"
      | "AWAITING_RELEASE_PACKET"
      | "AWAITING_OUTCOME_EVIDENCE",
    recoveryPath:
      | "PROVIDE_WORKING_PROTOTYPE"
      | "AGREE_ACCEPTANCE_CASES"
      | "COMPLETE_TEST_CONTEXT"
      | "WALK_CONFIGURE_TO_OUTCOME_PATH"
      | "RESOLVE_ACCESSIBILITY_FINDINGS"
      | "REVIEW_DANGEROUS_ACTIONS"
      | "COVER_EMPTY_LOADING_STALE_PARTIAL_FAILED"
      | "COMPARE_HANDOFF_TO_IMPLEMENTED_BEHAVIOR"
      | "VERIFY_ALL_SC_01_TO_SC_25_ROUTE_STATE"
      | "ATTACH_OUTCOME_EVIDENCE_BEFORE_APPROVE"
      | "KEEP_FIXTURE_CALIBRATION_NO_LIVE_PROVIDER",
  ): NonNullable<
    Extract<
      CalibrateDesignReleaseReadinessDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    prototypeId: prototype?.prototypeId.trim() || null,
    implementationLabel: prototype?.implementationLabel.trim() || null,
    agreedCaseIds: agreedCases?.map((c) => c.caseId.trim()) ?? [],
    roleId: ctx?.roleId.trim() || null,
    viewport: ctx?.viewport.trim() || null,
    keyboardMode: ctx?.keyboardMode.trim() || null,
    theme: ctx?.theme.trim() || null,
    interactionStepCount: trace?.length ?? 0,
    accessibilityFindingCount: findings?.length ?? 0,
    unresolvedBlockerCount: unresolvedBlockers,
    dangerousActionReviewId: dangerous?.reviewId.trim() || null,
    dangerousActionsReviewedCount: dangerous?.actionsReviewed.length ?? 0,
    confirmationHonest: dangerous?.confirmationHonest === true,
    stateCoverageCount: states?.length ?? 0,
    allRequiredStatesCovered: statesOk,
    handoffComparisonId: handoff?.comparisonId.trim() || null,
    handoffOpenGapCount: handoff?.openGapCount ?? -1,
    routeStateVerifiedCount:
      routeState?.filter((r) => r.routeVerified && r.stateSampleVerified)
        .length ?? 0,
    requiredScreenCount: REQUIRED_SCREEN_IDS.length,
    allScreensRouteStateVerified: routeOk,
    packetId: packet?.packetId.trim() || null,
    outcomeEvidenceId: packet?.outcomeEvidenceId.trim() || null,
    calibrationVerifiedLive: false,
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
        "Live design/release readiness provider wiring remains NOT_WIRED — refuse live wiring (T-F26)",
      ],
    };
  }

  if (input.claimLiveVerifiedCalibration) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_CALIBRATION_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified design/release readiness claim offline (T-F26) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptProductionWrite) {
    return {
      allowed: false,
      code: "PRODUCTION_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_WRITE_FROM_CALIBRATION_REFUSED",
        "BLOCKED",
        "ATTACH_OUTCOME_EVIDENCE_BEFORE_APPROVE",
      ),
      reasons: [
        "Design/release readiness must not perform production writes offline (T-F26)",
      ],
    };
  }

  if (!input.packageId.trim() || !prototypeOk(prototype)) {
    return {
      allowed: false,
      code: "WORKING_PROTOTYPE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "WORKING_PROTOTYPE_INCOMPLETE",
        "AWAITING_WORKING_PROTOTYPE",
        "PROVIDE_WORKING_PROTOTYPE",
      ),
      reasons: [
        "F26 requires package id and a walkable working prototype/implementation (T-F26)",
      ],
    };
  }

  if (!agreedCasesOk(agreedCases)) {
    return {
      allowed: false,
      code: "AGREED_ACCEPTANCE_CASES_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "AGREED_ACCEPTANCE_CASES_INCOMPLETE",
        "AWAITING_AGREED_ACCEPTANCE_CASES",
        "AGREE_ACCEPTANCE_CASES",
      ),
      reasons: [
        "F26 requires agreed acceptance cases with caseId + title (T-F26)",
      ],
    };
  }

  if (!testContextOk(ctx)) {
    return {
      allowed: false,
      code: "TEST_CONTEXT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "TEST_CONTEXT_INCOMPLETE",
        "AWAITING_TEST_CONTEXT",
        "COMPLETE_TEST_CONTEXT",
      ),
      reasons: [
        "F26 calibration requires role, viewport, keyboard mode, and theme (T-F26)",
      ],
    };
  }

  if (!interactionTraceOk(trace)) {
    return {
      allowed: false,
      code: "INTERACTION_TRACE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CONFIGURE_TO_OUTCOME_TRACE_MISSING",
        "AWAITING_INTERACTION_TRACE",
        "WALK_CONFIGURE_TO_OUTCOME_PATH",
      ),
      reasons: [
        "F26 requires a configure-to-outcome interaction trace (T-F26)",
      ],
    };
  }

  if (!accessibilityOk(findings)) {
    return {
      allowed: false,
      code: "ACCESSIBILITY_FINDINGS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ACCESSIBILITY_FINDINGS_MISSING",
        "AWAITING_ACCESSIBILITY",
        "RESOLVE_ACCESSIBILITY_FINDINGS",
      ),
      reasons: [
        "F26 requires accessibility findings before release acceptance (T-F26)",
      ],
    };
  }

  if (unresolvedBlockers > 0) {
    return {
      allowed: false,
      code: "ACCESSIBILITY_BLOCKER_UNRESOLVED",
      ...base,
      evidence: blockedEvidence(
        "ACCESSIBILITY_BLOCKER_OPEN",
        "AWAITING_ACCESSIBILITY",
        "RESOLVE_ACCESSIBILITY_FINDINGS",
      ),
      reasons: [
        "Unresolved accessibility blockers refuse release acceptance (T-F26)",
      ],
    };
  }

  if (!dangerousActionsOk(dangerous)) {
    return {
      allowed: false,
      code: "DANGEROUS_ACTIONS_REVIEW_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DANGEROUS_ACTIONS_REVIEW_INCOMPLETE",
        "AWAITING_DANGEROUS_ACTIONS_REVIEW",
        "REVIEW_DANGEROUS_ACTIONS",
      ),
      reasons: [
        "F26 requires dangerous-actions review with honest confirmation UX (T-F26)",
      ],
    };
  }

  if (!statesOk || !states) {
    return {
      allowed: false,
      code: "STATE_COVERAGE_INCOMPLETE",
      ...base,
      evidence: blockedEvidence(
        "STATE_COVERAGE_MISSING_REQUIRED_STATES",
        "AWAITING_STATE_COVERAGE",
        "COVER_EMPTY_LOADING_STALE_PARTIAL_FAILED",
      ),
      reasons: [
        "F26 state coverage matrix must include empty, loading, stale, partial, and failed (T-F26)",
      ],
    };
  }

  if (!handoff || !handoff.comparisonId.trim() || !handoff.summary.trim()) {
    return {
      allowed: false,
      code: "HANDOFF_COMPARISON_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "HANDOFF_COMPARISON_INCOMPLETE",
        "AWAITING_HANDOFF_COMPARISON",
        "COMPARE_HANDOFF_TO_IMPLEMENTED_BEHAVIOR",
      ),
      reasons: [
        "F26 requires handoff-requirements vs implemented-behavior comparison (T-F26)",
      ],
    };
  }

  if (!handoffOk(handoff)) {
    return {
      allowed: false,
      code: "HANDOFF_GAPS_OPEN",
      ...base,
      evidence: blockedEvidence(
        "HANDOFF_REQUIREMENTS_GAPS_OPEN",
        "AWAITING_HANDOFF_COMPARISON",
        "COMPARE_HANDOFF_TO_IMPLEMENTED_BEHAVIOR",
      ),
      reasons: [
        "F26 refuses calibration while handoff-vs-implementation gaps remain open (T-F26)",
      ],
    };
  }

  if (
    !routeOk ||
    !routeState ||
    !coverageRegisterAligned(routeState, input.coverageRegister)
  ) {
    return {
      allowed: false,
      code: "ROUTE_STATE_REGISTER_INCOMPLETE",
      ...base,
      evidence: blockedEvidence(
        "ROUTE_STATE_REGISTER_MISSING_SC_01_TO_SC_25",
        "AWAITING_ROUTE_STATE_REGISTER",
        "VERIFY_ALL_SC_01_TO_SC_25_ROUTE_STATE",
      ),
      reasons: [
        "F26 requires route+state verification for every SC-01 through SC-25 screen (T-F26)",
      ],
    };
  }

  if (!packet || !packet.packetId.trim() || !packet.decisionSummary.trim()) {
    return {
      allowed: false,
      code: "RELEASE_PACKET_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "RELEASE_ACCEPTANCE_PACKET_INCOMPLETE",
        "AWAITING_RELEASE_PACKET",
        "ATTACH_OUTCOME_EVIDENCE_BEFORE_APPROVE",
      ),
      reasons: [
        "F26 release acceptance packet requires packet id and decision summary (T-F26)",
      ],
    };
  }

  if (
    input.approveWithoutOutcomeEvidence ||
    !packet.outcomeEvidenceId.trim()
  ) {
    return {
      allowed: false,
      code: "OUTCOME_EVIDENCE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "APPROVE_WITHOUT_OUTCOME_EVIDENCE_REFUSED",
        "AWAITING_OUTCOME_EVIDENCE",
        "ATTACH_OUTCOME_EVIDENCE_BEFORE_APPROVE",
      ),
      reasons: [
        "Approve a release only with outcome evidence — refuse evidence-free approval (T-F26)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CALIBRATE_DESIGN_RELEASE_READINESS_EVIDENCE_RECORDED",
    ...base,
    designCalibratedRecorded: true,
    evidence: {
      packageId: input.packageId.trim(),
      prototypeId: prototype.prototypeId.trim(),
      implementationLabel: prototype.implementationLabel.trim(),
      agreedCaseIds: agreedCases.map((c) => c.caseId.trim()),
      roleId: ctx.roleId.trim(),
      viewport: ctx.viewport.trim(),
      keyboardMode: ctx.keyboardMode.trim(),
      theme: ctx.theme.trim(),
      interactionStepCount: trace.length,
      accessibilityFindingCount: findings.length,
      unresolvedBlockerCount: 0,
      dangerousActionReviewId: dangerous.reviewId.trim(),
      dangerousActionsReviewedCount: dangerous.actionsReviewed.length,
      confirmationHonest: true,
      stateCoverageCount: states.length,
      allRequiredStatesCovered: true,
      handoffComparisonId: handoff.comparisonId.trim(),
      handoffOpenGapCount: 0,
      routeStateVerifiedCount: REQUIRED_SCREEN_IDS.length,
      requiredScreenCount: REQUIRED_SCREEN_IDS.length,
      allScreensRouteStateVerified: true,
      packetId: packet.packetId.trim(),
      outcomeEvidenceId: packet.outcomeEvidenceId.trim(),
      calibrationVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F26_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "DESIGN_RELEASE_READINESS_CALIBRATED",
      recoveryPath: "KEEP_FIXTURE_CALIBRATION_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F26 evidence package recorded (working prototype, agreed acceptance cases, test context, configure-to-outcome trace, accessibility, dangerous-actions review, state coverage, handoff comparison, SC-01..SC-25 route-state register, release acceptance packet with outcome evidence); live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}

export type {
  AccessibilityFinding,
  DesignTestContext,
  InteractionTraceStep,
  ReleaseAcceptancePacket,
  RequiredScreenId,
  ScreenCoverageEntry,
  StateCoverageEntry,
  UiStateKind,
};
export { REQUIRED_SCREEN_IDS, REQUIRED_UI_STATES };
