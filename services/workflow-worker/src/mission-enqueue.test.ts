import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { createClaudeRunner } from "@worksocial/claude-runner";
import { createMissionEnqueueService } from "./mission-enqueue.js";
import type { TemporalMissionClient } from "./temporal/client.js";

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("mission enqueue (Temporal NOT_WIRED)", () => {
  it("accepts a mission and reports NOT_WIRED honestly", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const service = createMissionEnqueueService({ runner });
    expect(service.temporalStatus).toBe("NOT_WIRED");

    const result = await service.enqueue({
      envelope: {
        jobId: uuid(),
        roleId: "A01",
        workflowId: "wf-mission-1",
        siteId: "worksocial",
        assetId: "mission-1",
        trigger: "owner_goal",
        policyVersion: "r1-04",
        inputArtifactIds: [],
        capabilityGrantId: "fixture-grant",
        sourceRevision: "rev",
        maxAttempts: 1,
        deadlineSeconds: 60,
        idempotencyKey: `mission/${uuid()}`,
        expectedOutcome: "plan",
      },
    });

    expect(result.accepted).toBe(true);
    expect(result.temporalStatus).toBe("NOT_WIRED");
    expect(result.run?.roleId).toBe("A01");
    expect(result.detail).toMatch(/Temporal/);
  });

  it("preserves LOCAL_DURABLE status when configured", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const service = createMissionEnqueueService({
      runner,
      temporalStatus: "LOCAL_DURABLE",
    });
    const result = await service.enqueue({
      envelope: {
        jobId: uuid(),
        roleId: "A01",
        workflowId: "wf-local-durable",
        siteId: "worksocial",
        assetId: "mission-1",
        trigger: "owner_goal",
        policyVersion: "m2",
        inputArtifactIds: [],
        capabilityGrantId: "fixture-grant",
        sourceRevision: "rev",
        maxAttempts: 1,
        deadlineSeconds: 60,
        idempotencyKey: `mission/${uuid()}`,
        expectedOutcome: "plan",
      },
    });
    expect(result.accepted).toBe(true);
    expect(result.temporalStatus).toBe("LOCAL_DURABLE");
    expect(result.detail).toMatch(/LOCAL_DURABLE/);
  });

  it("starts Temporal workflow when client is bound", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const startMission = vi.fn(async () => ({
      workflowId: "mission-wf-temporal",
      runId: "run-abc",
    }));
    const temporalClient = {
      startMission,
    } as unknown as TemporalMissionClient;
    const service = createMissionEnqueueService({
      runner,
      temporalStatus: "TEMPORAL",
      temporalClient,
    });
    expect(service.temporalStatus).toBe("TEMPORAL");

    const result = await service.enqueue({
      envelope: {
        jobId: uuid(),
        roleId: "A01",
        workflowId: "wf-temporal",
        siteId: "worksocial",
        assetId: "mission-1",
        trigger: "owner_goal",
        policyVersion: "r1-04",
        inputArtifactIds: [],
        capabilityGrantId: "fixture-grant",
        sourceRevision: "rev",
        maxAttempts: 1,
        deadlineSeconds: 60,
        idempotencyKey: `mission/${uuid()}`,
        expectedOutcome: "plan",
      },
    });

    expect(result.accepted).toBe(true);
    expect(result.temporalStatus).toBe("TEMPORAL");
    expect(result.run).toBeNull();
    expect(result.temporalRunId).toBe("run-abc");
    expect(startMission).toHaveBeenCalledOnce();
  });

  it("refuses TEMPORAL without a bound client (no Claude mislabel)", async () => {
    const runner = createClaudeRunner({
      workspaceRoot: process.cwd(),
      forceFixture: true,
    });
    const enqueueSpy = vi.spyOn(runner, "enqueue");
    const service = createMissionEnqueueService({
      runner,
      temporalStatus: "TEMPORAL",
      temporalClient: null,
    });
    const result = await service.enqueue({
      envelope: {
        jobId: uuid(),
        roleId: "A01",
        workflowId: "wf-no-client",
        siteId: "worksocial",
        assetId: "mission-1",
        trigger: "owner_goal",
        policyVersion: "r1-04",
        inputArtifactIds: [],
        capabilityGrantId: "fixture-grant",
        sourceRevision: "rev",
        maxAttempts: 1,
        deadlineSeconds: 60,
        idempotencyKey: `mission/${uuid()}`,
        expectedOutcome: "plan",
      },
    });
    expect(result.accepted).toBe(false);
    expect(result.temporalStatus).toBe("NOT_WIRED");
    expect(result.run).toBeNull();
    expect(enqueueSpy).not.toHaveBeenCalled();
  });
});
