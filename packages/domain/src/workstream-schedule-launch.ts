/**
 * T-US-025 — Launch workstream and schedule (F13/SC-02) — mission outcome.
 *
 * Offline fixture gate: owner chooses objective + pilot scope, reviews
 * readiness gates, runs a dry rehearsal (no external effects), selects
 * frequency / timezone / change cooldown, enables the reviewed workstream,
 * and records a fixture mission outcome with next action. Live provider
 * adapters stay NOT_WIRED. Distinct from T-US-026 (missed-schedule coalesce /
 * no burst republish) and T-X015 (DST recurring schedule no duplicates).
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 */

export const WorkstreamScheduleFrequency = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
} as const;

export type WorkstreamScheduleFrequencyValue =
  (typeof WorkstreamScheduleFrequency)[keyof typeof WorkstreamScheduleFrequency];

export type WorkstreamPilotScope = {
  workstreamId: string;
  objective: string;
  siteIds: readonly string[];
  channelIds: readonly string[];
  pilotScopeLabel: string;
};

export type WorkstreamReadinessGates = {
  connectionsReady: boolean;
  factsReady: boolean;
  testsReady: boolean;
  policyReady: boolean;
};

export type WorkstreamPlanEstimate = {
  planId: string;
  affectedAssetIds: readonly string[];
  estimatedCostMinor: number;
};

export type WorkstreamDryRunBundle = {
  dryRunId: string;
  rehearsalPassed: boolean;
  /** Dry rehearsal must never claim live mutation. */
  externalEffectsClaimed: "NONE";
};

export type WorkstreamScheduleSelection = {
  scheduleId: string;
  frequency: WorkstreamScheduleFrequencyValue;
  timezone: string;
  /** Change cooldown in hours (>= 1). */
  changeCooldownHours: number;
  localHour: number;
  localMinute: number;
};

export type WorkstreamMissionOutcome = {
  missionId: string;
  completed: boolean;
  outcomeSummary: string;
  nextAction: string;
};

export type WorkstreamScheduleLaunchInput = {
  scope: WorkstreamPilotScope;
  readiness: WorkstreamReadinessGates;
  plan: WorkstreamPlanEstimate;
  dryRun: WorkstreamDryRunBundle;
  schedule: WorkstreamScheduleSelection;
  /** Owner reviewed readiness + dry-run before enable. */
  ownerReviewed: boolean;
  launchReceiptId: string | null;
  mission: WorkstreamMissionOutcome;
  /** Request live provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * Attempt burst republish on enable — must refuse (T-US-026 territory;
   * launch path enables a single reviewed schedule only).
   */
  requestBurstRepublish: boolean;
};

