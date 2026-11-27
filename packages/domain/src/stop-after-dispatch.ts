/**
 * T-X017 — Stop after provider dispatch starts: reconcile; no fake cancel.
 *
 * Once APPLYING has begun, stop must retain work for reconcile. The effect
 * state machine forbids APPLYING→CANCELLED and VERIFYING→CANCELLED; the stop
 * path also retains UNKNOWN_REMOTE_OUTCOME / COMPLETE even where a general
 * CANCELLED edge exists. Forged cancel results against post-apply work are
 * refused. After stop retains post-apply work, the effect-ledger attempt
 * fence refuses a second apply-attempt record; settle UNKNOWN only; never
 * invent VERIFIED. After UNKNOWN settle, second apply still refused;
 * VERIFYING/URO/COMPLETE fence second apply; empty/whitespace second digest
 * refused; double UNKNOWN settle stays UNKNOWN; retain-flag on pre-apply
 * does not engage fence; same-digest idempotent replay after UNKNOWN OK;
 * cross-op fence isolation; COMPLETE settle UNKNOWN only; multi distinct
 * second digests stay refused; VERIFYING settle UNKNOWN; AUTHORIZED+
 * retain-flag does not engage fence; omitted secondApplyDigest defaults
 * refuse; post-refuse same-digest OK; LEASED retain-flag N/A; RUNNING
 * retain-flag N/A; after same-digest distinct still refuse; forge outside
 * retain refused; WAITING_* retain-flag N/A; settle_unknown outside
 * stop-retain stays UNKNOWN only; FAILED_RETRYABLE retain-flag N/A;
 * pre-apply settle outside UNKNOWN only. Live provider wiring NOT_WIRED;
 * external effects NONE. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * Distinct from T-US-030 (uncertain post reconcile-before-retry) and
 * T-US-048/T-X020 (general unknown-remote resume).
 */

import {
  EffectState,
  canTransition,
  isPostApplyPhase,
  transition,
  type EffectStateValue,
} from "./effect-state-machine.js";
import {
  applyQueuedCancelResults,
  cancelEligibleQueuedWork,
  type CredentialQueuedWorkItem,
  type QueuedWorkCancelResult,
} from "./credential-rotation.js";
import {
  SimulatedEffectLedger,
  type EffectOutcome,
} from "./simulated-effect-ledger.js";

/** Catalog cases tied to stop-after-dispatch reconcile (T-X017). */
export const STOP_AFTER_DISPATCH_RELATED_CASE_IDS = ["T-X017"] as const;

export type StopAfterDispatchDisposition = {
  fromState: EffectStateValue;
  disposition: "CANCEL" | "RETAIN_FOR_RECONCILE" | "ALREADY_TERMINAL";
  cancelled: boolean;
  retainedForReconcile: boolean;
  toState: EffectStateValue | null;
  reason: string;
  /** Fixture honesty — classifier never wires live provider cancel/dispatch. */
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  fixtureOnly: true;
};

/**
 * Classify how stop-after-dispatch treats one effect state.
 * Post-apply → retain for reconcile (never fake CANCELLED).
 */
export function classifyStopAfterDispatchDisposition(
  state: EffectStateValue,
): StopAfterDispatchDisposition {
  const honesty = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
  };

  if (isPostApplyPhase(state)) {
    return {
      fromState: state,
      disposition: "RETAIN_FOR_RECONCILE",
      cancelled: false,
      retainedForReconcile: true,
      toState: null,
      reason:
        "Post-apply work retained for reconcile — stop does not fake-cancel after dispatch (T-X017)",
      ...honesty,
    };
  }

  if (
    state === EffectState.CANCELLED ||
    state === EffectState.QUARANTINED
  ) {
    return {
      fromState: state,
      disposition: "ALREADY_TERMINAL",
      cancelled: false,
      retainedForReconcile: false,
      toState: state,
      reason: `Already terminal (${state})`,
      ...honesty,
    };
  }

  if (!canTransition(state, EffectState.CANCELLED)) {
    return {
      fromState: state,
      disposition: "RETAIN_FOR_RECONCILE",
      cancelled: false,
      retainedForReconcile: true,
      toState: null,
      reason: `Cannot cancel from ${state} — retained`,
      ...honesty,
    };
  }

  return {
    fromState: state,
    disposition: "CANCEL",
    cancelled: true,
    retainedForReconcile: false,
    toState: EffectState.CANCELLED,
    reason: "Eligible pre-dispatch work cancelled on stop (T-X017)",
    ...honesty,
  };
}

export type StopAfterDispatchLedgerAttempt =
  | "record_second_apply"
  | "settle_unknown"
  | "forge_verified";

export type StopAfterDispatchLedgerFenceResult = {
  allowed: boolean;
  code:
    | "SECOND_APPLY_REFUSED"
    | "UNKNOWN_SETTLE_OK"
    | "VERIFIED_FORGE_REFUSED"
    | "PRE_STOP_APPLY_OK";
  applyAttemptCount: number;
  ledgerOutcome: EffectOutcome | null;
  hasVerified: boolean;
  reason: string;
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  fixtureOnly: true;
};

const LEDGER_FENCE_HONESTY = {
  liveProviderWiring: "NOT_WIRED" as const,
  externalEffects: "NONE" as const,
  fixtureOnly: true as const,
};

/**
 * After stop retains post-apply work for reconcile, fence the effect ledger:
 * refuse a second apply-attempt record; allow settle UNKNOWN only; never
 * invent VERIFIED (T-X017 deepen). Honesty: NOT_WIRED / NONE.
 */
