/**
 * Effect / job state machine (v3 §7). Pure transitions only.
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
  ],
  AUTHORIZED: ["APPLYING", "CANCELLED", "QUARANTINED"],
  APPLYING: ["VERIFYING", "UNKNOWN_REMOTE_OUTCOME", "FAILED_RETRYABLE"],
  VERIFYING: ["COMPLETE", "UNKNOWN_REMOTE_OUTCOME", "FAILED_RETRYABLE"],
  COMPLETE: [],
  WAITING_DEPENDENCY: ["QUEUED", "CANCELLED", "QUARANTINED"],
  WAITING_AUTHENTICATION: ["RUNNING", "CANCELLED", "QUARANTINED"],
  WAITING_HUMAN: ["RUNNING", "CANCELLED", "QUARANTINED"],
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