export type WorkstreamScheduleLaunchDecision =
  | {
      allowed: true;
      code: "WORKSTREAM_SCHEDULE_LAUNCH_READY";
      recurringScheduleVisible: true;
      missionOutcomeRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        planId: string;
        affectedAssetIds: string[];
        estimatedCostMinor: number;
        readinessChecklist: WorkstreamReadinessGates;
        dryRunId: string;
        scheduleDefinition: WorkstreamScheduleSelection;
        launchReceiptId: string;
        missionId: string;
        outcomeSummary: string;
        nextAction: string;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "PILOT_SCOPE_INCOMPLETE"
        | "READINESS_GATES_INCOMPLETE"
        | "PLAN_ESTIMATE_INCOMPLETE"
        | "DRY_RUN_INCOMPLETE"
        | "SCHEDULE_SELECTION_INVALID"
        | "OWNER_REVIEW_REQUIRED"
        | "MISSION_OUTCOME_INCOMPLETE"
        | "BURST_REPUBLISH_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      recurringScheduleVisible: false;
      missionOutcomeRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

export const WORKSTREAM_SCHEDULE_LAUNCH_RELATED_CASE_IDS = [
  "T-US-025",
] as const;

/**
 * Evaluate the F13 workstream + recurring schedule launch path offline.
 * Produces plan / readiness / dry-run / schedule / launch receipt / mission
 * outcome evidence; live stays NOT_WIRED; burst republish refused.
 */
export function evaluateWorkstreamScheduleLaunch(
  input: WorkstreamScheduleLaunchInput,
): WorkstreamScheduleLaunchDecision {
  const base = {
    recurringScheduleVisible: false as const,
    missionOutcomeRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      reasons: [
        "Live workstream schedule launch remains NOT_WIRED — refuse live wiring (T-US-025)",
      ],
    };
  }

  if (input.requestBurstRepublish) {
    return {
      allowed: false,
      code: "BURST_REPUBLISH_REFUSED",
      ...base,
      reasons: [
        "Burst republish on launch is refused — enable a single reviewed schedule only (T-US-025); coalesce/no-burst is T-US-026",
      ],
    };
  }

  const scope = input.scope;
  if (
    !scope.workstreamId.trim() ||
    !scope.objective.trim() ||
    scope.siteIds.length === 0 ||
    scope.channelIds.length === 0 ||
    !scope.pilotScopeLabel.trim()
  ) {
    return {
      allowed: false,
      code: "PILOT_SCOPE_INCOMPLETE",
      ...base,
      reasons: [
        "Pilot scope requires workstream, objective, sites, channels, and pilot scope label (T-US-025)",
      ],
    };
  }

  const r = input.readiness;
  if (
    !r.connectionsReady ||
    !r.factsReady ||
    !r.testsReady ||
    !r.policyReady
  ) {
    return {
      allowed: false,
      code: "READINESS_GATES_INCOMPLETE",
      ...base,
      reasons: [
        "Readiness gates require connections, facts, tests, and policy ready (T-US-025)",
      ],
    };
  }

  const plan = input.plan;
  if (
    !plan.planId.trim() ||
    plan.affectedAssetIds.length === 0 ||
    !Number.isFinite(plan.estimatedCostMinor) ||
    plan.estimatedCostMinor < 0
  ) {
    return {
      allowed: false,
      code: "PLAN_ESTIMATE_INCOMPLETE",
      ...base,
      reasons: [
        "Plan requires planId, affected assets, and non-negative estimated cost (T-US-025)",
      ],
    };
  }

  const dry = input.dryRun;
  if (
    !dry.dryRunId.trim() ||
    !dry.rehearsalPassed ||
    dry.externalEffectsClaimed !== "NONE"
  ) {
    return {
      allowed: false,
      code: "DRY_RUN_INCOMPLETE",
      ...base,
      reasons: [
        "Dry rehearsal requires dryRunId, passed rehearsal, and externalEffectsClaimed=NONE (T-US-025)",
      ],
    };
  }

  const sched = input.schedule;
  if (
    !sched.scheduleId.trim() ||
    !sched.timezone.trim() ||
    !Number.isFinite(sched.changeCooldownHours) ||
    sched.changeCooldownHours < 1 ||
    !Number.isInteger(sched.localHour) ||
    sched.localHour < 0 ||
    sched.localHour > 23 ||
    !Number.isInteger(sched.localMinute) ||
    sched.localMinute < 0 ||
    sched.localMinute > 59
  ) {
    return {
      allowed: false,
      code: "SCHEDULE_SELECTION_INVALID",
      ...base,
      reasons: [
        "Schedule requires id, timezone, changeCooldownHours>=1, and valid local time (T-US-025)",
      ],
    };
  }

  if (!input.ownerReviewed || !input.launchReceiptId?.trim()) {
    return {
      allowed: false,
      code: "OWNER_REVIEW_REQUIRED",
      ...base,
      reasons: [
        "Owner review and launch receipt are required to enable the workstream (T-US-025)",
      ],
    };
  }

  const mission = input.mission;
  if (
    !mission.missionId.trim() ||
    !mission.completed ||
    !mission.outcomeSummary.trim() ||
    !mission.nextAction.trim()
  ) {
    return {
      allowed: false,
      code: "MISSION_OUTCOME_INCOMPLETE",
      ...base,
      reasons: [
        "Mission outcome requires missionId, completed=true, outcomeSummary, and nextAction (T-US-025)",
      ],
    };
  }

  return {
    allowed: true,
    code: "WORKSTREAM_SCHEDULE_LAUNCH_READY",
    recurringScheduleVisible: true,
    missionOutcomeRecorded: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      planId: plan.planId,
      affectedAssetIds: [...plan.affectedAssetIds],
      estimatedCostMinor: plan.estimatedCostMinor,
      readinessChecklist: { ...r },
      dryRunId: dry.dryRunId,
      scheduleDefinition: { ...sched },
      launchReceiptId: input.launchReceiptId!,
      missionId: mission.missionId,
      outcomeSummary: mission.outcomeSummary,
      nextAction: mission.nextAction,
    },
    reasons: [
      `Workstream ${scope.workstreamId} launch ready for objective "${scope.objective}"`,
      `Recurring schedule ${sched.scheduleId} visible (${sched.frequency} ${sched.timezone})`,
      `Mission ${mission.missionId} outcome recorded; nextAction=${mission.nextAction}`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
