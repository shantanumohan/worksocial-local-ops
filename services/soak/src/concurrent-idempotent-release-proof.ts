/**
 * Fixture proof for T-X021 — concurrent idempotent releases → one dispatch.
 *
 * Distinct from NO_DUPLICATE_EFFECTS (sequential retry-only). Concurrent
 * callers share one business idempotency key + digest; exactly one apply
 * creates the remote effect.
 *
 * Honesty: production memory applyOnce is sync (no overlapping critical
 * section). This proof uses an async check→yield→write store plus a start
 * barrier so callers truly overlap, then a per-key in-process serializer
 * so only one dispatch wins. Negative control (no serializer) must observe
 * >1 creates under the same barrier. PG ON CONFLICT race coverage remains
 * in durable-execution.pg.test. External effects: NONE. Live concurrent
 * durable/provider race wiring stays NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * Never live VERIFIED.
 *
 * Hillclimb R1: shared providerEffectId; per-key create counts; digest refuse.
 * Hillclimb R2: sync-store no-overlap; distinct operationIds same key.
 * Hillclimb R3 (Codex P2): true per-key overlap — key B completes while key A
 * is held (final [1,1] alone is insufficient vs a global mutex); mixed-digest
 * concurrent refuse; digest classifier; shared winner operationId; honesty
 * refuseLiveVerified + Ads ACCESS_BLOCKED.
 * Hillclimb R4: global-mutex negative control; mutex survives throw; Ads
 * soft-skip IDs; pgRaceNotClaimed; proofDetailsHonest guard.
 * Hillclimb R5: LIVE_WIRING_CLAIM_REFUSED (claimLiveVerified / requestLiveWire);
 * WINNER_OPERATION_LOOKUP; REMOTE_REF_STABLE_AFTER_MISMATCH.
 * Hillclimb R6: BLANK_KEY_REFUSED; LIVE_TRANSPORT_NOT_WIRED (fixture+WIRED /
 * non-fixture); LOSER_OPERATION_LOOKUP_ABSENT.
 * Hillclimb R7: BLANK_DIGEST_REFUSED; preferLiveDispatch refuse;
 * APPLIED_AT_STABLE_AFTER_MISMATCH; GATE_BEFORE_APPLY (tip #211).
 * Hillclimb R8: KEY/DIGEST_WHITESPACE_REFUSED (tip #216); BUSINESS_KEY_LOOKUP;
 * LAST_SEEN_STABLE_AFTER_MISMATCH.
 * Hillclimb R9: BLANK_OPERATION_REFUSED; PG_RACE_CLAIM_REFUSED;
 * OVERLAP_AS_VERIFIED_REFUSED (tip #219); PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH.
 * Hillclimb R10: OPERATION_WHITESPACE_REFUSED; FALSE_ONE_DISPATCH_PASS_REFUSED
 * (tip #221 companion).
 * Hillclimb R11: FALSE_PER_KEY_OVERLAP_PASS_REFUSED.
 * Hillclimb R12: CONCURRENT_RETRY_ONLY_CLAIM_REFUSED.
 * Hillclimb G34 (Slot G): createCount 0 / unmeasured + claimedOneDispatchPass → refuse.
 */

import { randomBytes, randomUUID } from "node:crypto";
import {
  CONCURRENT_RELEASE_CALLER_COUNT,
  CONCURRENT_RELEASE_LIVE_WIRING,
  ConcurrentReleaseOutcome,
  SoakProofKind,
  classifyAppliedAtStableAfterMismatch,
  classifyBusinessKeyLookup,
  classifyConcurrentCreateCount,
  classifyDigestMismatchRefused,
  classifyDistinctOpSameKeyOneDispatch,
  classifyGateBeforeApply,
  classifyGlobalMutexBlocksCrossKey,
  classifyLastSeenStableAfterMismatch,
  classifyLoserOperationLookupAbsent,
  classifyMixedDigestConcurrentRefused,
  classifyMutexSurvivesThrow,
  classifyPerKeyIsolation,
  classifyPerKeyOverlapWhileHeld,
  classifyProviderEffectIdStableAfterMismatch,
  classifyRemoteRefStableAfterMismatch,
  classifyReplayNoCreate,
  classifySyncStoreNoOverlap,
  classifyWinnerOperationLookup,
  concurrentReleaseHonesty,
  evaluateConcurrentReleaseLiveClaim,
  proofDetailsHonest,
  type SoakProofRecord,
} from "@worksocial/domain";
import {
  createMemoryFakeProviderStore,
  type FakeProviderApplyInput,
  type FakeProviderApplyResult,
  type FakeProviderEffect,
  type FakeProviderStore,
} from "@worksocial/persistence";

/** Start barrier: all N tasks wait until every peer has arrived, then go. */
async function runBehindStartBarrier<T>(
  n: number,
  fn: (index: number) => Promise<T>,
): Promise<T[]> {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return Promise.all(
    Array.from({ length: n }, async (_, index) => {
      arrived += 1;
      if (arrived === n) release();
      await gate;
      return fn(index);
    }),
  );
}

/**
 * Async check→yield→write store: without serialization, concurrent callers
 * overlapping the yield window can each create (exposes the race).
 */
function createAsyncRaceWindowFakeProviderStore(): FakeProviderStore {
  const byKey = new Map<string, FakeProviderEffect>();
  const byOp = new Map<string, string>();

  return {
    async applyOnce(input: FakeProviderApplyInput): Promise<FakeProviderApplyResult> {
      const seen = byKey.get(input.businessIdempotencyKey);
      await Promise.resolve();
      if (seen) {
        if (seen.payloadDigest !== input.payloadDigest) {
          throw new Error(
            `Fake provider key ${input.businessIdempotencyKey} bound to a different payload digest`,
          );
        }
        const touched = { ...seen, lastSeenAtIso: new Date().toISOString() };
        byKey.set(input.businessIdempotencyKey, touched);
        return { effect: touched, created: false };
      }
      await Promise.resolve();
      const stamp = new Date().toISOString();
      const effect: FakeProviderEffect = {
        providerEffectId: `fpe-${randomBytes(6).toString("hex")}`,
        businessIdempotencyKey: input.businessIdempotencyKey,
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        applyCount: 1,
        remoteRef:
          input.remoteRef ?? `remote-${randomBytes(4).toString("hex")}`,
        appliedAtIso: stamp,
        lastSeenAtIso: stamp,
      };
      byKey.set(effect.businessIdempotencyKey, effect);
      byOp.set(effect.operationId, effect.businessIdempotencyKey);
      return { effect, created: true };
    },
    async getByBusinessKey(key) {
      return byKey.get(key);
    },
    async getByOperation(operationId) {
      const key = byOp.get(operationId);
      return key ? byKey.get(key) : undefined;
    },
    async list() {
      return [...byKey.values()];
    },
  };
}

