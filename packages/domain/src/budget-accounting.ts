/**
 * Budget reservation and honest actual-cost settlement (pure arithmetic).
 * Settlement is reservation-aware: each reservationId settles at most once.
 * Cancel with unknown usage holds residual cost — never silently zero (T-X027).
 * Actual > reserved posts full actual — overrun visible, never capped (T-X028).
 * Concurrent final composition (T-X026): same-snapshot finals serialize through
 * reserveBudget so reserved never exceeds the daily limit.
 *
 * Pure domain. External effects: NONE. Live budget/provider wiring stays
 * NOT_WIRED. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. No invent past T-X073.
 */

/** Live budget / billing-provider wiring — always NOT_WIRED offline. */
export const BUDGET_ACCOUNTING_LIVE_WIRING = "NOT_WIRED" as const;

/** T-X026 concurrent compose uses the same NOT_WIRED reservation wiring label. */
export const BUDGET_RESERVATION_LIVE_WIRING = BUDGET_ACCOUNTING_LIVE_WIRING;
export type BudgetReservationLiveWiring = typeof BUDGET_RESERVATION_LIVE_WIRING;

/** Catalog cases owned by actual-cost overrun visibility. */
export const ACTUAL_COST_OVERRUN_RELATED_CASE_IDS = ["T-X028"] as const;

/**
 * Positive delta when actual exceeds the reserved estimate; else 0.
 * Overrun must be visible — never silently capped to the estimate (T-X028).
 */
export function overrunMinor(
  reservedMinor: number,
  actualMinor: number,
): number {
  return Math.max(0, actualMinor - reservedMinor);
}

/** True when actual cost exceeds the reserved estimate. */
export function isActualCostOverrun(
  reservedMinor: number,
  actualMinor: number,
): boolean {
  return actualMinor > reservedMinor;
}

/** Structured overrun visibility — never claims estimate-cap or live success. */
export function describeActualCostOverrunVisibility(
  reservedMinor: number,
  actualMinor: number,
): {
  overrunMinor: number;
  overrunVisible: boolean;
  cappedToEstimate: false;
  liveProviderWiring: typeof BUDGET_ACCOUNTING_LIVE_WIRING;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
  externalEffects: "NONE";
  /** Fixture ACCEPTED only — never sandbox/prod VERIFIED. */
  fixtureAcceptedOnly: true;
  sandboxVerifiedClaimed: false;
} {
  const delta = overrunMinor(reservedMinor, actualMinor);
  return {
    overrunMinor: delta,
    overrunVisible: delta > 0,
    cappedToEstimate: false,
    liveProviderWiring: BUDGET_ACCOUNTING_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED" as const,
    externalEffects: "NONE",
    fixtureAcceptedOnly: true,
    sandboxVerifiedClaimed: false,
  };
}

/**
 * Fail-closed honesty check for successful settleBudget results (T-X028).
 * Never treats fixture ACCEPTED as live VERIFIED; Ads stay ACCESS_BLOCKED.
 */
export function assertBudgetSettlementHonesty(
  settlement: Extract<BudgetSettlement, { ok: true }>,
): void {
  if (settlement.externalEffects !== "NONE") {
    throw new Error("budget settlement externalEffects must be NONE");
  }
  if (settlement.liveProviderWiring !== BUDGET_ACCOUNTING_LIVE_WIRING) {
    throw new Error("budget settlement liveProviderWiring must be NOT_WIRED");
  }
  if (settlement.liveProviderSuccessClaimed !== false) {
    throw new Error("budget settlement must not claim live provider success");
  }
  if (settlement.chatgptAdsAccess !== "ACCESS_BLOCKED") {
    throw new Error("budget settlement chatgptAdsAccess must be ACCESS_BLOCKED");
  }
  if (settlement.overrunMinor !== overrunMinor(settlement.reservedMinor, settlement.actualMinor)) {
    throw new Error("budget settlement overrunMinor mismatch");
  }
}

