/**
 * GatewayDecisionStore — durable ACCEPTED_PENDING decisions that survive restart.
 */

import type { PgQueryable } from "./pg/client.js";
import type { DurableGatewayDecision } from "./execution-types.js";

export type GatewayDecisionStore = {
  put(decision: DurableGatewayDecision): Promise<DurableGatewayDecision>;
  get(operationId: string): Promise<DurableGatewayDecision | undefined>;
  list(): Promise<DurableGatewayDecision[]>;
};

function rowToDecision(row: Record<string, unknown>): DurableGatewayDecision {
  return {
    decisionId: String(row.decision_id),
    operationId: String(row.operation_id),
    payloadDigest: String(row.payload_digest),
    allowed: Boolean(row.allowed),
    code: row.code == null ? null : String(row.code),
    reason: String(row.reason),
    grantId: row.grant_id == null ? null : String(row.grant_id),
    policyId: row.policy_id == null ? null : String(row.policy_id),
    decidedAtIso: new Date(String(row.decided_at)).toISOString(),
    effectState: String(row.effect_state),
    outcome: row.outcome as DurableGatewayDecision["outcome"],
    writePathId: row.write_path_id == null ? null : String(row.write_path_id),
    gateDetails: Array.isArray(row.gate_details_json)
      ? (row.gate_details_json as string[])
      : JSON.parse(String(row.gate_details_json ?? "[]")),
  };
}

export function createMemoryGatewayDecisionStore(): GatewayDecisionStore {
  const byOp = new Map<string, DurableGatewayDecision>();
  return {
    async put(decision) {
      byOp.set(decision.operationId, decision);
      return decision;
    },
    async get(operationId) {
      return byOp.get(operationId);
    },
    async list() {
      return [...byOp.values()];
    },
  };
}

export function createPgGatewayDecisionStore(
  db: PgQueryable,
): GatewayDecisionStore {
  return {
    async put(decision) {
      const result = await db.query(
        `INSERT INTO core.gateway_decisions (
           operation_id, decision_id, payload_digest, allowed, code, reason,
           grant_id, policy_id, decided_at, effect_state, outcome,
           write_path_id, gate_details_json
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10,$11,$12,$13::jsonb
         )
         ON CONFLICT (operation_id) DO UPDATE SET
           decision_id = EXCLUDED.decision_id,
           payload_digest = EXCLUDED.payload_digest,
           allowed = EXCLUDED.allowed,
           code = EXCLUDED.code,
           reason = EXCLUDED.reason,
           grant_id = EXCLUDED.grant_id,
           policy_id = EXCLUDED.policy_id,
           decided_at = EXCLUDED.decided_at,
           effect_state = EXCLUDED.effect_state,
           outcome = EXCLUDED.outcome,
           write_path_id = EXCLUDED.write_path_id,
           gate_details_json = EXCLUDED.gate_details_json,
           updated_at = now()
         RETURNING *`,
        [
          decision.operationId,
          decision.decisionId,
          decision.payloadDigest,
          decision.allowed,
          decision.code,
          decision.reason,
          decision.grantId,
          decision.policyId,
          decision.decidedAtIso,
          decision.effectState,
          decision.outcome,
          decision.writePathId,
          JSON.stringify(decision.gateDetails),
        ],
      );
      return rowToDecision(result.rows[0] as Record<string, unknown>);
    },

    async get(operationId) {
      const result = await db.query(
        `SELECT * FROM core.gateway_decisions WHERE operation_id = $1`,
        [operationId],
      );
      return result.rows[0]
        ? rowToDecision(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async list() {
      const result = await db.query(
        `SELECT * FROM core.gateway_decisions ORDER BY decided_at`,
      );
      return result.rows.map((row) =>
        rowToDecision(row as Record<string, unknown>),
      );
    },
  };
}