/** Per-key promise-chain mutex so overlapping applyOnce calls serialize. */
function withPerKeyApplyMutex(inner: FakeProviderStore): FakeProviderStore {
  const tails = new Map<string, Promise<unknown>>();
  return {
    async applyOnce(input) {
      const key = input.businessIdempotencyKey;
      const prev = tails.get(key) ?? Promise.resolve();
      let unlock!: () => void;
      const held = new Promise<void>((r) => {
        unlock = r;
      });
      tails.set(
        key,
        prev.then(
          () => held,
          () => held,
        ),
      );
      await prev.catch(() => undefined);
      try {
        return await inner.applyOnce(input);
      } finally {
        unlock();
      }
    },
    getByBusinessKey: (k) => inner.getByBusinessKey(k),
    getByOperation: (op) => inner.getByOperation(op),
    list: () => inner.list(),
  };
}

/** Global promise-chain mutex — cross-key callers also serialize (negative control). */
function withGlobalApplyMutex(inner: FakeProviderStore): FakeProviderStore {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    async applyOnce(input) {
      const prev = tail;
      let unlock!: () => void;
      const held = new Promise<void>((r) => {
        unlock = r;
      });
      tail = prev.then(
        () => held,
        () => held,
      );
      await prev.catch(() => undefined);
      try {
        return await inner.applyOnce(input);
      } finally {
        unlock();
      }
    },
    getByBusinessKey: (k) => inner.getByBusinessKey(k),
    getByOperation: (op) => inner.getByOperation(op),
    list: () => inner.list(),
  };
}

function createEffect(
  input: FakeProviderApplyInput,
): FakeProviderEffect {
  const stamp = new Date().toISOString();
  return {
    providerEffectId: `fpe-${randomBytes(6).toString("hex")}`,
    businessIdempotencyKey: input.businessIdempotencyKey,
    operationId: input.operationId,
    payloadDigest: input.payloadDigest,
    applyCount: 1,
    remoteRef: input.remoteRef ?? `remote-${randomBytes(4).toString("hex")}`,
    appliedAtIso: stamp,
    lastSeenAtIso: stamp,
  };
}

/**
 * Complete expected proof set for T-X021 fixture ACCEPTED.
 */
