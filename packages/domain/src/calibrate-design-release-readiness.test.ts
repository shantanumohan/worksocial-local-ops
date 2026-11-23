import { describe, expect, it } from "vitest";
import {
  CALIBRATE_DESIGN_RELEASE_READINESS_RELATED_CASE_IDS,
  REQUIRED_SCREEN_IDS,
  REQUIRED_UI_STATES,
  evaluateCalibrateDesignReleaseReadiness,
  type CalibrateDesignReleaseReadinessInput,
  type RouteStateVerification,
  type StateCoverageEntry,
} from "./calibrate-design-release-readiness.js";

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
    packageId: "pkg-f26-1",
    workingPrototype: {
      prototypeId: "proto-f26-1",
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
      reviewId: "danger-f26-1",
      actionsReviewed: ["stop-writes", "emergency-stop", "approve-release"],
      confirmationHonest: true,
    },
    stateCoverage: fullStateCoverage(),
    handoffComparison: {
      comparisonId: "handoff-f26-1",
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
      packetId: "packet-rel-f26-1",
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

describe("evaluateCalibrateDesignReleaseReadiness (T-F26)", () => {
  it("records complete F26 evidence package", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "CALIBRATE_DESIGN_RELEASE_READINESS_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.designCalibratedRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f26-1");
    expect(decision.evidence.prototypeId).toBe("proto-f26-1");
    expect(decision.evidence.allScreensRouteStateVerified).toBe(true);
    expect(decision.evidence.allRequiredStatesCovered).toBe(true);
    expect(decision.evidence.handoffOpenGapCount).toBe(0);
    expect(decision.evidence.confirmationHonest).toBe(true);
    expect(decision.evidence.calibrationVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F26_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CALIBRATE_DESIGN_RELEASE_READINESS_RELATED_CASE_IDS).toEqual([
      "T-F26",
    ]);
  });

  it("refuses missing working prototype", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ workingPrototype: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WORKING_PROTOTYPE_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_WORKING_PROTOTYPE");
  });

  it("refuses missing agreed acceptance cases", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ agreedAcceptanceCases: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("AGREED_ACCEPTANCE_CASES_REQUIRED");
  });

  it("refuses incomplete test context", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ testContext: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("TEST_CONTEXT_REQUIRED");
  });

  it("refuses missing interaction trace", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ interactionTrace: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INTERACTION_TRACE_REQUIRED");
  });

  it("refuses missing accessibility findings", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ accessibilityFindings: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ACCESSIBILITY_FINDINGS_REQUIRED");
  });

  it("refuses unresolved accessibility blockers", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
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
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ACCESSIBILITY_BLOCKER_UNRESOLVED");
  });

  it("refuses missing dangerous-actions review", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ dangerousActions: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DANGEROUS_ACTIONS_REVIEW_REQUIRED");
  });

  it("refuses incomplete state coverage", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({
        stateCoverage: [{ state: "empty", evidenceId: "state-empty-obs" }],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("STATE_COVERAGE_INCOMPLETE");
  });

  it("refuses missing handoff comparison", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ handoffComparison: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("HANDOFF_COMPARISON_REQUIRED");
  });

  it("refuses open handoff gaps", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({
        handoffComparison: {
          comparisonId: "handoff-gaps",
          requirementsCompared: true,
          openGapCount: 2,
          summary: "Two handoff gaps remain",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("HANDOFF_GAPS_OPEN");
  });

  it("refuses incomplete route-state register", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
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
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ROUTE_STATE_REGISTER_INCOMPLETE");
  });

  it("refuses missing release packet", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ releaseAcceptancePacket: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("RELEASE_PACKET_REQUIRED");
  });

  it("refuses evidence-free approval", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ approveWithoutOutcomeEvidence: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OUTCOME_EVIDENCE_REQUIRED");
  });

  it("refuses production writes", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified calibration claim", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ claimLiveVerifiedCalibration: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_CALIBRATION_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateCalibrateDesignReleaseReadiness(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
