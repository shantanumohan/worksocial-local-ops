/**
 * Durable execution facade (M2 first slice).
 * Transaction contract:
 *   accept(stable key) → job + effect intent + outbox + budget reserve
 *   → fake-provider apply (once) → ACCEPTED_PENDING (ack ≠ verified)
 *   → independent read receipt → VERIFIED without a second apply
 */

import { randomBytes } from "node:crypto";
import type { PgPool, PgClient } from "./pg/client.js";
import { withTransaction } from "./pg/client.js";
import {
  createMemoryBudgetStore,
  createPgBudgetStore,
  type BudgetStore,
} from "./budget-store.js";
import {
  createMemoryEffectStore,
  createPgEffectStore,
  type EffectStore,
} from "./effect-store.js";
import {
  createMemoryFakeProviderStore,
  createPgFakeProviderStore,
  type FakeProviderStore,
} from "./fake-provider-store.js";
import {
  createMemoryGatewayDecisionStore,
  createPgGatewayDecisionStore,
  type GatewayDecisionStore,
} from "./gateway-decision-store.js";
import {
  createMemoryJobStore,
  createPgJobStore,
  newJobId,
  type JobStore,
} from "./job-store.js";
import {
  createMemoryReceiptStore,
  createPgReceiptStore,
  type ReceiptStore,
} from "./receipt-store.js";
import type {
  DurableBudgetAccount,
  DurableBudgetReservation,
  DurableEffectIntent,
  DurableGatewayDecision,
  DurableJobRecord,
  ExecutionReceipt,
  FakeProviderEffect,
  JobInsertInput,
  OutboxEvent,
} from "./execution-types.js";

export type DurableExecutionStores = {
  jobs: JobStore;
  effects: EffectStore;
  decisions: GatewayDecisionStore;
  receipts: ReceiptStore;
  budgets: BudgetStore;
  fakeProvider: FakeProviderStore;
};

export type AcceptPendingInput = {
  job: JobInsertInput;
  operationId: string;
  payloadDigest: string;
  businessIdempotencyKey: string;
  decision: Omit<DurableGatewayDecision, "outcome" | "effectState"> & {
    outcome?: DurableGatewayDecision["outcome"];
    effectState?: string;
  };
  budget?: {
    accountId: string;
    reservationId: string;
    amountMinor: number;
  };
  nowIso: string;
};

export type AcceptPendingResult = {
  job: DurableJobRecord;
  jobCreated: boolean;
  intent: DurableEffectIntent;
  decision: DurableGatewayDecision;
  provider: FakeProviderEffect;
  providerCreated: boolean;
  reservation: DurableBudgetReservation | null;
  account: DurableBudgetAccount | null;
  applyAttemptCount: number;
};

export type VerifyIndependentInput = {
  operationId: string;
  observedDigest: string;
  observedPayload?: Record<string, unknown>;
  nowIso: string;
};

export type VerifyIndependentResult = {
  decision: DurableGatewayDecision;
  intent: DurableEffectIntent;
  receipt: ExecutionReceipt;
  provider: FakeProviderEffect | undefined;
  applyAttemptCount: number;
  /** false when independent read mismatched; failure state is already committed. */
  matched: boolean;
};

export type DurableExecutionService = {
  readonly stores: DurableExecutionStores;
  acceptPending(input: AcceptPendingInput): Promise<AcceptPendingResult>;
  verifyIndependent(
    input: VerifyIndependentInput,
  ): Promise<VerifyIndependentResult>;
  getDecision(
    operationId: string,
  ): Promise<DurableGatewayDecision | undefined>;
};

export function createMemoryDurableStores(): DurableExecutionStores {
  return {
    jobs: createMemoryJobStore(),
    effects: createMemoryEffectStore(),
    decisions: createMemoryGatewayDecisionStore(),
    receipts: createMemoryReceiptStore(),
    budgets: createMemoryBudgetStore(),
    fakeProvider: createMemoryFakeProviderStore(),
  };
}

