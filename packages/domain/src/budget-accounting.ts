/**
 * Budget reservation and honest actual-cost settlement (pure arithmetic).
 * Settlement is reservation-aware: each reservationId settles at most once.
 * Cancel with unknown usage holds residual cost — never silently zero (T-X027).
 *
 * Live budget / provider wiring stays NOT_WIRED. Fixture ACCEPTED ≠ sandbox/prod
 * VERIFIED. External effects: NONE. No invent past T-X073.
 */

/** Live metered-usage / budget-provider wiring — always NOT_WIRED offline. */
export const BUDGET_LIVE_PROVIDER_WIRING = "NOT_WIRED" as const;

export const UNKNOWN_USAGE_CANCEL_RELATED_CASE_IDS = ["T-X027"] as const;

export type BudgetAccount = {
  dayKey: string;
  currency: string;
  limitMinor: number;
  reservedMinor: number;
  settledMinor: number;
  /** Outstanding hold residual after cancel-with-unknown-usage (T-X027). */
  heldMinor: number;
  /** Outstanding reservation amounts keyed by reservationId. */
  openReservations: Readonly<Record<string, number>>;
  /** Held residuals keyed by reservationId (usage unknown; not zero cost). */
  heldReservations: Readonly<Record<string, number>>;
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

export type BudgetCancelUsage =
  | { known: false }
  | { known: true; actualMinor: number };

export type BudgetCancellation =
  | {
      ok: true;
      account: BudgetAccount;
      reservationId: string;
      reservedMinor: number;
      /**
       * Residual held against the budget. Unknown usage → equals reservedMinor
       * (never silently zero). Known zero-release → 0.
       */
      heldMinor: number;
      usageKnown: boolean;
      /** Posted actual when known; null when unknown (must not invent 0). */
      actualMinor: number | null;
      costKind: "unknown_hold" | "actual" | "zero_release";
      replayed: boolean;
      externalEffects: "NONE";
      liveBudgetProviderWiring: typeof BUDGET_LIVE_PROVIDER_WIRING;
    }
  | { ok: false; code: "UNKNOWN_RESERVATION"; reservationId: string };

const honesty = {
  externalEffects: "NONE" as const,
  liveBudgetProviderWiring: BUDGET_LIVE_PROVIDER_WIRING,
};

function available(account: BudgetAccount): number {
  return (
    account.limitMinor -
    account.reservedMinor -
    account.settledMinor -
    (account.heldMinor ?? 0)
  );
}

export function availableBudgetMinor(account: BudgetAccount): number {
  return available(account);
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
    heldMinor: 0,
    openReservations: {},
    heldReservations: {},
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
  const held = account.heldReservations ?? {};
  if (
    reservationId in account.openReservations ||
    reservationId in account.settledReservations ||
    reservationId in held
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

  if (reservationId in account.heldReservations) {
    throw new Error(
      `Reservation ${reservationId} is held for unknown usage — cannot settle as known actual without explicit known cancel`,
    );
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

/**
 * Cancels a request's open reservation.
 *
 * Unknown usage (T-X027): hold residual = reserved amount — never release as
 * zero cost. Known usage settles/releases honestly (including known zero).
 */
export function cancelBudgetReservation(
  account: BudgetAccount,
  reservationId: string,
  usage: BudgetCancelUsage,
): BudgetCancellation {
  // Already held for unknown usage: unknown replay is idempotent; known
  // usage may resolve the hold after provider reconcile (never invent zero
  // at the initial unknown cancel — that path is above via open reservation).
  const priorHeld = account.heldReservations[reservationId];
  if (priorHeld !== undefined) {
    if (!usage.known) {
      return {
        ok: true,
        account,
        reservationId,
        reservedMinor: priorHeld,
        heldMinor: priorHeld,
        usageKnown: false,
        actualMinor: null,
        costKind: "unknown_hold",
        replayed: true,
        ...honesty,
      };
    }
    if (usage.actualMinor < 0) {
      throw new Error("Amounts must be non-negative");
    }
    const { [reservationId]: _held, ...remainingHeld } = account.heldReservations;
    return {
      ok: true,
      reservationId,
      reservedMinor: priorHeld,
      heldMinor: 0,
      usageKnown: true,
      actualMinor: usage.actualMinor,
      costKind: usage.actualMinor === 0 ? "zero_release" : "actual",
      replayed: false,
      account: {
        ...account,
        heldMinor: account.heldMinor - priorHeld,
        settledMinor: account.settledMinor + usage.actualMinor,
        heldReservations: remainingHeld,
        settledReservations: {
          ...account.settledReservations,
          [reservationId]: {
            reservedMinor: priorHeld,
            actualMinor: usage.actualMinor,
          },
        },
      },
      ...honesty,
    };
  }

  const priorSettled = account.settledReservations[reservationId];
  if (priorSettled !== undefined) {
    if (!usage.known) {
      throw new Error(
        `Reservation ${reservationId} already settled — refuse unknown-cancel replay`,
      );
    }
    if (priorSettled.actualMinor !== usage.actualMinor) {
      throw new Error(
        `Reservation ${reservationId} already settled with actual ${priorSettled.actualMinor}`,
      );
    }
    return {
      ok: true,
      account,
      reservationId,
      reservedMinor: priorSettled.reservedMinor,
      heldMinor: 0,
      usageKnown: true,
      actualMinor: priorSettled.actualMinor,
      costKind:
        priorSettled.actualMinor === 0 ? "zero_release" : "actual",
      replayed: true,
      ...honesty,
    };
  }

  const reservedMinor = account.openReservations[reservationId];
  if (reservedMinor === undefined) {
    return { ok: false, code: "UNKNOWN_RESERVATION", reservationId };
  }

  const { [reservationId]: _removed, ...remainingOpen } = account.openReservations;

  if (!usage.known) {
    // Hold residual — available budget does not increase; cost is not zero.
    return {
      ok: true,
      reservationId,
      reservedMinor,
      heldMinor: reservedMinor,
      usageKnown: false,
      actualMinor: null,
      costKind: "unknown_hold",
      replayed: false,
      account: {
        ...account,
        reservedMinor: account.reservedMinor - reservedMinor,
        heldMinor: account.heldMinor + reservedMinor,
        openReservations: remainingOpen,
        heldReservations: {
          ...account.heldReservations,
          [reservationId]: reservedMinor,
        },
      },
      ...honesty,
    };
  }

  if (usage.actualMinor < 0) {
    throw new Error("Amounts must be non-negative");
  }

  return {
    ok: true,
    reservationId,
    reservedMinor,
    heldMinor: 0,
    usageKnown: true,
    actualMinor: usage.actualMinor,
    costKind: usage.actualMinor === 0 ? "zero_release" : "actual",
    replayed: false,
    account: {
      ...account,
      reservedMinor: account.reservedMinor - reservedMinor,
      settledMinor: account.settledMinor + usage.actualMinor,
      openReservations: remainingOpen,
      settledReservations: {
        ...account.settledReservations,
        [reservationId]: {
          reservedMinor,
          actualMinor: usage.actualMinor,
        },
      },
    },
    ...honesty,
  };
}
