/**
 * Fixture proof for T-X028 — actual cost exceeds estimate / overrun visible.
 *
 * Exercises pure budget settlement: settleBudget posts the full actual when
 * actualMinor > reservedMinor (not capped to the estimate) and releases the
 * reservation. Preserves createBudgetAccount heldMinor:0 (T-X027 hold path
 * untouched). External effects: NONE. Does not claim T-X026.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  createBudgetAccount,
  reserveBudget,
  settleBudget,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X028 fixture ACCEPTED.
 */
export function proofActualCostExceedsEstimateOverrunVisible(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const seed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  if (seed.heldMinor === 0) {
    details.push("createBudgetAccount → heldMinor=0 (preserve T-X027 hold field)");
  } else {
    passed = false;
    details.push(`createBudgetAccount heldMinor unexpected: ${seed.heldMinor}`);
  }

  const reserved = reserveBudget(seed, "r-overrun", 600);
  if (
    reserved.ok &&
    reserved.account.reservedMinor === 600 &&
    reserved.account.heldMinor === 0 &&
    reserved.account.openReservations["r-overrun"] === 600
  ) {
    details.push("Reserve r-overrun for 600 → ok; reservedMinor=600; heldMinor=0");
  } else {
    passed = false;
    details.push(`Reserve failed: ${JSON.stringify(reserved)}`);
  }

  if (reserved.ok) {
    const overrun = settleBudget(reserved.account, "r-overrun", 750);
    if (
      overrun.ok &&
      !overrun.replayed &&
      overrun.reservedMinor === 600 &&
      overrun.actualMinor === 750 &&
      overrun.account.reservedMinor === 0 &&
      overrun.account.heldMinor === 0 &&
      overrun.account.settledMinor === 750 &&
      overrun.account.openReservations["r-overrun"] === undefined &&
      overrun.account.settledReservations["r-overrun"]?.actualMinor === 750 &&
      overrun.account.settledReservations["r-overrun"]?.reservedMinor === 600 &&
      overrun.actualMinor > overrun.reservedMinor
    ) {
      details.push(
        "Settle r-overrun actualMinor=750 (> reserved 600) → settledMinor=750 overrun visible; reservation released; heldMinor=0",
      );
    } else {
      passed = false;
      details.push(`Overrun settle failed: ${JSON.stringify(overrun)}`);
    }
  }

  // Positive control: under-estimate settle posts lower actual and releases reserved.
  const underSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const underReserve = reserveBudget(underSeed, "r-under", 500);
  if (underReserve.ok) {
    const under = settleBudget(underReserve.account, "r-under", 120);
    if (
      under.ok &&
      under.actualMinor === 120 &&
      under.account.settledMinor === 120 &&
      under.account.reservedMinor === 0 &&
      under.account.heldMinor === 0 &&
      under.account.openReservations["r-under"] === undefined
    ) {
      details.push(
        "Positive control: under-estimate settle actual=120 (< reserved 500) → settled posts actual; reserved released; heldMinor=0",
      );
    } else {
      passed = false;
      details.push(`Under-estimate settle failed: ${JSON.stringify(under)}`);
    }
  } else {
    passed = false;
    details.push(`Under-estimate reserve failed: ${JSON.stringify(underReserve)}`);
  }

  // Fail-closed: unknown reservation id.
  const unknown = settleBudget(seed, "missing-reservation", 10);
  if (!unknown.ok && unknown.code === "UNKNOWN_RESERVATION") {
    details.push("Unknown reservation → UNKNOWN_RESERVATION (fail-closed)");
  } else {
    passed = false;
    details.push(`Unknown settle unexpectedly ${JSON.stringify(unknown)}`);
  }

  details.push(`proofClock=${nowIso}`);
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-actual-cost-overrun-${randomUUID()}`,
    kind: SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx028-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
