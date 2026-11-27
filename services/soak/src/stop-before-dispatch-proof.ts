/**
 * Fixture proof for T-X016 — stop before dispatch claim → no adapter mutation.
 *
 * Pre-apply (AUTHORIZED) work may CANCELLED; durable stores record intent but
 * never fake-provider apply. Post-apply CANCELLED is refused (contrast only —
 * does not ACCEPTED T-X017). External effects: NONE. Never invents live VERIFIED.
 *
 * Deepen (F10 / schedule-drift note): WAITING_AUTHENTICATION/VALIDATING/
 * LEASED cancel; URO/COMPLETE retained; short deadlineSeconds cancel still
 * applyAttempts=0 (deadline drift must not invent adapter mutation).
 *
 * Deepen (F14): RUNNING/WAITING_DEPENDENCY/WAITING_HUMAN/FAILED_RETRYABLE
 * cancel; already-terminal CANCELLED/QUARANTINED not re-cancelled; durable
 * LEASED→CANCELLED still applyAttempts=0 / provider=none.
 *
 * Deepen (F15): durable WAITING_AUTHENTICATION→CANCELLED applyAttempts=0;
 * empty-queue cancel no-op; second cancelEligible pass idempotent; outbound
 * OUTBOUND_STOPPED preferred when rateLimitExceeded=true.
 *
 * Deepen (F16): durable VALIDATING→CANCELLED + WAITING_HUMAN→CANCELLED
 * applyAttempts=0; OUTBOUND_STOPPED preferred when sourceStale=true.
 *
 * Deepen (F17): durable RUNNING→CANCELLED + WAITING_DEPENDENCY→CANCELLED +
 * FAILED_RETRYABLE→CANCELLED applyAttempts=0; OUTBOUND_STOPPED preferred
 * when grantExpired=true.
 *
 * Deepen (F18): APPLYING→CANCELLED transition refused (no invented mutation);
 * OUTBOUND_STOPPED preferred when revisionMatches=false or
 * prerequisiteMissing=true.
 *
 * Deepen (F19): VERIFYING/COMPLETE→CANCELLED refused; OUTBOUND_STOPPED
 * preferred when prerequisiteConflict=true.
 *
 * Deepen (F20): QUARANTINED→CANCELLED refused; OUTBOUND_STOPPED preferred
 * over READ_EVIDENCE_MISSING and OWNERSHIP_UNPROVEN.
 *
 * Deepen (F21): OUTBOUND_STOPPED preferred over GRANT_MISSING.
 *
 * Deepen (F22): OUTBOUND_STOPPED preferred when rate-limit and source-stale
 * both true (compound pre-dispatch denial).
 *
 * Deepen (F23): OUTBOUND_STOPPED preferred over REVISION_MISMATCH.
 *
 * Deepen (F24): OUTBOUND_STOPPED preferred over GRANT_EXPIRED.
 *
 * Deepen (F25): OUTBOUND_STOPPED preferred over compound
 * GRANT_EXPIRED + SOURCE_STALE.
 */

import { randomUUID } from "node:crypto";
import {
  EffectState,
  SoakProofKind,
  applyQueuedCancelResults,
  canTransition,
  cancelEligibleQueuedWork,
  evaluatePolicy,
  isPostApplyPhase,
  transition,
  type CredentialQueuedWorkItem,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createMemoryDurableStores,
  newJobId,
} from "@worksocial/persistence";

/**
 * Complete expected proof set for T-X016 fixture ACCEPTED.
 */
