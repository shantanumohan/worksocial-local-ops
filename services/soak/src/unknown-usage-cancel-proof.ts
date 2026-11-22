/**
 * Fixture proof for T-X027 — unknown usage on cancelled request.
 *
 * Cancel with unknown usage must hold residual cost (not release as zero).
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  availableBudgetMinor,
  cancelBudgetReservation,
  createBudgetAccount,
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
    availableBudgetMinor(cancelled.account) === 300
  ) {
    details.push(
      "Cancel unknown usage → heldMinor=700 (not zero); available stays 300",
    );
  } else {
    passed = false;
    details.push(`Unknown cancel hold failed: ${JSON.stringify(cancelled)}`);
    return finish(passed, details, nowIso);
  }

  // 3. Counterfactual: inventing zero via settle must be refused on a hold.
  let settleRefused = false;
  try {
    settleBudget(cancelled.account, "req-cancel-unknown", 0);
  } catch (err) {
    settleRefused = /held for unknown usage/i.test(
      err instanceof Error ? err.message : String(err),
    );
  }
  if (settleRefused) {
    details.push(
      "Counterfactual settle-as-zero refused on unknown-usage hold",
    );
  } else {
    passed = false;
    details.push("Expected settle-as-zero on hold to throw");
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

  // 5. Concurrent capacity still accounts for the hold.
  const blocked = reserveBudget(knownZero.ok ? knownZero.account : cancelled.account, "req-over", 400);
  if (!blocked.ok && blocked.code === "BUDGET_EXHAUSTED" && blocked.availableMinor === 300) {
    details.push("Hold residual blocks over-cap reserve (BUDGET_EXHAUSTED available=300)");
  } else {
    passed = false;
    details.push(`Expected BUDGET_EXHAUSTED after hold: ${JSON.stringify(blocked)}`);
  }

  // 6. After reconcile, explicit known cancel may resolve the hold to actual.
  const reconciled = cancelBudgetReservation(cancelled.account, "req-cancel-unknown", {
    known: true,
    actualMinor: 220,
  });
  if (
    reconciled.ok &&
    reconciled.costKind === "actual" &&
    reconciled.actualMinor === 220 &&
    reconciled.account.heldMinor === 0 &&
    reconciled.account.settledMinor === 220 &&
    availableBudgetMinor(reconciled.account) === 780
  ) {
    details.push(
      "Known reconcile after hold posts actual=220 and clears held residual",
    );
  } else {
    passed = false;
    details.push(`Known hold resolve failed: ${JSON.stringify(reconciled)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
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
