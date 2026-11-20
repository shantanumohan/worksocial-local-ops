/**
 * Mission workflow store — enqueue-before-ack, leases, retry categories, review wait.
 * Temporal cluster remains NOT_WIRED until explicitly bound; LOCAL_DURABLE uses Postgres.
 */

import type { PgQueryable } from "./pg/client.js";

export type MissionPhase =
  | "enqueued"
  | "leased"
  | "effect_pending"
  | "review_wait"
  | "succeeded"
  | "failed"
  | "cancelled";

export type MissionRetryCategory =
  | "transient"
  | "policy"
  | "unknown_remote"
  | "fatal"
  | "none";

export type MissionTemporalWiring = "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE";

export type MissionWorkflowRecord = {
  workflowId: string;
  jobId: string;
  operationId: string | null;
  phase: MissionPhase;
  retryCategory: MissionRetryCategory | null;
  attemptCount: number;
  leaseHolder: string | null;
  leaseExpiresAtIso: string | null;
  reviewRequired: boolean;
  reviewToken: string | null;
  lastError: string | null;
  temporalWiring: MissionTemporalWiring;
  temporalRunId: string | null;
  envelopeJson: Record<string, unknown>;
  createdAtIso: string;
  updatedAtIso: string;
};

export type MissionWorkflowInsert = {
  workflowId: string;
  jobId: string;
  reviewRequired?: boolean;
  temporalWiring?: MissionTemporalWiring;
  envelopeJson?: Record<string, unknown>;
  /** Logical clock for deadline arithmetic (defaults to wall clock). */
  nowIso?: string;
};

