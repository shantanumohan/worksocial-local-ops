/**
 * T-US-051 — Design/release readiness (F26/SC-23) — release acceptance packet.
 *
 * Offline fixture gate (happy-path family): calibrate design and release
 * readiness by assembling a release acceptance packet with test context,
 * interaction trace, accessibility findings, state coverage matrix, and a
 * coverage register for SC-01 through SC-25. Approve a release only with
 * outcome evidence. Incomplete coverage and evidence-free approvals are
 * refused. Live provider wiring stays NOT_WIRED. Pure domain — no network
 * I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-035 (review/revise/release of one change), T-US-049
 * (daily owner review operating knowledge), and T-US-055 (keyboard journey
 * with reduced motion).
 */

/** Screen ids that must appear in the coverage register (SC-01..SC-25). */
export const REQUIRED_SCREEN_IDS = [
  "SC-01",
  "SC-02",
  "SC-03",
  "SC-04",
  "SC-05",
  "SC-06",
  "SC-07",
  "SC-08",
  "SC-09",
  "SC-10",
  "SC-11",
  "SC-12",
  "SC-13",
  "SC-14",
  "SC-15",
  "SC-16",
  "SC-17",
  "SC-18",
  "SC-19",
  "SC-20",
  "SC-21",
  "SC-22",
  "SC-23",
  "SC-24",
  "SC-25",
] as const;

export type RequiredScreenId = (typeof REQUIRED_SCREEN_IDS)[number];

export type UiStateKind =
  | "empty"
  | "loading"
  | "stale"
  | "partial"
  | "failed";

export const REQUIRED_UI_STATES: readonly UiStateKind[] = [
  "empty",
  "loading",
  "stale",
  "partial",
  "failed",
] as const;

export type DesignTestContext = {
  roleId: string;
  viewport: string;
  keyboardMode: string;
  theme: string;
};

export type InteractionTraceStep = {
  stepId: string;
  action: string;
  screenId: string;
};

export type AccessibilityFinding = {
  findingId: string;
  severity: "info" | "warn" | "blocker";
  summary: string;
  /** Blockers must be resolved before packet approval. */
  resolved: boolean;
};

export type StateCoverageEntry = {
  state: UiStateKind;
  /** Example artifact or observation id proving the state was reviewed. */
  evidenceId: string;
};

export type ScreenCoverageEntry = {
  screenId: RequiredScreenId;
  routeVerified: boolean;
};

export type ReleaseAcceptancePacket = {
  packetId: string;
  /** Outcome evidence id that justifies approving a release. */
  outcomeEvidenceId: string;
  /** Human-readable release decision summary. */
  decisionSummary: string;
};

export type DesignReleaseReadinessInput = {
  calibrationId: string;
  testContext: DesignTestContext;
  interactionTrace: readonly InteractionTraceStep[];
  accessibilityFindings: readonly AccessibilityFinding[];
  stateCoverage: readonly StateCoverageEntry[];
  coverageRegister: readonly ScreenCoverageEntry[];
  releaseAcceptancePacket: ReleaseAcceptancePacket;
  /**
   * Attempt to approve the release while omitting outcome evidence —
   * refused.
   */
  approveWithoutOutcomeEvidence: boolean;
  /** Claim the calibration is live-verified — must refuse offline. */
  claimLiveVerifiedCalibration: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /** Attempt a production write from the calibration surface — refuse. */
  attemptProductionWrite: boolean;
};