export async function proofConcurrentIdempotentRelease(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const honesty = concurrentReleaseHonesty();
  const callers = CONCURRENT_RELEASE_CALLER_COUNT;
  const operationId = `op-concurrent-${randomUUID().slice(0, 8)}`;
  const bizKey = `biz-concurrent-${operationId}`;
  const digest = `digest-${operationId}`;
  const remoteRef = `remote-concurrent-${operationId}`;

  // 0a. Sync memory store behind same barrier → created=1 (cannot expose overlap).
  const syncStore = createMemoryFakeProviderStore();
  const syncRaced = await runBehindStartBarrier(callers, () =>
    syncStore.applyOnce({
      businessIdempotencyKey: `sync-${bizKey}`,
      operationId: `${operationId}-sync`,
      payloadDigest: digest,
    }),
  );
  const syncCreated = syncRaced.filter((r) => r.created).length;
  if (
    classifySyncStoreNoOverlap(syncCreated) ===
    ConcurrentReleaseOutcome.SYNC_STORE_NO_OVERLAP
  ) {
    details.push(
      `Sync memory applyOnce behind barrier → created=${syncCreated} (SYNC_STORE_NO_OVERLAP; async race-window required)`,
    );
  } else {
    passed = false;
    details.push(`Sync store unexpectedly overlapped: created=${syncCreated}`);
  }

  // 0b. Negative control: async race window WITHOUT mutex → >1 creates.
  const unsafe = createAsyncRaceWindowFakeProviderStore();
  const raced = await runBehindStartBarrier(callers, () =>
    unsafe.applyOnce({
      businessIdempotencyKey: `unsafe-${bizKey}`,
      operationId: `${operationId}-unsafe`,
      payloadDigest: digest,
    }),
  );
  const racedCreated = raced.filter((r) => r.created).length;
  if (
    classifyConcurrentCreateCount(racedCreated, "unsafe") ===
    ConcurrentReleaseOutcome.OVERLAP_EXPOSED
  ) {
    details.push(
      `Barrier+async race window without serializer → created=${racedCreated} (overlap proven)`,
    );
  } else {
    passed = false;
    details.push(
      `Barrier failed to expose overlap: unsafe created=${racedCreated} (need >1)`,
    );
  }

  // 1. Same barrier + race window WITH per-key mutex → one dispatch.
  const store = withPerKeyApplyMutex(createAsyncRaceWindowFakeProviderStore());
  const results = await runBehindStartBarrier(callers, () =>
    store.applyOnce({
      businessIdempotencyKey: bizKey,
      operationId,
      payloadDigest: digest,
      remoteRef,
    }),
  );

  const created = results.filter((r) => r.created);
  const remoteRefs = new Set(results.map((r) => r.effect.remoteRef));
  const applyCounts = new Set(results.map((r) => r.effect.applyCount));
  const effectIds = new Set(results.map((r) => r.effect.providerEffectId));
  const opIds = new Set(results.map((r) => r.effect.operationId));

  if (
    classifyConcurrentCreateCount(created.length, "serialized") ===
    ConcurrentReleaseOutcome.ONE_DISPATCH
  ) {
    details.push(
      `Concurrent applyOnce x${callers} behind barrier + mutex → created=1 (one dispatch)`,
    );
  } else {
    passed = false;
    details.push(
      `Expected exactly one created dispatch; got created=${created.length}`,
    );
  }

  if (remoteRefs.size === 1 && results[0]?.effect.remoteRef === remoteRef) {
    details.push(`Single remoteRef=${remoteRef}`);
  } else {
    passed = false;
    details.push(`Expected one remoteRef=${remoteRef}; got ${remoteRefs.size}`);
  }

  if (effectIds.size === 1 && created[0]?.effect.providerEffectId) {
    details.push(
      `Shared providerEffectId=${created[0].effect.providerEffectId} across all concurrent observers`,
    );
  } else {
    passed = false;
    details.push(
      `Expected one shared providerEffectId; got ${effectIds.size}`,
    );
  }

  if (opIds.size === 1 && created[0]?.effect.operationId === operationId) {
    details.push(
      `Shared winner operationId=${operationId} across all concurrent observers`,
    );
  } else {
    passed = false;
    details.push(
      `Expected one shared winner operationId; got ${opIds.size}`,
    );
  }

  if (applyCounts.size === 1 && applyCounts.has(1)) {
    details.push("applyCount=1 for every concurrent observer");
  } else {
    passed = false;
    details.push(
      `Expected applyCount=1 only; got counts=${[...applyCounts].join(",")}`,
    );
  }

  // 2. Post-concurrent replay still does not create a second apply.
  const replay = await store.applyOnce({
    businessIdempotencyKey: bizKey,
    operationId,
    payloadDigest: digest,
  });
  if (
    classifyReplayNoCreate(replay.created, replay.effect.applyCount) ===
    ConcurrentReleaseOutcome.REPLAY_NO_CREATE
  ) {
    details.push(
      "Post-concurrent replay → created=false applyCount=1 (REPLAY_NO_CREATE)",
    );
  } else {
    passed = false;
    details.push(
      `Replay unexpectedly created=${replay.created} applyCount=${replay.effect.applyCount}`,
    );
  }

  // 3. Listed provider effects: still a single row for the business key.
  const listed = await store.list();
  const matching = listed.filter((e) => e.businessIdempotencyKey === bizKey);
  if (matching.length === 1) {
    details.push("Provider ledger holds exactly one effect for the business key");
  } else {
    passed = false;
    details.push(`Expected one ledger row for key; got ${matching.length}`);
  }

  // 3b. R5: getByOperation(winner) returns the shared effect.
  const byOp = await store.getByOperation(operationId);
  const sharedEffectId = created[0]?.effect.providerEffectId;
  if (
    classifyWinnerOperationLookup({
      lookedUp: byOp !== undefined,
      matchesSharedProviderEffectId:
        byOp?.providerEffectId === sharedEffectId && sharedEffectId !== undefined,
      applyCount: byOp?.applyCount ?? -1,
    }) === ConcurrentReleaseOutcome.WINNER_OPERATION_LOOKUP
  ) {
    details.push(
      `getByOperation(winner) → shared providerEffectId (WINNER_OPERATION_LOOKUP)`,
    );
  } else {
    passed = false;
    details.push(
      `Winner operation lookup failed: lookedUp=${byOp !== undefined} effectId=${byOp?.providerEffectId}`,
    );
  }

  // 3c. R8: getByBusinessKey returns the shared effect.
  const byBiz = await store.getByBusinessKey(bizKey);
  if (
    classifyBusinessKeyLookup({
      lookedUp: byBiz !== undefined,
      matchesSharedProviderEffectId:
        byBiz?.providerEffectId === sharedEffectId &&
        sharedEffectId !== undefined,
      applyCount: byBiz?.applyCount ?? -1,
    }) === ConcurrentReleaseOutcome.BUSINESS_KEY_LOOKUP
  ) {
    details.push(
      "getByBusinessKey → shared providerEffectId (BUSINESS_KEY_LOOKUP)",
    );
  } else {
    passed = false;
    details.push(
      `Business key lookup failed: lookedUp=${byBiz !== undefined} effectId=${byBiz?.providerEffectId}`,
    );
  }

  // 4. Digest mismatch after bind refused.
  const beforeMismatch = await store.getByBusinessKey(bizKey);
  const lastSeenBeforeMismatch = beforeMismatch?.lastSeenAtIso;
  let digestRefused = false;
  try {
    await store.applyOnce({
      businessIdempotencyKey: bizKey,
      operationId: `${operationId}-mismatch`,
      payloadDigest: `${digest}-other`,
    });
  } catch (err) {
    digestRefused =
      err instanceof Error &&
      err.message.includes("bound to a different payload digest");
  }
  const afterMismatch = await store.getByBusinessKey(bizKey);
  if (
    classifyDigestMismatchRefused({
      refused: digestRefused,
      applyCount: afterMismatch?.applyCount ?? -1,
      digestUnchanged: afterMismatch?.payloadDigest === digest,
    }) === ConcurrentReleaseOutcome.DIGEST_MISMATCH_REFUSED
  ) {
    details.push(
      "Digest mismatch after bind refused; applyCount stays 1 (DIGEST_MISMATCH_REFUSED)",
    );
  } else {
    passed = false;
    details.push(
      `Digest mismatch control failed: refused=${digestRefused} applyCount=${afterMismatch?.applyCount}`,
    );
  }

  // 4b. R5: remoteRef unchanged after digest-mismatch refuse.
  if (
    classifyRemoteRefStableAfterMismatch({
      refused: digestRefused,
      remoteRefUnchanged: afterMismatch?.remoteRef === remoteRef,
      applyCount: afterMismatch?.applyCount ?? -1,
    }) === ConcurrentReleaseOutcome.REMOTE_REF_STABLE_AFTER_MISMATCH
  ) {
    details.push(
      `remoteRef unchanged after mismatch refuse (REMOTE_REF_STABLE_AFTER_MISMATCH)`,
    );
  } else {
    passed = false;
    details.push(
      `remoteRef stability failed: refused=${digestRefused} remoteRef=${afterMismatch?.remoteRef}`,
    );
  }

  // 4c. R7: appliedAtIso unchanged after digest-mismatch refuse.
  const appliedAtBeforeMismatch = beforeMismatch?.appliedAtIso;
  if (
    classifyAppliedAtStableAfterMismatch({
      refused: digestRefused,
      appliedAtUnchanged:
        afterMismatch?.appliedAtIso === appliedAtBeforeMismatch &&
        appliedAtBeforeMismatch !== undefined,
      applyCount: afterMismatch?.applyCount ?? -1,
    }) === ConcurrentReleaseOutcome.APPLIED_AT_STABLE_AFTER_MISMATCH
  ) {
    details.push(
      "appliedAtIso unchanged after mismatch refuse (APPLIED_AT_STABLE_AFTER_MISMATCH)",
    );
  } else {
    passed = false;
    details.push(
      `appliedAtIso stability failed: refused=${digestRefused} appliedAt=${afterMismatch?.appliedAtIso}`,
    );
  }

  // 4d. R8: lastSeenAtIso unchanged after digest-mismatch refuse.
  if (
    classifyLastSeenStableAfterMismatch({
      refused: digestRefused,
      lastSeenUnchanged:
        afterMismatch?.lastSeenAtIso === lastSeenBeforeMismatch &&
        lastSeenBeforeMismatch !== undefined,
      applyCount: afterMismatch?.applyCount ?? -1,
    }) === ConcurrentReleaseOutcome.LAST_SEEN_STABLE_AFTER_MISMATCH
  ) {
    details.push(
      "lastSeenAtIso unchanged after mismatch refuse (LAST_SEEN_STABLE_AFTER_MISMATCH)",
    );
  } else {
    passed = false;
    details.push(
      `lastSeenAtIso stability failed: refused=${digestRefused} lastSeen=${afterMismatch?.lastSeenAtIso}`,
    );
  }

  // 4e. R9: providerEffectId unchanged after digest-mismatch refuse.
  const effectIdBeforeMismatch = beforeMismatch?.providerEffectId;
  if (
    classifyProviderEffectIdStableAfterMismatch({
      refused: digestRefused,
      providerEffectIdUnchanged:
        afterMismatch?.providerEffectId === effectIdBeforeMismatch &&
        effectIdBeforeMismatch !== undefined,
      applyCount: afterMismatch?.applyCount ?? -1,
    }) === ConcurrentReleaseOutcome.PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH
  ) {
    details.push(
      "providerEffectId unchanged after mismatch refuse (PROVIDER_EFFECT_ID_STABLE_AFTER_MISMATCH)",
    );
  } else {
    passed = false;
    details.push(
      `providerEffectId stability failed: refused=${digestRefused} effectId=${afterMismatch?.providerEffectId}`,
    );
  }

  // 5a. Final create counts per key (necessary but not sufficient vs global mutex).
  const dualStore = withPerKeyApplyMutex(createAsyncRaceWindowFakeProviderStore());
  const keyDualA = `dual-a-${operationId}`;
  const keyDualB = `dual-b-${operationId}`;
  const dual = await runBehindStartBarrier(callers, (i) => {
    const key = i % 2 === 0 ? keyDualA : keyDualB;
    return dualStore.applyOnce({
      businessIdempotencyKey: key,
      operationId: `${operationId}-dual-${i}`,
      payloadDigest: `digest-dual-${key}`,
      remoteRef: `remote-${key}`,
    });
  });
  const createdDualA = dual.filter(
    (r) => r.created && r.effect.businessIdempotencyKey === keyDualA,
  ).length;
  const createdDualB = dual.filter(
    (r) => r.created && r.effect.businessIdempotencyKey === keyDualB,
  ).length;
  if (
    classifyPerKeyIsolation([createdDualA, createdDualB]) ===
    ConcurrentReleaseOutcome.PER_KEY_ISOLATION
  ) {
    details.push(
      `Per-key isolation under shared barrier → created=[${createdDualA},${createdDualB}]`,
    );
  } else {
    passed = false;
    details.push(
      `Per-key isolation failed: createdA=${createdDualA} createdB=${createdDualB}`,
    );
  }

  // 5b. Codex P2: key B completes while key A is held (proves not a global mutex).
  const holdKeyA = `hold-a-${operationId}`;
  const holdKeyB = `hold-b-${operationId}`;
  let releaseAHold!: () => void;
  const aHoldGate = new Promise<void>((r) => {
    releaseAHold = r;
  });
  let keyAEntered = false;
  let keyBCompletedWhileAHeld = false;
  const holdInner: FakeProviderStore = {
    async applyOnce(input) {
      if (input.businessIdempotencyKey === holdKeyA) {
        keyAEntered = true;
        await aHoldGate;
        return { effect: createEffect(input), created: true };
      }
      const effect = createEffect(input);
      if (keyAEntered && input.businessIdempotencyKey === holdKeyB) {
        keyBCompletedWhileAHeld = true;
      }
      return { effect, created: true };
    },
    async getByBusinessKey() {
      return undefined;
    },
    async getByOperation() {
      return undefined;
    },
    async list() {
      return [];
    },
  };
  const holdStore = withPerKeyApplyMutex(holdInner);
  const pA = holdStore.applyOnce({
    businessIdempotencyKey: holdKeyA,
    operationId: `${operationId}-hold-a`,
    payloadDigest: `digest-${holdKeyA}`,
  });
  // Yield until A has entered its critical section.
  for (let i = 0; i < 50 && !keyAEntered; i += 1) {
    await Promise.resolve();
  }
  const bResult = await holdStore.applyOnce({
    businessIdempotencyKey: holdKeyB,
    operationId: `${operationId}-hold-b`,
    payloadDigest: `digest-${holdKeyB}`,
  });
  const bDoneWhileHeld = keyBCompletedWhileAHeld && bResult.created === true;
  releaseAHold();
  const aResult = await pA;
  if (
    classifyPerKeyOverlapWhileHeld({
      keyAEntered,
      keyBCompletedWhileAHeld: bDoneWhileHeld,
      keyACreated: aResult.created === true,
      keyBCreated: bResult.created === true,
    }) === ConcurrentReleaseOutcome.PER_KEY_OVERLAP_WHILE_HELD
  ) {
    details.push(
      "Key B created while key A held (PER_KEY_OVERLAP_WHILE_HELD; not a global mutex)",
    );
  } else {
    passed = false;
    details.push(
      `Per-key overlap-while-held failed: aEntered=${keyAEntered} bWhileHeld=${bDoneWhileHeld} aCreated=${aResult.created} bCreated=${bResult.created}`,
    );
  }

  // 5c. R4 negative control: under a GLOBAL mutex, B stays blocked while A held.
  const gHoldKeyA = `ghold-a-${operationId}`;
  const gHoldKeyB = `ghold-b-${operationId}`;
  let releaseGHold!: () => void;
  const gHoldGate = new Promise<void>((r) => {
    releaseGHold = r;
  });
  let gKeyAEntered = false;
  const gHoldInner: FakeProviderStore = {
    async applyOnce(input) {
      if (input.businessIdempotencyKey === gHoldKeyA) {
        gKeyAEntered = true;
        await gHoldGate;
        return { effect: createEffect(input), created: true };
      }
      return { effect: createEffect(input), created: true };
    },
    async getByBusinessKey() {
      return undefined;
    },
    async getByOperation() {
      return undefined;
    },
    async list() {
      return [];
    },
  };
  const globalHoldStore = withGlobalApplyMutex(gHoldInner);
  const gPA = globalHoldStore.applyOnce({
    businessIdempotencyKey: gHoldKeyA,
    operationId: `${operationId}-ghold-a`,
    payloadDigest: `digest-${gHoldKeyA}`,
  });
  for (let i = 0; i < 50 && !gKeyAEntered; i += 1) {
    await Promise.resolve();
  }
  let gBSettledEarly = false;
  const gPB = globalHoldStore
    .applyOnce({
      businessIdempotencyKey: gHoldKeyB,
      operationId: `${operationId}-ghold-b`,
      payloadDigest: `digest-${gHoldKeyB}`,
    })
    .then((r) => {
      gBSettledEarly = true;
      return r;
    });
  for (let i = 0; i < 30; i += 1) {
    await Promise.resolve();
  }
  const gBBlockedWhileHeld = gKeyAEntered && !gBSettledEarly;
  releaseGHold();
  const [gAResult, gBResult] = await Promise.all([gPA, gPB]);
  if (
    classifyGlobalMutexBlocksCrossKey({
      keyAEntered: gKeyAEntered,
      keyBBlockedWhileAHeld: gBBlockedWhileHeld,
      bothEventuallyCreated:
        gAResult.created === true && gBResult.created === true,
    }) === ConcurrentReleaseOutcome.GLOBAL_MUTEX_BLOCKS_CROSS_KEY
  ) {
    details.push(
      "Global mutex blocks key B while A held (GLOBAL_MUTEX_BLOCKS_CROSS_KEY; P2 check discriminating)",
    );
  } else {
    passed = false;
    details.push(
      `Global-mutex negative control failed: aEntered=${gKeyAEntered} bBlocked=${gBBlockedWhileHeld} early=${gBSettledEarly}`,
    );
  }

  // 6. Distinct operationIds / same biz key + mutex → still one dispatch.
  const distinctOpStore = withPerKeyApplyMutex(
    createAsyncRaceWindowFakeProviderStore(),
  );
  const distinctBiz = `biz-distinct-op-${operationId}`;
  const distinctResults = await runBehindStartBarrier(callers, (i) =>
    distinctOpStore.applyOnce({
      businessIdempotencyKey: distinctBiz,
      operationId: `${operationId}-dist-${i}`,
      payloadDigest: `digest-distinct-${operationId}`,
      remoteRef: `remote-distinct-${operationId}`,
    }),
  );
  const distinctCreated = distinctResults.filter((r) => r.created).length;
  const distinctEffectIds = new Set(
    distinctResults.map((r) => r.effect.providerEffectId),
  );
  if (
    classifyDistinctOpSameKeyOneDispatch({
      createdCount: distinctCreated,
      distinctOperationIdsSubmitted: callers,
      sharedProviderEffectIdCount: distinctEffectIds.size,
    }) === ConcurrentReleaseOutcome.DISTINCT_OP_SAME_KEY_ONE_DISPATCH
  ) {
    details.push(
      `Distinct operationIds x${callers} / same biz key → created=1 sharedEffectId (DISTINCT_OP_SAME_KEY_ONE_DISPATCH)`,
    );
  } else {
    passed = false;
    details.push(
      `Distinct-op same-key failed: created=${distinctCreated} effectIds=${distinctEffectIds.size}`,
    );
  }

  // 6b. R6: winner op looked up; a submitted non-winning op id is absent from byOp
  // (coalesced losers return the winner effect — do not use effect.operationId as loser).
  const distinctWinner = distinctResults.find((r) => r.created);
  const submittedDistinctOps = Array.from(
    { length: callers },
    (_, i) => `${operationId}-dist-${i}`,
  );
  const loserSubmittedOp = submittedDistinctOps.find(
    (op) => op !== distinctWinner?.effect.operationId,
  );
  const distinctByWinner = distinctWinner
    ? await distinctOpStore.getByOperation(distinctWinner.effect.operationId)
    : undefined;
  const distinctByLoser = loserSubmittedOp
    ? await distinctOpStore.getByOperation(loserSubmittedOp)
    : undefined;
  if (
    classifyLoserOperationLookupAbsent({
      winnerLookedUp: distinctByWinner !== undefined,
      loserAbsent: distinctByLoser === undefined,
      applyCount: distinctByWinner?.applyCount ?? -1,
    }) === ConcurrentReleaseOutcome.LOSER_OPERATION_LOOKUP_ABSENT
  ) {
    details.push(
      "Loser getByOperation absent; winner present (LOSER_OPERATION_LOOKUP_ABSENT)",
    );
  } else {
    passed = false;
    details.push(
      `Loser lookup control failed: winner=${distinctByWinner !== undefined} loserAbsent=${distinctByLoser === undefined}`,
    );
  }

  // 7. Mixed-digest concurrent race under mutex: one create + mismatches refuse.
  const mixedStore = withPerKeyApplyMutex(
    createAsyncRaceWindowFakeProviderStore(),
  );
  const mixedBiz = `biz-mixed-${operationId}`;
  const mixedDigest = `digest-mixed-${operationId}`;
  const mixedSettled = await runBehindStartBarrier(callers, async (i) => {
    const useGood = i % 2 === 0;
    try {
      const result = await mixedStore.applyOnce({
        businessIdempotencyKey: mixedBiz,
        operationId: `${operationId}-mixed-${i}`,
        payloadDigest: useGood ? mixedDigest : `${mixedDigest}-bad-${i}`,
        remoteRef: `remote-mixed-${operationId}`,
      });
      return { ok: true as const, created: result.created };
    } catch (err) {
      const refused =
        err instanceof Error &&
        err.message.includes("bound to a different payload digest");
      return { ok: false as const, refused };
    }
  });
  const mixedCreated = mixedSettled.filter(
    (r) => r.ok && r.created === true,
  ).length;
  const mixedRefusals = mixedSettled.filter(
    (r) => !r.ok && r.refused === true,
  ).length;
  const mixedLedger = (await mixedStore.list()).filter(
    (e) => e.businessIdempotencyKey === mixedBiz,
  );
  if (
    classifyMixedDigestConcurrentRefused({
      createdCount: mixedCreated,
      mismatchRefusals: mixedRefusals,
      ledgerRowsForKey: mixedLedger.length,
    }) === ConcurrentReleaseOutcome.MIXED_DIGEST_CONCURRENT_REFUSED
  ) {
    details.push(
      `Mixed-digest concurrent race → created=${mixedCreated} refusals=${mixedRefusals} ledger=1 (MIXED_DIGEST_CONCURRENT_REFUSED)`,
    );
  } else {
    passed = false;
    details.push(
      `Mixed-digest concurrent failed: created=${mixedCreated} refusals=${mixedRefusals} ledger=${mixedLedger.length}`,
    );
  }

  // 8. R4: after mismatch throws, mutex unlocks — same-digest replay still works.
  const surviveStore = withPerKeyApplyMutex(
    createAsyncRaceWindowFakeProviderStore(),
  );
  const surviveBiz = `biz-survive-${operationId}`;
  const surviveDigest = `digest-survive-${operationId}`;
  await surviveStore.applyOnce({
    businessIdempotencyKey: surviveBiz,
    operationId: `${operationId}-survive-bind`,
    payloadDigest: surviveDigest,
    remoteRef: `remote-survive-${operationId}`,
  });
  const surviveThrows = await Promise.all(
    Array.from({ length: 6 }, async (_, i) => {
      try {
        await surviveStore.applyOnce({
          businessIdempotencyKey: surviveBiz,
          operationId: `${operationId}-survive-bad-${i}`,
          payloadDigest: `${surviveDigest}-bad-${i}`,
        });
        return false;
      } catch (err) {
        return (
          err instanceof Error &&
          err.message.includes("bound to a different payload digest")
        );
      }
    }),
  );
  const surviveRefusals = surviveThrows.filter(Boolean).length;
  const surviveReplay = await surviveStore.applyOnce({
    businessIdempotencyKey: surviveBiz,
    operationId: `${operationId}-survive-replay`,
    payloadDigest: surviveDigest,
  });
  if (
    classifyMutexSurvivesThrow({
      mismatchRefusals: surviveRefusals,
      postThrowReplayCreated: surviveReplay.created,
      postThrowApplyCount: surviveReplay.effect.applyCount,
    }) === ConcurrentReleaseOutcome.MUTEX_SURVIVES_THROW
  ) {
    details.push(
      `Mutex survives throw → refusals=${surviveRefusals} replay created=false applyCount=1 (MUTEX_SURVIVES_THROW)`,
    );
  } else {
    passed = false;
    details.push(
      `Mutex-survives-throw failed: refusals=${surviveRefusals} created=${surviveReplay.created} applyCount=${surviveReplay.effect.applyCount}`,
    );
  }

  // 9. R5–R7: refuse live VERIFIED / live-wire / blank key+digest / WIRED /
  // non-fixture / preferLive; gate-before-apply leaves store untouched.
  const gateStore = withPerKeyApplyMutex(createAsyncRaceWindowFakeProviderStore());
  const ledgerBeforeGate = (await gateStore.list()).length;
  const liveVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimLiveVerified: true,
    businessIdempotencyKey: `gate-${bizKey}`,
    payloadDigest: digest,
  });
  // Tip #211: refuse must not touch the store (gate before apply).
  let gateApplyCalled = false;
  try {
    if (liveVerifiedRefuse === null) {
      await gateStore.applyOnce({
        businessIdempotencyKey: `gate-${bizKey}`,
        operationId: `${operationId}-gate`,
        payloadDigest: digest,
      });
      gateApplyCalled = true;
    }
  } catch {
    gateApplyCalled = true;
  }
  const ledgerAfterGate = (await gateStore.list()).length;
  if (
    classifyGateBeforeApply({
      refused:
        liveVerifiedRefuse?.code ===
        ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED,
      storeMutations: gateApplyCalled ? 1 : 0,
      ledgerRowsUnchanged: ledgerAfterGate === ledgerBeforeGate,
    }) === ConcurrentReleaseOutcome.GATE_BEFORE_APPLY
  ) {
    details.push(
      "Live-claim gate refused with zero store mutations (GATE_BEFORE_APPLY; tip #211 ordering)",
    );
  } else {
    passed = false;
    details.push(
      `Gate-before-apply failed: code=${liveVerifiedRefuse?.code} applied=${gateApplyCalled} ledger ${ledgerBeforeGate}→${ledgerAfterGate}`,
    );
  }

  const liveWireRefuse = evaluateConcurrentReleaseLiveClaim({
    requestLiveWire: true,
  });
  const blankRefuse = evaluateConcurrentReleaseLiveClaim({
    businessIdempotencyKey: "   ",
  });
  const blankDigestRefuse = evaluateConcurrentReleaseLiveClaim({
    payloadDigest: "  ",
  });
  const keyWhitespaceRefuse = evaluateConcurrentReleaseLiveClaim({
    businessIdempotencyKey: "  padded-key  ",
  });
  const digestWhitespaceRefuse = evaluateConcurrentReleaseLiveClaim({
    payloadDigest: "  padded-digest  ",
  });
  const preferLiveRefuse = evaluateConcurrentReleaseLiveClaim({
    preferLiveDispatch: true,
  });
  const blankOpRefuse = evaluateConcurrentReleaseLiveClaim({
    operationId: "\t",
  });
  const opWhitespaceRefuse = evaluateConcurrentReleaseLiveClaim({
    operationId: "  padded-op  ",
  });
  const pgRaceClaimRefuse = evaluateConcurrentReleaseLiveClaim({
    claimPgRaceCovered: true,
  });
  const retryOnlyClaimRefuse = evaluateConcurrentReleaseLiveClaim({
    claimRetryOnlyCoversConcurrent: true,
  });
  const externalEffectsClaimRefuse = evaluateConcurrentReleaseLiveClaim({
    claimExternalEffectsOccurred: true,
  });
  const adsLiveConnectRefuse = evaluateConcurrentReleaseLiveClaim({
    claimChatgptAdsLiveConnect: true,
  });
  const overlapAsVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    treatOverlapAsLiveVerified: true,
  });
  const falseOneDispatchPassRefuse = evaluateConcurrentReleaseLiveClaim({
    claimedOneDispatchPass: true,
    createCount: 12,
  });
  const falseOneDispatchZeroCreates = evaluateConcurrentReleaseLiveClaim({
    claimedOneDispatchPass: true,
    createCount: 0,
  });
  const falseOneDispatchUnmeasured = evaluateConcurrentReleaseLiveClaim({
    claimedOneDispatchPass: true,
  });
  const trueOneDispatchPassOk =
    evaluateConcurrentReleaseLiveClaim({
      claimedOneDispatchPass: true,
      createCount: 1,
    }) === null;
  const falsePerKeyOverlapPassRefuse = evaluateConcurrentReleaseLiveClaim({
    claimedPerKeyOverlapPass: true,
    keyBCompletedWhileAHeld: false,
  });
  const truePerKeyOverlapPassOk =
    evaluateConcurrentReleaseLiveClaim({
      claimedPerKeyOverlapPass: true,
      keyBCompletedWhileAHeld: true,
    }) === null;
  const wiredRefuse = evaluateConcurrentReleaseLiveClaim({
    fixtureOnly: true,
    liveWiring: "WIRED",
  });
  const nonFixtureRefuse = evaluateConcurrentReleaseLiveClaim({
    fixtureOnly: false,
    liveWiring: "NOT_WIRED",
  });
  const fixtureOnlyOk =
    evaluateConcurrentReleaseLiveClaim({
      fixtureOnly: true,
      liveWiring: "NOT_WIRED",
    }) === null;
  const fixtureAcceptedAsVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimFixtureAcceptedIsVerified: true,
  });
  const liveProviderSuccessRefuse = evaluateConcurrentReleaseLiveClaim({
    claimLiveProviderSuccess: true,
  });
  const sandboxVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimSandboxVerified: true,
  });
  const productionVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimProductionVerified: true,
  });
  const canaryVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimCanaryVerified: true,
  });
  const integrationVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimIntegrationVerified: true,
  });
  const authorizedProductionVerifiedRefuse = evaluateConcurrentReleaseLiveClaim(
    { claimAuthorizedProductionVerified: true },
  );
  const productionCanaryVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimProductionCanaryVerified: true,
  });
  const sandboxProductionVerifiedRefuse = evaluateConcurrentReleaseLiveClaim({
    claimSandboxProductionVerified: true,
  });
  if (
    fixtureAcceptedAsVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED &&
    liveProviderSuccessRefuse?.code ===
      ConcurrentReleaseOutcome.LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED &&
    sandboxVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.SANDBOX_VERIFIED_CLAIM_REFUSED &&
    productionVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.PRODUCTION_VERIFIED_CLAIM_REFUSED &&
    canaryVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.CANARY_VERIFIED_CLAIM_REFUSED &&
    integrationVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.INTEGRATION_VERIFIED_CLAIM_REFUSED &&
    authorizedProductionVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED &&
    productionCanaryVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED &&
    sandboxProductionVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED &&
    liveVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED &&
    liveWireRefuse?.code ===
      ConcurrentReleaseOutcome.LIVE_WIRING_CLAIM_REFUSED &&
    blankRefuse?.code === ConcurrentReleaseOutcome.BLANK_KEY_REFUSED &&
    blankDigestRefuse?.code === ConcurrentReleaseOutcome.BLANK_DIGEST_REFUSED &&
    keyWhitespaceRefuse?.code ===
      ConcurrentReleaseOutcome.KEY_WHITESPACE_REFUSED &&
    digestWhitespaceRefuse?.code ===
      ConcurrentReleaseOutcome.DIGEST_WHITESPACE_REFUSED &&
    preferLiveRefuse?.code ===
      ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED &&
    blankOpRefuse?.code === ConcurrentReleaseOutcome.BLANK_OPERATION_REFUSED &&
    opWhitespaceRefuse?.code ===
      ConcurrentReleaseOutcome.OPERATION_WHITESPACE_REFUSED &&
    pgRaceClaimRefuse?.code === ConcurrentReleaseOutcome.PG_RACE_CLAIM_REFUSED &&
    retryOnlyClaimRefuse?.code ===
      ConcurrentReleaseOutcome.CONCURRENT_RETRY_ONLY_CLAIM_REFUSED &&
    externalEffectsClaimRefuse?.code ===
      ConcurrentReleaseOutcome.EXTERNAL_EFFECTS_CLAIM_REFUSED &&
    adsLiveConnectRefuse?.code ===
      ConcurrentReleaseOutcome.ADS_LIVE_CONNECT_CLAIM_REFUSED &&
    overlapAsVerifiedRefuse?.code ===
      ConcurrentReleaseOutcome.OVERLAP_AS_VERIFIED_REFUSED &&
    falseOneDispatchPassRefuse?.code ===
      ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED &&
    falseOneDispatchZeroCreates?.code ===
      ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED &&
    falseOneDispatchUnmeasured?.code ===
      ConcurrentReleaseOutcome.FALSE_ONE_DISPATCH_PASS_REFUSED &&
    trueOneDispatchPassOk &&
    falsePerKeyOverlapPassRefuse?.code ===
      ConcurrentReleaseOutcome.FALSE_PER_KEY_OVERLAP_PASS_REFUSED &&
    truePerKeyOverlapPassOk &&
    wiredRefuse?.code === ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED &&
    nonFixtureRefuse?.code ===
      ConcurrentReleaseOutcome.LIVE_TRANSPORT_NOT_WIRED &&
    liveVerifiedRefuse.liveProviderSuccessClaimed === false &&
    wiredRefuse.pgRaceNotClaimed === true &&
    nonFixtureRefuse.externalEffects === "NONE" &&
    fixtureOnlyOk
  ) {
    details.push(
      "claimFixtureAcceptedIsVerified → FIXTURE_ACCEPTED_AS_VERIFIED_REFUSED; claimLiveProviderSuccess → LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED; claimSandboxVerified → SANDBOX_VERIFIED_CLAIM_REFUSED; claimProductionVerified → PRODUCTION_VERIFIED_CLAIM_REFUSED; claimCanaryVerified → CANARY_VERIFIED_CLAIM_REFUSED; claimIntegrationVerified → INTEGRATION_VERIFIED_CLAIM_REFUSED; claimAuthorizedProductionVerified → AUTHORIZED_PRODUCTION_VERIFIED_CLAIM_REFUSED; claimProductionCanaryVerified → PRODUCTION_CANARY_VERIFIED_CLAIM_REFUSED; claimSandboxProductionVerified → SANDBOX_PRODUCTION_VERIFIED_CLAIM_REFUSED; claimLiveVerified/requestLiveWire → LIVE_WIRING_CLAIM_REFUSED; blank key/digest/op → BLANK_KEY_REFUSED/BLANK_DIGEST_REFUSED/BLANK_OPERATION_REFUSED; padded key/digest/op → KEY_WHITESPACE_REFUSED/DIGEST_WHITESPACE_REFUSED/OPERATION_WHITESPACE_REFUSED; claimPgRaceCovered → PG_RACE_CLAIM_REFUSED; claimRetryOnlyCoversConcurrent → CONCURRENT_RETRY_ONLY_CLAIM_REFUSED; claimExternalEffectsOccurred → EXTERNAL_EFFECTS_CLAIM_REFUSED; claimChatgptAdsLiveConnect → ADS_LIVE_CONNECT_CLAIM_REFUSED; treatOverlapAsLiveVerified → OVERLAP_AS_VERIFIED_REFUSED; claimedOneDispatchPass+createCount≠1 → FALSE_ONE_DISPATCH_PASS_REFUSED; claimedPerKeyOverlapPass without keyBCompletedWhileAHeld → FALSE_PER_KEY_OVERLAP_PASS_REFUSED; preferLive/fixture+WIRED/non-fixture → LIVE_TRANSPORT_NOT_WIRED (fixture ACCEPTED only; not live VERIFIED)",
    );
  } else {
    passed = false;
    details.push(
      `Live-claim refuse failed: acceptedAsVerified=${fixtureAcceptedAsVerifiedRefuse?.code} providerSuccess=${liveProviderSuccessRefuse?.code} sandboxVerified=${sandboxVerifiedRefuse?.code} productionVerified=${productionVerifiedRefuse?.code} canaryVerified=${canaryVerifiedRefuse?.code} integrationVerified=${integrationVerifiedRefuse?.code} authProdVerified=${authorizedProductionVerifiedRefuse?.code} prodCanaryVerified=${productionCanaryVerifiedRefuse?.code} sandboxProdVerified=${sandboxProductionVerifiedRefuse?.code} verified=${liveVerifiedRefuse?.code} wire=${liveWireRefuse?.code} blank=${blankRefuse?.code} blankDigest=${blankDigestRefuse?.code} keyWs=${keyWhitespaceRefuse?.code} digWs=${digestWhitespaceRefuse?.code} preferLive=${preferLiveRefuse?.code} blankOp=${blankOpRefuse?.code} opWs=${opWhitespaceRefuse?.code} pgRace=${pgRaceClaimRefuse?.code} retryOnly=${retryOnlyClaimRefuse?.code} extEffects=${externalEffectsClaimRefuse?.code} adsLive=${adsLiveConnectRefuse?.code} overlapVerified=${overlapAsVerifiedRefuse?.code} falsePass=${falseOneDispatchPassRefuse?.code} truePassOk=${trueOneDispatchPassOk} falsePerKeyPass=${falsePerKeyOverlapPassRefuse?.code} truePerKeyPassOk=${truePerKeyOverlapPassOk} wired=${wiredRefuse?.code} nonFixture=${nonFixtureRefuse?.code} fixtureOnlyOk=${fixtureOnlyOk}`,
    );
  }

  details.push(
    "Distinct from NO_DUPLICATE_EFFECTS (retry-only); concurrent coalescing only",
  );
  details.push(
    `Offline async race-window + per-key serializer; pgRaceNotClaimed=${honesty.pgRaceNotClaimed}; liveWiring=${honesty.liveWiring}; chatgptAdsAccess=${honesty.chatgptAdsAccess}; adsSoftSkip=[${honesty.adsSoftSkipCaseIds.join(",")}]; refuseLiveVerified=${honesty.refuseLiveVerified}`,
  );
  details.push(
    `liveProviderSuccessClaimed=false externalEffects=${honesty.externalEffects} concurrentReleaseLiveWiring=${CONCURRENT_RELEASE_LIVE_WIRING} deepen=G34 hillclimb=falseOneDispatchZeroAndUnmeasured`,
  );

  if (!proofDetailsHonest(details)) {
    passed = false;
    details.push("proofDetailsHonest failed — forbidden live VERIFIED / success claim");
  }

  return {
    proofId: `proof-concurrent-idempotent-${randomUUID()}`,
    kind: SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
