import { describe, expect, it } from "vitest";
import {
  MonitoringSlotOutcome,
  coalesceWakeCatchup,
  createHostSleepMonitoringState,
  deriveMissedScheduledSlots,
  markHostSleepCoverageGaps,
  recordScheduledProbeSuccess,
} from "./host-sleep-monitoring.js";

const HOUR = 60 * 60 * 1000;

describe("host-sleep monitoring (T-X001)", () => {
  it("derives missed slots from cadence and marks honest coverage gaps", () => {
    let state = createHostSleepMonitoringState({
      probeId: "http-uptime",
      intervalMs: HOUR,
    });
    const t0 = "2026-11-22T10:00:00.000Z";
    state = recordScheduledProbeSuccess(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
    });
    const wakeAt = "2026-11-22T13:30:00.000Z";
    const missed = deriveMissedScheduledSlots({
      lastSuccessAtIso: t0,
      wakeAtIso: wakeAt,
      intervalMs: HOUR,
    });
    expect(missed).toEqual([
      "2026-11-22T11:00:00.000Z",
      "2026-11-22T12:00:00.000Z",
      "2026-11-22T13:00:00.000Z",
    ]);
    state = markHostSleepCoverageGaps(state, missed);
    expect(state.lastVerifiedSuccessAtIso).toBe(t0);
    expect(state.probeApplyCount).toBe(1);
    const gaps = state.slots.filter(
      (s) => s.outcome === MonitoringSlotOutcome.COVERAGE_GAP,
    );
    expect(gaps).toHaveLength(3);
    expect(gaps.every((g) => g.executedAtIso === null)).toBe(true);
  });

  it("requires an actual catch-up probe and refuses burst", () => {
    let state = createHostSleepMonitoringState({
      probeId: "http-uptime",
      intervalMs: HOUR,
    });
    const t0 = "2026-11-22T10:00:00.000Z";
    state = recordScheduledProbeSuccess(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
    });
    const wakeAt = "2026-11-22T13:30:00.000Z";
    state = markHostSleepCoverageGaps(
      state,
      deriveMissedScheduledSlots({
        lastSuccessAtIso: t0,
        wakeAtIso: wakeAt,
        intervalMs: HOUR,
      }),
    );

    const burst = coalesceWakeCatchup(state, {
      wakeAtIso: wakeAt,
      catchupProbe: {
        executedAtIso: wakeAt,
        verdict: "SUCCESS",
      },
      attemptedBurstPerMissedSlot: true,
    });
    expect(burst.ok).toBe(false);
    if (!burst.ok) expect(burst.code).toBe("BURST_FORBIDDEN");

    const missingProbe = coalesceWakeCatchup(state, {
      wakeAtIso: wakeAt,
      catchupProbe: null,
    });
    expect(missingProbe.ok).toBe(false);
    if (!missingProbe.ok) expect(missingProbe.code).toBe("CATCHUP_PROBE_REQUIRED");

    const wake = coalesceWakeCatchup(state, {
      wakeAtIso: wakeAt,
      catchupProbe: { executedAtIso: wakeAt, verdict: "SUCCESS" },
    });
    expect(wake.ok).toBe(true);
    if (!wake.ok) throw new Error("expected coalesce ok");
    expect(wake.probeAppliesThisWake).toBe(1);
    expect(wake.coalescedGapSlotIds).toHaveLength(3);
    expect(wake.state.probeApplyCount).toBe(2);
    expect(wake.state.lastVerifiedSuccessAtIso).toBe(wakeAt);
  });

  it("keeps lastVerifiedSuccessAtIso monotonic on out-of-order success", () => {
    let state = createHostSleepMonitoringState({
      probeId: "http-uptime",
      intervalMs: HOUR,
    });
    state = recordScheduledProbeSuccess(state, {
      scheduledAtIso: "2026-11-22T13:00:00.000Z",
      executedAtIso: "2026-11-22T13:00:00.000Z",
    });
    state = recordScheduledProbeSuccess(state, {
      scheduledAtIso: "2026-11-22T12:00:00.000Z",
      executedAtIso: "2026-11-22T12:00:00.000Z",
    });
    expect(state.lastVerifiedSuccessAtIso).toBe("2026-11-22T13:00:00.000Z");
  });
});
