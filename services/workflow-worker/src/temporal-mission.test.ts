/**
 * Temporal path: crash/restart / no duplicate effects.
 * Uses @temporalio/testing local test server (no Docker required).
 */

import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Worker } from "@temporalio/worker";
import { TestWorkflowEnvironment } from "@temporalio/testing";
import { createMemoryDurableMissionRuntime } from "./durable-mission.js";
import { TEMPORAL_TASK_QUEUE } from "./temporal-binding.js";
import { temporalMissionActivities } from "./temporal/activities.js";
import {
  bindMissionRuntime,
  clearMissionRuntime,
} from "./temporal/runtime-context.js";
import type { TemporalMissionInput } from "./temporal/types.js";

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function missionInput(workflowId: string): TemporalMissionInput {
  return {
    envelope: {
      jobId: uuid(),
      roleId: "A01",
      workflowId,
      siteId: "site-1",
      assetId: "page-home",
      trigger: "manual",
      policyVersion: "m2-temporal",
      inputArtifactIds: [],
      capabilityGrantId: "grant-1",
      sourceRevision: "rev-1",
      maxAttempts: 2,
      deadlineSeconds: 600,
      idempotencyKey: `mission/${workflowId}`,
      expectedOutcome: "verified",
    },
    reviewRequired: false,
    operationId: `op-${workflowId}`,
    payloadDigest: `digest-${workflowId}`,
    businessIdempotencyKey: `biz-${workflowId}`,
    decision: {
      decisionId: `dec-${workflowId}`,
      reason: "temporal test accept",
    },
    holder: "temporal-test-worker",
  };
}

describe("temporal durable mission (local test server)", () => {
  let testEnv: TestWorkflowEnvironment;
  const workflowsPath = fileURLToPath(
    new URL("./temporal/workflows.ts", import.meta.url),
  );

  beforeAll(async () => {
    testEnv = await TestWorkflowEnvironment.createLocal();
  }, 120_000);

  afterAll(async () => {
    clearMissionRuntime();
    await testEnv?.teardown();
  });

  it("runs mission to VERIFIED with a single apply attempt", async () => {
    const taskQueue = `${TEMPORAL_TASK_QUEUE}-happy-${process.pid}`;
    const runtime = createMemoryDurableMissionRuntime({
      temporalLabelOverride: "TEMPORAL",
    });
    bindMissionRuntime(runtime);
    expect(runtime.temporalLabel).toBe("TEMPORAL");

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: "default",
      taskQueue,
      workflowsPath,
      activities: temporalMissionActivities,
    });

    const workflowId = `wf-temporal-${uuid()}`;
    const input = missionInput(workflowId);

    const result = await worker.runUntil(
      testEnv.client.workflow.execute("durableMissionWorkflow", {
        taskQueue,
        workflowId: `run-${workflowId}`,
        args: [input],
      }),
    );

    expect(result.outcome).toBe("VERIFIED");
    expect(result.temporalWiring).toBe("TEMPORAL");
    expect(result.applyAttemptCount).toBe(1);
    expect(result.phase).toBe("succeeded");
  }, 120_000);

  it("survives worker crash/restart without a second apply", async () => {
    const taskQueue = `${TEMPORAL_TASK_QUEUE}-crash-${process.pid}`;
    const runtime = createMemoryDurableMissionRuntime({
      temporalLabelOverride: "TEMPORAL",
    });
    bindMissionRuntime(runtime);

    const workflowId = `wf-crash-${uuid()}`;
    const input = missionInput(workflowId);
    const temporalWorkflowId = `run-${workflowId}`;

    const workerA = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: "default",
      taskQueue,
      workflowsPath,
      activities: temporalMissionActivities,
    });

    const handle = await workerA.runUntil(async () => {
      const started = await testEnv.client.workflow.start(
        "durableMissionWorkflow",
        {
          taskQueue,
          workflowId: temporalWorkflowId,
          args: [input],
        },
      );
      for (let i = 0; i < 200; i += 1) {
        const wf = await runtime.getWorkflow(workflowId);
        if (wf && (wf.phase === "effect_pending" || wf.phase === "succeeded")) {
          return started;
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("Timed out waiting for effect_pending");
    });

    const mid = await runtime.getWorkflow(workflowId);
    expect(mid?.phase === "effect_pending" || mid?.phase === "succeeded").toBe(
      true,
    );

    // Worker A stopped by runUntil — start worker B (crash/restart path).
    const workerB = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: "default",
      taskQueue,
      workflowsPath,
      activities: temporalMissionActivities,
    });

    const result = await workerB.runUntil(handle.result());
    expect(result.outcome).toBe("VERIFIED");
    expect(result.applyAttemptCount).toBe(1);

    const final = await runtime.getWorkflow(workflowId);
    expect(final?.phase).toBe("succeeded");
    expect(final?.temporalWiring).toBe("TEMPORAL");
  }, 180_000);

  it("replays workflow history without error", async () => {
    const taskQueue = `${TEMPORAL_TASK_QUEUE}-replay-${process.pid}`;
    const runtime = createMemoryDurableMissionRuntime({
      temporalLabelOverride: "TEMPORAL",
    });
    bindMissionRuntime(runtime);

    const worker = await Worker.create({
      connection: testEnv.nativeConnection,
      namespace: "default",
      taskQueue,
      workflowsPath,
      activities: temporalMissionActivities,
    });

    const workflowId = `wf-replay-${uuid()}`;
    const input = missionInput(workflowId);
    const temporalWorkflowId = `run-${workflowId}`;

    await worker.runUntil(
      testEnv.client.workflow.execute("durableMissionWorkflow", {
        taskQueue,
        workflowId: temporalWorkflowId,
        args: [input],
      }),
    );

    const historyHandle = testEnv.client.workflow.getHandle(temporalWorkflowId);
    const history = await historyHandle.fetchHistory();
    expect(history.events?.length ?? 0).toBeGreaterThan(0);

    await Worker.runReplayHistory({ workflowsPath }, history);
  }, 120_000);
});
