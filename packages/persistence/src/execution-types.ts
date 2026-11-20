/**
 * Durable execution store contracts (M2 / NEXT-08–09).
 * Fixture/memory implementations keep tests offline; Postgres backs production path.
 * ACCEPTED_PENDING ≠ VERIFIED. External effects: simulator only.
 */

import type { EffectOutcome, EffectRecord } from "@worksocial/domain";

export type JobStatus =
  | "queued"
  | "leased"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type DurableJobRecord = {
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
  status: JobStatus;
  leaseHolder: string | null;
  leaseExpiresAtIso: string | null;
  attemptCount: number;
  envelopeJson: Record<string, unknown>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type EffectAttemptPhase =
  | "record"
  | "authorize"
  | "apply"
  | "ack"
  | "verify"
  | "reconcile";

export type EffectAttemptStatus = "started" | "succeeded" | "failed" | "skipped";

export type EffectAttemptRecord = {
  attemptId: string;
  operationId: string;
  attemptNumber: number;
  phase: EffectAttemptPhase;
  status: EffectAttemptStatus;
  detail: string;
  providerReceiptId: string | null;
  createdAtIso: string;
};

export type DurableEffectIntent = EffectRecord & {
  jobId: string | null;
  effectState: string;
  businessIdempotencyKey: string | null;
  updatedAtIso: string;
};

export type DurableGatewayDecision = {
  decisionId: string;
  operationId: string;
  payloadDigest: string;
  allowed: boolean;
  code: string | null;
  reason: string;
  grantId: string | null;
  policyId: string | null;
  decidedAtIso: string;
  effectState: string;
  outcome: "DENIED" | "INTENDED" | "ACCEPTED_PENDING" | "VERIFIED" | "FAILED";
  writePathId: string | null;
  gateDetails: string[];
};

export type ExecutionReceiptKind =
  | "provider_ack"
  | "independent_read"
  | "verification"
  | "reconcile";

export type ExecutionReceiptVerdict =
  | "ACCEPTED_PENDING"
  | "MATCH"
  | "MISMATCH"
  | "UNKNOWN"
  | "SKIPPED";

export type ExecutionReceipt = {
  receiptId: string;
  operationId: string;
  kind: ExecutionReceiptKind;
  observedDigest: string | null;
  observedPayload: Record<string, unknown>;
  verdict: ExecutionReceiptVerdict;
  detail: string;
  recordedAtIso: string;
};

export type DurableBudgetAccount = {
  accountId: string;
  dayKey: string;
  currency: string;
  limitMinor: number;
  reservedMinor: number;
  settledMinor: number;
  createdAtIso: string;
  updatedAtIso: string;
};

export type DurableBudgetReservation = {
  reservationId: string;
  accountId: string;
  amountMinor: number;
  status: "open" | "settled" | "released";
  actualMinor: number | null;
  jobId: string | null;
  operationId: string | null;
  createdAtIso: string;
  settledAtIso: string | null;
};

export type OutboxEvent = {
  outboxId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAtIso: string;
  publishedAtIso: string | null;
};

export type FakeProviderEffect = {
  providerEffectId: string;
  businessIdempotencyKey: string;
  operationId: string;
  payloadDigest: string;
  applyCount: number;
  remoteRef: string;
  appliedAtIso: string;
  lastSeenAtIso: string;
};

export type JobInsertInput = Omit<
  DurableJobRecord,
  | "status"
  | "leaseHolder"
  | "leaseExpiresAtIso"
  | "attemptCount"
  | "createdAtIso"
  | "updatedAtIso"
> & {
  status?: JobStatus;
  envelopeJson?: Record<string, unknown>;
};

export type EffectIntentInput = {
  operationId: string;
  payloadDigest: string;
  recordedAtIso: string;
  jobId?: string | null;
  effectState?: string;
  businessIdempotencyKey?: string | null;
  outcome?: EffectOutcome;
};

export type { EffectOutcome, EffectRecord };
