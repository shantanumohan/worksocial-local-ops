/**
 * Durable mission: enqueue-before-ack, lease, review wait, crash/restart at effect boundary.
 * Memory fixture — no Temporal cluster; LOCAL_DURABLE semantics.
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createMemoryDurableMissionRuntime } from "./durable-mission.js";

function uuid(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

describe("durable mission runtime (LOCAL_DURABLE)", () => {
  it("enqueues before effect ack and verifies after review without second apply", async () => {
    const runtime = createMemoryDurableMissionRuntime();
    expect(runtime.temporal.status).toBe("NOT_WIRED");
    expect(runtime.temporalLabel).toBe("LOCAL_DURABLE");

    const workflowId = `wf-${uuid()}`;
    const jobId = uuid();
    const digest = "digest-mission-1";
    const now = "2026-11-20T05:00:00.000Z";

    const enqueued = await runtime.enqueueBeforeAck({
      envelope: {
        jobId,
        roleId: "A01",
        workflowId,
        siteId: "site-1",
        assetId: "page-home",
        trigger: "owner_goal",
        policyVersion: "m2",
        inputArtifactIds: [],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: `mission/${workflowId}`,
        expectedOutcome: "verified_publish",
      },
      reviewRequired: true,
      nowIso: now,
    });
    expect(enqueued.phase).toBe("enqueued");

    const accepted = await runtime.claimAndAcceptEffect({
      workflowId,
      holder: "worker-1",
      operationId: `op-${workflowId}`,
      payloadDigest: digest,
      businessIdempotencyKey: `biz-${workflowId}`,
      nowIso: "2026-11-20T05:01:00.000Z",
      decision: {
        decisionId: `dec-${workflowId}`,
        reason: "authorized mission effect",
        grantId: "grant-1",
        policyId: "pol-1",
      },
    });
    expect(accepted.acceptedOutcome).toBe("ACCEPTED_PENDING");
    expect(accepted.workflow.phase).toBe("effect_pending");
    expect(accepted.applyAttemptCount).toBe(1);

    const review = await runtime.waitForReview({
      workflowId,
      nowIso: "2026-11-20T05:02:00.000Z",
    });
    expect(review.workflow.phase).toBe("review_wait");

    const verified = await runtime.completeReviewAndVerify({
      workflowId,
      reviewToken: review.reviewToken,
      observedDigest: digest,
      nowIso: "2026-11-20T05:03:00.000Z",
    });
    expect(verified.verifiedOutcome).toBe("VERIFIED");
    expect(verified.workflow.phase).toBe("succeeded");
    expect(verified.applyAttemptCount).toBe(1);
  });

  it("survives restart at effect_pending without a second apply", async () => {
    const runtimeA = createMemoryDurableMissionRuntime();
    const workflowId = `wf-restart-${uuid()}`;
    const digest = "digest-restart";
    const now = "2026-11-20T06:00:00.000Z";

    await runtimeA.enqueueBeforeAck({
      envelope: {
        jobId: uuid(),
        roleId: "A25",
        workflowId,
        siteId: "site-1",
        assetId: "page-home",
        trigger: "schedule",
        policyVersion: "m2",
        inputArtifactIds: [],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 300,
        idempotencyKey: `mission/${workflowId}`,
        expectedOutcome: "verified",
      },
      nowIso: now,
    });

    const accepted = await runtimeA.claimAndAcceptEffect({
      workflowId,
      holder: "worker-a",
      operationId: `op-${workflowId}`,
      payloadDigest: digest,
      businessIdempotencyKey: `biz-${workflowId}`,
      nowIso: "2026-11-20T06:01:00.000Z",
      decision: {
        decisionId: `dec-${workflowId}`,
        reason: "accept pending",
      },
    });
    expect(accepted.workflow.phase).toBe("effect_pending");
    expect(accepted.applyAttemptCount).toBe(1);

    const resumed = await runtimeA.resumeAfterRestart({
      workflowId,
      observedDigest: digest,
      nowIso: "2026-11-20T06:05:00.000Z",
    });
    expect(resumed.outcome).toBe("VERIFIED");
    expect(resumed.workflow.phase).toBe("succeeded");
    expect(resumed.applyAttemptCount).toBe(1);
  });

  it("honors reviewRequired after restart at effect_pending", async () => {
    const runtime = createMemoryDurableMissionRuntime();
    const workflowId = `wf-review-restart-${uuid()}`;
    const digest = "digest-review-restart";

    await runtime.enqueueBeforeAck({
      envelope: {
        jobId: uuid(),
        roleId: "A25",
        workflowId,
        siteId: "site-1",
        assetId: "page-home",
        trigger: "manual",
        policyVersion: "m2",
        inputArtifactIds: [],
        capabilityGrantId: "grant-1",
        sourceRevision: "rev-1",
        maxAttempts: 2,
        deadlineSeconds: 600,
        idempotencyKey: `mission/${workflowId}`,
        expectedOutcome: "verified",
      },
      reviewRequired: true,
      nowIso: "2026-11-20T06:10:00.000Z",
    });

    await runtime.claimAndAcceptEffect({
      workflowId,
      holder: "worker-a",
      operationId: `op-${workflowId}`,
      payloadDigest: digest,
      businessIdempotencyKey: `biz-${workflowId}`,
      nowIso: "2026-11-20T06:11:00.000Z",
      decision: { decisionId: `dec-${workflowId}`, reason: "ok" },
    });

    const resumed = await runtime.resumeAfterRestart({
      workflowId,
      observedDigest: digest,
      nowIso: "2026-11-20T06:12:00.000Z",
    });
    expect(resumed.outcome).toBe("REVIEW_WAIT");
    expect(resumed.workflow.phase).toBe("effect_pending");
  });
});
