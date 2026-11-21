/**
 * Shared Temporal mission types (workflow-safe — no Node APIs).
 */

export type TemporalMissionEnvelope = {
  jobId: string;
  roleId: string;
  workflowId: string;
  siteId: string;
  assetId: string;
  trigger: string;
  policyVersion: string;
  inputArtifactIds: string[];
  capabilityGrantId: string;
  sourceRevision: string;
  maxAttempts: number;
  deadlineSeconds: number;
  idempotencyKey: string;
  expectedOutcome: string;
};

export type TemporalMissionInput = {
  envelope: TemporalMissionEnvelope;
  reviewRequired: boolean;
  operationId: string;
  payloadDigest: string;
  businessIdempotencyKey: string;
  decision: {
    decisionId: string;
    reason: string;
    grantId?: string | null;
    policyId?: string | null;
    writePathId?: string | null;
    gateDetails?: string[];
  };
  holder: string;
  leaseMs?: number;
};

export type TemporalMissionResult = {
  phase: string;
  outcome: "VERIFIED" | "FAILED" | "REVIEW_WAIT";
  applyAttemptCount: number;
  temporalWiring: "TEMPORAL";
  workflowId: string;
  operationId: string;
};
