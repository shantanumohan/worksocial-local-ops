import { describe, expect, it } from "vitest";
import {
  MissedScheduleSlotOutcome,
  coalesceMissedPublishSlots,
  createMissedScheduleCoalesceState,
  deriveMissedPublishSlots,
  markMissedPublishSlots,
  recordScheduledPublish,
} from "./missed-schedule-coalesce.js";

const HOUR_MS = 3_600_000;

describe("missed-schedule-coalesce (T-US-026)", () => {
  it("derives missed slots from cadence and refuses burst republish", () => {
    const t0 = "2026-11-22T12:00:00.000Z";
    const recovered = new Date(Date.parse(t0) + 3.5 * HOUR_MS).toISOString();

    let state = createMissedScheduleCoalesceState({
      scheduleId: "sched-social-daily",
      channelId: "owned-social",
      intervalMs: HOUR_MS,
    });

    state = recordScheduledPublish(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
    });
    expect(state.publishApplyCount).toBe(1);
    expect(state.lastPublishedAtIso).toBe(t0);

    const missed = deriveMissedPublishSlots({
      lastPublishedAtIso: t0,
      recoveredAtIso: recovered,
      intervalMs: HOUR_MS,
    });
    expect(missed).toHaveLength(3);

    state = markMissedPublishSlots(state, missed);
    const misses = state.slots.filter(
      (s) => s.outcome === MissedScheduleSlotOutcome.MISSED,
    );
    expect(misses).toHaveLength(3);
    expect(state.publishApplyCount).toBe(1);
    expect(state.lastPublishedAtIso).toBe(t0);

    const burst = coalesceMissedPublishSlots(state, {
      recoveredAtIso: recovered,
      catchupDecision: { executedAtIso: recovered, verdict: "PUBLISHED" },
      attemptedBurstRepublish: true,
    });
    expect(burst.ok).toBe(false);
    if (!burst.ok) expect(burst.code).toBe("BURST_REPUBLISH_FORBIDDEN");

    const noDecision = coalesceMissedPublishSlots(state, {
      recoveredAtIso: recovered,
      catchupDecision: null,
    });
    expect(noDecision.ok).toBe(false);
    if (!noDecision.ok) expect(noDecision.code).toBe("CATCHUP_DECISION_REQUIRED");

    const live = coalesceMissedPublishSlots(state, {
      recoveredAtIso: recovered,
      catchupDecision: { executedAtIso: recovered, verdict: "PUBLISHED" },
      requestLiveProviderWiring: true,
    });
    expect(live.ok).toBe(false);
    if (!live.ok) expect(live.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");

    const coalesce = coalesceMissedPublishSlots(state, {
      recoveredAtIso: recovered,
      catchupDecision: { executedAtIso: recovered, verdict: "PUBLISHED" },
    });
    expect(coalesce.ok).toBe(true);
    if (!coalesce.ok) throw new Error("expected coalesce ok");
    expect(coalesce.publishAppliesThisRecovery).toBe(1);
    expect(coalesce.coalescedMissedSlotIds).toHaveLength(3);
    expect(coalesce.state.publishApplyCount).toBe(2);
    expect(coalesce.state.lastPublishedAtIso).toBe(recovered);
    expect(coalesce.externalEffects).toBe("NONE");
    expect(coalesce.liveProviderWiring).toBe("NOT_WIRED");
    expect(
      coalesce.state.slots.filter(
        (s) => s.outcome === MissedScheduleSlotOutcome.COALESCED_CATCHUP,
      ),
    ).toHaveLength(1);
  });

  it("does not invent misses when recovered before next cadence", () => {
    const missed = deriveMissedPublishSlots({
      lastPublishedAtIso: "2026-11-22T12:00:00.000Z",
      recoveredAtIso: "2026-11-22T12:30:00.000Z",
      intervalMs: HOUR_MS,
    });
    expect(missed).toEqual([]);
  });
});
