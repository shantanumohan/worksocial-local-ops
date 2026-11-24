/**
 * Fixture proof for T-X027 — unknown usage on cancelled request.
 *
 * Cancel with unknown usage must hold residual cost (not release as zero).
 * External effects: NONE. Live budget provider wiring stays NOT_WIRED.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  BUDGET_LIVE_PROVIDER_WIRING,
  SoakProofKind,
  availableBudgetMinor,
  cancelBudgetReservation,
  createBudgetAccount,
  heldReservationsTotalMinor,
  isUnknownUsageHold,
  reserveBudget,
  settleBudget,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X027 fixture ACCEPTED.
 */
export function proofUnknownUsageCancelHoldsResidual(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const base = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });

  // 1. Reserve for a request that will be cancelled with unknown usage.
  const reserved = reserveBudget(base, "req-cancel-unknown", 700);
  if (
    reserved.ok &&
    reserved.account.reservedMinor === 700 &&
    availableBudgetMinor(reserved.account) === 300
  ) {
    details.push("Reserved 700 for cancel candidate; available=300");
  } else {
    passed = false;
    details.push(`Reserve failed: ${JSON.stringify(reserved)}`);
    return finish(passed, details, nowIso);
  }

  // 2. Cancel with unknown usage → hold residual, not zero cost.
  const cancelled = cancelBudgetReservation(
    reserved.account,
    "req-cancel-unknown",
    { known: false },
  );
  if (
    cancelled.ok &&
    cancelled.usageKnown === false &&
    cancelled.actualMinor === null &&
    cancelled.heldMinor === 700 &&
    cancelled.costKind === "unknown_hold" &&
    cancelled.account.heldMinor === 700 &&
    cancelled.account.settledMinor === 0 &&
    availableBudgetMinor(cancelled.account) === 300 &&
    cancelled.externalEffects === "NONE" &&
    cancelled.liveBudgetProviderWiring === BUDGET_LIVE_PROVIDER_WIRING
  ) {
    details.push(
      "Cancel unknown usage → heldMinor=700 (not zero); available stays 300; liveBudgetProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Unknown cancel hold failed: ${JSON.stringify(cancelled)}`);
    return finish(passed, details, nowIso);
  }

  // 3. Counterfactual: inventing zero or non-zero via settle must be refused on a hold.
  let settleZeroRefused = false;
  let settleNonZeroRefused = false;
  try {
    settleBudget(cancelled.account, "req-cancel-unknown", 0);
  } catch (err) {
    settleZeroRefused = /held for unknown usage/i.test(
      err instanceof Error ? err.message : String(err),
    );
  }
  try {
    settleBudget(cancelled.account, "req-cancel-unknown", 55);
  } catch (err) {
    settleNonZeroRefused = /held for unknown usage/i.test(
      err instanceof Error ? err.message : String(err),
    );
  }
  if (settleZeroRefused && settleNonZeroRefused) {
    details.push(
      "Counterfactual settle-as-zero and settle-nonzero refused on unknown-usage hold",
    );
  } else {
    passed = false;
    details.push(
      `Expected settle refuse on hold (zero=${settleZeroRefused} nonzero=${settleNonZeroRefused})`,
    );
  }

  // 4. Positive control: known-zero cancel releases capacity honestly.
  const other = reserveBudget(cancelled.account, "req-known-zero", 100);
  if (!other.ok) {
    passed = false;
    details.push(`Known-zero reserve failed: ${JSON.stringify(other)}`);
    return finish(passed, details, nowIso);
  }
  const knownZero = cancelBudgetReservation(other.account, "req-known-zero", {
    known: true,
    actualMinor: 0,
  });
  if (
    knownZero.ok &&
    knownZero.costKind === "zero_release" &&
    knownZero.heldMinor === 0 &&
    knownZero.actualMinor === 0 &&
    availableBudgetMinor(knownZero.account) === 300
  ) {
    details.push(
      "Positive control: known-zero cancel releases that reservation only; unknown hold still consumes 700",
    );
  } else {
    passed = false;
    details.push(`Known-zero cancel failed: ${JSON.stringify(knownZero)}`);
  }

  // 5. Concurrent capacity still accounts for the hold; under-cap reserve ok.
  const afterKnownZero = knownZero.ok ? knownZero.account : cancelled.account;
  const under = reserveBudget(afterKnownZero, "req-under", 300);
  if (
    under.ok &&
    under.account.reservedMinor === 300 &&
    under.account.heldMinor === 700 &&
    availableBudgetMinor(under.account) === 0
  ) {
    details.push(
      "Under-cap reserve while hold present → reserved=300 held=700 available=0",
    );
  } else {
    passed = false;
    details.push(`Under-cap reserve failed: ${JSON.stringify(under)}`);
  }
  const blocked = reserveBudget(
    under.ok ? under.account : afterKnownZero,
    "req-over",
    1,
  );
  if (
    !blocked.ok &&
    blocked.code === "BUDGET_EXHAUSTED" &&
    blocked.availableMinor === 0
  ) {
    details.push(
      "Hold residual + under-cap reserve blocks further reserve (BUDGET_EXHAUSTED available=0)",
    );
  } else {
    passed = false;
    details.push(`Expected BUDGET_EXHAUSTED after hold: ${JSON.stringify(blocked)}`);
  }

  // 6. Second concurrent unknown hold stacks residual.
  // Release under-cap reservation first so multi-hold arithmetic is isolated.
  const releaseUnder = under.ok
    ? cancelBudgetReservation(under.account, "req-under", {
        known: true,
        actualMinor: 0,
      })
    : null;
  const multiBase = releaseUnder?.ok ? releaseUnder.account : cancelled.account;
  const secondReserve = reserveBudget(multiBase, "req-cancel-unknown-b", 150);
  if (!secondReserve.ok) {
    passed = false;
    details.push(`Second reserve failed: ${JSON.stringify(secondReserve)}`);
    return finish(passed, details, nowIso);
  }
  const secondHold = cancelBudgetReservation(
    secondReserve.account,
    "req-cancel-unknown-b",
    { known: false },
  );
  if (
    secondHold.ok &&
    secondHold.costKind === "unknown_hold" &&
    secondHold.account.heldMinor === 850 &&
    secondHold.account.heldReservations["req-cancel-unknown"] === 700 &&
    secondHold.account.heldReservations["req-cancel-unknown-b"] === 150 &&
    heldReservationsTotalMinor(secondHold.account) === 850 &&
    secondHold.account.heldMinor ===
      heldReservationsTotalMinor(secondHold.account) &&
    availableBudgetMinor(secondHold.account) === 150 &&
    secondHold.liveBudgetProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Concurrent multi-hold stacks heldMinor=850 (700+150); map sum invariant; available=150; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Multi-hold stack failed: ${JSON.stringify(secondHold)}`);
    return finish(passed, details, nowIso);
  }

  // 7. After reconcile, explicit known cancel may resolve the primary hold to actual.
  const reconciled = cancelBudgetReservation(
    secondHold.account,
    "req-cancel-unknown",
    {
      known: true,
      actualMinor: 220,
    },
  );
  if (
    reconciled.ok &&
    reconciled.costKind === "actual" &&
    reconciled.actualMinor === 220 &&
    reconciled.account.heldMinor === 150 &&
    reconciled.account.settledMinor === 220 &&
    availableBudgetMinor(reconciled.account) === 630 &&
    reconciled.externalEffects === "NONE" &&
    reconciled.liveBudgetProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Known reconcile after hold posts actual=220; secondary hold 150 remains; externalEffects=NONE",
    );
  } else {
    passed = false;
    details.push(`Known hold resolve failed: ${JSON.stringify(reconciled)}`);
  }

  // 8. Refuse unknown-cancel replay on a settled reservation.
  let settledUnknownRefused = false;
  try {
    cancelBudgetReservation(reconciled.ok ? reconciled.account : secondHold.account, "req-cancel-unknown", {
      known: false,
    });
  } catch (err) {
    settledUnknownRefused = /already settled/i.test(
      err instanceof Error ? err.message : String(err),
    );
  }
  if (settledUnknownRefused) {
    details.push("Refuse unknown-cancel replay after settled");
  } else {
    passed = false;
    details.push("Expected unknown-cancel after settled to throw");
  }

  // 9. Secondary hold still flagged; resolve it and clear inventory.
  const afterPrimary = reconciled.ok ? reconciled.account : secondHold.account;
  if (
    isUnknownUsageHold(afterPrimary, "req-cancel-unknown-b") &&
    !isUnknownUsageHold(afterPrimary, "req-cancel-unknown")
  ) {
    details.push(
      "isUnknownUsageHold: secondary still held; primary cleared after reconcile",
    );
  } else {
    passed = false;
    details.push("Expected isUnknownUsageHold secondary=true primary=false");
  }
  const clearSecondary = cancelBudgetReservation(
    afterPrimary,
    "req-cancel-unknown-b",
    { known: true, actualMinor: 0 },
  );
  if (
    clearSecondary.ok &&
    clearSecondary.costKind === "zero_release" &&
    clearSecondary.account.heldMinor === 0 &&
    heldReservationsTotalMinor(clearSecondary.account) === 0 &&
    !isUnknownUsageHold(clearSecondary.account, "req-cancel-unknown-b") &&
    availableBudgetMinor(clearSecondary.account) === 780 &&
    clearSecondary.liveBudgetProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Secondary hold resolved known-zero → heldMinor=0; available=780; NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `Secondary hold clear failed: ${JSON.stringify(clearSecondary)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE liveBudgetProviderWiring=NOT_WIRED",
  );
  return finish(passed, details, nowIso);
}

function finish(
  passed: boolean,
  details: string[],
  nowIso: string,
): SoakProofRecord {
  return {
    proofId: `proof-unknown-usage-cancel-${randomUUID()}`,
    kind: SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx027-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
