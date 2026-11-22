/**
 * Fixture proof for T-X017 — stop after provider dispatch starts.
 *
 * Once APPLYING has begun, stop must retain work for reconcile (no fake
 * CANCELLED). State machine forbids APPLYING→CANCELLED; cancelEligibleQueuedWork
 * retains post-apply items; ledger settles UNKNOWN_REMOTE_OUTCOME.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  EffectState,
  SimulatedEffectLedger,
  SoakProofKind,
  applyQueuedCancelResults,
  canTransition,
  cancelEligibleQueuedWork,
  isPostApplyPhase,
  transition,
  type CredentialQueuedWorkItem,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X017 fixture ACCEPTED.
 */
export function proofStopAfterDispatchReconcile(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Dispatch started → post-apply phase; CANCELLED transition forbidden.
  if (isPostApplyPhase(EffectState.APPLYING) !== true) {
    passed = false;
    details.push("Expected isPostApplyPhase(APPLYING)=true");
  } else {
    details.push("APPLYING is post-apply (dispatch started)");
  }

  if (canTransition(EffectState.APPLYING, EffectState.CANCELLED) !== false) {
    passed = false;
    details.push("Expected APPLYING→CANCELLED forbidden (no fake cancel)");
  } else {
    details.push("APPLYING→CANCELLED forbidden (no fake cancel)");
  }

  // 2. Honest stop path: APPLYING → UNKNOWN_REMOTE_OUTCOME (reconcile, not cancel).
  let uroOk = false;
  try {
    const next = transition(
      EffectState.APPLYING,
      EffectState.UNKNOWN_REMOTE_OUTCOME,
    );
    uroOk = next === EffectState.UNKNOWN_REMOTE_OUTCOME;
  } catch {
    uroOk = false;
  }
  if (uroOk) {
    details.push("APPLYING→UNKNOWN_REMOTE_OUTCOME allowed (reconcile path)");
  } else {
    passed = false;
    details.push("APPLYING→UNKNOWN_REMOTE_OUTCOME transition failed");
  }

  // 3. cancelEligibleQueuedWork retains post-apply; cancels only pre-apply.
  const items: CredentialQueuedWorkItem[] = [
    {
      workId: "qw-queued",
      connectionId: "conn-1",
      capabilityId: "cms_publish",
      operationId: "op-queued",
      effectState: EffectState.QUEUED,
      queuedAtIso: nowIso,
      summary: "pre-dispatch queued",
    },
    {
      workId: "qw-applying",
      connectionId: "conn-1",
      capabilityId: "cms_publish",
      operationId: "op-applying",
      effectState: EffectState.APPLYING,
      queuedAtIso: nowIso,
      summary: "dispatch started",
    },
    {
      workId: "qw-verifying",
      connectionId: "conn-1",
      capabilityId: "cms_publish",
      operationId: "op-verifying",
      effectState: EffectState.VERIFYING,
      queuedAtIso: nowIso,
      summary: "provider accepted pending verify",
    },
    {
      workId: "qw-uro",
      connectionId: "conn-1",
      capabilityId: "cms_publish",
      operationId: "op-uro",
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      queuedAtIso: nowIso,
      summary: "ambiguous remote",
    },
  ];

  const results = cancelEligibleQueuedWork(items);
  const applying = results.find((r) => r.workId === "qw-applying");
  const verifying = results.find((r) => r.workId === "qw-verifying");
  const uro = results.find((r) => r.workId === "qw-uro");
  const queued = results.find((r) => r.workId === "qw-queued");

  const postApplyRetained =
    applying?.cancelled === false &&
    applying?.retainedForReconcile === true &&
    verifying?.cancelled === false &&
    verifying?.retainedForReconcile === true &&
    uro?.cancelled === false &&
    uro?.retainedForReconcile === true;
  const preApplyCancelled =
    queued?.cancelled === true && queued.toState === EffectState.CANCELLED;

  if (postApplyRetained && preApplyCancelled) {
    details.push(
      "cancelEligibleQueuedWork retains APPLYING/VERIFYING/URO; cancels QUEUED only",
    );
  } else {
    passed = false;
    details.push(
      `cancelEligibleQueuedWork unexpected applying=${JSON.stringify(applying)} verifying=${JSON.stringify(verifying)} uro=${JSON.stringify(uro)} queued=${JSON.stringify(queued)}`,
    );
  }

  const updated = applyQueuedCancelResults(items, results);
  const applyingState = updated.find((w) => w.workId === "qw-applying")
    ?.effectState;
  if (applyingState === EffectState.APPLYING) {
    details.push("APPLYING work remains APPLYING after stop (not fake-cancelled)");
  } else {
    passed = false;
    details.push(`APPLYING work unexpectedly became ${applyingState}`);
  }

  // 4. Ledger honesty: ACCEPTED_PENDING → UNKNOWN_REMOTE_OUTCOME; no cancel fiction.
  const ledger = new SimulatedEffectLedger();
  const opId = `op-x017-${randomUUID().slice(0, 8)}`;
  ledger.recordIntent(opId, "digest-x017", nowIso);
  ledger.settle(opId, "ACCEPTED_PENDING");
  const settled = ledger.settle(opId, "UNKNOWN_REMOTE_OUTCOME");
  if (
    settled.outcome === "UNKNOWN_REMOTE_OUTCOME" &&
    ledger.hasVerified(opId) === false
  ) {
    details.push(
      "Ledger settles UNKNOWN_REMOTE_OUTCOME after dispatch (reconcile; not VERIFIED)",
    );
  } else {
    passed = false;
    details.push(`Ledger settle unexpectedly ${JSON.stringify(settled)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-stop-after-dispatch-${randomUUID()}`,
    kind: SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x017-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
