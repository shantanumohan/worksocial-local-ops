/**
 * Fixture proof for T-X024 — old fence after reassignment.
 *
 * Worker A leases a mission workflow; after lease expiry Worker B reassigns.
 * Worker A's subsequent commit (bind / markEffectPending) fails the lease fence;
 * Worker B can commit. External effects: NONE. Temporal stays NOT_WIRED.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. Never invents past T-X073.
 *
 * Hillclimb O1: expired-pre-reassignment deny, exact-expiry reclaim gate,
 * old-A reclaim refused while B live, attemptCount on reassignment,
 * post-commit phase fence for old A.
 * Hillclimb O2: classifyMissionLeaseFence (expired ≠ wrong_holder);
 * A self-renew positive control while live.
 * Hillclimb O3: Lease fence throws include fenceCause=…; post-bind
 * wrong_holder mark deny; Ads soft-skip honesty.
 * Hillclimb O4: OLD_FENCE_HONESTY bundle; expired mark deny; wrong_holder
 * precedes expired; ACCEPTED≠VERIFIED edge honesty.
 * Hillclimb O5: LIVE_TEMPORAL_CLAIM_REFUSED for non-FIXTURE wiring;
 * FIXTURE_OK; domain soakNotWiredLiveWiring().temporal alignment.
 * Hillclimb O6: parseMissionLeaseFenceCause round-trip; 1ms-before-expiry
 * still active; VERIFIED_CLAIM_REFUSED; post-commit mark phase fence.
 * Hillclimb O7: EXTERNAL_EFFECTS_CLAIM_REFUSED; LIVE_PROVIDER_SUCCESS refuse;
 * self-reclaim-before-foreign side path; recoverEffectPending unfenced honesty.
 * Hillclimb O8: ChatGPT Ads ACCESS_BLOCKED / soft-skip trio gates;
 * active-holder operation mismatch distinct from fenceCause.
 * Hillclimb O9: RELATED_CASES_OK / CATALOG_CEILING_REFUSED; post-succeed
 * lease clear → fenceCause=no_holder; claimLease refused on terminal.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  soakNotWiredLiveWiring,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  classifyMissionLeaseFence,
  createMemoryMissionWorkflowStore,
  evaluateFixtureTemporalWiring,
  evaluateOldFenceAcceptanceLabel,
  evaluateOldFenceCatalogCaseId,
  evaluateOldFenceChatgptAdsAccess,
  evaluateOldFenceExternalEffects,
  evaluateOldFenceLiveProviderSuccess,
  evaluateOldFenceRelatedCaseIds,
  evaluateOldFenceSoftSkipAdsCase,
  formatOldFenceHonestyDetail,
  isMissionLeaseActive,
  OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS,
  OLD_FENCE_HONESTY,
  parseMissionLeaseFenceCause,
} from "@worksocial/persistence";

/** Live Temporal / mission runtime — always NOT_WIRED offline. */
export const OLD_FENCE_TEMPORAL_WIRING =
  OLD_FENCE_HONESTY.liveTemporalWiring;

/**
 * Complete expected proof set for T-X024 fixture ACCEPTED.
 */
