/**
 * Budget reservation and honest actual-cost settlement (pure arithmetic).
 */

export type BudgetAccount = {
  dayKey: string;
  currency: string;
  limitMinor: number;
  reservedMinor: number;
  settledMinor: number;
};

export type BudgetReservation =
  | { ok: true; account: BudgetAccount; reservationId: string; amountMinor: number }
  | { ok: false; code: "BUDGET_EXHAUSTED"; availableMinor: number };

export type BudgetSettlement = {
  account: BudgetAccount;
  reservationId: string;
  reservedMinor: number;
  actualMinor: number;
};

function available(account: BudgetAccount): number {
  return account.limitMinor - account.reservedMinor - account.settledMinor;
}

export function reserveBudget(
  account: BudgetAccount,
  reservationId: string,
  amountMinor: number,
): BudgetReservation {
  if (amountMinor <= 0) {
    throw new Error("Reservation amount must be positive");
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
    },
  };
}

/**
 * Settles a reservation: releases the reserved amount and posts actual cost.
 * Actual may be less than reserved; over-actual still posts honestly and may
 * leave the account over-limit until the next day (no silent zeroing).
 */
export function settleBudget(
  account: BudgetAccount,
  reservationId: string,
  reservedMinor: number,
  actualMinor: number,
): BudgetSettlement {
  if (reservedMinor < 0 || actualMinor < 0) {
    throw new Error("Amounts must be non-negative");
  }
  if (account.reservedMinor < reservedMinor) {
    throw new Error("Cannot settle more than currently reserved");
  }
  return {
    reservationId,
    reservedMinor,
    actualMinor,
    account: {
      ...account,
      reservedMinor: account.reservedMinor - reservedMinor,
      settledMinor: account.settledMinor + actualMinor,
    },
  };
}
