import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_MAX_BACKOFF_SECONDS,
  computeBackoffWaitSeconds,
  evaluateRateLimitWithDeadline,
  planRateLimitRecovery,
  simulateRateLimitedProviderRecovery,
} from "./rate-limit-backoff.js";

describe("rate-limit-backoff (T-X030)", () => {
  it("honors full Retry-After without truncating to maxBackoffSeconds", () => {
    const preferred = computeBackoffWaitSeconds({
      attempt: 1,
      retryAfterSeconds: 12,
    });
    expect(preferred).toEqual({ waitSeconds: 12, source: "retry_after" });

    const longRetry = computeBackoffWaitSeconds({
      attempt: 1,
      retryAfterSeconds: 300,
      maxBackoffSeconds: 60,
    });
    expect(longRetry).toEqual({ waitSeconds: 300, source: "retry_after" });
  });

  it("uses capped exponential when Retry-After is absent", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 1,
        retryAfterSeconds: null,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 1, source: "exponential" });
    expect(
      computeBackoffWaitSeconds({
        attempt: 2,
        retryAfterSeconds: null,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 2, source: "exponential" });
    expect(
      computeBackoffWaitSeconds({
        attempt: 10,
        retryAfterSeconds: null,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
        maxBackoffSeconds: DEFAULT_MAX_BACKOFF_SECONDS,
      }),
    ).toEqual({
      waitSeconds: DEFAULT_MAX_BACKOFF_SECONDS,
      source: "exponential",
    });
  });

  it("rejects invalid backoff configuration", () => {
    expect(() =>
      computeBackoffWaitSeconds({
        attempt: 1,
        retryAfterSeconds: null,
        maxBackoffSeconds: -1,
      }),
    ).toThrow(/maxBackoffSeconds/);
    expect(() =>
      evaluateRateLimitWithDeadline(
        {
          httpStatus: 429,
          retryAfterSeconds: 1,
          observedAtIso: "2026-11-22T12:00:00.000Z",
        },
        {
          attempt: 1,
          deadlineAtIso: "2026-11-22T13:00:00.000Z",
          initialBackoffSeconds: Number.NaN,
        },
      ),
    ).toThrow(/initialBackoffSeconds/);
  });

  it("WAITS when Retry-After fits inside the deadline", () => {
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: 5,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
      {
        attempt: 1,
        deadlineAtIso: "2026-11-22T12:01:00.000Z",
      },
    );
    expect(step).toEqual({
      action: "WAIT",
      attempt: 1,
      waitSeconds: 5,
      nextAttemptAtIso: "2026-11-22T12:00:05.000Z",
      source: "retry_after",
      remainingSecondsBeforeDeadline: 60,
    });
  });

  it("compares nextAttemptMs precisely against the deadline (no floor reject)", () => {
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: 5,
        observedAtIso: "2026-11-22T12:00:00.100Z",
      },
      {
        attempt: 1,
        deadlineAtIso: "2026-11-22T12:00:05.900Z",
      },
    );
    expect(step.action).toBe("WAIT");
    if (step.action === "WAIT") {
      expect(step.nextAttemptAtIso).toBe("2026-11-22T12:00:05.100Z");
    }
  });

  it("STOP_DEADLINE when Retry-After would land at/after the deadline", () => {
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: 300,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
      {
        attempt: 1,
        deadlineAtIso: "2026-11-22T12:01:00.000Z",
        maxBackoffSeconds: 60,
      },
    );
    expect(step).toEqual({
      action: "STOP_DEADLINE",
      attempt: 1,
      proposedWaitSeconds: 300,
      remainingSecondsBeforeDeadline: 60,
      reason: "BACKOFF_EXCEEDS_DEADLINE",
    });
  });

  it("STOP_MAX_ATTEMPTS on the final allowed attempt (no wait for +1)", () => {
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: 1,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
      {
        attempt: DEFAULT_MAX_ATTEMPTS,
        deadlineAtIso: "2026-11-22T13:00:00.000Z",
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      },
    );
    expect(step).toEqual({
      action: "STOP_MAX_ATTEMPTS",
      attempt: DEFAULT_MAX_ATTEMPTS,
      reason: "MAX_ATTEMPTS",
    });
  });

  it("plans bounded recovery without spawning agents or claiming success", () => {
    const outcome = planRateLimitRecovery({
      signals: [
        {
          httpStatus: 429,
          retryAfterSeconds: 2,
          observedAtIso: "2026-11-22T12:00:00.000Z",
        },
        {
          httpStatus: 429,
          retryAfterSeconds: null,
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

    expect(outcome.spawnedExtraAgents).toBe(0);
    expect(outcome.preservedDeadline).toBe(true);
    expect(outcome.liveProviderSuccessClaimed).toBe(false);
    expect(outcome.externalEffects).toBe("NONE");
    expect(outcome.steps).toHaveLength(3);
    expect(outcome.steps[0]?.action).toBe("WAIT");
    expect(outcome.steps[1]?.action).toBe("WAIT");
    expect(outcome.steps[2]).toMatchObject({
      action: "STOP_DEADLINE",
      reason: "BACKOFF_EXCEEDS_DEADLINE",
      proposedWaitSeconds: 50,
    });
    expect(outcome.dataStatus).toBe("UNAVAILABLE");
  });

  it("simulates a fake-provider retry loop with before/after call counts", () => {
    const loop = simulateRateLimitedProviderRecovery({
      startIso: "2026-11-22T12:00:00.000Z",
      config: {
        deadlineAtIso: "2026-11-22T12:00:30.000Z",
        maxAttempts: 5,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      },
      fetchOnce: (attempt) => {
        if (attempt === 1) {
          return { status: 429, retryAfterSeconds: 2 };
        }
        if (attempt === 2) {
          return { status: 429, retryAfterSeconds: null };
        }
        return { status: 429, retryAfterSeconds: 40 };
      },
    });

    expect(loop.beforeState).toEqual({
      clockIso: "2026-11-22T12:00:00.000Z",
      providerCallCount: 0,
    });
    expect(loop.providerCallCount).toBe(3);
    expect(loop.attemptsObserved).toBe(3);
    expect(loop.afterState.terminalAction).toBe("STOP_DEADLINE");
    expect(loop.afterState.providerCallCount).toBe(3);
    // attempt1 Retry-After=2 → 12:00:02; attempt2 exponential wait=2 → 12:00:04; attempt3 STOP
    expect(loop.afterState.clockIso).toBe("2026-11-22T12:00:04.000Z");
    expect(loop.recovered).toBe(false);
    expect(loop.spawnedExtraAgents).toBe(0);
    expect(loop.externalEffects).toBe("NONE");
    expect(loop.liveProviderSuccessClaimed).toBe(false);
  });

  it("STOP_DEADLINE when Retry-After lands exactly on the deadline", () => {
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: 10,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
      {
        attempt: 1,
        deadlineAtIso: "2026-11-22T12:00:10.000Z",
      },
    );
    expect(step).toEqual({
      action: "STOP_DEADLINE",
      attempt: 1,
      proposedWaitSeconds: 10,
      remainingSecondsBeforeDeadline: 10,
      reason: "BACKOFF_EXCEEDS_DEADLINE",
    });
  });

  it("recovers on 200 without claiming live success or spawning agents", () => {
    const loop = simulateRateLimitedProviderRecovery({
      startIso: "2026-11-22T12:00:00.000Z",
      config: {
        deadlineAtIso: "2026-11-22T12:05:00.000Z",
        maxAttempts: 5,
      },
      fetchOnce: (attempt) => {
        if (attempt === 1) {
          return { status: 429, retryAfterSeconds: 2 };
        }
        return { status: 200, body: { ok: true } };
      },
    });
    expect(loop.recovered).toBe(true);
    expect(loop.providerCallCount).toBe(2);
    expect(loop.afterState.terminalAction).toBe("SUCCESS");
    expect(loop.spawnedExtraAgents).toBe(0);
    expect(loop.liveProviderSuccessClaimed).toBe(false);
    expect(loop.externalEffects).toBe("NONE");
    expect(loop.preservedDeadline).toBe(true);
  });

  it("partial WAIT progress then STOP_DEADLINE does not invent COMPLETED write (T-X030)", () => {
    const outcome = planRateLimitRecovery({
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
        maxAttempts: 5,
      },
    });
    expect(outcome.steps.map((s) => s.action)).toEqual([
      "WAIT",
      "WAIT",
      "STOP_DEADLINE",
    ]);
    expect(outcome.dataStatus).toBe("UNAVAILABLE");
    expect(outcome.liveProviderSuccessClaimed).toBe(false);
    expect(outcome.externalEffects).toBe("NONE");
  });

  it("Retry-After=0 within deadline is WAIT 0s DELAYED, not SUCCESS write (T-X030)", () => {
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: 0,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
      {
        attempt: 1,
        deadlineAtIso: "2026-11-22T12:01:00.000Z",
      },
    );
    expect(step).toMatchObject({
      action: "WAIT",
      waitSeconds: 0,
      source: "retry_after",
    });
  });

  it("200 with partial body still refuses live VERIFIED / effects (T-X030)", () => {
    const loop = simulateRateLimitedProviderRecovery({
      startIso: "2026-11-22T12:00:00.000Z",
      config: {
        deadlineAtIso: "2026-11-22T12:05:00.000Z",
        maxAttempts: 5,
      },
      fetchOnce: (attempt) => {
        if (attempt === 1) {
          return { status: 429, retryAfterSeconds: 1 };
        }
        return {
          status: 200,
          body: { partial: true, writtenBytes: 3, complete: false },
        };
      },
    });
    expect(loop.recovered).toBe(true);
    expect(loop.afterState.terminalAction).toBe("SUCCESS");
    expect(loop.liveProviderSuccessClaimed).toBe(false);
    expect(loop.externalEffects).toBe("NONE");
    expect(loop.spawnedExtraAgents).toBe(0);
  });

  it("STOP_DEADLINE when observed clock is already past the deadline (T-X030 F12)", () => {
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: 5,
        observedAtIso: "2026-11-22T12:01:00.000Z",
      },
      {
        attempt: 1,
        deadlineAtIso: "2026-11-22T12:00:30.000Z",
      },
    );
    expect(step).toMatchObject({
      action: "STOP_DEADLINE",
      remainingSecondsBeforeDeadline: 0,
      proposedWaitSeconds: 5,
      reason: "BACKOFF_EXCEEDS_DEADLINE",
    });
  });

  it("prefers Retry-After over exponential when both would apply (T-X030 F12)", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 3,
        retryAfterSeconds: 7,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 7, source: "retry_after" });
    expect(
      computeBackoffWaitSeconds({
        attempt: 3,
        retryAfterSeconds: null,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 4, source: "exponential" });
  });

  it("WAIT then STOP_MAX_ATTEMPTS invents no COMPLETED write (T-X030 F12)", () => {
    const loop = simulateRateLimitedProviderRecovery({
      startIso: "2026-11-22T12:00:00.000Z",
      config: {
        deadlineAtIso: "2026-11-22T13:00:00.000Z",
        maxAttempts: 3,
      },
      fetchOnce: () => ({ status: 429, retryAfterSeconds: 1 }),
    });
    expect(loop.steps.map((s) => s.action)).toEqual([
      "WAIT",
      "WAIT",
      "STOP_MAX_ATTEMPTS",
    ]);
    expect(loop.dataStatus).toBe("UNAVAILABLE");
    expect(loop.recovered).toBe(false);
    expect(loop.liveProviderSuccessClaimed).toBe(false);
    expect(loop.externalEffects).toBe("NONE");
  });

  it("ceils fractional Retry-After (T-X030 F13)", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 1,
        retryAfterSeconds: 2.3,
      }),
    ).toEqual({ waitSeconds: 3, source: "retry_after" });
  });

  it("floors fractional attempt index for exponential backoff (Q24 wipe15)", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 2.9,
        retryAfterSeconds: null,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 2, source: "exponential" });
    expect(
      computeBackoffWaitSeconds({
        attempt: 3.1,
        retryAfterSeconds: null,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 4, source: "exponential" });
  });

  it("honors -0 Retry-After as WAIT 0s, not exponential (Q23 wipe15)", () => {
    const negZero = computeBackoffWaitSeconds({
      attempt: 1,
      retryAfterSeconds: -0,
    });
    expect(negZero.source).toBe("retry_after");
    expect(negZero.waitSeconds === 0).toBe(true);
    expect(
      computeBackoffWaitSeconds({
        attempt: 1,
        retryAfterSeconds: -1,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 1, source: "exponential" });
  });

  it("ignores +Infinity Retry-After and uses exponential (Q19 wipe15 wake)", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 2,
        retryAfterSeconds: Number.POSITIVE_INFINITY,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 2, source: "exponential" });
  });

  it("ignores NaN Retry-After and uses exponential (Q17 wipe15)", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 3,
        retryAfterSeconds: Number.NaN,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 4, source: "exponential" });
  });

  it("ignores negative Retry-After and uses exponential (Q16 idle)", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 2,
        retryAfterSeconds: -5,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      }),
    ).toEqual({ waitSeconds: 2, source: "exponential" });
    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: -1,
        observedAtIso: "2026-11-22T12:00:00.000Z",
      },
      {
        attempt: 1,
        deadlineAtIso: "2026-11-22T12:01:00.000Z",
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
      },
    );
    expect(step).toMatchObject({
      action: "WAIT",
      waitSeconds: 1,
      source: "exponential",
    });
  });

  it("maxAttempts=1 stops immediately without WAIT (T-X030 F13)", () => {
    const loop = simulateRateLimitedProviderRecovery({
      startIso: "2026-11-22T12:00:00.000Z",
      config: {
        deadlineAtIso: "2026-11-22T13:00:00.000Z",
        maxAttempts: 1,
      },
      fetchOnce: () => ({ status: 429, retryAfterSeconds: 5 }),
    });
    expect(loop.steps).toEqual([
      {
        action: "STOP_MAX_ATTEMPTS",
        attempt: 1,
        reason: "MAX_ATTEMPTS",
      },
    ]);
    expect(loop.dataStatus).toBe("UNAVAILABLE");
    expect(loop.recovered).toBe(false);
  });

  it("caps exponential backoff at maxBackoffSeconds (T-X030 F13)", () => {
    expect(
      computeBackoffWaitSeconds({
        attempt: 10,
        retryAfterSeconds: null,
        initialBackoffSeconds: 1,
        backoffMultiplier: 2,
        maxBackoffSeconds: 60,
      }),
    ).toEqual({ waitSeconds: 60, source: "exponential" });
  });
});