export function fenceStopAfterDispatchLedgerAttempt(input: {
  stopRetainedForReconcile: boolean;
  effectState: EffectStateValue;
  operationId: string;
  /** Digest of the first (dispatch-started) apply attempt. */
  payloadDigest: string;
  /** Distinct digest proposed for a second apply attempt. */
  secondApplyDigest?: string;
  recordedAtIso: string;
  attempt: StopAfterDispatchLedgerAttempt;
  /** Optional pre-seeded ledger (must already hold the first intent). */
  ledger?: SimulatedEffectLedger;
}): StopAfterDispatchLedgerFenceResult {
  const ledger = input.ledger ?? new SimulatedEffectLedger();
  if (!ledger.get(input.operationId)) {
    ledger.recordIntent(
      input.operationId,
      input.payloadDigest,
      input.recordedAtIso,
    );
    ledger.settle(input.operationId, "ACCEPTED_PENDING");
  }

  const existing = ledger.get(input.operationId);
  const applyAttemptCount = existing ? 1 : 0;
  const postStopRetain =
    input.stopRetainedForReconcile && isPostApplyPhase(input.effectState);

  if (!postStopRetain) {
    if (input.attempt === "settle_unknown") {
      const settled = ledger.settle(
        input.operationId,
        "UNKNOWN_REMOTE_OUTCOME",
      );
      return {
        allowed: true,
        code: "UNKNOWN_SETTLE_OK",
        applyAttemptCount: Math.max(applyAttemptCount, 1),
        ledgerOutcome: settled.outcome,
        hasVerified: false,
        reason: "UNKNOWN settle allowed outside stop-retain fence",
        ...LEDGER_FENCE_HONESTY,
      };
    }
    if (input.attempt === "forge_verified") {
      return {
        allowed: false,
        code: "VERIFIED_FORGE_REFUSED",
        applyAttemptCount: Math.max(applyAttemptCount, 1),
        ledgerOutcome: existing?.outcome ?? null,
        hasVerified: false,
        reason: "Fixture path never invents VERIFIED",
        ...LEDGER_FENCE_HONESTY,
      };
    }
    // record_second_apply outside retain: same-digest idempotent OK; fence N/A.
    const replayed = ledger.recordIntent(
      input.operationId,
      input.payloadDigest,
      input.recordedAtIso,
    );
    return {
      allowed: true,
      code: "PRE_STOP_APPLY_OK",
      applyAttemptCount: 1,
      ledgerOutcome: replayed.outcome,
      hasVerified: false,
      reason:
        "Fence applies only after stop retains post-apply work for reconcile",
      ...LEDGER_FENCE_HONESTY,
    };
  }

  // Stop retained post-apply → fence second apply; UNKNOWN only; no VERIFIED.
  if (input.attempt === "record_second_apply") {
    const digest =
      input.secondApplyDigest ?? `${input.payloadDigest}-second`;
    // H14: blank / whitespace-only digest is a distinct second apply, not replay.
    if (digest.trim() === "") {
      return {
        allowed: false,
        code: "SECOND_APPLY_REFUSED",
        applyAttemptCount: 1,
        ledgerOutcome: existing?.outcome ?? null,
        hasVerified: false,
        reason:
          "Blank/whitespace secondApplyDigest is not an idempotent replay — refuse second apply (T-X017)",
        ...LEDGER_FENCE_HONESTY,
      };
    }
    if (digest === input.payloadDigest) {
      const replayed = ledger.recordIntent(
        input.operationId,
        digest,
        input.recordedAtIso,
      );
      return {
        allowed: true,
        code: "PRE_STOP_APPLY_OK",
        applyAttemptCount: 1,
        ledgerOutcome: replayed.outcome,
        hasVerified: false,
        reason:
          "Same-digest idempotent replay is not a second apply attempt",
        ...LEDGER_FENCE_HONESTY,
      };
    }
    // Do not mutate ledger with a distinct second apply — fence refuses.
    return {
      allowed: false,
      code: "SECOND_APPLY_REFUSED",
      applyAttemptCount: 1,
      ledgerOutcome: existing?.outcome ?? null,
      hasVerified: false,
      reason:
        "Stop retained post-apply for reconcile — refuse second apply-attempt record (T-X017)",
      ...LEDGER_FENCE_HONESTY,
    };
  }

  if (input.attempt === "settle_unknown") {
    const settled = ledger.settle(
      input.operationId,
      "UNKNOWN_REMOTE_OUTCOME",
    );
    return {
      allowed: true,
      code: "UNKNOWN_SETTLE_OK",
      applyAttemptCount: 1,
      ledgerOutcome: settled.outcome,
      hasVerified: false,
      reason:
        "After stop retain, settle UNKNOWN_REMOTE_OUTCOME only (reconcile; not VERIFIED)",
      ...LEDGER_FENCE_HONESTY,
    };
  }

  // forge_verified — never settle VERIFIED on this path.
  return {
    allowed: false,
    code: "VERIFIED_FORGE_REFUSED",
    applyAttemptCount: 1,
    ledgerOutcome: existing?.outcome ?? null,
    hasVerified: false,
    reason:
      "Stop-after-dispatch never invents VERIFIED — UNKNOWN settle only (T-X017)",
    ...LEDGER_FENCE_HONESTY,
  };
}

/**
 * Hillclimb + deepen suite (T-X017): every EffectState disposition, SM forbid
 * edges, cancelEligibleQueuedWork retain/cancel split, forged post-apply
 * cancel refused, attempt-ledger fence (second apply refused; UNKNOWN only;
 * never VERIFIED; post-UNKNOWN second apply still refused; VERIFYING/COMPLETE
 * fence; empty/whitespace second digest refused; double UNKNOWN settle;
 * forge after UNKNOWN refused; pre-apply retain-flag does not engage fence;
 * same-digest after UNKNOWN OK; cross-op isolation; COMPLETE UNKNOWN settle;
 * multi-digest refuse; VERIFYING settle; AUTHORIZED retain-flag N/A;
 * omitted digest default refuse; post-refuse same-digest; LEASED N/A;
 * RUNNING retain N/A; post-same distinct refuse; forge outside retain;
 * WAITING_* retain N/A; FAILED_RETRYABLE retain N/A; pre-apply settle outside UNKNOWN),
 * honesty fields NOT_WIRED/NONE.
 */
