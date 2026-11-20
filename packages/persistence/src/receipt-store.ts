/**
 * ReceiptStore — independent read-back / verification receipts (ACCEPTED ≠ VERIFIED).
 */

import { randomBytes } from "node:crypto";
import type { PgQueryable } from "./pg/client.js";
import type {
  ExecutionReceipt,
  ExecutionReceiptKind,
  ExecutionReceiptVerdict,
} from "./execution-types.js";

export type ReceiptInsertInput = {
  receiptId?: string;
  operationId: string;
  kind: ExecutionReceiptKind;
  observedDigest?: string | null;
  observedPayload?: Record<string, unknown>;
  verdict: ExecutionReceiptVerdict;
  detail?: string;
  recordedAtIso?: string;
};

export type ReceiptStore = {
  add(input: ReceiptInsertInput): Promise<ExecutionReceipt>;
  listForOperation(operationId: string): Promise<ExecutionReceipt[]>;
  get(receiptId: string): Promise<ExecutionReceipt | undefined>;
};

function rowToReceipt(row: Record<string, unknown>): ExecutionReceipt {
  return {
    receiptId: String(row.receipt_id),
    operationId: String(row.operation_id),
    kind: row.kind as ExecutionReceiptKind,
    observedDigest:
      row.observed_digest == null ? null : String(row.observed_digest),
    observedPayload:
      typeof row.observed_payload === "object" && row.observed_payload !== null
        ? (row.observed_payload as Record<string, unknown>)
        : {},
    verdict: row.verdict as ExecutionReceiptVerdict,
    detail: String(row.detail ?? ""),
    recordedAtIso: new Date(String(row.recorded_at)).toISOString(),
  };
}

export function createMemoryReceiptStore(): ReceiptStore {
  const byId = new Map<string, ExecutionReceipt>();
  const byOp = new Map<string, string[]>();

  return {
    async add(input) {
      const receipt: ExecutionReceipt = {
        receiptId: input.receiptId ?? `rcpt-${randomBytes(6).toString("hex")}`,
        operationId: input.operationId,
        kind: input.kind,
        observedDigest: input.observedDigest ?? null,
        observedPayload: input.observedPayload ?? {},
        verdict: input.verdict,
        detail: input.detail ?? "",
        recordedAtIso: input.recordedAtIso ?? new Date().toISOString(),
      };
      byId.set(receipt.receiptId, receipt);
      const list = byOp.get(receipt.operationId) ?? [];
      list.push(receipt.receiptId);
      byOp.set(receipt.operationId, list);
      return receipt;
    },
    async listForOperation(operationId) {
      return (byOp.get(operationId) ?? [])
        .map((id) => byId.get(id)!)
        .filter(Boolean);
    },
    async get(receiptId) {
      return byId.get(receiptId);
    },
  };
}

export function createPgReceiptStore(db: PgQueryable): ReceiptStore {
  return {
    async add(input) {
      const receiptId =
        input.receiptId ?? `rcpt-${randomBytes(6).toString("hex")}`;
      const result = await db.query(
        `INSERT INTO core.execution_receipts (
           receipt_id, operation_id, kind, observed_digest, observed_payload,
           verdict, detail, recorded_at
         ) VALUES (
           $1,$2,$3,$4,$5::jsonb,$6,$7,COALESCE($8::timestamptz, now())
         )
         RETURNING *`,
        [
          receiptId,
          input.operationId,
          input.kind,
          input.observedDigest ?? null,
          JSON.stringify(input.observedPayload ?? {}),
          input.verdict,
          input.detail ?? "",
          input.recordedAtIso ?? null,
        ],
      );
      return rowToReceipt(result.rows[0] as Record<string, unknown>);
    },

    async listForOperation(operationId) {
      const result = await db.query(
        `SELECT * FROM core.execution_receipts
         WHERE operation_id = $1
         ORDER BY recorded_at`,
        [operationId],
      );
      return result.rows.map((row) =>
        rowToReceipt(row as Record<string, unknown>),
      );
    },

    async get(receiptId) {
      const result = await db.query(
        `SELECT * FROM core.execution_receipts WHERE receipt_id = $1`,
        [receiptId],
      );
      return result.rows[0]
        ? rowToReceipt(result.rows[0] as Record<string, unknown>)
        : undefined;
    },
  };
}
