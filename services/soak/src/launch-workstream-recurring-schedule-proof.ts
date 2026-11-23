/**
 * Fixture proof for T-F13 — Launch a workstream and recurring schedule.
 * Complete F13 evidence package: objective + pilot scope, readiness gates,
 * plan/assets/cost, dry rehearsal (NONE), frequency/timezone/cooldown,
 * owner-reviewed launch receipt, mission outcome + next action; unsafe
 * claims refused; live providers NOT_WIRED. Distinct from T-US-025 launch
 * readiness summary, T-US-026 missed-schedule coalesce, and T-X015 DST
 * schedule no duplicates. External effects: NONE. Never invents live
 * VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  WorkstreamScheduleFrequency,
  evaluateLaunchWorkstreamRecurringSchedule,
  type LaunchWorkstreamRecurringScheduleInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<LaunchWorkstreamRecurringScheduleInput> = {},
): LaunchWorkstreamRecurringScheduleInput {
  return {
    packageId: "pkg-f13-soak",
    scope: {
      workstreamId: "ws-local-seo-pilot",
      objective: "Publish weekly local SEO updates for NYC pilot",
      siteIds: ["site-nyc-soak"],
      channelIds: ["ch-gbp-soak", "ch-social-soak"],
      pilotScopeLabel: "NYC local SEO pilot",
    },
    readiness: {
      connectionsReady: true,
      factsReady: true,
      testsReady: true,
      policyReady: true,
    },
    plan: {
      planId: "plan-f13-soak",
      affectedAssetIds: ["page-home-soak", "page-services-soak"],
      estimatedCostMinor: 1200,
    },
    dryRun: {
      dryRunId: "dry-f13-soak",
      rehearsalPassed: true,
      externalEffectsClaimed: "NONE",
    },
    schedule: {
      scheduleId: "sched-f13-soak",
      frequency: WorkstreamScheduleFrequency.WEEKLY,
      timezone: "America/New_York",
      changeCooldownHours: 24,
      localHour: 9,
      localMinute: 0,
    },
    ownerReviewed: true,
    launchReceiptId: "launch-f13-soak",
    mission: {
      missionId: "mission-f13-soak",
      completed: true,
      outcomeSummary: "Pilot workstream enabled with weekly schedule",
      nextAction: "Monitor first scheduled dry-run slot",
    },
    claimLiveVerifiedLaunch: false,
    requestLiveProviderWiring: false,
    requestBurstRepublish: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F13 fixture ACCEPTED.
 */
export function proofLaunchWorkstreamRecurringSchedule(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateLaunchWorkstreamRecurringSchedule(baseInput());
  if (
    happy.allowed &&
    happy.code === "LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_EVIDENCE_RECORDED" &&
    happy.evidence.launchVerifiedLive === false &&
    happy.recurringScheduleVisible === true &&
    happy.missionOutcomeRecorded === true &&
    happy.evidence.dryRunExternalEffects === "NONE" &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F13 evidence package → LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_EVIDENCE_RECORDED; objective + pilot scope; readiness gates; plan/assets/cost; dry rehearsal externalEffects NONE; frequency/timezone/cooldown; owner-reviewed launch receipt; mission outcome + next action; launchVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noScope = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ scope: null }),
  );
  if (!noScope.allowed && noScope.code === "PILOT_SCOPE_REQUIRED") {
    details.push("scope=null → PILOT_SCOPE_REQUIRED");
  } else {
    passed = false;
    details.push(`Scope unexpectedly ${JSON.stringify(noScope)}`);
  }

  const noReadiness = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({
      readiness: {
        connectionsReady: true,
        factsReady: true,
        testsReady: false,
        policyReady: true,
      },
    }),
  );
  if (
    !noReadiness.allowed &&
    noReadiness.code === "READINESS_GATES_REQUIRED"
  ) {
    details.push("testsReady=false → READINESS_GATES_REQUIRED");
  } else {
    passed = false;
    details.push(`Readiness unexpectedly ${JSON.stringify(noReadiness)}`);
  }

  const noPlan = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ plan: null }),
  );
  if (!noPlan.allowed && noPlan.code === "PLAN_ESTIMATE_REQUIRED") {
    details.push("plan=null → PLAN_ESTIMATE_REQUIRED");
  } else {
    passed = false;
    details.push(`Plan unexpectedly ${JSON.stringify(noPlan)}`);
  }

  const noDry = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ dryRun: null }),
  );
  if (!noDry.allowed && noDry.code === "DRY_RUN_REQUIRED") {
    details.push("dryRun=null → DRY_RUN_REQUIRED");
  } else {
    passed = false;
    details.push(`Dry run unexpectedly ${JSON.stringify(noDry)}`);
  }

  const noSched = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ schedule: null }),
  );
  if (!noSched.allowed && noSched.code === "SCHEDULE_SELECTION_REQUIRED") {
    details.push("schedule=null → SCHEDULE_SELECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Schedule unexpectedly ${JSON.stringify(noSched)}`);
  }

  const unreviewed = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ ownerReviewed: false, launchReceiptId: null }),
  );
  if (!unreviewed.allowed && unreviewed.code === "OWNER_REVIEW_REQUIRED") {
    details.push("unreviewed → OWNER_REVIEW_REQUIRED");
  } else {
    passed = false;
    details.push(`Owner review unexpectedly ${JSON.stringify(unreviewed)}`);
  }

  const noMission = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ mission: null }),
  );
  if (!noMission.allowed && noMission.code === "MISSION_OUTCOME_REQUIRED") {
    details.push("mission=null → MISSION_OUTCOME_REQUIRED");
  } else {
    passed = false;
    details.push(`Mission unexpectedly ${JSON.stringify(noMission)}`);
  }

  const burst = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ requestBurstRepublish: true }),
  );
  if (!burst.allowed && burst.code === "BURST_REPUBLISH_REFUSED") {
    details.push("requestBurstRepublish → BURST_REPUBLISH_REFUSED");
  } else {
    passed = false;
    details.push(`Burst unexpectedly ${JSON.stringify(burst)}`);
  }

  const liveClaim = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ claimLiveVerifiedLaunch: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_LAUNCH_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedLaunch → FALSE_LIVE_VERIFIED_LAUNCH_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateLaunchWorkstreamRecurringSchedule(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-025 (launch readiness summary), T-US-026 (missed-schedule coalesce / no burst), and T-X015 (DST schedule no duplicates) — complete F13 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.LAUNCH_WORKSTREAM_RECURRING_SCHEDULE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-launch-workstream-recurring-schedule-f13",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
