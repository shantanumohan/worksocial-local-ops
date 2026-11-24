import { describe, expect, it } from "vitest";
import {
  WORKFLOW_UPGRADE_TEMPORAL_WIRING,
  WorkflowInstancePhase,
  WorkflowUpgradeCode,
  classifyWorkflowIncompatibility,
  createWorkflowInstance,
  evaluateWorkflowDefinitionUpgrade,
  isWorkflowInFlight,
  workflowPinsMatchProposal,
} from "./incompatible-workflow-upgrade.js";

const now = "2026-11-22T19:00:00.000Z";

function baseInstance(
  overrides: Partial<{
    workflowId: string;
    phase: (typeof WorkflowInstancePhase)[keyof typeof WorkflowInstancePhase];
    breakingRevision: number;
  }> = {},
) {
  return createWorkflowInstance({
    workflowId: overrides.workflowId ?? "wf-1",
    definitionId: "def-publish",
    definitionVersion: "1.0.0",
    compatibilityEpoch: "epoch-a",
    breakingRevision: overrides.breakingRevision ?? 0,
    phase: overrides.phase ?? WorkflowInstancePhase.RUNNING,
    nowIso: now,
  });
}

describe("incompatible workflow upgrade (T-X067)", () => {
  it("applies a compatible non-breaking upgrade within the same epoch", () => {
    const instance = baseInstance();
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
    expect(decision.instance.pin.definitionId).toBe("def-publish");
    expect(decision.instance.pin.compatibilityEpoch).toBe("epoch-a");
    expect(decision.instance.pin.breakingRevision).toBe(0);
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.temporalWiring).toBe(WORKFLOW_UPGRADE_TEMPORAL_WIRING);
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("blocks incompatible upgrade on RUNNING and retains compatible pin", () => {
    const instance = baseInstance({ workflowId: "wf-2" });
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
    expect(decision.retainedPin.definitionId).toBe("def-publish");
    expect(decision.instance.pin.definitionVersion).toBe("1.0.0");
    expect(decision.reasons).toContain("proposed.breakingChange=true");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("blocks incompatible upgrade on APPLYING and retains pin", () => {
    const instance = baseInstance({
      workflowId: "wf-applying",
      phase: WorkflowInstancePhase.APPLYING,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: true,
      },
      nowIso: now,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("blocks epoch-only mismatch on RUNNING without breakingChange flag", () => {
    const instance = baseInstance({ workflowId: "wf-epoch" });
    expect(
      classifyWorkflowIncompatibility(instance.pin, {
        definitionVersion: "1.2.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      }),
    ).toBe("compatibility_epoch_mismatch");
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.2.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.reasons.some((r) => r.includes("compatibilityEpoch"))).toBe(
      true,
    );
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
  });

  it("blocks breakingRevision-only mismatch on RUNNING", () => {
    const instance = baseInstance({
      workflowId: "wf-rev",
      breakingRevision: 0,
    });
    expect(
      classifyWorkflowIncompatibility(instance.pin, {
        definitionVersion: "1.1.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 2,
        breakingChange: false,
      }),
    ).toBe("breaking_revision_mismatch");
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.1.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 2,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.retainedPin.breakingRevision).toBe(0);
    expect(decision.reasons.some((r) => r.includes("breakingRevision"))).toBe(
      true,
    );
  });

  it("retains compatible definition when proposal matches pin", () => {
    const instance = baseInstance({ workflowId: "wf-3" });
    expect(
      workflowPinsMatchProposal(instance.pin, {
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      }),
    ).toBe(true);
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
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("refuses incompatible rebind on IDLE and retains pin", () => {
    const instance = baseInstance({
      workflowId: "wf-idle",
      phase: WorkflowInstancePhase.IDLE,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(false);
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
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
    expect(decision.instance.pin.definitionVersion).toBe("1.0.0");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("refuses incompatible rebind on COMPLETE and retains pin", () => {
    const instance = baseInstance({
      workflowId: "wf-complete",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "9.0.0",
        compatibilityEpoch: "epoch-z",
        breakingRevision: 9,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
  });

  it("treats matching pin + breakingChange=true as incompatible while RUNNING", () => {
    const instance = baseInstance({ workflowId: "wf-flag" });
    expect(
      workflowPinsMatchProposal(instance.pin, {
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: true,
      }),
    ).toBe(false);
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: true,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
  });

  it("rejects invalid createWorkflowInstance inputs", () => {
    expect(() =>
      createWorkflowInstance({
        workflowId: "  ",
        definitionId: "def",
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        nowIso: now,
      }),
    ).toThrow(/workflowId/);
    expect(() =>
      createWorkflowInstance({
        workflowId: "wf",
        definitionId: "def",
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: -1,
        nowIso: now,
      }),
    ).toThrow(/breakingRevision/);
  });
});