export function createPgDurableStores(pool: PgPool): DurableExecutionStores {
  return {
    jobs: createPgJobStore(pool),
    effects: createPgEffectStore(pool),
    decisions: createPgGatewayDecisionStore(pool),
    receipts: createPgReceiptStore(pool),
    budgets: createPgBudgetStore(pool),
    fakeProvider: createPgFakeProviderStore(pool),
  };
}

function createTxBudgetStore(client: PgClient): BudgetStore {
  return {
    async ensureAccount() {
      throw new Error("ensureAccount must run outside the accept transaction");
    },
    async getAccount(accountId) {
      const result = await client.query(
        `SELECT * FROM measure.budget_accounts WHERE account_id = $1`,
        [accountId],
      );
      if (!result.rows[0]) return undefined;
      const row = result.rows[0] as Record<string, unknown>;
      return {
        accountId: String(row.account_id),
        dayKey: String(row.day_key),
        currency: String(row.currency),
        limitMinor: Number(row.limit_minor),
        reservedMinor: Number(row.reserved_minor),
        settledMinor: Number(row.settled_minor),
        createdAtIso: new Date(String(row.created_at)).toISOString(),
        updatedAtIso: new Date(String(row.updated_at)).toISOString(),
      };
    },
    async reserve(input) {
      const existingReservation = await client.query(
        `SELECT * FROM measure.budget_reservations WHERE reservation_id = $1 FOR UPDATE`,
        [input.reservationId],
      );
      if (existingReservation.rows[0]) {
        const resRow = existingReservation.rows[0] as Record<string, unknown>;
        if (
          String(resRow.account_id) !== input.accountId ||
          Number(resRow.amount_minor) !== input.amountMinor
        ) {
          throw new Error(
            `Reservation ${input.reservationId} already exists with different parameters`,
          );
        }
        const accountResult = await client.query(
          `SELECT * FROM measure.budget_accounts WHERE account_id = $1`,
          [input.accountId],
        );
        const accountRow = accountResult.rows[0] as Record<string, unknown>;
        return {
          ok: true as const,
          account: {
            accountId: String(accountRow.account_id),
            dayKey: String(accountRow.day_key),
            currency: String(accountRow.currency),
            limitMinor: Number(accountRow.limit_minor),
            reservedMinor: Number(accountRow.reserved_minor),
            settledMinor: Number(accountRow.settled_minor),
            createdAtIso: new Date(String(accountRow.created_at)).toISOString(),
            updatedAtIso: new Date(String(accountRow.updated_at)).toISOString(),
          },
          reservation: {
            reservationId: String(resRow.reservation_id),
            accountId: String(resRow.account_id),
            amountMinor: Number(resRow.amount_minor),
            status: resRow.status as "open" | "settled" | "released",
            actualMinor:
              resRow.actual_minor == null ? null : Number(resRow.actual_minor),
            jobId: resRow.job_id == null ? null : String(resRow.job_id),
            operationId:
              resRow.operation_id == null ? null : String(resRow.operation_id),
            createdAtIso: new Date(String(resRow.created_at)).toISOString(),
            settledAtIso:
              resRow.settled_at == null
                ? null
                : new Date(String(resRow.settled_at)).toISOString(),
          },
        };
      }

      const accountResult = await client.query(
        `SELECT * FROM measure.budget_accounts WHERE account_id = $1 FOR UPDATE`,
        [input.accountId],
      );
      if (!accountResult.rows[0]) {
        throw new Error(`Unknown budget account ${input.accountId}`);
      }
      const row = accountResult.rows[0] as Record<string, unknown>;
      const available =
        Number(row.limit_minor) -
        Number(row.reserved_minor) -
        Number(row.settled_minor);
      if (input.amountMinor > available) {
        return {
          ok: false as const,
          code: "BUDGET_EXHAUSTED" as const,
          availableMinor: available,
        };
      }
      const reservationResult = await client.query(
        `INSERT INTO measure.budget_reservations (
           reservation_id, account_id, amount_minor, status, job_id, operation_id
         ) VALUES ($1,$2,$3,'open',$4,$5)
         RETURNING *`,
        [
          input.reservationId,
          input.accountId,
          input.amountMinor,
          input.jobId ?? null,
          input.operationId ?? null,
        ],
      );
      const updatedAccountResult = await client.query(
        `UPDATE measure.budget_accounts
         SET reserved_minor = reserved_minor + $2, updated_at = now()
         WHERE account_id = $1
         RETURNING *`,
        [input.accountId, input.amountMinor],
      );
      const accountRow = updatedAccountResult.rows[0] as Record<string, unknown>;
      const resRow = reservationResult.rows[0] as Record<string, unknown>;
      return {
        ok: true as const,
        account: {
          accountId: String(accountRow.account_id),
          dayKey: String(accountRow.day_key),
          currency: String(accountRow.currency),
          limitMinor: Number(accountRow.limit_minor),
          reservedMinor: Number(accountRow.reserved_minor),
          settledMinor: Number(accountRow.settled_minor),
          createdAtIso: new Date(String(accountRow.created_at)).toISOString(),
          updatedAtIso: new Date(String(accountRow.updated_at)).toISOString(),
        },
        reservation: {
          reservationId: String(resRow.reservation_id),
          accountId: String(resRow.account_id),
          amountMinor: Number(resRow.amount_minor),
          status: "open" as const,
          actualMinor: null,
          jobId: resRow.job_id == null ? null : String(resRow.job_id),
          operationId:
            resRow.operation_id == null ? null : String(resRow.operation_id),
          createdAtIso: new Date(String(resRow.created_at)).toISOString(),
          settledAtIso: null,
        },
      };
    },
    async settle() {
      throw new Error("settle must use the pool-backed budget store");
    },
    async getReservation(reservationId) {
      const result = await client.query(
        `SELECT * FROM measure.budget_reservations WHERE reservation_id = $1`,
        [reservationId],
      );
      if (!result.rows[0]) return undefined;
      const resRow = result.rows[0] as Record<string, unknown>;
      return {
        reservationId: String(resRow.reservation_id),
        accountId: String(resRow.account_id),
        amountMinor: Number(resRow.amount_minor),
        status: resRow.status as "open" | "settled" | "released",
        actualMinor:
          resRow.actual_minor == null ? null : Number(resRow.actual_minor),
        jobId: resRow.job_id == null ? null : String(resRow.job_id),
        operationId:
          resRow.operation_id == null ? null : String(resRow.operation_id),
        createdAtIso: new Date(String(resRow.created_at)).toISOString(),
        settledAtIso:
          resRow.settled_at == null
            ? null
            : new Date(String(resRow.settled_at)).toISOString(),
      };
    },
  };
}

