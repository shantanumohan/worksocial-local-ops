/**
 * Fixture proof for T-X067 — Incompatible workflow upgrade.
 * Blocked or compatible retained. External effects: NONE.
 * Temporal wiring: NOT_WIRED. ACCEPTED ≠ VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  WORKFLOW_UPGRADE_TEMPORAL_WIRING,
  WorkflowInstancePhase,
  WorkflowUpgradeCode,
  classifyWorkflowIncompatibility,
  createWorkflowInstance,
  evaluateWorkflowDefinitionUpgrade,
  isWorkflowInFlight,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X067 fixture ACCEPTED.
 * Hillclimb: covers epoch-only, breakingRevision-only, IDLE/COMPLETE retain,
 * APPLYING block, and temporalWiring=NOT_WIRED honesty.
 */
export function proofIncompatibleWorkflowUpgradeBlockedOrRetained(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const base = createWorkflowInstance({
    workflowId: `wf-tx067-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 0,
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });

  // Positive control: compatible non-breaking upgrade within epoch applies.
  const compatible = evaluateWorkflowDefinitionUpgrade({
    instance: base,
    proposed: {
      definitionVersion: "1.1.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    compatible.allowed === true &&
    compatible.code === WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    compatible.upgradeApplied === true &&
    compatible.instance.pin.definitionVersion === "1.1.0" &&
    compatible.instance.pin.definitionId === "def-fixture-publish" &&
    compatible.externalEffects === "NONE" &&
    compatible.temporalWiring === WORKFLOW_UPGRADE_TEMPORAL_WIRING
  ) {
    details.push(
      "Compatible 1.0.0→1.1.0 within epoch-a → COMPATIBLE_UPGRADE_APPLIED; temporalWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Compatible upgrade unexpectedly ${JSON.stringify(compatible)}`);
  }

  // Incompatible breaking upgrade while RUNNING → blocked; pin retained.
  const blocked = evaluateWorkflowDefinitionUpgrade({
    instance: base,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 1,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    blocked.allowed === false &&
    blocked.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    blocked.upgradeApplied === false &&
    blocked.retainedPin.definitionVersion === "1.0.0" &&
    blocked.retainedPin.compatibilityEpoch === "epoch-a" &&
    blocked.instance.pin.definitionVersion === "1.0.0" &&
    blocked.externalEffects === "NONE" &&
    blocked.temporalWiring === "NOT_WIRED"
  ) {
    details.push(
      "Incompatible 2.0.0/epoch-b on RUNNING → INCOMPATIBLE_UPGRADE_BLOCKED; compatible 1.0.0/epoch-a retained",
    );
  } else {
    passed = false;
    details.push(`Incompatible block unexpectedly ${JSON.stringify(blocked)}`);
  }

  // Epoch-only mismatch (no breakingChange flag) still blocked in-flight.
  const epochOnly = evaluateWorkflowDefinitionUpgrade({
    instance: base,
    proposed: {
      definitionVersion: "1.2.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    classifyWorkflowIncompatibility(base.pin, {
      definitionVersion: "1.2.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    }) === "compatibility_epoch_mismatch" &&
    epochOnly.allowed === false &&
    epochOnly.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    epochOnly.retainedPin.compatibilityEpoch === "epoch-a"
  ) {
    details.push(
      "Epoch-only mismatch on RUNNING → INCOMPATIBLE_UPGRADE_BLOCKED; epoch-a retained",
    );
  } else {
    passed = false;
    details.push(`Epoch-only block unexpectedly ${JSON.stringify(epochOnly)}`);
  }

  // breakingRevision-only mismatch blocked in-flight.
  const revOnly = evaluateWorkflowDefinitionUpgrade({
    instance: base,
    proposed: {
      definitionVersion: "1.1.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 3,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    revOnly.allowed === false &&
    revOnly.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    revOnly.retainedPin.breakingRevision === 0
  ) {
    details.push(
      "breakingRevision-only mismatch on RUNNING → INCOMPATIBLE_UPGRADE_BLOCKED; rev 0 retained",
    );
  } else {
    passed = false;
    details.push(`Revision-only block unexpectedly ${JSON.stringify(revOnly)}`);
  }

  // Same-pin proposal retains compatible definition (no silent rebind).
  const retained = evaluateWorkflowDefinitionUpgrade({
    instance: base,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    retained.allowed === true &&
    retained.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    retained.upgradeApplied === false &&
    retained.retainedPin.definitionVersion === "1.0.0" &&
    retained.temporalWiring === "NOT_WIRED"
  ) {
    details.push(
      "Matching proposal → COMPATIBLE_DEFINITION_RETAINED (no silent rebind)",
    );
  } else {
    passed = false;
    details.push(`Retain path unexpectedly ${JSON.stringify(retained)}`);
  }

  // APPLYING phase also blocks incompatible upgrades.
  const applying = createWorkflowInstance({
    workflowId: `wf-tx067-apply-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingBlocked = evaluateWorkflowDefinitionUpgrade({
    instance: applying,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(applying.phase) &&
    applyingBlocked.allowed === false &&
    applyingBlocked.code ===
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    applyingBlocked.retainedPin.definitionVersion === "1.0.0"
  ) {
    details.push(
      "APPLYING + breakingChange → INCOMPATIBLE_UPGRADE_BLOCKED; pin retained",
    );
  } else {
    passed = false;
    details.push(
      `APPLYING block unexpectedly ${JSON.stringify(applyingBlocked)}`,
    );
  }

  // IDLE refuses incompatible rebind (retain; not silent upgrade).
  const idle = createWorkflowInstance({
    workflowId: `wf-tx067-idle-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleRefused = evaluateWorkflowDefinitionUpgrade({
    instance: idle,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 1,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    !isWorkflowInFlight(idle.phase) &&
    idleRefused.allowed === false &&
    idleRefused.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idleRefused.retainedPin.definitionVersion === "1.0.0" &&
    idleRefused.externalEffects === "NONE"
  ) {
    details.push(
      "IDLE incompatible proposal → COMPATIBLE_DEFINITION_RETAINED; no silent rebind",
    );
  } else {
    passed = false;
    details.push(`IDLE retain unexpectedly ${JSON.stringify(idleRefused)}`);
  }

  // COMPLETE likewise retains.
  const complete = createWorkflowInstance({
    workflowId: `wf-tx067-done-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeRefused = evaluateWorkflowDefinitionUpgrade({
    instance: complete,
    proposed: {
      definitionVersion: "3.0.0",
      compatibilityEpoch: "epoch-c",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    completeRefused.allowed === false &&
    completeRefused.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completeRefused.retainedPin.definitionVersion === "1.0.0"
  ) {
    details.push(
      "COMPLETE incompatible proposal → COMPATIBLE_DEFINITION_RETAINED",
    );
  } else {
    passed = false;
    details.push(
      `COMPLETE retain unexpectedly ${JSON.stringify(completeRefused)}`,
    );
  }

  // S31: COMPLETE + breakingChange=true → retain; no silent rebind.
  const completeBreaking = createWorkflowInstance({
    workflowId: `wf-tx067-complete-bc-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeBc = evaluateWorkflowDefinitionUpgrade({
    instance: completeBreaking,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    completeBc.allowed === false &&
    completeBc.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completeBc.retainedPin.definitionVersion === "1.0.0" &&
    completeBc.reasons.some((r) => r.includes("breakingChange"))
  ) {
    details.push(
      "S31 COMPLETE+breakingChange → COMPATIBLE_DEFINITION_RETAINED; pin retained",
    );
  } else {
    passed = false;
    details.push(`S31 COMPLETE+bc unexpectedly ${JSON.stringify(completeBc)}`);
  }

  const idleBreaking = createWorkflowInstance({
    workflowId: `wf-tx067-idle-bc-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleBc = evaluateWorkflowDefinitionUpgrade({
    instance: idleBreaking,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    idleBc.allowed === false &&
    idleBc.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idleBc.retainedPin.definitionVersion === "1.0.0" &&
    idleBc.reasons.some((r) => r.includes("breakingChange"))
  ) {
    details.push(
      "S32 IDLE+breakingChange → COMPATIBLE_DEFINITION_RETAINED; pin retained",
    );
  } else {
    passed = false;
    details.push(`S32 IDLE+bc unexpectedly ${JSON.stringify(idleBc)}`);
  }

  const applyingBreaking = createWorkflowInstance({
    workflowId: `wf-tx067-applying-bc-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingBc = evaluateWorkflowDefinitionUpgrade({
    instance: applyingBreaking,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(applyingBreaking.phase) &&
    applyingBc.allowed === false &&
    applyingBc.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    applyingBc.retainedPin.definitionVersion === "1.0.0"
  ) {
    details.push(
      "S33 APPLYING+breakingChange → INCOMPATIBLE_UPGRADE_BLOCKED; pin retained",
    );
  } else {
    passed = false;
    details.push(
      `S33 APPLYING+bc unexpectedly ${JSON.stringify(applyingBc)}`,
    );
  }

  const applyingEpoch = createWorkflowInstance({
    workflowId: `wf-tx067-applying-epoch-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingEpochBlock = evaluateWorkflowDefinitionUpgrade({
    instance: applyingEpoch,
    proposed: {
      definitionVersion: "1.2.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(applyingEpoch.phase) &&
    applyingEpochBlock.allowed === false &&
    applyingEpochBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    applyingEpochBlock.retainedPin.compatibilityEpoch === "epoch-a"
  ) {
    details.push(
      "S35 APPLYING+epoch mismatch → INCOMPATIBLE_UPGRADE_BLOCKED; pin retained",
    );
  } else {
    passed = false;
    details.push(
      `S35 APPLYING+epoch unexpectedly ${JSON.stringify(applyingEpochBlock)}`,
    );
  }

  const runningRev = createWorkflowInstance({
    workflowId: `wf-tx067-running-rev-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 0,
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const runningRevBlock = evaluateWorkflowDefinitionUpgrade({
    instance: runningRev,
    proposed: {
      definitionVersion: "1.1.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 2,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(runningRev.phase) &&
    runningRevBlock.allowed === false &&
    runningRevBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    runningRevBlock.retainedPin.breakingRevision === 0
  ) {
    details.push(
      "S36 RUNNING+breakingRevision mismatch → INCOMPATIBLE_UPGRADE_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`S36 RUNNING+rev unexpectedly ${JSON.stringify(runningRevBlock)}`);
  }

  const runningBreaking = createWorkflowInstance({
    workflowId: `wf-tx067-running-bc-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const runningBc = evaluateWorkflowDefinitionUpgrade({
    instance: runningBreaking,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(runningBreaking.phase) &&
    runningBc.allowed === false &&
    runningBc.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    runningBc.retainedPin.definitionVersion === "1.0.0" &&
    runningBc.reasons.some((r) => r.includes("breakingChange"))
  ) {
    details.push(
      "S34 RUNNING+breakingChange → INCOMPATIBLE_UPGRADE_BLOCKED; pin retained",
    );
  } else {
    passed = false;
    details.push(`S34 RUNNING+bc unexpectedly ${JSON.stringify(runningBc)}`);
  }

  const idleEpoch = createWorkflowInstance({
    workflowId: `wf-tx067-idle-epoch-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleEpochRetain = evaluateWorkflowDefinitionUpgrade({
    instance: idleEpoch,
    proposed: {
      definitionVersion: "1.2.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    !isWorkflowInFlight(idleEpoch.phase) &&
    idleEpochRetain.allowed === false &&
    idleEpochRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idleEpochRetain.retainedPin.compatibilityEpoch === "epoch-a"
  ) {
    details.push(
      "S37 IDLE+epoch mismatch → COMPATIBLE_DEFINITION_RETAINED; pin retained",
    );
  } else {
    passed = false;
    details.push(`S37 IDLE+epoch unexpectedly ${JSON.stringify(idleEpochRetain)}`);
  }

  const completeEpoch = createWorkflowInstance({
    workflowId: `wf-tx067-complete-epoch-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeEpochRetain = evaluateWorkflowDefinitionUpgrade({
    instance: completeEpoch,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    !isWorkflowInFlight(completeEpoch.phase) &&
    completeEpochRetain.allowed === false &&
    completeEpochRetain.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completeEpochRetain.retainedPin.compatibilityEpoch === "epoch-a"
  ) {
    details.push(
      "S38 COMPLETE+epoch mismatch → COMPATIBLE_DEFINITION_RETAINED; pin retained",
    );
  } else {
    passed = false;
    details.push(
      `S38 COMPLETE+epoch unexpectedly ${JSON.stringify(completeEpochRetain)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE temporalWiring=NOT_WIRED",
  );

  return {
    proofId: `proof-wf-upgrade-${randomUUID()}`,
    kind: SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx067-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
