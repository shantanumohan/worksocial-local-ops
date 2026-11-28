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

  const idleRev = createWorkflowInstance({
    workflowId: `wf-tx067-idle-rev-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 0,
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleRevRetain = evaluateWorkflowDefinitionUpgrade({
    instance: idleRev,
    proposed: {
      definitionVersion: "1.1.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 3,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    !isWorkflowInFlight(idleRev.phase) &&
    idleRevRetain.allowed === false &&
    idleRevRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idleRevRetain.retainedPin.breakingRevision === 0
  ) {
    details.push(
      "S39 IDLE+breakingRevision mismatch → COMPATIBLE_DEFINITION_RETAINED; pin retained",
    );
  } else {
    passed = false;
    details.push(`S39 IDLE+rev unexpectedly ${JSON.stringify(idleRevRetain)}`);
  }

  const completeRev = createWorkflowInstance({
    workflowId: `wf-tx067-complete-rev-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 1,
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeRevRetain = evaluateWorkflowDefinitionUpgrade({
    instance: completeRev,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 4,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    !isWorkflowInFlight(completeRev.phase) &&
    completeRevRetain.allowed === false &&
    completeRevRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completeRevRetain.retainedPin.breakingRevision === 1
  ) {
    details.push(
      "S40 COMPLETE+breakingRevision mismatch → COMPATIBLE_DEFINITION_RETAINED; pin retained",
    );
  } else {
    passed = false;
    details.push(
      `S40 COMPLETE+rev unexpectedly ${JSON.stringify(completeRevRetain)}`,
    );
  }

  const applyingRev = createWorkflowInstance({
    workflowId: `wf-tx067-applying-rev-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 0,
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingRevBlock = evaluateWorkflowDefinitionUpgrade({
    instance: applyingRev,
    proposed: {
      definitionVersion: "1.2.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 2,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(applyingRev.phase) &&
    applyingRevBlock.allowed === false &&
    applyingRevBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    applyingRevBlock.retainedPin.breakingRevision === 0
  ) {
    details.push(
      "S41 APPLYING+breakingRevision mismatch → INCOMPATIBLE_UPGRADE_BLOCKED; pin retained",
    );
  } else {
    passed = false;
    details.push(
      `S41 APPLYING+rev unexpectedly ${JSON.stringify(applyingRevBlock)}`,
    );
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

  const runningStamp = createWorkflowInstance({
    workflowId: `wf-tx067-running-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const stampIso = "2026-11-22T20:30:00.000Z";
  const runningStampBlock = evaluateWorkflowDefinitionUpgrade({
    instance: runningStamp,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: stampIso,
  });
  if (
    runningStampBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    runningStampBlock.instance.updatedAtIso === stampIso &&
    runningStampBlock.instance.pin.definitionVersion === "1.0.0"
  ) {
    details.push(
      "S45 RUNNING block stamps updatedAtIso; pin version unchanged",
    );
  } else {
    passed = false;
    details.push(`S45 RUNNING+stamp unexpectedly ${JSON.stringify(runningStampBlock)}`);
  }

  const idlePatch = createWorkflowInstance({
    workflowId: `wf-tx067-idle-patch-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const patchIso = "2026-11-22T21:00:00.000Z";
  const idlePatchUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: idlePatch,
    proposed: {
      definitionVersion: "1.0.1",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: patchIso,
  });
  if (
    idlePatchUpgrade.code === WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    idlePatchUpgrade.instance.pin.definitionVersion === "1.0.1" &&
    idlePatchUpgrade.instance.updatedAtIso === patchIso
  ) {
    details.push(
      "S46 IDLE patch 1.0.0→1.0.1 COMPATIBLE_UPGRADE_APPLIED; updatedAtIso stamped",
    );
  } else {
    passed = false;
    details.push(`S46 IDLE+patch unexpectedly ${JSON.stringify(idlePatchUpgrade)}`);
  }

  const completePatchStamp = createWorkflowInstance({
    workflowId: `wf-tx067-complete-patch-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const patchStampIso = "2026-11-22T21:15:00.000Z";
  const completePatchStampUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: completePatchStamp,
    proposed: {
      definitionVersion: "1.0.2",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: patchStampIso,
  });
  if (
    completePatchStampUpgrade.code === WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    completePatchStampUpgrade.instance.pin.definitionVersion === "1.0.2" &&
    completePatchStampUpgrade.instance.updatedAtIso === patchStampIso
  ) {
    details.push(
      "S47 COMPLETE patch apply stamps updatedAtIso; definitionId unchanged",
    );
  } else {
    passed = false;
    details.push(
      `S47 COMPLETE+patch-stamp unexpectedly ${JSON.stringify(completePatchStampUpgrade)}`,
    );
  }

  const applyingCompat = createWorkflowInstance({
    workflowId: `wf-tx067-applying-compat-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingCompatUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: applyingCompat,
    proposed: {
      definitionVersion: "1.3.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    applyingCompatUpgrade.allowed === true &&
    applyingCompatUpgrade.code === WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    applyingCompatUpgrade.instance.pin.definitionVersion === "1.3.0"
  ) {
    details.push(
      "S42 APPLYING compatible upgrade → COMPATIBLE_UPGRADE_APPLIED within epoch-a",
    );
  } else {
    passed = false;
    details.push(
      `S42 APPLYING+compat unexpectedly ${JSON.stringify(applyingCompatUpgrade)}`,
    );
  }

  const idleCompat = createWorkflowInstance({
    workflowId: `wf-tx067-idle-compat-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleCompatUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: idleCompat,
    proposed: {
      definitionVersion: "1.4.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    idleCompatUpgrade.allowed === true &&
    idleCompatUpgrade.code === WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    idleCompatUpgrade.instance.pin.definitionVersion === "1.4.0"
  ) {
    details.push(
      "S43 IDLE compatible upgrade → COMPATIBLE_UPGRADE_APPLIED within epoch-a",
    );
  } else {
    passed = false;
    details.push(`S43 IDLE+compat unexpectedly ${JSON.stringify(idleCompatUpgrade)}`);
  }

  const completeCompat = createWorkflowInstance({
    workflowId: `wf-tx067-complete-compat-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeCompatUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: completeCompat,
    proposed: {
      definitionVersion: "1.5.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    completeCompatUpgrade.allowed === true &&
    completeCompatUpgrade.code === WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    completeCompatUpgrade.instance.pin.definitionVersion === "1.5.0"
  ) {
    details.push(
      "S44 COMPLETE compatible upgrade → COMPATIBLE_UPGRADE_APPLIED within epoch-a",
    );
  } else {
    passed = false;
    details.push(
      `S44 COMPLETE+compat unexpectedly ${JSON.stringify(completeCompatUpgrade)}`,
    );
  }

  const idleNoStamp = createWorkflowInstance({
    workflowId: `wf-tx067-idle-no-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleAttemptAt = "2026-11-22T22:00:00.000Z";
  const idleNoStampRetain = evaluateWorkflowDefinitionUpgrade({
    instance: idleNoStamp,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: idleAttemptAt,
  });
  if (
    idleNoStampRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idleNoStampRetain.instance.updatedAtIso === nowIso &&
    idleNoStampRetain.instance.updatedAtIso !== idleAttemptAt
  ) {
    details.push(
      "S48 IDLE incompatible retain leaves updatedAtIso unchanged",
    );
  } else {
    passed = false;
    details.push(
      `S48 IDLE+no-stamp unexpectedly ${JSON.stringify(idleNoStampRetain)}`,
    );
  }

  const completeNoStamp = createWorkflowInstance({
    workflowId: `wf-tx067-complete-no-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeAttemptAt = "2026-11-22T22:05:00.000Z";
  const completeNoStampRetain = evaluateWorkflowDefinitionUpgrade({
    instance: completeNoStamp,
    proposed: {
      definitionVersion: "3.0.0",
      compatibilityEpoch: "epoch-c",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: completeAttemptAt,
  });
  if (
    completeNoStampRetain.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completeNoStampRetain.instance.updatedAtIso === nowIso &&
    completeNoStampRetain.instance.updatedAtIso !== completeAttemptAt
  ) {
    details.push(
      "S49 COMPLETE incompatible retain leaves updatedAtIso unchanged",
    );
  } else {
    passed = false;
    details.push(
      `S49 COMPLETE+no-stamp unexpectedly ${JSON.stringify(completeNoStampRetain)}`,
    );
  }

  const applyingStamp = createWorkflowInstance({
    workflowId: `wf-tx067-applying-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingBlockedAt = "2026-11-22T22:10:00.000Z";
  const applyingStampBlock = evaluateWorkflowDefinitionUpgrade({
    instance: applyingStamp,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: applyingBlockedAt,
  });
  if (
    applyingStampBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    applyingStampBlock.instance.updatedAtIso === applyingBlockedAt &&
    applyingStampBlock.instance.pin.definitionVersion === "1.0.0"
  ) {
    details.push(
      "S50 APPLYING block stamps updatedAtIso; pin version unchanged",
    );
  } else {
    passed = false;
    details.push(
      `S50 APPLYING+stamp unexpectedly ${JSON.stringify(applyingStampBlock)}`,
    );
  }

  const matchStamp = createWorkflowInstance({
    workflowId: `wf-tx067-match-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const matchAttemptAt = "2026-11-22T22:15:00.000Z";
  const matchStampRetain = evaluateWorkflowDefinitionUpgrade({
    instance: matchStamp,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: matchAttemptAt,
  });
  if (
    matchStampRetain.allowed === true &&
    matchStampRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    matchStampRetain.upgradeApplied === false &&
    matchStampRetain.instance.updatedAtIso === nowIso
  ) {
    details.push(
      "S51 matching proposal → COMPATIBLE_DEFINITION_RETAINED; timestamp untouched",
    );
  } else {
    passed = false;
    details.push(
      `S51 match+stamp unexpectedly ${JSON.stringify(matchStampRetain)}`,
    );
  }

  const classifyBcPin = createWorkflowInstance({
    workflowId: `wf-tx067-classify-bc-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const classifyBcCause = classifyWorkflowIncompatibility(classifyBcPin.pin, {
    definitionVersion: "2.0.0",
    compatibilityEpoch: "epoch-b",
    breakingRevision: 0,
    breakingChange: true,
  });
  const classifyBcBlock = evaluateWorkflowDefinitionUpgrade({
    instance: classifyBcPin,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    classifyBcCause === "breaking_change_flag" &&
    classifyBcBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    classifyBcBlock.reasons.includes("proposed.breakingChange=true")
  ) {
    details.push(
      "S52 classify prefers breakingChange over epoch mismatch",
    );
  } else {
    passed = false;
    details.push(
      `S52 classify+bc unexpectedly cause=${classifyBcCause} ${JSON.stringify(classifyBcBlock)}`,
    );
  }

  const classifyEpochPin = createWorkflowInstance({
    workflowId: `wf-tx067-classify-epoch-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 1,
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const classifyEpochCause = classifyWorkflowIncompatibility(
    classifyEpochPin.pin,
    {
      definitionVersion: "1.2.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 9,
      breakingChange: false,
    },
  );
  const classifyEpochBlock = evaluateWorkflowDefinitionUpgrade({
    instance: classifyEpochPin,
    proposed: {
      definitionVersion: "1.2.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 9,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    classifyEpochCause === "compatibility_epoch_mismatch" &&
    classifyEpochBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    classifyEpochBlock.retainedPin.breakingRevision === 1
  ) {
    details.push(
      "S53 classify prefers epoch over breakingRevision when both differ",
    );
  } else {
    passed = false;
    details.push(
      `S53 classify+epoch unexpectedly cause=${classifyEpochCause} ${JSON.stringify(classifyEpochBlock)}`,
    );
  }

  const runningCompatStamp = createWorkflowInstance({
    workflowId: `wf-tx067-running-compat-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const runningCompatAt = "2026-11-22T22:20:00.000Z";
  const runningCompatStampUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: runningCompatStamp,
    proposed: {
      definitionVersion: "1.6.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: runningCompatAt,
  });
  if (
    runningCompatStampUpgrade.code ===
      WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    runningCompatStampUpgrade.instance.pin.definitionVersion === "1.6.0" &&
    runningCompatStampUpgrade.instance.updatedAtIso === runningCompatAt
  ) {
    details.push(
      "S54 RUNNING compatible upgrade stamps updatedAtIso",
    );
  } else {
    passed = false;
    details.push(
      `S54 RUNNING+compat-stamp unexpectedly ${JSON.stringify(runningCompatStampUpgrade)}`,
    );
  }

  const preservePin = createWorkflowInstance({
    workflowId: `wf-tx067-preserve-pin-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 2,
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const preservePinUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: preservePin,
    proposed: {
      definitionVersion: "1.7.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 2,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    preservePinUpgrade.code === WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    preservePinUpgrade.instance.pin.definitionId === "def-fixture-publish" &&
    preservePinUpgrade.instance.pin.breakingRevision === 2 &&
    preservePinUpgrade.retainedPin.breakingRevision === 2
  ) {
    details.push(
      "S55 compatible upgrade preserves definitionId and breakingRevision",
    );
  } else {
    passed = false;
    details.push(
      `S55 preserve-pin unexpectedly ${JSON.stringify(preservePinUpgrade)}`,
    );
  }

  const applyingCompatStamp = createWorkflowInstance({
    workflowId: `wf-tx067-applying-compat-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingCompatAt = "2026-11-22T22:30:00.000Z";
  const applyingCompatStampUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: applyingCompatStamp,
    proposed: {
      definitionVersion: "1.8.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: applyingCompatAt,
  });
  if (
    applyingCompatStampUpgrade.code ===
      WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    applyingCompatStampUpgrade.instance.pin.definitionVersion === "1.8.0" &&
    applyingCompatStampUpgrade.instance.updatedAtIso === applyingCompatAt
  ) {
    details.push(
      "S56 APPLYING compatible upgrade stamps updatedAtIso",
    );
  } else {
    passed = false;
    details.push(
      `S56 APPLYING+compat-stamp unexpectedly ${JSON.stringify(applyingCompatStampUpgrade)}`,
    );
  }

  const idleMatch = createWorkflowInstance({
    workflowId: `wf-tx067-idle-match-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleMatchAt = "2026-11-22T22:35:00.000Z";
  const idleMatchRetain = evaluateWorkflowDefinitionUpgrade({
    instance: idleMatch,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: idleMatchAt,
  });
  if (
    idleMatchRetain.allowed === true &&
    idleMatchRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idleMatchRetain.upgradeApplied === false &&
    idleMatchRetain.instance.updatedAtIso === nowIso
  ) {
    details.push(
      "S57 IDLE matching proposal → COMPATIBLE_DEFINITION_RETAINED; timestamp untouched",
    );
  } else {
    passed = false;
    details.push(
      `S57 IDLE+match unexpectedly ${JSON.stringify(idleMatchRetain)}`,
    );
  }

  const completeMatch = createWorkflowInstance({
    workflowId: `wf-tx067-complete-match-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeMatchAt = "2026-11-22T22:40:00.000Z";
  const completeMatchRetain = evaluateWorkflowDefinitionUpgrade({
    instance: completeMatch,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: completeMatchAt,
  });
  if (
    completeMatchRetain.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completeMatchRetain.upgradeApplied === false &&
    completeMatchRetain.instance.updatedAtIso === nowIso
  ) {
    details.push(
      "S58 COMPLETE matching proposal → COMPATIBLE_DEFINITION_RETAINED; timestamp untouched",
    );
  } else {
    passed = false;
    details.push(
      `S58 COMPLETE+match unexpectedly ${JSON.stringify(completeMatchRetain)}`,
    );
  }

  const idleMulti = createWorkflowInstance({
    workflowId: `wf-tx067-idle-multi-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 0,
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleMultiCause = classifyWorkflowIncompatibility(idleMulti.pin, {
    definitionVersion: "2.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: 5,
    breakingChange: true,
  });
  const idleMultiRetain = evaluateWorkflowDefinitionUpgrade({
    instance: idleMulti,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 5,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    idleMultiCause === "breaking_change_flag" &&
    idleMultiRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idleMultiRetain.reasons.includes("proposed.breakingChange=true") &&
    idleMultiRetain.retainedPin.breakingRevision === 0
  ) {
    details.push(
      "S59 IDLE multi-cause classifies breakingChange; pin rev retained",
    );
  } else {
    passed = false;
    details.push(
      `S59 IDLE+multi unexpectedly cause=${idleMultiCause} ${JSON.stringify(idleMultiRetain)}`,
    );
  }

  const idlePhaseReason = createWorkflowInstance({
    workflowId: `wf-tx067-idle-phase-reason-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idlePhaseRetain = evaluateWorkflowDefinitionUpgrade({
    instance: idlePhaseReason,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    idlePhaseRetain.code === WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    idlePhaseRetain.reasons.some((r) => r.includes("phase=IDLE"))
  ) {
    details.push("S60 IDLE retain reasons name phase=IDLE");
  } else {
    passed = false;
    details.push(
      `S60 IDLE+phase-reason unexpectedly ${JSON.stringify(idlePhaseRetain)}`,
    );
  }

  const epochPreserve = createWorkflowInstance({
    workflowId: `wf-tx067-epoch-preserve-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const epochPreserveUpgrade = evaluateWorkflowDefinitionUpgrade({
    instance: epochPreserve,
    proposed: {
      definitionVersion: "1.9.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    epochPreserveUpgrade.code ===
      WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    epochPreserveUpgrade.instance.pin.compatibilityEpoch === "epoch-a" &&
    epochPreserveUpgrade.retainedPin.compatibilityEpoch === "epoch-a"
  ) {
    details.push(
      "S61 compatible upgrade keeps compatibilityEpoch from pin",
    );
  } else {
    passed = false;
    details.push(
      `S61 epoch-preserve unexpectedly ${JSON.stringify(epochPreserveUpgrade)}`,
    );
  }

  const applyingMatch = createWorkflowInstance({
    workflowId: `wf-tx067-applying-match-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingMatchRetain = evaluateWorkflowDefinitionUpgrade({
    instance: applyingMatch,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(applyingMatch.phase) &&
    applyingMatchRetain.allowed === true &&
    applyingMatchRetain.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    applyingMatchRetain.upgradeApplied === false
  ) {
    details.push(
      "S62 APPLYING matching proposal → COMPATIBLE_DEFINITION_RETAINED; no upgrade",
    );
  } else {
    passed = false;
    details.push(
      `S62 APPLYING+match unexpectedly ${JSON.stringify(applyingMatchRetain)}`,
    );
  }

  const runningNone = createWorkflowInstance({
    workflowId: `wf-tx067-running-none-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const runningNoneBlock = evaluateWorkflowDefinitionUpgrade({
    instance: runningNone,
    proposed: {
      definitionVersion: "9.0.0",
      compatibilityEpoch: "epoch-z",
      breakingRevision: 9,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    runningNoneBlock.code === WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    runningNoneBlock.externalEffects === "NONE" &&
    runningNoneBlock.temporalWiring === WORKFLOW_UPGRADE_TEMPORAL_WIRING &&
    runningNoneBlock.upgradeApplied === false
  ) {
    details.push(
      "S63 RUNNING block externalEffects=NONE temporalWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `S63 RUNNING+none unexpectedly ${JSON.stringify(runningNoneBlock)}`,
    );
  }

  const completeRetainNone = createWorkflowInstance({
    workflowId: `wf-tx067-complete-none-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completeRetainNoneDecision = evaluateWorkflowDefinitionUpgrade({
    instance: completeRetainNone,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 3,
      breakingChange: true,
    },
    nowIso,
  });
  if (
    completeRetainNoneDecision.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completeRetainNoneDecision.externalEffects === "NONE" &&
    completeRetainNoneDecision.upgradeApplied === false
  ) {
    details.push("S64 COMPLETE retain externalEffects=NONE");
  } else {
    passed = false;
    details.push(
      `S64 COMPLETE+retain unexpectedly ${JSON.stringify(completeRetainNoneDecision)}`,
    );
  }

  const runningMatch = createWorkflowInstance({
    workflowId: `wf-tx067-running-match-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.RUNNING,
    nowIso,
  });
  const runningMatchRetain = evaluateWorkflowDefinitionUpgrade({
    instance: runningMatch,
    proposed: {
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    isWorkflowInFlight(runningMatch.phase) &&
    runningMatchRetain.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    runningMatchRetain.upgradeApplied === false
  ) {
    details.push("S65 RUNNING matching proposal → retain; no upgrade");
  } else {
    passed = false;
    details.push(
      `S65 RUNNING+match unexpectedly ${JSON.stringify(runningMatchRetain)}`,
    );
  }

  const completePhaseReason = createWorkflowInstance({
    workflowId: `wf-tx067-complete-phase-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.COMPLETE,
    nowIso,
  });
  const completePhaseReasonDecision = evaluateWorkflowDefinitionUpgrade({
    instance: completePhaseReason,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    completePhaseReasonDecision.code ===
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED &&
    completePhaseReasonDecision.reasons.some((r) => r.includes("phase=COMPLETE"))
  ) {
    details.push("S66 COMPLETE retain reasons name phase=COMPLETE");
  } else {
    passed = false;
    details.push(
      `S66 COMPLETE+phase unexpectedly ${JSON.stringify(completePhaseReasonDecision)}`,
    );
  }

  const applyingPhaseReason = createWorkflowInstance({
    workflowId: `wf-tx067-applying-phase-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.APPLYING,
    nowIso,
  });
  const applyingPhaseReasonDecision = evaluateWorkflowDefinitionUpgrade({
    instance: applyingPhaseReason,
    proposed: {
      definitionVersion: "2.0.0",
      compatibilityEpoch: "epoch-b",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso,
  });
  if (
    applyingPhaseReasonDecision.code ===
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED &&
    applyingPhaseReasonDecision.reasons.some((r) =>
      r.includes("phase=APPLYING"),
    ) &&
    applyingPhaseReasonDecision.externalEffects === "NONE"
  ) {
    details.push("S67 APPLYING block reasons name phase=APPLYING");
  } else {
    passed = false;
    details.push(
      `S67 APPLYING+phase unexpectedly ${JSON.stringify(applyingPhaseReasonDecision)}`,
    );
  }

  const idleCompatStamp = createWorkflowInstance({
    workflowId: `wf-tx067-idle-stamp-${randomUUID().slice(0, 8)}`,
    definitionId: "def-fixture-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    phase: WorkflowInstancePhase.IDLE,
    nowIso,
  });
  const idleCompatStampIso = "2026-11-22T23:00:00.000Z";
  const idleCompatStampDecision = evaluateWorkflowDefinitionUpgrade({
    instance: idleCompatStamp,
    proposed: {
      definitionVersion: "1.3.0",
      compatibilityEpoch: "epoch-a",
      breakingRevision: 0,
      breakingChange: false,
    },
    nowIso: idleCompatStampIso,
  });
  if (
    idleCompatStampDecision.code ===
      WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED &&
    idleCompatStampDecision.instance.updatedAtIso === idleCompatStampIso
  ) {
    details.push("S68 IDLE compatible upgrade stamps updatedAtIso");
  } else {
    passed = false;
    details.push(
      `S68 IDLE+stamp unexpectedly ${JSON.stringify(idleCompatStampDecision)}`,
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
