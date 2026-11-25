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
  // Hold map is source of truth — ignore stale heldMinor (T-X027).
  return (
    account.limitMinor -
    account.reservedMinor -
    account.settledMinor -
    heldReservationsTotalMinor(account)
  );
}

export function availableBudgetMinor(account: BudgetAccount): number {
  return available(account);
}

/**
 * Sum of per-reservation held residuals. Must equal `heldMinor` after every
 * honest cancel/resolve path (T-X027 invariant — never silent zero).
 * Non-finite map values are ignored (never invent capacity).
 */
export function heldReservationsTotalMinor(account: BudgetAccount): number {
  const held = account.heldReservations ?? {};
  let total = 0;
  for (const amount of Object.values(held)) {
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) {
      total += n;
    }
  }
  return total;
}

/** True when reservationId is held for unknown usage (not zero, not settled). */
export function isUnknownUsageHold(
  account: BudgetAccount,
  reservationId: string,
): boolean {
  const held = account.heldReservations ?? {};
  const amount = Number(held[reservationId]);
  // Align with map-sum: zero / non-finite entries are not honest holds (T-X027).
  return (
    Number.isFinite(amount) &&
    amount > 0 &&
    !(reservationId in account.openReservations) &&
    !(reservationId in account.settledReservations)
  );
}

/**
 * Sync `heldMinor` to the hold-map sum and drop non-positive / non-finite
 * map keys. Map is source of truth — stale heldMinor must not invent
 * available capacity; ghost keys must not look like holds (T-X027).
 */
export function normalizeBudgetHolds(account: BudgetAccount): BudgetAccount {
  const raw = account.heldReservations ?? {};
  const scrubbed: Record<string, number> = {};
  let mapChanged = false;
  for (const [id, amount] of Object.entries(raw)) {
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) {
      scrubbed[id] = n;
      if (n !== amount) mapChanged = true;
    } else {
      mapChanged = true;
    }
  }
  const heldMinor = heldReservationsTotalMinor({
    ...account,
    heldReservations: scrubbed,
  });
  if (!mapChanged && account.heldMinor === heldMinor) {
    return account;
  }
  return {
    ...account,
    heldMinor,
    heldReservations: mapChanged ? scrubbed : account.heldReservations,
  };
}

/** Reservation ids currently held for unknown usage (T-X027). */
export function listUnknownUsageHoldIds(
  account: BudgetAccount,
): readonly string[] {
  const held = account.heldReservations ?? {};
  return Object.keys(held).filter((id) => isUnknownUsageHold(account, id));
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
  // Normalize heldMinor so stale field cannot leak on reserve path (T-X027).
  return {
    ok: true,
    reservationId,
    amountMinor,
    account: normalizeBudgetHolds({
      ...account,
      reservedMinor: account.reservedMinor + amountMinor,
      openReservations: {
        ...account.openReservations,
        [reservationId]: amountMinor,
      },
    }),
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
      account: normalizeBudgetHolds(account),
      reservationId,
      reservedMinor: prior.reservedMinor,
      actualMinor: prior.actualMinor,
      replayed: true,
    };
  }

  if (isUnknownUsageHold(account, reservationId)) {
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
    account: normalizeBudgetHolds({
      ...account,
      reservedMinor: account.reservedMinor - reservedMinor,
      settledMinor: account.settledMinor + actualMinor,
      openReservations: remainingOpen,
      settledReservations: {
        ...account.settledReservations,
        [reservationId]: { reservedMinor, actualMinor },
      },
    }),
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
  // Gate on positive-finite hold — ghost 0/NaN keys must not stamp unknown_hold.
  if (isUnknownUsageHold(account, reservationId)) {
    const priorHeld = Number(account.heldReservations[reservationId]);
    if (!usage.known) {
      // Idempotent replay — return normalized account so stale heldMinor
      // cannot leak through (T-X027 map is source of truth).
      return {
        ok: true,
        account: normalizeBudgetHolds(account),
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
    // Recompute heldMinor from remaining map — never field±delta (stale
    // heldMinor=0 must not yield negative heldMinor after resolve).
    return {
      ok: true,
      reservationId,
      reservedMinor: priorHeld,
      heldMinor: 0,
      usageKnown: true,
      actualMinor: usage.actualMinor,
      costKind: usage.actualMinor === 0 ? "zero_release" : "actual",
      replayed: false,
      account: normalizeBudgetHolds({
        ...account,
        settledMinor: account.settledMinor + usage.actualMinor,
        heldReservations: remainingHeld,
        settledReservations: {
          ...account.settledReservations,
          [reservationId]: {
            reservedMinor: priorHeld,
            actualMinor: usage.actualMinor,
          },
        },
      }),
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
      account: normalizeBudgetHolds(account),
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
    // Recompute heldMinor from map (stale field must not under-count holds).
    const nextHeld = {
      ...account.heldReservations,
      [reservationId]: reservedMinor,
    };
    const nextHeldMinor = heldReservationsTotalMinor({
      ...account,
      heldReservations: nextHeld,
    });
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
        heldMinor: nextHeldMinor,
        openReservations: remainingOpen,
        heldReservations: nextHeld,
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
