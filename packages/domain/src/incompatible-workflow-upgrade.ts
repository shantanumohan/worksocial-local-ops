/**
 * T-X067 — Incompatible workflow upgrade: blocked or compatible retained.
 *
 * An in-flight workflow instance is pinned to a definition version +
 * compatibilityEpoch. A non-breaking upgrade within the same epoch may apply.
 * A breaking / cross-epoch / breakingRevision proposal against RUNNING or
 * APPLYING work is blocked; the compatible pin is retained (never silently
 * rebound). IDLE/COMPLETE also refuse incompatible rebinds (retain pin).
 *
 * Pure domain. External effects: NONE. Temporal/live workflow runtime stays
 * NOT_WIRED. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. No invent past T-X073.
 */

export const INCOMPATIBLE_WORKFLOW_UPGRADE_RELATED_CASE_IDS = [
  "T-X067",
] as const;

/** Live Temporal / workflow-runtime wiring — always NOT_WIRED offline. */
export const WORKFLOW_UPGRADE_TEMPORAL_WIRING = "NOT_WIRED" as const;

export const WorkflowInstancePhase = {
  IDLE: "IDLE",
  RUNNING: "RUNNING",
  APPLYING: "APPLYING",
  COMPLETE: "COMPLETE",
} as const;

export type WorkflowInstancePhaseValue =
  (typeof WorkflowInstancePhase)[keyof typeof WorkflowInstancePhase];

export type WorkflowDefinitionPin = {
  definitionId: string;
  definitionVersion: string;
  /** Same epoch ⇒ non-breaking lineage; change implies incompatible upgrade. */
  compatibilityEpoch: string;
  breakingRevision: number;
};

export type WorkflowInstanceRecord = {
  workflowId: string;
  phase: WorkflowInstancePhaseValue;
  pin: WorkflowDefinitionPin;
  updatedAtIso: string;
};

export const WorkflowUpgradeCode = {
  COMPATIBLE_UPGRADE_APPLIED: "COMPATIBLE_UPGRADE_APPLIED",
  INCOMPATIBLE_UPGRADE_BLOCKED: "INCOMPATIBLE_UPGRADE_BLOCKED",
  COMPATIBLE_DEFINITION_RETAINED: "COMPATIBLE_DEFINITION_RETAINED",
} as const;

export type WorkflowUpgradeCodeValue =
  (typeof WorkflowUpgradeCode)[keyof typeof WorkflowUpgradeCode];

export type ProposedWorkflowDefinition = {
  definitionVersion: string;
  compatibilityEpoch: string;
  breakingRevision: number;
  /** Explicit breaking flag — true when handlers/schema change incompatibly. */
  breakingChange: boolean;
};

export type WorkflowUpgradeDecision = {
  allowed: boolean;
  code: WorkflowUpgradeCodeValue;
  reasons: string[];
  /** Pin after evaluation — always the compatible retained pin when blocked. */
  retainedPin: WorkflowDefinitionPin;
  instance: WorkflowInstanceRecord;
  upgradeApplied: boolean;
  externalEffects: "NONE";
  /** Live Temporal remains NOT_WIRED for fixture soak. */
  temporalWiring: typeof WORKFLOW_UPGRADE_TEMPORAL_WIRING;
};

export function isWorkflowInFlight(
  phase: WorkflowInstancePhaseValue,
): boolean {
  return (
    phase === WorkflowInstancePhase.RUNNING ||
    phase === WorkflowInstancePhase.APPLYING
  );
}

export function workflowPinsMatchProposal(
  current: WorkflowDefinitionPin,
  proposed: ProposedWorkflowDefinition,
): boolean {
  return (
    proposed.definitionVersion === current.definitionVersion &&
    proposed.compatibilityEpoch === current.compatibilityEpoch &&
    proposed.breakingRevision === current.breakingRevision &&
    !proposed.breakingChange
  );
}

export type WorkflowIncompatibilityCause =
  | "breaking_change_flag"
  | "compatibility_epoch_mismatch"
  | "breaking_revision_mismatch"
  | null;

/** First matching incompatibility cause, or null when compatible. */
export function classifyWorkflowIncompatibility(
  current: WorkflowDefinitionPin,
  proposed: ProposedWorkflowDefinition,
): WorkflowIncompatibilityCause {
  if (proposed.breakingChange) {
    return "breaking_change_flag";
  }
  if (proposed.compatibilityEpoch !== current.compatibilityEpoch) {
    return "compatibility_epoch_mismatch";
  }
  if (proposed.breakingRevision !== current.breakingRevision) {
    return "breaking_revision_mismatch";
  }
  return null;
}

function isIncompatible(
  current: WorkflowDefinitionPin,
  proposed: ProposedWorkflowDefinition,
): boolean {
  return classifyWorkflowIncompatibility(current, proposed) !== null;
}

