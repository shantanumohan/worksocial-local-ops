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
  listUnknownUsageHoldIds,
  normalizeBudgetHolds,
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

  // 10. Stale heldMinor field must not invent capacity (map is source of truth).
  const staleProbe = {
    ...cancelled.account,
    heldMinor: 0,
  };
  const staleAvail = availableBudgetMinor(staleProbe);
  const staleBlocked = reserveBudget(staleProbe, "req-stale-over", 400);
  const normalized = normalizeBudgetHolds(staleProbe);
  if (
    staleAvail === 300 &&
    !staleBlocked.ok &&
    staleBlocked.code === "BUDGET_EXHAUSTED" &&
    staleBlocked.availableMinor === 300 &&
    normalized.heldMinor === 700 &&
    heldReservationsTotalMinor(normalized) === 700
  ) {
    details.push(
      "Stale heldMinor=0 cannot invent capacity; map hold 700 → available=300; normalizeBudgetHolds restores heldMinor",
    );
  } else {
    passed = false;
    details.push(
      `Stale heldMinor probe failed avail=${staleAvail} blocked=${JSON.stringify(staleBlocked)} norm=${normalized.heldMinor}`,
    );
  }

  // 11. Resolve hold with stale heldMinor must not write negative heldMinor.
  const multiStale = {
    ...secondHold.account,
    heldMinor: 0,
  };
  const resolveStale = cancelBudgetReservation(multiStale, "req-cancel-unknown", {
    known: true,
    actualMinor: 220,
  });
  if (
    resolveStale.ok &&
    resolveStale.account.heldMinor === 150 &&
    resolveStale.account.heldMinor >= 0 &&
    heldReservationsTotalMinor(resolveStale.account) === 150 &&
    isUnknownUsageHold(resolveStale.account, "req-cancel-unknown-b") &&
    resolveStale.liveBudgetProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "Stale heldMinor resolve recomputes map sum → heldMinor=150 (not negative); secondary hold remains",
    );
  } else {
    passed = false;
    details.push(
      `Stale resolve heldMinor failed: ${JSON.stringify(resolveStale)}`,
    );
  }

  // 12. Idempotent unknown-hold replay normalizes stale heldMinor on return.
  const replayStale = {
    ...cancelled.account,
    heldMinor: 0,
  };
  const replayed = cancelBudgetReservation(
    replayStale,
    "req-cancel-unknown",
    { known: false },
  );
  const holdIds = listUnknownUsageHoldIds(cancelled.account);
  if (
    replayed.ok &&
    replayed.replayed === true &&
    replayed.account.heldMinor === 700 &&
    heldReservationsTotalMinor(replayed.account) === 700 &&
    holdIds.length === 1 &&
    holdIds[0] === "req-cancel-unknown" &&
    replayed.liveBudgetProviderWiring === BUDGET_LIVE_PROVIDER_WIRING
  ) {
    details.push(
      "Unknown-hold replay normalizes stale heldMinor→700; listUnknownUsageHoldIds returns primary hold",
    );
  } else {
    passed = false;
    details.push(
      `Replay normalize / list holds failed: ${JSON.stringify(replayed)} ids=${JSON.stringify(holdIds)}`,
    );
  }

  // 13. Settle open reservation while sibling unknown hold remains intact.
  const withOpen = reserveBudget(cancelled.account, "req-sibling-open", 50);
  if (!withOpen.ok) {
    passed = false;
    details.push(`Sibling open reserve failed: ${JSON.stringify(withOpen)}`);
    return finish(passed, details, nowIso);
  }
  const siblingSettle = settleBudget(withOpen.account, "req-sibling-open", 40);
  if (
    siblingSettle.ok &&
    siblingSettle.account.settledMinor === 40 &&
    isUnknownUsageHold(siblingSettle.account, "req-cancel-unknown") &&
    listUnknownUsageHoldIds(siblingSettle.account).includes(
      "req-cancel-unknown",
    ) &&
    heldReservationsTotalMinor(siblingSettle.account) === 700 &&
    availableBudgetMinor(siblingSettle.account) === 260
  ) {
    details.push(
      "Settle open sibling while unknown hold intact → settled=40 held=700 available=260; liveBudgetProviderWiring stays NOT_WIRED on cancel paths",
    );
  } else {
    passed = false;
    details.push(
      `Sibling settle-with-hold failed: ${JSON.stringify(siblingSettle)}`,
    );
  }

  // 14. Corrupt zero/NaN map entries are not holds; settle restores stale heldMinor.
  const corrupt = {
    ...cancelled.account,
    heldMinor: 0,
    heldReservations: {
      ...cancelled.account.heldReservations,
      "ghost-zero": 0,
      "ghost-nan": Number.NaN,
    },
  };
  const corruptIds = listUnknownUsageHoldIds(corrupt);
  const corruptOpen = reserveBudget(corrupt, "req-corrupt-open", 20);
  if (!corruptOpen.ok) {
    passed = false;
    details.push(`Corrupt-map reserve failed: ${JSON.stringify(corruptOpen)}`);
    return finish(passed, details, nowIso);
  }
  const corruptSettle = settleBudget(
    { ...corruptOpen.account, heldMinor: 0 },
    "req-corrupt-open",
    15,
  );
  if (
    !isUnknownUsageHold(corrupt, "ghost-zero") &&
    !isUnknownUsageHold(corrupt, "ghost-nan") &&
    isUnknownUsageHold(corrupt, "req-cancel-unknown") &&
    corruptIds.length === 1 &&
    corruptIds[0] === "req-cancel-unknown" &&
    corruptOpen.account.heldMinor === 700 &&
    corruptSettle.ok &&
    corruptSettle.account.heldMinor === 700 &&
    availableBudgetMinor(corruptSettle.account) === 285
  ) {
    details.push(
      "Corrupt 0/NaN map entries ignored as holds; reserve/settle normalize stale heldMinor→700",
    );
  } else {
    passed = false;
    details.push(
      `Corrupt-map / settle-normalize failed ids=${JSON.stringify(corruptIds)} settle=${JSON.stringify(corruptSettle)}`,
    );
  }

  // 15. Ghost-zero cancel must not stamp unknown_hold; normalize scrubs ghosts.
  const ghostAccount = {
    ...cancelled.account,
    heldMinor: 999,
    heldReservations: {
      ...cancelled.account.heldReservations,
      "ghost-zero": 0,
      "ghost-nan": Number.NaN,
    },
  };
  const ghostCancel = cancelBudgetReservation(ghostAccount, "ghost-zero", {
    known: false,
  });
  const scrubbed = normalizeBudgetHolds(ghostAccount);
  if (
    !ghostCancel.ok &&
    ghostCancel.code === "UNKNOWN_RESERVATION" &&
    scrubbed.heldMinor === 700 &&
    scrubbed.heldReservations["ghost-zero"] === undefined &&
    scrubbed.heldReservations["ghost-nan"] === undefined &&
    isUnknownUsageHold(scrubbed, "req-cancel-unknown") &&
    listUnknownUsageHoldIds(scrubbed).includes("req-cancel-unknown")
  ) {
    details.push(
      "Ghost-zero cancel → UNKNOWN_RESERVATION (not zero hold); normalizeBudgetHolds scrubs corrupt keys",
    );
  } else {
    passed = false;
    details.push(
      `Ghost scrub failed cancel=${JSON.stringify(ghostCancel)} scrub=${JSON.stringify(scrubbed.heldReservations)}`,
    );
  }

  // 16. Reserve may reuse ghost-zero id; open cancel scrubs sibling ghosts.
  const ghostReuseBase = {
    ...createBudgetAccount({
      dayKey: "2026-11-22",
      currency: "USD",
      limitMinor: 1000,
    }),
    heldReservations: { "ghost-reuse": 0 },
  };
  const reuse = reserveBudget(ghostReuseBase, "ghost-reuse", 90);
  if (!reuse.ok) {
    passed = false;
    details.push(`Ghost-reuse reserve failed: ${JSON.stringify(reuse)}`);
    return finish(passed, details, nowIso);
  }
  const withSibGhost = {
    ...reuse.account,
    heldReservations: {
      ...reuse.account.heldReservations,
      "ghost-sib": 0,
      "ghost-nan": Number.NaN,
    },
  };
  const reuseHold = cancelBudgetReservation(withSibGhost, "ghost-reuse", {
    known: false,
  });
  if (
    reuse.account.heldReservations["ghost-reuse"] === undefined &&
    reuse.account.openReservations["ghost-reuse"] === 90 &&
    reuseHold.ok &&
    reuseHold.costKind === "unknown_hold" &&
    reuseHold.account.heldMinor === 90 &&
    reuseHold.account.heldReservations["ghost-sib"] === undefined &&
    reuseHold.account.heldReservations["ghost-nan"] === undefined &&
    listUnknownUsageHoldIds(reuseHold.account).includes("ghost-reuse") &&
    reuseHold.liveBudgetProviderWiring === BUDGET_LIVE_PROVIDER_WIRING
  ) {
    details.push(
      "Reserve reuses ghost-zero id; open unknown-cancel scrubs sibling ghosts → held=90 NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(
      `Ghost-reuse/scrub-open-cancel failed reuse=${JSON.stringify(reuse)} hold=${JSON.stringify(reuseHold)}`,
    );
  }

  details.push(
    "liveProviderSuccessClaimed=false externalEffects=NONE liveBudgetProviderWiring=NOT_WIRED ACCEPTED≠VERIFIED",
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
