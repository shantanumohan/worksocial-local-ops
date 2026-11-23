import { describe, expect, it } from "vitest";
import {
  REQUIRED_SCREEN_IDS,
  REQUIRED_UI_STATES,
  evaluateDesignReleaseReadiness,
  type DesignReleaseReadinessInput,
  type ScreenCoverageEntry,
  type StateCoverageEntry,
} from "./design-release-readiness.js";

function fullScreenRegister(): ScreenCoverageEntry[] {
  return REQUIRED_SCREEN_IDS.map((screenId) => ({
    screenId,
    routeVerified: true,
  }));
}

function fullStateCoverage(): StateCoverageEntry[] {
  return REQUIRED_UI_STATES.map((state) => ({
    state,
    evidenceId: `state-${state}-obs`,
  }));
}

function validInput(
  overrides: Partial<DesignReleaseReadinessInput> = {},
): DesignReleaseReadinessInput {
  return {
    calibrationId: "calib-2026-11-23",
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
    stateCoverage: fullStateCoverage(),
    coverageRegister: fullScreenRegister(),
    releaseAcceptancePacket: {
      packetId: "packet-rel-51",
      outcomeEvidenceId: "outcome-obs-hours-release",
      decisionSummary: "Approve release with outcome evidence packet",
    },
    approveWithoutOutcomeEvidence: false,
    claimLiveVerifiedCalibration: false,
    requestLiveProviderWiring: false,
    attemptProductionWrite: false,
    ...overrides,
  };
}

describe("evaluateDesignReleaseReadiness (T-US-051)", () => {
  it("records release acceptance packet on complete happy path", () => {
    const decision = evaluateDesignReleaseReadiness(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("DESIGN_RELEASE_READINESS_PACKET_RECORDED");
    expect(decision.evidence.packetId).toBe("packet-rel-51");
    expect(decision.evidence.allScreensCovered).toBe(true);
    expect(decision.evidence.allRequiredStatesCovered).toBe(true);
    expect(decision.evidence.calibrationVerifiedLive).toBe(false);
    expect(decision.evidence.requiredScreenCount).toBe(25);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("requires test context", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({
        testContext: {
          roleId: "",
          viewport: "",
          keyboardMode: "",
          theme: "",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("TEST_CONTEXT_REQUIRED");
  });

  it("requires interaction trace", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({ interactionTrace: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("INTERACTION_TRACE_REQUIRED");
  });

  it("refuses unresolved accessibility blockers", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({
        accessibilityFindings: [
          {
            findingId: "a11y-blocker",
            severity: "blocker",
            summary: "Dangerous action unlabeled",
            resolved: false,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("ACCESSIBILITY_BLOCKER_UNRESOLVED");
  });

  it("refuses incomplete state coverage", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({
        stateCoverage: [
          { state: "empty", evidenceId: "e1" },
          { state: "loading", evidenceId: "e2" },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("STATE_COVERAGE_INCOMPLETE");
  });

  it("refuses incomplete screen coverage", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({
        coverageRegister: [
          { screenId: "SC-01", routeVerified: true },
          { screenId: "SC-23", routeVerified: true },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("SCREEN_COVERAGE_INCOMPLETE");
  });

  it("refuses approve without outcome evidence", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({
        approveWithoutOutcomeEvidence: true,
        releaseAcceptancePacket: {
          packetId: "packet-rel-51",
          outcomeEvidenceId: "",
          decisionSummary: "Approve anyway",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("OUTCOME_EVIDENCE_REQUIRED");
  });

  it("refuses production writes", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({ attemptProductionWrite: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("PRODUCTION_WRITE_REFUSED");
  });

  it("refuses false live-verified calibration claim", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({ claimLiveVerifiedCalibration: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_CALIBRATION_REFUSED");
  });

  it("refuses live provider wiring request", () => {
    const decision = evaluateDesignReleaseReadiness(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected blocked");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
