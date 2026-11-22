/**
 * Provider rate-limit recovery with bounded backoff that preserves the job
 * deadline (T-X030). Respect Retry-After when present; otherwise apply capped
 * exponential backoff. Stop before the deadline rather than inventing success
 * or spawning extra agents to bypass quotas.
 *
 * Distinct from grant hourly RATE_LIMIT_EXCEEDED (hard deny in policy-evaluation).
 * Pure schedule arithmetic + optional injected fake-provider loop — no live I/O.
 */

export const DEFAULT_INITIAL_BACKOFF_SECONDS = 1;
export const DEFAULT_BACKOFF_MULTIPLIER = 2;
export const DEFAULT_MAX_BACKOFF_SECONDS = 60;
export const DEFAULT_MAX_ATTEMPTS = 5;

export type ProviderRateLimitSignal = {
  httpStatus: 429;
  /** Provider Retry-After in seconds when present; null → exponential. */
  retryAfterSeconds: number | null;
  observedAtIso: string;
};

export type RateLimitBackoffConfig = {
  /** Absolute ISO deadline for the job / mission envelope. */
  deadlineAtIso: string;
  initialBackoffSeconds?: number;
  backoffMultiplier?: number;
  maxBackoffSeconds?: number;
  maxAttempts?: number;
};

export type RateLimitBackoffStep =
  | {
      action: "WAIT";
      attempt: number;
      waitSeconds: number;
      nextAttemptAtIso: string;
      source: "retry_after" | "exponential";
      remainingSecondsBeforeDeadline: number;
    }
  | {
      action: "STOP_DEADLINE";
      attempt: number;
      proposedWaitSeconds: number;
      remainingSecondsBeforeDeadline: number;
      reason: "BACKOFF_EXCEEDS_DEADLINE";
    }
  | {
      action: "STOP_MAX_ATTEMPTS";
      attempt: number;
      reason: "MAX_ATTEMPTS";
    };

export type RateLimitRecoveryOutcome = {
  steps: RateLimitBackoffStep[];
  /** Always 0 — never spawn agents to bypass quotas. */
  spawnedExtraAgents: 0;
  /** Honest delayed / unavailable surfacing — never invent success. */
  dataStatus: "DELAYED" | "UNAVAILABLE";
  preservedDeadline: true;
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

export type FakeProviderFetchResult =
  | { status: 200; body: unknown }
  | { status: 429; retryAfterSeconds: number | null };

export type SimulatedRateLimitLoopResult = RateLimitRecoveryOutcome & {
  providerCallCount: number;
  attemptsObserved: number;
  beforeState: { clockIso: string; providerCallCount: 0 };
  afterState: {
    clockIso: string;
    providerCallCount: number;
    terminalAction: RateLimitBackoffStep["action"] | "SUCCESS";
  };
  /** True only when a non-429 response was observed in-fixture. */
  recovered: boolean;
};

function requireFiniteIso(iso: string, label: string): number {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) {
    throw new Error(`Invalid ${label}: ${iso}`);
  }
  return ms;
}

function requirePositiveFinite(
  value: number,
  label: string,
  opts?: { allowZero?: boolean },
): number {
  if (!Number.isFinite(value) || (opts?.allowZero ? value < 0 : value <= 0)) {
    throw new Error(
      `Invalid ${label}: expected finite ${opts?.allowZero ? "non-negative" : "positive"} number, got ${value}`,
    );
  }
  return value;
}

function resolveBackoffParams(input: {
  initialBackoffSeconds?: number;
  backoffMultiplier?: number;
  maxBackoffSeconds?: number;
  maxAttempts?: number;
}): {
  initial: number;
  multiplier: number;
  maxBackoff: number;
  maxAttempts: number;
} {
  const initial = requirePositiveFinite(
    input.initialBackoffSeconds ?? DEFAULT_INITIAL_BACKOFF_SECONDS,
    "initialBackoffSeconds",
  );
  const multiplier = requirePositiveFinite(
    input.backoffMultiplier ?? DEFAULT_BACKOFF_MULTIPLIER,
    "backoffMultiplier",
  );
  const maxBackoff = requirePositiveFinite(
    input.maxBackoffSeconds ?? DEFAULT_MAX_BACKOFF_SECONDS,
    "maxBackoffSeconds",
  );
  const maxAttempts = Math.floor(
    requirePositiveFinite(
      input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      "maxAttempts",
    ),
  );
  return { initial, multiplier, maxBackoff, maxAttempts };
}

/**
 * Compute the next wait: prefer full Retry-After (uncapped — deadline decides),
 * else exponential from attempt index capped by maxBackoffSeconds.
 * Attempt is 1-based for the current 429.
 */
export function computeBackoffWaitSeconds(input: {
  attempt: number;
  retryAfterSeconds: number | null;
  initialBackoffSeconds?: number;
  backoffMultiplier?: number;
  maxBackoffSeconds?: number;
}): { waitSeconds: number; source: "retry_after" | "exponential" } {
  const { initial, multiplier, maxBackoff } = resolveBackoffParams(input);
  const attempt = Math.max(1, Math.floor(input.attempt));

  if (
    input.retryAfterSeconds !== null &&
    Number.isFinite(input.retryAfterSeconds) &&
    input.retryAfterSeconds >= 0
  ) {
    // Honor provider Retry-After fully; do not truncate with exponential cap.
    return {
      waitSeconds: Math.ceil(input.retryAfterSeconds),
      source: "retry_after",
    };
  }

  const raw = initial * Math.pow(multiplier, attempt - 1);
  const waitSeconds = Math.min(Math.max(0, Math.ceil(raw)), maxBackoff);
  return { waitSeconds, source: "exponential" };
}

