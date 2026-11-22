/**
 * Fixture proof for T-X026 — Concurrent final budget reservation → Cap enforced.
 *
 * Models concurrent finals as two attempts against the same remaining headroom
 * snapshot: each would succeed in isolation (oversubscribe risk), but composing
 * them through reserveBudget refuses the second with BUDGET_EXHAUSTED so reserved
 * never exceeds the daily limit. Memory BudgetStore sequential finals mirror the
 * same cap (no fake Promise.all race — memory reserve is sync before await).
 * External effects: NONE. Never invents live VERIFIED. Does not claim T-X027/T-X028.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  createBudgetAccount,
  reserveBudget,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createMemoryBudgetStore } from "@worksocial/persistence";

/**
 * Complete expected proof set for T-X026 fixture ACCEPTED.
 */
export async function proofConcurrentFinalBudgetReservationCap(
  nowIso: string,
): Promise<SoakProofRecord> {
  const details: string[] = [];
  let passed = true;

  // 1. Seed; first near-cap reserve succeeds.
  const seed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const first = reserveBudget(seed, "r-a", 600);
  if (
    first.ok &&
    first.amountMinor === 600 &&
    first.account.reservedMinor === 600
  ) {
    details.push("Domain reserve r-a=600 ok; reservedMinor=600");
  } else {
    passed = false;
    details.push(`First reserve unexpectedly ${JSON.stringify(first)}`);
  }

  if (first.ok) {
    // 2. Oversized concurrent final vs remaining → BUDGET_EXHAUSTED.
    const raced = reserveBudget(first.account, "r-b", 500);
    if (
      !raced.ok &&
      raced.code === "BUDGET_EXHAUSTED" &&
      raced.availableMinor === 400
    ) {
      details.push(
        "Near-cap r-b=500 → BUDGET_EXHAUSTED availableMinor=400 (cap enforced)",
      );
    } else {
      passed = false;
      details.push(`Near-cap race unexpectedly ${JSON.stringify(raced)}`);
    }

    // 3. Concurrent finals from the same remaining-400 snapshot:
    // each succeeds in isolation (would oversubscribe if both applied), but
    // composition applies only one and refuses the second.
    const snap = first.account;
    const isolA = reserveBudget(snap, "r-final-a", 400);
    const isolB = reserveBudget(snap, "r-final-b", 400);
    if (
      isolA.ok &&
      isolB.ok &&
      isolA.account.reservedMinor === 1000 &&
      isolB.account.reservedMinor === 1000
    ) {
      details.push(
        "Same-snapshot finals each ok in isolation (oversubscribe risk visible)",
      );
      const composed = reserveBudget(isolA.account, "r-final-b", 400);
      if (
        !composed.ok &&
        composed.code === "BUDGET_EXHAUSTED" &&
        composed.availableMinor === 0 &&
        isolA.account.reservedMinor === 1000 &&
        isolA.account.reservedMinor <= isolA.account.limitMinor
      ) {
        details.push(
          "Composed concurrent finals: second BUDGET_EXHAUSTED; reservedMinor=1000 ≤ limit",
        );
      } else {
        passed = false;
        details.push(
          `Composition unexpectedly ${JSON.stringify(composed)} reserved=${isolA.account.reservedMinor}`,
        );
      }
    } else {
      passed = false;
      details.push(
        `Isolation finals unexpectedly a=${JSON.stringify(isolA)} b=${JSON.stringify(isolB)}`,
      );
    }
  }

  // 4. Memory BudgetStore: sequential final pair after prior reserve (honest serialize).
  const store = createMemoryBudgetStore();
  const account = await store.ensureAccount({
    dayKey: "2026-11-22-store",
    currency: "USD",
    limitMinor: 1000,
  });
  const prior = await store.reserve({
    accountId: account.accountId,
    reservationId: "store-prior",
    amountMinor: 700,
  });
  if (!prior.ok) {
    passed = false;
    details.push(`Store prior reserve failed ${JSON.stringify(prior)}`);
  } else {
    const a = await store.reserve({
      accountId: account.accountId,
      reservationId: "store-final-a",
      amountMinor: 300,
    });
    const b = await store.reserve({
      accountId: account.accountId,
      reservationId: "store-final-b",
      amountMinor: 300,
    });
    const after = await store.getAccount(account.accountId);
    if (
      a.ok &&
      !b.ok &&
      b.code === "BUDGET_EXHAUSTED" &&
      after &&
      after.reservedMinor === 1000 &&
      after.reservedMinor <= after.limitMinor
    ) {
      details.push(
        "Memory BudgetStore sequential finals: first ok, second BUDGET_EXHAUSTED; reservedMinor=1000 ≤ limit",
      );
    } else {
      passed = false;
      details.push(
        `Store finals unexpected a=${JSON.stringify(a)} b=${JSON.stringify(b)} reserved=${after?.reservedMinor}`,
      );
    }
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-concurrent-budget-cap-${randomUUID()}`,
    kind: SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-x026-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
