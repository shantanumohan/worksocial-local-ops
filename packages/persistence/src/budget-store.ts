/**
 * BudgetStore — transactional reservations with race-safe exhaustion checks.
 */

import { randomBytes } from "node:crypto";
import type { PgPool, PgQueryable } from "./pg/client.js";
import { withTransaction } from "./pg/client.js";
import type {
  DurableBudgetAccount,
  DurableBudgetReservation,
} from "./execution-types.js";

export type BudgetReserveResult =
  | { ok: true; account: DurableBudgetAccount; reservation: DurableBudgetReservation }
  | { ok: false; code: "BUDGET_EXHAUSTED"; availableMinor: number };

export type BudgetSettleResult =
  | {
      ok: true;
      account: DurableBudgetAccount;
      reservation: DurableBudgetReservation;
      replayed: boolean;
    }
  | { ok: false; code: "UNKNOWN_RESERVATION"; reservationId: string };

export type BudgetStore = {
  ensureAccount(input: {
    accountId?: string;
    dayKey: string;
    currency: string;
    limitMinor: number;
  }): Promise<DurableBudgetAccount>;
  getAccount(accountId: string): Promise<DurableBudgetAccount | undefined>;
  reserve(input: {
    accountId: string;
    reservationId: string;
    amountMinor: number;
    jobId?: string | null;
    operationId?: string | null;
  }): Promise<BudgetReserveResult>;
  settle(input: {
    reservationId: string;
    actualMinor: number;
  }): Promise<BudgetSettleResult>;
  getReservation(
    reservationId: string,
  ): Promise<DurableBudgetReservation | undefined>;
};

function rowToAccount(row: Record<string, unknown>): DurableBudgetAccount {
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
}

function rowToReservation(
  row: Record<string, unknown>,
): DurableBudgetReservation {
  return {
    reservationId: String(row.reservation_id),
    accountId: String(row.account_id),
    amountMinor: Number(row.amount_minor),
    status: row.status as DurableBudgetReservation["status"],
    actualMinor: row.actual_minor == null ? null : Number(row.actual_minor),
    jobId: row.job_id == null ? null : String(row.job_id),
    operationId: row.operation_id == null ? null : String(row.operation_id),
    createdAtIso: new Date(String(row.created_at)).toISOString(),
    settledAtIso:
      row.settled_at == null
        ? null
        : new Date(String(row.settled_at)).toISOString(),
  };
}

