/**
 * Fixture proof for T-X016 — stop before dispatch claim → no adapter mutation.
 *
 * Pre-apply (AUTHORIZED) work may CANCELLED; durable stores record intent but
 * never fake-provider apply. Post-apply CANCELLED is refused (contrast only —
 * does not ACCEPTED T-X017). External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  EffectState,
  SoakProofKind,
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
  if (
    canTransition(EffectState.AUTHORIZED, EffectState.CANCELLED) &&
    canTransition(EffectState.QUEUED, EffectState.CANCELLED) &&
    !canTransition(EffectState.APPLYING, EffectState.CANCELLED) &&
    !canTransition(EffectState.VERIFYING, EffectState.CANCELLED) &&
    isPostApplyPhase(EffectState.AUTHORIZED) === false
  ) {
    details.push(
      "Effect machine: AUTHORIZED/QUEUED→CANCELLED allowed; APPLYING/VERIFYING→CANCELLED refused (no fake cancel)",
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

  // 4. Queued-work cancel helper: AUTHORIZED cancelled; APPLYING retained (contrast).
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
      workId: "w-post",
      connectionId: "conn-1",
      capabilityId: "cap-publish",
      operationId: `${operationId}-post`,
      effectState: EffectState.APPLYING,
      queuedAtIso: nowIso,
      summary: "post-dispatch",
    },
  ];
  const cancelResults = cancelEligibleQueuedWork(queue);
  const pre = cancelResults.find((r) => r.workId === "w-pre");
  const post = cancelResults.find((r) => r.workId === "w-post");
  if (
    pre?.cancelled === true &&
    pre.toState === EffectState.CANCELLED &&
    post?.cancelled === false &&
    post.retainedForReconcile === true
  ) {
    details.push(
      "cancelEligibleQueuedWork: AUTHORIZED cancelled; APPLYING retained for reconcile (no fake cancel)",
    );
  } else {
    passed = false;
    details.push(
      `cancelEligibleQueuedWork unexpected pre=${JSON.stringify(pre)} post=${JSON.stringify(post)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE T-X017 not claimed",
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