export type DesignReleaseReadinessDecision =
  | {
      allowed: true;
      code: "DESIGN_RELEASE_READINESS_PACKET_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        calibrationId: string;
        packetId: string;
        outcomeEvidenceId: string;
        roleId: string;
        viewport: string;
        keyboardMode: string;
        theme: string;
        interactionStepCount: number;
        accessibilityFindingCount: number;
        unresolvedBlockerCount: 0;
        stateCoverageCount: number;
        screenCoverageCount: number;
        requiredScreenCount: number;
        allScreensCovered: true;
        allRequiredStatesCovered: true;
        calibrationVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "RELEASE_ACCEPTANCE_PACKET_COMPLETE";
        currentState: "DESIGN_RELEASE_READINESS_RECORDED";
        recoveryPath: "TRACK_RELEASE_ACCEPTANCE_PACKET";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "TEST_CONTEXT_REQUIRED"
        | "INTERACTION_TRACE_REQUIRED"
        | "ACCESSIBILITY_FINDINGS_REQUIRED"
        | "ACCESSIBILITY_BLOCKER_UNRESOLVED"
        | "STATE_COVERAGE_INCOMPLETE"
        | "SCREEN_COVERAGE_INCOMPLETE"
        | "RELEASE_PACKET_REQUIRED"
        | "OUTCOME_EVIDENCE_REQUIRED"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_CALIBRATION_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        calibrationId: string | null;
        packetId: string | null;
        outcomeEvidenceId: string | null;
        roleId: string | null;
        viewport: string | null;
        keyboardMode: string | null;
        theme: string | null;
        interactionStepCount: number;
        accessibilityFindingCount: number;
        unresolvedBlockerCount: number;
        stateCoverageCount: number;
        screenCoverageCount: number;
        requiredScreenCount: number;
        allScreensCovered: boolean;
        allRequiredStatesCovered: boolean;
        calibrationVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_TEST_CONTEXT"
          | "AWAITING_INTERACTION_TRACE"
          | "AWAITING_ACCESSIBILITY"
          | "AWAITING_STATE_COVERAGE"
          | "AWAITING_SCREEN_COVERAGE"
          | "AWAITING_RELEASE_PACKET"
          | "AWAITING_OUTCOME_EVIDENCE";
        recoveryPath:
          | "COMPLETE_TEST_CONTEXT"
          | "WALK_CONFIGURE_TO_OUTCOME_PATH"
          | "RESOLVE_ACCESSIBILITY_FINDINGS"
          | "COVER_EMPTY_LOADING_STALE_PARTIAL_FAILED"
          | "VERIFY_ALL_SC_01_TO_SC_25"
          | "ATTACH_OUTCOME_EVIDENCE_BEFORE_APPROVE";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const DESIGN_RELEASE_READINESS_RELATED_CASE_IDS = [
  "T-US-051",
  "T-F26",
] as const;

function preservedInputCount(input: DesignReleaseReadinessInput): number {
  return (
    (input.calibrationId.trim() ? 1 : 0) +
    (input.testContext.roleId.trim() ? 1 : 0) +
    (input.interactionTrace.length > 0 ? 1 : 0) +
    (input.accessibilityFindings.length > 0 ? 1 : 0) +
    (input.stateCoverage.length > 0 ? 1 : 0) +
    (input.coverageRegister.length > 0 ? 1 : 0) +
    (input.releaseAcceptancePacket.packetId.trim() ? 1 : 0)
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
  entries: readonly StateCoverageEntry[],
): boolean {
  const covered = coveredStates(entries);
  return REQUIRED_UI_STATES.every((s) => covered.has(s));
}

function allScreensCovered(
  register: readonly ScreenCoverageEntry[],
): boolean {
  const byId = new Map(register.map((e) => [e.screenId, e]));
  return REQUIRED_SCREEN_IDS.every((id) => {
    const entry = byId.get(id);
    return entry !== undefined && entry.routeVerified;
  });
}

/**
 * Evaluate the F26 design/release readiness path offline.
 * Complete release acceptance packet → DESIGN_RELEASE_READINESS_PACKET_RECORDED;
 * live stays NOT_WIRED; incomplete coverage and false live claims refused.
 */
export function evaluateDesignReleaseReadiness(
  input: DesignReleaseReadinessInput,
): DesignReleaseReadinessDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const unresolvedBlockers = input.accessibilityFindings.filter(
    (f) => f.severity === "blocker" && !f.resolved,
  ).length;
  const screensOk = allScreensCovered(input.coverageRegister);
  const statesOk = allRequiredStatesCovered(input.stateCoverage);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_TEST_CONTEXT"
      | "AWAITING_INTERACTION_TRACE"
      | "AWAITING_ACCESSIBILITY"
      | "AWAITING_STATE_COVERAGE"
      | "AWAITING_SCREEN_COVERAGE"
      | "AWAITING_RELEASE_PACKET"
      | "AWAITING_OUTCOME_EVIDENCE",
    recoveryPath:
      | "COMPLETE_TEST_CONTEXT"
      | "WALK_CONFIGURE_TO_OUTCOME_PATH"
      | "RESOLVE_ACCESSIBILITY_FINDINGS"
      | "COVER_EMPTY_LOADING_STALE_PARTIAL_FAILED"
      | "VERIFY_ALL_SC_01_TO_SC_25"
      | "ATTACH_OUTCOME_EVIDENCE_BEFORE_APPROVE",
  ): NonNullable<
    Extract<DesignReleaseReadinessDecision, { allowed: false }>["evidence"]
  > => ({
    calibrationId: input.calibrationId.trim() || null,
    packetId: input.releaseAcceptancePacket.packetId.trim() || null,
    outcomeEvidenceId:
      input.releaseAcceptancePacket.outcomeEvidenceId.trim() || null,
    roleId: input.testContext.roleId.trim() || null,
    viewport: input.testContext.viewport.trim() || null,
    keyboardMode: input.testContext.keyboardMode.trim() || null,
    theme: input.testContext.theme.trim() || null,
    interactionStepCount: input.interactionTrace.length,
    accessibilityFindingCount: input.accessibilityFindings.length,
    unresolvedBlockerCount: unresolvedBlockers,
    stateCoverageCount: input.stateCoverage.length,
    screenCoverageCount: input.coverageRegister.length,
    requiredScreenCount: REQUIRED_SCREEN_IDS.length,
    allScreensCovered: screensOk,
    allRequiredStatesCovered: statesOk,
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
        "Live design/release readiness provider wiring remains NOT_WIRED — refuse live wiring (T-US-051)",
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
        "Refused false live-verified design/release readiness claim offline (T-US-051) — fixture ACCEPTED ≠ VERIFIED",
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
        "Design/release readiness must not perform production writes offline (T-US-051)",
      ],
    };
  }

  const ctx = input.testContext;
  if (
    !input.calibrationId.trim() ||
    !ctx.roleId.trim() ||
    !ctx.viewport.trim() ||
    !ctx.keyboardMode.trim() ||
    !ctx.theme.trim()
  ) {
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
        "Calibration requires role, viewport, keyboard mode, and theme (T-US-051)",
      ],
    };
  }

  if (
    input.interactionTrace.length === 0 ||
    input.interactionTrace.some(
      (s) => !s.stepId.trim() || !s.action.trim() || !s.screenId.trim(),
    )
  ) {
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
        "Release readiness requires a configure-to-outcome interaction trace (T-US-051)",
      ],
    };
  }

  if (
    input.accessibilityFindings.length === 0 ||
    input.accessibilityFindings.some(
      (f) => !f.findingId.trim() || !f.summary.trim(),
    )
  ) {
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
        "Accessibility findings must be recorded before release acceptance (T-US-051)",
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
        "Unresolved accessibility blockers refuse release acceptance (T-US-051)",
      ],
    };
  }

  if (!statesOk) {
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
        "State coverage matrix must include empty, loading, stale, partial, and failed (T-US-051)",
      ],
    };
  }

  if (!screensOk) {
    return {
      allowed: false,
      code: "SCREEN_COVERAGE_INCOMPLETE",
      ...base,
      evidence: blockedEvidence(
        "SCREEN_COVERAGE_MISSING_SC_01_TO_SC_25",
        "AWAITING_SCREEN_COVERAGE",
        "VERIFY_ALL_SC_01_TO_SC_25",
      ),
      reasons: [
        "Coverage register must route-verify every SC-01 through SC-25 screen (T-US-051)",
      ],
    };
  }

  const packet = input.releaseAcceptancePacket;
  if (!packet.packetId.trim() || !packet.decisionSummary.trim()) {
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
        "Release acceptance packet requires packet id and decision summary (T-US-051)",
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
        "Approve a release only with outcome evidence — refuse evidence-free approval (T-US-051)",
      ],
    };
  }

  return {
    allowed: true,
    code: "DESIGN_RELEASE_READINESS_PACKET_RECORDED",
    ...base,
    evidence: {
      calibrationId: input.calibrationId.trim(),
      packetId: packet.packetId.trim(),
      outcomeEvidenceId: packet.outcomeEvidenceId.trim(),
      roleId: ctx.roleId.trim(),
      viewport: ctx.viewport.trim(),
      keyboardMode: ctx.keyboardMode.trim(),
      theme: ctx.theme.trim(),
      interactionStepCount: input.interactionTrace.length,
      accessibilityFindingCount: input.accessibilityFindings.length,
      unresolvedBlockerCount: 0,
      stateCoverageCount: input.stateCoverage.length,
      screenCoverageCount: input.coverageRegister.length,
      requiredScreenCount: REQUIRED_SCREEN_IDS.length,
      allScreensCovered: true,
      allRequiredStatesCovered: true,
      calibrationVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "RELEASE_ACCEPTANCE_PACKET_COMPLETE",
      currentState: "DESIGN_RELEASE_READINESS_RECORDED",
      recoveryPath: "TRACK_RELEASE_ACCEPTANCE_PACKET",
      preservedInputCount: preserved,
    },
    reasons: [
      "Design/release readiness recorded release acceptance packet with full SC-01..SC-25 coverage (T-US-051); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
