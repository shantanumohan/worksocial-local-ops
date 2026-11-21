/**
 * Temporal workflows for durable local missions.
 * Deterministic — import only @temporalio/workflow and local types.
 */

import {
  condition,
  defineSignal,
  proxyActivities,
  setHandler,
} from "@temporalio/workflow";
import type { TemporalMissionInput, TemporalMissionResult } from "./types.js";

type MissionActivities = {
  enqueueMissionActivity(input: {
    mission: TemporalMissionInput;
    nowIso: string;
  }): Promise<{ workflowId: string; phase: string }>;
  claimAndAcceptActivity(input: {
    mission: TemporalMissionInput;
    nowIso: string;
  }): Promise<{
    phase: string;
    applyAttemptCount: number;
    outcome: "ACCEPTED_PENDING";
  }>;
  waitForReviewActivity(input: {
    workflowId: string;
    nowIso: string;
  }): Promise<{ reviewToken: string; phase: string }>;
  completeReviewAndVerifyActivity(input: {
    workflowId: string;
    reviewToken: string;
    observedDigest: string;
    nowIso: string;
  }): Promise<{ phase: string; applyAttemptCount: number; outcome: "VERIFIED" }>;
  verifyWithoutReviewActivity(input: {
    workflowId: string;
    observedDigest: string;
    nowIso: string;
  }): Promise<{
    phase: string;
    applyAttemptCount: number;
    outcome: "VERIFIED" | "FAILED" | "REVIEW_WAIT" | "ACCEPTED_PENDING";
  }>;
};

const activities = proxyActivities<MissionActivities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    initialInterval: "1s",
    backoffCoefficient: 2,
    maximumAttempts: 5,
  },
});

/** Owner/reviewer approval signal for reviewRequired missions. */
export const reviewApprovedSignal = defineSignal<[string]>("reviewApproved");

/**
 * Durable mission workflow hosted by Temporal.
 * Effect apply is a single activity; retries are idempotent on operationId.
 */
export async function durableMissionWorkflow(
  input: TemporalMissionInput,
): Promise<TemporalMissionResult> {
  const workflowId = input.envelope.workflowId;
  let approvedToken: string | null = null;
  setHandler(reviewApprovedSignal, (token: string) => {
    approvedToken = token;
  });

  const t0 = new Date().toISOString();
  await activities.enqueueMissionActivity({ mission: input, nowIso: t0 });

  const t1 = new Date(Date.parse(t0) + 1_000).toISOString();
  const accepted = await activities.claimAndAcceptActivity({
    mission: input,
    nowIso: t1,
  });

  if (input.reviewRequired) {
    const t2 = new Date(Date.parse(t1) + 1_000).toISOString();
    const review = await activities.waitForReviewActivity({
      workflowId,
      nowIso: t2,
    });
    const gotSignal = await condition(() => approvedToken !== null, "30 days");
    if (!gotSignal || approvedToken === null) {
      return {
        phase: "review_wait",
        outcome: "REVIEW_WAIT",
        applyAttemptCount: accepted.applyAttemptCount,
        temporalWiring: "TEMPORAL",
        workflowId,
        operationId: input.operationId,
      };
    }
    const token = approvedToken === "auto" ? review.reviewToken : approvedToken;
    const t3 = new Date().toISOString();
    const verified = await activities.completeReviewAndVerifyActivity({
      workflowId,
      reviewToken: token,
      observedDigest: input.payloadDigest,
      nowIso: t3,
    });
    return {
      phase: verified.phase,
      outcome: "VERIFIED",
      applyAttemptCount: verified.applyAttemptCount,
      temporalWiring: "TEMPORAL",
      workflowId,
      operationId: input.operationId,
    };
  }

  const t2 = new Date(Date.parse(t1) + 1_000).toISOString();
  const verified = await activities.verifyWithoutReviewActivity({
    workflowId,
    observedDigest: input.payloadDigest,
    nowIso: t2,
  });
  return {
    phase: verified.phase,
    outcome: verified.outcome === "VERIFIED" ? "VERIFIED" : "FAILED",
    applyAttemptCount: verified.applyAttemptCount,
    temporalWiring: "TEMPORAL",
    workflowId,
    operationId: input.operationId,
  };
}
