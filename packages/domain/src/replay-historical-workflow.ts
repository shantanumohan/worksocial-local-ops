/**
 * T-X013 — Replay historical workflow without repeated external I/O.
 *
 * Pure control-flow helpers for Temporal-style history replay offline.
 * Recording acceptPending/applyOnce lives in the soak harness; this module
 * only schedules recorded activity results and refuses live I/O during replay.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type ReplayActivityName = "enqueue" | "claimAndAccept" | "verify";

export type ReplayActivityResult =
  | { activity: "enqueue"; workflowId: string; phase: "queued" }
  | {
      activity: "claimAndAccept";
      phase: "effect_pending";
      outcome: "ACCEPTED_PENDING";
      applyAttemptCount: number;
      providerCreated: boolean;
      operationId: string;
    }
  | {
      activity: "verify";
      phase: "succeeded";
      outcome: "VERIFIED";
      applyAttemptCount: number;
      matched: boolean;
      operationId: string;
    };

export type ReplayWorkflowHistory = {
  events: ReplayActivityResult[];
  terminal: {
    outcome: "VERIFIED";
    applyAttemptCount: number;
    operationId: string;
  };
};

export type ReplayMissionOutcome = {
  outcome: "VERIFIED" | "FAILED";
  applyAttemptCount: number;
  operationId: string;
};

export type ReplayHooks = {
  onScheduleActivity: (
    name: ReplayActivityName,
    recorded: ReplayActivityResult,
  ) => ReplayActivityResult;
  onForbiddenLiveIo: (label: string) => void;
};

export type ReplayNoRepeatIoSummary = {
  scheduledFromHistory: number;
  forbiddenLiveIo: number;
  liveIoLabels: string[];
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  catalogClaim: "ACCEPTED≠VERIFIED";
};

const REPLAY_HONESTY = {
  liveProviderWiring: "NOT_WIRED" as const,
  externalEffects: "NONE" as const,
  catalogClaim: "ACCEPTED≠VERIFIED" as const,
};

/**
 * Mission control flow: enqueue → claimAndAccept → verify.
 * Used for both first recording and history replay.
 */
export function runMissionWorkflowControlFlow(hooks: {
  enqueue: () => ReplayActivityResult;
  claimAndAccept: () => ReplayActivityResult;
  verify: () => ReplayActivityResult;
}): ReplayMissionOutcome {
  const enq = hooks.enqueue();
  if (enq.activity !== "enqueue" || enq.phase !== "queued") {
    return { outcome: "FAILED", applyAttemptCount: 0, operationId: "unknown" };
  }
  const accepted = hooks.claimAndAccept();
  if (accepted.activity !== "claimAndAccept") {
    return { outcome: "FAILED", applyAttemptCount: 0, operationId: "unknown" };
  }
  const verified = hooks.verify();
  if (verified.activity !== "verify") {
    return {
      outcome: "FAILED",
      applyAttemptCount: accepted.applyAttemptCount,
      operationId: accepted.operationId,
    };
  }
  if (verified.outcome !== "VERIFIED" || !verified.matched) {
    return {
      outcome: "FAILED",
      applyAttemptCount: accepted.applyAttemptCount,
      operationId: accepted.operationId,
    };
  }
  return {
    outcome: "VERIFIED",
    applyAttemptCount: verified.applyAttemptCount,
    operationId: verified.operationId,
  };
}

/**
 * Replay mission control flow from recorded history only.
 * Never invents activity results — mismatches invoke onForbiddenLiveIo.
 */
export function replayMissionWorkflowHistory(
  history: ReplayWorkflowHistory,
  hooks: ReplayHooks,
): ReplayMissionOutcome {
  let cursor = 0;
  const take = (expected: ReplayActivityName): ReplayActivityResult => {
    const recorded = history.events[cursor];
    cursor += 1;
    if (!recorded || recorded.activity !== expected) {
      hooks.onForbiddenLiveIo(
        `history_mismatch expected=${expected} got=${recorded?.activity ?? "eof"}`,
      );
      return {
        activity: "verify",
        phase: "succeeded",
        outcome: "VERIFIED",
        applyAttemptCount: -1,
        matched: false,
        operationId: "mismatch",
      };
    }
    return hooks.onScheduleActivity(expected, recorded);
  };

  const result = runMissionWorkflowControlFlow({
    enqueue: () => take("enqueue"),
    claimAndAccept: () => take("claimAndAccept"),
    verify: () => take("verify"),
  });

  if (cursor !== history.events.length) {
    hooks.onForbiddenLiveIo(
      `history_unread_tail remaining=${history.events.length - cursor}`,
    );
    return { ...result, outcome: "FAILED" };
  }

  // Bind terminal record to the replayed outcome — missing or conflicting
  // terminal must fail closed (truncated / inconsistent history).
  const terminal = history.terminal;
  if (
    !terminal ||
    terminal.outcome !== "VERIFIED" ||
    typeof terminal.applyAttemptCount !== "number" ||
    typeof terminal.operationId !== "string" ||
    terminal.operationId.length === 0
  ) {
    hooks.onForbiddenLiveIo("history_terminal_missing_or_incomplete");
    return { ...result, outcome: "FAILED" };
  }
  if (
    result.outcome === "VERIFIED" &&
    (terminal.applyAttemptCount !== result.applyAttemptCount ||
      terminal.operationId !== result.operationId)
  ) {
    hooks.onForbiddenLiveIo(
      `history_terminal_mismatch op=${terminal.operationId}≠${result.operationId} apply=${terminal.applyAttemptCount}≠${result.applyAttemptCount}`,
    );
    return { ...result, outcome: "FAILED" };
  }
  return result;
}

/**
 * Build hooks that only return recorded history and count schedule/forbidden I/O.
 */
export function createHistoryOnlyReplayHooks(): {
  hooks: ReplayHooks;
  summary: () => ReplayNoRepeatIoSummary;
} {
  let scheduledFromHistory = 0;
  let forbiddenLiveIo = 0;
  const liveIoLabels: string[] = [];

  const hooks: ReplayHooks = {
    onScheduleActivity: (name, recorded) => {
      if (recorded.activity !== name) {
        forbiddenLiveIo += 1;
        liveIoLabels.push(`schedule_mismatch:${name}`);
        throw new Error(`Replay scheduled ${name} with mismatched history`);
      }
      scheduledFromHistory += 1;
      return recorded;
    },
    onForbiddenLiveIo: (label) => {
      forbiddenLiveIo += 1;
      liveIoLabels.push(label);
    },
  };

  return {
    hooks,
    summary: () => ({
      scheduledFromHistory,
      forbiddenLiveIo,
      liveIoLabels: [...liveIoLabels],
      ...REPLAY_HONESTY,
    }),
  };
}

/**
 * Empty or truncated history must fail closed without claiming live success.
 */
export function replayEmptyHistoryFailsClosed(): {
  outcome: ReplayMissionOutcome;
  summary: ReplayNoRepeatIoSummary;
} {
  const { hooks, summary } = createHistoryOnlyReplayHooks();
  const outcome = replayMissionWorkflowHistory(
    {
      events: [],
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: 0,
        operationId: "empty",
      },
    },
    hooks,
  );
  return { outcome, summary: summary() };
}
