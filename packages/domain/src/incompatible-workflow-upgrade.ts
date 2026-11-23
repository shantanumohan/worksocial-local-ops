/**
 * T-X067 — Incompatible workflow upgrade: blocked or compatible retained.
 *
 * An in-flight workflow instance is pinned to a definition version +
 * compatibilityEpoch. A non-breaking upgrade within the same epoch may apply.
 * A breaking / cross-epoch proposal against RUNNING or APPLYING work is
 * blocked; the compatible pin is retained (never silently rebound).
 *
 * Pure domain. External effects: NONE. No Temporal/network/credentials.
 */

export const INCOMPATIBLE_WORKFLOW_UPGRADE_RELATED_CASE_IDS = [
  "T-X067",
] as const;

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
};

function isInFlight(phase: WorkflowInstancePhaseValue): boolean {
  return (
    phase === WorkflowInstancePhase.RUNNING ||
    phase === WorkflowInstancePhase.APPLYING
  );
}

function isIncompatible(
  current: WorkflowDefinitionPin,
  proposed: ProposedWorkflowDefinition,
): boolean {
  if (proposed.breakingChange) {
    return true;
  }
  if (proposed.compatibilityEpoch !== current.compatibilityEpoch) {
    return true;
  }
  if (proposed.breakingRevision !== current.breakingRevision) {
    return true;
  }
  return false;
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

  if (
    proposed.definitionVersion === current.definitionVersion &&
    proposed.compatibilityEpoch === current.compatibilityEpoch &&
    proposed.breakingRevision === current.breakingRevision &&
    !proposed.breakingChange
  ) {
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
    };
  }

  if (isIncompatible(current, proposed) && isInFlight(instance.phase)) {
    return {
      allowed: false,
      code: WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
      reasons: [
        `Incompatible upgrade blocked for in-flight phase=${instance.phase}`,
        `Retained compatible pin definitionVersion=${current.definitionVersion} epoch=${current.compatibilityEpoch}`,
        proposed.breakingChange
          ? "proposed.breakingChange=true"
          : `epoch/breakingRevision mismatch (proposed epoch=${proposed.compatibilityEpoch} rev=${proposed.breakingRevision})`,
      ],
      retainedPin: { ...current },
      instance: {
        ...instance,
        // Explicit retain — pin unchanged; timestamp notes the blocked attempt.
        updatedAtIso: nowIso,
      },
      upgradeApplied: false,
      externalEffects: "NONE",
    };
  }

  if (isIncompatible(current, proposed) && !isInFlight(instance.phase)) {
    // Idle/complete: still refuse silent incompatible rebind; retain pin.
    return {
      allowed: false,
      code: WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
      reasons: [
        `Incompatible proposal refused for phase=${instance.phase}; compatible definition retained`,
        `pin definitionVersion=${current.definitionVersion} unchanged`,
      ],
      retainedPin: { ...current },
      instance,
      upgradeApplied: false,
      externalEffects: "NONE",
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
  };
}
