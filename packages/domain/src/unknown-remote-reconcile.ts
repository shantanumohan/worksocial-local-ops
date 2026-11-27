/**
 * T-X020 / T-US-048 — Timeout after provider acceptance / unknown remote resume.
 *
 * Pure domain gate (general effect-ledger path): after provider acceptance times
 * out or leaves an ambiguous remote outcome, leave ACCEPTED_PENDING /
 * UNKNOWN_REMOTE_OUTCOME. Refuse blind resend/re-apply. Authorize reconcile +
 * independent verify only (applyCount stays 1). False provider-success claims
 * refused. Live provider wiring stays NOT_WIRED.
 *
 * Distinct from T-US-030 (uncertain post reconcile-before-retry), T-X017
 * (stop-after-dispatch), and T-X066 (backup omit receipt).
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import { EffectState, type EffectStateValue } from "./effect-state-machine.js";

export const UNKNOWN_REMOTE_RECONCILE_RELATED_CASE_IDS = [
  "T-X020",
  "T-US-048",
] as const;

/** Live provider apply remains NOT_WIRED for fixture soak. */
export const UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING = "NOT_WIRED" as const;

export type UnknownRemotePhase =
  | "ACCEPTED_PENDING"
  | "UNKNOWN_REMOTE_OUTCOME";

export type UnknownRemoteReconcileInput = {
  operationId: string;
  /** Effect phase after timeout / ambiguous remote. */
  phase: UnknownRemotePhase;
  /** Optional effect-state mirror used for transition honesty checks. */
  effectState?: EffectStateValue;
  /** Prior apply attempts — must stay 1 across reconcile (no resend). */
  applyAttemptCount: number;
  /** Blind resend / second apply without independent read. */
  requestBlindResend: boolean;
  /** Independent remote read / ledger reconcile performed. */
  reconciledRemoteRef: string | null;
  /** Independent verify matched after reconcile. */
  independentVerifyMatched: boolean;
  /** Claim provider success while still unknown — must refuse. */
  claimProviderSuccessDespiteUnknown: boolean;
  /** Request live provider apply — must stay NOT_WIRED. */
  requestLiveProviderWiring: boolean;
  /**
   * Claim sandbox/prod VERIFIED promotion from fixture proof — must refuse
   * (ACCEPTED ≠ VERIFIED) (S4 edge honesty).
   */
  claimSandboxOrProdVerified?: boolean;
};