export async function proofOldFenceAfterReassignment(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const store = createMemoryMissionWorkflowStore();
  const workflowId = `wf-fence-${randomUUID().slice(0, 8)}`;
  const jobId = `job-fence-${randomUUID().slice(0, 8)}`;
  const workerA = `worker-a-${randomUUID().slice(0, 8)}`;
  const workerB = `worker-b-${randomUUID().slice(0, 8)}`;
  const t0 = nowIso;
  const tLeaseExpiry = new Date(Date.parse(t0) + 1_000).toISOString();
  const tAtExpiry = tLeaseExpiry;
  const tAfterExpiry = new Date(Date.parse(t0) + 2_000).toISOString();
  const operationId = `op-fence-${randomUUID().slice(0, 8)}`;

  const liveTemporalRefuse = evaluateFixtureTemporalWiring("TEMPORAL");
  const localDurableRefuse = evaluateFixtureTemporalWiring("LOCAL_DURABLE");
  const fixtureOk = evaluateFixtureTemporalWiring("FIXTURE");
  const domainTemporal = soakNotWiredLiveWiring().temporal;
  const acceptedOk = evaluateOldFenceAcceptanceLabel("ACCEPTED");
  const verifiedRefuse = evaluateOldFenceAcceptanceLabel("VERIFIED");
  const effectsNoneOk = evaluateOldFenceExternalEffects("NONE");
  const effectsRefuse = evaluateOldFenceExternalEffects("LIVE_APPLY");
  const liveProviderNoneOk = evaluateOldFenceLiveProviderSuccess(false);
  const liveProviderRefuse = evaluateOldFenceLiveProviderSuccess(true);
  const adsBlockedOk = evaluateOldFenceChatgptAdsAccess("ACCESS_BLOCKED");
  const adsAccessRefuse = evaluateOldFenceChatgptAdsAccess("LIVE");
  const softSkipF07 = evaluateOldFenceSoftSkipAdsCase("T-F07");
  const softSkipUs013 = evaluateOldFenceSoftSkipAdsCase("T-US-013");
  const softSkipUs014 = evaluateOldFenceSoftSkipAdsCase("T-US-014");
  const softSkipSelf = evaluateOldFenceSoftSkipAdsCase("T-X024");
  const relatedOk = evaluateOldFenceRelatedCaseIds(
    OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS,
  );
  const relatedRefuse = evaluateOldFenceRelatedCaseIds(["T-X024", "T-X074"]);
  const catalogOk = evaluateOldFenceCatalogCaseId("T-X024");
  const catalogCeilingRefuse = evaluateOldFenceCatalogCaseId("T-X074");
  if (
    liveTemporalRefuse.code === "LIVE_TEMPORAL_CLAIM_REFUSED" &&
    liveTemporalRefuse.allowed === false &&
    localDurableRefuse.code === "LIVE_TEMPORAL_CLAIM_REFUSED" &&
    fixtureOk.code === "FIXTURE_OK" &&
    fixtureOk.allowed === true &&
    domainTemporal === OLD_FENCE_HONESTY.liveTemporalWiring
  ) {
    details.push(
      `LIVE_TEMPORAL_CLAIM_REFUSED for TEMPORAL+LOCAL_DURABLE; FIXTURE_OK; domainTemporal=${domainTemporal}`,
    );
  } else {
    passed = false;
    details.push("Fixture temporal wiring honesty gate unexpected");
  }
  if (
    acceptedOk.code === "ACCEPTED_OK" &&
    acceptedOk.allowed === true &&
    verifiedRefuse.code === "VERIFIED_CLAIM_REFUSED" &&
    verifiedRefuse.allowed === false &&
    OLD_FENCE_HONESTY.acceptedNotVerified === true
  ) {
    details.push(
      "VERIFIED_CLAIM_REFUSED for upgrade-to-verified label; ACCEPTED_OK only (acceptedNotVerified=true)",
    );
  } else {
    passed = false;
    details.push("Fixture acceptance label honesty gate unexpected");
  }
  if (
    effectsNoneOk.code === "EXTERNAL_EFFECTS_NONE_OK" &&
    effectsRefuse.code === "EXTERNAL_EFFECTS_CLAIM_REFUSED" &&
    liveProviderNoneOk.code === "LIVE_PROVIDER_SUCCESS_NONE_OK" &&
    liveProviderRefuse.code === "LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED" &&
    OLD_FENCE_HONESTY.externalEffects === "NONE" &&
    OLD_FENCE_HONESTY.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "EXTERNAL_EFFECTS_CLAIM_REFUSED for non-NONE; LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED for true; NONE/false only",
    );
  } else {
    passed = false;
    details.push("Fixture externalEffects/liveProvider honesty gate unexpected");
  }
  if (
    adsBlockedOk.code === "CHATGPT_ADS_ACCESS_BLOCKED_OK" &&
    adsAccessRefuse.code === "CHATGPT_ADS_ACCESS_CLAIM_REFUSED" &&
    softSkipF07.code === "SOFT_SKIP_ADS_OK" &&
    softSkipUs013.code === "SOFT_SKIP_ADS_OK" &&
    softSkipUs014.code === "SOFT_SKIP_ADS_OK" &&
    softSkipSelf.code === "NOT_SOFT_SKIP_ADS_CASE" &&
    OLD_FENCE_HONESTY.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "CHATGPT_ADS_ACCESS_CLAIM_REFUSED for non-blocked; SOFT_SKIP_ADS_OK for T-F07,T-US-013,T-US-014; T-X024 NOT_SOFT_SKIP_ADS_CASE",
    );
  } else {
    passed = false;
    details.push("Fixture ChatGPT Ads soft-skip honesty gate unexpected");
  }
  if (
    relatedOk.code === "RELATED_CASES_OK" &&
    relatedRefuse.code === "RELATED_CASES_CLAIM_REFUSED" &&
    catalogOk.code === "CATALOG_CASE_OK" &&
    catalogCeilingRefuse.code === "CATALOG_CEILING_REFUSED"
  ) {
    details.push(
      "RELATED_CASES_OK for T-X024 only; CATALOG_CEILING_REFUSED for invent past T-X073 (T-X074)",
    );
  } else {
    passed = false;
    details.push("Fixture relatedCases/catalog ceiling honesty gate unexpected");
  }

  const enqueued = await store.enqueue({
    workflowId,
    jobId,
    temporalWiring: "FIXTURE",
    nowIso: t0,
  });
  const enqueueGate = evaluateFixtureTemporalWiring(enqueued.temporalWiring);
  if (
    enqueued.temporalWiring !== "FIXTURE" ||
    enqueueGate.code !== "FIXTURE_OK"
  ) {
    passed = false;
    details.push(
      `Enqueue temporalWiring unexpected=${enqueued.temporalWiring} gate=${enqueueGate.code}`,
    );
  }

  // 1. Worker A acquires the lease (pre-reassignment).
  const leasedA = await store.claimLease({
    workflowId,
    holder: workerA,
    leaseExpiresAtIso: tLeaseExpiry,
    nowIso: t0,
  });
  if (leasedA?.leaseHolder === workerA && leasedA.phase === "leased") {
    details.push(
      `Worker A acquired lease holder=${workerA} expires=${tLeaseExpiry}`,
    );
  } else {
    passed = false;
    details.push("Worker A failed to acquire lease");
  }

  // 2. While A's lease is live, B cannot steal it (reassignment requires expiry).
  const stealWhileLive = await store.claimLease({
    workflowId,
    holder: workerB,
    leaseExpiresAtIso: new Date(Date.parse(t0) + 5_000).toISOString(),
    nowIso: new Date(Date.parse(t0) + 100).toISOString(),
  });
  if (stealWhileLive === null) {
    details.push("Worker B refused while A lease live (no premature reassignment)");
  } else {
    passed = false;
    details.push("Worker B stole live lease — unexpected");
  }

  // 2a. Positive control: A self-renew while live (fence must not block holder).
  const tMid = new Date(Date.parse(t0) + 500).toISOString();
  const renewedA = await store.claimLease({
    workflowId,
    holder: workerA,
    leaseExpiresAtIso: tLeaseExpiry,
    nowIso: tMid,
  });
  if (
    renewedA?.leaseHolder === workerA &&
    renewedA.attemptCount === 2 &&
    classifyMissionLeaseFence(renewedA, workerA, tMid) === "active"
  ) {
    details.push(
      `Worker A self-renew while live ok attemptCount=2 fenceCause=active`,
    );
  } else {
    passed = false;
    details.push(
      `Worker A self-renew unexpected holder=${renewedA?.leaseHolder} attempts=${renewedA?.attemptCount}`,
    );
  }

  // 2b. 1ms-before-expiry still active (complementary to exact-expiry expired).
  const tOneMsBefore = new Date(Date.parse(tLeaseExpiry) - 1).toISOString();
  const snapBeforeExpiry = await store.get(workflowId);
  if (
    snapBeforeExpiry &&
    classifyMissionLeaseFence(snapBeforeExpiry, workerA, tOneMsBefore) ===
      "active" &&
    isMissionLeaseActive(snapBeforeExpiry, workerA, tOneMsBefore) === true
  ) {
    details.push(
      `1ms-before-expiry boundary: fenceCause=active isMissionLeaseActive=true`,
    );
  } else {
    passed = false;
    details.push("1ms-before-expiry boundary unexpected");
  }

  // 2c. Exact expiry: classify=expired; A cannot bind pre-reassignment.
  const snapAtExpiry = await store.get(workflowId);
  const causeAtExpiry = snapAtExpiry
    ? classifyMissionLeaseFence(snapAtExpiry, workerA, tAtExpiry)
    : null;
  if (
    causeAtExpiry === "expired" &&
    snapAtExpiry &&
    isMissionLeaseActive(snapAtExpiry, workerA, tAtExpiry) === false
  ) {
    details.push(
      `Exact expiry boundary: fenceCause=expired isMissionLeaseActive=false`,
    );
  } else {
    passed = false;
    details.push(
      `Exact expiry boundary unexpected cause=${causeAtExpiry ?? "missing"}`,
    );
  }

  let expiredPreReassignDenied = false;
  try {
    await store.bindOperationWhileLeased({
      workflowId,
      operationId: `${operationId}-expired-pre`,
      holder: workerA,
      nowIso: tAtExpiry,
      payloadDigest: "digest-expired-pre",
      businessIdempotencyKey: "biz-expired-pre",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Lease fence failed/i.test(msg) &&
      parseMissionLeaseFenceCause(msg) === "expired"
    ) {
      expiredPreReassignDenied = true;
      details.push(`Expired-pre-reassignment A bind denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Expired-pre-reassignment unexpected error: ${msg}`);
    }
  }
  if (!expiredPreReassignDenied) {
    passed = false;
    details.push("Expired-pre-reassignment A bind unexpectedly succeeded");
  }

  // 2d. Expired-pre-reassignment markEffectPending also fenceCause=expired.
  let expiredPreMarkDenied = false;
  try {
    await store.markEffectPending({
      workflowId,
      operationId: `${operationId}-expired-pre`,
      holder: workerA,
      nowIso: tAtExpiry,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Lease fence failed/i.test(msg) &&
      parseMissionLeaseFenceCause(msg) === "expired"
    ) {
      expiredPreMarkDenied = true;
      details.push(`Expired-pre-reassignment A mark denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Expired-pre-reassignment mark unexpected error: ${msg}`);
    }
  }
  if (!expiredPreMarkDenied) {
    passed = false;
    details.push("Expired-pre-reassignment A mark unexpectedly succeeded");
  }

  // 2e. Edge: mismatched holder at expiry is wrong_holder (not expired).
  if (
    snapAtExpiry &&
    classifyMissionLeaseFence(snapAtExpiry, workerB, tAtExpiry) ===
      "wrong_holder"
  ) {
    details.push(
      "At-expiry mismatched holder fenceCause=wrong_holder (not expired)",
    );
  } else {
    passed = false;
    details.push("At-expiry mismatched holder classification unexpected");
  }

  // 3. At exact expiry, Worker B reassigns the lease (attemptCount 2→3 after renew).
  const leasedB = await store.claimLease({
    workflowId,
    holder: workerB,
    leaseExpiresAtIso: new Date(Date.parse(tAtExpiry) + 5_000).toISOString(),
    nowIso: tAtExpiry,
  });
  if (
    leasedB?.leaseHolder === workerB &&
    leasedB.phase === "leased" &&
    leasedB.attemptCount === 3
  ) {
    details.push(
      `Worker B reassigned lease holder=${workerB} at exact expiry attemptCount=3`,
    );
  } else {
    passed = false;
    details.push(
      `Worker B reassign unexpected holder=${leasedB?.leaseHolder} attempts=${leasedB?.attemptCount}`,
    );
  }

  // 3a. After reassignment, A is wrong_holder (distinct from expired).
  if (
    leasedB &&
    classifyMissionLeaseFence(leasedB, workerA, tAfterExpiry) ===
      "wrong_holder" &&
    classifyMissionLeaseFence(leasedB, workerB, tAfterExpiry) === "active"
  ) {
    details.push(
      "Post-reassignment fenceCause A=wrong_holder B=active (expired≠wrong_holder)",
    );
  } else {
    passed = false;
    details.push("Post-reassignment fenceCause classification unexpected");
  }

  // 3b. Old worker A cannot reclaim while B holds a live lease.
  const reclaimA = await store.claimLease({
    workflowId,
    holder: workerA,
    leaseExpiresAtIso: new Date(Date.parse(tAfterExpiry) + 10_000).toISOString(),
    nowIso: tAfterExpiry,
  });
  if (reclaimA === null) {
    details.push("Old worker A reclaim refused while B lease live");
  } else {
    passed = false;
    details.push("Old worker A reclaimed while B lease live — unexpected");
  }

  // 4. Old worker A cannot commit — lease fence fails on bind + markEffectPending.
  let oldBindDenied = false;
  try {
    await store.bindOperationWhileLeased({
      workflowId,
      operationId: `${operationId}-stale`,
      holder: workerA,
      nowIso: tAfterExpiry,
      payloadDigest: "digest-stale-a",
      businessIdempotencyKey: "biz-stale-a",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Lease fence failed/i.test(msg) &&
      parseMissionLeaseFenceCause(msg) === "wrong_holder"
    ) {
      oldBindDenied = true;
      details.push(`Old worker A bind denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Old worker A bind unexpected error: ${msg}`);
    }
  }
  if (!oldBindDenied) {
    passed = false;
    details.push("Old worker A bind unexpectedly succeeded after reassignment");
  }

  let oldMarkDenied = false;
  try {
    await store.markEffectPending({
      workflowId,
      operationId: `${operationId}-stale`,
      holder: workerA,
      nowIso: tAfterExpiry,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Lease fence failed/i.test(msg) &&
      parseMissionLeaseFenceCause(msg) === "wrong_holder"
    ) {
      oldMarkDenied = true;
      details.push(`Old worker A markEffectPending denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Old worker A markEffectPending unexpected error: ${msg}`);
    }
  }
  if (!oldMarkDenied) {
    passed = false;
    details.push(
      "Old worker A markEffectPending unexpectedly succeeded after reassignment",
    );
  }

  // 5. New holder B binds; old A still wrong_holder while leased; then B marks.
  let boundB;
  try {
    boundB = await store.bindOperationWhileLeased({
      workflowId,
      operationId,
      holder: workerB,
      nowIso: tAfterExpiry,
      payloadDigest: "digest-b",
      businessIdempotencyKey: "biz-b",
    });
  } catch (err) {
    passed = false;
    details.push(
      `Worker B bind failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let postBindOldMarkDenied = false;
  try {
    await store.markEffectPending({
      workflowId,
      operationId,
      holder: workerA,
      nowIso: tAfterExpiry,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Lease fence failed/i.test(msg) &&
      parseMissionLeaseFenceCause(msg) === "wrong_holder"
    ) {
      postBindOldMarkDenied = true;
      details.push(`Post-bind old A mark denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Post-bind old A unexpected error: ${msg}`);
    }
  }
  if (!postBindOldMarkDenied) {
    passed = false;
    details.push("Post-bind old A mark unexpectedly succeeded");
  }

  // 5a. Active holder B with wrong operationId → Operation mismatch (≠ fenceCause).
  let opMismatchDenied = false;
  try {
    await store.markEffectPending({
      workflowId,
      operationId: `${operationId}-mismatch`,
      holder: workerB,
      nowIso: tAfterExpiry,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      /Operation mismatch/i.test(msg) &&
      parseMissionLeaseFenceCause(msg) === null
    ) {
      opMismatchDenied = true;
      details.push(
        `Active holder operation mismatch (not fenceCause): ${msg}`,
      );
    } else {
      passed = false;
      details.push(`Active holder operation mismatch unexpected: ${msg}`);
    }
  }
  if (!opMismatchDenied) {
    passed = false;
    details.push("Active holder operation mismatch unexpectedly succeeded");
  }

  try {
    const pending = await store.markEffectPending({
      workflowId,
      operationId,
      holder: workerB,
      nowIso: tAfterExpiry,
    });
    if (
      boundB?.leaseHolder === workerB &&
      pending.phase === "effect_pending" &&
      pending.operationId === operationId
    ) {
      details.push(
        `Worker B commit ok phase=${pending.phase} operationId=${pending.operationId}`,
      );
    } else {
      passed = false;
      details.push(
        `Worker B commit unexpected phase=${pending.phase} holder=${pending.leaseHolder}`,
      );
    }
  } catch (err) {
    passed = false;
    details.push(
      `Worker B mark failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // 5b. After B commit, old A still cannot bind (phase fence — not leased).
  let postCommitDenied = false;
  try {
    await store.bindOperationWhileLeased({
      workflowId,
      operationId: `${operationId}-post`,
      holder: workerA,
      nowIso: tAfterExpiry,
      payloadDigest: "digest-post",
      businessIdempotencyKey: "biz-post",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/must be leased|Lease fence failed/i.test(msg)) {
      postCommitDenied = true;
      details.push(`Post-commit old A bind denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Post-commit old A unexpected error: ${msg}`);
    }
  }
  if (!postCommitDenied) {
    passed = false;
    details.push("Post-commit old A bind unexpectedly succeeded");
  }

  // 5c. After B commit, old A mark also phase-fenced (not leased).
  let postCommitMarkDenied = false;
  try {
    await store.markEffectPending({
      workflowId,
      operationId: `${operationId}-post`,
      holder: workerA,
      nowIso: tAfterExpiry,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/must be leased|Lease fence failed/i.test(msg)) {
      postCommitMarkDenied = true;
      details.push(`Post-commit old A mark denied: ${msg}`);
    } else {
      passed = false;
      details.push(`Post-commit old A mark unexpected error: ${msg}`);
    }
  }
  if (!postCommitMarkDenied) {
    passed = false;
    details.push("Post-commit old A mark unexpectedly succeeded");
  }

  // 5d. Terminal succeed clears lease → fenceCause=no_holder; claimLease refused.
  let succeeded;
  try {
    succeeded = await store.succeed(workflowId, tAfterExpiry);
  } catch (err) {
    passed = false;
    details.push(
      `succeed unexpected fail: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    succeeded?.phase === "succeeded" &&
    succeeded.leaseHolder == null &&
    classifyMissionLeaseFence(succeeded, workerA, tAfterExpiry) ===
      "no_holder" &&
    classifyMissionLeaseFence(succeeded, workerB, tAfterExpiry) === "no_holder"
  ) {
    details.push(
      "Post-succeed lease cleared fenceCause=no_holder for A and B",
    );
  } else if (passed) {
    passed = false;
    details.push(
      `Post-succeed no_holder unexpected phase=${succeeded?.phase} holder=${succeeded?.leaseHolder}`,
    );
  }
  const claimAfterSucceed = await store.claimLease({
    workflowId,
    holder: workerA,
    leaseExpiresAtIso: new Date(Date.parse(tAfterExpiry) + 30_000).toISOString(),
    nowIso: tAfterExpiry,
  });
  if (claimAfterSucceed === null) {
    details.push("Post-succeed claimLease refused (terminal phase)");
  } else {
    passed = false;
    details.push("Post-succeed claimLease unexpectedly succeeded");
  }

  // 6. Side workflow: original holder self-reclaim after own expiry (before foreign).
  const sideReclaimStore = createMemoryMissionWorkflowStore();
  const sideReclaimWf = `wf-reclaim-${randomUUID().slice(0, 8)}`;
  await sideReclaimStore.enqueue({
    workflowId: sideReclaimWf,
    jobId: `job-reclaim-${randomUUID().slice(0, 8)}`,
    temporalWiring: "FIXTURE",
    nowIso: t0,
  });
  await sideReclaimStore.claimLease({
    workflowId: sideReclaimWf,
    holder: workerA,
    leaseExpiresAtIso: tLeaseExpiry,
    nowIso: t0,
  });
  const selfReclaimed = await sideReclaimStore.claimLease({
    workflowId: sideReclaimWf,
    holder: workerA,
    leaseExpiresAtIso: new Date(Date.parse(tAtExpiry) + 10_000).toISOString(),
    nowIso: tAtExpiry,
  });
  if (
    selfReclaimed?.leaseHolder === workerA &&
    selfReclaimed.attemptCount === 2 &&
    classifyMissionLeaseFence(selfReclaimed, workerA, tAfterExpiry) === "active"
  ) {
    details.push(
      "Self-reclaim after own expiry before foreign ok attemptCount=2 fenceCause=active",
    );
  } else {
    passed = false;
    details.push(
      `Self-reclaim after own expiry unexpected holder=${selfReclaimed?.leaseHolder} attempts=${selfReclaimed?.attemptCount}`,
    );
  }

  // 7. Side workflow: recoverEffectPending is intentionally unfenced — not a fence proof.
  const sideRecoverStore = createMemoryMissionWorkflowStore();
  const sideRecoverWf = `wf-recover-${randomUUID().slice(0, 8)}`;
  const sideRecoverOp = `op-recover-${randomUUID().slice(0, 8)}`;
  await sideRecoverStore.enqueue({
    workflowId: sideRecoverWf,
    jobId: `job-recover-${randomUUID().slice(0, 8)}`,
    temporalWiring: "FIXTURE",
    nowIso: t0,
  });
  await sideRecoverStore.claimLease({
    workflowId: sideRecoverWf,
    holder: workerA,
    leaseExpiresAtIso: tLeaseExpiry,
    nowIso: t0,
  });
  await sideRecoverStore.claimLease({
    workflowId: sideRecoverWf,
    holder: workerB,
    leaseExpiresAtIso: new Date(Date.parse(tAtExpiry) + 5_000).toISOString(),
    nowIso: tAtExpiry,
  });
  // Stale A bind is fenced (wrong_holder); recover bypasses lease fence by design.
  let sideStaleBindDenied = false;
  try {
    await sideRecoverStore.bindOperationWhileLeased({
      workflowId: sideRecoverWf,
      operationId: `${sideRecoverOp}-stale`,
      holder: workerA,
      nowIso: tAfterExpiry,
      payloadDigest: "digest-recover-stale",
      businessIdempotencyKey: "biz-recover-stale",
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (parseMissionLeaseFenceCause(msg) === "wrong_holder") {
      sideStaleBindDenied = true;
    }
  }
  let recovered;
  try {
    recovered = await sideRecoverStore.recoverEffectPending({
      workflowId: sideRecoverWf,
      operationId: sideRecoverOp,
      nowIso: tAfterExpiry,
    });
  } catch (err) {
    passed = false;
    details.push(
      `recoverEffectPending unexpected fail: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (
    sideStaleBindDenied &&
    recovered?.phase === "effect_pending" &&
    recovered.operationId === sideRecoverOp
  ) {
    details.push(
      "UNFENCED_RECOVERY_NOT_FENCE_PROOF: stale A bind wrong_holder but recoverEffectPending ok (not old-worker commit)",
    );
  } else if (passed) {
    passed = false;
    details.push(
      `Unfenced recover honesty unexpected bindDenied=${sideStaleBindDenied} phase=${recovered?.phase}`,
    );
  }

  details.push(
    formatOldFenceHonestyDetail(OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS),
  );

  return {
    proofId: `proof-old-fence-${randomUUID()}`,
    kind: SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId,
    createdAtIso: tAfterExpiry,
    fixtureOnly: true,
  };
}