export function createMemoryBudgetStore(): BudgetStore {
  const accounts = new Map<string, DurableBudgetAccount>();
  const reservations = new Map<string, DurableBudgetReservation>();
  const byDayCurrency = new Map<string, string>();

  return {
    async ensureAccount(input) {
      const key = `${input.dayKey}|${input.currency}`;
      const existingId = byDayCurrency.get(key);
      if (existingId) return accounts.get(existingId)!;
      const stamp = new Date().toISOString();
      const account: DurableBudgetAccount = {
        accountId: input.accountId ?? `ba-${randomBytes(6).toString("hex")}`,
        dayKey: input.dayKey,
        currency: input.currency,
        limitMinor: input.limitMinor,
        reservedMinor: 0,
        settledMinor: 0,
        createdAtIso: stamp,
        updatedAtIso: stamp,
      };
      accounts.set(account.accountId, account);
      byDayCurrency.set(key, account.accountId);
      return account;
    },

    async getAccount(accountId) {
      return accounts.get(accountId);
    },

    async reserve(input) {
      const prior = reservations.get(input.reservationId);
      if (prior) {
        if (
          prior.accountId !== input.accountId ||
          prior.amountMinor !== input.amountMinor
        ) {
          throw new Error(
            `Reservation ${input.reservationId} already exists with different parameters`,
          );
        }
        const account = accounts.get(prior.accountId)!;
        return { ok: true, account, reservation: prior };
      }
      const account = accounts.get(input.accountId);
      if (!account) throw new Error(`Unknown budget account ${input.accountId}`);
      const available =
        account.limitMinor - account.reservedMinor - account.settledMinor;
      if (input.amountMinor > available) {
        return { ok: false, code: "BUDGET_EXHAUSTED", availableMinor: available };
      }
      const stamp = new Date().toISOString();
      const updated: DurableBudgetAccount = {
        ...account,
        reservedMinor: account.reservedMinor + input.amountMinor,
        updatedAtIso: stamp,
      };
      const reservation: DurableBudgetReservation = {
        reservationId: input.reservationId,
        accountId: input.accountId,
        amountMinor: input.amountMinor,
        status: "open",
        actualMinor: null,
        jobId: input.jobId ?? null,
        operationId: input.operationId ?? null,
        createdAtIso: stamp,
        settledAtIso: null,
      };
      accounts.set(account.accountId, updated);
      reservations.set(reservation.reservationId, reservation);
      return { ok: true, account: updated, reservation };
    },

    async settle(input) {
      if (input.actualMinor < 0) {
        throw new Error("Amounts must be non-negative");
      }
      const reservation = reservations.get(input.reservationId);
      if (!reservation) {
        return { ok: false, code: "UNKNOWN_RESERVATION", reservationId: input.reservationId };
      }
      const account = accounts.get(reservation.accountId)!;
      if (reservation.status === "settled") {
        if (reservation.actualMinor !== input.actualMinor) {
          throw new Error(
            `Reservation ${input.reservationId} already settled with actual ${reservation.actualMinor}`,
          );
        }
        return { ok: true, account, reservation, replayed: true };
      }
      const stamp = new Date().toISOString();
      const updatedAccount: DurableBudgetAccount = {
        ...account,
        reservedMinor: account.reservedMinor - reservation.amountMinor,
        settledMinor: account.settledMinor + input.actualMinor,
        updatedAtIso: stamp,
      };
      const updatedReservation: DurableBudgetReservation = {
        ...reservation,
        status: "settled",
        actualMinor: input.actualMinor,
        settledAtIso: stamp,
      };
      accounts.set(account.accountId, updatedAccount);
      reservations.set(reservation.reservationId, updatedReservation);
      return {
        ok: true,
        account: updatedAccount,
        reservation: updatedReservation,
        replayed: false,
      };
    },

    async getReservation(reservationId) {
      return reservations.get(reservationId);
    },
  };
}

async function ensureAccountPg(
  db: PgQueryable,
  input: {
    accountId?: string;
    dayKey: string;
    currency: string;
    limitMinor: number;
  },
): Promise<DurableBudgetAccount> {
  const existing = await db.query(
    `SELECT * FROM measure.budget_accounts WHERE day_key = $1 AND currency = $2`,
    [input.dayKey, input.currency],
  );
  if (existing.rows[0]) {
    return rowToAccount(existing.rows[0] as Record<string, unknown>);
  }
  const accountId = input.accountId ?? `ba-${randomBytes(6).toString("hex")}`;
  const result = await db.query(
    `INSERT INTO measure.budget_accounts (
       account_id, day_key, currency, limit_minor
     ) VALUES ($1,$2,$3,$4)
     ON CONFLICT (day_key, currency) DO UPDATE SET day_key = EXCLUDED.day_key
     RETURNING *`,
    [accountId, input.dayKey, input.currency, input.limitMinor],
  );
  return rowToAccount(result.rows[0] as Record<string, unknown>);
}

