import { describe, expect, it } from "vitest";
import {
  WorkstreamScheduleFrequency,
  evaluateWorkstreamScheduleLaunch,
  type WorkstreamScheduleLaunchInput,
} from "./workstream-schedule-launch.js";

function baseInput(
  overrides: Partial<WorkstreamScheduleLaunchInput> = {},
): WorkstreamScheduleLaunchInput {
  return {
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
    ...overrides,
  };
}

describe("workstream-schedule-launch (T-US-025)", () => {
  it("launches workstream with schedule and mission outcome offline", () => {
    const result = evaluateWorkstreamScheduleLaunch(baseInput());
    expect(result.allowed).toBe(true);
    if (result.allowed) {
      expect(result.code).toBe("WORKSTREAM_SCHEDULE_LAUNCH_READY");
      expect(result.recurringScheduleVisible).toBe(true);
      expect(result.missionOutcomeRecorded).toBe(true);
      expect(result.liveProviderWiring).toBe("NOT_WIRED");
      expect(result.externalEffects).toBe("NONE");
      expect(result.evidence.launchReceiptId).toBe("rcpt-launch-us025");
      expect(result.evidence.scheduleDefinition.scheduleId).toBe(
        "sched-us025-daily",
      );
      expect(result.evidence.nextAction).toContain("scheduled");
    }
  });

  it("refuses live provider wiring", () => {
    const result = evaluateWorkstreamScheduleLaunch(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
      expect(result.externalEffects).toBe("NONE");
    }
  });

  it("refuses burst republish on launch", () => {
    const result = evaluateWorkstreamScheduleLaunch(
      baseInput({ requestBurstRepublish: true }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("BURST_REPUBLISH_REFUSED");
    }
  });

  it("refuses incomplete readiness gates", () => {
    const result = evaluateWorkstreamScheduleLaunch(
      baseInput({
        readiness: {
          connectionsReady: true,
          factsReady: false,
          testsReady: true,
          policyReady: true,
        },
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("READINESS_GATES_INCOMPLETE");
    }
  });

  it("refuses missing owner review / launch receipt", () => {
    const result = evaluateWorkstreamScheduleLaunch(
      baseInput({ ownerReviewed: false, launchReceiptId: null }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("OWNER_REVIEW_REQUIRED");
    }
  });

  it("refuses incomplete mission outcome", () => {
    const result = evaluateWorkstreamScheduleLaunch(
      baseInput({
        mission: {
          missionId: "mission-us025",
          completed: false,
          outcomeSummary: "",
          nextAction: "",
        },
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("MISSION_OUTCOME_INCOMPLETE");
    }
  });

  it("refuses invalid schedule selection", () => {
    const result = evaluateWorkstreamScheduleLaunch(
      baseInput({
        schedule: {
          scheduleId: "sched-bad",
          frequency: WorkstreamScheduleFrequency.WEEKLY,
          timezone: "America/New_York",
          changeCooldownHours: 0,
          localHour: 9,
          localMinute: 0,
        },
      }),
    );
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.code).toBe("SCHEDULE_SELECTION_INVALID");
    }
  });
});
