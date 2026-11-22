/**
 * Fixture proof for T-US-026 — Missed schedules coalesce; no burst republish.
 *
 * Cadence-derived misses for content/social schedules coalesce into one
 * catch-up after an actual fixture publish decision (no burst republish).
 * Live NOT_WIRED. Distinct from T-X001 / T-X015 / T-US-025.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  MissedScheduleSlotOutcome,
  SoakProofKind,
  coalesceMissedPublishSlots,
  createMissedScheduleCoalesceState,
  deriveMissedPublishSlots,
  markMissedPublishSlots,
  recordScheduledPublish,
  type SoakProofRecord,
} from "@worksocial/domain";

const HOUR_MS = 3_600_000;

/**
 * Complete expected proof set for T-US-026 fixture ACCEPTED.
 */
export function proofMissedScheduleCoalesceNoBurst(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const scheduleId = `sched-us026-${randomUUID().slice(0, 8)}`;
  const t0 = nowIso;
  const recoveredAt = new Date(Date.parse(t0) + 3.5 * HOUR_MS).toISOString();

  let state = createMissedScheduleCoalesceState({
    scheduleId,
    channelId: "owned-social",
    intervalMs: HOUR_MS,
  });

  state = recordScheduledPublish(state, {
    scheduledAtIso: t0,
    executedAtIso: t0,
  });
  if (
    state.lastPublishedAtIso === t0 &&
    state.publishApplyCount === 1 &&
    state.slots[0]?.outcome === MissedScheduleSlotOutcome.PUBLISHED
  ) {
    details.push(`Pre-downtime PUBLISHED recorded at ${t0}`);
  } else {
    passed = false;
    details.push("Pre-downtime PUBLISHED not recorded honestly");
  }

  const missed = deriveMissedPublishSlots({
    lastPublishedAtIso: t0,
    recoveredAtIso: recoveredAt,
    intervalMs: HOUR_MS,
  });
  if (missed.length === 3) {
    details.push(
      `Derived ${missed.length} missed publish slots from cadence=${HOUR_MS}ms`,
    );
  } else {
    passed = false;
    details.push(`Expected 3 missed slots, got ${missed.length}`);
  }

  state = markMissedPublishSlots(state, missed);
  const misses = state.slots.filter(
    (s) => s.outcome === MissedScheduleSlotOutcome.MISSED,
  );
  if (
    misses.length === 3 &&
    state.lastPublishedAtIso === t0 &&
    state.publishApplyCount === 1 &&
    misses.every((g) => g.executedAtIso === null)
  ) {
    details.push(
      `Downtime → ${misses.length} MISSED slots; lastPublished unchanged; publishApplyCount=1`,
    );
  } else {
    passed = false;
    details.push(
      `Missed slots dishonest: misses=${misses.length} lastPublished=${state.lastPublishedAtIso} applies=${state.publishApplyCount}`,
    );
  }

  const burst = coalesceMissedPublishSlots(state, {
    recoveredAtIso: recoveredAt,
    catchupDecision: { executedAtIso: recoveredAt, verdict: "PUBLISHED" },
    attemptedBurstRepublish: true,
  });
  if (!burst.ok && burst.code === "BURST_REPUBLISH_FORBIDDEN") {
    details.push(`Burst republish refused: ${burst.reason}`);
  } else {
    passed = false;
    details.push(`Burst republish unexpectedly ${JSON.stringify(burst)}`);
  }

  const noDecision = coalesceMissedPublishSlots(state, {
    recoveredAtIso: recoveredAt,
    catchupDecision: null,
  });
  if (!noDecision.ok && noDecision.code === "CATCHUP_DECISION_REQUIRED") {
    details.push(`Catch-up without decision refused: ${noDecision.reason}`);
  } else {
    passed = false;
    details.push(
      `Catch-up without decision unexpectedly ${JSON.stringify(noDecision)}`,
    );
  }

  const live = coalesceMissedPublishSlots(state, {
    recoveredAtIso: recoveredAt,
    catchupDecision: { executedAtIso: recoveredAt, verdict: "PUBLISHED" },
    requestLiveProviderWiring: true,
  });
  if (!live.ok && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push(`Live wiring refused: ${live.reason}`);
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  const fixtureCatchup = {
    executedAtIso: recoveredAt,
    verdict: "PUBLISHED" as const,
  };
  const coalesce = coalesceMissedPublishSlots(state, {
    recoveredAtIso: recoveredAt,
    catchupDecision: fixtureCatchup,
  });
  if (
    coalesce.ok &&
    coalesce.publishAppliesThisRecovery === 1 &&
    coalesce.coalescedMissedSlotIds.length === 3 &&
    coalesce.state.publishApplyCount === 2 &&
    coalesce.state.lastPublishedAtIso === recoveredAt &&
    coalesce.externalEffects === "NONE" &&
    coalesce.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      `Recovery coalesce catchup=${coalesce.catchupSlotId} misses=${coalesce.coalescedMissedSlotIds.length} publishAppliesThisRecovery=1 totalApplies=2 fixtureDecision=${fixtureCatchup.executedAtIso}`,
    );
  } else {
    passed = false;
    details.push(`Recovery coalesce unexpected ${JSON.stringify(coalesce)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-X001 (monitoring probe coalesce), T-X015 (DST no duplicates), and T-US-025 (workstream launch)",
  );

  return {
    proofId: `proof-missed-schedule-${randomUUID()}`,
    kind: SoakProofKind.MISSED_SCHEDULE_COALESCE_NO_BURST,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-missed-schedule-${randomUUID().slice(0, 8)}`,
    createdAtIso: recoveredAt,
    fixtureOnly: true,
  };
}
