/**
 * T-US-055 — Complete keyboard journey with reduced motion.
 *
 * Offline fixture gate (cross-cutting a11y family): a keyboard-only journey
 * through critical UI steps (nav → content → dialog → primary CTA) must
 * complete with visible focus at every step while prefers-reduced-motion is
 * honored (decorative/transition motion skipped; no motion-required path).
 * Incomplete journeys, missing focus rings, motion that ignores reduced-
 * motion preference, and pointer-required steps are refused. Live provider
 * wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-X061 (dialog focus restore after close) and T-US-051
 * (design/release readiness packet / SC coverage).
 */

export const KeyboardJourneyStepKind = {
  NAV: "nav",
  CONTENT: "content",
  DIALOG: "dialog",
  PRIMARY_CTA: "primary_cta",
} as const;

export type KeyboardJourneyStepKindValue =
  (typeof KeyboardJourneyStepKind)[keyof typeof KeyboardJourneyStepKind];

export type KeyboardJourneyStep = {
  stepId: string;
  kind: KeyboardJourneyStepKindValue;
  /** Focus moved onto this step via Tab / keyboard only. */
  focusedViaKeyboard: boolean;
  /** Visible focus indicator present while focused. */
  focusRingVisible: boolean;
  /**
   * Decorative or transition motion attempted while prefers-reduced-motion
   * is active. Must be false when reduced motion is preferred.
   */
  motionPlayedDespiteReducedPreference: boolean;
  /** Step requires a pointer (mouse/touch) to complete — must refuse. */
  requiresPointer: boolean;
  /** Step completed successfully in the fixture oracle. */
  completed: boolean;
};