export function evaluateStopAfterDispatchAttackSuite(): {
  passed: boolean;
  details: string[];
  dispositions: StopAfterDispatchDisposition[];
} {
  const details: string[] = [];
  const dispositions: StopAfterDispatchDisposition[] = [];
  let passed = true;

  const allStates = Object.values(EffectState) as EffectStateValue[];
  for (const state of allStates) {
    const d = classifyStopAfterDispatchDisposition(state);
    dispositions.push(d);

    if (
      d.liveProviderWiring !== "NOT_WIRED" ||
      d.externalEffects !== "NONE" ||
      d.fixtureOnly !== true
    ) {
      passed = false;
      details.push(`${state}: honesty fields missing`);
      continue;
    }

    const expectRetain = isPostApplyPhase(state);
    if (expectRetain) {
      if (
        d.disposition !== "RETAIN_FOR_RECONCILE" ||
        d.cancelled !== false ||
        d.retainedForReconcile !== true ||
        d.toState !== null
      ) {
        passed = false;
        details.push(`${state}: expected RETAIN_FOR_RECONCILE`);
      }
    } else if (
      state === EffectState.CANCELLED ||
      state === EffectState.QUARANTINED
    ) {
      if (d.disposition !== "ALREADY_TERMINAL" || d.cancelled !== false) {
        passed = false;
        details.push(`${state}: expected ALREADY_TERMINAL`);
      }
    } else if (canTransition(state, EffectState.CANCELLED)) {
      if (
        d.disposition !== "CANCEL" ||
        d.cancelled !== true ||
        d.toState !== EffectState.CANCELLED
      ) {
        passed = false;
        details.push(`${state}: expected CANCEL`);
      }
    }
  }
  if (passed) {
    details.push(
      "Attack suite: every EffectState classified with NOT_WIRED/NONE",
    );
  }

  // State-machine forbid: APPLYING/VERIFYING → CANCELLED.
  if (canTransition(EffectState.APPLYING, EffectState.CANCELLED) !== false) {
    passed = false;
    details.push("Expected APPLYING→CANCELLED forbidden");
  } else {
    details.push("APPLYING→CANCELLED forbidden");
  }
  if (canTransition(EffectState.VERIFYING, EffectState.CANCELLED) !== false) {
    passed = false;
    details.push("Expected VERIFYING→CANCELLED forbidden");
  } else {
    details.push("VERIFYING→CANCELLED forbidden");
  }

  // Honest reconcile path still allowed.
  try {
    const next = transition(
      EffectState.APPLYING,
      EffectState.UNKNOWN_REMOTE_OUTCOME,
    );
    if (next === EffectState.UNKNOWN_REMOTE_OUTCOME) {
      details.push("APPLYING→UNKNOWN_REMOTE_OUTCOME allowed");
    } else {
      passed = false;
      details.push("APPLYING→URO returned unexpected state");
    }
  } catch {
    passed = false;
    details.push("APPLYING→UNKNOWN_REMOTE_OUTCOME threw");
  }

  // cancelEligibleQueuedWork retains post-apply; cancels pre-apply QUEUED.
  const nowIso = "2026-11-21T18:00:00.000Z";
  const items: CredentialQueuedWorkItem[] = [
    {
      workId: "suite-queued",
      connectionId: "conn-suite",
      capabilityId: "cms_publish",
      operationId: "op-q",
      effectState: EffectState.QUEUED,
      queuedAtIso: nowIso,
      summary: "pre-dispatch",
    },
    {
      workId: "suite-applying",
      connectionId: "conn-suite",
      capabilityId: "cms_publish",
      operationId: "op-a",
      effectState: EffectState.APPLYING,
      queuedAtIso: nowIso,
      summary: "dispatch started",
    },
    {
      workId: "suite-verifying",
      connectionId: "conn-suite",
      capabilityId: "cms_publish",
      operationId: "op-v",
      effectState: EffectState.VERIFYING,
      queuedAtIso: nowIso,
      summary: "pending verify",
    },
    {
      workId: "suite-uro",
      connectionId: "conn-suite",
      capabilityId: "cms_publish",
      operationId: "op-u",
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      queuedAtIso: nowIso,
      summary: "ambiguous remote",
    },
    {
      workId: "suite-complete",
      connectionId: "conn-suite",
      capabilityId: "cms_publish",
      operationId: "op-c",
      effectState: EffectState.COMPLETE,
      queuedAtIso: nowIso,
      summary: "already complete",
    },
  ];
  const results = cancelEligibleQueuedWork(items);
  const byId = new Map(results.map((r) => [r.workId, r]));
  const queued = byId.get("suite-queued");
  const applying = byId.get("suite-applying");
  const verifying = byId.get("suite-verifying");
  const uro = byId.get("suite-uro");
  const complete = byId.get("suite-complete");

  const honestyOk = (r: QueuedWorkCancelResult | undefined) =>
    r?.liveProviderWiring === "NOT_WIRED" && r?.externalEffects === "NONE";

  if (
    queued?.cancelled === true &&
    applying?.cancelled === false &&
    applying?.retainedForReconcile === true &&
    verifying?.cancelled === false &&
    verifying?.retainedForReconcile === true &&
    uro?.cancelled === false &&
    uro?.retainedForReconcile === true &&
    complete?.cancelled === false &&
    complete?.retainedForReconcile === true &&
    honestyOk(queued) &&
    honestyOk(applying) &&
    honestyOk(verifying) &&
    honestyOk(uro) &&
    honestyOk(complete)
  ) {
    details.push(
      "cancelEligibleQueuedWork retains APPLYING/VERIFYING/URO/COMPLETE; cancels QUEUED; honesty NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(
      `cancelEligibleQueuedWork unexpected queued=${JSON.stringify(queued)} applying=${JSON.stringify(applying)}`,
    );
  }

  // Forged cancel against APPLYING must be refused by applyQueuedCancelResults.
  const forged: QueuedWorkCancelResult[] = [
    {
      workId: "suite-applying",
      fromState: EffectState.APPLYING,
      toState: EffectState.CANCELLED,
      cancelled: true,
      retainedForReconcile: false,
      reason: "forged fake cancel",
      liveProviderWiring: "NOT_WIRED",
      externalEffects: "NONE",
    },
  ];
  const afterForge = applyQueuedCancelResults(
    items.filter((i) => i.workId === "suite-applying"),
    forged,
  );
  if (afterForge[0]?.effectState === EffectState.APPLYING) {
    details.push("Forged APPLYING→CANCELLED cancel result refused");
  } else {
    passed = false;
    details.push(
      `Forged cancel unexpectedly produced ${afterForge[0]?.effectState}`,
    );
  }

  // Deepen: attempt ledger fence after stop retain.
  const fenceLedger = new SimulatedEffectLedger();
  const fenceOp = "op-fence-suite";
  fenceLedger.recordIntent(fenceOp, "digest-fence", nowIso);
  fenceLedger.settle(fenceOp, "ACCEPTED_PENDING");

  const second = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: fenceOp,
    payloadDigest: "digest-fence",
    secondApplyDigest: "digest-fence-second",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: fenceLedger,
  });
  const unknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: fenceOp,
    payloadDigest: "digest-fence",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: fenceLedger,
  });
  const forgedVerified = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: fenceOp,
    payloadDigest: "digest-fence",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
    ledger: fenceLedger,
  });

  if (
    second.allowed === false &&
    second.code === "SECOND_APPLY_REFUSED" &&
    second.applyAttemptCount === 1 &&
    second.hasVerified === false &&
    second.liveProviderWiring === "NOT_WIRED" &&
    second.externalEffects === "NONE" &&
    unknown.allowed === true &&
    unknown.code === "UNKNOWN_SETTLE_OK" &&
    unknown.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    unknown.hasVerified === false &&
    forgedVerified.allowed === false &&
    forgedVerified.code === "VERIFIED_FORGE_REFUSED" &&
    forgedVerified.hasVerified === false &&
    fenceLedger.hasVerified(fenceOp) === false
  ) {
    details.push(
      "Attempt ledger fence: second apply refused; UNKNOWN settle only; VERIFIED forge refused; NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(
      `Attempt ledger fence unexpected second=${JSON.stringify(second)} unknown=${JSON.stringify(unknown)} forgedVerified=${JSON.stringify(forgedVerified)}`,
    );
  }

  // H13: after UNKNOWN settle, second apply still refused (applyAttemptCount stays 1).
  const afterUnknownSecond = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: fenceOp,
    payloadDigest: "digest-fence",
    secondApplyDigest: "digest-fence-after-unknown",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: fenceLedger,
  });
  if (
    afterUnknownSecond.allowed === false &&
    afterUnknownSecond.code === "SECOND_APPLY_REFUSED" &&
    afterUnknownSecond.applyAttemptCount === 1 &&
    afterUnknownSecond.hasVerified === false
  ) {
    details.push(
      "H13 post-UNKNOWN second apply still SECOND_APPLY_REFUSED (applyAttemptCount=1)",
    );
  } else {
    passed = false;
    details.push(
      `H13 post-UNKNOWN second unexpectedly ${JSON.stringify(afterUnknownSecond)}`,
    );
  }

  // H13: VERIFYING + COMPLETE fence second apply.
  for (const state of [
    EffectState.VERIFYING,
    EffectState.COMPLETE,
  ] as const) {
    const multi = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: state,
      operationId: `op-fence-${state}`,
      payloadDigest: `digest-${state}`,
      secondApplyDigest: `digest-${state}-second`,
      recordedAtIso: nowIso,
      attempt: "record_second_apply",
    });
    if (
      multi.allowed === false &&
      multi.code === "SECOND_APPLY_REFUSED" &&
      multi.applyAttemptCount === 1 &&
      multi.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(`H13 ${state} second apply → SECOND_APPLY_REFUSED`);
    } else {
      passed = false;
      details.push(`H13 ${state} unexpectedly ${JSON.stringify(multi)}`);
    }
  }

  // H13: empty secondApplyDigest is a distinct second apply → refused.
  const emptyDigest = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-empty-digest",
    payloadDigest: "digest-empty-base",
    secondApplyDigest: "",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    emptyDigest.allowed === false &&
    emptyDigest.code === "SECOND_APPLY_REFUSED" &&
    emptyDigest.applyAttemptCount === 1
  ) {
    details.push(
      "H13 empty secondApplyDigest → SECOND_APPLY_REFUSED (not idempotent replay)",
    );
  } else {
    passed = false;
    details.push(
      `H13 empty digest unexpectedly ${JSON.stringify(emptyDigest)}`,
    );
  }

  // H14: whitespace-only secondApplyDigest refused.
  const whitespaceDigest = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-whitespace-digest",
    payloadDigest: "digest-ws-base",
    secondApplyDigest: "   \t\n  ",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    whitespaceDigest.allowed === false &&
    whitespaceDigest.code === "SECOND_APPLY_REFUSED" &&
    whitespaceDigest.applyAttemptCount === 1 &&
    whitespaceDigest.hasVerified === false
  ) {
    details.push(
      "H14 whitespace secondApplyDigest → SECOND_APPLY_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `H14 whitespace digest unexpectedly ${JSON.stringify(whitespaceDigest)}`,
    );
  }

  // H14: double settle_unknown stays UNKNOWN; never invents VERIFIED.
  const doubleLedger = new SimulatedEffectLedger();
  const firstUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-double-unknown",
    payloadDigest: "digest-double",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: doubleLedger,
  });
  const secondUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-double-unknown",
    payloadDigest: "digest-double",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: doubleLedger,
  });
  const forgeAfterUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-double-unknown",
    payloadDigest: "digest-double",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
    ledger: doubleLedger,
  });
  if (
    firstUnknown.allowed === true &&
    firstUnknown.code === "UNKNOWN_SETTLE_OK" &&
    secondUnknown.allowed === true &&
    secondUnknown.code === "UNKNOWN_SETTLE_OK" &&
    secondUnknown.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    secondUnknown.hasVerified === false &&
    forgeAfterUnknown.allowed === false &&
    forgeAfterUnknown.code === "VERIFIED_FORGE_REFUSED" &&
    doubleLedger.hasVerified("op-fence-double-unknown") === false
  ) {
    details.push(
      "H14 double UNKNOWN settle stays UNKNOWN; forge VERIFIED after UNKNOWN refused",
    );
  } else {
    passed = false;
    details.push(
      `H14 double UNKNOWN unexpectedly first=${JSON.stringify(firstUnknown)} second=${JSON.stringify(secondUnknown)} forge=${JSON.stringify(forgeAfterUnknown)}`,
    );
  }

  // H14: stopRetained flag alone on pre-apply does not engage ledger fence.
  const preApply = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.QUEUED,
    operationId: "op-fence-pre-apply",
    payloadDigest: "digest-pre",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    preApply.allowed === true &&
    preApply.code === "PRE_STOP_APPLY_OK" &&
    preApply.applyAttemptCount === 1 &&
    preApply.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H14 retain-flag on QUEUED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(
      `H14 pre-apply retain unexpectedly ${JSON.stringify(preApply)}`,
    );
  }

  // H15: same-digest idempotent replay after UNKNOWN settle is OK (not second apply).
  const sameLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-same-digest",
    payloadDigest: "digest-same",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: sameLedger,
  });
  const sameReplay = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-same-digest",
    payloadDigest: "digest-same",
    secondApplyDigest: "digest-same",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: sameLedger,
  });
  if (
    sameReplay.allowed === true &&
    sameReplay.code === "PRE_STOP_APPLY_OK" &&
    sameReplay.applyAttemptCount === 1 &&
    sameReplay.hasVerified === false &&
    sameLedger.hasVerified("op-fence-same-digest") === false
  ) {
    details.push(
      "H15 same-digest replay after UNKNOWN → PRE_STOP_APPLY_OK (not second apply)",
    );
  } else {
    passed = false;
    details.push(
      `H15 same-digest unexpectedly ${JSON.stringify(sameReplay)}`,
    );
  }

  // H15: cross-op isolation — refuse on op-A does not invent VERIFIED on op-B.
  const crossLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-cross-a",
    payloadDigest: "digest-a",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: crossLedger,
  });
  const crossRefuse = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-cross-a",
    payloadDigest: "digest-a",
    secondApplyDigest: "digest-a-second",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: crossLedger,
  });
  const crossB = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-cross-b",
    payloadDigest: "digest-b",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: crossLedger,
  });
  if (
    crossRefuse.allowed === false &&
    crossRefuse.code === "SECOND_APPLY_REFUSED" &&
    crossB.allowed === true &&
    crossB.code === "UNKNOWN_SETTLE_OK" &&
    crossLedger.hasVerified("op-fence-cross-a") === false &&
    crossLedger.hasVerified("op-fence-cross-b") === false &&
    crossB.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H15 cross-op isolation: op-A second refuse; op-B UNKNOWN settle; no VERIFIED",
    );
  } else {
    passed = false;
    details.push(
      `H15 cross-op unexpectedly refuse=${JSON.stringify(crossRefuse)} b=${JSON.stringify(crossB)}`,
    );
  }

  // H15: COMPLETE + settle_unknown OK; forge VERIFIED refused.
  const completeUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.COMPLETE,
    operationId: "op-fence-complete-unknown",
    payloadDigest: "digest-complete",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  const completeForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.COMPLETE,
    operationId: "op-fence-complete-forge",
    payloadDigest: "digest-complete-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (
    completeUnknown.allowed === true &&
    completeUnknown.code === "UNKNOWN_SETTLE_OK" &&
    completeUnknown.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    completeUnknown.hasVerified === false &&
    completeForge.allowed === false &&
    completeForge.code === "VERIFIED_FORGE_REFUSED" &&
    completeForge.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H15 COMPLETE settle UNKNOWN only; forge VERIFIED refused; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `H15 COMPLETE unexpectedly unknown=${JSON.stringify(completeUnknown)} forge=${JSON.stringify(completeForge)}`,
    );
  }

  // H17: three distinct second digests all refused; applyAttemptCount stays 1.
  const multiLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-multi-digest",
    payloadDigest: "digest-multi-base",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: multiLedger,
  });
  let multiOk = true;
  for (const suffix of ["-a", "-b", "-c"]) {
    const r = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: "op-fence-multi-digest",
      payloadDigest: "digest-multi-base",
      secondApplyDigest: `digest-multi${suffix}`,
      recordedAtIso: nowIso,
      attempt: "record_second_apply",
      ledger: multiLedger,
    });
    if (
      r.allowed !== false ||
      r.code !== "SECOND_APPLY_REFUSED" ||
      r.applyAttemptCount !== 1 ||
      r.hasVerified !== false
    ) {
      multiOk = false;
      details.push(`H17 multi-digest ${suffix} unexpectedly ${JSON.stringify(r)}`);
      break;
    }
  }
  if (multiOk && multiLedger.hasVerified("op-fence-multi-digest") === false) {
    details.push(
      "H17 multi distinct second digests all SECOND_APPLY_REFUSED (applyAttemptCount=1)",
    );
  } else if (multiOk) {
    passed = false;
    details.push("H17 multi-digest invented VERIFIED");
  } else {
    passed = false;
  }

  // H17: VERIFYING settle UNKNOWN then forge refused.
  const verLedger = new SimulatedEffectLedger();
  const verUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.VERIFYING,
    operationId: "op-fence-verifying-unknown",
    payloadDigest: "digest-verifying",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: verLedger,
  });
  const verForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.VERIFYING,
    operationId: "op-fence-verifying-unknown",
    payloadDigest: "digest-verifying",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
    ledger: verLedger,
  });
  if (
    verUnknown.allowed === true &&
    verUnknown.code === "UNKNOWN_SETTLE_OK" &&
    verUnknown.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    verForge.allowed === false &&
    verForge.code === "VERIFIED_FORGE_REFUSED" &&
    verLedger.hasVerified("op-fence-verifying-unknown") === false
  ) {
    details.push(
      "H17 VERIFYING settle UNKNOWN only; forge VERIFIED refused",
    );
  } else {
    passed = false;
    details.push(
      `H17 VERIFYING unexpectedly unknown=${JSON.stringify(verUnknown)} forge=${JSON.stringify(verForge)}`,
    );
  }

  // H17: AUTHORIZED + retain-flag does not engage fence.
  const authPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.AUTHORIZED,
    operationId: "op-fence-authorized-pre",
    payloadDigest: "digest-auth",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    authPre.allowed === true &&
    authPre.code === "PRE_STOP_APPLY_OK" &&
    authPre.applyAttemptCount === 1 &&
    authPre.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H17 retain-flag on AUTHORIZED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(
      `H17 AUTHORIZED retain unexpectedly ${JSON.stringify(authPre)}`,
    );
  }

  // H18: omitted secondApplyDigest defaults to payload-second → refused.
  const defLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-default-digest",
    payloadDigest: "digest-default-base",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: defLedger,
  });
  const defaulted = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-default-digest",
    payloadDigest: "digest-default-base",
    // secondApplyDigest omitted → defaults to digest-default-base-second
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: defLedger,
  });
  if (
    defaulted.allowed === false &&
    defaulted.code === "SECOND_APPLY_REFUSED" &&
    defaulted.applyAttemptCount === 1 &&
    defaulted.hasVerified === false
  ) {
    details.push(
      "H18 omitted secondApplyDigest defaults to distinct digest → SECOND_APPLY_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `H18 defaulted digest unexpectedly ${JSON.stringify(defaulted)}`,
    );
  }

  // H18: after refuse, same-digest idempotent replay still OK.
  const sameAfter = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-default-digest",
    payloadDigest: "digest-default-base",
    secondApplyDigest: "digest-default-base",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: defLedger,
  });
  if (
    sameAfter.allowed === true &&
    sameAfter.code === "PRE_STOP_APPLY_OK" &&
    sameAfter.applyAttemptCount === 1 &&
    defLedger.hasVerified("op-fence-default-digest") === false
  ) {
    details.push(
      "H18 post-refuse same-digest replay → PRE_STOP_APPLY_OK (not second apply)",
    );
  } else {
    passed = false;
    details.push(
      `H18 post-refuse same-digest unexpectedly ${JSON.stringify(sameAfter)}`,
    );
  }

  // H18: LEASED + retain-flag does not engage fence.
  const leasedPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.LEASED,
    operationId: "op-fence-leased-pre",
    payloadDigest: "digest-leased",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    leasedPre.allowed === true &&
    leasedPre.code === "PRE_STOP_APPLY_OK" &&
    leasedPre.applyAttemptCount === 1 &&
    leasedPre.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H18 retain-flag on LEASED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(
      `H18 LEASED retain unexpectedly ${JSON.stringify(leasedPre)}`,
    );
  }

  // H19: RUNNING + retain-flag does not engage fence.
  const runningPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.RUNNING,
    operationId: "op-fence-running-pre",
    payloadDigest: "digest-running",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    runningPre.allowed === true &&
    runningPre.code === "PRE_STOP_APPLY_OK" &&
    runningPre.applyAttemptCount === 1 &&
    runningPre.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H19 retain-flag on RUNNING does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(
      `H19 RUNNING retain unexpectedly ${JSON.stringify(runningPre)}`,
    );
  }

  // H19: after same-digest OK, a distinct digest is still refused.
  const seqLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-post-same",
    payloadDigest: "digest-seq",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: seqLedger,
  });
  const seqSame = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-post-same",
    payloadDigest: "digest-seq",
    secondApplyDigest: "digest-seq",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: seqLedger,
  });
  const seqDistinct = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-post-same",
    payloadDigest: "digest-seq",
    secondApplyDigest: "digest-seq-other",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: seqLedger,
  });
  if (
    seqSame.allowed === true &&
    seqSame.code === "PRE_STOP_APPLY_OK" &&
    seqDistinct.allowed === false &&
    seqDistinct.code === "SECOND_APPLY_REFUSED" &&
    seqDistinct.applyAttemptCount === 1 &&
    seqLedger.hasVerified("op-fence-post-same") === false
  ) {
    details.push(
      "H19 after same-digest OK, distinct digest still SECOND_APPLY_REFUSED",
    );
  } else {
    passed = false;
    details.push(
      `H19 post-same unexpectedly same=${JSON.stringify(seqSame)} distinct=${JSON.stringify(seqDistinct)}`,
    );
  }

  // H19: forge_verified with stopRetained=false still refused (honesty).
  const forgeOutside = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-forge-outside",
    payloadDigest: "digest-forge-out",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (
    forgeOutside.allowed === false &&
    forgeOutside.code === "VERIFIED_FORGE_REFUSED" &&
    forgeOutside.hasVerified === false &&
    forgeOutside.liveProviderWiring === "NOT_WIRED" &&
    forgeOutside.externalEffects === "NONE"
  ) {
    details.push(
      "H19 forge_verified outside stop-retain still VERIFIED_FORGE_REFUSED; NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(
      `H19 forge outside unexpectedly ${JSON.stringify(forgeOutside)}`,
    );
  }

  // H20: WAITING_* + retain-flag does not engage fence.
  for (const [label, state] of [
    ["WAITING_DEPENDENCY", EffectState.WAITING_DEPENDENCY],
    ["WAITING_HUMAN", EffectState.WAITING_HUMAN],
    ["WAITING_AUTHENTICATION", EffectState.WAITING_AUTHENTICATION],
  ] as const) {
    const waitingPre = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: state,
      operationId: `op-fence-${label.toLowerCase()}`,
      payloadDigest: `digest-${label.toLowerCase()}`,
      recordedAtIso: nowIso,
      attempt: "record_second_apply",
    });
    if (
      waitingPre.allowed === true &&
      waitingPre.code === "PRE_STOP_APPLY_OK" &&
      waitingPre.applyAttemptCount === 1 &&
      waitingPre.liveProviderWiring === "NOT_WIRED" &&
      waitingPre.externalEffects === "NONE"
    ) {
      details.push(
        `H20 retain-flag on ${label} does not engage fence (PRE_STOP_APPLY_OK)`,
      );
    } else {
      passed = false;
      details.push(
        `H20 ${label} retain unexpectedly ${JSON.stringify(waitingPre)}`,
      );
    }
  }

  // H20: settle_unknown outside stop-retain → UNKNOWN only; never VERIFIED.
  const settleOutsideLedger = new SimulatedEffectLedger();
  const settleOutside = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-settle-outside",
    payloadDigest: "digest-settle-out",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: settleOutsideLedger,
  });
  if (
    settleOutside.allowed === true &&
    settleOutside.code === "UNKNOWN_SETTLE_OK" &&
    settleOutside.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    settleOutside.hasVerified === false &&
    settleOutsideLedger.hasVerified("op-fence-settle-outside") === false &&
    settleOutside.liveProviderWiring === "NOT_WIRED" &&
    settleOutside.externalEffects === "NONE"
  ) {
    details.push(
      "H20 settle_unknown outside stop-retain → UNKNOWN_SETTLE_OK; never VERIFIED; NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(
      `H20 settle outside unexpectedly ${JSON.stringify(settleOutside)}`,
    );
  }

  // H21: FAILED_RETRYABLE + retain-flag does not engage fence.
  const failedPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.FAILED_RETRYABLE,
    operationId: "op-fence-failed-retry",
    payloadDigest: "digest-failed",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    failedPre.allowed === true &&
    failedPre.code === "PRE_STOP_APPLY_OK" &&
    failedPre.applyAttemptCount === 1 &&
    failedPre.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H21 retain-flag on FAILED_RETRYABLE does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(
      `H21 FAILED_RETRYABLE retain unexpectedly ${JSON.stringify(failedPre)}`,
    );
  }

  // H21: settle_unknown outside stop-retain on QUEUED (pre-apply) → UNKNOWN only.
  const queuedSettleLedger = new SimulatedEffectLedger();
  const queuedSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.QUEUED,
    operationId: "op-fence-queued-settle",
    payloadDigest: "digest-q-settle",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: queuedSettleLedger,
  });
  if (
    queuedSettle.allowed === true &&
    queuedSettle.code === "UNKNOWN_SETTLE_OK" &&
    queuedSettle.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    queuedSettle.hasVerified === false &&
    queuedSettleLedger.hasVerified("op-fence-queued-settle") === false
  ) {
    details.push(
      "H21 settle_unknown outside stop-retain on QUEUED → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(
      `H21 QUEUED settle outside unexpectedly ${JSON.stringify(queuedSettle)}`,
    );
  }

  // H22: QUARANTINED + retain-flag does not engage fence.
  const quarPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.QUARANTINED,
    operationId: "op-fence-quar",
    payloadDigest: "digest-quar",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    quarPre.allowed === true &&
    quarPre.code === "PRE_STOP_APPLY_OK" &&
    quarPre.hasVerified === false
  ) {
    details.push(
      "H22 retain-flag on QUARANTINED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(`H22 QUARANTINED unexpectedly ${JSON.stringify(quarPre)}`);
  }

  // H22: settle_unknown outside stop-retain on VERIFYING → UNKNOWN only.
  const verSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.VERIFYING,
    operationId: "op-fence-ver-settle",
    payloadDigest: "digest-ver",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (
    verSettle.code === "UNKNOWN_SETTLE_OK" &&
    verSettle.hasVerified === false &&
    verSettle.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H22 settle_unknown outside stop-retain on VERIFYING → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(
      `H22 VERIFYING settle outside unexpectedly ${JSON.stringify(verSettle)}`,
    );
  }

  // H23: CANCELLED + retain-flag does not engage fence.
  const canPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.CANCELLED,
    operationId: "op-fence-can",
    payloadDigest: "digest-can",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (canPre.code === "PRE_STOP_APPLY_OK" && !canPre.hasVerified) {
    details.push("H23 retain-flag on CANCELLED does not engage fence (PRE_STOP_APPLY_OK)");
  } else { passed = false; details.push(`H23 CANCELLED ${JSON.stringify(canPre)}`); }

  // H23: settle_unknown outside stop-retain on AUTHORIZED → UNKNOWN only.
  const authSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.AUTHORIZED,
    operationId: "op-fence-auth-s",
    payloadDigest: "digest-auth-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (authSettle.code === "UNKNOWN_SETTLE_OK" && !authSettle.hasVerified) {
    details.push("H23 settle_unknown outside stop-retain on AUTHORIZED → UNKNOWN_SETTLE_OK; never VERIFIED");
  } else { passed = false; details.push(`H23 AUTHORIZED settle ${JSON.stringify(authSettle)}`); }

  // H24: settle_unknown outside stop-retain on QUARANTINED → UNKNOWN only.
  const quarSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.QUARANTINED,
    operationId: "op-fence-quar-s",
    payloadDigest: "digest-quar-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (
    quarSettle.code === "UNKNOWN_SETTLE_OK" &&
    !quarSettle.hasVerified &&
    quarSettle.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H24 settle_unknown outside stop-retain on QUARANTINED → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H24 QUARANTINED settle ${JSON.stringify(quarSettle)}`);
  }

  // H24: settle_unknown outside stop-retain on CANCELLED → UNKNOWN only.
  const canSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.CANCELLED,
    operationId: "op-fence-can-s",
    payloadDigest: "digest-can-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (canSettle.code === "UNKNOWN_SETTLE_OK" && !canSettle.hasVerified) {
    details.push(
      "H24 settle_unknown outside stop-retain on CANCELLED → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H24 CANCELLED settle ${JSON.stringify(canSettle)}`);
  }

  // H25: settle_unknown outside stop-retain on FAILED_RETRYABLE → UNKNOWN only.
  const failedSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.FAILED_RETRYABLE,
    operationId: "op-fence-fail-s",
    payloadDigest: "digest-fail-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (failedSettle.code === "UNKNOWN_SETTLE_OK" && !failedSettle.hasVerified) {
    details.push(
      "H25 settle_unknown outside stop-retain on FAILED_RETRYABLE → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H25 FAILED_RETRYABLE settle ${JSON.stringify(failedSettle)}`);
  }

  // H25: settle_unknown outside stop-retain on RUNNING → UNKNOWN only.
  const runSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.RUNNING,
    operationId: "op-fence-run-s",
    payloadDigest: "digest-run-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (runSettle.code === "UNKNOWN_SETTLE_OK" && !runSettle.hasVerified) {
    details.push(
      "H25 settle_unknown outside stop-retain on RUNNING → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H25 RUNNING settle ${JSON.stringify(runSettle)}`);
  }

  // H26: settle_unknown outside stop-retain on LEASED → UNKNOWN only.
  const leasedSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.LEASED,
    operationId: "op-fence-lease-s",
    payloadDigest: "digest-lease-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (leasedSettle.code === "UNKNOWN_SETTLE_OK" && !leasedSettle.hasVerified) {
    details.push(
      "H26 settle_unknown outside stop-retain on LEASED → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H26 LEASED settle ${JSON.stringify(leasedSettle)}`);
  }

  // H26: settle_unknown outside stop-retain on WAITING_HUMAN → UNKNOWN only.
  const waitSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.WAITING_HUMAN,
    operationId: "op-fence-wait-s",
    payloadDigest: "digest-wait-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (waitSettle.code === "UNKNOWN_SETTLE_OK" && !waitSettle.hasVerified) {
    details.push(
      "H26 settle_unknown outside stop-retain on WAITING_HUMAN → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H26 WAITING_HUMAN settle ${JSON.stringify(waitSettle)}`);
  }

  // H27: settle_unknown outside on WAITING_DEPENDENCY → UNKNOWN only.
  const depSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.WAITING_DEPENDENCY,
    operationId: "op-fence-dep-s",
    payloadDigest: "digest-dep-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (depSettle.code === "UNKNOWN_SETTLE_OK" && !depSettle.hasVerified) {
    details.push(
      "H27 settle_unknown outside stop-retain on WAITING_DEPENDENCY → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H27 WAITING_DEPENDENCY settle ${JSON.stringify(depSettle)}`);
  }

  // H27: settle_unknown outside on WAITING_AUTHENTICATION → UNKNOWN only.
  const authWaitSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.WAITING_AUTHENTICATION,
    operationId: "op-fence-wauth-s",
    payloadDigest: "digest-wauth-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (authWaitSettle.code === "UNKNOWN_SETTLE_OK" && !authWaitSettle.hasVerified) {
    details.push(
      "H27 settle_unknown outside stop-retain on WAITING_AUTHENTICATION → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H27 WAITING_AUTHENTICATION settle ${JSON.stringify(authWaitSettle)}`);
  }

  // H28: settle_unknown outside on UNKNOWN_REMOTE_OUTCOME → UNKNOWN only.
  const uroSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-uro-s",
    payloadDigest: "digest-uro-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (uroSettle.code === "UNKNOWN_SETTLE_OK" && !uroSettle.hasVerified) {
    details.push(
      "H28 settle_unknown outside stop-retain on UNKNOWN_REMOTE_OUTCOME → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H28 URO settle ${JSON.stringify(uroSettle)}`);
  }

  // H28: settle_unknown outside on COMPLETE → UNKNOWN only.
  const completeSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.COMPLETE,
    operationId: "op-fence-complete-s",
    payloadDigest: "digest-complete-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (completeSettle.code === "UNKNOWN_SETTLE_OK" && !completeSettle.hasVerified) {
    details.push(
      "H28 settle_unknown outside stop-retain on COMPLETE → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H28 COMPLETE settle ${JSON.stringify(completeSettle)}`);
  }

  // H29: forge_verified outside stop-retain on QUEUED → refused (not VERIFIED).
  const queuedForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.QUEUED,
    operationId: "op-fence-q-forge",
    payloadDigest: "digest-q-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (queuedForge.code === "VERIFIED_FORGE_REFUSED" && !queuedForge.hasVerified) {
    details.push(
      "H29 forge_verified outside stop-retain on QUEUED → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H29 QUEUED forge ${JSON.stringify(queuedForge)}`);
  }

  // H29: settle_unknown outside on APPLYING → UNKNOWN only (outside-retain path).
  const applyingSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.APPLYING,
    operationId: "op-fence-app-s",
    payloadDigest: "digest-app-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (applyingSettle.code === "UNKNOWN_SETTLE_OK" && !applyingSettle.hasVerified) {
    details.push(
      "H29 settle_unknown outside stop-retain on APPLYING → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H29 APPLYING settle ${JSON.stringify(applyingSettle)}`);
  }

  // H30: settle_unknown outside stop-retain on VALIDATING → UNKNOWN only.
  const validatingSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.VALIDATING,
    operationId: "op-fence-val-s",
    payloadDigest: "digest-val-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (validatingSettle.code === "UNKNOWN_SETTLE_OK" && !validatingSettle.hasVerified) {
    details.push(
      "H30 settle_unknown outside stop-retain on VALIDATING → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H30 VALIDATING settle ${JSON.stringify(validatingSettle)}`);
  }

  // H30: forge_verified outside stop-retain on VERIFYING → refused (not VERIFIED).
  const verifyingForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.VERIFYING,
    operationId: "op-fence-ver-forge",
    payloadDigest: "digest-ver-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (verifyingForge.code === "VERIFIED_FORGE_REFUSED" && !verifyingForge.hasVerified) {
    details.push(
      "H30 forge_verified outside stop-retain on VERIFYING → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H30 VERIFYING forge ${JSON.stringify(verifyingForge)}`);
  }

  // H31: forge_verified outside stop-retain on LEASED → refused (not VERIFIED).
  const leasedForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.LEASED,
    operationId: "op-fence-leased-forge",
    payloadDigest: "digest-leased-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (leasedForge.code === "VERIFIED_FORGE_REFUSED" && !leasedForge.hasVerified) {
    details.push(
      "H31 forge_verified outside stop-retain on LEASED → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H31 LEASED forge ${JSON.stringify(leasedForge)}`);
  }

  // H31: forge_verified outside stop-retain on AUTHORIZED → refused (not VERIFIED).
  const authorizedForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.AUTHORIZED,
    operationId: "op-fence-auth-forge",
    payloadDigest: "digest-auth-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (authorizedForge.code === "VERIFIED_FORGE_REFUSED" && !authorizedForge.hasVerified) {
    details.push(
      "H31 forge_verified outside stop-retain on AUTHORIZED → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H31 AUTHORIZED forge ${JSON.stringify(authorizedForge)}`);
  }

  // H32: forge_verified outside stop-retain on RUNNING → refused (not VERIFIED).
  const runningForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.RUNNING,
    operationId: "op-fence-run-forge",
    payloadDigest: "digest-run-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (runningForge.code === "VERIFIED_FORGE_REFUSED" && !runningForge.hasVerified) {
    details.push(
      "H32 forge_verified outside stop-retain on RUNNING → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H32 RUNNING forge ${JSON.stringify(runningForge)}`);
  }

  // H32: forge_verified outside stop-retain on FAILED_RETRYABLE → refused (not VERIFIED).
  const failedForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.FAILED_RETRYABLE,
    operationId: "op-fence-failed-forge",
    payloadDigest: "digest-failed-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (failedForge.code === "VERIFIED_FORGE_REFUSED" && !failedForge.hasVerified) {
    details.push(
      "H32 forge_verified outside stop-retain on FAILED_RETRYABLE → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H32 FAILED_RETRYABLE forge ${JSON.stringify(failedForge)}`);
  }

  // H33: forge_verified outside stop-retain on CANCELLED → refused (not VERIFIED).
  const cancelledForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.CANCELLED,
    operationId: "op-fence-cancel-forge",
    payloadDigest: "digest-cancel-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (cancelledForge.code === "VERIFIED_FORGE_REFUSED" && !cancelledForge.hasVerified) {
    details.push(
      "H33 forge_verified outside stop-retain on CANCELLED → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H33 CANCELLED forge ${JSON.stringify(cancelledForge)}`);
  }

  // H33: forge_verified outside stop-retain on QUARANTINED → refused (not VERIFIED).
  const quarantinedForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.QUARANTINED,
    operationId: "op-fence-quar-forge",
    payloadDigest: "digest-quar-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (
    quarantinedForge.code === "VERIFIED_FORGE_REFUSED" &&
    !quarantinedForge.hasVerified
  ) {
    details.push(
      "H33 forge_verified outside stop-retain on QUARANTINED → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H33 QUARANTINED forge ${JSON.stringify(quarantinedForge)}`);
  }

  const uroForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: "op-fence-uro-forge",
    payloadDigest: "digest-uro-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (uroForge.code === "VERIFIED_FORGE_REFUSED" && !uroForge.hasVerified) {
    details.push(
      "H34 forge_verified outside stop-retain on UNKNOWN_REMOTE_OUTCOME → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H34 URO forge ${JSON.stringify(uroForge)}`);
  }

  const humanForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.WAITING_HUMAN,
    operationId: "op-fence-human-forge",
    payloadDigest: "digest-human-forge",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (humanForge.code === "VERIFIED_FORGE_REFUSED" && !humanForge.hasVerified) {
    details.push(
      "H34 forge_verified outside stop-retain on WAITING_HUMAN → VERIFIED_FORGE_REFUSED; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H34 WAITING_HUMAN forge ${JSON.stringify(humanForge)}`);
  }

  return { passed, details, dispositions };
}