export type UnknownRemoteReconcileDecision =
  | {
      allowed: true;
      code: "RECONCILED_VERIFIED_NO_RESEND";
      blindResendRefused: true;
      liveProviderWiring: typeof UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING;
      externalEffects: "NONE";
      fixtureOnly: true;
      applyAttemptCount: number;
      evidence: {
        operationId: string;
        phase: UnknownRemotePhase;
        remoteRef: string;
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE";
        blockingDecision: "NONE";
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "INPUT_INCOMPLETE"
        | "BLIND_RESEND_REFUSED"
        | "INCOHERENT_BLIND_WITH_RECONCILE"
        | "RECONCILE_REQUIRED"
        | "REMOTE_REF_REQUIRED"
        | "INDEPENDENT_VERIFY_REQUIRED"
        | "FALSE_SUCCESS_CLAIM_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED"
        | "APPLY_COUNT_MUST_STAY_ONE"
        | "APPLY_NEVER_HAPPENED"
        | "APPLY_COUNT_NEGATIVE"
        | "APPLY_COUNT_NON_FINITE"
        | "APPLY_COUNT_NON_INTEGER"
        | "EFFECT_STATE_INCOMPATIBLE"
        | "EFFECT_STATE_ALREADY_TERMINAL"
        | "EFFECT_STATE_RETRYABLE_NOT_URO"
        | "EFFECT_STATE_WAITING_NOT_URO"
        | "EFFECT_STATE_PRE_APPLY_NOT_URO"
        | "EFFECT_STATE_IN_FLIGHT_NOT_URO"
        | "EFFECT_STATE_VERIFYING_NOT_URO"
        | "EFFECT_STATE_REQUIRED"
        | "EFFECT_STATE_NOT_URO"
        | "PHASE_ACCEPTED_PENDING_NOT_URO"
        | "PHASE_MUST_BE_URO"
        | "SANDBOX_VERIFIED_CLAIM_REFUSED";
      blindResendRefused: boolean;
      liveProviderWiring: typeof UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING;
      externalEffects: "NONE";
      fixtureOnly: true;
      applyAttemptCount: number;
      evidence: {
        operationId: string;
        phase: UnknownRemotePhase | null;
        remoteRef: string | null;
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE";
        blockingDecision: string;
      } | null;
      reasons: string[];
    };

/** Effect states that may participate in unknown-remote resume (post-apply). */
export function isUnknownRemoteCompatibleEffectState(
  effectState: EffectStateValue,
): boolean {
  return unknownRemoteBlocksBlindResend(effectState);
}

const baseHonesty = {
  liveProviderWiring: UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING,
  externalEffects: "NONE" as const,
  fixtureOnly: true as const,
};

/**
 * Evaluate the general unknown-remote resume gate (T-X020 / T-US-048).
 * Blind resend and false success are refused; live stays NOT_WIRED.
 */
export function evaluateUnknownRemoteReconcile(
  input: UnknownRemoteReconcileInput,
): UnknownRemoteReconcileDecision {
  const applyAttemptCount = input.applyAttemptCount;

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: null,
      reasons: [
        "Live provider apply remains NOT_WIRED — refuse live wiring (T-X020/T-US-048)",
      ],
    };
  }

  if (input.claimSandboxOrProdVerified) {
    return {
      allowed: false,
      code: "SANDBOX_VERIFIED_CLAIM_REFUSED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: null,
      reasons: [
        "Fixture ACCEPTED ≠ sandbox/prod VERIFIED — refuse verified promotion claim (T-X020/T-US-048)",
      ],
    };
  }

  if (input.claimProviderSuccessDespiteUnknown) {
    return {
      allowed: false,
      code: "FALSE_SUCCESS_CLAIM_REFUSED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: null,
      reasons: [
        "Refused false provider-success claim while remote outcome is unknown (T-X020/T-US-048)",
      ],
    };
  }

  if (!input.operationId.trim()) {
    return {
      allowed: false,
      code: "INPUT_INCOMPLETE",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: null,
      reasons: [
        "Unknown-remote reconcile requires a non-empty operationId (T-X020/T-US-048)",
      ],
    };
  }

  // Edge (S7): NaN / Infinity apply counts are invalid ledger inputs.
  if (!Number.isFinite(input.applyAttemptCount)) {
    return {
      allowed: false,
      code: "APPLY_COUNT_NON_FINITE",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "APPLY_COUNT_NON_FINITE",
      },
      reasons: [
        "applyAttemptCount must be a finite number — refuse non-finite ledger input (T-X020)",
      ],
    };
  }

  // Edge (S6): negative apply count is distinct from never-applied (0).
  if (input.applyAttemptCount < 0) {
    return {
      allowed: false,
      code: "APPLY_COUNT_NEGATIVE",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "APPLY_COUNT_NEGATIVE",
      },
      reasons: [
        `applyAttemptCount=${input.applyAttemptCount} — negative apply count is invalid for timeout-after-acceptance (T-X020)`,
      ],
    };
  }

  // Edge (S10): fractional apply counts are invalid ledger inputs (not mere ≠1).
  if (!Number.isInteger(input.applyAttemptCount)) {
    return {
      allowed: false,
      code: "APPLY_COUNT_NON_INTEGER",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "APPLY_COUNT_FRACTIONAL",
      },
      reasons: [
        `applyAttemptCount=${input.applyAttemptCount} — apply count must be an integer ledger value (T-X020)`,
      ],
    };
  }

  // Edge (S5): never applied ≠ over-applied; both refuse resume differently.
  if (input.applyAttemptCount < 1) {
    return {
      allowed: false,
      code: "APPLY_NEVER_HAPPENED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "APPLY_COUNT_ZERO",
      },
      reasons: [
        `applyAttemptCount=${input.applyAttemptCount} — timeout-after-acceptance requires a prior single apply (T-X020)`,
      ],
    };
  }

  if (input.applyAttemptCount !== 1) {
    return {
      allowed: false,
      code: "APPLY_COUNT_MUST_STAY_ONE",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "APPLY_COUNT_NOT_ONE",
      },
      reasons: [
        `applyAttemptCount=${input.applyAttemptCount} — timeout-after-acceptance must not resend (applyCount must stay 1) (T-X020)`,
      ],
    };
  }

  if (input.requestBlindResend) {
    // Edge (S6): blind resend while also claiming reconcile/verify is incoherent.
    const hasReconcileSignal =
      Boolean(input.reconciledRemoteRef?.trim()) ||
      input.independentVerifyMatched;
    if (hasReconcileSignal) {
      return {
        allowed: false,
        code: "INCOHERENT_BLIND_WITH_RECONCILE",
        blindResendRefused: true,
        ...baseHonesty,
        applyAttemptCount,
        evidence: {
          operationId: input.operationId,
          phase: input.phase,
          remoteRef: input.reconciledRemoteRef,
          recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
          blockingDecision: "BLIND_AND_RECONCILE_TOGETHER",
        },
        reasons: [
          "Blind resend is incoherent with reconcile/verify signals — refuse (T-X020/T-US-048)",
        ],
      };
    }
    return {
      allowed: false,
      code: "BLIND_RESEND_REFUSED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: null,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "BLIND_RESEND_WHILE_UNKNOWN",
      },
      reasons: [
        `Blind resend refused while phase=${input.phase} — reconcile independent read before resume (T-X020/T-US-048)`,
      ],
    };
  }

  // Edge (S7): already-terminal effect states are not timeout-resume candidates.
  if (
    input.effectState === EffectState.COMPLETE ||
    input.effectState === EffectState.CANCELLED ||
    input.effectState === EffectState.QUARANTINED
  ) {
    return {
      allowed: false,
      code: "EFFECT_STATE_ALREADY_TERMINAL",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_TERMINAL",
      },
      reasons: [
        `effectState=${input.effectState} is already terminal — refuse unknown-remote resume certification (T-X020/T-US-048)`,
      ],
    };
  }

  // Edge (S8): FAILED_RETRYABLE is a retry path, not timeout-after-acceptance URO.
  if (input.effectState === EffectState.FAILED_RETRYABLE) {
    return {
      allowed: false,
      code: "EFFECT_STATE_RETRYABLE_NOT_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_RETRYABLE_PATH",
      },
      reasons: [
        "effectState=FAILED_RETRYABLE is a retry path — refuse unknown-remote timeout resume (T-X020/T-US-048)",
      ],
    };
  }

  // Edge (S10): WAITING_* is a hold path, not timeout-after-acceptance URO.
  if (
    input.effectState === EffectState.WAITING_HUMAN ||
    input.effectState === EffectState.WAITING_AUTHENTICATION ||
    input.effectState === EffectState.WAITING_DEPENDENCY
  ) {
    return {
      allowed: false,
      code: "EFFECT_STATE_WAITING_NOT_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_WAITING_PATH",
      },
      reasons: [
        `effectState=${input.effectState} is a waiting hold — refuse unknown-remote timeout resume (T-X020/T-US-048)`,
      ],
    };
  }

  // Edge (S11): pre-apply effect states are not timeout-after-acceptance URO.
  if (
    input.effectState === EffectState.RUNNING ||
    input.effectState === EffectState.LEASED ||
    input.effectState === EffectState.AUTHORIZED
  ) {
    return {
      allowed: false,
      code: "EFFECT_STATE_PRE_APPLY_NOT_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_PRE_APPLY_PATH",
      },
      reasons: [
        `effectState=${input.effectState} is pre-apply — refuse unknown-remote timeout resume (T-X020/T-US-048)`,
      ],
    };
  }

  // Edge (S12): APPLYING is in-flight apply, not timeout-after-acceptance URO.
  if (input.effectState === EffectState.APPLYING) {
    return {
      allowed: false,
      code: "EFFECT_STATE_IN_FLIGHT_NOT_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_IN_FLIGHT_APPLY",
      },
      reasons: [
        "effectState=APPLYING is in-flight apply — refuse unknown-remote timeout resume (T-X020/T-US-048)",
      ],
    };
  }

  // Edge (S13): VERIFYING is post-apply verify, not timeout-after-acceptance URO.
  if (input.effectState === EffectState.VERIFYING) {
    return {
      allowed: false,
      code: "EFFECT_STATE_VERIFYING_NOT_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_VERIFYING_PATH",
      },
      reasons: [
        "effectState=VERIFYING is post-apply verify — refuse unknown-remote timeout resume (T-X020/T-US-048)",
      ],
    };
  }

  // Incompatible effectState (when supplied) always blocks — even before reconcile.
  if (
    input.effectState !== undefined &&
    !isUnknownRemoteCompatibleEffectState(input.effectState)
  ) {
    return {
      allowed: false,
      code: "EFFECT_STATE_INCOMPATIBLE",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_NOT_POST_APPLY_UNKNOWN",
      },
      reasons: [
        `effectState=${input.effectState} is not on the post-apply/unknown-remote path — refuse resume certification (T-X020/T-US-048)`,
      ],
    };
  }

  // Edge (S5): split blank remoteRef vs verify-mismatch for honest diagnostics.
  const remoteRefTrimmed = input.reconciledRemoteRef?.trim() ?? "";
  if (!remoteRefTrimmed) {
    return {
      allowed: false,
      code: "REMOTE_REF_REQUIRED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "MISSING_RECONCILED_REMOTE_REF",
      },
      reasons: [
        `Phase ${input.phase} requires a non-blank reconciled remoteRef before resume (T-X020/T-US-048)`,
      ],
    };
  }

  if (!input.independentVerifyMatched) {
    return {
      allowed: false,
      code: "INDEPENDENT_VERIFY_REQUIRED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: remoteRefTrimmed,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "INDEPENDENT_VERIFY_MISMATCH",
      },
      reasons: [
        `Phase ${input.phase} requires independent verify match after reconcile before resume (T-X020/T-US-048)`,
      ],
    };
  }

  // Allowed resume requires an explicit post-apply/unknown effectState —
  // never certify from phase flags alone (S2).
  if (input.effectState === undefined) {
    return {
      allowed: false,
      code: "EFFECT_STATE_REQUIRED",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_OMITTED",
      },
      reasons: [
        "effectState required to certify unknown-remote resume — refuse omitted state (T-X020/T-US-048)",
      ],
    };
  }

  // T-X020 timeout-after-acceptance: allow path requires URO specifically
  // (APPLYING/VERIFYING alone are not the timeout outcome) (S3).
  if (input.effectState !== EffectState.UNKNOWN_REMOTE_OUTCOME) {
    return {
      allowed: false,
      code: "EFFECT_STATE_NOT_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "EFFECT_STATE_NOT_TIMEOUT_URO",
      },
      reasons: [
        `effectState=${input.effectState} — timeout-after-acceptance resume requires UNKNOWN_REMOTE_OUTCOME (T-X020/T-US-048)`,
      ],
    };
  }

  // Edge (S16): ACCEPTED_PENDING is provider ack only — not timeout URO phase.
  if (input.phase === "ACCEPTED_PENDING") {
    return {
      allowed: false,
      code: "PHASE_ACCEPTED_PENDING_NOT_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "PHASE_PROVIDER_ACK_ONLY",
      },
      reasons: [
        "phase=ACCEPTED_PENDING is provider acceptance only — refuse unknown-remote timeout resume (T-X020/T-US-048)",
      ],
    };
  }

  // Edge honesty (S4): resume certification requires phase URO — other phases
  // (provider ack without timeout phase) are not enough.
  if (input.phase !== "UNKNOWN_REMOTE_OUTCOME") {
    return {
      allowed: false,
      code: "PHASE_MUST_BE_URO",
      blindResendRefused: true,
      ...baseHonesty,
      applyAttemptCount,
      evidence: {
        operationId: input.operationId,
        phase: input.phase,
        remoteRef: input.reconciledRemoteRef,
        recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
        blockingDecision: "PHASE_NOT_TIMEOUT_URO",
      },
      reasons: [
        `phase=${input.phase} — timeout-after-acceptance resume requires phase UNKNOWN_REMOTE_OUTCOME (T-X020/T-US-048)`,
      ],
    };
  }

  return {
    allowed: true,
    code: "RECONCILED_VERIFIED_NO_RESEND",
    blindResendRefused: true,
    ...baseHonesty,
    applyAttemptCount: 1,
    evidence: {
      operationId: input.operationId,
      phase: input.phase,
      remoteRef: remoteRefTrimmed,
      recoveryPath: "UNKNOWN_REMOTE_RECONCILE",
      blockingDecision: "NONE",
    },
    reasons: [
      `Reconciled remoteRef=${remoteRefTrimmed} without re-apply; independent verify matched; applyCount=1 (T-X020/T-US-048)`,
    ],
  };
}

