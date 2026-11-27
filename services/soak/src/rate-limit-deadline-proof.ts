/**
 * Fixture proof for T-X030 — rate-limit with deadline (bounded backoff).
 *
 * Runs an injected fake-provider retry loop: on 429 respect Retry-After /
 * capped exponential backoff, advance a logical clock on WAIT, stop before the
 * job deadline or at maxAttempts, surface delayed/unavailable data, and never
 * spawn extra agents. External effects: NONE.
 *
 * Deepen (F11 / partial-write note): STOP after partial WAIT progress must not
 * invent COMPLETED/VERIFIED write; Retry-After=0 is WAIT not SUCCESS; 200 with
 * partial body still liveProviderSuccessClaimed=false.
 *
 * Deepen (F12): observed clock past deadline → STOP_DEADLINE; Retry-After
 * preferred over exponential; WAIT then STOP_MAX_ATTEMPTS invents no COMPLETED.
 *
 * Deepen (F13): fractional Retry-After ceil; maxAttempts=1 immediate
 * STOP_MAX_ATTEMPTS; exponential capped at maxBackoff when Retry-After null.
 *
 * Deepen (Q16 idle): negative Retry-After is not honored — exponential only.
 * Deepen (Q17 wipe15): NaN Retry-After → exponential (non-finite refuse).
 * Deepen (Q19 wake): +Infinity Retry-After → exponential (non-finite refuse).
 * Deepen (Q23): -0 Retry-After → WAIT 0; -1 → exponential (sign boundary).
 * Deepen (Q24): fractional attempt floors before exponential index.
 * Deepen (Q28): fractional maxAttempts floors (2.9 → cap at attempt 2 STOP).
 * Deepen (Q31): maxAttempts=1.1 → first 429 STOP (no WAIT invent).
 * Deepen (Q34): negative/zero attempt floors to 1 for exponential index.
 * Deepen (Q35): subnormal Retry-After ceils to 1s (not exponential fallback).
 * Deepen (Q38): -Infinity Retry-After → exponential (finite but < 0 refuse).
 * Deepen (Q41): +Infinity attempt → STOP_MAX_ATTEMPTS (no WAIT invent).
 * Deepen (Q44): -Infinity attempt floors to 1 → WAIT exponential (not STOP).
 * Deepen (Q47): maxAttempts=0.9 floors to 0 → attempt 1 STOP (no WAIT invent).
 * Deepen (Q49): fractional initialBackoffSeconds ceils (0.4 → WAIT 1s).
 * Deepen (Q51): Retry-After=EPSILON ceils to 1s retry_after.
 * Deepen (Q53): backoffMultiplier=1 → flat exponential wait (no growth invent).
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  computeBackoffWaitSeconds,
  evaluateRateLimitWithDeadline,
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

  // Scenario E: exact deadline equality (nextAttemptMs === deadlineMs) → STOP_DEADLINE.
  const exactDeadline = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: 10,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:00:10.000Z",
      maxAttempts: 5,
    },
  });
  const exactStep = exactDeadline.steps[0];
  if (
    exactStep?.action === "STOP_DEADLINE" &&
    exactStep.proposedWaitSeconds === 10 &&
    exactStep.remainingSecondsBeforeDeadline === 10 &&
    exactDeadline.dataStatus === "UNAVAILABLE" &&
    exactDeadline.spawnedExtraAgents === 0
  ) {
    details.push(
      "Retry-After lands exactly on deadline → STOP_DEADLINE (no wait that consumes the deadline)",
    );
  } else {
    passed = false;
    details.push(
      `Exact-deadline STOP failed: ${JSON.stringify(exactDeadline)}`,
    );
  }

  // Scenario F: fake-provider recovers with 200 — still no agent fan-out / live claim / effects.
  const recovered = simulateRateLimitedProviderRecovery({
    startIso: "2026-11-22T12:00:00.000Z",
    config: {
      deadlineAtIso: "2026-11-22T12:05:00.000Z",
      maxAttempts: 5,
      initialBackoffSeconds: 1,
      backoffMultiplier: 2,
    },
    fetchOnce: (attempt) => {
      fakeProviderCalls += 1;
      if (attempt === 1) {
        return { status: 429, retryAfterSeconds: 2 };
      }
      return { status: 200, body: { ok: true } };
    },
  });
  if (
    recovered.recovered === true &&
    recovered.providerCallCount === 2 &&
    recovered.afterState.terminalAction === "SUCCESS" &&
    recovered.spawnedExtraAgents === 0 &&
    recovered.liveProviderSuccessClaimed === false &&
    recovered.externalEffects === "NONE" &&
    recovered.preservedDeadline === true
  ) {
    details.push(
      "Fake-provider 429→200 recovery: calls=2 terminal=SUCCESS; spawnedExtraAgents=0; liveProviderSuccessClaimed=false",
    );
  } else {
    passed = false;
    details.push(
      `Recovery honesty failed: ${JSON.stringify(recovered)}`,
    );
  }

  // Scenario G: partial WAIT progress then STOP_DEADLINE — no invented COMPLETED write.
  const partialProgress = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: 2,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
      {
        httpStatus: 429,
        retryAfterSeconds: 2,
        observedAtIso: "2026-11-22T12:00:02.000Z",
      },
      {
        httpStatus: 429,
        retryAfterSeconds: 50,
        observedAtIso: "2026-11-22T12:00:04.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:00:30.000Z",
      initialBackoffSeconds: 1,
      backoffMultiplier: 2,
      maxBackoffSeconds: 60,
      maxAttempts: 5,
    },
  });
  const pp0 = partialProgress.steps[0];
  const pp1 = partialProgress.steps[1];
  const pp2 = partialProgress.steps[2];
  if (
    pp0?.action === "WAIT" &&
    pp1?.action === "WAIT" &&
    pp2?.action === "STOP_DEADLINE" &&
    partialProgress.steps.length === 3 &&
    partialProgress.dataStatus === "UNAVAILABLE" &&
    partialProgress.liveProviderSuccessClaimed === false &&
    partialProgress.externalEffects === "NONE" &&
    partialProgress.spawnedExtraAgents === 0 &&
    !partialProgress.steps.some((s) => s.action === "STOP_MAX_ATTEMPTS")
  ) {
    details.push(
      "Partial WAIT progress then STOP_DEADLINE → dataStatus=UNAVAILABLE (no invented COMPLETED/VERIFIED write)",
    );
  } else {
    passed = false;
    details.push(
      `Partial-progress stop failed: ${JSON.stringify(partialProgress)}`,
    );
  }

  // Scenario H: Retry-After=0 within deadline → WAIT 0s (DELAYED), not SUCCESS write.
  const zeroRetry = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: 0,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:01:00.000Z",
      maxAttempts: 5,
    },
  });
  const zeroStep = zeroRetry.steps[0];
  if (
    zeroStep?.action === "WAIT" &&
    zeroStep.waitSeconds === 0 &&
    zeroStep.source === "retry_after" &&
    zeroRetry.dataStatus === "DELAYED" &&
    zeroRetry.liveProviderSuccessClaimed === false &&
    zeroRetry.externalEffects === "NONE"
  ) {
    details.push(
      "Retry-After=0 within deadline → WAIT 0s dataStatus=DELAYED (not invented SUCCESS write)",
    );
  } else {
    passed = false;
    details.push(`Retry-After=0 WAIT failed: ${JSON.stringify(zeroRetry)}`);
  }

  // Scenario I: 200 with partial body still refuses live VERIFIED / effects.
  const partialBody = simulateRateLimitedProviderRecovery({
    startIso: "2026-11-22T12:00:00.000Z",
    config: {
      deadlineAtIso: "2026-11-22T12:05:00.000Z",
      maxAttempts: 5,
    },
    fetchOnce: (attempt) => {
      fakeProviderCalls += 1;
      if (attempt === 1) {
        return { status: 429, retryAfterSeconds: 1 };
      }
      return {
        status: 200,
        body: { partial: true, writtenBytes: 3, complete: false },
      };
    },
  });
  if (
    partialBody.recovered === true &&
    partialBody.afterState.terminalAction === "SUCCESS" &&
    partialBody.liveProviderSuccessClaimed === false &&
    partialBody.externalEffects === "NONE" &&
    partialBody.spawnedExtraAgents === 0 &&
    partialBody.preservedDeadline === true
  ) {
    details.push(
      "200 with partial body: terminal=SUCCESS fixture-only; liveProviderSuccessClaimed=false externalEffects=NONE (no invented VERIFIED write)",
    );
  } else {
    passed = false;
    details.push(
      `Partial-body recovery honesty failed: ${JSON.stringify(partialBody)}`,
    );
  }

  // Scenario J (F12): observed clock already past deadline → STOP_DEADLINE.
  const pastDeadline = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: 5,
        observedAtIso: "2026-11-22T12:01:00.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:00:30.000Z",
      maxAttempts: 5,
    },
  });
  const pastStep = pastDeadline.steps[0];
  if (
    pastStep?.action === "STOP_DEADLINE" &&
    pastStep.remainingSecondsBeforeDeadline === 0 &&
    pastStep.proposedWaitSeconds === 5 &&
    pastDeadline.dataStatus === "UNAVAILABLE" &&
    pastDeadline.liveProviderSuccessClaimed === false &&
    pastDeadline.spawnedExtraAgents === 0
  ) {
    details.push(
      "Observed clock past deadline → STOP_DEADLINE remainingSeconds=0 (no invented WAIT/SUCCESS write)",
    );
  } else {
    passed = false;
    details.push(
      `Past-deadline STOP failed: ${JSON.stringify(pastDeadline)}`,
    );
  }

  // Scenario K (F12): Retry-After preferred over exponential when both would apply.
  const preferred = computeBackoffWaitSeconds({
    attempt: 3,
    retryAfterSeconds: 7,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
    maxBackoffSeconds: 60,
  });
  const exponentialOnly = computeBackoffWaitSeconds({
    attempt: 3,
    retryAfterSeconds: null,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
    maxBackoffSeconds: 60,
  });
  if (
    preferred.source === "retry_after" &&
    preferred.waitSeconds === 7 &&
    exponentialOnly.source === "exponential" &&
    exponentialOnly.waitSeconds === 4
  ) {
    details.push(
      "Retry-After=7s preferred over exponential wait=4s at attempt 3 (provider hint honored; not truncated inventively)",
    );
  } else {
    passed = false;
    details.push(
      `Retry-After preference failed preferred=${JSON.stringify(preferred)} exponential=${JSON.stringify(exponentialOnly)}`,
    );
  }

  // Scenario L (F12): WAIT then STOP_MAX_ATTEMPTS invents no COMPLETED write.
  const maxAfterWait = simulateRateLimitedProviderRecovery({
    startIso: "2026-11-22T12:00:00.000Z",
    config: {
      deadlineAtIso: "2026-11-22T13:00:00.000Z",
      maxAttempts: 3,
      maxBackoffSeconds: 60,
    },
    fetchOnce: () => {
      fakeProviderCalls += 1;
      return { status: 429, retryAfterSeconds: 1 };
    },
  });
  const maxLast = maxAfterWait.steps[maxAfterWait.steps.length - 1];
  if (
    maxAfterWait.providerCallCount === 3 &&
    maxAfterWait.steps.length === 3 &&
    maxAfterWait.steps[0]?.action === "WAIT" &&
    maxAfterWait.steps[1]?.action === "WAIT" &&
    maxLast?.action === "STOP_MAX_ATTEMPTS" &&
    maxAfterWait.dataStatus === "UNAVAILABLE" &&
    maxAfterWait.recovered === false &&
    maxAfterWait.liveProviderSuccessClaimed === false &&
    maxAfterWait.externalEffects === "NONE" &&
    maxAfterWait.spawnedExtraAgents === 0
  ) {
    details.push(
      "WAIT then STOP_MAX_ATTEMPTS (maxAttempts=3) → dataStatus=UNAVAILABLE recovered=false (no invented COMPLETED write)",
    );
  } else {
    passed = false;
    details.push(
      `WAIT→STOP_MAX_ATTEMPTS honesty failed: ${JSON.stringify(maxAfterWait)}`,
    );
  }

  // Scenario M (F13): fractional Retry-After is ceiled (not truncated inventively).
  const fractional = computeBackoffWaitSeconds({
    attempt: 1,
    retryAfterSeconds: 2.3,
  });
  const fractionalPlan = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: 2.3,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:01:00.000Z",
      maxAttempts: 5,
    },
  });
  const fracStep = fractionalPlan.steps[0];
  if (
    fractional.source === "retry_after" &&
    fractional.waitSeconds === 3 &&
    fracStep?.action === "WAIT" &&
    fracStep.waitSeconds === 3 &&
    fracStep.source === "retry_after" &&
    fractionalPlan.dataStatus === "DELAYED" &&
    fractionalPlan.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "Fractional Retry-After=2.3s ceiled to WAIT 3s (not truncated inventively; dataStatus=DELAYED)",
    );
  } else {
    passed = false;
    details.push(
      `Fractional Retry-After ceil failed compute=${JSON.stringify(fractional)} plan=${JSON.stringify(fractionalPlan)}`,
    );
  }

  // Scenario N (F13): maxAttempts=1 → immediate STOP_MAX_ATTEMPTS (no WAIT invent).
  const oneShot = simulateRateLimitedProviderRecovery({
    startIso: "2026-11-22T12:00:00.000Z",
    config: {
      deadlineAtIso: "2026-11-22T13:00:00.000Z",
      maxAttempts: 1,
    },
    fetchOnce: () => {
      fakeProviderCalls += 1;
      return { status: 429, retryAfterSeconds: 5 };
    },
  });
  if (
    oneShot.providerCallCount === 1 &&
    oneShot.steps.length === 1 &&
    oneShot.steps[0]?.action === "STOP_MAX_ATTEMPTS" &&
    oneShot.dataStatus === "UNAVAILABLE" &&
    oneShot.recovered === false &&
    oneShot.liveProviderSuccessClaimed === false &&
    oneShot.externalEffects === "NONE" &&
    oneShot.spawnedExtraAgents === 0
  ) {
    details.push(
      "maxAttempts=1 → immediate STOP_MAX_ATTEMPTS (no WAIT; no invented COMPLETED write)",
    );
  } else {
    passed = false;
    details.push(
      `maxAttempts=1 STOP honesty failed: ${JSON.stringify(oneShot)}`,
    );
  }

  // Scenario P16 (Q53): backoffMultiplier=1 → flat exponential wait (attempt 5 still initial).
  const flatMult = computeBackoffWaitSeconds({
    attempt: 5,
    retryAfterSeconds: null,
    initialBackoffSeconds: 4,
    backoffMultiplier: 1,
  });
  if (
    flatMult.source === "exponential" &&
    flatMult.waitSeconds === 4
  ) {
    details.push(
      "backoffMultiplier=1 → flat exponential wait 4s at attempt 5 (no growth invent)",
    );
  } else {
    passed = false;
    details.push(`Flat multiplier failed: ${JSON.stringify(flatMult)}`);
  }

  // Scenario P15 (Q51): Retry-After=EPSILON ceils to 1s retry_after.
  const epsilonRetry = computeBackoffWaitSeconds({
    attempt: 1,
    retryAfterSeconds: Number.EPSILON,
  });
  if (
    epsilonRetry.source === "retry_after" &&
    epsilonRetry.waitSeconds === 1
  ) {
    details.push(
      "Retry-After=EPSILON ceiled to WAIT 1s retry_after (subnormal honored)",
    );
  } else {
    passed = false;
    details.push(`EPSILON Retry-After failed: ${JSON.stringify(epsilonRetry)}`);
  }

  // Scenario P14 (Q49): fractional initialBackoff 0.4s ceils to exponential WAIT 1s.
  const fracInitial = computeBackoffWaitSeconds({
    attempt: 1,
    retryAfterSeconds: null,
    initialBackoffSeconds: 0.4,
    backoffMultiplier: 2,
  });
  if (
    fracInitial.source === "exponential" &&
    fracInitial.waitSeconds === 1
  ) {
    details.push(
      "initialBackoffSeconds=0.4 ceils to exponential WAIT 1s (not zero-wait invent)",
    );
  } else {
    passed = false;
    details.push(
      `Fractional initialBackoff failed: ${JSON.stringify(fracInitial)}`,
    );
  }

  // Scenario P13 (Q47): maxAttempts=0.9 floors to 0 → immediate STOP on attempt 1.
  const zeroMax = evaluateRateLimitWithDeadline(
    {
      httpStatus: 429,
      retryAfterSeconds: 8,
      observedAtIso: "2026-11-22T12:00:00.000Z",
    },
    {
      attempt: 1,
      deadlineAtIso: "2026-11-22T13:00:00.000Z",
      maxAttempts: 0.9,
    },
  );
  if (
    zeroMax.action === "STOP_MAX_ATTEMPTS" &&
    zeroMax.attempt === 1 &&
    zeroMax.reason === "MAX_ATTEMPTS"
  ) {
    details.push(
      "maxAttempts=0.9 floors to 0 → attempt 1 STOP_MAX_ATTEMPTS (no WAIT invent)",
    );
  } else {
    passed = false;
    details.push(`maxAttempts=0.9 STOP failed: ${JSON.stringify(zeroMax)}`);
  }

  // Scenario P12 (Q44): -Infinity attempt floors to WAIT attempt 1 (exponential 1s).
  const negInfAttempt = computeBackoffWaitSeconds({
    attempt: Number.NEGATIVE_INFINITY,
    retryAfterSeconds: null,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  if (
    negInfAttempt.source === "exponential" &&
    negInfAttempt.waitSeconds === 1
  ) {
    details.push(
      "-Infinity attempt floors to exponential attempt 1 (waitSeconds=1; not STOP invent)",
    );
  } else {
    passed = false;
    details.push(
      `-Infinity attempt floor failed: ${JSON.stringify(negInfAttempt)}`,
    );
  }

  // Scenario P11 (Q41): +Infinity attempt → STOP_MAX_ATTEMPTS before scheduling WAIT.
  const infAttempt = evaluateRateLimitWithDeadline(
    {
      httpStatus: 429,
      retryAfterSeconds: 30,
      observedAtIso: "2026-11-22T12:00:00.000Z",
    },
    {
      attempt: Number.POSITIVE_INFINITY,
      deadlineAtIso: "2026-11-22T13:00:00.000Z",
      maxAttempts: 5,
    },
  );
  if (
    infAttempt.action === "STOP_MAX_ATTEMPTS" &&
    infAttempt.reason === "MAX_ATTEMPTS"
  ) {
    details.push(
      "+Infinity attempt → STOP_MAX_ATTEMPTS (no WAIT despite Retry-After=30)",
    );
  } else {
    passed = false;
    details.push(`+Infinity attempt STOP failed: ${JSON.stringify(infAttempt)}`);
  }

  // Scenario P10 (Q38): -Infinity Retry-After → exponential (not honored Retry-After).
  const negInfRetry = computeBackoffWaitSeconds({
    attempt: 2,
    retryAfterSeconds: Number.NEGATIVE_INFINITY,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  if (
    negInfRetry.source === "exponential" &&
    negInfRetry.waitSeconds === 2
  ) {
    details.push(
      "-Infinity Retry-After refused → exponential wait 2s (no invent retry_after)",
    );
  } else {
    passed = false;
    details.push(`-Infinity Retry-After failed: ${JSON.stringify(negInfRetry)}`);
  }

  // Scenario P9 (Q35): subnormal Retry-After ceils to WAIT 1s.
  const subnormalRetry = computeBackoffWaitSeconds({
    attempt: 1,
    retryAfterSeconds: Number.MIN_VALUE,
  });
  if (
    subnormalRetry.source === "retry_after" &&
    subnormalRetry.waitSeconds === 1
  ) {
    details.push(
      "Subnormal Retry-After ceiled to WAIT 1s retry_after (not exponential invent)",
    );
  } else {
    passed = false;
    details.push(`Subnormal Retry-After failed: ${JSON.stringify(subnormalRetry)}`);
  }

  // Scenario P8 (Q34): attempt -1 floors to exponential attempt 1 (wait 1s).
  const negAttempt = computeBackoffWaitSeconds({
    attempt: -1,
    retryAfterSeconds: null,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  if (
    negAttempt.source === "exponential" &&
    negAttempt.waitSeconds === 1
  ) {
    details.push(
      "Negative attempt=-1 floors to exponential attempt 1 (waitSeconds=1; no invent)",
    );
  } else {
    passed = false;
    details.push(`Negative attempt floor failed: ${JSON.stringify(negAttempt)}`);
  }

  // Scenario P7 (Q31): maxAttempts=1.1 → attempt 1 STOP (no WAIT despite Retry-After).
  const onePointOne = evaluateRateLimitWithDeadline(
    {
      httpStatus: 429,
      retryAfterSeconds: 60,
      observedAtIso: "2026-11-22T12:00:00.000Z",
    },
    {
      attempt: 1,
      deadlineAtIso: "2026-11-22T13:00:00.000Z",
      maxAttempts: 1.1,
    },
  );
  if (
    onePointOne.action === "STOP_MAX_ATTEMPTS" &&
    onePointOne.attempt === 1 &&
    onePointOne.reason === "MAX_ATTEMPTS"
  ) {
    details.push(
      "Fractional maxAttempts=1.1 → attempt 1 STOP_MAX_ATTEMPTS (no WAIT on first 429)",
    );
  } else {
    passed = false;
    details.push(`maxAttempts=1.1 STOP failed: ${JSON.stringify(onePointOne)}`);
  }

  // Scenario P6 (Q28): fractional maxAttempts=2.9 → attempt 2 STOP_MAX_ATTEMPTS.
  const fracMax = evaluateRateLimitWithDeadline(
    {
      httpStatus: 429,
      retryAfterSeconds: 1,
      observedAtIso: "2026-11-22T12:00:00.000Z",
    },
    {
      attempt: 2,
      deadlineAtIso: "2026-11-22T13:00:00.000Z",
      maxAttempts: 2.9,
    },
  );
  if (
    fracMax.action === "STOP_MAX_ATTEMPTS" &&
    fracMax.attempt === 2 &&
    fracMax.reason === "MAX_ATTEMPTS"
  ) {
    details.push(
      "Fractional maxAttempts=2.9 floors → attempt 2 STOP_MAX_ATTEMPTS (no extra WAIT invent)",
    );
  } else {
    passed = false;
    details.push(`Fractional maxAttempts failed: ${JSON.stringify(fracMax)}`);
  }

  // Scenario P5 (Q24): fractional attempt floors (2.9 → attempt 2 wait).
  const fracAttempt = computeBackoffWaitSeconds({
    attempt: 2.9,
    retryAfterSeconds: null,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  if (
    fracAttempt.source === "exponential" &&
    fracAttempt.waitSeconds === 2
  ) {
    details.push(
      "Fractional attempt=2.9 floors to exponential wait 2s (not attempt-3 wait 4s)",
    );
  } else {
    passed = false;
    details.push(`Fractional attempt floor failed: ${JSON.stringify(fracAttempt)}`);
  }

  // Scenario P4 (Q23): -0 vs -1 Retry-After sign boundary.
  const negZero = computeBackoffWaitSeconds({
    attempt: 1,
    retryAfterSeconds: -0,
  });
  const negOne = computeBackoffWaitSeconds({
    attempt: 1,
    retryAfterSeconds: -1,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  if (
    negZero.source === "retry_after" &&
    negZero.waitSeconds === -0 &&
    negOne.source === "exponential" &&
    negOne.waitSeconds === 1
  ) {
    details.push(
      "Retry-After -0 → WAIT 0s (retry_after); -1 refused → exponential (sign boundary)",
    );
  } else {
    passed = false;
    details.push(
      `Retry-After sign boundary failed: negZero=${JSON.stringify(negZero)} negOne=${JSON.stringify(negOne)}`,
    );
  }

  // Scenario P3 (Q19): +Infinity Retry-After → exponential.
  const infRetry = computeBackoffWaitSeconds({
    attempt: 2,
    retryAfterSeconds: Number.POSITIVE_INFINITY,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  if (
    infRetry.source === "exponential" &&
    infRetry.waitSeconds === 2
  ) {
    details.push(
      "+Infinity Retry-After refused → exponential WAIT (non-finite provider header)",
    );
  } else {
    passed = false;
    details.push(`+Infinity Retry-After refuse failed: ${JSON.stringify(infRetry)}`);
  }

  // Scenario P2 (Q17): NaN Retry-After → exponential (non-finite refuse).
  const nanRetry = computeBackoffWaitSeconds({
    attempt: 3,
    retryAfterSeconds: Number.NaN,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  if (
    nanRetry.source === "exponential" &&
    nanRetry.waitSeconds === 4
  ) {
    details.push(
      "NaN Retry-After refused → exponential WAIT attempt=3 (non-finite provider header)",
    );
  } else {
    passed = false;
    details.push(`NaN Retry-After refuse failed: ${JSON.stringify(nanRetry)}`);
  }

  // Scenario P (Q16): negative Retry-After ignored → exponential wait (no invent).
  const negativeRetry = computeBackoffWaitSeconds({
    attempt: 2,
    retryAfterSeconds: -3,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
  });
  const negativePlan = planRateLimitRecovery({
    signals: [
      {
        httpStatus: 429,
        retryAfterSeconds: -1,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
    ],
    config: {
      deadlineAtIso: "2026-11-22T12:01:00.000Z",
      maxAttempts: 5,
      initialBackoffSeconds: 1,
      backoffMultiplier: 2,
    },
  });
  const negStep = negativePlan.steps[0];
  if (
    negativeRetry.source === "exponential" &&
    negativeRetry.waitSeconds === 2 &&
    negStep?.action === "WAIT" &&
    negStep.source === "exponential" &&
    negStep.waitSeconds === 1 &&
    negativePlan.liveProviderSuccessClaimed === false &&
    negativePlan.externalEffects === "NONE"
  ) {
    details.push(
      "Negative Retry-After refused → exponential WAIT (no honor of invalid provider seconds)",
    );
  } else {
    passed = false;
    details.push(
      `Negative Retry-After refuse failed compute=${JSON.stringify(negativeRetry)} plan=${JSON.stringify(negativePlan)}`,
    );
  }

  // Scenario O (F13): exponential without Retry-After is capped at maxBackoffSeconds.
  const capped = computeBackoffWaitSeconds({
    attempt: 10,
    retryAfterSeconds: null,
    initialBackoffSeconds: 1,
    backoffMultiplier: 2,
    maxBackoffSeconds: 60,
  });
  if (capped.source === "exponential" && capped.waitSeconds === 60) {
    details.push(
      "Exponential attempt=10 without Retry-After capped at maxBackoffSeconds=60 (not unbounded invent)",
    );
  } else {
    passed = false;
    details.push(`Exponential maxBackoff cap failed: ${JSON.stringify(capped)}`);
  }

  details.push(
    `instrumentedFakeProviderCalls=${fakeProviderCalls} liveProviderWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE`,
  );
  details.push(
    "Distinct from grant hourly RATE_LIMIT_EXCEEDED (policy hard-deny), NO_DUPLICATE_EFFECTS (retry-only), CONCURRENT_IDEMPOTENT_RELEASE (T-X021), DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED (T-X004), and PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE (T-X045)",
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