export async function proofStopBeforeDispatchClaim(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const operationId = `op-x016-${randomUUID().slice(0, 8)}`;

  // 1. Pre-dispatch cancel is a legal effect transition; post-apply cancel is not.
  // URO→CANCELLED is machine-legal but cancelEligibleQueuedWork still retains it
  // for reconcile (checked in step 4) — do not treat machine-legal as fake-cancel.
  if (
    canTransition(EffectState.AUTHORIZED, EffectState.CANCELLED) &&
    canTransition(EffectState.QUEUED, EffectState.CANCELLED) &&
    canTransition(EffectState.LEASED, EffectState.CANCELLED) &&
    canTransition(EffectState.VALIDATING, EffectState.CANCELLED) &&
    canTransition(EffectState.WAITING_AUTHENTICATION, EffectState.CANCELLED) &&
    canTransition(EffectState.RUNNING, EffectState.CANCELLED) &&
    canTransition(EffectState.WAITING_DEPENDENCY, EffectState.CANCELLED) &&
    canTransition(EffectState.WAITING_HUMAN, EffectState.CANCELLED) &&
    canTransition(EffectState.FAILED_RETRYABLE, EffectState.CANCELLED) &&
    !canTransition(EffectState.APPLYING, EffectState.CANCELLED) &&
    !canTransition(EffectState.VERIFYING, EffectState.CANCELLED) &&
    !canTransition(EffectState.COMPLETE, EffectState.CANCELLED) &&
    canTransition(EffectState.UNKNOWN_REMOTE_OUTCOME, EffectState.CANCELLED) &&
    isPostApplyPhase(EffectState.AUTHORIZED) === false &&
    isPostApplyPhase(EffectState.LEASED) === false &&
    isPostApplyPhase(EffectState.RUNNING) === false &&
    isPostApplyPhase(EffectState.FAILED_RETRYABLE) === false &&
    isPostApplyPhase(EffectState.UNKNOWN_REMOTE_OUTCOME) === true
  ) {
    details.push(
      "Effect machine: AUTHORIZED/QUEUED/LEASED/VALIDATING/WAITING_AUTHENTICATION/RUNNING/WAITING_DEPENDENCY/WAITING_HUMAN/FAILED_RETRYABLE→CANCELLED allowed; APPLYING/VERIFYING/COMPLETE→CANCELLED refused; URO→CANCELLED machine-legal but helper-retained (step 4)",
    );
  } else {
    passed = false;
    details.push("Effect machine pre/post-apply cancel gates unexpected");
  }

  // 2. Outbound stop at commit denies before any adapter claim.
  const stopped = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (!stopped.allowed && stopped.code === "OUTBOUND_STOPPED") {
    details.push("Outbound stop denies OUTBOUND_STOPPED before dispatch claim");
  } else {
    passed = false;
    details.push(
      `Outbound stop gate unexpected allowed=${stopped.allowed} code=${"code" in stopped ? stopped.code : "n/a"}`,
    );
  }

  // 3. Durable harness: record pre-apply intent, cancel without fake-provider apply.
  const stores = createMemoryDurableStores();
  const jobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId,
    roleId: "A19",
    workflowId: `wf-${operationId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 1,
    deadlineSeconds: 60,
    idempotencyKey: `soak/stop-before/${operationId}`,
    expectedOutcome: "cancelled_pre_dispatch",
  });
  await stores.effects.recordIntent({
    operationId,
    payloadDigest: `digest-${operationId}`,
    recordedAtIso: nowIso,
    jobId,
    effectState: EffectState.AUTHORIZED,
    businessIdempotencyKey: `biz-stop-before-${operationId}`,
  });

  const cancelledState = transition(
    EffectState.AUTHORIZED,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(operationId, "FAILED", cancelledState);

  const applyAttempts = await stores.effects.countApplyAttempts(operationId);
  const provider = await stores.fakeProvider.getByOperation(operationId);
  const intent = await stores.effects.get(operationId);

  if (
    applyAttempts === 0 &&
    provider === undefined &&
    intent?.effectState === EffectState.CANCELLED &&
    intent.outcome !== "ACCEPTED_PENDING" &&
    intent.outcome !== "VERIFIED"
  ) {
    details.push(
      `Durable harness: cancelled pre-dispatch with applyAttempts=0 provider=none outcome=${intent.outcome}`,
    );
  } else {
    passed = false;
    details.push(
      `Durable harness mutation leak apply=${applyAttempts} provider=${provider?.providerEffectId ?? "none"} state=${intent?.effectState} outcome=${intent?.outcome}`,
    );
  }

  // 4. Queued-work cancel helper: pre-dispatch cancelled; post-apply retained (contrast).
  const queue: CredentialQueuedWorkItem[] = [
    {
      workId: "w-pre",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-pre`,
      effectState: EffectState.AUTHORIZED,
      queuedAtIso: nowIso,
      summary: "pre-dispatch",
    },
    {
      workId: "w-queued",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-queued`,
      effectState: EffectState.QUEUED,
      queuedAtIso: nowIso,
      summary: "pre-dispatch queued",
    },
    {
      workId: "w-leased",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-leased`,
      effectState: EffectState.LEASED,
      queuedAtIso: nowIso,
      summary: "pre-dispatch leased",
    },
    {
      workId: "w-validating",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-validating`,
      effectState: EffectState.VALIDATING,
      queuedAtIso: nowIso,
      summary: "pre-dispatch validating",
    },
    {
      workId: "w-waiting-auth",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-waiting-auth`,
      effectState: EffectState.WAITING_AUTHENTICATION,
      queuedAtIso: nowIso,
      summary: "pre-dispatch waiting auth",
    },
    {
      workId: "w-running",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-running`,
      effectState: EffectState.RUNNING,
      queuedAtIso: nowIso,
      summary: "pre-dispatch running",
    },
    {
      workId: "w-waiting-dep",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-waiting-dep`,
      effectState: EffectState.WAITING_DEPENDENCY,
      queuedAtIso: nowIso,
      summary: "pre-dispatch waiting dependency",
    },
    {
      workId: "w-waiting-human",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-waiting-human`,
      effectState: EffectState.WAITING_HUMAN,
      queuedAtIso: nowIso,
      summary: "pre-dispatch waiting human",
    },
    {
      workId: "w-failed-retryable",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-failed-retryable`,
      effectState: EffectState.FAILED_RETRYABLE,
      queuedAtIso: nowIso,
      summary: "pre-dispatch failed retryable",
    },
    {
      workId: "w-already-cancelled",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-already-cancelled`,
      effectState: EffectState.CANCELLED,
      queuedAtIso: nowIso,
      summary: "already terminal cancelled",
    },
    {
      workId: "w-quarantined",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-quarantined`,
      effectState: EffectState.QUARANTINED,
      queuedAtIso: nowIso,
      summary: "already terminal quarantined",
    },
    {
      workId: "w-post",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-post`,
      effectState: EffectState.APPLYING,
      queuedAtIso: nowIso,
      summary: "post-dispatch",
    },
    {
      workId: "w-verifying",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-verifying`,
      effectState: EffectState.VERIFYING,
      queuedAtIso: nowIso,
      summary: "post-dispatch verifying",
    },
    {
      workId: "w-uro",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-uro`,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
      queuedAtIso: nowIso,
      summary: "post-dispatch uro",
    },
    {
      workId: "w-complete",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-complete`,
      effectState: EffectState.COMPLETE,
      queuedAtIso: nowIso,
      summary: "post-dispatch complete",
    },
  ];
  const cancelResults = cancelEligibleQueuedWork(queue);
  const pre = cancelResults.find((r) => r.workId === "w-pre");
  const queued = cancelResults.find((r) => r.workId === "w-queued");
  const leased = cancelResults.find((r) => r.workId === "w-leased");
  const validating = cancelResults.find((r) => r.workId === "w-validating");
  const waitingAuth = cancelResults.find((r) => r.workId === "w-waiting-auth");
  const running = cancelResults.find((r) => r.workId === "w-running");
  const waitingDep = cancelResults.find((r) => r.workId === "w-waiting-dep");
  const waitingHuman = cancelResults.find(
    (r) => r.workId === "w-waiting-human",
  );
  const failedRetryable = cancelResults.find(
    (r) => r.workId === "w-failed-retryable",
  );
  const alreadyCancelled = cancelResults.find(
    (r) => r.workId === "w-already-cancelled",
  );
  const quarantined = cancelResults.find((r) => r.workId === "w-quarantined");
  const post = cancelResults.find((r) => r.workId === "w-post");
  const verifying = cancelResults.find((r) => r.workId === "w-verifying");
  const uro = cancelResults.find((r) => r.workId === "w-uro");
  const complete = cancelResults.find((r) => r.workId === "w-complete");
  const appliedQueue = applyQueuedCancelResults(queue, cancelResults);
  if (
    pre?.cancelled === true &&
    pre.toState === EffectState.CANCELLED &&
    queued?.cancelled === true &&
    queued.toState === EffectState.CANCELLED &&
    leased?.cancelled === true &&
    leased.toState === EffectState.CANCELLED &&
    validating?.cancelled === true &&
    validating.toState === EffectState.CANCELLED &&
    waitingAuth?.cancelled === true &&
    waitingAuth.toState === EffectState.CANCELLED &&
    running?.cancelled === true &&
    running.toState === EffectState.CANCELLED &&
    waitingDep?.cancelled === true &&
    waitingDep.toState === EffectState.CANCELLED &&
    waitingHuman?.cancelled === true &&
    waitingHuman.toState === EffectState.CANCELLED &&
    failedRetryable?.cancelled === true &&
    failedRetryable.toState === EffectState.CANCELLED &&
    alreadyCancelled?.cancelled === false &&
    alreadyCancelled?.toState === EffectState.CANCELLED &&
    alreadyCancelled?.retainedForReconcile === false &&
    quarantined?.cancelled === false &&
    quarantined?.toState === EffectState.QUARANTINED &&
    quarantined?.retainedForReconcile === false &&
    post?.cancelled === false &&
    post.retainedForReconcile === true &&
    verifying?.cancelled === false &&
    verifying.retainedForReconcile === true &&
    uro?.cancelled === false &&
    uro.retainedForReconcile === true &&
    complete?.cancelled === false &&
    complete.retainedForReconcile === true &&
    appliedQueue.find((w) => w.workId === "w-running")?.effectState ===
      EffectState.CANCELLED &&
    appliedQueue.find((w) => w.workId === "w-waiting-dep")?.effectState ===
      EffectState.CANCELLED &&
    appliedQueue.find((w) => w.workId === "w-already-cancelled")
      ?.effectState === EffectState.CANCELLED &&
    appliedQueue.find((w) => w.workId === "w-quarantined")?.effectState ===
      EffectState.QUARANTINED &&
    appliedQueue.find((w) => w.workId === "w-post")?.effectState ===
      EffectState.APPLYING
  ) {
    details.push(
      "cancelEligibleQueuedWork: AUTHORIZED+QUEUED+LEASED+VALIDATING+WAITING_AUTHENTICATION+RUNNING+WAITING_DEPENDENCY+WAITING_HUMAN+FAILED_RETRYABLE cancelled; CANCELLED+QUARANTINED already-terminal (not re-cancelled); APPLYING+VERIFYING+URO+COMPLETE retained for reconcile (no fake cancel)",
    );
  } else {
    passed = false;
    details.push(
      `cancelEligibleQueuedWork unexpected pre=${JSON.stringify(pre)} queued=${JSON.stringify(queued)} leased=${JSON.stringify(leased)} validating=${JSON.stringify(validating)} waitingAuth=${JSON.stringify(waitingAuth)} running=${JSON.stringify(running)} waitingDep=${JSON.stringify(waitingDep)} waitingHuman=${JSON.stringify(waitingHuman)} failedRetryable=${JSON.stringify(failedRetryable)} alreadyCancelled=${JSON.stringify(alreadyCancelled)} quarantined=${JSON.stringify(quarantined)} post=${JSON.stringify(post)} verifying=${JSON.stringify(verifying)} uro=${JSON.stringify(uro)} complete=${JSON.stringify(complete)}`,
    );
  }

  // 5. Second durable hop: QUEUED intent cancelled with still-zero apply / no provider.
  const queuedOpId = `${operationId}-q`;
  const queuedJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: queuedJobId,
    roleId: "A19",
    workflowId: `wf-${queuedOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_queued",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 1,
    deadlineSeconds: 60,
    idempotencyKey: `soak/stop-before/${queuedOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_queued",
  });
  await stores.effects.recordIntent({
    operationId: queuedOpId,
    payloadDigest: `digest-${queuedOpId}`,
    recordedAtIso: nowIso,
    jobId: queuedJobId,
    effectState: EffectState.QUEUED,
    businessIdempotencyKey: `biz-stop-before-${queuedOpId}`,
  });
  const queuedCancelled = transition(EffectState.QUEUED, EffectState.CANCELLED);
  await stores.effects.settle(queuedOpId, "FAILED", queuedCancelled);
  const queuedApplyAttempts =
    await stores.effects.countApplyAttempts(queuedOpId);
  const queuedProvider = await stores.fakeProvider.getByOperation(queuedOpId);
  const queuedIntent = await stores.effects.get(queuedOpId);
  if (
    queuedApplyAttempts === 0 &&
    queuedProvider === undefined &&
    queuedIntent?.effectState === EffectState.CANCELLED &&
    applyAttempts === 0
  ) {
    details.push(
      "Durable QUEUED→CANCELLED: applyAttempts=0 provider=none (both ops; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable QUEUED cancel leak apply=${queuedApplyAttempts} provider=${queuedProvider?.providerEffectId ?? "none"} state=${queuedIntent?.effectState}`,
    );
  }

  // 6. Schedule-drift / short deadline: pre-dispatch cancel still applyAttempts=0.
  const driftOpId = `${operationId}-drift`;
  const driftJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: driftJobId,
    roleId: "A19",
    workflowId: `wf-${driftOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_deadline_drift",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 1,
    deadlineSeconds: 1,
    idempotencyKey: `soak/stop-before/${driftOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_deadline_drift",
  });
  await stores.effects.recordIntent({
    operationId: driftOpId,
    payloadDigest: `digest-${driftOpId}`,
    recordedAtIso: nowIso,
    jobId: driftJobId,
    effectState: EffectState.AUTHORIZED,
    businessIdempotencyKey: `biz-stop-before-${driftOpId}`,
  });
  const driftCancelled = transition(
    EffectState.AUTHORIZED,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(driftOpId, "FAILED", driftCancelled);
  const driftApplyAttempts =
    await stores.effects.countApplyAttempts(driftOpId);
  const driftProvider = await stores.fakeProvider.getByOperation(driftOpId);
  const driftIntent = await stores.effects.get(driftOpId);
  const driftJob = await stores.jobs.get(driftJobId);
  if (
    driftJob?.deadlineSeconds === 1 &&
    driftApplyAttempts === 0 &&
    driftProvider === undefined &&
    driftIntent?.effectState === EffectState.CANCELLED
  ) {
    details.push(
      "Short deadlineSeconds=1 (schedule drift) pre-dispatch CANCELLED → applyAttempts=0 provider=none (no invented adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Deadline-drift cancel unexpected deadline=${driftJob?.deadlineSeconds} apply=${driftApplyAttempts} provider=${driftProvider?.providerEffectId ?? "none"} state=${driftIntent?.effectState}`,
    );
  }

  // 7. Outbound stop still OUTBOUND_STOPPED when other gates are clean (pre-dispatch).
  const stoppedAgain = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (!stoppedAgain.allowed && stoppedAgain.code === "OUTBOUND_STOPPED") {
    details.push(
      "Outbound stop remains OUTBOUND_STOPPED before dispatch (repeat gate; applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound stop repeat unexpected: ${JSON.stringify(stoppedAgain)}`,
    );
  }

  // 8. Durable LEASED→CANCELLED (F14): still applyAttempts=0 / provider=none.
  const leasedOpId = `${operationId}-leased-durable`;
  const leasedJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: leasedJobId,
    roleId: "A19",
    workflowId: `wf-${leasedOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_leased",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 3,
    deadlineSeconds: 60,
    idempotencyKey: `soak/stop-before/${leasedOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_leased",
  });
  await stores.effects.recordIntent({
    operationId: leasedOpId,
    payloadDigest: `digest-${leasedOpId}`,
    recordedAtIso: nowIso,
    jobId: leasedJobId,
    effectState: EffectState.LEASED,
    businessIdempotencyKey: `biz-stop-before-${leasedOpId}`,
  });
  const leasedCancelled = transition(EffectState.LEASED, EffectState.CANCELLED);
  await stores.effects.settle(leasedOpId, "FAILED", leasedCancelled);
  const leasedApplyAttempts =
    await stores.effects.countApplyAttempts(leasedOpId);
  const leasedProvider = await stores.fakeProvider.getByOperation(leasedOpId);
  const leasedIntent = await stores.effects.get(leasedOpId);
  const leasedJob = await stores.jobs.get(leasedJobId);
  if (
    leasedJob?.maxAttempts === 3 &&
    leasedApplyAttempts === 0 &&
    leasedProvider === undefined &&
    leasedIntent?.effectState === EffectState.CANCELLED &&
    applyAttempts === 0
  ) {
    details.push(
      "Durable LEASED→CANCELLED (maxAttempts=3): applyAttempts=0 provider=none (pre-dispatch; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable LEASED cancel leak maxAttempts=${leasedJob?.maxAttempts} apply=${leasedApplyAttempts} provider=${leasedProvider?.providerEffectId ?? "none"} state=${leasedIntent?.effectState}`,
    );
  }

  // 9. Durable WAITING_AUTHENTICATION→CANCELLED (F15): still applyAttempts=0.
  const waitingAuthOpId = `${operationId}-waiting-auth-durable`;
  const waitingAuthJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: waitingAuthJobId,
    roleId: "A19",
    workflowId: `wf-${waitingAuthOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_waiting_auth",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 1,
    deadlineSeconds: 60,
    idempotencyKey: `soak/stop-before/${waitingAuthOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_waiting_auth",
  });
  await stores.effects.recordIntent({
    operationId: waitingAuthOpId,
    payloadDigest: `digest-${waitingAuthOpId}`,
    recordedAtIso: nowIso,
    jobId: waitingAuthJobId,
    effectState: EffectState.WAITING_AUTHENTICATION,
    businessIdempotencyKey: `biz-stop-before-${waitingAuthOpId}`,
  });
  const waitingAuthCancelled = transition(
    EffectState.WAITING_AUTHENTICATION,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(
    waitingAuthOpId,
    "FAILED",
    waitingAuthCancelled,
  );
  const waitingAuthApplyAttempts =
    await stores.effects.countApplyAttempts(waitingAuthOpId);
  const waitingAuthProvider =
    await stores.fakeProvider.getByOperation(waitingAuthOpId);
  const waitingAuthIntent = await stores.effects.get(waitingAuthOpId);
  if (
    waitingAuthApplyAttempts === 0 &&
    waitingAuthProvider === undefined &&
    waitingAuthIntent?.effectState === EffectState.CANCELLED
  ) {
    details.push(
      "Durable WAITING_AUTHENTICATION→CANCELLED: applyAttempts=0 provider=none (pre-dispatch; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable WAITING_AUTHENTICATION cancel leak apply=${waitingAuthApplyAttempts} provider=${waitingAuthProvider?.providerEffectId ?? "none"} state=${waitingAuthIntent?.effectState}`,
    );
  }

  // 10. Empty queue cancel is a no-op (F15).
  const emptyCancel = cancelEligibleQueuedWork([]);
  if (emptyCancel.length === 0) {
    details.push(
      "cancelEligibleQueuedWork([]) → [] (empty queue no-op; invents no cancel/apply)",
    );
  } else {
    passed = false;
    details.push(
      `Empty-queue cancel unexpected: ${JSON.stringify(emptyCancel)}`,
    );
  }

  // 11. Second cancelEligible pass is idempotent (F15) — already-CANCELLED stays terminal.
  const secondPass = cancelEligibleQueuedWork(appliedQueue);
  const secondRunning = secondPass.find((r) => r.workId === "w-running");
  const secondPost = secondPass.find((r) => r.workId === "w-post");
  const secondApplied = applyQueuedCancelResults(appliedQueue, secondPass);
  if (
    secondRunning?.cancelled === false &&
    secondRunning?.toState === EffectState.CANCELLED &&
    secondPost?.cancelled === false &&
    secondPost?.retainedForReconcile === true &&
    secondApplied.find((w) => w.workId === "w-running")?.effectState ===
      EffectState.CANCELLED &&
    secondApplied.find((w) => w.workId === "w-post")?.effectState ===
      EffectState.APPLYING
  ) {
    details.push(
      "Second cancelEligible pass idempotent: already-CANCELLED not re-cancelled; APPLYING still retained (no invented APPLYING→CANCELLED)",
    );
  } else {
    passed = false;
    details.push(
      `Second-pass cancel unexpected running=${JSON.stringify(secondRunning)} post=${JSON.stringify(secondPost)}`,
    );
  }

  // 12. Outbound stop preferred when rateLimitExceeded also true (F15).
  const stoppedOverRate = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: true,
  });
  if (
    !stoppedOverRate.allowed &&
    stoppedOverRate.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over RATE_LIMIT_EXCEEDED before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-rate unexpected: ${JSON.stringify(stoppedOverRate)}`,
    );
  }

  // 13. Durable VALIDATING→CANCELLED (F16): still applyAttempts=0.
  const validatingOpId = `${operationId}-validating-durable`;
  const validatingJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: validatingJobId,
    roleId: "A19",
    workflowId: `wf-${validatingOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_validating",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 1,
    deadlineSeconds: 60,
    idempotencyKey: `soak/stop-before/${validatingOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_validating",
  });
  await stores.effects.recordIntent({
    operationId: validatingOpId,
    payloadDigest: `digest-${validatingOpId}`,
    recordedAtIso: nowIso,
    jobId: validatingJobId,
    effectState: EffectState.VALIDATING,
    businessIdempotencyKey: `biz-stop-before-${validatingOpId}`,
  });
  const validatingCancelled = transition(
    EffectState.VALIDATING,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(validatingOpId, "FAILED", validatingCancelled);
  const validatingApplyAttempts =
    await stores.effects.countApplyAttempts(validatingOpId);
  const validatingProvider =
    await stores.fakeProvider.getByOperation(validatingOpId);
  const validatingIntent = await stores.effects.get(validatingOpId);
  if (
    validatingApplyAttempts === 0 &&
    validatingProvider === undefined &&
    validatingIntent?.effectState === EffectState.CANCELLED
  ) {
    details.push(
      "Durable VALIDATING→CANCELLED: applyAttempts=0 provider=none (pre-dispatch; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable VALIDATING cancel leak apply=${validatingApplyAttempts} provider=${validatingProvider?.providerEffectId ?? "none"} state=${validatingIntent?.effectState}`,
    );
  }

  // 14. Durable WAITING_HUMAN→CANCELLED (F16): still applyAttempts=0.
  const waitingHumanOpId = `${operationId}-waiting-human-durable`;
  const waitingHumanJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: waitingHumanJobId,
    roleId: "A19",
    workflowId: `wf-${waitingHumanOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_waiting_human",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 2,
    deadlineSeconds: 30,
    idempotencyKey: `soak/stop-before/${waitingHumanOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_waiting_human",
  });
  await stores.effects.recordIntent({
    operationId: waitingHumanOpId,
    payloadDigest: `digest-${waitingHumanOpId}`,
    recordedAtIso: nowIso,
    jobId: waitingHumanJobId,
    effectState: EffectState.WAITING_HUMAN,
    businessIdempotencyKey: `biz-stop-before-${waitingHumanOpId}`,
  });
  const waitingHumanCancelled = transition(
    EffectState.WAITING_HUMAN,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(
    waitingHumanOpId,
    "FAILED",
    waitingHumanCancelled,
  );
  const waitingHumanApplyAttempts =
    await stores.effects.countApplyAttempts(waitingHumanOpId);
  const waitingHumanProvider =
    await stores.fakeProvider.getByOperation(waitingHumanOpId);
  const waitingHumanIntent = await stores.effects.get(waitingHumanOpId);
  const waitingHumanJob = await stores.jobs.get(waitingHumanJobId);
  if (
    waitingHumanJob?.maxAttempts === 2 &&
    waitingHumanJob.deadlineSeconds === 30 &&
    waitingHumanApplyAttempts === 0 &&
    waitingHumanProvider === undefined &&
    waitingHumanIntent?.effectState === EffectState.CANCELLED
  ) {
    details.push(
      "Durable WAITING_HUMAN→CANCELLED (maxAttempts=2 deadlineSeconds=30): applyAttempts=0 provider=none (pre-dispatch; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable WAITING_HUMAN cancel leak maxAttempts=${waitingHumanJob?.maxAttempts} deadline=${waitingHumanJob?.deadlineSeconds} apply=${waitingHumanApplyAttempts} provider=${waitingHumanProvider?.providerEffectId ?? "none"} state=${waitingHumanIntent?.effectState}`,
    );
  }

  // 15. Outbound stop preferred when sourceStale also true (F16).
  const stoppedOverStale = evaluatePolicy({
    outboundStopped: true,
    sourceStale: true,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverStale.allowed &&
    stoppedOverStale.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over SOURCE_STALE before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-stale unexpected: ${JSON.stringify(stoppedOverStale)}`,
    );
  }

  // 16. Durable RUNNING→CANCELLED (F17): still applyAttempts=0.
  const runningOpId = `${operationId}-running-durable`;
  const runningJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: runningJobId,
    roleId: "A19",
    workflowId: `wf-${runningOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_running",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 1,
    deadlineSeconds: 60,
    idempotencyKey: `soak/stop-before/${runningOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_running",
  });
  await stores.effects.recordIntent({
    operationId: runningOpId,
    payloadDigest: `digest-${runningOpId}`,
    recordedAtIso: nowIso,
    jobId: runningJobId,
    effectState: EffectState.RUNNING,
    businessIdempotencyKey: `biz-stop-before-${runningOpId}`,
  });
  const runningCancelled = transition(
    EffectState.RUNNING,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(runningOpId, "FAILED", runningCancelled);
  const runningApplyAttempts =
    await stores.effects.countApplyAttempts(runningOpId);
  const runningProvider = await stores.fakeProvider.getByOperation(runningOpId);
  const runningIntent = await stores.effects.get(runningOpId);
  if (
    runningApplyAttempts === 0 &&
    runningProvider === undefined &&
    runningIntent?.effectState === EffectState.CANCELLED
  ) {
    details.push(
      "Durable RUNNING→CANCELLED: applyAttempts=0 provider=none (pre-dispatch; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable RUNNING cancel leak apply=${runningApplyAttempts} provider=${runningProvider?.providerEffectId ?? "none"} state=${runningIntent?.effectState}`,
    );
  }

  // 17. Durable WAITING_DEPENDENCY→CANCELLED (F17): still applyAttempts=0.
  const waitingDepOpId = `${operationId}-waiting-dep-durable`;
  const waitingDepJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: waitingDepJobId,
    roleId: "A19",
    workflowId: `wf-${waitingDepOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_waiting_dep",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 2,
    deadlineSeconds: 45,
    idempotencyKey: `soak/stop-before/${waitingDepOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_waiting_dep",
  });
  await stores.effects.recordIntent({
    operationId: waitingDepOpId,
    payloadDigest: `digest-${waitingDepOpId}`,
    recordedAtIso: nowIso,
    jobId: waitingDepJobId,
    effectState: EffectState.WAITING_DEPENDENCY,
    businessIdempotencyKey: `biz-stop-before-${waitingDepOpId}`,
  });
  const waitingDepCancelled = transition(
    EffectState.WAITING_DEPENDENCY,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(waitingDepOpId, "FAILED", waitingDepCancelled);
  const waitingDepApplyAttempts =
    await stores.effects.countApplyAttempts(waitingDepOpId);
  const waitingDepProvider =
    await stores.fakeProvider.getByOperation(waitingDepOpId);
  const waitingDepIntent = await stores.effects.get(waitingDepOpId);
  const waitingDepJob = await stores.jobs.get(waitingDepJobId);
  if (
    waitingDepJob?.maxAttempts === 2 &&
    waitingDepJob.deadlineSeconds === 45 &&
    waitingDepApplyAttempts === 0 &&
    waitingDepProvider === undefined &&
    waitingDepIntent?.effectState === EffectState.CANCELLED
  ) {
    details.push(
      "Durable WAITING_DEPENDENCY→CANCELLED (maxAttempts=2 deadlineSeconds=45): applyAttempts=0 provider=none (pre-dispatch; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable WAITING_DEPENDENCY cancel leak maxAttempts=${waitingDepJob?.maxAttempts} deadline=${waitingDepJob?.deadlineSeconds} apply=${waitingDepApplyAttempts} provider=${waitingDepProvider?.providerEffectId ?? "none"} state=${waitingDepIntent?.effectState}`,
    );
  }

  // 18. Durable FAILED_RETRYABLE→CANCELLED (F17): still applyAttempts=0.
  const failedRetryableOpId = `${operationId}-failed-retryable-durable`;
  const failedRetryableJobId = newJobId();
  await stores.jobs.insertIdempotent({
    jobId: failedRetryableJobId,
    roleId: "A19",
    workflowId: `wf-${failedRetryableOpId}`,
    siteId: "site-soak",
    assetId: "asset-soak",
    trigger: "soak_stop_before_dispatch_failed_retryable",
    policyVersion: "m9",
    inputArtifactIds: [],
    capabilityGrantId: "grant-soak",
    sourceRevision: "rev-soak",
    maxAttempts: 3,
    deadlineSeconds: 60,
    idempotencyKey: `soak/stop-before/${failedRetryableOpId}`,
    expectedOutcome: "cancelled_pre_dispatch_failed_retryable",
  });
  await stores.effects.recordIntent({
    operationId: failedRetryableOpId,
    payloadDigest: `digest-${failedRetryableOpId}`,
    recordedAtIso: nowIso,
    jobId: failedRetryableJobId,
    effectState: EffectState.FAILED_RETRYABLE,
    businessIdempotencyKey: `biz-stop-before-${failedRetryableOpId}`,
  });
  const failedRetryableCancelled = transition(
    EffectState.FAILED_RETRYABLE,
    EffectState.CANCELLED,
  );
  await stores.effects.settle(
    failedRetryableOpId,
    "FAILED",
    failedRetryableCancelled,
  );
  const failedRetryableApplyAttempts =
    await stores.effects.countApplyAttempts(failedRetryableOpId);
  const failedRetryableProvider =
    await stores.fakeProvider.getByOperation(failedRetryableOpId);
  const failedRetryableIntent = await stores.effects.get(failedRetryableOpId);
  if (
    failedRetryableApplyAttempts === 0 &&
    failedRetryableProvider === undefined &&
    failedRetryableIntent?.effectState === EffectState.CANCELLED
  ) {
    details.push(
      "Durable FAILED_RETRYABLE→CANCELLED: applyAttempts=0 provider=none (pre-dispatch; no adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `Durable FAILED_RETRYABLE cancel leak apply=${failedRetryableApplyAttempts} provider=${failedRetryableProvider?.providerEffectId ?? "none"} state=${failedRetryableIntent?.effectState}`,
    );
  }

  // 19. Outbound stop preferred when grantExpired also true (F17).
  const stoppedOverGrantExpired = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: true,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverGrantExpired.allowed &&
    stoppedOverGrantExpired.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over GRANT_EXPIRED before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-grant-expired unexpected: ${JSON.stringify(stoppedOverGrantExpired)}`,
    );
  }

  // 20. Post-apply APPLYING→CANCELLED refused (F18) — invents no cancel/mutation.
  let applyingCancelRefused = false;
  try {
    transition(EffectState.APPLYING, EffectState.CANCELLED);
  } catch {
    applyingCancelRefused = true;
  }
  if (
    applyingCancelRefused &&
    !canTransition(EffectState.APPLYING, EffectState.CANCELLED) &&
    isPostApplyPhase(EffectState.APPLYING) === true
  ) {
    details.push(
      "APPLYING→CANCELLED transition refused (post-apply; invents no cancel/adapter mutation; contrast T-X017 reconcile-only)",
    );
  } else {
    passed = false;
    details.push(
      `APPLYING cancel refuse unexpected refused=${applyingCancelRefused} canTransition=${canTransition(EffectState.APPLYING, EffectState.CANCELLED)}`,
    );
  }

  // 21. Outbound stop preferred when revision mismatch also true (F18).
  const stoppedOverRevision = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: false,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverRevision.allowed &&
    stoppedOverRevision.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over REVISION_MISMATCH before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-revision unexpected: ${JSON.stringify(stoppedOverRevision)}`,
    );
  }

  // 22. Outbound stop preferred when prerequisiteMissing also true (F18).
  const stoppedOverPrereq = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: true,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverPrereq.allowed &&
    stoppedOverPrereq.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over PREREQUISITE_MISSING before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-prereq unexpected: ${JSON.stringify(stoppedOverPrereq)}`,
    );
  }

  // 23. Post-apply VERIFYING→CANCELLED refused (F19).
  let verifyingCancelRefused = false;
  try {
    transition(EffectState.VERIFYING, EffectState.CANCELLED);
  } catch {
    verifyingCancelRefused = true;
  }
  if (
    verifyingCancelRefused &&
    !canTransition(EffectState.VERIFYING, EffectState.CANCELLED) &&
    isPostApplyPhase(EffectState.VERIFYING) === true
  ) {
    details.push(
      "VERIFYING→CANCELLED transition refused (post-apply; invents no cancel/adapter mutation)",
    );
  } else {
    passed = false;
    details.push(
      `VERIFYING cancel refuse unexpected refused=${verifyingCancelRefused} canTransition=${canTransition(EffectState.VERIFYING, EffectState.CANCELLED)}`,
    );
  }

  // 24. Outbound stop preferred when prerequisiteConflict also true (F19).
  const stoppedOverPrereqConflict = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: true,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverPrereqConflict.allowed &&
    stoppedOverPrereqConflict.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over PREREQUISITE_CONFLICT before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-prereq-conflict unexpected: ${JSON.stringify(stoppedOverPrereqConflict)}`,
    );
  }

  // 25. COMPLETE→CANCELLED refused (F19) — terminal; no retroactive cancel claim.
  let completeCancelRefused = false;
  try {
    transition(EffectState.COMPLETE, EffectState.CANCELLED);
  } catch {
    completeCancelRefused = true;
  }
  if (
    completeCancelRefused &&
    !canTransition(EffectState.COMPLETE, EffectState.CANCELLED)
  ) {
    details.push(
      "COMPLETE→CANCELLED transition refused (terminal; invents no fake cancel)",
    );
  } else {
    passed = false;
    details.push(
      `COMPLETE cancel refuse unexpected refused=${completeCancelRefused} canTransition=${canTransition(EffectState.COMPLETE, EffectState.CANCELLED)}`,
    );
  }

  // 26. QUARANTINED→CANCELLED refused (F20) — terminal quarantine; no re-cancel.
  let quarantinedCancelRefused = false;
  try {
    transition(EffectState.QUARANTINED, EffectState.CANCELLED);
  } catch {
    quarantinedCancelRefused = true;
  }
  if (
    quarantinedCancelRefused &&
    !canTransition(EffectState.QUARANTINED, EffectState.CANCELLED)
  ) {
    details.push(
      "QUARANTINED→CANCELLED transition refused (terminal; invents no fake cancel)",
    );
  } else {
    passed = false;
    details.push(
      `QUARANTINED cancel refuse unexpected refused=${quarantinedCancelRefused}`,
    );
  }

  // 27. Outbound stop preferred when read evidence missing (F20).
  const stoppedOverReadEvidence = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: false,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverReadEvidence.allowed &&
    stoppedOverReadEvidence.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over READ_EVIDENCE_MISSING before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-read-evidence unexpected: ${JSON.stringify(stoppedOverReadEvidence)}`,
    );
  }

  // 28. Outbound stop preferred when ownership unproven (F20).
  const stoppedOverOwnership = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: false,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverOwnership.allowed &&
    stoppedOverOwnership.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over OWNERSHIP_UNPROVEN before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-ownership unexpected: ${JSON.stringify(stoppedOverOwnership)}`,
    );
  }

  // 29. Outbound stop preferred when grant missing (F21).
  const stoppedOverGrantMissing = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: false,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedOverGrantMissing.allowed &&
    stoppedOverGrantMissing.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over GRANT_MISSING before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-grant-missing unexpected: ${JSON.stringify(stoppedOverGrantMissing)}`,
    );
  }

  // 30. Compound rate-limit + source-stale still OUTBOUND_STOPPED first (F22).
  const stoppedCompound = evaluatePolicy({
    outboundStopped: true,
    sourceStale: true,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: true,
  });
  if (
    !stoppedCompound.allowed &&
    stoppedCompound.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over compound RATE_LIMIT+SOURCE_STALE before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound compound deny unexpected: ${JSON.stringify(stoppedCompound)}`,
    );
  }

  // 31. Outbound stop preferred when revision mismatch also true (F23).
  const stoppedRevision = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: false,
    rateLimitExceeded: false,
  });
  if (
    !stoppedRevision.allowed &&
    stoppedRevision.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over REVISION_MISMATCH before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-revision unexpected: ${JSON.stringify(stoppedRevision)}`,
    );
  }

  // 32. Outbound stop preferred when grant expired (F24).
  const stoppedGrantExpired = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: true,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedGrantExpired.allowed &&
    stoppedGrantExpired.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over GRANT_EXPIRED before dispatch (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound-vs-grant-expired unexpected: ${JSON.stringify(stoppedGrantExpired)}`,
    );
  }

  // 33. Compound grant-expired + source-stale still OUTBOUND_STOPPED (F25).
  const stoppedExpiredStale = evaluatePolicy({
    outboundStopped: true,
    sourceStale: true,
    grantPresent: true,
    grantExpired: true,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (
    !stoppedExpiredStale.allowed &&
    stoppedExpiredStale.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over compound GRANT_EXPIRED+SOURCE_STALE (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound compound expired-stale unexpected: ${JSON.stringify(stoppedExpiredStale)}`,
    );
  }

  // 34. Compound grant-expired + revision mismatch still OUTBOUND_STOPPED (F26).
  const stoppedExpiredRevision = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: true,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: false,
    rateLimitExceeded: false,
  });
  if (
    !stoppedExpiredRevision.allowed &&
    stoppedExpiredRevision.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over compound GRANT_EXPIRED+REVISION_MISMATCH (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound compound expired-revision unexpected: ${JSON.stringify(stoppedExpiredRevision)}`,
    );
  }

  // 35. Compound source-stale + revision mismatch still OUTBOUND_STOPPED (F27).
  const stoppedStaleRevision = evaluatePolicy({
    outboundStopped: true,
    sourceStale: true,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: false,
    rateLimitExceeded: false,
  });
  if (
    !stoppedStaleRevision.allowed &&
    stoppedStaleRevision.code === "OUTBOUND_STOPPED"
  ) {
    details.push(
      "Outbound stop OUTBOUND_STOPPED preferred over compound SOURCE_STALE+REVISION_MISMATCH (applyAttemptCount=0)",
    );
  } else {
    passed = false;
    details.push(
      `Outbound compound stale-revision unexpected: ${JSON.stringify(stoppedStaleRevision)}`,
    );
  }

  details.push(
    "liveProviderWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE applyAttemptCount=0",
  );
  details.push(
    "Distinct from STOP_AFTER_DISPATCH_RECONCILE (T-X017), EMERGENCY_STOP_AT_COMMIT (T-US-060), TAKEOVER_CANCELS_UNSENT_REPLIES (T-US-044/T-X053), and MISSED_SCHEDULE_COALESCE_NO_BURST (T-US-026)",
  );

  return {
    proofId: `proof-stop-before-dispatch-${randomUUID()}`,
    kind: SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION,
    passed,
    details,
    applyAttemptCount: applyAttempts,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