function incompatibilityReasonDetail(
  current: WorkflowDefinitionPin,
  proposed: ProposedWorkflowDefinition,
): string {
  const cause = classifyWorkflowIncompatibility(current, proposed);
  switch (cause) {
    case "breaking_change_flag":
      return "proposed.breakingChange=true";
    case "compatibility_epoch_mismatch":
      return `compatibilityEpoch mismatch (pinned=${current.compatibilityEpoch} proposed=${proposed.compatibilityEpoch})`;
    case "breaking_revision_mismatch":
      return `breakingRevision mismatch (pinned=${current.breakingRevision} proposed=${proposed.breakingRevision})`;
    default:
      return `epoch/breakingRevision mismatch (proposed epoch=${proposed.compatibilityEpoch} rev=${proposed.breakingRevision})`;
  }
}

export function createWorkflowInstance(input: {
  workflowId: string;
  definitionId: string;
  definitionVersion: string;
  compatibilityEpoch: string;
  breakingRevision?: number;
  phase?: WorkflowInstancePhaseValue;
  nowIso: string;
}): WorkflowInstanceRecord {
  if (!input.workflowId.trim()) {
    throw new Error("workflowId is required");
  }
  if (!input.definitionId.trim()) {
    throw new Error("definitionId is required");
  }
  if (!input.definitionVersion.trim()) {
    throw new Error("definitionVersion is required");
  }
  if (!input.compatibilityEpoch.trim()) {
    throw new Error("compatibilityEpoch is required");
  }
  if (
    input.breakingRevision !== undefined &&
    (!Number.isInteger(input.breakingRevision) || input.breakingRevision < 0)
  ) {
    throw new Error("breakingRevision must be a non-negative integer");
  }
  return {
    workflowId: input.workflowId,
    phase: input.phase ?? WorkflowInstancePhase.RUNNING,
    pin: {
      definitionId: input.definitionId,
      definitionVersion: input.definitionVersion,
      compatibilityEpoch: input.compatibilityEpoch,
      breakingRevision: input.breakingRevision ?? 0,
    },
    updatedAtIso: input.nowIso,
  };
}

/**
 * Evaluate a proposed definition upgrade against an in-flight (or idle)
 * workflow instance. Incompatible proposals against RUNNING/APPLYING are
 * blocked with the compatible pin retained.
 */
export function evaluateWorkflowDefinitionUpgrade(input: {
  instance: WorkflowInstanceRecord;
  proposed: ProposedWorkflowDefinition;
  nowIso: string;
}): WorkflowUpgradeDecision {
  const { instance, proposed, nowIso } = input;
  const current = instance.pin;

  if (workflowPinsMatchProposal(current, proposed)) {
    return {
      allowed: true,
      code: WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
      reasons: [
        `Proposal matches pinned definitionVersion=${current.definitionVersion} — no upgrade needed; compatible retained`,
      ],
      retainedPin: { ...current },
      instance,
      upgradeApplied: false,
      externalEffects: "NONE",
      temporalWiring: WORKFLOW_UPGRADE_TEMPORAL_WIRING,
    };
  }

  if (isIncompatible(current, proposed) && isWorkflowInFlight(instance.phase)) {
    return {
      allowed: false,
      code: WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
      reasons: [
        `Incompatible upgrade blocked for in-flight phase=${instance.phase}`,
        `Retained compatible pin definitionVersion=${current.definitionVersion} epoch=${current.compatibilityEpoch}`,
        incompatibilityReasonDetail(current, proposed),
      ],
      retainedPin: { ...current },
      instance: {
        ...instance,
        // Explicit retain — pin unchanged; timestamp notes the blocked attempt.
        updatedAtIso: nowIso,
      },
      upgradeApplied: false,
      externalEffects: "NONE",
      temporalWiring: WORKFLOW_UPGRADE_TEMPORAL_WIRING,
    };
  }

  if (isIncompatible(current, proposed) && !isWorkflowInFlight(instance.phase)) {
    // Idle/complete: still refuse silent incompatible rebind; retain pin.
    return {
      allowed: false,
      code: WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
      reasons: [
        `Incompatible proposal refused for phase=${instance.phase}; compatible definition retained`,
        `pin definitionVersion=${current.definitionVersion} unchanged`,
        incompatibilityReasonDetail(current, proposed),
      ],
      retainedPin: { ...current },
      instance,
      upgradeApplied: false,
      externalEffects: "NONE",
      temporalWiring: WORKFLOW_UPGRADE_TEMPORAL_WIRING,
    };
  }

  // Compatible non-breaking upgrade within same epoch.
  const nextPin: WorkflowDefinitionPin = {
    definitionId: current.definitionId,
    definitionVersion: proposed.definitionVersion,
    compatibilityEpoch: current.compatibilityEpoch,
    breakingRevision: current.breakingRevision,
  };
  const nextInstance: WorkflowInstanceRecord = {
    ...instance,
    pin: nextPin,
    updatedAtIso: nowIso,
  };
  return {
    allowed: true,
    code: WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED,
    reasons: [
      `Compatible upgrade applied ${current.definitionVersion} → ${proposed.definitionVersion} within epoch=${current.compatibilityEpoch}`,
    ],
    retainedPin: nextPin,
    instance: nextInstance,
    upgradeApplied: true,
    externalEffects: "NONE",
    temporalWiring: WORKFLOW_UPGRADE_TEMPORAL_WIRING,
  };
}
