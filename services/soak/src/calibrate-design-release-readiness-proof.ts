/**
 * Fixture proof for T-F26 — Calibrate the design and release readiness.
 * Complete F26 evidence package: working prototype, agreed acceptance cases,
 * test context, configure-to-outcome trace, accessibility, dangerous-actions
 * review, state coverage, handoff comparison, SC-01..SC-25 route-state
 * register, release acceptance packet with outcome evidence; unsafe claims
 * refused; live providers NOT_WIRED. Distinct from T-US-051 packet summary,
 * T-US-035 review/revise/release, T-US-049 daily owner review, and T-US-055
 * keyboard journey. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  REQUIRED_SCREEN_IDS,
  REQUIRED_UI_STATES,
  SoakProofKind,
  evaluateCalibrateDesignReleaseReadiness,
  type CalibrateDesignReleaseReadinessInput,
  type RouteStateVerification,
  type SoakProofRecord,
  type StateCoverageEntry,
} from "@worksocial/domain";

function fullRouteStateRegister(): RouteStateVerification[] {
  return REQUIRED_SCREEN_IDS.map((screenId) => ({
    screenId,
    routeVerified: true,
    stateSampleVerified: true,
  }));
}

function fullStateCoverage(): StateCoverageEntry[] {
  return REQUIRED_UI_STATES.map((state) => ({
    state,
    evidenceId: `state-${state}-obs`,
  }));
}

function baseInput(
  overrides: Partial<CalibrateDesignReleaseReadinessInput> = {},
): CalibrateDesignReleaseReadinessInput {
  return {
    packageId: "pkg-f26-soak",
    workingPrototype: {
      prototypeId: "proto-f26-soak",
      implementationLabel: "local controlled stack prototype",
      walkable: true,
    },
    agreedAcceptanceCases: [
      { caseId: "T-F26", title: "Calibrate the design and release readiness" },
      { caseId: "T-US-051", title: "Design/release readiness packet" },
    ],
    testContext: {
      roleId: "A25",
      viewport: "1280x800",
      keyboardMode: "full-keyboard",
      theme: "light",
    },
    interactionTrace: [
      {
        stepId: "step-1",
        action: "open workspace configure",
        screenId: "SC-02",
      },
      {
        stepId: "step-2",
        action: "complete demand to page path",
        screenId: "SC-23",
      },
      {
        stepId: "step-3",
        action: "observe mission outcome",
        screenId: "SC-01",
      },
    ],
    accessibilityFindings: [
      {
        findingId: "a11y-1",
        severity: "info",
        summary: "Focus order verified on SC-23",
        resolved: true,
      },
    ],
    dangerousActions: {
      reviewId: "danger-f26-soak",
      actionsReviewed: ["stop-writes", "emergency-stop", "approve-release"],
      confirmationHonest: true,
    },
    stateCoverage: fullStateCoverage(),
    handoffComparison: {
      comparisonId: "handoff-f26-soak",
      requirementsCompared: true,
      openGapCount: 0,
      summary: "Handoff requirements match implemented configure-to-outcome path",
    },
    routeStateRegister: fullRouteStateRegister(),
    coverageRegister: REQUIRED_SCREEN_IDS.map((screenId) => ({
      screenId,
      routeVerified: true,
    })),
    releaseAcceptancePacket: {
      packetId: "packet-rel-f26-soak",
      outcomeEvidenceId: "outcome-obs-f26-hours-release",
      decisionSummary: "Approve release with outcome evidence packet",
    },
    approveWithoutOutcomeEvidence: false,
    claimLiveVerifiedCalibration: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F26 fixture ACCEPTED.
 */
