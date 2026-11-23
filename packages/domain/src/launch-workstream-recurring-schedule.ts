/**
 * T-F13 — Launch a workstream and recurring schedule (complete F13 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F13 evidence
 * package — objective + pilot scope, readiness gates checklist, plan with
 * affected assets + estimated cost, dry rehearsal (externalEffects NONE),
 * frequency/timezone/change cooldown schedule, owner-reviewed launch receipt,
 * and mission outcome + next action. Incomplete packages, burst republish,
 * false live-verified claims, and live provider wiring are refused. Live
 * provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-025 (`LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME`) — this
 * records the complete F13 flow evidence package (structured package +
 * blocking/recovery state), not the launch readiness summary alone. Distinct
 * from T-US-026 (missed-schedule coalesce / no burst) and T-X015 (DST
 * recurring schedule no duplicates).
 */

import {
  WorkstreamScheduleFrequency,
  type WorkstreamDryRunBundle,
  type WorkstreamMissionOutcome,
  type WorkstreamPilotScope,
  type WorkstreamPlanEstimate,
  type WorkstreamReadinessGates,
  type WorkstreamScheduleFrequencyValue,
  type WorkstreamScheduleSelection,
} from "./workstream-schedule-launch.js";

export type LaunchWorkstreamRecurringScheduleInput = {
  packageId: string;
  scope: WorkstreamPilotScope | null;
  readiness: WorkstreamReadinessGates | null;
  plan: WorkstreamPlanEstimate | null;
  dryRun: WorkstreamDryRunBundle | null;
  schedule: WorkstreamScheduleSelection | null;
  /** Owner reviewed readiness + dry-run before enable. */
  ownerReviewed: boolean;
  launchReceiptId: string | null;
  mission: WorkstreamMissionOutcome | null;
  /** Claim the F13 path is live-verified — must refuse offline. */
  claimLiveVerifiedLaunch: boolean;
  /** Request live provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /**
   * Attempt burst republish on enable — must refuse (T-US-026 territory;
   * launch path enables a single reviewed schedule only).
   */
  requestBurstRepublish: boolean;
};

export type LaunchWorkstreamRecurringScheduleDecision =
  | {
      allowed: true;
      code: "LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_EVIDENCE_RECORDED";
      recurringScheduleVisible: true;
      missionOutcomeRecorded: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        workstreamId: string;
        objective: string;
        pilotScopeLabel: string;
        siteCount: number;
        channelCount: number;
        connectionsReady: true;
        factsReady: true;
        testsReady: true;
        policyReady: true;
        planId: string;
        affectedAssetCount: number;
        estimatedCostMinor: number;
        dryRunId: string;
        dryRunExternalEffects: "NONE";
        scheduleId: string;
        frequency: WorkstreamScheduleFrequencyValue;
        timezone: string;
        changeCooldownHours: number;
        launchReceiptId: string;
        missionId: string;
        outcomeSummary: string;
        nextAction: string;
        launchVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F13_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "WORKSTREAM_RECURRING_SCHEDULE_LAUNCHED";
        recoveryPath: "KEEP_FIXTURE_LAUNCH_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "PILOT_SCOPE_REQUIRED"
        | "READINESS_GATES_REQUIRED"
        | "PLAN_ESTIMATE_REQUIRED"
        | "DRY_RUN_REQUIRED"
        | "SCHEDULE_SELECTION_REQUIRED"
        | "OWNER_REVIEW_REQUIRED"
        | "MISSION_OUTCOME_REQUIRED"
        | "BURST_REPUBLISH_REFUSED"
        | "FALSE_LIVE_VERIFIED_LAUNCH_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      recurringScheduleVisible: false;
      missionOutcomeRecorded: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        workstreamId: string | null;
        objective: string | null;
        pilotScopeLabel: string | null;
        siteCount: number;
        channelCount: number;
        connectionsReady: boolean;
        factsReady: boolean;
        testsReady: boolean;
        policyReady: boolean;
        planId: string | null;
        affectedAssetCount: number;
        estimatedCostMinor: number | null;
        dryRunId: string | null;
        dryRunExternalEffects: "NONE" | null;
        scheduleId: string | null;
        frequency: WorkstreamScheduleFrequencyValue | null;
        timezone: string | null;
        changeCooldownHours: number | null;
        launchReceiptId: string | null;
        missionId: string | null;
        outcomeSummary: string | null;
        nextAction: string | null;
        launchVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_PILOT_SCOPE"
          | "AWAITING_READINESS_GATES"
          | "AWAITING_PLAN_ESTIMATE"
          | "AWAITING_DRY_RUN"
          | "AWAITING_SCHEDULE_SELECTION"
          | "AWAITING_OWNER_REVIEW"
          | "AWAITING_MISSION_OUTCOME";
        recoveryPath:
          | "CHOOSE_OBJECTIVE_AND_PILOT_SCOPE"
          | "COMPLETE_READINESS_GATES"
          | "PROVIDE_PLAN_AFFECTED_ASSETS_COST"
          | "RUN_DRY_REHEARSAL_EXTERNAL_EFFECTS_NONE"
          | "SELECT_FREQUENCY_TIMEZONE_COOLDOWN"
          | "OWNER_REVIEW_AND_LAUNCH_RECEIPT"
          | "RECORD_MISSION_OUTCOME_AND_NEXT_ACTION"
          | "KEEP_FIXTURE_LAUNCH_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_RELATED_CASE_IDS = [
  "T-F13",
] as const;