function createStoresForClient(client: PgClient): DurableExecutionStores {
  return {
    jobs: createPgJobStore(client),
    effects: createPgEffectStore(client),
    decisions: createPgGatewayDecisionStore(client),
    receipts: createPgReceiptStore(client),
    budgets: createTxBudgetStore(client),
    fakeProvider: createPgFakeProviderStore(client),
  };
}

async function writeOutbox(
  client: PgClient,
  event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  },
): Promise<OutboxEvent> {
  const outboxId = `obx-${randomBytes(6).toString("hex")}`;
  const result = await client.query(
    `INSERT INTO core.outbox_events (
       outbox_id, aggregate_type, aggregate_id, event_type, payload_json
     ) VALUES ($1,$2,$3,$4,$5::jsonb)
     RETURNING *`,
    [
      outboxId,
      event.aggregateType,
      event.aggregateId,
      event.eventType,
      JSON.stringify(event.payload),
    ],
  );
  const row = result.rows[0] as Record<string, unknown>;
  return {
    outboxId: String(row.outbox_id),
    aggregateType: String(row.aggregate_type),
    aggregateId: String(row.aggregate_id),
    eventType: String(row.event_type),
    payload:
      typeof row.payload_json === "object" && row.payload_json !== null
        ? (row.payload_json as Record<string, unknown>)
        : {},
    createdAtIso: new Date(String(row.created_at)).toISOString(),
    publishedAtIso: null,
  };
}

