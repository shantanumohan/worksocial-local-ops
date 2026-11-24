import { describe, expect, it } from "vitest";
import {
  createHistoryOnlyReplayHooks,
  replayEmptyHistoryFailsClosed,
  replayMissionWorkflowHistory,
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
});