export type MissionWorkflowStore = {
  /** Idempotent by workflowId — returns existing compatible row on retry. */
  enqueue(input: MissionWorkflowInsert): Promise<MissionWorkflowRecord>;
  get(workflowId: string): Promise<MissionWorkflowRecord | undefined>;
  claimLease(input: {
    workflowId: string;
    holder: string;
    leaseExpiresAtIso: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord | null>;
  /**
   * Persist intended operation_id (+ effect keys) while still leased,
   * before provider apply — enables restart recovery without a second apply.
   */
  bindOperationWhileLeased(input: {
    workflowId: string;
    operationId: string;
    holder: string;
    nowIso: string;
    payloadDigest: string;
    businessIdempotencyKey: string;
  }): Promise<MissionWorkflowRecord>;
  /** Fenced transition leased → effect_pending (requires active holder lease). */
  markEffectPending(input: {
    workflowId: string;
    operationId: string;
    holder: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  /** Recovery helper: leased/effect_pending → effect_pending without lease fence. */
  recoverEffectPending(input: {
    workflowId: string;
    operationId: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  enterReviewWait(input: {
    workflowId: string;
    reviewToken: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  completeReview(input: {
    workflowId: string;
    reviewToken: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  succeed(workflowId: string, nowIso: string): Promise<MissionWorkflowRecord>;
  fail(input: {
    workflowId: string;
    retryCategory: MissionRetryCategory;
    lastError: string;
    nowIso: string;
  }): Promise<MissionWorkflowRecord>;
  listByPhase(phase: MissionPhase): Promise<MissionWorkflowRecord[]>;
};

function rowToMission(row: Record<string, unknown>): MissionWorkflowRecord {
  return {
    workflowId: String(row.workflow_id),
    jobId: String(row.job_id),
    operationId: row.operation_id == null ? null : String(row.operation_id),
    phase: row.phase as MissionPhase,
    retryCategory:
      row.retry_category == null
        ? null
        : (row.retry_category as MissionRetryCategory),
    attemptCount: Number(row.attempt_count),
    leaseHolder: row.lease_holder == null ? null : String(row.lease_holder),
    leaseExpiresAtIso:
      row.lease_expires_at == null
        ? null
        : new Date(String(row.lease_expires_at)).toISOString(),
    reviewRequired: Boolean(row.review_required),
    reviewToken: row.review_token == null ? null : String(row.review_token),
    lastError: row.last_error == null ? null : String(row.last_error),
    temporalWiring: row.temporal_wiring as MissionTemporalWiring,
    temporalRunId:
      row.temporal_run_id == null ? null : String(row.temporal_run_id),
    envelopeJson:
      typeof row.envelope_json === "object" && row.envelope_json !== null
        ? (row.envelope_json as Record<string, unknown>)
        : {},
    createdAtIso: new Date(String(row.created_at)).toISOString(),
    updatedAtIso: new Date(String(row.updated_at)).toISOString(),
  };
}

function leaseActive(
  record: MissionWorkflowRecord,
  holder: string,
  nowIso: string,
): boolean {
  if (record.leaseHolder !== holder) return false;
  if (!record.leaseExpiresAtIso) return true;
  return Date.parse(record.leaseExpiresAtIso) > Date.parse(nowIso);
}

export function createMemoryMissionWorkflowStore(): MissionWorkflowStore {
  const byId = new Map<string, MissionWorkflowRecord>();

  return {
    async enqueue(input) {
      const existing = byId.get(input.workflowId);
      if (existing) {
        if (existing.jobId !== input.jobId) {
          throw new Error(
            `Workflow ${input.workflowId} already enqueued with a different job`,
          );
        }
        return existing;
      }
      const stamp = input.nowIso ?? new Date().toISOString();
      const record: MissionWorkflowRecord = {
        workflowId: input.workflowId,
        jobId: input.jobId,
        operationId: null,
        phase: "enqueued",
        retryCategory: null,
        attemptCount: 0,
        leaseHolder: null,
        leaseExpiresAtIso: null,
        reviewRequired: input.reviewRequired ?? false,
        reviewToken: null,
        lastError: null,
        temporalWiring: input.temporalWiring ?? "LOCAL_DURABLE",
        temporalRunId: null,
        envelopeJson: input.envelopeJson ?? {},
        createdAtIso: stamp,
        updatedAtIso: stamp,
      };
      byId.set(record.workflowId, record);
      return record;
    },

    async get(workflowId) {
      return byId.get(workflowId);
    },

    async claimLease(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) return null;
      if (existing.phase !== "enqueued" && existing.phase !== "leased") {
        return null;
      }
      if (
        existing.phase === "leased" &&
        existing.leaseExpiresAtIso &&
        Date.parse(existing.leaseExpiresAtIso) > Date.parse(input.nowIso) &&
        existing.leaseHolder !== input.holder
      ) {
        return null;
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "leased",
        leaseHolder: input.holder,
        leaseExpiresAtIso: input.leaseExpiresAtIso,
        attemptCount: existing.attemptCount + 1,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async bindOperationWhileLeased(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "leased") {
        throw new Error(
          `Workflow ${input.workflowId} must be leased to bind operation`,
        );
      }
      if (!leaseActive(existing, input.holder, input.nowIso)) {
        throw new Error(`Lease fence failed for ${input.workflowId}`);
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        operationId: input.operationId,
        envelopeJson: {
          ...existing.envelopeJson,
          boundPayloadDigest: input.payloadDigest,
          boundBusinessIdempotencyKey: input.businessIdempotencyKey,
        },
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async markEffectPending(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "leased") {
        throw new Error(
          `Workflow ${input.workflowId} must be leased to mark effect_pending`,
        );
      }
      if (!leaseActive(existing, input.holder, input.nowIso)) {
        throw new Error(`Lease fence failed for ${input.workflowId}`);
      }
      if (
        existing.operationId &&
        existing.operationId !== input.operationId
      ) {
        throw new Error(
          `Operation mismatch for ${input.workflowId}: bound=${existing.operationId}`,
        );
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "effect_pending",
        operationId: input.operationId,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async recoverEffectPending(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "leased" && existing.phase !== "effect_pending") {
        throw new Error(
          `Cannot recover effect_pending from phase ${existing.phase}`,
        );
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "effect_pending",
        operationId: input.operationId,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async enterReviewWait(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "effect_pending" || !existing.reviewRequired) {
        throw new Error(
          `Workflow ${input.workflowId} cannot enter review_wait from ${existing.phase}`,
        );
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "review_wait",
        reviewToken: input.reviewToken,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async completeReview(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      if (existing.phase !== "review_wait") {
        throw new Error(`Workflow ${input.workflowId} is not in review_wait`);
      }
      if (existing.reviewToken !== input.reviewToken) {
        throw new Error(`Invalid review token for ${input.workflowId}`);
      }
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "effect_pending",
        reviewToken: null,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async succeed(workflowId, nowIso) {
      const existing = byId.get(workflowId);
      if (!existing) throw new Error(`Unknown workflow ${workflowId}`);
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "succeeded",
        retryCategory: "none",
        leaseHolder: null,
        leaseExpiresAtIso: null,
        updatedAtIso: nowIso,
      };
      byId.set(workflowId, updated);
      return updated;
    },

    async fail(input) {
      const existing = byId.get(input.workflowId);
      if (!existing) throw new Error(`Unknown workflow ${input.workflowId}`);
      const updated: MissionWorkflowRecord = {
        ...existing,
        phase: "failed",
        retryCategory: input.retryCategory,
        lastError: input.lastError,
        leaseHolder: null,
        leaseExpiresAtIso: null,
        updatedAtIso: input.nowIso,
      };
      byId.set(input.workflowId, updated);
      return updated;
    },

    async listByPhase(phase) {
      return [...byId.values()].filter((m) => m.phase === phase);
    },
  };
}

export function createPgMissionWorkflowStore(
  db: PgQueryable,
): MissionWorkflowStore {
  return {
    async enqueue(input) {
      const stamp = input.nowIso ?? new Date().toISOString();
      const result = await db.query(
        `INSERT INTO core.mission_workflows (
           workflow_id, job_id, phase, review_required, temporal_wiring, envelope_json,
           created_at, updated_at
         ) VALUES ($1,$2,'enqueued',$3,$4,$5::jsonb,$6::timestamptz,$6::timestamptz)
         ON CONFLICT (workflow_id) DO NOTHING
         RETURNING *`,
        [
          input.workflowId,
          input.jobId,
          input.reviewRequired ?? false,
          input.temporalWiring ?? "LOCAL_DURABLE",
          JSON.stringify(input.envelopeJson ?? {}),
          stamp,
        ],
      );
      if (result.rows[0]) {
        return rowToMission(result.rows[0] as Record<string, unknown>);
      }
      const existing = await db.query(
        `SELECT * FROM core.mission_workflows WHERE workflow_id = $1`,
        [input.workflowId],
      );
      if (!existing.rows[0]) {
        throw new Error(`Workflow enqueue failed for ${input.workflowId}`);
      }
      const mission = rowToMission(existing.rows[0] as Record<string, unknown>);
      if (mission.jobId !== input.jobId) {
        throw new Error(
          `Workflow ${input.workflowId} already enqueued with a different job`,
        );
      }
      return mission;
    },

    async get(workflowId) {
      const result = await db.query(
        `SELECT * FROM core.mission_workflows WHERE workflow_id = $1`,
        [workflowId],
      );
      return result.rows[0]
        ? rowToMission(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async claimLease(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'leased',
             lease_holder = $2,
             lease_expires_at = $3::timestamptz,
             attempt_count = attempt_count + 1,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
           AND (
             phase = 'enqueued'
             OR (
               phase = 'leased'
               AND (
                 lease_expires_at IS NULL
                 OR lease_expires_at <= $4::timestamptz
                 OR lease_holder = $2
               )
             )
           )
         RETURNING *`,
        [
          input.workflowId,
          input.holder,
          input.leaseExpiresAtIso,
          input.nowIso,
        ],
      );
      return result.rows[0]
        ? rowToMission(result.rows[0] as Record<string, unknown>)
        : null;
    },

    async bindOperationWhileLeased(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET operation_id = $2,
             envelope_json = envelope_json || $5::jsonb,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
           AND phase = 'leased'
           AND lease_holder = $3
           AND (lease_expires_at IS NULL OR lease_expires_at > $4::timestamptz)
         RETURNING *`,
        [
          input.workflowId,
          input.operationId,
          input.holder,
          input.nowIso,
          JSON.stringify({
            boundPayloadDigest: input.payloadDigest,
            boundBusinessIdempotencyKey: input.businessIdempotencyKey,
          }),
        ],
      );
      if (!result.rows[0]) {
        throw new Error(
          `bindOperationWhileLeased failed for ${input.workflowId} (lease/phase fence)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async markEffectPending(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'effect_pending',
             operation_id = $2,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
           AND phase = 'leased'
           AND lease_holder = $3
           AND (lease_expires_at IS NULL OR lease_expires_at > $4::timestamptz)
           AND (operation_id IS NULL OR operation_id = $2)
         RETURNING *`,
        [input.workflowId, input.operationId, input.holder, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `markEffectPending failed for ${input.workflowId} (lease/phase fence)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async recoverEffectPending(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'effect_pending',
             operation_id = $2,
             updated_at = $3::timestamptz
         WHERE workflow_id = $1
           AND phase IN ('leased', 'effect_pending')
         RETURNING *`,
        [input.workflowId, input.operationId, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `recoverEffectPending failed for ${input.workflowId}`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async enterReviewWait(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'review_wait',
             review_token = $2,
             updated_at = $3::timestamptz
         WHERE workflow_id = $1
           AND phase = 'effect_pending'
           AND review_required = true
         RETURNING *`,
        [input.workflowId, input.reviewToken, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `enterReviewWait failed for ${input.workflowId} (phase/reviewRequired)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async completeReview(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'effect_pending',
             review_token = NULL,
             updated_at = $3::timestamptz
         WHERE workflow_id = $1
           AND phase = 'review_wait'
           AND review_token = $2
         RETURNING *`,
        [input.workflowId, input.reviewToken, input.nowIso],
      );
      if (!result.rows[0]) {
        throw new Error(
          `Review complete failed for ${input.workflowId} (token/phase mismatch)`,
        );
      }
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async succeed(workflowId, nowIso) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'succeeded',
             retry_category = 'none',
             lease_holder = NULL,
             lease_expires_at = NULL,
             updated_at = $2::timestamptz
         WHERE workflow_id = $1
         RETURNING *`,
        [workflowId, nowIso],
      );
      if (!result.rows[0]) throw new Error(`Unknown workflow ${workflowId}`);
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async fail(input) {
      const result = await db.query(
        `UPDATE core.mission_workflows
         SET phase = 'failed',
             retry_category = $2,
             last_error = $3,
             lease_holder = NULL,
             lease_expires_at = NULL,
             updated_at = $4::timestamptz
         WHERE workflow_id = $1
         RETURNING *`,
        [
          input.workflowId,
          input.retryCategory,
          input.lastError,
          input.nowIso,
        ],
      );
      if (!result.rows[0]) throw new Error(`Unknown workflow ${input.workflowId}`);
      return rowToMission(result.rows[0] as Record<string, unknown>);
    },

    async listByPhase(phase) {
      const result = await db.query(
        `SELECT * FROM core.mission_workflows WHERE phase = $1 ORDER BY created_at`,
        [phase],
      );
      return result.rows.map((row) =>
        rowToMission(row as Record<string, unknown>),
      );
    },
  };
}
