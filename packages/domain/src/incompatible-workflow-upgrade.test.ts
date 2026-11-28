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

  it("blocks RUNNING on breakingRevision mismatch only (T-X067 S36)", () => {
    const instance = baseInstance({
      workflowId: "wf-running-rev",
      breakingRevision: 0,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
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
    expect(decision.temporalWiring).toBe("NOT_WIRED");
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

  it("retains pin on IDLE epoch mismatch without breakingChange (T-X067 S37)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-epoch",
      phase: WorkflowInstancePhase.IDLE,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(false);
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
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
    expect(decision.reasons.some((r) => r.includes("compatibilityEpoch"))).toBe(
      true,
    );
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("retains pin on IDLE breakingRevision mismatch only (T-X067 S39)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-rev",
      phase: WorkflowInstancePhase.IDLE,
      breakingRevision: 0,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(false);
    expect(
      classifyWorkflowIncompatibility(instance.pin, {
        definitionVersion: "1.1.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 3,
        breakingChange: false,
      }),
    ).toBe("breaking_revision_mismatch");
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.1.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 3,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.retainedPin.breakingRevision).toBe(0);
    expect(decision.reasons.some((r) => r.includes("breakingRevision"))).toBe(
      true,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("retains pin on COMPLETE breakingRevision mismatch only (T-X067 S40)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-rev",
      phase: WorkflowInstancePhase.COMPLETE,
      breakingRevision: 1,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 4,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.retainedPin.breakingRevision).toBe(1);
    expect(decision.reasons.some((r) => r.includes("breakingRevision"))).toBe(
      true,
    );
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("blocks APPLYING on breakingRevision mismatch only (T-X067 S41)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-rev",
      phase: WorkflowInstancePhase.APPLYING,
      breakingRevision: 0,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.2.0",
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
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("applies compatible upgrade on APPLYING within epoch (T-X067 S42)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-compat",
      phase: WorkflowInstancePhase.APPLYING,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.3.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.upgradeApplied).toBe(true);
    expect(decision.instance.pin.definitionVersion).toBe("1.3.0");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("applies compatible upgrade on IDLE within epoch (T-X067 S43)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-compat",
      phase: WorkflowInstancePhase.IDLE,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.4.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.pin.definitionVersion).toBe("1.4.0");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("stamps updatedAtIso when RUNNING block retains pin (T-X067 S45)", () => {
    const instance = baseInstance({
      workflowId: "wf-running-stamp",
      phase: WorkflowInstancePhase.RUNNING,
    });
    const blockedAt = "2026-11-22T20:30:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: blockedAt,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.instance.pin.definitionVersion).toBe("1.0.0");
    expect(decision.instance.updatedAtIso).toBe(blockedAt);
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
  });

  it("applies patch upgrade on IDLE and stamps updatedAtIso (T-X067 S46)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-patch",
      phase: WorkflowInstancePhase.IDLE,
    });
    const appliedAt = "2026-11-22T21:00:00.000Z";
    expect(
      classifyWorkflowIncompatibility(instance.pin, {
        definitionVersion: "1.0.1",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      }),
    ).toBe(null);
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.0.1",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: appliedAt,
    });
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.pin.definitionVersion).toBe("1.0.1");
    expect(decision.instance.updatedAtIso).toBe(appliedAt);
    expect(decision.upgradeApplied).toBe(true);
  });

  it("stamps updatedAtIso on COMPLETE patch apply (T-X067 S47)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-patch-stamp",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    const appliedAt = "2026-11-22T21:15:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.0.2",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: appliedAt,
    });
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.pin.definitionVersion).toBe("1.0.2");
    expect(decision.instance.updatedAtIso).toBe(appliedAt);
    expect(decision.retainedPin.definitionId).toBe("def-publish");
  });

  it("applies compatible upgrade on COMPLETE within epoch (T-X067 S44)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-compat",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.5.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.upgradeApplied).toBe(true);
    expect(decision.retainedPin.definitionVersion).toBe("1.5.0");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("retains pin on COMPLETE epoch mismatch without breakingChange (T-X067 S38)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-epoch",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(false);
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
    expect(decision.reasons.some((r) => r.includes("compatibilityEpoch"))).toBe(
      true,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("refuses COMPLETE upgrade when breakingChange flag set (T-X067 S31)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-bc",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(false);
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
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
    expect(decision.reasons.some((r) => r.includes("breakingChange"))).toBe(
      true,
    );
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("refuses IDLE upgrade when breakingChange flag set on matching pin (T-X067 S32)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-bc",
      phase: WorkflowInstancePhase.IDLE,
    });
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
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
    expect(decision.reasons.some((r) => r.includes("breakingChange"))).toBe(
      true,
    );
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

  it("blocks APPLYING when breakingChange set on matching pin (T-X067 S33)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-bc",
      phase: WorkflowInstancePhase.APPLYING,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
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
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
    expect(decision.reasons.some((r) => r.includes("breakingChange"))).toBe(
      true,
    );
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("blocks APPLYING on epoch mismatch without breakingChange (T-X067 S35)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-epoch",
      phase: WorkflowInstancePhase.APPLYING,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
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
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
    expect(decision.reasons.some((r) => r.includes("compatibilityEpoch"))).toBe(
      true,
    );
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("blocks RUNNING when breakingChange set on matching pin (T-X067 S34)", () => {
    const instance = baseInstance({
      workflowId: "wf-running-bc",
      phase: WorkflowInstancePhase.RUNNING,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
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
    expect(decision.retainedPin.definitionVersion).toBe("1.0.0");
    expect(decision.reasons.some((r) => r.includes("breakingChange"))).toBe(
      true,
    );
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("leaves updatedAtIso unchanged on IDLE incompatible retain (T-X067 S48)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-no-stamp",
      phase: WorkflowInstancePhase.IDLE,
    });
    const attemptAt = "2026-11-22T22:00:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: attemptAt,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.instance.updatedAtIso).toBe(now);
    expect(decision.instance.updatedAtIso).not.toBe(attemptAt);
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.externalEffects).toBe("NONE");
  });

  it("leaves updatedAtIso unchanged on COMPLETE incompatible retain (T-X067 S49)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-no-stamp",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    const attemptAt = "2026-11-22T22:05:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "3.0.0",
        compatibilityEpoch: "epoch-c",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: attemptAt,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.instance.updatedAtIso).toBe(now);
    expect(decision.instance.updatedAtIso).not.toBe(attemptAt);
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("stamps updatedAtIso when APPLYING block retains pin (T-X067 S50)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-stamp",
      phase: WorkflowInstancePhase.APPLYING,
    });
    const blockedAt = "2026-11-22T22:10:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: blockedAt,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.instance.updatedAtIso).toBe(blockedAt);
    expect(decision.instance.pin.definitionVersion).toBe("1.0.0");
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
  });

  it("matching proposal leaves instance timestamp untouched (T-X067 S51)", () => {
    const instance = baseInstance({
      workflowId: "wf-match-stamp",
      phase: WorkflowInstancePhase.RUNNING,
    });
    const attemptAt = "2026-11-22T22:15:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: attemptAt,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.instance.updatedAtIso).toBe(now);
    expect(decision.instance.updatedAtIso).not.toBe(attemptAt);
  });

  it("classify prefers breakingChange over epoch mismatch (T-X067 S52)", () => {
    const instance = baseInstance({ workflowId: "wf-classify-bc" });
    expect(
      classifyWorkflowIncompatibility(instance.pin, {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: true,
      }),
    ).toBe("breaking_change_flag");
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: true,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.reasons).toContain("proposed.breakingChange=true");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("classify prefers epoch over breakingRevision when both differ (T-X067 S53)", () => {
    const instance = baseInstance({
      workflowId: "wf-classify-epoch",
      breakingRevision: 1,
    });
    expect(
      classifyWorkflowIncompatibility(instance.pin, {
        definitionVersion: "1.2.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 9,
        breakingChange: false,
      }),
    ).toBe("compatibility_epoch_mismatch");
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.2.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 9,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.reasons.some((r) => r.includes("compatibilityEpoch"))).toBe(
      true,
    );
    expect(decision.retainedPin.breakingRevision).toBe(1);
  });

  it("stamps updatedAtIso on RUNNING compatible upgrade (T-X067 S54)", () => {
    const instance = baseInstance({
      workflowId: "wf-running-compat-stamp",
      phase: WorkflowInstancePhase.RUNNING,
    });
    const appliedAt = "2026-11-22T22:20:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.6.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: appliedAt,
    });
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.pin.definitionVersion).toBe("1.6.0");
    expect(decision.instance.updatedAtIso).toBe(appliedAt);
    expect(decision.externalEffects).toBe("NONE");
  });

  it("compatible upgrade preserves definitionId and breakingRevision (T-X067 S55)", () => {
    const instance = baseInstance({
      workflowId: "wf-preserve-pin",
      phase: WorkflowInstancePhase.IDLE,
      breakingRevision: 2,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.7.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 2,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.pin.definitionId).toBe("def-publish");
    expect(decision.instance.pin.breakingRevision).toBe(2);
    expect(decision.retainedPin.definitionId).toBe("def-publish");
    expect(decision.retainedPin.breakingRevision).toBe(2);
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("stamps updatedAtIso on APPLYING compatible upgrade (T-X067 S56)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-compat-stamp",
      phase: WorkflowInstancePhase.APPLYING,
    });
    const appliedAt = "2026-11-22T22:30:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.8.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: appliedAt,
    });
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.pin.definitionVersion).toBe("1.8.0");
    expect(decision.instance.updatedAtIso).toBe(appliedAt);
    expect(decision.externalEffects).toBe("NONE");
  });

  it("IDLE matching proposal leaves timestamp untouched (T-X067 S57)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-match",
      phase: WorkflowInstancePhase.IDLE,
    });
    const attemptAt = "2026-11-22T22:35:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: attemptAt,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.instance.updatedAtIso).toBe(now);
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("COMPLETE matching proposal leaves timestamp untouched (T-X067 S58)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-match",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    const attemptAt = "2026-11-22T22:40:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: attemptAt,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.upgradeApplied).toBe(false);
    expect(decision.instance.updatedAtIso).toBe(now);
    expect(decision.instance.updatedAtIso).not.toBe(attemptAt);
  });

  it("IDLE retain with breakingChange+rev still classifies breakingChange (T-X067 S59)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-multi-cause",
      phase: WorkflowInstancePhase.IDLE,
      breakingRevision: 0,
    });
    expect(
      classifyWorkflowIncompatibility(instance.pin, {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 5,
        breakingChange: true,
      }),
    ).toBe("breaking_change_flag");
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 5,
        breakingChange: true,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.reasons).toContain("proposed.breakingChange=true");
    expect(decision.retainedPin.breakingRevision).toBe(0);
  });

  it("IDLE retain reasons name phase (T-X067 S60)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-phase-reason",
      phase: WorkflowInstancePhase.IDLE,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.reasons.some((r) => r.includes("phase=IDLE"))).toBe(true);
    expect(decision.externalEffects).toBe("NONE");
  });

  it("compatible upgrade keeps compatibilityEpoch from pin (T-X067 S61)", () => {
    const instance = baseInstance({
      workflowId: "wf-epoch-preserve",
      phase: WorkflowInstancePhase.RUNNING,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.9.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.pin.compatibilityEpoch).toBe("epoch-a");
    expect(decision.retainedPin.compatibilityEpoch).toBe("epoch-a");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
  });

  it("APPLYING matching proposal retains without upgrade (T-X067 S62)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-match",
      phase: WorkflowInstancePhase.APPLYING,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
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
    expect(decision.instance.pin.definitionVersion).toBe("1.0.0");
  });

  it("RUNNING block always reports externalEffects NONE (T-X067 S63)", () => {
    const instance = baseInstance({
      workflowId: "wf-running-none",
      phase: WorkflowInstancePhase.RUNNING,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "9.0.0",
        compatibilityEpoch: "epoch-z",
        breakingRevision: 9,
        breakingChange: true,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
    expect(decision.upgradeApplied).toBe(false);
  });

  it("COMPLETE retain reports externalEffects NONE (T-X067 S64)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-retain-none",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 3,
        breakingChange: true,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.temporalWiring).toBe("NOT_WIRED");
    expect(decision.upgradeApplied).toBe(false);
  });

  it("RUNNING matching proposal retains without upgrade (T-X067 S65)", () => {
    const instance = baseInstance({
      workflowId: "wf-running-match",
      phase: WorkflowInstancePhase.RUNNING,
    });
    expect(isWorkflowInFlight(instance.phase)).toBe(true);
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
    expect(decision.instance.updatedAtIso).toBe(now);
  });

  it("COMPLETE retain reasons name phase (T-X067 S66)", () => {
    const instance = baseInstance({
      workflowId: "wf-complete-phase-reason",
      phase: WorkflowInstancePhase.COMPLETE,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.COMPATIBLE_DEFINITION_RETAINED,
    );
    expect(decision.reasons.some((r) => r.includes("phase=COMPLETE"))).toBe(
      true,
    );
    expect(decision.externalEffects).toBe("NONE");
  });

  it("APPLYING block reasons name phase (T-X067 S67)", () => {
    const instance = baseInstance({
      workflowId: "wf-applying-phase-reason",
      phase: WorkflowInstancePhase.APPLYING,
    });
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "2.0.0",
        compatibilityEpoch: "epoch-b",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: now,
    });
    expect(decision.code).toBe(
      WorkflowUpgradeCode.INCOMPATIBLE_UPGRADE_BLOCKED,
    );
    expect(decision.reasons.some((r) => r.includes("phase=APPLYING"))).toBe(
      true,
    );
    expect(decision.temporalWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
  });

  it("stamps updatedAtIso on IDLE compatible upgrade (T-X067 S68)", () => {
    const instance = baseInstance({
      workflowId: "wf-idle-compat-stamp",
      phase: WorkflowInstancePhase.IDLE,
    });
    const appliedAt = "2026-11-22T23:00:00.000Z";
    const decision = evaluateWorkflowDefinitionUpgrade({
      instance,
      proposed: {
        definitionVersion: "1.3.0",
        compatibilityEpoch: "epoch-a",
        breakingRevision: 0,
        breakingChange: false,
      },
      nowIso: appliedAt,
    });
    expect(decision.code).toBe(WorkflowUpgradeCode.COMPATIBLE_UPGRADE_APPLIED);
    expect(decision.instance.updatedAtIso).toBe(appliedAt);
    expect(decision.externalEffects).toBe("NONE");
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
