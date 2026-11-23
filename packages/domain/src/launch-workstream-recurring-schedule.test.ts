import { describe, expect, it } from "vitest";
import {
  LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_RELATED_CASE_IDS,
  WorkstreamScheduleFrequency,
  evaluateLaunchWorkstreamRecurringSchedule,
  type LaunchWorkstreamRecurringScheduleInput,
} from "./launch-workstream-recurring-schedule.js";

function baseInput(
  overrides: Partial<LaunchWorkstreamRecurringScheduleInput> = {},
): LaunchWorkstreamRecurringScheduleInput {
  return {
    packageId: "pkg-f13-1",
    scope: {
      workstreamId: "ws-local-seo-pilot",
      objective: "Publish weekly local SEO updates for NYC pilot",
      siteIds: ["site-nyc-1"],
      channelIds: ["ch-gbp-1", "ch-social-1"],
      pilotScopeLabel: "NYC local SEO pilot",
    },
    readiness: {
      connectionsReady: true,
      factsReady: true,
      testsReady: true,
      policyReady: true,
    },
    plan: {
      planId: "plan-f13-1",
      affectedAssetIds: ["page-home", "page-services"],
      estimatedCostMinor: 1200,
    },
    dryRun: {
      dryRunId: "dry-f13-1",
      rehearsalPassed: true,
      externalEffectsClaimed: "NONE",
    },
    schedule: {
      scheduleId: "sched-f13-1",
      frequency: WorkstreamScheduleFrequency.WEEKLY,
      timezone: "America/New_York",
      changeCooldownHours: 24,
      localHour: 9,
      localMinute: 0,
    },
    ownerReviewed: true,
    launchReceiptId: "launch-f13-1",
    mission: {
      missionId: "mission-f13-1",
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

describe("evaluateLaunchWorkstreamRecurringSchedule (T-F13)", () => {
  it("records complete F13 evidence package", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.recurringScheduleVisible).toBe(true);
    expect(decision.missionOutcomeRecorded).toBe(true);
    expect(decision.evidence.packageId).toBe("pkg-f13-1");
    expect(decision.evidence.workstreamId).toBe("ws-local-seo-pilot");
    expect(decision.evidence.scheduleId).toBe("sched-f13-1");
    expect(decision.evidence.frequency).toBe(
      WorkstreamScheduleFrequency.WEEKLY,
    );
    expect(decision.evidence.dryRunExternalEffects).toBe("NONE");
    expect(decision.evidence.launchVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F13_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_RELATED_CASE_IDS).toEqual([
      "T-F13",
    ]);
  });

  it("refuses missing pilot scope", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ scope: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PILOT_SCOPE_REQUIRED");
    expect(decision.evidence?.currentState).toBe("AWAITING_PILOT_SCOPE");
  });

  it("refuses incomplete readiness gates", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({
        readiness: {
          connectionsReady: true,
          factsReady: true,
          testsReady: false,
          policyReady: true,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("READINESS_GATES_REQUIRED");
  });

  it("refuses incomplete plan", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ plan: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PLAN_ESTIMATE_REQUIRED");
  });

  it("refuses incomplete dry run", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ dryRun: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DRY_RUN_REQUIRED");
  });

  it("refuses invalid schedule", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ schedule: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SCHEDULE_SELECTION_REQUIRED");
  });

  it("refuses missing owner review", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ ownerReviewed: false, launchReceiptId: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OWNER_REVIEW_REQUIRED");
  });

  it("refuses incomplete mission outcome", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ mission: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MISSION_OUTCOME_REQUIRED");
  });

  it("refuses burst republish", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ requestBurstRepublish: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BURST_REPUBLISH_REFUSED");
  });

  it("refuses false live-verified launch claim", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ claimLiveVerifiedLaunch: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_LAUNCH_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateLaunchWorkstreamRecurringSchedule(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