const VALID_FREQUENCIES = new Set<string>(
  Object.values(WorkstreamScheduleFrequency),
);

function preservedInputCount(
  input: LaunchWorkstreamRecurringScheduleInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.scope?.workstreamId.trim() ? 1 : 0) +
    (input.readiness ? 1 : 0) +
    (input.plan?.planId.trim() ? 1 : 0) +
    (input.dryRun?.dryRunId.trim() ? 1 : 0) +
    (input.schedule?.scheduleId.trim() ? 1 : 0) +
    (input.launchReceiptId?.trim() ? 1 : 0) +
    (input.mission?.missionId.trim() ? 1 : 0)
  );
}

function scopeOk(
  scope: WorkstreamPilotScope | null,
): scope is WorkstreamPilotScope {
  if (!scope) return false;
  return (
    scope.workstreamId.trim().length > 0 &&
    scope.objective.trim().length > 0 &&
    scope.siteIds.length > 0 &&
    scope.channelIds.length > 0 &&
    scope.pilotScopeLabel.trim().length > 0
  );
}

function readinessOk(
  r: WorkstreamReadinessGates | null,
): r is WorkstreamReadinessGates {
  if (!r) return false;
  return (
    r.connectionsReady === true &&
    r.factsReady === true &&
    r.testsReady === true &&
    r.policyReady === true
  );
}

function planOk(
  plan: WorkstreamPlanEstimate | null,
): plan is WorkstreamPlanEstimate {
  if (!plan) return false;
  return (
    plan.planId.trim().length > 0 &&
    plan.affectedAssetIds.length > 0 &&
    Number.isFinite(plan.estimatedCostMinor) &&
    plan.estimatedCostMinor >= 0
  );
}

function dryRunOk(
  dry: WorkstreamDryRunBundle | null,
): dry is WorkstreamDryRunBundle {
  if (!dry) return false;
  return (
    dry.dryRunId.trim().length > 0 &&
    dry.rehearsalPassed === true &&
    dry.externalEffectsClaimed === "NONE"
  );
}

function scheduleOk(
  sched: WorkstreamScheduleSelection | null,
): sched is WorkstreamScheduleSelection {
  if (!sched) return false;
  return (
    sched.scheduleId.trim().length > 0 &&
    VALID_FREQUENCIES.has(sched.frequency) &&
    sched.timezone.trim().length > 0 &&
    Number.isFinite(sched.changeCooldownHours) &&
    sched.changeCooldownHours >= 1 &&
    Number.isInteger(sched.localHour) &&
    sched.localHour >= 0 &&
    sched.localHour <= 23 &&
    Number.isInteger(sched.localMinute) &&
    sched.localMinute >= 0 &&
    sched.localMinute <= 59
  );
}

function missionOk(
  mission: WorkstreamMissionOutcome | null,
): mission is WorkstreamMissionOutcome {
  if (!mission) return false;
  return (
    mission.missionId.trim().length > 0 &&
    mission.completed === true &&
    mission.outcomeSummary.trim().length > 0 &&
    mission.nextAction.trim().length > 0
  );
}