async function acceptWithStores(
  stores: DurableExecutionStores,
  input: AcceptPendingInput,
  outboxWriter?: (event: {
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }) => Promise<OutboxEvent>,
): Promise<AcceptPendingResult> {
  if (input.decision.allowed === false) {
    throw new Error(
      `Denied decision cannot accept an effect for ${input.operationId}`,
    );
  }

  // Idempotent replay: already ACCEPTED_PENDING/VERIFIED → return without re-apply.
  // Same operation / business key with a different payload digest is Conflict.
  const existingDecision = await stores.decisions.get(input.operationId);
  if (
    existingDecision &&
    (existingDecision.outcome === "ACCEPTED_PENDING" ||
      existingDecision.outcome === "VERIFIED")
  ) {
    const intent = (await stores.effects.get(input.operationId))!;
    const provider = (await stores.fakeProvider.getByOperation(
      input.operationId,
    ))!;
    if (
      intent.payloadDigest !== input.payloadDigest ||
      provider.payloadDigest !== input.payloadDigest ||
      existingDecision.payloadDigest !== input.payloadDigest
    ) {
      throw new Error(
        `Idempotency key payload mismatch for ${input.operationId}: bound digest differs from request`,
      );
    }
    if (
      provider.businessIdempotencyKey !== input.businessIdempotencyKey ||
      (intent.businessIdempotencyKey != null &&
        intent.businessIdempotencyKey !== input.businessIdempotencyKey)
    ) {
      throw new Error(
        `Business idempotency key mismatch for ${input.operationId}`,
      );
    }
    let reservation: DurableBudgetReservation | null = null;
    let account: DurableBudgetAccount | null = null;
    if (input.budget) {
      const reserved = await stores.budgets.reserve({
        accountId: input.budget.accountId,
        reservationId: input.budget.reservationId,
        amountMinor: input.budget.amountMinor,
        jobId: intent.jobId,
        operationId: input.operationId,
      });
      if (!reserved.ok) {
        throw new Error(
          `BUDGET_EXHAUSTED available=${reserved.availableMinor}`,
        );
      }
      reservation = reserved.reservation;
      account = reserved.account;
    }
    const job =
      (intent.jobId
        ? await stores.jobs.get(intent.jobId)
        : undefined) ??
      (
        await stores.jobs.insertIdempotent({
          ...input.job,
          status: input.job.status ?? "queued",
        })
      ).job;
    return {
      job,
      jobCreated: false,
      intent,
      decision: existingDecision,
      provider,
      providerCreated: false,
      reservation,
      account,
      applyAttemptCount: await stores.effects.countApplyAttempts(
        input.operationId,
      ),
    };
  }

  const { job, created: jobCreated } = await stores.jobs.insertIdempotent({
    ...input.job,
    status: input.job.status ?? "queued",
  });

  await stores.effects.recordIntent({
    operationId: input.operationId,
    payloadDigest: input.payloadDigest,
    recordedAtIso: input.nowIso,
    jobId: job.jobId,
    effectState: "APPLYING",
    businessIdempotencyKey: input.businessIdempotencyKey,
  });

  const provider = await stores.fakeProvider.applyOnce({
    businessIdempotencyKey: input.businessIdempotencyKey,
    operationId: input.operationId,
    payloadDigest: input.payloadDigest,
  });

  if (provider.created) {
    await stores.effects.recordAttempt({
      operationId: input.operationId,
      attemptNumber: 1,
      phase: "apply",
      status: "succeeded",
      detail: "fake-provider apply",
      providerReceiptId: provider.effect.providerEffectId,
    });
  }

  const settled = await stores.effects.settle(
    input.operationId,
    "ACCEPTED_PENDING",
    "VERIFYING",
  );

  const decision: DurableGatewayDecision = {
    ...input.decision,
    allowed: true,
    outcome: "ACCEPTED_PENDING",
    effectState: "VERIFYING",
    payloadDigest: input.payloadDigest,
    operationId: input.operationId,
  };
  await stores.decisions.put(decision);

  await stores.receipts.add({
    operationId: input.operationId,
    kind: "provider_ack",
    observedDigest: input.payloadDigest,
    observedPayload: {
      remoteRef: provider.effect.remoteRef,
      providerEffectId: provider.effect.providerEffectId,
    },
    verdict: "ACCEPTED_PENDING",
    detail: provider.created
      ? "Provider accepted (first apply)"
      : "Provider ack replayed; no second apply",
    recordedAtIso: input.nowIso,
  });

  let reservation: DurableBudgetReservation | null = null;
  let account: DurableBudgetAccount | null = null;
  if (input.budget) {
    const reserved = await stores.budgets.reserve({
      accountId: input.budget.accountId,
      reservationId: input.budget.reservationId,
      amountMinor: input.budget.amountMinor,
      jobId: job.jobId,
      operationId: input.operationId,
    });
    if (!reserved.ok) {
      throw new Error(
        `BUDGET_EXHAUSTED available=${reserved.availableMinor}`,
      );
    }
    reservation = reserved.reservation;
    account = reserved.account;
  }

  if (outboxWriter) {
    await outboxWriter({
      aggregateType: "effect_intent",
      aggregateId: input.operationId,
      eventType: "ACCEPTED_PENDING",
      payload: {
        jobId: job.jobId,
        businessIdempotencyKey: input.businessIdempotencyKey,
        providerEffectId: provider.effect.providerEffectId,
      },
    });
  }

  const applyAttemptCount = await stores.effects.countApplyAttempts(
    input.operationId,
  );

  return {
    job,
    jobCreated,
    intent: settled,
    decision,
    provider: provider.effect,
    providerCreated: provider.created,
    reservation,
    account,
    applyAttemptCount,
  };
}

