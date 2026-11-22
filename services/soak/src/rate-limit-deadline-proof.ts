/**
 * Fixture proof for T-X030 — rate-limit with deadline (bounded backoff).
 *
 * Runs an injected fake-provider retry loop: on 429 respect Retry-After /
 * capped exponential backoff, advance a logical clock on WAIT, stop before the
 * job deadline or at maxAttempts, surface delayed/unavailable data, and never
 * spawn extra agents. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  planRateLimitRecovery,
  simulateRateLimitedProviderRecovery,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X030 fixture ACCEPTED.
 */
export function proofRateLimitBoundedBackoffPreservesDeadline(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  let fakeProviderCalls = 0;

  // Scenario A: Retry-After fits inside deadline → WAIT (delayed data).
  const within = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: 5,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:01:00.000Z",
      maxBackoffSeconds: 60,
      maxAttempts: 5,
    },
  });
  const withinStep = within.steps[0];
  if (
    withinStep?.action === "WAIT" &&
    withinStep.source === "retry_after" &&
    withinStep.waitSeconds === 5 &&
    within.dataStatus === "DELAYED" &&
    within.spawnedExtraAgents === 0 &&
    within.preservedDeadline === true &&
    within.liveProviderSuccessClaimed === false &&
    within.externalEffects === "NONE"
  ) {
    details.push(
      "429 Retry-After=5s within deadline → WAIT (dataStatus=DELAYED, spawnedExtraAgents=0)",
    );
  } else {
    passed = false;
    details.push(`Within-deadline WAIT failed: ${JSON.stringify(within)}`);
  }

  // Scenario B: fake-provider loop — exponential then STOP_DEADLINE with call counts.
  const deadlineStop = simulateRateLimitedProviderRecovery({
    startIso: "2026-11-22T12:00:00.000Z",
    config: {
      deadlineAtIso: "2026-11-22T12:00:30.000Z",
      initialBackoffSeconds: 1,
      backoffMultiplier: 2,
      maxBackoffSeconds: 60,
      maxAttempts: 5,
    },
    fetchOnce: (attempt) => {
      fakeProviderCalls += 1;
      if (attempt === 1) {
        return { status: 429, retryAfterSeconds: null };
      }
      if (attempt === 2) {
        return { status: 429, retryAfterSeconds: null };
      }
      return { status: 429, retryAfterSeconds: 40 };
    },
  });
  const s0 = deadlineStop.steps[0];
  const s1 = deadlineStop.steps[1];
  const s2 = deadlineStop.steps[2];
  if (
    s0?.action === "WAIT" &&
    s0.source === "exponential" &&
    s0.waitSeconds === 1 &&
    s1?.action === "WAIT" &&
    s1.source === "exponential" &&
    s1.waitSeconds === 2 &&
    s2?.action === "STOP_DEADLINE" &&
    s2.reason === "BACKOFF_EXCEEDS_DEADLINE" &&
    s2.proposedWaitSeconds === 40 &&
    deadlineStop.providerCallCount === 3 &&
    deadlineStop.beforeState.providerCallCount === 0 &&
    deadlineStop.afterState.providerCallCount === 3 &&
    deadlineStop.afterState.terminalAction === "STOP_DEADLINE" &&
    deadlineStop.dataStatus === "UNAVAILABLE" &&
    deadlineStop.spawnedExtraAgents === 0 &&
    deadlineStop.preservedDeadline === true &&
    deadlineStop.liveProviderSuccessClaimed === false &&
    deadlineStop.externalEffects === "NONE" &&
    deadlineStop.recovered === false
  ) {
    details.push(
      `Fake-provider loop: before calls=0 → after calls=${deadlineStop.providerCallCount}; STOP_DEADLINE; dataStatus=UNAVAILABLE; no agent fan-out`,
    );
  } else {
    passed = false;
    details.push(
      `Deadline-preserving fake-provider loop failed: ${JSON.stringify(deadlineStop)}`,
    );
  }

  // Scenario C: max-attempt bound stops on final allowed attempt (no +1 wait).
  const maxAttempts = simulateRateLimitedProviderRecovery({
    startIso: "2026-11-22T12:00:00.000Z",
    config: {
      deadlineAtIso: "2026-11-22T13:00:00.000Z",
      maxAttempts: 5,
      maxBackoffSeconds: 60,
    },
    fetchOnce: () => {
      fakeProviderCalls += 1;
      return { status: 429, retryAfterSeconds: 1 };
    },
  });
  const last = maxAttempts.steps[maxAttempts.steps.length - 1];
  if (
    maxAttempts.providerCallCount === 5 &&
    maxAttempts.steps.length === 5 &&
    last?.action === "STOP_MAX_ATTEMPTS" &&
    last.reason === "MAX_ATTEMPTS" &&
    last.attempt === 5 &&
    maxAttempts.spawnedExtraAgents === 0 &&
    maxAttempts.liveProviderSuccessClaimed === false &&
    maxAttempts.recovered === false
  ) {
    details.push(
      "STOP_MAX_ATTEMPTS on attempt 5 (maxAttempts=5); no sixth wait; spawnedExtraAgents=0",
    );
  } else {
    passed = false;
    details.push(`Max-attempt bound failed: ${JSON.stringify(maxAttempts)}`);
  }

  // Scenario D: long Retry-After honored → STOP_DEADLINE (not truncated to 60s wait).
  const honorRetryAfter = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: 300,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:01:00.000Z",
      maxBackoffSeconds: 60,
      maxAttempts: 5,
    },
  });
  const honorStep = honorRetryAfter.steps[0];
  if (
    honorStep?.action === "STOP_DEADLINE" &&
    honorStep.proposedWaitSeconds === 300 &&
    honorRetryAfter.dataStatus === "UNAVAILABLE"
  ) {
    details.push(
      "Retry-After=300s honored (not truncated to 60); STOP_DEADLINE vs 60s remaining",
    );
  } else {
    passed = false;
    details.push(
      `Retry-After honor failed: ${JSON.stringify(honorRetryAfter)}`,
    );
  }

  details.push(
    `instrumentedFakeProviderCalls=${fakeProviderCalls} liveProviderSuccessClaimed=false externalEffects=NONE`,
  );

  return {
    proofId: `proof-rate-limit-deadline-${randomUUID()}`,
    kind: SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx030-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
