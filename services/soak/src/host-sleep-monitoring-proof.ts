/**
 * Fixture proof for T-X001 — host sleeps during scheduled monitoring.
 *
 * Coverage gaps are derived from cadence (not SUCCESS). On wake, missed probes
 * coalesce into one catch-up after an actual fixture probe result (no burst).
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  MonitoringSlotOutcome,
  SoakProofKind,
  coalesceWakeCatchup,
  createHostSleepMonitoringState,
  deriveMissedScheduledSlots,
  markHostSleepCoverageGaps,
  recordScheduledProbeSuccess,
  type SoakProofRecord,
} from "@worksocial/domain";

const MINUTE_MS = 60_000;

/**
 * Complete expected proof set for T-X001 fixture ACCEPTED.
 * Uses short cadence so wake evidence stays inside the soak run window.
 */
export function proofHostSleepMonitoringCoverageGap(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const probeId = `probe-host-sleep-${randomUUID().slice(0, 8)}`;
  const intervalMs = MINUTE_MS;
  const t0 = nowIso;
  // Three missed 1-minute slots → wake at +3.5 minutes (within soak run window).
  const wakeAt = new Date(Date.parse(t0) + 3.5 * MINUTE_MS).toISOString();

  let state = createHostSleepMonitoringState({
    probeId,
    intervalMs,
  });

  state = recordScheduledProbeSuccess(state, {
    scheduledAtIso: t0,
    executedAtIso: t0,
  });
  if (
    state.lastVerifiedSuccessAtIso === t0 &&
    state.probeApplyCount === 1 &&
    state.slots[0]?.outcome === MonitoringSlotOutcome.SUCCESS
  ) {
    details.push(`Pre-sleep SUCCESS recorded at ${t0}`);
  } else {
    passed = false;
    details.push("Pre-sleep SUCCESS not recorded honestly");
  }

  const missed = deriveMissedScheduledSlots({
    lastSuccessAtIso: t0,
    wakeAtIso: wakeAt,
    intervalMs,
  });
  if (missed.length === 3) {
    details.push(`Derived ${missed.length} missed slots from cadence=${intervalMs}ms`);
  } else {
    passed = false;
    details.push(`Expected 3 missed slots, got ${missed.length}`);
  }

  state = markHostSleepCoverageGaps(state, missed);
  const gaps = state.slots.filter(
    (s) => s.outcome === MonitoringSlotOutcome.COVERAGE_GAP,
  );
  if (
    gaps.length === 3 &&
    state.lastVerifiedSuccessAtIso === t0 &&
    state.probeApplyCount === 1 &&
    gaps.every((g) => g.executedAtIso === null)
  ) {
    details.push(
      `Host sleep → ${gaps.length} COVERAGE_GAP slots; lastVerifiedSuccess unchanged; probeApplyCount=1`,
    );
  } else {
    passed = false;
    details.push(
      `Coverage gaps dishonest: gaps=${gaps.length} lastVerified=${state.lastVerifiedSuccessAtIso} applies=${state.probeApplyCount}`,
    );
  }

  const burst = coalesceWakeCatchup(state, {
    wakeAtIso: wakeAt,
    catchupProbe: { executedAtIso: wakeAt, verdict: "SUCCESS" },
    attemptedBurstPerMissedSlot: true,
  });
  if (!burst.ok && burst.code === "BURST_FORBIDDEN") {
    details.push(`Burst replay refused: ${burst.reason}`);
  } else {
    passed = false;
    details.push(`Burst replay unexpectedly ${JSON.stringify(burst)}`);
  }

  const noProbe = coalesceWakeCatchup(state, {
    wakeAtIso: wakeAt,
    catchupProbe: null,
  });
  if (!noProbe.ok && noProbe.code === "CATCHUP_PROBE_REQUIRED") {
    details.push(`Catch-up without probe refused: ${noProbe.reason}`);
  } else {
    passed = false;
    details.push(`Catch-up without probe unexpectedly ${JSON.stringify(noProbe)}`);
  }

  const fixtureCatchupProbe = {
    executedAtIso: wakeAt,
    verdict: "SUCCESS" as const,
  };
  const wake = coalesceWakeCatchup(state, {
    wakeAtIso: wakeAt,
    catchupProbe: fixtureCatchupProbe,
  });
  if (
    wake.ok &&
    wake.probeAppliesThisWake === 1 &&
    wake.coalescedGapSlotIds.length === 3 &&
    wake.state.probeApplyCount === 2 &&
    wake.state.lastVerifiedSuccessAtIso === wakeAt &&
    wake.state.externalEffects === "NONE"
  ) {
    details.push(
      `Wake coalesce catchup=${wake.catchupSlotId} gaps=${wake.coalescedGapSlotIds.length} probeAppliesThisWake=1 totalApplies=2 fixtureProbe=${fixtureCatchupProbe.executedAtIso}`,
    );
  } else {
    passed = false;
    details.push(`Wake coalesce unexpected ${JSON.stringify(wake)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveTemporalWiring=NOT_WIRED externalEffects=NONE",
  );

  return {
    proofId: `proof-host-sleep-${randomUUID()}`,
    kind: SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-host-sleep-${randomUUID().slice(0, 8)}`,
    createdAtIso: wakeAt,
    fixtureOnly: true,
  };
}