export type KeyboardJourneyReducedMotionInput = {
  journeyId: string;
  steps: readonly KeyboardJourneyStep[];
  /** User/OS prefers-reduced-motion preference. */
  prefersReducedMotion: boolean;
  /** Claim the journey is live-verified — must refuse offline. */
  claimLiveVerifiedJourney: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type KeyboardJourneyReducedMotionDecision =
  | {
      allowed: true;
      code: "KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        journeyId: string;
        stepCount: number;
        completedStepCount: number;
        prefersReducedMotion: true;
        motionViolations: 0;
        missingFocusRingCount: 0;
        pointerRequiredCount: 0;
        journeyVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "KEYBOARD_JOURNEY_COMPLETE_REDUCED_MOTION";
        currentState: "KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED";
        recoveryPath: "KEEP_KEYBOARD_AND_REDUCED_MOTION";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "JOURNEY_STEPS_REQUIRED"
        | "REDUCED_MOTION_PREFERENCE_REQUIRED"
        | "INCOMPLETE_KEYBOARD_JOURNEY"
        | "FOCUS_RING_REQUIRED"
        | "REDUCED_MOTION_VIOLATION"
        | "POINTER_REQUIRED_STEP_REFUSED"
        | "FALSE_LIVE_VERIFIED_JOURNEY_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        journeyId: string | null;
        stepCount: number;
        completedStepCount: number;
        prefersReducedMotion: boolean;
        motionViolations: number;
        missingFocusRingCount: number;
        pointerRequiredCount: number;
        journeyVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_JOURNEY_STEPS"
          | "AWAITING_REDUCED_MOTION"
          | "AWAITING_COMPLETE_KEYBOARD_JOURNEY";
        recoveryPath:
          | "PROVIDE_KEYBOARD_JOURNEY_STEPS"
          | "ENABLE_REDUCED_MOTION_PREFERENCE"
          | "COMPLETE_KEYBOARD_STEPS_WITH_FOCUS"
          | "SKIP_MOTION_UNDER_REDUCED_PREFERENCE"
          | "REMOVE_POINTER_ONLY_STEPS";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const KEYBOARD_JOURNEY_REDUCED_MOTION_RELATED_CASE_IDS = [
  "T-US-055",
] as const;

const REQUIRED_STEP_KINDS: readonly KeyboardJourneyStepKindValue[] = [
  KeyboardJourneyStepKind.NAV,
  KeyboardJourneyStepKind.CONTENT,
  KeyboardJourneyStepKind.DIALOG,
  KeyboardJourneyStepKind.PRIMARY_CTA,
];

function preservedInputCount(
  input: KeyboardJourneyReducedMotionInput,
): number {
  return (
    (input.journeyId.trim() ? 1 : 0) +
    (input.steps.length > 0 ? 1 : 0) +
    input.steps.filter((s) => s.stepId.trim()).length
  );
}

/**
 * Evaluate the T-US-055 keyboard journey + reduced-motion path offline.
 * Complete keyboard-only journey with reduced motion honored →
 * KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED; live stays NOT_WIRED.
 */
export function evaluateKeyboardJourneyReducedMotion(
  input: KeyboardJourneyReducedMotionInput,
): KeyboardJourneyReducedMotionDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const completedSteps = input.steps.filter((s) => s.completed);
  const motionViolations = input.steps.filter(
    (s) => s.motionPlayedDespiteReducedPreference,
  ).length;
  const missingFocusRing = input.steps.filter(
    (s) => s.focusedViaKeyboard && !s.focusRingVisible,
  ).length;
  const pointerRequired = input.steps.filter((s) => s.requiresPointer).length;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_JOURNEY_STEPS"
      | "AWAITING_REDUCED_MOTION"
      | "AWAITING_COMPLETE_KEYBOARD_JOURNEY",
    recoveryPath:
      | "PROVIDE_KEYBOARD_JOURNEY_STEPS"
      | "ENABLE_REDUCED_MOTION_PREFERENCE"
      | "COMPLETE_KEYBOARD_STEPS_WITH_FOCUS"
      | "SKIP_MOTION_UNDER_REDUCED_PREFERENCE"
      | "REMOVE_POINTER_ONLY_STEPS",
  ): NonNullable<
    Extract<
      KeyboardJourneyReducedMotionDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    journeyId: input.journeyId.trim() || null,
    stepCount: input.steps.length,
    completedStepCount: completedSteps.length,
    prefersReducedMotion: input.prefersReducedMotion,
    motionViolations,
    missingFocusRingCount: missingFocusRing,
    pointerRequiredCount: pointerRequired,
    journeyVerifiedLive: false,
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
        "Live keyboard-journey provider wiring remains NOT_WIRED — refuse live wiring (T-US-055)",
      ],
    };
  }

  if (input.claimLiveVerifiedJourney) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_JOURNEY_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified keyboard journey claim offline (T-US-055) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (
    !input.journeyId.trim() ||
    input.steps.length === 0 ||
    input.steps.some((s) => !s.stepId.trim())
  ) {
    return {
      allowed: false,
      code: "JOURNEY_STEPS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "KEYBOARD_JOURNEY_STEPS_MISSING",
        "AWAITING_JOURNEY_STEPS",
        "PROVIDE_KEYBOARD_JOURNEY_STEPS",
      ),
      reasons: [
        "Keyboard journey requires journey id and at least one named step (T-US-055)",
      ],
    };
  }

  if (!input.prefersReducedMotion) {
    return {
      allowed: false,
      code: "REDUCED_MOTION_PREFERENCE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "REDUCED_MOTION_PREFERENCE_NOT_SET",
        "AWAITING_REDUCED_MOTION",
        "ENABLE_REDUCED_MOTION_PREFERENCE",
      ),
      reasons: [
        "T-US-055 requires prefers-reduced-motion to be active for the journey soak",
      ],
    };
  }

  if (pointerRequired > 0) {
    return {
      allowed: false,
      code: "POINTER_REQUIRED_STEP_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "POINTER_ONLY_STEP_IN_KEYBOARD_JOURNEY",
        "BLOCKED",
        "REMOVE_POINTER_ONLY_STEPS",
      ),
      reasons: [
        "Keyboard journey must not require pointer-only steps (T-US-055)",
      ],
    };
  }

  if (motionViolations > 0) {
    return {
      allowed: false,
      code: "REDUCED_MOTION_VIOLATION",
      ...base,
      evidence: blockedEvidence(
        "MOTION_PLAYED_DESPITE_REDUCED_PREFERENCE",
        "BLOCKED",
        "SKIP_MOTION_UNDER_REDUCED_PREFERENCE",
      ),
      reasons: [
        "Decorative/transition motion must not play when prefers-reduced-motion is set (T-US-055)",
      ],
    };
  }

  if (missingFocusRing > 0) {
    return {
      allowed: false,
      code: "FOCUS_RING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "KEYBOARD_FOCUS_RING_MISSING",
        "AWAITING_COMPLETE_KEYBOARD_JOURNEY",
        "COMPLETE_KEYBOARD_STEPS_WITH_FOCUS",
      ),
      reasons: [
        "Every keyboard-focused step must show a visible focus ring (T-US-055)",
      ],
    };
  }

  const kindsPresent = new Set(input.steps.map((s) => s.kind));
  const missingKinds = REQUIRED_STEP_KINDS.filter((k) => !kindsPresent.has(k));
  const allKeyboardFocused = input.steps.every((s) => s.focusedViaKeyboard);
  const allCompleted = input.steps.every((s) => s.completed);

  if (
    missingKinds.length > 0 ||
    !allKeyboardFocused ||
    !allCompleted ||
    completedSteps.length < REQUIRED_STEP_KINDS.length
  ) {
    return {
      allowed: false,
      code: "INCOMPLETE_KEYBOARD_JOURNEY",
      ...base,
      evidence: blockedEvidence(
        "KEYBOARD_JOURNEY_INCOMPLETE",
        "AWAITING_COMPLETE_KEYBOARD_JOURNEY",
        "COMPLETE_KEYBOARD_STEPS_WITH_FOCUS",
      ),
      reasons: [
        "Complete keyboard journey requires nav, content, dialog, and primary CTA steps — each keyboard-focused and completed (T-US-055)",
      ],
    };
  }

  return {
    allowed: true,
    code: "KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED",
    ...base,
    evidence: {
      journeyId: input.journeyId.trim(),
      stepCount: input.steps.length,
      completedStepCount: completedSteps.length,
      prefersReducedMotion: true,
      motionViolations: 0,
      missingFocusRingCount: 0,
      pointerRequiredCount: 0,
      journeyVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "KEYBOARD_JOURNEY_COMPLETE_REDUCED_MOTION",
      currentState: "KEYBOARD_JOURNEY_REDUCED_MOTION_COMPLETED",
      recoveryPath: "KEEP_KEYBOARD_AND_REDUCED_MOTION",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete keyboard journey with reduced motion honored (T-US-055); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
