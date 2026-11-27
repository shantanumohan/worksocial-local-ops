import { describe, expect, it } from "vitest";
import {
  HOST_SLEEP_LIVE_WIRING,
  MonitoringSlotOutcome,
  coalesceWakeCatchup,
  createHostSleepMonitoringState,
  deriveMissedScheduledSlots,
  evaluateHostSleepMonitoringHonesty,
  isOpenCoverageGap,
  listOpenCoverageGaps,
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
    expect(state.liveMonitoringWiring).toBe(HOST_SLEEP_LIVE_WIRING);
    expect(state.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(state.externalEffects).toBe("NONE");

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
    expect(listOpenCoverageGaps(state)).toHaveLength(3);
    expect(gaps.every(isOpenCoverageGap)).toBe(true);

    const honesty = evaluateHostSleepMonitoringHonesty(state);
    expect(honesty.honest).toBe(true);
    expect(honesty.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(honesty.openGapCount).toBe(3);
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
    if (!burst.ok) {
      expect(burst.code).toBe("BURST_FORBIDDEN");
      expect(burst.liveMonitoringWiring).toBe("NOT_WIRED");
      expect(burst.externalEffects).toBe("NONE");
      expect(burst.reason).toMatch(/burst/i);
      expect(burst.reason.length).toBeGreaterThan(0);
    }
    expect(state.probeApplyCount).toBe(1);

    const missingProbe = coalesceWakeCatchup(state, {
      wakeAtIso: wakeAt,
      catchupProbe: null,
    });
    expect(missingProbe.ok).toBe(false);
    if (!missingProbe.ok) {
      expect(missingProbe.code).toBe("CATCHUP_PROBE_REQUIRED");
      expect(missingProbe.liveMonitoringWiring).toBe("NOT_WIRED");
      expect(missingProbe.externalEffects).toBe("NONE");
      expect(missingProbe.reason).toMatch(/fixture probe/i);
      expect(missingProbe.reason.length).toBeGreaterThan(0);
    }

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
    expect(wake.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(wake.externalEffects).toBe("NONE");
    expect(wake.state.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(listOpenCoverageGaps(wake.state)).toHaveLength(0);
    const postCatchupHonesty = evaluateHostSleepMonitoringHonesty(wake.state);
    expect(postCatchupHonesty.openGapCount).toBe(0);
    expect(listOpenCoverageGaps(wake.state).length).toBe(0);
    expect(listOpenCoverageGaps(wake.state)).toHaveLength(postCatchupHonesty.openGapCount);
    expect(postCatchupHonesty.honest).toBe(true);
    expect(postCatchupHonesty.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(postCatchupHonesty.externalEffects).toBe("NONE");
    expect(wake.state.externalEffects).toBe("NONE");
    expect(wake.externalEffects).toBe("NONE");

    const second = coalesceWakeCatchup(wake.state, {
      wakeAtIso: wakeAt,
      catchupProbe: { executedAtIso: wakeAt, verdict: "SUCCESS" },
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.code).toBe("NO_OPEN_GAPS");
      expect(second.liveMonitoringWiring).toBe("NOT_WIRED");
      expect(second.reason).toMatch(/open coverage gap/i);
      expect(second.reason.length).toBeGreaterThan(0);
    }
    expect(second.externalEffects).toBe("NONE");
    expect(second.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(wake.state.probeApplyCount).toBe(2);
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
    expect(state.externalEffects).toBe("NONE");
    expect(state.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(evaluateHostSleepMonitoringHonesty(state).honest).toBe(true);
  });

  it("FAILURE catch-up counts apply but does not advance lastVerified", () => {
    let state = createHostSleepMonitoringState({
      probeId: "http-uptime",
      intervalMs: HOUR,
    });
    const t0 = "2026-11-22T10:00:00.000Z";
    state = recordScheduledProbeSuccess(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
    });
    const wakeAt = "2026-11-22T12:30:00.000Z";
    state = markHostSleepCoverageGaps(
      state,
      deriveMissedScheduledSlots({
        lastSuccessAtIso: t0,
        wakeAtIso: wakeAt,
        intervalMs: HOUR,
      }),
    );
    expect(listOpenCoverageGaps(state)).toHaveLength(2);

    const wake = coalesceWakeCatchup(state, {
      wakeAtIso: wakeAt,
      catchupProbe: { executedAtIso: wakeAt, verdict: "FAILURE" },
    });
    expect(wake.ok).toBe(true);
    if (!wake.ok) throw new Error("expected coalesce ok");
    expect(wake.state.probeApplyCount).toBe(2);
    expect(wake.state.lastVerifiedSuccessAtIso).toBe(t0);
    expect(wake.state.externalEffects).toBe("NONE");
    expect(wake.state.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(wake.externalEffects).toBe("NONE");
    expect(wake.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(evaluateHostSleepMonitoringHonesty(wake.state).honest).toBe(true);
    expect(evaluateHostSleepMonitoringHonesty(wake.state).externalEffects).toBe(
      "NONE",
    );
  });

  it("ENOSPC / disk-full refuses catch-up without inventing SUCCESS", () => {
    let state = createHostSleepMonitoringState({
      probeId: "http-uptime",
      intervalMs: HOUR,
    });
    const t0 = "2026-11-22T10:00:00.000Z";
    state = recordScheduledProbeSuccess(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
    });
    const wakeAt = "2026-11-22T12:30:00.000Z";
    state = markHostSleepCoverageGaps(
      state,
      deriveMissedScheduledSlots({
        lastSuccessAtIso: t0,
        wakeAtIso: wakeAt,
        intervalMs: HOUR,
      }),
    );
    const openBefore = listOpenCoverageGaps(state);
    expect(openBefore).toHaveLength(2);

    const denied = coalesceWakeCatchup(state, {
      wakeAtIso: wakeAt,
      catchupProbe: { executedAtIso: wakeAt, verdict: "SUCCESS" },
      fixtureDiskFull: true,
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) throw new Error("expected DISK_FULL");
    expect(denied.code).toBe("DISK_FULL");
    expect(denied.reason).toMatch(/ENOSPC/);
    expect(denied.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(denied.externalEffects).toBe("NONE");
    expect(denied.reason.length).toBeGreaterThan(4);
    // State unchanged — open gaps stay open; no invented SUCCESS / lastVerified advance.
    expect(listOpenCoverageGaps(state)).toHaveLength(2);
    expect(listOpenCoverageGaps(state).every(isOpenCoverageGap)).toBe(true);
    expect(state.lastVerifiedSuccessAtIso).toBe(t0);
    expect(state.probeApplyCount).toBe(1);
    expect(state.externalEffects).toBe("NONE");
    expect(state.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(evaluateHostSleepMonitoringHonesty(state).honest).toBe(true);
    expect(evaluateHostSleepMonitoringHonesty(state).liveMonitoringWiring).toBe("NOT_WIRED");
    expect(evaluateHostSleepMonitoringHonesty(state).externalEffects).toBe("NONE");
    expect(evaluateHostSleepMonitoringHonesty(state).openGapCount).toBe(2);
    expect(denied.externalEffects).toBe("NONE");
  });

  it("derives no misses when wake is not past the next cadence slot", () => {
    expect(
      deriveMissedScheduledSlots({
        lastSuccessAtIso: "2026-11-22T10:00:00.000Z",
        wakeAtIso: "2026-11-22T10:00:00.000Z",
        intervalMs: HOUR,
      }),
    ).toEqual([]);
    expect(
      deriveMissedScheduledSlots({
        lastSuccessAtIso: "2026-11-22T10:00:00.000Z",
        wakeAtIso: "2026-11-22T10:59:59.000Z",
        intervalMs: HOUR,
      }),
    ).toEqual([]);
  });

  it("refuses off-cadence invented coverage gaps", () => {
    let state = createHostSleepMonitoringState({
      probeId: "http-uptime",
      intervalMs: HOUR,
    });
    state = recordScheduledProbeSuccess(state, {
      scheduledAtIso: "2026-11-22T10:00:00.000Z",
      executedAtIso: "2026-11-22T10:00:00.000Z",
    });
    expect(() =>
      markHostSleepCoverageGaps(state, ["2026-11-22T10:30:00.000Z"]),
    ).toThrow(/off-cadence/);
  });

  it("honesty reports openGapCount matches listOpenCoverageGaps length", () => {
    const HOUR = 3_600_000;
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
    state = markHostSleepCoverageGaps(state, missed);
    expect(state.externalEffects).toBe("NONE");
    expect(state.liveMonitoringWiring).toBe("NOT_WIRED");
    const honesty = evaluateHostSleepMonitoringHonesty(state);
    expect(honesty.openGapCount).toBe(listOpenCoverageGaps(state).length);
    expect(honesty.openGapCount).toBeGreaterThan(0);
    expect(listOpenCoverageGaps(state).length).toBe(honesty.openGapCount);
    expect(listOpenCoverageGaps(state).every(isOpenCoverageGap)).toBe(true);
    expect(honesty.liveMonitoringWiring).toBe("NOT_WIRED");
    expect(honesty.externalEffects).toBe("NONE");
    expect(honesty.honest).toBe(true);
    expect(honesty.reasons).toHaveLength(0);
  });
});
