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
 * in durable-execution.pg.test. External effects: NONE. Never live VERIFIED.
 */

import { randomBytes, randomUUID } from "node:crypto";
import {
  SoakProofKind,
  type SoakProofRecord,
} from "@worksocial/domain";
import type {
  FakeProviderApplyInput,
  FakeProviderApplyResult,
  FakeProviderEffect,
  FakeProviderStore,
} from "@worksocial/persistence";

const CONCURRENT_CALLERS = 12;

/** Start barrier: all N tasks wait until every peer has arrived, then go. */
async function runBehindStartBarrier<T>(
  n: number,
  fn: () => Promise<T>,
): Promise<T[]> {
  let arrived = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  return Promise.all(
    Array.from({ length: n }, async () => {
      arrived += 1;
      if (arrived === n) release();
      await gate;
      return fn();
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
      // Overlappable critical-section window (Codex P1 target).
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

/**
 * Complete expected proof set for T-X021 fixture ACCEPTED.
 */
export async function proofConcurrentIdempotentRelease(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;
  const operationId = `op-concurrent-${randomUUID().slice(0, 8)}`;
  const bizKey = `biz-concurrent-${operationId}`;
  const digest = `digest-${operationId}`;
  const remoteRef = `remote-concurrent-${operationId}`;

  // 0. Negative control: same barrier + async race window WITHOUT mutex → >1 creates.
  const unsafe = createAsyncRaceWindowFakeProviderStore();
  const raced = await runBehindStartBarrier(CONCURRENT_CALLERS, () =>
    unsafe.applyOnce({
      businessIdempotencyKey: `unsafe-${bizKey}`,
      operationId: `${operationId}-unsafe`,
      payloadDigest: digest,
    }),
  );
  const racedCreated = raced.filter((r) => r.created).length;
  if (racedCreated > 1) {
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
  const results = await runBehindStartBarrier(CONCURRENT_CALLERS, () =>
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

  if (created.length === 1) {
    details.push(
      `Concurrent applyOnce x${CONCURRENT_CALLERS} behind barrier + mutex → created=1 (one dispatch)`,
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
  if (replay.created === false && replay.effect.applyCount === 1) {
    details.push("Post-concurrent replay → created=false applyCount=1");
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

  details.push(
    "Distinct from NO_DUPLICATE_EFFECTS (retry-only); concurrent coalescing only",
  );
  details.push(
    "Offline async race-window + per-key serializer; PG ON CONFLICT covered separately; not sandbox/prod VERIFIED",
  );
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
