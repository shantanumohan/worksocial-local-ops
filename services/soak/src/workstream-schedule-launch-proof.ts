/**
 * Fixture proof for T-US-025 — Launch workstream and schedule (mission outcome).
 * Objective + pilot scope, readiness gates, dry rehearsal (NONE), frequency /
 * timezone / cooldown, launch receipt, mission outcome + next action.
 * Live NOT_WIRED. Distinct from T-US-026 / T-X015. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  WorkstreamScheduleFrequency,
  evaluateWorkstreamScheduleLaunch,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-025 fixture ACCEPTED.
 */
export function proofLaunchWorkstreamScheduleMissionOutcome(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const ready = evaluateWorkstreamScheduleLaunch({
    scope: {
      workstreamId: "ws-seo-pilot",
      objective: "Improve local SEO landing page",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site", "inbox"],
      pilotScopeLabel: "single-site pilot",
    },
    readiness: {
      connectionsReady: true,
      factsReady: true,
      testsReady: true,
      policyReady: true,
    },
    plan: {
      planId: "plan-us025",
      affectedAssetIds: ["page-home", "page-pricing"],
      estimatedCostMinor: 2500,
    },
    dryRun: {
      dryRunId: "dry-us025",
      rehearsalPassed: true,
      externalEffectsClaimed: "NONE",
    },
    schedule: {
      scheduleId: "sched-us025-daily",
      frequency: WorkstreamScheduleFrequency.DAILY,
      timezone: "America/New_York",
      changeCooldownHours: 24,
      localHour: 9,
      localMinute: 0,
    },
    ownerReviewed: true,
    launchReceiptId: "rcpt-launch-us025",
    mission: {
      missionId: "mission-us025",
      completed: true,
      outcomeSummary: "Authorized fixture workflow finished with evidence",
      nextAction: "Review first scheduled occurrence",
    },
    requestLiveProviderWiring: false,
    requestBurstRepublish: false,
  });
  if (
    ready.allowed &&
    ready.code === "WORKSTREAM_SCHEDULE_LAUNCH_READY" &&
    ready.recurringScheduleVisible &&
    ready.missionOutcomeRecorded &&
    ready.liveProviderWiring === "NOT_WIRED" &&
    ready.externalEffects === "NONE" &&
    ready.evidence.launchReceiptId === "rcpt-launch-us025" &&
    ready.evidence.missionId === "mission-us025" &&
    ready.evidence.scheduleDefinition.scheduleId === "sched-us025-daily"
  ) {
    details.push(
      "Ready → WORKSTREAM_SCHEDULE_LAUNCH_READY; schedule visible; mission outcome + nextAction; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Ready unexpectedly ${JSON.stringify(ready)}`);
  }

  const burst = evaluateWorkstreamScheduleLaunch({
    scope: {
      workstreamId: "ws-seo-pilot",
      objective: "Improve local SEO landing page",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      pilotScopeLabel: "single-site pilot",
    },
    readiness: {
      connectionsReady: true,
      factsReady: true,
      testsReady: true,
      policyReady: true,
    },
    plan: {
      planId: "plan-us025",
      affectedAssetIds: ["page-home"],
      estimatedCostMinor: 100,
    },
    dryRun: {
      dryRunId: "dry-us025",
      rehearsalPassed: true,
      externalEffectsClaimed: "NONE",
    },
    schedule: {
      scheduleId: "sched-us025-daily",
      frequency: WorkstreamScheduleFrequency.DAILY,
      timezone: "America/New_York",
      changeCooldownHours: 24,
      localHour: 9,
      localMinute: 0,
    },
    ownerReviewed: true,
    launchReceiptId: "rcpt-launch-us025",
    mission: {
      missionId: "mission-us025",
      completed: true,
      outcomeSummary: "ok",
      nextAction: "next",
    },
    requestLiveProviderWiring: false,
    requestBurstRepublish: true,
  });
  if (!burst.allowed && burst.code === "BURST_REPUBLISH_REFUSED") {
    details.push("requestBurstRepublish → BURST_REPUBLISH_REFUSED");
  } else {
    passed = false;
    details.push(`Burst refuse unexpectedly ${JSON.stringify(burst)}`);
  }

  const live = evaluateWorkstreamScheduleLaunch({
    scope: {
      workstreamId: "ws-seo-pilot",
      objective: "Improve local SEO landing page",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      pilotScopeLabel: "single-site pilot",
    },
    readiness: {
      connectionsReady: true,
      factsReady: true,
      testsReady: true,
      policyReady: true,
    },
    plan: {
      planId: "plan-us025",
      affectedAssetIds: ["page-home"],
      estimatedCostMinor: 100,
    },
    dryRun: {
      dryRunId: "dry-us025",
      rehearsalPassed: true,
      externalEffectsClaimed: "NONE",
    },
    schedule: {
      scheduleId: "sched-us025-daily",
      frequency: WorkstreamScheduleFrequency.WEEKLY,
      timezone: "America/New_York",
      changeCooldownHours: 48,
      localHour: 10,
      localMinute: 30,
    },
    ownerReviewed: true,
    launchReceiptId: "rcpt-launch-us025",
    mission: {
      missionId: "mission-us025",
      completed: true,
      outcomeSummary: "ok",
      nextAction: "next",
    },
    requestLiveProviderWiring: true,
    requestBurstRepublish: false,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live refuse unexpectedly ${JSON.stringify(live)}`);
  }

  const unreadied = evaluateWorkstreamScheduleLaunch({
    scope: {
      workstreamId: "ws-seo-pilot",
      objective: "Improve local SEO landing page",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      pilotScopeLabel: "single-site pilot",
    },
    readiness: {
      connectionsReady: true,
      factsReady: true,
      testsReady: false,
      policyReady: true,
    },
    plan: {
      planId: "plan-us025",
      affectedAssetIds: ["page-home"],
      estimatedCostMinor: 100,
    },
    dryRun: {
      dryRunId: "dry-us025",
      rehearsalPassed: true,
      externalEffectsClaimed: "NONE",
    },
    schedule: {
      scheduleId: "sched-us025-daily",
      frequency: WorkstreamScheduleFrequency.DAILY,
      timezone: "America/New_York",
      changeCooldownHours: 24,
      localHour: 9,
      localMinute: 0,
    },
    ownerReviewed: true,
    launchReceiptId: "rcpt-launch-us025",
    mission: {
      missionId: "mission-us025",
      completed: true,
      outcomeSummary: "ok",
      nextAction: "next",
    },
    requestLiveProviderWiring: false,
    requestBurstRepublish: false,
  });
  if (
    !unreadied.allowed &&
    unreadied.code === "READINESS_GATES_INCOMPLETE"
  ) {
    details.push("tests not ready → READINESS_GATES_INCOMPLETE");
  } else {
    passed = false;
    details.push(`Unreadied unexpectedly ${JSON.stringify(unreadied)}`);
  }

  const unreviewed = evaluateWorkstreamScheduleLaunch({
    scope: {
      workstreamId: "ws-seo-pilot",
      objective: "Improve local SEO landing page",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      pilotScopeLabel: "single-site pilot",
    },
    readiness: {
      connectionsReady: true,
      factsReady: true,
      testsReady: true,
      policyReady: true,
    },
    plan: {
      planId: "plan-us025",
      affectedAssetIds: ["page-home"],
      estimatedCostMinor: 100,
    },
    dryRun: {
      dryRunId: "dry-us025",
      rehearsalPassed: true,
      externalEffectsClaimed: "NONE",
    },
    schedule: {
      scheduleId: "sched-us025-daily",
      frequency: WorkstreamScheduleFrequency.DAILY,
      timezone: "America/New_York",
      changeCooldownHours: 24,
      localHour: 9,
      localMinute: 0,
    },
    ownerReviewed: false,
    launchReceiptId: null,
    mission: {
      missionId: "mission-us025",
      completed: true,
      outcomeSummary: "ok",
      nextAction: "next",
    },
    requestLiveProviderWiring: false,
    requestBurstRepublish: false,
  });
  if (!unreviewed.allowed && unreviewed.code === "OWNER_REVIEW_REQUIRED") {
    details.push("unreviewed → OWNER_REVIEW_REQUIRED");
  } else {
    passed = false;
    details.push(`Unreviewed unexpectedly ${JSON.stringify(unreviewed)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  details.push(
    "Distinct from T-US-026 (missed-schedule coalesce / no burst) and T-X015 (DST schedule no duplicates)",
  );

  return {
    proofId: `proof-workstream-schedule-${randomUUID()}`,
    kind: SoakProofKind.LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us025-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