/**
 * Evaluate the T-F13 launch-workstream-recurring-schedule path offline.
 * Complete F13 evidence package → LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateLaunchWorkstreamRecurringSchedule(
  input: LaunchWorkstreamRecurringScheduleInput,
): LaunchWorkstreamRecurringScheduleDecision {
  const base = {
    recurringScheduleVisible: false as const,
    missionOutcomeRecorded: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const scope = input.scope;
  const readiness = input.readiness;
  const plan = input.plan;
  const dryRun = input.dryRun;
  const schedule = input.schedule;
  const mission = input.mission;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_PILOT_SCOPE"
      | "AWAITING_READINESS_GATES"
      | "AWAITING_PLAN_ESTIMATE"
      | "AWAITING_DRY_RUN"
      | "AWAITING_SCHEDULE_SELECTION"
      | "AWAITING_OWNER_REVIEW"
      | "AWAITING_MISSION_OUTCOME",
    recoveryPath:
      | "CHOOSE_OBJECTIVE_AND_PILOT_SCOPE"
      | "COMPLETE_READINESS_GATES"
      | "PROVIDE_PLAN_AFFECTED_ASSETS_COST"
      | "RUN_DRY_REHEARSAL_EXTERNAL_EFFECTS_NONE"
      | "SELECT_FREQUENCY_TIMEZONE_COOLDOWN"
      | "OWNER_REVIEW_AND_LAUNCH_RECEIPT"
      | "RECORD_MISSION_OUTCOME_AND_NEXT_ACTION"
      | "KEEP_FIXTURE_LAUNCH_NO_LIVE_PROVIDER",
  ): NonNullable<
    Extract<
      LaunchWorkstreamRecurringScheduleDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    workstreamId: scope?.workstreamId.trim() || null,
    objective: scope?.objective.trim() || null,
    pilotScopeLabel: scope?.pilotScopeLabel.trim() || null,
    siteCount: scope?.siteIds.length ?? 0,
    channelCount: scope?.channelIds.length ?? 0,
    connectionsReady: readiness?.connectionsReady === true,
    factsReady: readiness?.factsReady === true,
    testsReady: readiness?.testsReady === true,
    policyReady: readiness?.policyReady === true,
    planId: plan?.planId.trim() || null,
    affectedAssetCount: plan?.affectedAssetIds.length ?? 0,
    estimatedCostMinor: plan ? plan.estimatedCostMinor : null,
    dryRunId: dryRun?.dryRunId.trim() || null,
    dryRunExternalEffects:
      dryRun?.externalEffectsClaimed === "NONE" ? "NONE" : null,
    scheduleId: schedule?.scheduleId.trim() || null,
    frequency: schedule?.frequency ?? null,
    timezone: schedule?.timezone.trim() || null,
    changeCooldownHours: schedule ? schedule.changeCooldownHours : null,
    launchReceiptId: input.launchReceiptId?.trim() || null,
    missionId: mission?.missionId.trim() || null,
    outcomeSummary: mission?.outcomeSummary.trim() || null,
    nextAction: mission?.nextAction.trim() || null,
    launchVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live workstream recurring-schedule launch remains NOT_WIRED — refuse live wiring (T-F13)",
      ],
    };
  }

  if (input.claimLiveVerifiedLaunch) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_LAUNCH_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified workstream launch claim offline (T-F13) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.requestBurstRepublish) {
    return {
      allowed: false,
      code: "BURST_REPUBLISH_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "BURST_REPUBLISH_REFUSED",
        "BLOCKED",
        "KEEP_FIXTURE_LAUNCH_NO_LIVE_PROVIDER",
      ),
      reasons: [
        "Burst republish on launch is refused — enable a single reviewed schedule only (T-F13); coalesce/no-burst is T-US-026",
      ],
    };
  }

  if (!input.packageId.trim() || !scopeOk(scope)) {
    return {
      allowed: false,
      code: "PILOT_SCOPE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PILOT_SCOPE_INCOMPLETE",
        "AWAITING_PILOT_SCOPE",
        "CHOOSE_OBJECTIVE_AND_PILOT_SCOPE",
      ),
      reasons: [
        "F13 requires package id and complete pilot scope (workstream, objective, sites, channels, pilot scope label) (T-F13)",
      ],
    };
  }

  if (!readinessOk(readiness)) {
    return {
      allowed: false,
      code: "READINESS_GATES_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "READINESS_GATES_INCOMPLETE",
        "AWAITING_READINESS_GATES",
        "COMPLETE_READINESS_GATES",
      ),
      reasons: [
        "F13 requires readiness gates: connections, facts, tests, and policy ready (T-F13)",
      ],
    };
  }

  if (!planOk(plan)) {
    return {
      allowed: false,
      code: "PLAN_ESTIMATE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PLAN_ESTIMATE_INCOMPLETE",
        "AWAITING_PLAN_ESTIMATE",
        "PROVIDE_PLAN_AFFECTED_ASSETS_COST",
      ),
      reasons: [
        "F13 requires plan with planId, affected assets, and non-negative estimated cost (T-F13)",
      ],
    };
  }

  if (!dryRunOk(dryRun)) {
    return {
      allowed: false,
      code: "DRY_RUN_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DRY_RUN_INCOMPLETE",
        "AWAITING_DRY_RUN",
        "RUN_DRY_REHEARSAL_EXTERNAL_EFFECTS_NONE",
      ),
      reasons: [
        "F13 requires dry rehearsal with dryRunId, passed rehearsal, and externalEffectsClaimed=NONE (T-F13)",
      ],
    };
  }

  if (!scheduleOk(schedule)) {
    return {
      allowed: false,
      code: "SCHEDULE_SELECTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SCHEDULE_SELECTION_INCOMPLETE",
        "AWAITING_SCHEDULE_SELECTION",
        "SELECT_FREQUENCY_TIMEZONE_COOLDOWN",
      ),
      reasons: [
        "F13 requires schedule id, frequency, timezone, changeCooldownHours>=1, and valid local time (T-F13)",
      ],
    };
  }

  if (!input.ownerReviewed || !input.launchReceiptId?.trim()) {
    return {
      allowed: false,
      code: "OWNER_REVIEW_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OWNER_REVIEW_INCOMPLETE",
        "AWAITING_OWNER_REVIEW",
        "OWNER_REVIEW_AND_LAUNCH_RECEIPT",
      ),
      reasons: [
        "F13 requires owner review and launch receipt to enable the workstream (T-F13)",
      ],
    };
  }

  if (!missionOk(mission)) {
    return {
      allowed: false,
      code: "MISSION_OUTCOME_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MISSION_OUTCOME_INCOMPLETE",
        "AWAITING_MISSION_OUTCOME",
        "RECORD_MISSION_OUTCOME_AND_NEXT_ACTION",
      ),
      reasons: [
        "F13 requires missionId, completed=true, outcomeSummary, and nextAction (T-F13)",
      ],
    };
  }

  return {
    allowed: true,
    code: "LAUNCH_WORKSTREAM_RECURRING_SCHEDULE_EVIDENCE_RECORDED",
    ...base,
    recurringScheduleVisible: true,
    missionOutcomeRecorded: true,
    evidence: {
      packageId: input.packageId.trim(),
      workstreamId: scope.workstreamId.trim(),
      objective: scope.objective.trim(),
      pilotScopeLabel: scope.pilotScopeLabel.trim(),
      siteCount: scope.siteIds.length,
      channelCount: scope.channelIds.length,
      connectionsReady: true,
      factsReady: true,
      testsReady: true,
      policyReady: true,
      planId: plan.planId.trim(),
      affectedAssetCount: plan.affectedAssetIds.length,
      estimatedCostMinor: plan.estimatedCostMinor,
      dryRunId: dryRun.dryRunId.trim(),
      dryRunExternalEffects: "NONE",
      scheduleId: schedule.scheduleId.trim(),
      frequency: schedule.frequency,
      timezone: schedule.timezone.trim(),
      changeCooldownHours: schedule.changeCooldownHours,
      launchReceiptId: input.launchReceiptId.trim(),
      missionId: mission.missionId.trim(),
      outcomeSummary: mission.outcomeSummary.trim(),
      nextAction: mission.nextAction.trim(),
      launchVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F13_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "WORKSTREAM_RECURRING_SCHEDULE_LAUNCHED",
      recoveryPath: "KEEP_FIXTURE_LAUNCH_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F13 evidence package recorded (objective + pilot scope, readiness gates, plan/assets/cost, dry rehearsal with externalEffects NONE, frequency/timezone/cooldown, owner-reviewed launch receipt, mission outcome + next action); recurring schedule visible; live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}

export {
  WorkstreamScheduleFrequency,
  type WorkstreamScheduleFrequencyValue,
  type WorkstreamPilotScope,
  type WorkstreamReadinessGates,
  type WorkstreamPlanEstimate,
  type WorkstreamDryRunBundle,
  type WorkstreamScheduleSelection,
  type WorkstreamMissionOutcome,
};