export function proofCalibrateDesignReleaseReadiness(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateCalibrateDesignReleaseReadiness(baseInput());
  if (
    happy.allowed &&
    happy.code === "CALIBRATE_DESIGN_RELEASE_READINESS_EVIDENCE_RECORDED" &&
    happy.evidence.calibrationVerifiedLive === false &&
    happy.designCalibratedRecorded === true &&
    happy.evidence.allScreensRouteStateVerified === true &&
    happy.evidence.allRequiredStatesCovered === true &&
    happy.evidence.handoffOpenGapCount === 0 &&
    happy.evidence.confirmationHonest === true &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F26 evidence package → CALIBRATE_DESIGN_RELEASE_READINESS_EVIDENCE_RECORDED; working prototype; agreed acceptance cases; test context; configure-to-outcome trace; accessibility; dangerous-actions review; state coverage; handoff comparison; SC-01..SC-25 route-state register; release acceptance packet; calibrationVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noProto = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ workingPrototype: null }),
  );
  if (!noProto.allowed && noProto.code === "WORKING_PROTOTYPE_REQUIRED") {
    details.push("workingPrototype=null → WORKING_PROTOTYPE_REQUIRED");
  } else {
    passed = false;
    details.push(`Prototype unexpectedly ${JSON.stringify(noProto)}`);
  }

  const noCases = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ agreedAcceptanceCases: null }),
  );
  if (
    !noCases.allowed &&
    noCases.code === "AGREED_ACCEPTANCE_CASES_REQUIRED"
  ) {
    details.push(
      "agreedAcceptanceCases=null → AGREED_ACCEPTANCE_CASES_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Agreed cases unexpectedly ${JSON.stringify(noCases)}`);
  }

  const noCtx = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ testContext: null }),
  );
  if (!noCtx.allowed && noCtx.code === "TEST_CONTEXT_REQUIRED") {
    details.push("testContext=null → TEST_CONTEXT_REQUIRED");
  } else {
    passed = false;
    details.push(`Test context unexpectedly ${JSON.stringify(noCtx)}`);
  }

  const noTrace = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ interactionTrace: null }),
  );
  if (!noTrace.allowed && noTrace.code === "INTERACTION_TRACE_REQUIRED") {
    details.push("interactionTrace=null → INTERACTION_TRACE_REQUIRED");
  } else {
    passed = false;
    details.push(`Interaction trace unexpectedly ${JSON.stringify(noTrace)}`);
  }

  const noA11y = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ accessibilityFindings: null }),
  );
  if (!noA11y.allowed && noA11y.code === "ACCESSIBILITY_FINDINGS_REQUIRED") {
    details.push("accessibilityFindings=null → ACCESSIBILITY_FINDINGS_REQUIRED");
  } else {
    passed = false;
    details.push(`Accessibility unexpectedly ${JSON.stringify(noA11y)}`);
  }

  const blocker = evaluateCalibrateDesignReleaseReadiness(
    baseInput({
      accessibilityFindings: [
        {
          findingId: "a11y-blocker",
          severity: "blocker",
          summary: "Missing confirm dialog on stop-writes",
          resolved: false,
        },
      ],
    }),
  );
  if (
    !blocker.allowed &&
    blocker.code === "ACCESSIBILITY_BLOCKER_UNRESOLVED"
  ) {
    details.push(
      "unresolved a11y blocker → ACCESSIBILITY_BLOCKER_UNRESOLVED",
    );
  } else {
    passed = false;
    details.push(`A11y blocker unexpectedly ${JSON.stringify(blocker)}`);
  }

  const noDanger = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ dangerousActions: null }),
  );
  if (
    !noDanger.allowed &&
    noDanger.code === "DANGEROUS_ACTIONS_REVIEW_REQUIRED"
  ) {
    details.push(
      "dangerousActions=null → DANGEROUS_ACTIONS_REVIEW_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Dangerous actions unexpectedly ${JSON.stringify(noDanger)}`);
  }

  const partialStates = evaluateCalibrateDesignReleaseReadiness(
    baseInput({
      stateCoverage: [{ state: "empty", evidenceId: "state-empty-obs" }],
    }),
  );
  if (
    !partialStates.allowed &&
    partialStates.code === "STATE_COVERAGE_INCOMPLETE"
  ) {
    details.push("partial stateCoverage → STATE_COVERAGE_INCOMPLETE");
  } else {
    passed = false;
    details.push(`State coverage unexpectedly ${JSON.stringify(partialStates)}`);
  }

  const noHandoff = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ handoffComparison: null }),
  );
  if (!noHandoff.allowed && noHandoff.code === "HANDOFF_COMPARISON_REQUIRED") {
    details.push("handoffComparison=null → HANDOFF_COMPARISON_REQUIRED");
  } else {
    passed = false;
    details.push(`Handoff unexpectedly ${JSON.stringify(noHandoff)}`);
  }

  const openGaps = evaluateCalibrateDesignReleaseReadiness(
    baseInput({
      handoffComparison: {
        comparisonId: "handoff-gaps",
        requirementsCompared: true,
        openGapCount: 2,
        summary: "Two handoff gaps remain",
      },
    }),
  );
  if (!openGaps.allowed && openGaps.code === "HANDOFF_GAPS_OPEN") {
    details.push("openGapCount>0 → HANDOFF_GAPS_OPEN");
  } else {
    passed = false;
    details.push(`Handoff gaps unexpectedly ${JSON.stringify(openGaps)}`);
  }

  const partialRoute = evaluateCalibrateDesignReleaseReadiness(
    baseInput({
      routeStateRegister: [
        {
          screenId: "SC-01",
          routeVerified: true,
          stateSampleVerified: true,
        },
      ],
    }),
  );
  if (
    !partialRoute.allowed &&
    partialRoute.code === "ROUTE_STATE_REGISTER_INCOMPLETE"
  ) {
    details.push("partial routeStateRegister → ROUTE_STATE_REGISTER_INCOMPLETE");
  } else {
    passed = false;
    details.push(`Route-state unexpectedly ${JSON.stringify(partialRoute)}`);
  }

  const noPacket = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ releaseAcceptancePacket: null }),
  );
  if (!noPacket.allowed && noPacket.code === "RELEASE_PACKET_REQUIRED") {
    details.push("releaseAcceptancePacket=null → RELEASE_PACKET_REQUIRED");
  } else {
    passed = false;
    details.push(`Release packet unexpectedly ${JSON.stringify(noPacket)}`);
  }

  const noOutcome = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ approveWithoutOutcomeEvidence: true }),
  );
  if (!noOutcome.allowed && noOutcome.code === "OUTCOME_EVIDENCE_REQUIRED") {
    details.push(
      "approveWithoutOutcomeEvidence → OUTCOME_EVIDENCE_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Outcome evidence unexpectedly ${JSON.stringify(noOutcome)}`);
  }

  const prodWrite = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ attemptProductionWrite: true }),
  );
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  const liveClaim = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ claimLiveVerifiedCalibration: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_CALIBRATION_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedCalibration → FALSE_LIVE_VERIFIED_CALIBRATION_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateCalibrateDesignReleaseReadiness(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-051 (design/release readiness packet summary), T-US-035 (review/revise/release), T-US-049 (daily owner review), and T-US-055 (keyboard journey) — complete F26 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CALIBRATE_DESIGN_RELEASE_READINESS,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-calibrate-design-release-readiness-f26",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
