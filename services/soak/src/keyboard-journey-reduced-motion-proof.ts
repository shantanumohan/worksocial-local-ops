/**
 * Fixture proof for T-US-055 — Complete keyboard journey with reduced motion.
 * Full nav→content→dialog→CTA keyboard path with reduced motion honored;
 * motion violations, missing focus rings, pointer-only steps, and incomplete
 * journeys refused; live NOT_WIRED. Distinct from T-X061 / T-US-051.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  KeyboardJourneyStepKind,
  SoakProofKind,
  evaluateKeyboardJourneyReducedMotion,
  type KeyboardJourneyReducedMotionInput,
  type KeyboardJourneyStep,
  type SoakProofRecord,
} from "@worksocial/domain";

function completeSteps(): KeyboardJourneyStep[] {
  return [
    {
      stepId: "nav-main",
      kind: KeyboardJourneyStepKind.NAV,
      focusedViaKeyboard: true,
      focusRingVisible: true,
      motionPlayedDespiteReducedPreference: false,
      requiresPointer: false,
      completed: true,
    },
    {
      stepId: "content-panel",
      kind: KeyboardJourneyStepKind.CONTENT,
      focusedViaKeyboard: true,
      focusRingVisible: true,
      motionPlayedDespiteReducedPreference: false,
      requiresPointer: false,
      completed: true,
    },
    {
      stepId: "confirm-dialog",
      kind: KeyboardJourneyStepKind.DIALOG,
      focusedViaKeyboard: true,
      focusRingVisible: true,
      motionPlayedDespiteReducedPreference: false,
      requiresPointer: false,
      completed: true,
    },
    {
      stepId: "primary-cta",
      kind: KeyboardJourneyStepKind.PRIMARY_CTA,
      focusedViaKeyboard: true,
      focusRingVisible: true,
      motionPlayedDespiteReducedPreference: false,
      requiresPointer: false,
      completed: true,
    },
  ];
}

function baseInput(
  overrides: Partial<KeyboardJourneyReducedMotionInput> = {},
): KeyboardJourneyReducedMotionInput {
  return {
    journeyId: "journey-keyboard-rm-055",
    steps: completeSteps(),
    prefersReducedMotion: true,
    claimLiveVerifiedJourney: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-US-055 fixture ACCEPTED.
 */
export function proofKeyboardJourneyReducedMotion(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateKeyboardJourneyReducedMotion(baseInput());
  if (
    happy.allowed &&
    happy.code === "KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED" &&
    happy.evidence.prefersReducedMotion === true &&
    happy.evidence.motionViolations === 0 &&
    happy.evidence.missingFocusRingCount === 0 &&
    happy.evidence.journeyVerifiedLive === false &&
    happy.evidence.completedStepCount === 4 &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "nav→content→dialog→CTA keyboard journey + reduced motion → KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED; journeyVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noSteps = evaluateKeyboardJourneyReducedMotion(
    baseInput({ steps: [] }),
  );
  if (!noSteps.allowed && noSteps.code === "JOURNEY_STEPS_REQUIRED") {
    details.push("empty steps → JOURNEY_STEPS_REQUIRED");
  } else {
    passed = false;
    details.push(`No steps unexpectedly ${JSON.stringify(noSteps)}`);
  }

  const noRm = evaluateKeyboardJourneyReducedMotion(
    baseInput({ prefersReducedMotion: false }),
  );
  if (
    !noRm.allowed &&
    noRm.code === "REDUCED_MOTION_PREFERENCE_REQUIRED"
  ) {
    details.push(
      "prefersReducedMotion=false → REDUCED_MOTION_PREFERENCE_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`No reduced motion unexpectedly ${JSON.stringify(noRm)}`);
  }

  const motionSteps = completeSteps();
  motionSteps[1] = {
    ...motionSteps[1]!,
    motionPlayedDespiteReducedPreference: true,
  };
  const motion = evaluateKeyboardJourneyReducedMotion(
    baseInput({ steps: motionSteps }),
  );
  if (!motion.allowed && motion.code === "REDUCED_MOTION_VIOLATION") {
    details.push(
      "motion despite reduced preference → REDUCED_MOTION_VIOLATION",
    );
  } else {
    passed = false;
    details.push(`Motion violation unexpectedly ${JSON.stringify(motion)}`);
  }

  const focusSteps = completeSteps();
  focusSteps[0] = { ...focusSteps[0]!, focusRingVisible: false };
  const focus = evaluateKeyboardJourneyReducedMotion(
    baseInput({ steps: focusSteps }),
  );
  if (!focus.allowed && focus.code === "FOCUS_RING_REQUIRED") {
    details.push("missing focus ring → FOCUS_RING_REQUIRED");
  } else {
    passed = false;
    details.push(`Focus ring unexpectedly ${JSON.stringify(focus)}`);
  }

  const pointerSteps = completeSteps();
  pointerSteps[3] = { ...pointerSteps[3]!, requiresPointer: true };
  const pointer = evaluateKeyboardJourneyReducedMotion(
    baseInput({ steps: pointerSteps }),
  );
  if (
    !pointer.allowed &&
    pointer.code === "POINTER_REQUIRED_STEP_REFUSED"
  ) {
    details.push("pointer-required CTA → POINTER_REQUIRED_STEP_REFUSED");
  } else {
    passed = false;
    details.push(`Pointer step unexpectedly ${JSON.stringify(pointer)}`);
  }

  const incomplete = evaluateKeyboardJourneyReducedMotion(
    baseInput({ steps: completeSteps().slice(0, 2) }),
  );
  if (
    !incomplete.allowed &&
    incomplete.code === "INCOMPLETE_KEYBOARD_JOURNEY"
  ) {
    details.push("partial steps → INCOMPLETE_KEYBOARD_JOURNEY");
  } else {
    passed = false;
    details.push(`Incomplete unexpectedly ${JSON.stringify(incomplete)}`);
  }

  const liveClaim = evaluateKeyboardJourneyReducedMotion(
    baseInput({ claimLiveVerifiedJourney: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_JOURNEY_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedJourney → FALSE_LIVE_VERIFIED_JOURNEY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateKeyboardJourneyReducedMotion(
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
    "Distinct from T-X061 (dialog focus restore), T-US-051 (design/release readiness packet)",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: `proof-keyboard-journey-reduced-motion-${randomUUID()}`,
    kind: SoakProofKind.KEYBOARD_JOURNEY_REDUCED_MOTION,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-keyboard-journey-rm-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
