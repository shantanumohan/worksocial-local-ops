import { describe, expect, it } from "vitest";
import {
  WorkflowInstancePhase,
  WorkflowUpgradeCode,
  createWorkflowInstance,
  evaluateWorkflowDefinitionUpgrade,
} from "./incompatible-workflow-upgrade.js";

const now = "2026-11-22T19:00:00.000Z";

describe("incompatible workflow upgrade (T-X067)", () => {
  it("applies a compatible non-breaking upgrade within the same epoch", () => {
    const instance = createWorkflowInstance({
      workflowId: "wf-1",
      definitionId: "def-publish",
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      phase: WorkflowInstancePhase.RUNNING,
      nowIso: now,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.1.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.upgradeApplied).toBe(true);
    expect(decision.instance.pin.definitionVersion).toBe("1.1.0");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("blocks incompatible upgrade on RUNNING and retains compatible pin", () => {
    const instance = createWorkflowInstance({
      workflowId: "wf-2",
      definitionId: "def-publish",
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      phase: WorkflowInstancePhase.RUNNING,
      nowIso: now,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 1,
        breakingChange: true,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
    expect(decision.instance.pin.definitionVersion).toBe("1.0.0");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("retains compatible definition when proposal matches pin", () => {
    const instance = createWorkflowInstance({
      workflowId: "wf-3",
      definitionId: "def-publish",
      definitionVersion: "1.0.0",
      compatibilityEpoch: "epoch-a",
      nowIso: now,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.upgradeApplied).toBe(false);
  });
});