export function createPgBudgetStore(pool: PgPool): BudgetStore {
  return {
    async ensureAccount(input) {
      return ensureAccountPg(pool, input);
    },

    async getAccount(accountId) {
      const result = await pool.query(
        `SELECT * FROM measure.budget_accounts WHERE account_id = $1`,
        [accountId],
      );
      return result.rows[0]
        ? rowToAccount(result.rows[0] as Record<string, unknown>)
        : undefined;
    },

    async reserve(input) {
      return withTransaction(pool, async (client) => {
        const existingReservation = await client.query(
          `SELECT * FROM measure.budget_reservations WHERE reservation_id = $1 FOR UPDATE`,
          [input.reservationId],
        );
        if (existingReservation.rows[0]) {
          const reservation = rowToReservation(
            existingReservation.rows[0] as Record<string, unknown>,
          );
          if (
            reservation.accountId !== input.accountId ||
            reservation.amountMinor !== input.amountMinor
          ) {
            throw new Error(
              `Reservation ${input.reservationId} already exists with different parameters`,
            );
          }
          const accountResult = await client.query(
            `SELECT * FROM measure.budget_accounts WHERE account_id = $1`,
            [input.accountId],
          );
          if (!accountResult.rows[0]) {
            throw new Error(`Unknown budget account ${input.accountId}`);
          }
          return {
            ok: true as const,
            account: rowToAccount(
              accountResult.rows[0] as Record<string, unknown>,
            ),
            reservation,
          };
        }

        const accountResult = await client.query(
          `SELECT * FROM measure.budget_accounts WHERE account_id = $1 FOR UPDATE`,
          [input.accountId],
        );
        if (!accountResult.rows[0]) {
          throw new Error(`Unknown budget account ${input.accountId}`);
        }
        const account = rowToAccount(
          accountResult.rows[0] as Record<string, unknown>,
        );
        const available =
          account.limitMinor - account.reservedMinor - account.settledMinor;
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
        return {
          ok: true as const,
          account: rowToAccount(
            updatedAccountResult.rows[0] as Record<string, unknown>,
          ),
          reservation: rowToReservation(
            reservationResult.rows[0] as Record<string, unknown>,
          ),
        };
      });
    },

    async settle(input) {
      if (input.actualMinor < 0) {
        throw new Error("Amounts must be non-negative");
      }
      return withTransaction(pool, async (client) => {
        const reservationResult = await client.query(
          `SELECT * FROM measure.budget_reservations WHERE reservation_id = $1 FOR UPDATE`,
          [input.reservationId],
        );
        if (!reservationResult.rows[0]) {
          return {
            ok: false as const,
            code: "UNKNOWN_RESERVATION" as const,
            reservationId: input.reservationId,
          };
        }
        const reservation = rowToReservation(
          reservationResult.rows[0] as Record<string, unknown>,
        );
        const accountResult = await client.query(
          `SELECT * FROM measure.budget_accounts WHERE account_id = $1 FOR UPDATE`,
          [reservation.accountId],
        );
        const account = rowToAccount(
          accountResult.rows[0] as Record<string, unknown>,
        );
        if (reservation.status === "settled") {
          if (reservation.actualMinor !== input.actualMinor) {
            throw new Error(
              `Reservation ${input.reservationId} already settled with actual ${reservation.actualMinor}`,
            );
          }
          return { ok: true as const, account, reservation, replayed: true };
        }
        const updatedReservation = await client.query(
          `UPDATE measure.budget_reservations
           SET status = 'settled', actual_minor = $2, settled_at = now()
           WHERE reservation_id = $1
           RETURNING *`,
          [input.reservationId, input.actualMinor],
        );
        const updatedAccount = await client.query(
          `UPDATE measure.budget_accounts
           SET reserved_minor = reserved_minor - $2,
               settled_minor = settled_minor + $3,
               updated_at = now()
           WHERE account_id = $1
           RETURNING *`,
          [reservation.accountId, reservation.amountMinor, input.actualMinor],
        );
        return {
          ok: true as const,
          account: rowToAccount(updatedAccount.rows[0] as Record<string, unknown>),
          reservation: rowToReservation(
            updatedReservation.rows[0] as Record<string, unknown>,
          ),
          replayed: false,
        };
      });
    },

    async getReservation(reservationId) {
      const result = await pool.query(
        `SELECT * FROM measure.budget_reservations WHERE reservation_id = $1`,
        [reservationId],
      );
      return result.rows[0]
        ? rowToReservation(result.rows[0] as Record<string, unknown>)
        : undefined;
    },
  };
}