export type SettledReservationSnapshot = {
  reservedMinor: number;
  actualMinor: number;
  /** Persisted overrun delta so visibility survives after settle (T-X028). */
  overrunMinor: number;
};

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
  settledReservations: Readonly<Record<string, SettledReservationSnapshot>>;
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
      /** max(0, actual − reserved); >0 means overrun visible (T-X028). */
      overrunMinor: number;
      replayed: boolean;
      externalEffects: "NONE";
      liveProviderWiring: typeof BUDGET_ACCOUNTING_LIVE_WIRING;
      liveProviderSuccessClaimed: false;
      chatgptAdsAccess: "ACCESS_BLOCKED";
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
    }
  | { ok: false; code: "UNKNOWN_RESERVATION"; reservationId: string };

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
  if (
    !Number.isFinite(amountMinor) ||
    !Number.isInteger(amountMinor) ||
    amountMinor <= 0
  ) {
    throw new Error("Reservation amount must be a positive integer");
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
export type ConcurrentFinalBudgetAttempt = {
  reservationId: string;
  amountMinor: number;
};

export type ConcurrentFinalBudgetExhausted = {
  reservationId: string;
  availableMinor: number;
};

export type ConcurrentFinalBudgetAccepted = {
  reservationId: string;
  amountMinor: number;
};

export type ConcurrentFinalBudgetComposition = {
  account: BudgetAccount;
  acceptedReservationIds: string[];
  exhaustedReservationIds: string[];
  /** Per-accept amounts applied by composition (mirror of exhausted[]). */
  accepted: ConcurrentFinalBudgetAccepted[];
  /** Per-refusal available headroom at the moment of BUDGET_EXHAUSTED. */
  exhausted: ConcurrentFinalBudgetExhausted[];
  /** Headroom observed on the input snapshot before any composed final. */
  availableAtSnapshotMinor: number;
  /** Sum of attempted final amounts (isolation oversubscribe signal). */
  isolationSumMinor: number;
  /** True when isolationSumMinor > availableAtSnapshotMinor. */
  isolationWouldOversubscribe: boolean;
  /** Sum of amounts accepted by composition (not isolation). */
  acceptedSumMinor: number;
  /**
   * True when reserved+settled+held never exceeds limitMinor after composition.
   */
  reservedNeverExceedsLimit: boolean;
  /** reserved+settled+held after composition. */
  committedMinor: number;
  /**
   * True when availableMinor === limitMinor - committedMinor (identity check).
   */
  availableMatchesLimitMinusCommitted: boolean;
  availableMinor: number;
  liveWiring: BudgetReservationLiveWiring;
  /** Fixture path honesty — never promote to sandbox/prod VERIFIED. */
  fixtureAcceptedNotVerified: true;
  externalEffects: "NONE";
};

export function committedBudgetMinor(account: BudgetAccount): number {
  return (
    account.reservedMinor +
    account.settledMinor +
    (account.heldMinor ?? 0)
  );
}

/**
 * Honesty predicate for T-X026 composition results (fixture path only).
 */
export function isConcurrentBudgetCompositionHonest(
  composition: ConcurrentFinalBudgetComposition,
): boolean {
  const acceptedSumFromRows = composition.accepted.reduce(
    (sum, row) => sum + row.amountMinor,
    0,
  );
  return (
    composition.liveWiring === BUDGET_RESERVATION_LIVE_WIRING &&
    composition.fixtureAcceptedNotVerified === true &&
    composition.externalEffects === "NONE" &&
    composition.reservedNeverExceedsLimit &&
    composition.availableMatchesLimitMinusCommitted &&
    composition.committedMinor === committedBudgetMinor(composition.account) &&
    composition.availableMinor === available(composition.account) &&
    composition.acceptedSumMinor === acceptedSumFromRows &&
    composition.acceptedReservationIds.length === composition.accepted.length &&
    composition.accepted.every(
      (row, i) => row.reservationId === composition.acceptedReservationIds[i],
    ) &&
    composition.exhausted.every(
      (row, i) => row.reservationId === composition.exhaustedReservationIds[i],
    ) &&
    composition.exhaustedReservationIds.length === composition.exhausted.length &&
    composition.isolationWouldOversubscribe ===
      composition.isolationSumMinor > composition.availableAtSnapshotMinor
  );
}

/**
 * Compose same-snapshot concurrent finals by applying them serially through
 * reserveBudget. Models T-X026: each final may succeed in isolation against the
 * shared headroom snapshot, but composition refuses later finals with
 * BUDGET_EXHAUSTED so reservedMinor never exceeds limitMinor.
 * Does not mutate the input account (returns a new account tree).
 * Live wiring stays NOT_WIRED; fixtureAcceptedNotVerified; externalEffects NONE.
 * Open/held reservationId collisions refuse via reserveBudget (snap immutable).
 */
export function composeConcurrentFinalBudgetReserves(
  account: BudgetAccount,
  finals: readonly ConcurrentFinalBudgetAttempt[],
): ConcurrentFinalBudgetComposition {
  // Preflight: amounts positive, reservationIds non-blank, and no duplicate ids
  // in finals[] before any apply so isolationSum stays honest and the input
  // snapshot is never partially observed as applied.
  const seenIds = new Set<string>();
  for (const final of finals) {
    const reservationId = final.reservationId.trim();
    if (!reservationId) {
      throw new Error("Reservation id must be non-blank");
    }
    if (seenIds.has(reservationId)) {
      throw new Error(`Reservation ${reservationId} already exists`);
    }
    seenIds.add(reservationId);
    if (
      !Number.isFinite(final.amountMinor) ||
      !Number.isInteger(final.amountMinor) ||
      final.amountMinor <= 0
    ) {
      throw new Error(
        "Reservation amount must be a finite positive integer minor unit",
      );
    }
  }
  const availableAtSnapshotMinor = available(account);
  const isolationSumMinor = finals.reduce(
    (sum, final) => sum + final.amountMinor,
    0,
  );
  let current = account;
  const acceptedReservationIds: string[] = [];
  const exhaustedReservationIds: string[] = [];
  const accepted: ConcurrentFinalBudgetAccepted[] = [];
  const exhausted: ConcurrentFinalBudgetExhausted[] = [];
  let acceptedSumMinor = 0;

  for (const final of finals) {
    const reservationId = final.reservationId.trim();
    const result = reserveBudget(current, reservationId, final.amountMinor);
    if (result.ok) {
      current = result.account;
      acceptedReservationIds.push(reservationId);
      accepted.push({
        reservationId,
        amountMinor: final.amountMinor,
      });
      acceptedSumMinor += final.amountMinor;
    } else {
      exhaustedReservationIds.push(reservationId);
      exhausted.push({
        reservationId,
        availableMinor: result.availableMinor,
      });
    }
  }

  const committedMinor = committedBudgetMinor(current);
  const availableMinor = available(current);
  return {
    account: current,
    acceptedReservationIds,
    exhaustedReservationIds,
    accepted,
    exhausted,
    availableAtSnapshotMinor,
    isolationSumMinor,
    isolationWouldOversubscribe: isolationSumMinor > availableAtSnapshotMinor,
    acceptedSumMinor,
    reservedNeverExceedsLimit: committedMinor <= current.limitMinor,
    committedMinor,
    availableMatchesLimitMinusCommitted:
      availableMinor === current.limitMinor - committedMinor,
    availableMinor,
    liveWiring: BUDGET_RESERVATION_LIVE_WIRING,
    fixtureAcceptedNotVerified: true,
    externalEffects: "NONE",
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
  if (
    !Number.isFinite(actualMinor) ||
    !Number.isInteger(actualMinor) ||
    actualMinor < 0
  ) {
    throw new Error("Amounts must be non-negative integers");
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
      overrunMinor: overrunMinor(prior.reservedMinor, prior.actualMinor),
      replayed: true,
      externalEffects: "NONE",
      liveProviderWiring: BUDGET_ACCOUNTING_LIVE_WIRING,
      liveProviderSuccessClaimed: false,
      chatgptAdsAccess: "ACCESS_BLOCKED",
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
    overrunMinor: overrunMinor(reservedMinor, actualMinor),
    replayed: false,
    externalEffects: "NONE",
    liveProviderWiring: BUDGET_ACCOUNTING_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
    account: {
      ...account,
      reservedMinor: account.reservedMinor - reservedMinor,
      settledMinor: account.settledMinor + actualMinor,
      openReservations: remainingOpen,
      settledReservations: {
        ...account.settledReservations,
        [reservationId]: {
          reservedMinor,
          actualMinor,
          overrunMinor: overrunMinor(reservedMinor, actualMinor),
        },
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
      };
    }
    if (
      !Number.isFinite(usage.actualMinor) ||
      !Number.isInteger(usage.actualMinor) ||
      usage.actualMinor < 0
    ) {
      throw new Error("Amounts must be non-negative integers");
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
            overrunMinor: overrunMinor(priorHeld, usage.actualMinor),
          },
        },
      },
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
    };
  }

  if (
    !Number.isFinite(usage.actualMinor) ||
    !Number.isInteger(usage.actualMinor) ||
    usage.actualMinor < 0
  ) {
    throw new Error("Amounts must be non-negative integers");
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
          overrunMinor: overrunMinor(reservedMinor, usage.actualMinor),
        },
      },
    },
  };
}
