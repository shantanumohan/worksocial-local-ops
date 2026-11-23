/**
 * Fixture proof for T-US-051 — Design/release readiness (F26/SC-23).
 * Test context, interaction trace, accessibility findings, state coverage
 * matrix, SC-01..SC-25 coverage register, and release acceptance packet with
 * outcome evidence; live NOT_WIRED. Distinct from T-US-035 (review/revise/
 * release), T-US-049 (daily owner review), T-US-055 (keyboard journey).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  REQUIRED_SCREEN_IDS,
  REQUIRED_UI_STATES,
  SoakProofKind,
  evaluateDesignReleaseReadiness,
  type DesignReleaseReadinessInput,
  type ScreenCoverageEntry,
  type SoakProofRecord,
  type StateCoverageEntry,
} from "@worksocial/domain";

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

function baseInput(
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

/**
 * Complete expected proof set for T-US-051 fixture ACCEPTED.
 */
export function proofDesignReleaseReadiness(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateDesignReleaseReadiness(baseInput());
  if (
    happy.allowed &&
    happy.code === "DESIGN_RELEASE_READINESS_PACKET_RECORDED" &&
    happy.evidence.packetId === "packet-rel-51" &&
    happy.evidence.allScreensCovered === true &&
    happy.evidence.allRequiredStatesCovered === true &&
    happy.evidence.calibrationVerifiedLive === false &&
    happy.evidence.requiredScreenCount === 25 &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete context+trace+a11y+states+SC-01..SC-25+packet → DESIGN_RELEASE_READINESS_PACKET_RECORDED; calibrationVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noTrace = evaluateDesignReleaseReadiness(
    baseInput({ interactionTrace: [] }),
  );
  if (!noTrace.allowed && noTrace.code === "INTERACTION_TRACE_REQUIRED") {
    details.push("empty interactionTrace → INTERACTION_TRACE_REQUIRED");
  } else {
    passed = false;
    details.push(`No trace unexpectedly ${JSON.stringify(noTrace)}`);
  }

  const blocker = evaluateDesignReleaseReadiness(
    baseInput({
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

  const states = evaluateDesignReleaseReadiness(
    baseInput({
      stateCoverage: [
        { state: "empty", evidenceId: "e1" },
        { state: "loading", evidenceId: "e2" },
      ],
    }),
  );
  if (!states.allowed && states.code === "STATE_COVERAGE_INCOMPLETE") {
    details.push("partial stateCoverage → STATE_COVERAGE_INCOMPLETE");
  } else {
    passed = false;
    details.push(`State coverage unexpectedly ${JSON.stringify(states)}`);
  }

  const screens = evaluateDesignReleaseReadiness(
    baseInput({
      coverageRegister: [
        { screenId: "SC-01", routeVerified: true },
        { screenId: "SC-23", routeVerified: true },
      ],
    }),
  );
  if (!screens.allowed && screens.code === "SCREEN_COVERAGE_INCOMPLETE") {
    details.push("partial coverageRegister → SCREEN_COVERAGE_INCOMPLETE");
  } else {
    passed = false;
    details.push(`Screen coverage unexpectedly ${JSON.stringify(screens)}`);
  }

  const noOutcome = evaluateDesignReleaseReadiness(
    baseInput({
      approveWithoutOutcomeEvidence: true,
      releaseAcceptancePacket: {
        packetId: "packet-rel-51",
        outcomeEvidenceId: "",
        decisionSummary: "Approve anyway",
      },
    }),
  );
  if (!noOutcome.allowed && noOutcome.code === "OUTCOME_EVIDENCE_REQUIRED") {
    details.push(
      "approveWithoutOutcomeEvidence → OUTCOME_EVIDENCE_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`No outcome unexpectedly ${JSON.stringify(noOutcome)}`);
  }

  const liveClaim = evaluateDesignReleaseReadiness(
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

  const liveWire = evaluateDesignReleaseReadiness(
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

  const prodWrite = evaluateDesignReleaseReadiness(
    baseInput({ attemptProductionWrite: true }),
  );
  if (!prodWrite.allowed && prodWrite.code === "PRODUCTION_WRITE_REFUSED") {
    details.push("attemptProductionWrite → PRODUCTION_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Production write unexpectedly ${JSON.stringify(prodWrite)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-035 (review/revise/release), T-US-049 (daily owner review), T-US-055 (keyboard journey)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-design-release-readiness-${randomUUID()}`,
    kind: SoakProofKind.DESIGN_RELEASE_READINESS_PACKET,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-design-release-readiness-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
