/**
 * Budget reservation and honest actual-cost settlement (pure arithmetic).
 * Settlement is reservation-aware: each reservationId settles at most once.
 */

export type BudgetAccount = {
  dayKey: string;
  currency: string;
  limitMinor: number;
  reservedMinor: number;
  settledMinor: number;
  /** Outstanding reservation amounts keyed by reservationId. */
  openReservations: Readonly<Record<string, number>>;
  /** Settled reservation snapshots keyed by reservationId (idempotent replay). */
  settledReservations: Readonly<
    Record<string, { reservedMinor: number; actualMinor: number }>
  >;
};

export type BudgetReservation =
  | { ok: true; account: BudgetAccount; reservationId: string; amountMinor: number }
  | { ok: false; code: "BUDGET_EXHAUSTED"; availableMinor: number };

export type BudgetSettlement =
  | {
      ok: true;
      account: BudgetAccount;
      reservationId: string;
      reservedMinor: number;
      actualMinor: number;
      replayed: boolean;
    }
  | { ok: false; code: "UNKNOWN_RESERVATION"; reservationId: string };

function available(account: BudgetAccount): number {
  return account.limitMinor - account.reservedMinor - account.settledMinor;
}

export function createBudgetAccount(input: {
  dayKey: string;
  currency: string;
  limitMinor: number;
}): BudgetAccount {
  return {
    dayKey: input.dayKey,
    currency: input.currency,
    limitMinor: input.limitMinor,
    reservedMinor: 0,
    settledMinor: 0,
    openReservations: {},
    settledReservations: {},
  };
}

export function reserveBudget(
  account: BudgetAccount,
  reservationId: string,
  amountMinor: number,
): BudgetReservation {
  if (amountMinor <= 0) {
    throw new Error("Reservation amount must be positive");
  }
  if (
    reservationId in account.openReservations ||
    reservationId in account.settledReservations
  ) {
    throw new Error(`Reservation ${reservationId} already exists`);
  }
  const avail = available(account);
  if (amountMinor > avail) {
    return { ok: false, code: "BUDGET_EXHAUSTED", availableMinor: avail };
  }
  return {
    ok: true,
    reservationId,
    amountMinor,
    account: {
      ...account,
      reservedMinor: account.reservedMinor + amountMinor,
      openReservations: {
        ...account.openReservations,
        [reservationId]: amountMinor,
      },
    },
  };
}

/**
 * Settles a reservation by identity: releases that reservation's reserved
 * amount and posts actual cost. Replaying the same reservationId with the
 * same actual is idempotent; conflicting replay throws.
 */
export function settleBudget(
  account: BudgetAccount,
  reservationId: string,
  actualMinor: number,
): BudgetSettlement {
  if (actualMinor < 0) {
    throw new Error("Amounts must be non-negative");
  }

  const prior = account.settledReservations[reservationId];
  if (prior !== undefined) {
    if (prior.actualMinor !== actualMinor) {
      throw new Error(
        `Reservation ${reservationId} already settled with actual ${prior.actualMinor}`,
      );
    }
    return {
      ok: true,
      account,
      reservationId,
      reservedMinor: prior.reservedMinor,
      actualMinor: prior.actualMinor,
      replayed: true,
    };
  }

  const reservedMinor = account.openReservations[reservationId];
  if (reservedMinor === undefined) {
    return { ok: false, code: "UNKNOWN_RESERVATION", reservationId };
  }

  const { [reservationId]: _removed, ...remainingOpen } = account.openReservations;
  return {
    ok: true,
    reservationId,
    reservedMinor,
    actualMinor,
    replayed: false,
    account: {
      ...account,
      reservedMinor: account.reservedMinor - reservedMinor,
      settledMinor: account.settledMinor + actualMinor,
      openReservations: remainingOpen,
      settledReservations: {
        ...account.settledReservations,
        [reservationId]: { reservedMinor, actualMinor },
      },
    },
  };
}
