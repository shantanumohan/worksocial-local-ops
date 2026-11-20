/**
 * JobStore — durable mission jobs with unique idempotency keys.
 */

import { randomBytes } from "node:crypto";
import type { PgQueryable } from "./pg/client.js";
import type { DurableJobRecord, JobInsertInput, JobStatus } from "./execution-types.js";

export type JobStore = {
  insert(input: JobInsertInput): Promise<DurableJobRecord>;
  /** Insert or return existing row when idempotency key matches. */
  insertIdempotent(
    input: JobInsertInput,
  ): Promise<{ job: DurableJobRecord; created: boolean }>;
  get(jobId: string): Promise<DurableJobRecord | undefined>;
  getByIdempotencyKey(key: string): Promise<DurableJobRecord | undefined>;
  updateStatus(jobId: string, status: JobStatus, nowIso: string): Promise<DurableJobRecord>;
  listByStatus(status: JobStatus): Promise<DurableJobRecord[]>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function rowToJob(row: Record<string, unknown>): DurableJobRecord {
  return {
    jobId: String(row.job_id),
    roleId: String(row.role_id),
    workflowId: String(row.workflow_id),
    siteId: String(row.site_id),
    assetId: String(row.asset_id),
    trigger: String(row.trigger),
    policyVersion: String(row.policy_version),
    inputArtifactIds: Array.isArray(row.input_artifact_ids)
      ? (row.input_artifact_ids as string[])
      : JSON.parse(String(row.input_artifact_ids ?? "[]")),
    capabilityGrantId: String(row.capability_grant_id),
    sourceRevision: String(row.source_revision),
    maxAttempts: Number(row.max_attempts),
    deadlineSeconds: Number(row.deadline_seconds),
    idempotencyKey: String(row.idempotency_key),
    expectedOutcome: String(row.expected_outcome),
    status: row.status as JobStatus,
    leaseHolder: row.lease_holder == null ? null : String(row.lease_holder),
    leaseExpiresAtIso:
      row.lease_expires_at == null
        ? null
        : new Date(String(row.lease_expires_at)).toISOString(),
    attemptCount: Number(row.attempt_count),
    envelopeJson:
      typeof row.envelope_json === "object" && row.envelope_json !== null
        ? (row.envelope_json as Record<string, unknown>)
        : {},
    createdAtIso: new Date(String(row.created_at)).toISOString(),
    updatedAtIso: new Date(String(row.updated_at)).toISOString(),
  };
}

export function createMemoryJobStore(): JobStore {
  const byId = new Map<string, DurableJobRecord>();
  const byIdem = new Map<string, string>();

  const insert = async (input: JobInsertInput): Promise<DurableJobRecord> => {
    if (byIdem.has(input.idempotencyKey)) {
      throw new Error(
        `Job idempotency key already exists: ${input.idempotencyKey}`,
      );
    }
    const stamp = nowIso();
    const job: DurableJobRecord = {
      ...input,
      status: input.status ?? "queued",
      leaseHolder: null,
      leaseExpiresAtIso: null,
      attemptCount: 0,
      envelopeJson: input.envelopeJson ?? {},
      createdAtIso: stamp,
      updatedAtIso: stamp,
    };
    byId.set(job.jobId, job);
    byIdem.set(job.idempotencyKey, job.jobId);
    return job;
  };

  return {
    insert,
    async insertIdempotent(input) {
      const existingId = byIdem.get(input.idempotencyKey);
      if (existingId) {
        const existing = byId.get(existingId)!;
        return { job: existing, created: false };
      }
      const job = await insert(input);
      return { job, created: true };
    },
    async get(jobId) {
      return byId.get(jobId);
    },
    async getByIdempotencyKey(key) {
      const id = byIdem.get(key);
      return id ? byId.get(id) : undefined;
    },
    async updateStatus(jobId, status, stamp) {
      const existing = byId.get(jobId);
      if (!existing) throw new Error(`Unknown job ${jobId}`);
      const updated = { ...existing, status, updatedAtIso: stamp };
      byId.set(jobId, updated);
      return updated;
    },
    async listByStatus(status) {
      return [...byId.values()].filter((j) => j.status === status);
    },
  };
}

export function createPgJobStore(db: PgQueryable): JobStore {
  const insertSql = `
    INSERT INTO core.jobs (
      job_id, role_id, workflow_id, site_id, asset_id, trigger, policy_version,
      input_artifact_ids, capability_grant_id, source_revision, max_attempts,
      deadline_seconds, idempotency_key, expected_outcome, status, envelope_json
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16::jsonb
    )
    RETURNING *`;

  return {
    async insert(input) {
      const result = await db.query(insertSql, [
        input.jobId,
        input.roleId,
        input.workflowId,
        input.siteId,
        input.assetId,
        input.trigger,
        input.policyVersion,
        JSON.stringify(input.inputArtifactIds),
        input.capabilityGrantId,
        input.sourceRevision,
        input.maxAttempts,
        input.deadlineSeconds,
        input.idempotencyKey,
        input.expectedOutcome,
        input.status ?? "queued",
        JSON.stringify(input.envelopeJson ?? {}),
      ]);
      return rowToJob(result.rows[0] as Record<string, unknown>);
    },

    async insertIdempotent(input) {
      // ON CONFLICT avoids aborting an open transaction (unlike catch-23505).
      const result = await db.query(
        `
        INSERT INTO core.jobs (
          job_id, role_id, workflow_id, site_id, asset_id, trigger, policy_version,
          input_artifact_ids, capability_grant_id, source_revision, max_attempts,
          deadline_seconds, idempotency_key, expected_outcome, status, envelope_json
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14,$15,$16::jsonb
        )
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING *`,
        [
          input.jobId,
          input.roleId,
          input.workflowId,
          input.siteId,
          input.assetId,
          input.trigger,
          input.policyVersion,
          JSON.stringify(input.inputArtifactIds),
          input.capabilityGrantId,
          input.sourceRevision,
          input.maxAttempts,
          input.deadlineSeconds,
          input.idempotencyKey,
          input.expectedOutcome,
          input.status ?? "queued",
          JSON.stringify(input.envelopeJson ?? {}),
        ],
      );
      if (result.rows[0]) {
        return {
          job: rowToJob(result.rows[0] as Record<string, unknown>),
          created: true,
        };
      }
      const existing = await db.query(
        `SELECT * FROM core.jobs WHERE idempotency_key = $1`,
        [input.idempotencyKey],
      );
      if (!existing.rows[0]) {
        throw new Error(
          `Job idempotent insert failed for key ${input.idempotencyKey}`,
        );
      }
      return {
        job: rowToJob(existing.rows[0] as Record<string, unknown>),
        created: false,
      };
    },

    async get(jobId) {
      const result = await db.query(`SELECT * FROM core.jobs WHERE job_id = $1`, [
        jobId,
      ]);
      return result.rows[0]
        ? rowToJob(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async getByIdempotencyKey(key) {
      const result = await db.query(
        `SELECT * FROM core.jobs WHERE idempotency_key = $1`,
        [key],
      );
      return result.rows[0]
        ? rowToJob(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async updateStatus(jobId, status, stamp) {
      const result = await db.query(
        `UPDATE core.jobs SET status = $2, updated_at = $3::timestamptz
         WHERE job_id = $1 RETURNING *`,
        [jobId, status, stamp],
      );
      if (!result.rows[0]) throw new Error(`Unknown job ${jobId}`);
      return rowToJob(result.rows[0] as Record<string, unknown>);
    },

    async listByStatus(status) {
      const result = await db.query(
        `SELECT * FROM core.jobs WHERE status = $1 ORDER BY created_at`,
        [status],
      );
      return result.rows.map((row) => rowToJob(row as Record<string, unknown>));
    },
  };
}

export function newJobId(): string {
  return `job-${randomBytes(8).toString("hex")}`;
}
