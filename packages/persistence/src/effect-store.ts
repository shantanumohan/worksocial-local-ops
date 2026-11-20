/**
 * EffectStore — durable effect intents + attempt ledger.
 * Memory implementation mirrors SimulatedEffectLedger semantics for fixtures.
 */

import { randomBytes } from "node:crypto";
import type { EffectOutcome } from "@worksocial/domain";
import type { PgQueryable } from "./pg/client.js";
import type {
  DurableEffectIntent,
  EffectAttemptPhase,
  EffectAttemptRecord,
  EffectAttemptStatus,
  EffectIntentInput,
} from "./execution-types.js";

const TERMINAL: ReadonlySet<EffectOutcome> = new Set([
  "VERIFIED",
  "RECONCILED_SKIPPED",
]);

const OUTCOME_RANK: Record<EffectOutcome, number> = {
  INTENDED: 0,
  ACCEPTED_PENDING: 1,
  UNKNOWN_REMOTE_OUTCOME: 2,
  FAILED: 3,
  RECONCILED_SKIPPED: 4,
  VERIFIED: 5,
};

export type EffectStore = {
  recordIntent(input: EffectIntentInput): Promise<DurableEffectIntent>;
  settle(
    operationId: string,
    outcome: Exclude<EffectOutcome, "INTENDED">,
    effectState?: string,
  ): Promise<DurableEffectIntent>;
  get(operationId: string): Promise<DurableEffectIntent | undefined>;
  list(): Promise<DurableEffectIntent[]>;
  recordAttempt(input: {
    operationId: string;
    attemptNumber: number;
    phase: EffectAttemptPhase;
    status: EffectAttemptStatus;
    detail?: string;
    providerReceiptId?: string | null;
  }): Promise<EffectAttemptRecord>;
  listAttempts(operationId: string): Promise<EffectAttemptRecord[]>;
  countApplyAttempts(operationId: string): Promise<number>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function rowToIntent(row: Record<string, unknown>): DurableEffectIntent {
  return {
    operationId: String(row.operation_id),
    payloadDigest: String(row.payload_digest),
    outcome: row.outcome as EffectOutcome,
    recordedAtIso: new Date(String(row.recorded_at)).toISOString(),
    jobId: row.job_id == null ? null : String(row.job_id),
    effectState: String(row.effect_state),
    businessIdempotencyKey:
      row.business_idempotency_key == null
        ? null
        : String(row.business_idempotency_key),
    updatedAtIso: new Date(String(row.updated_at)).toISOString(),
  };
}

function rowToAttempt(row: Record<string, unknown>): EffectAttemptRecord {
  return {
    attemptId: String(row.attempt_id),
    operationId: String(row.operation_id),
    attemptNumber: Number(row.attempt_number),
    phase: row.phase as EffectAttemptPhase,
    status: row.status as EffectAttemptStatus,
    detail: String(row.detail ?? ""),
    providerReceiptId:
      row.provider_receipt_id == null ? null : String(row.provider_receipt_id),
    createdAtIso: new Date(String(row.created_at)).toISOString(),
  };
}

export function createMemoryEffectStore(): EffectStore {
  const intents = new Map<string, DurableEffectIntent>();
  const attempts = new Map<string, EffectAttemptRecord[]>();

  return {
    async recordIntent(input) {
      const existing = intents.get(input.operationId);
      if (existing) {
        if (existing.payloadDigest !== input.payloadDigest) {
          throw new Error(
            `Operation ${input.operationId} already recorded with a different payload digest`,
          );
        }
        return existing;
      }
      const stamp = input.recordedAtIso;
      const record: DurableEffectIntent = {
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        outcome: input.outcome ?? "INTENDED",
        recordedAtIso: stamp,
        jobId: input.jobId ?? null,
        effectState: input.effectState ?? "QUEUED",
        businessIdempotencyKey: input.businessIdempotencyKey ?? null,
        updatedAtIso: stamp,
      };
      intents.set(record.operationId, record);
      return record;
    },

    async settle(operationId, outcome, effectState) {
      const existing = intents.get(operationId);
      if (!existing) throw new Error(`Unknown operation ${operationId}`);
      if (TERMINAL.has(existing.outcome)) {
        if (existing.outcome === outcome) return existing;
        throw new Error(
          `Operation ${operationId} is terminal (${existing.outcome}); cannot settle to ${outcome}`,
        );
      }
      if (OUTCOME_RANK[outcome] < OUTCOME_RANK[existing.outcome]) {
        throw new Error(
          `Operation ${operationId} cannot regress from ${existing.outcome} to ${outcome}`,
        );
      }
      const updated: DurableEffectIntent = {
        ...existing,
        outcome,
        effectState: effectState ?? existing.effectState,
        updatedAtIso: nowIso(),
      };
      intents.set(operationId, updated);
      return updated;
    },

    async get(operationId) {
      return intents.get(operationId);
    },

    async list() {
      return [...intents.values()];
    },

    async recordAttempt(input) {
      const list = attempts.get(input.operationId) ?? [];
      const record: EffectAttemptRecord = {
        attemptId: `att-${randomBytes(6).toString("hex")}`,
        operationId: input.operationId,
        attemptNumber: input.attemptNumber,
        phase: input.phase,
        status: input.status,
        detail: input.detail ?? "",
        providerReceiptId: input.providerReceiptId ?? null,
        createdAtIso: nowIso(),
      };
      list.push(record);
      attempts.set(input.operationId, list);
      return record;
    },

    async listAttempts(operationId) {
      return [...(attempts.get(operationId) ?? [])];
    },

    async countApplyAttempts(operationId) {
      return (attempts.get(operationId) ?? []).filter(
        (a) => a.phase === "apply" && a.status === "succeeded",
      ).length;
    },
  };
}

export function createPgEffectStore(db: PgQueryable): EffectStore {
  return {
    async recordIntent(input) {
      const result = await db.query(
        `INSERT INTO core.effect_intents (
           operation_id, job_id, payload_digest, outcome, effect_state,
           business_idempotency_key, recorded_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz,$7::timestamptz)
         ON CONFLICT (operation_id) DO UPDATE SET
           operation_id = EXCLUDED.operation_id
         RETURNING *`,
        [
          input.operationId,
          input.jobId ?? null,
          input.payloadDigest,
          input.outcome ?? "INTENDED",
          input.effectState ?? "QUEUED",
          input.businessIdempotencyKey ?? null,
          input.recordedAtIso,
        ],
      );
      const row = result.rows[0] as Record<string, unknown>;
      const intent = rowToIntent(row);
      if (intent.payloadDigest !== input.payloadDigest) {
        throw new Error(
          `Operation ${input.operationId} already recorded with a different payload digest`,
        );
      }
      return intent;
    },

    async settle(operationId, outcome, effectState) {
      const existingResult = await db.query(
        `SELECT * FROM core.effect_intents WHERE operation_id = $1 FOR UPDATE`,
        [operationId],
      );
      if (!existingResult.rows[0]) {
        throw new Error(`Unknown operation ${operationId}`);
      }
      const existing = rowToIntent(
        existingResult.rows[0] as Record<string, unknown>,
      );
      if (TERMINAL.has(existing.outcome)) {
        if (existing.outcome === outcome) return existing;
        throw new Error(
          `Operation ${operationId} is terminal (${existing.outcome}); cannot settle to ${outcome}`,
        );
      }
      if (OUTCOME_RANK[outcome] < OUTCOME_RANK[existing.outcome]) {
        throw new Error(
          `Operation ${operationId} cannot regress from ${existing.outcome} to ${outcome}`,
        );
      }
      const result = await db.query(
        `UPDATE core.effect_intents
         SET outcome = $2,
             effect_state = COALESCE($3, effect_state),
             updated_at = now()
         WHERE operation_id = $1
         RETURNING *`,
        [operationId, outcome, effectState ?? null],
      );
      return rowToIntent(result.rows[0] as Record<string, unknown>);
    },

    async get(operationId) {
      const result = await db.query(
        `SELECT * FROM core.effect_intents WHERE operation_id = $1`,
        [operationId],
      );
      return result.rows[0]
        ? rowToIntent(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async list() {
      const result = await db.query(
        `SELECT * FROM core.effect_intents ORDER BY recorded_at`,
      );
      return result.rows.map((row) =>
        rowToIntent(row as Record<string, unknown>),
      );
    },

    async recordAttempt(input) {
      const attemptId = `att-${randomBytes(6).toString("hex")}`;
      const result = await db.query(
        `INSERT INTO core.effect_attempts (
           attempt_id, operation_id, attempt_number, phase, status, detail, provider_receipt_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [
          attemptId,
          input.operationId,
          input.attemptNumber,
          input.phase,
          input.status,
          input.detail ?? "",
          input.providerReceiptId ?? null,
        ],
      );
      return rowToAttempt(result.rows[0] as Record<string, unknown>);
    },

    async listAttempts(operationId) {
      const result = await db.query(
        `SELECT * FROM core.effect_attempts
         WHERE operation_id = $1
         ORDER BY attempt_number, created_at`,
        [operationId],
      );
      return result.rows.map((row) =>
        rowToAttempt(row as Record<string, unknown>),
      );
    },

    async countApplyAttempts(operationId) {
      const result = await db.query(
        `SELECT COUNT(*)::int AS n FROM core.effect_attempts
         WHERE operation_id = $1 AND phase = 'apply' AND status = 'succeeded'`,
        [operationId],
      );
      return Number(result.rows[0]?.n ?? 0);
    },
  };
}