export function createDurableExecutionService(
  stores: DurableExecutionStores,
): DurableExecutionService {
  return {
    stores,
    async acceptPending(input) {
      return acceptWithStores(stores, input);
    },
    async verifyIndependent(input) {
      const result = await verifyWithStores(stores, input);
      if (!result.matched && result.decision.outcome === "FAILED") {
        throw new Error(
          `Independent read mismatch for ${input.operationId}`,
        );
      }
      return result;
    },
    async getDecision(operationId) {
      return stores.decisions.get(operationId);
    },
  };
}

/**
 * Postgres-backed service: acceptPending runs in a single transaction.
 */
export function createPgDurableExecutionService(
  pool: PgPool,
): DurableExecutionService {
  const stores = createPgDurableStores(pool);
  return {
    stores,
    async acceptPending(input) {
      return withTransaction(pool, async (client) => {
        const txStores = createStoresForClient(client);
        return acceptWithStores(txStores, input, (event) =>
          writeOutbox(client, event),
        );
      });
    },
    async verifyIndependent(input) {
      const result = await withTransaction(pool, async (client) => {
        const txStores = createStoresForClient(client);
        return verifyWithStores(txStores, input);
      });
      // Mismatch evidence is committed above; surface the error after COMMIT.
      if (!result.matched && result.decision.outcome === "FAILED") {
        throw new Error(
          `Independent read mismatch for ${input.operationId}`,
        );
      }
      return result;
    },
    async getDecision(operationId) {
      return stores.decisions.get(operationId);
    },
  };
}

