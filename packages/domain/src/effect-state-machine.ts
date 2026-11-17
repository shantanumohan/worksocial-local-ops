/**
 * Effect / job state machine (v3 §7). Pure transitions only.
 *
 * After APPLYING, verification failures must stay on a reconciliation path
 * (UNKNOWN_REMOTE_OUTCOME → VERIFYING), never FAILED_RETRYABLE → QUEUED,
 * which would re-enter APPLYING and risk duplicate external effects.
 */

export const EffectState = {
  QUEUED: "QUEUED",
  LEASED: "LEASED",
  RUNNING: "RUNNING",
  VALIDATING: "VALIDATING",
  AUTHORIZED: "AUTHORIZED",
  APPLYING: "APPLYING",
  VERIFYING: "VERIFYING",
  COMPLETE: "COMPLETE",
  WAITING_DEPENDENCY: "WAITING_DEPENDENCY",
  WAITING_AUTHENTICATION: "WAITING_AUTHENTICATION",
  WAITING_HUMAN: "WAITING_HUMAN",
  FAILED_RETRYABLE: "FAILED_RETRYABLE",
  UNKNOWN_REMOTE_OUTCOME: "UNKNOWN_REMOTE_OUTCOME",
  CANCELLED: "CANCELLED",
  QUARANTINED: "QUARANTINED",
} as const;

export type EffectStateValue = (typeof EffectState)[keyof typeof EffectState];

const TRANSITIONS: Record<EffectStateValue, readonly EffectStateValue[]> = {
  QUEUED: ["LEASED", "CANCELLED", "QUARANTINED", "WAITING_DEPENDENCY"],
  LEASED: ["RUNNING", "QUEUED", "CANCELLED", "FAILED_RETRYABLE"],
  RUNNING: [
    "VALIDATING",
    "WAITING_AUTHENTICATION",
    "WAITING_HUMAN",
    "FAILED_RETRYABLE",
    "CANCELLED",
    "QUARANTINED",
  ],
  VALIDATING: [
    "AUTHORIZED",
    "FAILED_RETRYABLE",
    "QUARANTINED",
    "WAITING_HUMAN",
    "CANCELLED",
  ],
  AUTHORIZED: ["APPLYING", "CANCELLED", "QUARANTINED"],
  APPLYING: ["VERIFYING", "UNKNOWN_REMOTE_OUTCOME"],
  VERIFYING: ["COMPLETE", "UNKNOWN_REMOTE_OUTCOME"],
  COMPLETE: [],
  WAITING_DEPENDENCY: ["QUEUED", "CANCELLED", "QUARANTINED"],
  WAITING_AUTHENTICATION: ["RUNNING", "CANCELLED", "QUARANTINED"],
  WAITING_HUMAN: ["RUNNING", "CANCELLED", "QUARANTINED"],
  /** Pre-effect retry only — must not follow APPLYING/VERIFYING. */
  FAILED_RETRYABLE: ["QUEUED", "CANCELLED", "QUARANTINED"],
  UNKNOWN_REMOTE_OUTCOME: ["VERIFYING", "QUARANTINED", "CANCELLED"],
  CANCELLED: [],
  QUARANTINED: [],
};

export function canTransition(
  from: EffectStateValue,
  to: EffectStateValue,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export function transition(
  from: EffectStateValue,
  to: EffectStateValue,
): EffectStateValue {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid effect transition: ${from} -> ${to}`);
  }
  return to;
}

/** True when the job has entered the apply/verify/reconcile path. */
export function isPostApplyPhase(state: EffectStateValue): boolean {
  return (
    state === EffectState.APPLYING ||
    state === EffectState.VERIFYING ||
    state === EffectState.UNKNOWN_REMOTE_OUTCOME ||
    state === EffectState.COMPLETE
  );
}
