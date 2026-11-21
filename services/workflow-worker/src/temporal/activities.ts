/**
 * Temporal activities for durable mission effect boundaries.
 * Activities are idempotent via operationId / business idempotency keys —
 * Temporal retries must not create duplicate simulator applies.
 */

import type { JobEnvelope } from "@worksocial/contracts";
import { getMissionRuntime } from "./runtime-context.js";
import type { TemporalMissionInput } from "./types.js";

function envelopeOf(input: TemporalMissionInput): JobEnvelope {
  return input.envelope as JobEnvelope;
}

export async function enqueueMissionActivity(input: {
  mission: TemporalMissionInput;
  nowIso: string;
}): Promise<{ workflowId: string; phase: string }> {
  const runtime = getMissionRuntime();
  const record = await runtime.enqueueBeforeAck({
    envelope: envelopeOf(input.mission),
    reviewRequired: input.mission.reviewRequired,
    nowIso: input.nowIso,
  });
  return { workflowId: record.workflowId, phase: record.phase };
}

export async function claimAndAcceptActivity(input: {
  mission: TemporalMissionInput;
  nowIso: string;
}): Promise<{ phase: string; applyAttemptCount: number; outcome: "ACCEPTED_PENDING" }> {
  const runtime = getMissionRuntime();
  const accepted = await runtime.claimAndAcceptEffect({
    workflowId: input.mission.envelope.workflowId,
    holder: input.mission.holder,
    leaseMs: input.mission.leaseMs ?? 60_000,
    operationId: input.mission.operationId,
    payloadDigest: input.mission.payloadDigest,
    businessIdempotencyKey: input.mission.businessIdempotencyKey,
    nowIso: input.nowIso,
    decision: {
      decisionId: input.mission.decision.decisionId,
      reason: input.mission.decision.reason,
      grantId: input.mission.decision.grantId ?? null,
      policyId: input.mission.decision.policyId ?? null,
      writePathId: input.mission.decision.writePathId ?? null,
      gateDetails: input.mission.decision.gateDetails ?? [],
    },
  });
  return {
    phase: accepted.workflow.phase,
    applyAttemptCount: accepted.applyAttemptCount,
    outcome: accepted.acceptedOutcome,
  };
}

export async function waitForReviewActivity(input: {
  workflowId: string;
  nowIso: string;
}): Promise<{ reviewToken: string; phase: string }> {
  const runtime = getMissionRuntime();
  const review = await runtime.waitForReview({
    workflowId: input.workflowId,
    nowIso: input.nowIso,
  });
  return { reviewToken: review.reviewToken, phase: review.workflow.phase };
}

export async function completeReviewAndVerifyActivity(input: {
  workflowId: string;
  reviewToken: string;
  observedDigest: string;
  nowIso: string;
}): Promise<{ phase: string; applyAttemptCount: number; outcome: "VERIFIED" }> {
  const runtime = getMissionRuntime();
  const verified = await runtime.completeReviewAndVerify({
    workflowId: input.workflowId,
    reviewToken: input.reviewToken,
    observedDigest: input.observedDigest,
    nowIso: input.nowIso,
  });
  return {
    phase: verified.workflow.phase,
    applyAttemptCount: verified.applyAttemptCount,
    outcome: verified.verifiedOutcome,
  };
}

export async function verifyWithoutReviewActivity(input: {
  workflowId: string;
  observedDigest: string;
  nowIso: string;
}): Promise<{
  phase: string;
  applyAttemptCount: number;
  outcome: "VERIFIED" | "FAILED" | "REVIEW_WAIT" | "ACCEPTED_PENDING";
}> {
  const runtime = getMissionRuntime();
  const resumed = await runtime.resumeAfterRestart({
    workflowId: input.workflowId,
    observedDigest: input.observedDigest,
    nowIso: input.nowIso,
  });
  return {
    phase: resumed.workflow.phase,
    applyAttemptCount: resumed.applyAttemptCount,
    outcome: resumed.outcome,
  };
}

export const temporalMissionActivities = {
  enqueueMissionActivity,
  claimAndAcceptActivity,
  waitForReviewActivity,
  completeReviewAndVerifyActivity,
  verifyWithoutReviewActivity,
};