async function verifyWithStores(
  stores: DurableExecutionStores,
  input: VerifyIndependentInput,
): Promise<VerifyIndependentResult> {
  const decision = await stores.decisions.get(input.operationId);
  if (!decision) {
    throw new Error(`Unknown operation ${input.operationId}`);
  }
  if (!decision.allowed) {
    throw new Error(`Denied operation ${input.operationId} cannot be verified`);
  }
  if (decision.outcome === "FAILED") {
    const intent = (await stores.effects.get(input.operationId))!;
    const receipts = await stores.receipts.listForOperation(input.operationId);
    const prior =
      receipts.find((r) => r.kind === "independent_read") ?? receipts[0]!;
    return {
      decision,
      intent,
      receipt: prior,
      provider: await stores.fakeProvider.getByOperation(input.operationId),
      applyAttemptCount: await stores.effects.countApplyAttempts(
        input.operationId,
      ),
      matched: false,
    };
  }
  if (decision.outcome === "VERIFIED") {
    const intent = (await stores.effects.get(input.operationId))!;
    const receipts = await stores.receipts.listForOperation(input.operationId);
    const prior = receipts.find((r) => r.kind === "verification");
    return {
      decision,
      intent,
      receipt: prior!,
      provider: await stores.fakeProvider.getByOperation(input.operationId),
      applyAttemptCount: await stores.effects.countApplyAttempts(
        input.operationId,
      ),
      matched: true,
    };
  }

  // Independent read — never calls fakeProvider.applyOnce again.
  const provider = await stores.fakeProvider.getByOperation(input.operationId);
  const match =
    provider !== undefined && provider.payloadDigest === input.observedDigest;

  const readReceipt = await stores.receipts.add({
    operationId: input.operationId,
    kind: "independent_read",
    observedDigest: input.observedDigest,
    observedPayload: input.observedPayload ?? {},
    verdict: match ? "MATCH" : "MISMATCH",
    detail: match
      ? "Independent read matches provider ledger"
      : "Independent read mismatch",
    recordedAtIso: input.nowIso,
  });

  if (!match) {
    const intent = await stores.effects.settle(
      input.operationId,
      "FAILED",
      "QUARANTINED",
    );
    const failed: DurableGatewayDecision = {
      ...decision,
      outcome: "FAILED",
      effectState: "QUARANTINED",
      decidedAtIso: input.nowIso,
      reason: "Independent read mismatch",
    };
    await stores.decisions.put(failed);
    return {
      decision: failed,
      intent,
      receipt: readReceipt,
      provider,
      applyAttemptCount: await stores.effects.countApplyAttempts(
        input.operationId,
      ),
      matched: false,
    };
  }

  await stores.effects.recordAttempt({
    operationId: input.operationId,
    attemptNumber: 1,
    phase: "verify",
    status: "succeeded",
    detail: "independent read-back",
  });

  const intent = await stores.effects.settle(
    input.operationId,
    "VERIFIED",
    "COMPLETE",
  );
  const verified: DurableGatewayDecision = {
    ...decision,
    outcome: "VERIFIED",
    effectState: "COMPLETE",
    decidedAtIso: input.nowIso,
    reason: "Verified with independent read-back evidence",
  };
  await stores.decisions.put(verified);

  const verificationReceipt = await stores.receipts.add({
    operationId: input.operationId,
    kind: "verification",
    observedDigest: input.observedDigest,
    observedPayload: input.observedPayload ?? {},
    verdict: "MATCH",
    detail: "Verified without a second provider apply",
    recordedAtIso: input.nowIso,
  });

  return {
    decision: verified,
    intent,
    receipt: verificationReceipt,
    provider,
    applyAttemptCount: await stores.effects.countApplyAttempts(
      input.operationId,
    ),
    matched: true,
  };
}

export { newJobId };
