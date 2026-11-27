import { describe, expect, it } from "vitest";
import {
  createHistoryOnlyReplayHooks,
  replayEmptyHistoryFailsClosed,
  replayMissionWorkflowHistory,
  replayPartialHistoryFailsClosed,
  replayTwoEventHistoryFailsClosed,
  type ReplayWorkflowHistory,
} from "./replay-historical-workflow.js";

function sampleHistory(): ReplayWorkflowHistory {
  return {
    events: [
      {
        activity: "enqueue",
        workflowId: "wf-1",
        phase: "queued",
      },
      {
        activity: "claimAndAccept",
        phase: "effect_pending",
        outcome: "ACCEPTED_PENDING",
        applyAttemptCount: 1,
        providerCreated: true,
        operationId: "op-1",
      },
      {
        activity: "verify",
        phase: "succeeded",
        outcome: "VERIFIED",
        applyAttemptCount: 1,
        matched: true,
        operationId: "op-1",
      },
    ],
    terminal: {
      outcome: "VERIFIED",
      applyAttemptCount: 1,
      operationId: "op-1",
    },
  };
}

describe("replay historical workflow (T-X013)", () => {
  it("replays recorded history without live I/O and stamps honesty", () => {
    const history = sampleHistory();
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const first = replayMissionWorkflowHistory(history, hooks);
    expect(first).toEqual({
      outcome: "VERIFIED",
      applyAttemptCount: 1,
      operationId: "op-1",
    });
    const s1 = summary();
    expect(s1.scheduledFromHistory).toBe(3);
    expect(s1.forbiddenLiveIo).toBe(0);
    expect(s1.liveProviderWiring).toBe("NOT_WIRED");
    expect(s1.externalEffects).toBe("NONE");
    expect(s1.catalogClaim).toBe("ACCEPTED≠VERIFIED");

    // Second replay against the same history still schedules only from history.
    const again = createHistoryOnlyReplayHooks();
    const second = replayMissionWorkflowHistory(history, again.hooks);
    expect(second.outcome).toBe("VERIFIED");
    expect(again.summary().scheduledFromHistory).toBe(3);
    expect(again.summary().forbiddenLiveIo).toBe(0);
  });

  it("fails closed on empty history without inventing live I/O success", () => {
    const { outcome, summary } = replayEmptyHistoryFailsClosed();
    expect(outcome.outcome).toBe("FAILED");
    expect(summary.forbiddenLiveIo).toBeGreaterThan(0);
    expect(summary.liveIoLabels.some((l) => l.includes("history_mismatch"))).toBe(
      true,
    );
    expect(summary.externalEffects).toBe("NONE");
    expect(summary.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("fails closed when history activity order mismatches", () => {
    const bad: ReplayWorkflowHistory = {
      events: [
        {
          activity: "verify",
          phase: "succeeded",
          outcome: "VERIFIED",
          applyAttemptCount: 1,
          matched: true,
          operationId: "op-bad",
        },
      ],
      terminal: {
        outcome: "VERIFIED",
        applyAttemptCount: 1,
        operationId: "op-bad",
      },
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(bad, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(summary().forbiddenLiveIo).toBeGreaterThan(0);
  });

  it("fails closed when terminal is missing after complete events", () => {
    const history = sampleHistory();
    const truncated = {
      events: history.events,
      terminal: undefined,
    } as unknown as ReplayWorkflowHistory;
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(truncated, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_terminal_missing_or_incomplete"),
      ),
    ).toBe(true);
  });

  it("fails closed when terminal conflicts with replayed outcome", () => {
    const history = sampleHistory();
    history.terminal = {
      outcome: "VERIFIED",
      applyAttemptCount: 99,
      operationId: "op-other",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) => l.includes("history_terminal_mismatch")),
    ).toBe(true);
  });

  it("fails closed on whitespace-only terminal operationId (Codex harden)", () => {
    const history = sampleHistory();
    history.terminal = {
      outcome: "VERIFIED",
      applyAttemptCount: 1,
      operationId: "   ",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_terminal_missing_or_incomplete"),
      ),
    ).toBe(true);
  });

  it("fails closed when claim opId disagrees with terminal (Codex harden)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.operationId = "op-drift";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_activity_terminal_op_mismatch"),
      ),
    ).toBe(true);
  });

  it("fails closed on partial activity truncation without inventing success", () => {
    const { outcome, summary } = replayPartialHistoryFailsClosed();
    expect(outcome.outcome).toBe("FAILED");
    expect(summary.forbiddenLiveIo).toBeGreaterThan(0);
    expect(summary.liveIoLabels.some((l) => l.includes("history_mismatch"))).toBe(
      true,
    );
    expect(summary.externalEffects).toBe("NONE");
  });

  it("fails closed on unread history tail events", () => {
    const history = sampleHistory();
    history.events.push({
      activity: "enqueue",
      workflowId: "wf-extra",
      phase: "queued",
    });
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) => l.includes("history_unread_tail")),
    ).toBe(true);
  });

  it("fails closed when claim applyAttemptCount drifts from terminal (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.applyAttemptCount = 7;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_activity_terminal_op_mismatch"),
      ),
    ).toBe(true);
  });

  it("fails closed on negative terminal applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    history.terminal = {
      outcome: "VERIFIED",
      applyAttemptCount: -1,
      operationId: "op-1",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_terminal_missing_or_incomplete"),
      ),
    ).toBe(true);
  });

  it("fails closed on two-event truncation without inventing verify", () => {
    const { outcome, summary } = replayTwoEventHistoryFailsClosed();
    expect(outcome.outcome).toBe("FAILED");
    expect(summary.forbiddenLiveIo).toBeGreaterThan(0);
    expect(summary.liveIoLabels.some((l) => l.includes("history_mismatch"))).toBe(
      true,
    );
    expect(summary.externalEffects).toBe("NONE");
  });

  it("fails closed on blank enqueue workflowId (edge)", () => {
    const history = sampleHistory();
    const enq = history.events[0];
    if (enq && enq.activity === "enqueue") {
      enq.workflowId = "   ";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_enqueue_workflowId_blank"),
      ),
    ).toBe(true);
  });

  it("accepts whitespace-padded terminal operationId that trims to match (edge)", () => {
    const history = sampleHistory();
    history.terminal = {
      outcome: "VERIFIED",
      applyAttemptCount: 1,
      operationId: "  op-1  ",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("VERIFIED");
    expect(summary().forbiddenLiveIo).toBe(0);
  });

  it("fails closed on non-finite terminal applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    history.terminal = {
      outcome: "VERIFIED",
      applyAttemptCount: Number.POSITIVE_INFINITY,
      operationId: "op-1",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_terminal_missing_or_incomplete"),
      ),
    ).toBe(true);
  });

  it("fails closed when verify matched=false (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      verify.matched = false;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(summary().scheduledFromHistory).toBe(3);
  });

  it("fails closed on blank claim operationId (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.operationId = "   ";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_activity_operationId_blank"),
      ),
    ).toBe(true);
  });

  it("fails closed on blank verify operationId (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      verify.operationId = "";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_activity_operationId_blank"),
      ),
    ).toBe(true);
  });

  it("accepts whitespace-padded claim/verify opIds that trim to terminal (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    const verify = history.events[2];
    if (claim && claim.activity === "claimAndAccept") {
      claim.operationId = "  op-1  ";
    }
    if (verify && verify.activity === "verify") {
      verify.operationId = " op-1 ";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("VERIFIED");
    expect(summary().forbiddenLiveIo).toBe(0);
  });

  it("fails closed on non-integer terminal applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    history.terminal = {
      outcome: "VERIFIED",
      applyAttemptCount: 1.5,
      operationId: "op-1",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_terminal_missing_or_incomplete"),
      ),
    ).toBe(true);
  });

  it("fails closed on invalid claim outcome/phase shape (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.outcome = "ACCEPTED_PENDING";
      claim.phase = "queued" as "effect_pending";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on non-integer claim applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.applyAttemptCount = 1.25;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on invalid verify outcome shape (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      (verify as { outcome: string }).outcome = "FAILED";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_verify_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("accepts whitespace-padded enqueue workflowId that trims (edge)", () => {
    const history = sampleHistory();
    const enq = history.events[0];
    if (enq && enq.activity === "enqueue") {
      enq.workflowId = "  wf-1  ";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("VERIFIED");
    expect(summary().forbiddenLiveIo).toBe(0);
  });

  it("fails closed on invalid enqueue phase (edge)", () => {
    const history = sampleHistory();
    const enq = history.events[0];
    if (enq && enq.activity === "enqueue") {
      (enq as { phase: string }).phase = "succeeded";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_enqueue_phase_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed when claim providerCreated is false (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.providerCreated = false;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on zero terminal applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    const verify = history.events[2];
    if (claim && claim.activity === "claimAndAccept") {
      claim.applyAttemptCount = 0;
    }
    if (verify && verify.activity === "verify") {
      verify.applyAttemptCount = 0;
    }
    history.terminal = {
      outcome: "VERIFIED",
      applyAttemptCount: 0,
      operationId: "op-1",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    // Claim apply < 1 fails closed at activity shape before terminal.
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on zero claim applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.applyAttemptCount = 0;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on zero verify applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      verify.applyAttemptCount = 0;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_verify_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on Infinity claim applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.applyAttemptCount = Number.POSITIVE_INFINITY;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on -Infinity claim applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      claim.applyAttemptCount = Number.NEGATIVE_INFINITY;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on -Infinity verify applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      verify.applyAttemptCount = Number.NEGATIVE_INFINITY;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_verify_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on +Infinity verify applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      verify.applyAttemptCount = Number.POSITIVE_INFINITY;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_verify_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on wrong claim outcome (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      (claim as { outcome: string }).outcome = "VERIFIED";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on non-number claim applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const claim = history.events[1];
    if (claim && claim.activity === "claimAndAccept") {
      (claim as { applyAttemptCount: unknown }).applyAttemptCount = "1";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_claim_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on NaN verify applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      verify.applyAttemptCount = Number.NaN;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_verify_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on fractional verify applyAttemptCount (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      verify.applyAttemptCount = 1.5;
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_verify_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed on invalid verify phase (edge)", () => {
    const history = sampleHistory();
    const verify = history.events[2];
    if (verify && verify.activity === "verify") {
      (verify as { phase: string }).phase = "effect_pending";
    }
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_verify_shape_invalid"),
      ),
    ).toBe(true);
  });

  it("fails closed when terminal outcome is not VERIFIED (edge)", () => {
    const history = sampleHistory();
    history.terminal = {
      outcome: "FAILED" as "VERIFIED",
      applyAttemptCount: 1,
      operationId: "op-1",
    };
    const { hooks, summary } = createHistoryOnlyReplayHooks();
    const result = replayMissionWorkflowHistory(history, hooks);
    expect(result.outcome).toBe("FAILED");
    expect(
      summary().liveIoLabels.some((l) =>
        l.includes("history_terminal_missing_or_incomplete"),
      ),
    ).toBe(true);
  });
});
