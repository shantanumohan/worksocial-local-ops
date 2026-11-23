/**
 * Fixture proof for T-X067 — Incompatible workflow upgrade.
 * Blocked or compatible retained. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  WorkflowInstancePhase,
  WorkflowUpgradeCode,
  createWorkflowInstance,
  evaluateWorkflowDefinitionUpgrade,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X067 fixture ACCEPTED.
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
    compatible.externalEffects === "NONE"
  ) {
    details.push(
      "Compatible 1.0.0→1.1.0 within epoch-a → COMPATIBLE_UPGRADE_APPLIED",
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
    blocked.externalEffects === "NONE"
  ) {
    details.push(
      "Incompatible 2.0.0/epoch-b on RUNNING → INCOMPATIBLE_UPGRADE_BLOCKED; compatible 1.0.0/epoch-a retained",
    );
  } else {
    passed = false;
    details.push(`Incompatible block unexpectedly ${JSON.stringify(blocked)}`);
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
    retained.retainedPin.definitionVersion === "1.0.0"
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

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