/**
 * Decide the next action for a single 429 observation against a deadline.
 * Mirrors mission maxAttempts: after the final allowed failed attempt, do not
 * schedule another wait (`attempt >= maxAttempts` → STOP).
 */
export function evaluateRateLimitWithDeadline(
  signal: ProviderRateLimitSignal,
  config: RateLimitBackoffConfig & { attempt: number },
): RateLimitBackoffStep {
  if (signal.httpStatus !== 429) {
    throw new Error(`Expected HTTP 429, got ${signal.httpStatus}`);
  }

  const { maxAttempts } = resolveBackoffParams(config);
  const attempt = Math.max(1, Math.floor(config.attempt));

  // Refuse scheduling attempt+1 once this attempt has consumed the bound.
  if (attempt >= maxAttempts) {
    return {
      action: "STOP_MAX_ATTEMPTS",
      attempt,
      reason: "MAX_ATTEMPTS",
    };
  }

  const observedMs = requireFiniteIso(signal.observedAtIso, "observedAtIso");
  const deadlineMs = requireFiniteIso(config.deadlineAtIso, "deadlineAtIso");
  const remainingSecondsBeforeDeadline = Math.max(
    0,
    (deadlineMs - observedMs) / 1000,
  );

  const { waitSeconds, source } = computeBackoffWaitSeconds({
    attempt,
    retryAfterSeconds: signal.retryAfterSeconds,
    ...(config.initialBackoffSeconds !== undefined
      ? { initialBackoffSeconds: config.initialBackoffSeconds }
      : {}),
    ...(config.backoffMultiplier !== undefined
      ? { backoffMultiplier: config.backoffMultiplier }
      : {}),
    ...(config.maxBackoffSeconds !== undefined
      ? { maxBackoffSeconds: config.maxBackoffSeconds }
      : {}),
  });

  const nextAttemptMs = observedMs + waitSeconds * 1000;
  // Precise deadline: compare absolute times; remainingSeconds is diagnostic.
  if (nextAttemptMs >= deadlineMs) {
    return {
      action: "STOP_DEADLINE",
      attempt,
      proposedWaitSeconds: waitSeconds,
      remainingSecondsBeforeDeadline,
      reason: "BACKOFF_EXCEEDS_DEADLINE",
    };
  }

  return {
    action: "WAIT",
    attempt,
    waitSeconds,
    nextAttemptAtIso: new Date(nextAttemptMs).toISOString(),
    source,
    remainingSecondsBeforeDeadline,
  };
}

/**
 * Plan a multi-attempt recovery sequence from successive 429 signals.
 * Callers supply one signal per simulated attempt (no live I/O).
 */
export function planRateLimitRecovery(input: {
  signals: ProviderRateLimitSignal[];
  config: RateLimitBackoffConfig;
}): RateLimitRecoveryOutcome {
  const steps: RateLimitBackoffStep[] = [];

  for (let i = 0; i < input.signals.length; i += 1) {
    const attempt = i + 1;
    const step = evaluateRateLimitWithDeadline(input.signals[i]!, {
      ...input.config,
      attempt,
    });
    steps.push(step);
    if (step.action !== "WAIT") {
      break;
    }
  }

  const last = steps[steps.length - 1];
  const dataStatus: "DELAYED" | "UNAVAILABLE" =
    last?.action === "WAIT" ? "DELAYED" : "UNAVAILABLE";

  return {
    steps,
    spawnedExtraAgents: 0,
    dataStatus,
    preservedDeadline: true,
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

/**
 * Fixture retry loop: inject a fake provider fetch, advance a logical clock on
 * WAIT, record before/after + provider call counts. No live network.
 */
export function simulateRateLimitedProviderRecovery(input: {
  startIso: string;
  config: RateLimitBackoffConfig;
  fetchOnce: (attempt: number, clockIso: string) => FakeProviderFetchResult;
}): SimulatedRateLimitLoopResult {
  const steps: RateLimitBackoffStep[] = [];
  let clockIso = input.startIso;
  let providerCallCount = 0;
  let recovered = false;
  let terminalAction: RateLimitBackoffStep["action"] | "SUCCESS" = "STOP_DEADLINE";
  const beforeState = {
    clockIso: input.startIso,
    providerCallCount: 0 as const,
  };

  const { maxAttempts } = resolveBackoffParams(input.config);

  for (let attempt = 1; attempt <= maxAttempts + 1; attempt += 1) {
    providerCallCount += 1;
    const result = input.fetchOnce(attempt, clockIso);

    if (result.status === 200) {
      recovered = true;
      terminalAction = "SUCCESS";
      break;
    }

    const step = evaluateRateLimitWithDeadline(
      {
        httpStatus: 429,
        retryAfterSeconds: result.retryAfterSeconds,
        observedAtIso: clockIso,
      },
      { ...input.config, attempt },
    );
    steps.push(step);

    if (step.action === "WAIT") {
      clockIso = step.nextAttemptAtIso;
      terminalAction = "WAIT";
      continue;
    }

    terminalAction = step.action;
    break;
  }

  const last = steps[steps.length - 1];
  const dataStatus: "DELAYED" | "UNAVAILABLE" = recovered
    ? "DELAYED"
    : last?.action === "WAIT"
      ? "DELAYED"
      : "UNAVAILABLE";

  return {
    steps,
    spawnedExtraAgents: 0,
    dataStatus,
    preservedDeadline: true,
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
    providerCallCount,
    attemptsObserved: providerCallCount,
    beforeState,
    afterState: {
      clockIso,
      providerCallCount,
      terminalAction,
    },
    recovered,
  };
}
