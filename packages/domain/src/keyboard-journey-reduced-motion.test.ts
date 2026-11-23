import { describe, expect, it } from "vitest";
import {
  KeyboardJourneyStepKind,
  evaluateKeyboardJourneyReducedMotion,
  type KeyboardJourneyReducedMotionInput,
  type KeyboardJourneyStep,
} from "./keyboard-journey-reduced-motion.js";

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

function validInput(
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

describe("evaluateKeyboardJourneyReducedMotion (T-US-055)", () => {
  it("records complete keyboard journey with reduced motion on happy path", () => {
    const decision = evaluateKeyboardJourneyReducedMotion(validInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) throw new Error("expected allowed");
    expect(decision.code).toBe("KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED");
    expect(decision.evidence.prefersReducedMotion).toBe(true);
    expect(decision.evidence.motionViolations).toBe(0);
    expect(decision.evidence.missingFocusRingCount).toBe(0);
    expect(decision.evidence.journeyVerifiedLive).toBe(false);
    expect(decision.evidence.completedStepCount).toBe(4);
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("requires journey steps", () => {
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({ steps: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("JOURNEY_STEPS_REQUIRED");
  });

  it("requires prefers-reduced-motion", () => {
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({ prefersReducedMotion: false }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("REDUCED_MOTION_PREFERENCE_REQUIRED");
  });

  it("refuses motion that ignores reduced-motion preference", () => {
    const steps = completeSteps();
    steps[1] = {
      ...steps[1]!,
      motionPlayedDespiteReducedPreference: true,
    };
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({ steps }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("REDUCED_MOTION_VIOLATION");
  });

  it("refuses missing focus ring on keyboard-focused step", () => {
    const steps = completeSteps();
    steps[0] = { ...steps[0]!, focusRingVisible: false };
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({ steps }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("FOCUS_RING_REQUIRED");
  });

  it("refuses pointer-required steps", () => {
    const steps = completeSteps();
    steps[3] = { ...steps[3]!, requiresPointer: true };
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({ steps }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("POINTER_REQUIRED_STEP_REFUSED");
  });

  it("refuses incomplete journey missing required step kinds", () => {
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({
        steps: completeSteps().slice(0, 2),
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("INCOMPLETE_KEYBOARD_JOURNEY");
  });

  it("refuses false live-verified journey claim", () => {
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({ claimLiveVerifiedJourney: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_JOURNEY_REFUSED");
  });

  it("keeps live provider wiring NOT_WIRED", () => {
    const decision = evaluateKeyboardJourneyReducedMotion(
      validInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) throw new Error("expected denied");
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  });
});