/**
 * Timeout after provider acceptance — settle targets for the durable effect
 * ledger (T-X020). Outcome becomes UNKNOWN_REMOTE_OUTCOME; effectState mirrors.
 * Does not claim live VERIFIED. External effects: NONE.
 */
export function recordTimeoutAfterProviderAcceptance(): {
  outcome: "UNKNOWN_REMOTE_OUTCOME";
  effectState: typeof EffectState.UNKNOWN_REMOTE_OUTCOME;
  liveProviderWiring: typeof UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING;
  externalEffects: "NONE";
} {
  return {
    outcome: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    liveProviderWiring: UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING,
    externalEffects: "NONE",
  };
}

/**
 * Honesty pins for fixture proofs (S6) — ACCEPTED ≠ VERIFIED; live NOT_WIRED;
 * externalEffects NONE; related cases T-X020 / T-US-048 only.
 */
export function unknownRemoteHonestyPins(): {
  relatedCaseIds: typeof UNKNOWN_REMOTE_RECONCILE_RELATED_CASE_IDS;
  liveProviderWiring: typeof UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING;
  externalEffects: "NONE";
  fixtureOnly: true;
  acceptedEqualsVerified: false;
} {
  return {
    relatedCaseIds: UNKNOWN_REMOTE_RECONCILE_RELATED_CASE_IDS,
    liveProviderWiring: UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING,
    externalEffects: "NONE",
    fixtureOnly: true,
    acceptedEqualsVerified: false,
  };
}

