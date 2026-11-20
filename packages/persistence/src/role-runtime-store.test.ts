import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OutcomeLabel,
  RoleExecutionMode,
  RoleRunStatus,
  createRoleRunOutcome,
} from "@worksocial/domain";
import {
  createFileRoleRuntimeStore,
  emptyRoleRuntimeState,
} from "./role-runtime-store.js";

describe("role-runtime-store", () => {
  it("starts with 30 never_run roles and NOT_WIRED temporal", () => {
    const state = emptyRoleRuntimeState("2026-11-18T12:00:00.000Z");
    expect(state.roles).toHaveLength(30);
    expect(state.temporalWiring).toBe("NOT_WIRED");
    expect(state.roles.every((r) => r.lastStatus === "never_run")).toBe(true);
  });

  it("records run evidence and learning outcomes", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-role-rt-"));
    const store = createFileRoleRuntimeStore(dir);
    const now = "2026-11-18T12:00:00.000Z";
    const outcome = createRoleRunOutcome({
      outcomeId: "out-1",
      roleId: "A01",
      jobId: "job-1",
      runId: "run-1",
      label: OutcomeLabel.SUCCESS,
      status: RoleRunStatus.SUCCEEDED,
      executionMode: RoleExecutionMode.FIXTURE,
      reason: "ok",
      recordedAtIso: now,
    });
    store.recordRun(
      {
        runId: "run-1",
        jobId: "job-1",
        roleId: "A01",
        workflowId: "wf-1",
        status: RoleRunStatus.SUCCEEDED,
        executionMode: RoleExecutionMode.FIXTURE,
        summary: "ok",
        artifactIds: [],
        cliVersion: null,
        modelId: null,
        permissionBypassUsed: false,
        startedAtIso: now,
        finishedAtIso: now,
        costMinor: 10,
        costKind: "fixture",
        budgetReservationId: "res-1",
      },
      outcome,
    );
    const status = store.getRoleStatus("A01");
    expect(status?.lastRunId).toBe("run-1");
    expect(status?.runCount).toBe(1);
    expect(store.listOutcomesForLearning()).toHaveLength(1);
  });
});
