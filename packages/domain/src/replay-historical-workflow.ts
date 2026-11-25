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
    // Edge — blank enqueue workflowId must fail closed (no invented identity).
    if (
      recorded.activity === "enqueue" &&
      (!recorded.workflowId || recorded.workflowId.trim().length === 0)
    ) {
      hooks.onForbiddenLiveIo("history_enqueue_workflowId_blank");
      return {
        activity: "verify",
        phase: "succeeded",
        outcome: "VERIFIED",
        applyAttemptCount: -1,
        matched: false,
        operationId: "mismatch",
      };
    }
    // Edge — enqueue phase must be queued (no invented queue progress).
    if (recorded.activity === "enqueue" && recorded.phase !== "queued") {
      hooks.onForbiddenLiveIo("history_enqueue_phase_invalid");
      return {
        activity: "verify",
        phase: "succeeded",
        outcome: "VERIFIED",
        applyAttemptCount: -1,
        matched: false,
        operationId: "mismatch",
      };
    }
    // Edge — blank claim/verify operationId must fail closed (no invented bind).
    if (
      (recorded.activity === "claimAndAccept" ||
        recorded.activity === "verify") &&
      (!recorded.operationId || recorded.operationId.trim().length === 0)
    ) {
      hooks.onForbiddenLiveIo("history_activity_operationId_blank");
      return {
        activity: "verify",
        phase: "succeeded",
        outcome: "VERIFIED",
        applyAttemptCount: -1,
        matched: false,
        operationId: "mismatch",
      };
    }
    // Edge — claim shape must be ACCEPTED_PENDING / effect_pending with
    // finite non-negative integer applyAttemptCount and providerCreated
    // (no invented pending without a recorded provider create).
    if (recorded.activity === "claimAndAccept") {
      const apply = recorded.applyAttemptCount;
      if (
        recorded.phase !== "effect_pending" ||
        recorded.outcome !== "ACCEPTED_PENDING" ||
        recorded.providerCreated !== true ||
        typeof apply !== "number" ||
        !Number.isFinite(apply) ||
        !Number.isInteger(apply) ||
        apply < 0
      ) {
        hooks.onForbiddenLiveIo("history_claim_shape_invalid");
        return {
          activity: "verify",
          phase: "succeeded",
          outcome: "VERIFIED",
          applyAttemptCount: -1,
          matched: false,
          operationId: "mismatch",
        };
      }
    }
    // Edge — verify shape must be VERIFIED / succeeded with finite integer apply.
    if (recorded.activity === "verify") {
      const apply = recorded.applyAttemptCount;
      if (
        recorded.phase !== "succeeded" ||
        recorded.outcome !== "VERIFIED" ||
        typeof apply !== "number" ||
        !Number.isFinite(apply) ||
        !Number.isInteger(apply) ||
        apply < 0
      ) {
        hooks.onForbiddenLiveIo("history_verify_shape_invalid");
        return {
          activity: "verify",
          phase: "succeeded",
          outcome: "VERIFIED",
          applyAttemptCount: -1,
          matched: false,
          operationId: "mismatch",
        };
      }
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
  const terminalOpId =
    typeof terminal?.operationId === "string" ? terminal.operationId.trim() : "";
  const terminalApply = terminal?.applyAttemptCount;
  if (
    !terminal ||
    terminal.outcome !== "VERIFIED" ||
    typeof terminalApply !== "number" ||
    !Number.isFinite(terminalApply) ||
    !Number.isInteger(terminalApply) ||
    terminalApply < 1 ||
    terminalOpId.length === 0
  ) {
    hooks.onForbiddenLiveIo("history_terminal_missing_or_incomplete");
    return { ...result, outcome: "FAILED" };
  }
  const resultOpId =
    typeof result.operationId === "string" ? result.operationId.trim() : "";
  if (
    result.outcome === "VERIFIED" &&
    (terminalApply !== result.applyAttemptCount ||
      terminalOpId !== resultOpId)
  ) {
    hooks.onForbiddenLiveIo(
      `history_terminal_mismatch op=${terminalOpId}≠${resultOpId} apply=${terminalApply}≠${result.applyAttemptCount}`,
    );
    return { ...result, outcome: "FAILED" };
  }

  // Codex harden — cross-bind claim/verify activity opIds + applyAttemptCount
  // to terminal when the full three-event chain was scheduled. Trim activity
  // opIds so whitespace-padded tokens match terminal the same way.
  if (result.outcome === "VERIFIED" && history.events.length === 3) {
    const claim = history.events[1];
    const verify = history.events[2];
    const claimOpId =
      claim && claim.activity === "claimAndAccept"
        ? claim.operationId.trim()
        : "";
    const verifyOpId =
      verify && verify.activity === "verify" ? verify.operationId.trim() : "";
    if (
      !claim ||
      claim.activity !== "claimAndAccept" ||
      !verify ||
      verify.activity !== "verify" ||
      claimOpId.length === 0 ||
      verifyOpId.length === 0 ||
      claimOpId !== terminalOpId ||
      verifyOpId !== terminalOpId ||
      claim.applyAttemptCount !== terminalApply ||
      verify.applyAttemptCount !== terminalApply
    ) {
      hooks.onForbiddenLiveIo("history_activity_terminal_op_mismatch");
      return { ...result, outcome: "FAILED" };
    }
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

/**
 * Partial activity truncation (enqueue only) must fail closed — terminal alone
 * must not invent a VERIFIED mission success (T-X013 Codex harden).
 */
export function replayPartialHistoryFailsClosed(): {
  outcome: ReplayMissionOutcome;
  summary: ReplayNoRepeatIoSummary;
} {
  const { hooks, summary } = createHistoryOnlyReplayHooks();
  const outcome = replayMissionWorkflowHistory(
    {
      events: [
        {
          activity: "enqueue",
          workflowId: "wf-partial",
          phase: "queued",
        },
      ],
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: 1,
        operationId: "op-partial",
      },
    },
    hooks,
  );
  return { outcome, summary: summary() };
}

/**
 * Two-event truncation (enqueue + claim, missing verify) must fail closed —
 * terminal cannot invent the missing verify step (T-X013 edge deepen).
 */
export function replayTwoEventHistoryFailsClosed(): {
  outcome: ReplayMissionOutcome;
  summary: ReplayNoRepeatIoSummary;
} {
  const { hooks, summary } = createHistoryOnlyReplayHooks();
  const outcome = replayMissionWorkflowHistory(
    {
      events: [
        {
          activity: "enqueue",
          workflowId: "wf-two",
          phase: "queued",
        },
        {
          activity: "claimAndAccept",
          phase: "effect_pending",
          outcome: "ACCEPTED_PENDING",
          applyAttemptCount: 1,
          providerCreated: true,
          operationId: "op-two",
        },
      ],
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: 1,
        operationId: "op-two",
      },
    },
    hooks,
  );
  return { outcome, summary: summary() };
}