/** True only for the certified no-resend resume decision (S7). */
export function isUnknownRemoteResumeAuthorized(
  decision: UnknownRemoteReconcileDecision,
): boolean {
  return (
    decision.allowed === true &&
    decision.code === "RECONCILED_VERIFIED_NO_RESEND" &&
    decision.applyAttemptCount === 1 &&
    decision.fixtureOnly === true &&
    decision.externalEffects === "NONE" &&
    decision.liveProviderWiring === UNKNOWN_REMOTE_LIVE_PROVIDER_WIRING
  );
}

/**
 * Honesty: T-X020/T-US-048 unknown-remote resume is distinct from T-US-030
 * uncertain-post, T-X017 stop-after-dispatch, and T-X066 backup omit (S8/S9).
 */
export function unknownRemoteDistinctFromUncertainPost(): {
  thisRecoveryPath: "UNKNOWN_REMOTE_RECONCILE";
  distinctFromCaseIds: readonly [
    "T-US-030",
    "T-US-060",
    "T-X005",
    "T-X006",
    "T-X007",
    "T-X016",
    "T-X017",
    "T-X018",
    "T-X021",
    "T-X022",
    "T-X023",
    "T-X024",
    "T-X025",
    "T-X026",
    "T-X027",
    "T-X028",
    "T-X029",
    "T-X030",
    "T-X066",
  ];
  distinctFromProof: "UNCERTAIN_POST_RECONCILE_BEFORE_RETRY";
  distinctFromProofs: readonly [
    "UNCERTAIN_POST_RECONCILE_BEFORE_RETRY",
    "EMERGENCY_STOP_AT_COMMIT",
    "FORGED_BROWSER_ROLE_IGNORED",
    "CROSS_WORKSPACE_REFERENCE_DENIED",
    "WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP",
    "STOP_BEFORE_DISPATCH_NO_MUTATION",
    "STOP_AFTER_DISPATCH_RECONCILE",
    "SELF_APPROVAL_REJECTED",
    "CONCURRENT_IDEMPOTENT_RELEASE",
    "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
    "EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND",
    "OLD_FENCE_AFTER_REASSIGNMENT",
    "EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED",
    "ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE",
    "CONCURRENT_FINAL_BUDGET_RESERVATION_CAP",
    "UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL",
    "EXPLICIT_ACCOUNT_REBIND",
    "RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE",
    "BACKUP_OMIT_RECEIPT",
  ];
  fixtureOnly: true;
  acceptedEqualsVerified: false;
} {
  return {
    thisRecoveryPath: "UNKNOWN_REMOTE_RECONCILE",
    distinctFromCaseIds: [
      "T-US-030",
      "T-US-060",
      "T-X005",
      "T-X006",
      "T-X007",
      "T-X016",
      "T-X017",
      "T-X018",
      "T-X021",
      "T-X022",
      "T-X023",
      "T-X024",
      "T-X025",
      "T-X026",
      "T-X027",
      "T-X028",
      "T-X029",
      "T-X030",
      "T-X066",
    ],
    distinctFromProof: "UNCERTAIN_POST_RECONCILE_BEFORE_RETRY",
    distinctFromProofs: [
      "UNCERTAIN_POST_RECONCILE_BEFORE_RETRY",
      "EMERGENCY_STOP_AT_COMMIT",
      "FORGED_BROWSER_ROLE_IGNORED",
      "CROSS_WORKSPACE_REFERENCE_DENIED",
      "WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP",
      "STOP_BEFORE_DISPATCH_NO_MUTATION",
      "STOP_AFTER_DISPATCH_RECONCILE",
      "SELF_APPROVAL_REJECTED",
      "CONCURRENT_IDEMPOTENT_RELEASE",
      "IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
      "EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND",
      "OLD_FENCE_AFTER_REASSIGNMENT",
      "EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED",
      "ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE",
      "CONCURRENT_FINAL_BUDGET_RESERVATION_CAP",
      "UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL",
      "EXPLICIT_ACCOUNT_REBIND",
      "RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE",
      "BACKUP_OMIT_RECEIPT",
    ],
    fixtureOnly: true,
    acceptedEqualsVerified: false,
  };
}

/** True when effect state forbids blind re-apply (post-apply / URO). */
export function unknownRemoteBlocksBlindResend(
  effectState: EffectStateValue,
): boolean {
  return (
    effectState === EffectState.APPLYING ||
    effectState === EffectState.VERIFYING ||
    effectState === EffectState.UNKNOWN_REMOTE_OUTCOME
  );
}
