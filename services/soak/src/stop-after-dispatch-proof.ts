/**
 * Fixture proof for T-X017 — stop after provider dispatch starts.
 *
 * Once APPLYING has begun, stop must retain work for reconcile (no fake
 * CANCELLED). State machine forbids APPLYING→CANCELLED; cancelEligibleQueuedWork
 * retains post-apply items; attempt ledger fence refuses a second apply after
 * stop retain (including post-UNKNOWN / VERIFYING / COMPLETE / empty/whitespace
 * digest; double UNKNOWN; pre-apply retain-flag N/A; same-digest after UNKNOWN;
 * cross-op isolation; COMPLETE settle UNKNOWN);
 * settle UNKNOWN only; never invent VERIFIED.
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
  evaluateStopAfterDispatchAttackSuite,
  fenceStopAfterDispatchLedgerAttempt,
  isPostApplyPhase,
  transition,
  type CredentialQueuedWorkItem,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X017 fixture ACCEPTED.
 * Hillclimb + deepen: attack suite, forged post-apply cancel refuse,
 * attempt ledger fence + H13–H25 FAILED_RETRYABLE-settle, NOT_WIRED/NONE.
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
  if (canTransition(EffectState.VERIFYING, EffectState.CANCELLED) !== false) {
    passed = false;
    details.push("Expected VERIFYING→CANCELLED forbidden");
  } else {
    details.push("VERIFYING→CANCELLED forbidden");
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

  const honestyOk =
    applying?.liveProviderWiring === "NOT_WIRED" &&
    applying?.externalEffects === "NONE" &&
    verifying?.liveProviderWiring === "NOT_WIRED" &&
    uro?.liveProviderWiring === "NOT_WIRED" &&
    queued?.liveProviderWiring === "NOT_WIRED";
  const postApplyRetained =
    applying?.cancelled === false &&
    applying?.retainedForReconcile === true &&
    verifying?.cancelled === false &&
    verifying?.retainedForReconcile === true &&
    uro?.cancelled === false &&
    uro?.retainedForReconcile === true;
  const preApplyCancelled =
    queued?.cancelled === true && queued.toState === EffectState.CANCELLED;

  if (postApplyRetained && preApplyCancelled && honestyOk) {
    details.push(
      "cancelEligibleQueuedWork retains APPLYING/VERIFYING/URO; cancels QUEUED only; NOT_WIRED/NONE",
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

  // Forged cancel result against APPLYING must be refused.
  const forgedUpdated = applyQueuedCancelResults(
    items.filter((w) => w.workId === "qw-applying"),
    [
      {
        workId: "qw-applying",
        fromState: EffectState.APPLYING,
        toState: EffectState.CANCELLED,
        cancelled: true,
        retainedForReconcile: false,
        reason: "forged fake cancel",
        liveProviderWiring: "NOT_WIRED",
        externalEffects: "NONE",
      },
    ],
  );
  if (forgedUpdated[0]?.effectState === EffectState.APPLYING) {
    details.push("Forged APPLYING→CANCELLED cancel result refused");
  } else {
    passed = false;
    details.push(
      `Forged cancel unexpectedly produced ${forgedUpdated[0]?.effectState}`,
    );
  }

  // 4. Attempt ledger fence: refuse second apply after stop retain;
  // settle UNKNOWN only; never invent VERIFIED.
  const ledger = new SimulatedEffectLedger();
  const opId = `op-x017-${randomUUID().slice(0, 8)}`;
  ledger.recordIntent(opId, "digest-x017", nowIso);
  ledger.settle(opId, "ACCEPTED_PENDING");

  const second = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: opId,
    payloadDigest: "digest-x017",
    secondApplyDigest: "digest-x017-second",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger,
  });
  const unknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: opId,
    payloadDigest: "digest-x017",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger,
  });
  const forgedVerified = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: opId,
    payloadDigest: "digest-x017",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
    ledger,
  });

  if (
    second.allowed === false &&
    second.code === "SECOND_APPLY_REFUSED" &&
    second.applyAttemptCount === 1 &&
    unknown.allowed === true &&
    unknown.code === "UNKNOWN_SETTLE_OK" &&
    unknown.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    forgedVerified.allowed === false &&
    forgedVerified.code === "VERIFIED_FORGE_REFUSED" &&
    ledger.hasVerified(opId) === false &&
    second.liveProviderWiring === "NOT_WIRED" &&
    second.externalEffects === "NONE"
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

  // H13: post-UNKNOWN second apply still refused.
  const afterUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: opId,
    payloadDigest: "digest-x017",
    secondApplyDigest: "digest-x017-after-unknown",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger,
  });
  if (
    afterUnknown.allowed === false &&
    afterUnknown.code === "SECOND_APPLY_REFUSED" &&
    afterUnknown.applyAttemptCount === 1
  ) {
    details.push(
      "H13 post-UNKNOWN second apply still SECOND_APPLY_REFUSED (applyAttemptCount=1)",
    );
  } else {
    passed = false;
    details.push(
      `H13 post-UNKNOWN second unexpectedly ${JSON.stringify(afterUnknown)}`,
    );
  }

  // H14: whitespace secondApplyDigest refused.
  const ws = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-ws`,
    payloadDigest: "digest-x017-ws",
    secondApplyDigest: "  \t\n ",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (
    ws.allowed === false &&
    ws.code === "SECOND_APPLY_REFUSED" &&
    ws.hasVerified === false
  ) {
    details.push("H14 whitespace secondApplyDigest → SECOND_APPLY_REFUSED");
  } else {
    passed = false;
    details.push(`H14 whitespace unexpectedly ${JSON.stringify(ws)}`);
  }

  // H14: double UNKNOWN settle + forge after UNKNOWN.
  const dblLedger = new SimulatedEffectLedger();
  const u1 = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-dbl`,
    payloadDigest: "digest-x017-dbl",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: dblLedger,
  });
  const u2 = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-dbl`,
    payloadDigest: "digest-x017-dbl",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: dblLedger,
  });
  const forgeAfter = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-dbl`,
    payloadDigest: "digest-x017-dbl",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
    ledger: dblLedger,
  });
  if (
    u1.code === "UNKNOWN_SETTLE_OK" &&
    u2.code === "UNKNOWN_SETTLE_OK" &&
    u2.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
    forgeAfter.code === "VERIFIED_FORGE_REFUSED" &&
    dblLedger.hasVerified(`${opId}-dbl`) === false
  ) {
    details.push(
      "H14 double UNKNOWN settle stays UNKNOWN; forge VERIFIED after UNKNOWN refused",
    );
  } else {
    passed = false;
    details.push(
      `H14 double UNKNOWN unexpectedly u1=${JSON.stringify(u1)} u2=${JSON.stringify(u2)} forge=${JSON.stringify(forgeAfter)}`,
    );
  }

  // H14: retain-flag on QUEUED does not engage fence.
  const pre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.QUEUED,
    operationId: `${opId}-pre`,
    payloadDigest: "digest-x017-pre",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (pre.allowed === true && pre.code === "PRE_STOP_APPLY_OK") {
    details.push(
      "H14 retain-flag on QUEUED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(`H14 pre-apply retain unexpectedly ${JSON.stringify(pre)}`);
  }

  // H15/H16: same-digest idempotent replay after UNKNOWN.
  const sameLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-same`,
    payloadDigest: "digest-x017-same",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: sameLedger,
  });
  const sameReplay = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-same`,
    payloadDigest: "digest-x017-same",
    secondApplyDigest: "digest-x017-same",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: sameLedger,
  });
  if (
    sameReplay.allowed === true &&
    sameReplay.code === "PRE_STOP_APPLY_OK" &&
    sameReplay.applyAttemptCount === 1 &&
    sameLedger.hasVerified(`${opId}-same`) === false
  ) {
    details.push(
      "H15 same-digest replay after UNKNOWN → PRE_STOP_APPLY_OK (not second apply)",
    );
  } else {
    passed = false;
    details.push(`H15 same-digest unexpectedly ${JSON.stringify(sameReplay)}`);
  }

  // H15/H16: cross-op isolation.
  const crossLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-xa`,
    payloadDigest: "digest-xa",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: crossLedger,
  });
  const crossRefuse = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-xa`,
    payloadDigest: "digest-xa",
    secondApplyDigest: "digest-xa-2",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: crossLedger,
  });
  const crossB = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-xb`,
    payloadDigest: "digest-xb",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: crossLedger,
  });
  if (
    crossRefuse.code === "SECOND_APPLY_REFUSED" &&
    crossB.code === "UNKNOWN_SETTLE_OK" &&
    crossLedger.hasVerified(`${opId}-xa`) === false &&
    crossLedger.hasVerified(`${opId}-xb`) === false
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

  // H15/H16: COMPLETE settle UNKNOWN; forge refused.
  const completeUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.COMPLETE,
    operationId: `${opId}-cu`,
    payloadDigest: "digest-cu",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  const completeForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.COMPLETE,
    operationId: `${opId}-cf`,
    payloadDigest: "digest-cf",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (
    completeUnknown.code === "UNKNOWN_SETTLE_OK" &&
    completeUnknown.ledgerOutcome === "UNKNOWN_REMOTE_OUTCOME" &&
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

  // H17: multi distinct second digests refused.
  const multiLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-multi`,
    payloadDigest: "digest-multi",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: multiLedger,
  });
  let multiOk = true;
  for (const s of ["-a", "-b", "-c"]) {
    const r = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      operationId: `${opId}-multi`,
      payloadDigest: "digest-multi",
      secondApplyDigest: `digest-multi${s}`,
      recordedAtIso: nowIso,
      attempt: "record_second_apply",
      ledger: multiLedger,
    });
    if (r.code !== "SECOND_APPLY_REFUSED" || r.applyAttemptCount !== 1) {
      multiOk = false;
      details.push(`H17 multi ${s} unexpectedly ${JSON.stringify(r)}`);
      break;
    }
  }
  if (multiOk) {
    details.push(
      "H17 multi distinct second digests all SECOND_APPLY_REFUSED (applyAttemptCount=1)",
    );
  } else {
    passed = false;
  }

  // H17: VERIFYING settle UNKNOWN; forge refused.
  const verLedger = new SimulatedEffectLedger();
  const verUnknown = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.VERIFYING,
    operationId: `${opId}-vu`,
    payloadDigest: "digest-vu",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: verLedger,
  });
  const verForge = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.VERIFYING,
    operationId: `${opId}-vu`,
    payloadDigest: "digest-vu",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
    ledger: verLedger,
  });
  if (
    verUnknown.code === "UNKNOWN_SETTLE_OK" &&
    verForge.code === "VERIFIED_FORGE_REFUSED" &&
    verLedger.hasVerified(`${opId}-vu`) === false
  ) {
    details.push("H17 VERIFYING settle UNKNOWN only; forge VERIFIED refused");
  } else {
    passed = false;
    details.push(
      `H17 VERIFYING unexpectedly unknown=${JSON.stringify(verUnknown)} forge=${JSON.stringify(verForge)}`,
    );
  }

  // H17: AUTHORIZED + retain-flag.
  const authPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.AUTHORIZED,
    operationId: `${opId}-auth`,
    payloadDigest: "digest-auth",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (authPre.allowed === true && authPre.code === "PRE_STOP_APPLY_OK") {
    details.push(
      "H17 retain-flag on AUTHORIZED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(`H17 AUTHORIZED unexpectedly ${JSON.stringify(authPre)}`);
  }

  // H18: omitted secondApplyDigest defaults refuse.
  const defLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-def`,
    payloadDigest: "digest-def",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: defLedger,
  });
  const defaulted = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-def`,
    payloadDigest: "digest-def",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: defLedger,
  });
  if (
    defaulted.code === "SECOND_APPLY_REFUSED" &&
    defaulted.applyAttemptCount === 1
  ) {
    details.push(
      "H18 omitted secondApplyDigest defaults to distinct digest → SECOND_APPLY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`H18 defaulted unexpectedly ${JSON.stringify(defaulted)}`);
  }

  // H18: post-refuse same-digest OK.
  const sameAfter = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-def`,
    payloadDigest: "digest-def",
    secondApplyDigest: "digest-def",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: defLedger,
  });
  if (sameAfter.allowed === true && sameAfter.code === "PRE_STOP_APPLY_OK") {
    details.push(
      "H18 post-refuse same-digest replay → PRE_STOP_APPLY_OK (not second apply)",
    );
  } else {
    passed = false;
    details.push(`H18 post-refuse same unexpectedly ${JSON.stringify(sameAfter)}`);
  }

  // H18: LEASED + retain-flag.
  const leasedPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.LEASED,
    operationId: `${opId}-leased`,
    payloadDigest: "digest-leased",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (leasedPre.allowed === true && leasedPre.code === "PRE_STOP_APPLY_OK") {
    details.push(
      "H18 retain-flag on LEASED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(`H18 LEASED unexpectedly ${JSON.stringify(leasedPre)}`);
  }

  // H19: RUNNING + retain-flag.
  const runningPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.RUNNING,
    operationId: `${opId}-running`,
    payloadDigest: "digest-running",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (runningPre.allowed === true && runningPre.code === "PRE_STOP_APPLY_OK") {
    details.push(
      "H19 retain-flag on RUNNING does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(`H19 RUNNING unexpectedly ${JSON.stringify(runningPre)}`);
  }

  // H19: after same-digest OK, distinct still refused.
  const seqLedger = new SimulatedEffectLedger();
  fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-seq`,
    payloadDigest: "digest-seq",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
    ledger: seqLedger,
  });
  const seqSame = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-seq`,
    payloadDigest: "digest-seq",
    secondApplyDigest: "digest-seq",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: seqLedger,
  });
  const seqDistinct = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-seq`,
    payloadDigest: "digest-seq",
    secondApplyDigest: "digest-seq-other",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
    ledger: seqLedger,
  });
  if (
    seqSame.code === "PRE_STOP_APPLY_OK" &&
    seqDistinct.code === "SECOND_APPLY_REFUSED" &&
    seqDistinct.applyAttemptCount === 1
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

  // H19: forge outside stop-retain still refused.
  const forgeOutside = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-fo`,
    payloadDigest: "digest-fo",
    recordedAtIso: nowIso,
    attempt: "forge_verified",
  });
  if (
    forgeOutside.code === "VERIFIED_FORGE_REFUSED" &&
    forgeOutside.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H19 forge_verified outside stop-retain still VERIFIED_FORGE_REFUSED; NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(`H19 forge outside unexpectedly ${JSON.stringify(forgeOutside)}`);
  }

  // H20: WAITING_* + retain-flag.
  for (const [label, state] of [
    ["WAITING_DEPENDENCY", EffectState.WAITING_DEPENDENCY],
    ["WAITING_HUMAN", EffectState.WAITING_HUMAN],
    ["WAITING_AUTHENTICATION", EffectState.WAITING_AUTHENTICATION],
  ] as const) {
    const waitingPre = fenceStopAfterDispatchLedgerAttempt({
      stopRetainedForReconcile: true,
      effectState: state,
      operationId: `${opId}-${label.toLowerCase()}`,
      payloadDigest: `digest-${label.toLowerCase()}`,
      recordedAtIso: nowIso,
      attempt: "record_second_apply",
    });
    if (waitingPre.allowed === true && waitingPre.code === "PRE_STOP_APPLY_OK") {
      details.push(
        `H20 retain-flag on ${label} does not engage fence (PRE_STOP_APPLY_OK)`,
      );
    } else {
      passed = false;
      details.push(`H20 ${label} unexpectedly ${JSON.stringify(waitingPre)}`);
    }
  }

  // H20: settle_unknown outside stop-retain.
  const settleOutside = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.APPLYING,
    operationId: `${opId}-so`,
    payloadDigest: "digest-so",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (
    settleOutside.code === "UNKNOWN_SETTLE_OK" &&
    settleOutside.hasVerified === false &&
    settleOutside.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "H20 settle_unknown outside stop-retain → UNKNOWN_SETTLE_OK; never VERIFIED; NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(`H20 settle outside unexpectedly ${JSON.stringify(settleOutside)}`);
  }

  // H22: QUARANTINED retain; VERIFYING settle outside.
  const quarPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.QUARANTINED,
    operationId: `${opId}-quar`,
    payloadDigest: "digest-quar",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (quarPre.code === "PRE_STOP_APPLY_OK") {
    details.push(
      "H22 retain-flag on QUARANTINED does not engage fence (PRE_STOP_APPLY_OK)",
    );
  } else {
    passed = false;
    details.push(`H22 QUARANTINED unexpectedly ${JSON.stringify(quarPre)}`);
  }
  const verSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.VERIFYING,
    operationId: `${opId}-ver`,
    payloadDigest: "digest-ver",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (verSettle.code === "UNKNOWN_SETTLE_OK" && !verSettle.hasVerified) {
    details.push(
      "H22 settle_unknown outside stop-retain on VERIFYING → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H22 VERIFYING settle outside unexpectedly ${JSON.stringify(verSettle)}`);
  }

  // H23: CANCELLED retain; AUTHORIZED settle outside.
  const canPre = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: true,
    effectState: EffectState.CANCELLED,
    operationId: `${opId}-can`,
    payloadDigest: "digest-can",
    recordedAtIso: nowIso,
    attempt: "record_second_apply",
  });
  if (canPre.code === "PRE_STOP_APPLY_OK" && !canPre.hasVerified) {
    details.push("H23 retain-flag on CANCELLED does not engage fence (PRE_STOP_APPLY_OK)");
  } else {
    passed = false;
    details.push(`H23 CANCELLED ${JSON.stringify(canPre)}`);
  }
  const authSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.AUTHORIZED,
    operationId: `${opId}-auth-s`,
    payloadDigest: "digest-auth-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (authSettle.code === "UNKNOWN_SETTLE_OK" && !authSettle.hasVerified) {
    details.push(
      "H23 settle_unknown outside stop-retain on AUTHORIZED → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H23 AUTHORIZED settle ${JSON.stringify(authSettle)}`);
  }

  // H24: QUARANTINED + CANCELLED settle outside.
  const quarSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.QUARANTINED,
    operationId: `${opId}-quar-s`,
    payloadDigest: "digest-quar-s",
    recordedAtIso: nowIso,
    attempt: "settle_unknown",
  });
  if (quarSettle.code === "UNKNOWN_SETTLE_OK" && !quarSettle.hasVerified) {
    details.push(
      "H24 settle_unknown outside stop-retain on QUARANTINED → UNKNOWN_SETTLE_OK; never VERIFIED",
    );
  } else {
    passed = false;
    details.push(`H24 QUARANTINED settle ${JSON.stringify(quarSettle)}`);
  }
  const canSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.CANCELLED,
    operationId: `${opId}-can-s`,
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

  const failedSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.FAILED_RETRYABLE,
    operationId: `${opId}-fail-s`,
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
  const runSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.RUNNING,
    operationId: `${opId}-run-s`,
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

  const leasedSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.LEASED,
    operationId: `${opId}-lease-s`,
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
  const waitSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.WAITING_HUMAN,
    operationId: `${opId}-wait-s`,
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

  const depSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.WAITING_DEPENDENCY,
    operationId: `${opId}-dep-s`,
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
  const authWaitSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.WAITING_AUTHENTICATION,
    operationId: `${opId}-wauth-s`,
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

  const uroSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    operationId: `${opId}-uro-s`,
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
  const completeSettle = fenceStopAfterDispatchLedgerAttempt({
    stopRetainedForReconcile: false,
    effectState: EffectState.COMPLETE,
    operationId: `${opId}-complete-s`,
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

  // Hillclimb + deepen attack suite: every EffectState + forged cancel + fence.
  const suite = evaluateStopAfterDispatchAttackSuite();
  if (suite.passed) {
    details.push(...suite.details);
  } else {
    passed = false;
    details.push(`Attack suite failed: ${suite.details.join(" | ")}`);
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
