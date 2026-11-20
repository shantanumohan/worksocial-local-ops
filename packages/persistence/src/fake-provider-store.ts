/**
 * Independent fake-provider effect store.
 * Business idempotency key uniqueness: replay returns the same remote_ref
 * without incrementing a second remote mutation (apply_count stays 1 on conflict).
 * External effects: simulator only.
 */

import { randomBytes } from "node:crypto";
import type { PgQueryable } from "./pg/client.js";
import type { FakeProviderEffect } from "./execution-types.js";

export type FakeProviderApplyInput = {
  businessIdempotencyKey: string;
  operationId: string;
  payloadDigest: string;
  remoteRef?: string;
};

export type FakeProviderApplyResult = {
  effect: FakeProviderEffect;
  /** true when this call created the provider row (first apply). */
  created: boolean;
};

export type FakeProviderStore = {
  /**
   * Apply once per business key. Concurrent callers: one insert wins;
   * losers observe the existing row (created=false, apply_count unchanged).
   */
  applyOnce(input: FakeProviderApplyInput): Promise<FakeProviderApplyResult>;
  getByBusinessKey(
    businessIdempotencyKey: string,
  ): Promise<FakeProviderEffect | undefined>;
  getByOperation(
    operationId: string,
  ): Promise<FakeProviderEffect | undefined>;
  list(): Promise<FakeProviderEffect[]>;
};

function rowToEffect(row: Record<string, unknown>): FakeProviderEffect {
  return {
    providerEffectId: String(row.provider_effect_id),
    businessIdempotencyKey: String(row.business_idempotency_key),
    operationId: String(row.operation_id),
    payloadDigest: String(row.payload_digest),
    applyCount: Number(row.apply_count),
    remoteRef: String(row.remote_ref),
    appliedAtIso: new Date(String(row.applied_at)).toISOString(),
    lastSeenAtIso: new Date(String(row.last_seen_at)).toISOString(),
  };
}

export function createMemoryFakeProviderStore(): FakeProviderStore {
  const byKey = new Map<string, FakeProviderEffect>();
  const byOp = new Map<string, string>();

  return {
    async applyOnce(input) {
      const existing = byKey.get(input.businessIdempotencyKey);
      if (existing) {
        if (existing.payloadDigest !== input.payloadDigest) {
          throw new Error(
            `Fake provider key ${input.businessIdempotencyKey} bound to a different payload digest`,
          );
        }
        const touched: FakeProviderEffect = {
          ...existing,
          lastSeenAtIso: new Date().toISOString(),
        };
        byKey.set(input.businessIdempotencyKey, touched);
        return { effect: touched, created: false };
      }
      const stamp = new Date().toISOString();
      const effect: FakeProviderEffect = {
        providerEffectId: `fpe-${randomBytes(6).toString("hex")}`,
        businessIdempotencyKey: input.businessIdempotencyKey,
        operationId: input.operationId,
        payloadDigest: input.payloadDigest,
        applyCount: 1,
        remoteRef:
          input.remoteRef ?? `remote-${randomBytes(4).toString("hex")}`,
        appliedAtIso: stamp,
        lastSeenAtIso: stamp,
      };
      byKey.set(effect.businessIdempotencyKey, effect);
      byOp.set(effect.operationId, effect.businessIdempotencyKey);
      return { effect, created: true };
    },

    async getByBusinessKey(key) {
      return byKey.get(key);
    },

    async getByOperation(operationId) {
      const key = byOp.get(operationId);
      return key ? byKey.get(key) : undefined;
    },

    async list() {
      return [...byKey.values()];
    },
  };
}

export function createPgFakeProviderStore(db: PgQueryable): FakeProviderStore {
  return {
    async applyOnce(input) {
      const providerEffectId = `fpe-${randomBytes(6).toString("hex")}`;
      const remoteRef =
        input.remoteRef ?? `remote-${randomBytes(4).toString("hex")}`;
      const inserted = await db.query(
        `INSERT INTO core.fake_provider_effects (
           provider_effect_id, business_idempotency_key, operation_id,
           payload_digest, apply_count, remote_ref
         ) VALUES ($1,$2,$3,$4,1,$5)
         ON CONFLICT (business_idempotency_key) DO NOTHING
         RETURNING *`,
        [
          providerEffectId,
          input.businessIdempotencyKey,
          input.operationId,
          input.payloadDigest,
          remoteRef,
        ],
      );
      if (inserted.rows[0]) {
        return {
          effect: rowToEffect(inserted.rows[0] as Record<string, unknown>),
          created: true,
        };
      }
      const existing = await db.query(
        `UPDATE core.fake_provider_effects
         SET last_seen_at = now()
         WHERE business_idempotency_key = $1
         RETURNING *`,
        [input.businessIdempotencyKey],
      );
      const effect = rowToEffect(existing.rows[0] as Record<string, unknown>);
      if (effect.payloadDigest !== input.payloadDigest) {
        throw new Error(
          `Fake provider key ${input.businessIdempotencyKey} bound to a different payload digest`,
        );
      }
      return { effect, created: false };
    },

    async getByBusinessKey(key) {
      const result = await db.query(
        `SELECT * FROM core.fake_provider_effects WHERE business_idempotency_key = $1`,
        [key],
      );
      return result.rows[0]
        ? rowToEffect(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async getByOperation(operationId) {
      const result = await db.query(
        `SELECT * FROM core.fake_provider_effects WHERE operation_id = $1`,
        [operationId],
      );
      return result.rows[0]
        ? rowToEffect(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async list() {
      const result = await db.query(
        `SELECT * FROM core.fake_provider_effects ORDER BY applied_at`,
      );
      return result.rows.map((row) =>
        rowToEffect(row as Record<string, unknown>),
      );
    },
  };
}
