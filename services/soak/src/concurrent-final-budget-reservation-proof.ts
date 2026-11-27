/**
 * Fixture proof for T-X026 — Concurrent final budget reservation → Cap enforced.
 *
 * Models concurrent finals as two attempts against the same remaining headroom
 * snapshot: each would succeed in isolation (oversubscribe risk), but composing
 * them through reserveBudget / composeConcurrentFinalBudgetReserves refuses the
 * second with BUDGET_EXHAUSTED so reserved never exceeds the daily limit. Memory
 * BudgetStore sequential finals mirror the same cap (no fake Promise.all race —
 * memory reserve is sync before await).
 * Hillclimb M1: exact-remaining fill + stale peer, three-way same-snapshot
 * composition, availableBudgetMinor asserts, liveWiring=NOT_WIRED.
 * Hillclimb M2: isolationWouldOversubscribe + exhausted.availableMinor,
 * four-way pack, settled-headroom concurrent composition, input immutability.
 * Hillclimb M3: acceptedSumMinor + committed-limit; non-oversubscribe fit path;
 * zero-headroom all-exhaust; memory Promise.all serialize still caps.
 * Hillclimb M4: accepted[] mirror; fixtureAcceptedNotVerified; empty-finals
 * identity; single-oversize exhaust; committedBudgetMinor export.
 * Hillclimb M5: committedMinor + availableMatchesLimitMinusCommitted;
 * isConcurrentBudgetCompositionHonest; duplicate-id throw immutability.
 * Hillclimb M6: heldMinor headroom composition; non-positive amount refuse;
 * honesty predicate rejects forged fields.
 * Hillclimb M7: preflight positive amounts; known-zero-cancel then compose;
 * settled-id reuse refuse; honesty rejects forged externalEffects/isolation.
 * Hillclimb M8: open/held reservationId collision refuse; settled+held headroom;
 * honesty rejects forged committedMinor/acceptedIds length.
 * Hillclimb M9: blank-id preflight; known-reconcile then compose; all-exhaust
 * snap immutability; honesty rejects fixture/availableMatches/exhausted/isolationSum.
 * Hillclimb M10: duplicate-id preflight; known-positive cancel then compose;
 * exhausted availableMinor after accept; honesty rejects reservedNever/
 * Hillclimb M11: trim-normalized duplicate-id preflight; padded id composes trimmed.
 * availableMinor/acceptedSum.
 * External effects: NONE. Never invents live VERIFIED. Does not claim T-X027/T-X028.
 */

import { randomUUID } from "node:crypto";
import {
  availableBudgetMinor,
  BUDGET_RESERVATION_LIVE_WIRING,
  SoakProofKind,
  cancelBudgetReservation,
  committedBudgetMinor,
  composeConcurrentFinalBudgetReserves,
  createBudgetAccount,
  isConcurrentBudgetCompositionHonest,
  reserveBudget,
  settleBudget,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createMemoryBudgetStore } from "@worksocial/persistence";

/**
 * Complete expected proof set for T-X026 fixture ACCEPTED.
 * Hillclimb: multi-way + settled/fit/zero/empty/oversize + held + honesty.
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
    first.account.reservedMinor === 600 &&
    availableBudgetMinor(first.account) === 400
  ) {
    details.push(
      "Domain reserve r-a=600 ok; reservedMinor=600 availableMinor=400",
    );
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
      const snapReservedBefore = snap.reservedMinor;
      const composed = composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-final-a", amountMinor: 400 },
        { reservationId: "r-final-b", amountMinor: 400 },
      ]);
      if (
        composed.acceptedReservationIds.length === 1 &&
        composed.acceptedReservationIds[0] === "r-final-a" &&
        composed.exhaustedReservationIds.includes("r-final-b") &&
        composed.exhausted.some(
          (e) => e.reservationId === "r-final-b" && e.availableMinor === 0,
        ) &&
        composed.availableAtSnapshotMinor === 400 &&
        composed.isolationSumMinor === 800 &&
        composed.isolationWouldOversubscribe === true &&
        composed.account.reservedMinor === 1000 &&
        composed.reservedNeverExceedsLimit &&
        composed.availableMinor === 0 &&
        composed.liveWiring === BUDGET_RESERVATION_LIVE_WIRING &&
        composed.externalEffects === "NONE" &&
        snap.reservedMinor === snapReservedBefore
      ) {
        details.push(
          "Composed concurrent finals: second BUDGET_EXHAUSTED; isolationWouldOversubscribe; reservedMinor=1000 ≤ limit; liveWiring=NOT_WIRED; snap immutable",
        );
      } else {
        passed = false;
        details.push(
          `Composition unexpectedly ${JSON.stringify(composed)}`,
        );
      }
    } else {
      passed = false;
      details.push(
        `Isolation finals unexpectedly a=${JSON.stringify(isolA)} b=${JSON.stringify(isolB)}`,
      );
    }

    // 4. Exact-remaining fill then stale peer refused (hillclimb).
    const exact = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-exact", amountMinor: 400 },
      { reservationId: "r-stale-peer", amountMinor: 400 },
    ]);
    if (
      exact.acceptedReservationIds.includes("r-exact") &&
      exact.exhaustedReservationIds.includes("r-stale-peer") &&
      exact.account.reservedMinor === 1000 &&
      exact.reservedNeverExceedsLimit &&
      exact.availableMinor === 0 &&
      exact.liveWiring === "NOT_WIRED"
    ) {
      details.push(
        "Exact-remaining concurrent: r-exact ok; stale peer BUDGET_EXHAUSTED; reserved=limit",
      );
    } else {
      passed = false;
      details.push(`Exact-remaining unexpectedly ${JSON.stringify(exact)}`);
    }

    // 5. Three-way same-snapshot oversubscribe (hillclimb).
    const tripleSeed = createBudgetAccount({
      dayKey: "2026-11-22-triple",
      currency: "USD",
      limitMinor: 1000,
    });
    const triplePrior = reserveBudget(tripleSeed, "r-triple-prior", 500);
    if (!triplePrior.ok) {
      passed = false;
      details.push(`Triple prior unexpectedly ${JSON.stringify(triplePrior)}`);
    } else {
      const triple = composeConcurrentFinalBudgetReserves(triplePrior.account, [
        { reservationId: "r-t1", amountMinor: 300 },
        { reservationId: "r-t2", amountMinor: 300 },
        { reservationId: "r-t3", amountMinor: 300 },
      ]);
      if (
        triple.acceptedReservationIds.length === 1 &&
        triple.exhaustedReservationIds.length === 2 &&
        triple.isolationWouldOversubscribe === true &&
        triple.availableAtSnapshotMinor === 500 &&
        triple.account.reservedMinor === 800 &&
        triple.account.reservedMinor <= triple.account.limitMinor &&
        triple.reservedNeverExceedsLimit &&
        triple.availableMinor === 200 &&
        triple.externalEffects === "NONE"
      ) {
        details.push(
          "Three-way same-snapshot: one accepted, two BUDGET_EXHAUSTED; isolationWouldOversubscribe; reservedMinor=800 ≤ limit",
        );
      } else {
        passed = false;
        details.push(`Three-way unexpectedly ${JSON.stringify(triple)}`);
      }
    }

    // 5b. Four-way pack (M2 hillclimb).
    const four = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-p1", amountMinor: 200 },
      { reservationId: "r-p2", amountMinor: 200 },
      { reservationId: "r-p3", amountMinor: 200 },
      { reservationId: "r-p4", amountMinor: 200 },
    ]);
    if (
      four.acceptedReservationIds.length === 2 &&
      four.exhaustedReservationIds.length === 2 &&
      four.isolationWouldOversubscribe &&
      four.availableAtSnapshotMinor === 400 &&
      four.exhausted.every((e) => e.availableMinor === 0) &&
      four.account.reservedMinor === 1000 &&
      four.reservedNeverExceedsLimit &&
      four.liveWiring === "NOT_WIRED"
    ) {
      details.push(
        "Four-way pack: two accepted, two BUDGET_EXHAUSTED availableMinor=0; reserved=limit",
      );
    } else {
      passed = false;
      details.push(`Four-way unexpectedly ${JSON.stringify(four)}`);
    }

    // 5c. Settled spend reduces concurrent headroom (M2; actual=reserved, not T-X028).
    const settleSeed = createBudgetAccount({
      dayKey: "2026-11-22-settled",
      currency: "USD",
      limitMinor: 1000,
    });
    const settleReserve = reserveBudget(settleSeed, "r-settle", 400);
    if (!settleReserve.ok) {
      passed = false;
      details.push(`Settle prior unexpectedly ${JSON.stringify(settleReserve)}`);
    } else {
      const settled = settleBudget(settleReserve.account, "r-settle", 400);
      if (!settled.ok) {
        passed = false;
        details.push(`Settle unexpectedly ${JSON.stringify(settled)}`);
      } else {
        const afterSettle = composeConcurrentFinalBudgetReserves(
          settled.account,
          [
            { reservationId: "r-after-a", amountMinor: 400 },
            { reservationId: "r-after-b", amountMinor: 400 },
          ],
        );
        if (
          afterSettle.acceptedReservationIds.includes("r-after-a") &&
          afterSettle.exhaustedReservationIds.includes("r-after-b") &&
          afterSettle.availableAtSnapshotMinor === 600 &&
          afterSettle.isolationWouldOversubscribe &&
          afterSettle.exhausted[0]?.availableMinor === 200 &&
          afterSettle.account.settledMinor === 400 &&
          afterSettle.account.reservedMinor === 400 &&
          afterSettle.reservedNeverExceedsLimit &&
          afterSettle.externalEffects === "NONE"
        ) {
          details.push(
            "Settled-headroom concurrent: after settle=400, second final BUDGET_EXHAUSTED availableMinor=200",
          );
        } else {
          passed = false;
          details.push(
            `Settled-headroom unexpectedly ${JSON.stringify(afterSettle)}`,
          );
        }
      }
    }

    // 5d. Non-oversubscribe fit path (M3).
    const fit = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-fit-a", amountMinor: 150 },
      { reservationId: "r-fit-b", amountMinor: 150 },
    ]);
    if (
      fit.isolationWouldOversubscribe === false &&
      fit.acceptedReservationIds.length === 2 &&
      fit.accepted.length === 2 &&
      fit.acceptedSumMinor === 300 &&
      fit.exhaustedReservationIds.length === 0 &&
      fit.account.reservedMinor === 900 &&
      fit.reservedNeverExceedsLimit &&
      fit.fixtureAcceptedNotVerified === true &&
      fit.availableMinor === 100 &&
      fit.liveWiring === BUDGET_RESERVATION_LIVE_WIRING
    ) {
      details.push(
        "Non-oversubscribe fit: both finals accepted; acceptedSumMinor=300; fixtureAcceptedNotVerified; isolationWouldOversubscribe=false",
      );
    } else {
      passed = false;
      details.push(`Fit path unexpectedly ${JSON.stringify(fit)}`);
    }

    // 5d2. Empty finals identity + single-oversize exhaust (M4 edge honesty).
    const empty = composeConcurrentFinalBudgetReserves(first.account, []);
    if (
      empty.accepted.length === 0 &&
      empty.exhausted.length === 0 &&
      empty.isolationSumMinor === 0 &&
      empty.isolationWouldOversubscribe === false &&
      empty.availableMinor === availableBudgetMinor(first.account) &&
      empty.fixtureAcceptedNotVerified === true &&
      first.account.reservedMinor === 600
    ) {
      details.push(
        "Empty-finals identity: no accepts/exhausts; snap immutable; fixtureAcceptedNotVerified",
      );
    } else {
      passed = false;
      details.push(`Empty finals unexpectedly ${JSON.stringify(empty)}`);
    }
    const oversize = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-oversize", amountMinor: 500 },
    ]);
    if (
      oversize.accepted.length === 0 &&
      oversize.acceptedSumMinor === 0 &&
      oversize.exhausted.length === 1 &&
      oversize.exhausted[0]?.availableMinor === 400 &&
      oversize.isolationWouldOversubscribe &&
      committedBudgetMinor(oversize.account) === 600 &&
      oversize.committedMinor === 600 &&
      oversize.availableMatchesLimitMinusCommitted &&
      oversize.reservedNeverExceedsLimit &&
      oversize.fixtureAcceptedNotVerified &&
      isConcurrentBudgetCompositionHonest(oversize)
    ) {
      details.push(
        "Single-oversize exhaust: no accept; BUDGET_EXHAUSTED availableMinor=400; committed=600; compositionHonest",
      );
    } else {
      passed = false;
      details.push(`Single-oversize unexpectedly ${JSON.stringify(oversize)}`);
    }

    // 5d3. Duplicate reservationId throws; snap immutable (M5).
    const snapBeforeDup = first.account.reservedMinor;
    let dupThrew = false;
    try {
      composeConcurrentFinalBudgetReserves(first.account, [
        { reservationId: "r-dup", amountMinor: 50 },
        { reservationId: "r-dup", amountMinor: 50 },
      ]);
    } catch (err) {
      dupThrew = /already exists/i.test(
        err instanceof Error ? err.message : String(err),
      );
    }
    if (dupThrew && first.account.reservedMinor === snapBeforeDup) {
      details.push(
        "Duplicate reservationId throws; input snap immutable; no silent double-apply",
      );
    } else {
      passed = false;
      details.push(
        `Duplicate-id unexpectedly threw=${dupThrew} reserved=${first.account.reservedMinor}`,
      );
    }

    // 5d4. Honesty predicate on fit composition (M5).
    if (isConcurrentBudgetCompositionHonest(fit)) {
      details.push(
        "isConcurrentBudgetCompositionHonest(fit)=true; availableMatchesLimitMinusCommitted",
      );
    } else {
      passed = false;
      details.push("Honesty predicate failed on fit composition");
    }

    // 5d5. heldMinor shrinks composition headroom (M6; not T-X027 ownership).
    const holdSeed = createBudgetAccount({
      dayKey: "2026-11-22-held",
      currency: "USD",
      limitMinor: 1000,
    });
    const holdReserve = reserveBudget(holdSeed, "r-hold", 700);
    if (!holdReserve.ok) {
      passed = false;
      details.push(`Hold reserve unexpectedly ${JSON.stringify(holdReserve)}`);
    } else {
      const held = cancelBudgetReservation(holdReserve.account, "r-hold", {
        known: false,
      });
      if (!held.ok) {
        passed = false;
        details.push(`Hold cancel unexpectedly ${JSON.stringify(held)}`);
      } else {
        const heldCompose = composeConcurrentFinalBudgetReserves(held.account, [
          { reservationId: "r-ha", amountMinor: 300 },
          { reservationId: "r-hb", amountMinor: 300 },
        ]);
        if (
          held.account.heldMinor === 700 &&
          heldCompose.availableAtSnapshotMinor === 300 &&
          heldCompose.isolationWouldOversubscribe &&
          heldCompose.acceptedSumMinor === 300 &&
          heldCompose.exhausted.length === 1 &&
          heldCompose.exhausted[0]?.availableMinor === 0 &&
          heldCompose.committedMinor === 1000 &&
          isConcurrentBudgetCompositionHonest(heldCompose)
        ) {
          details.push(
            "heldMinor headroom: concurrent compose accepts 300 then BUDGET_EXHAUSTED; committed=1000; compositionHonest",
          );
        } else {
          passed = false;
          details.push(
            `heldMinor compose unexpectedly ${JSON.stringify(heldCompose)}`,
          );
        }
      }
    }

    // 5d6. Non-positive amount throws; snap immutable (M6).
    const snapBeforeZero = first.account.reservedMinor;
    let zeroThrew = false;
    try {
      composeConcurrentFinalBudgetReserves(first.account, [
        { reservationId: "r-ok", amountMinor: 50 },
        { reservationId: "r-zero", amountMinor: 0 },
      ]);
    } catch (err) {
      zeroThrew = /positive/i.test(
        err instanceof Error ? err.message : String(err),
      );
    }
    if (zeroThrew && first.account.reservedMinor === snapBeforeZero) {
      details.push(
        "Non-positive amount throws; input snap immutable; no silent apply",
      );
    } else {
      passed = false;
      details.push(
        `Non-positive unexpectedly threw=${zeroThrew} reserved=${first.account.reservedMinor}`,
      );
    }

    // 5d7. Honesty predicate rejects forged fields (M6).
    const forgedLive = {
      ...fit,
      liveWiring: "WIRED" as typeof fit.liveWiring,
    };
    const forgedSum = { ...fit, acceptedSumMinor: fit.acceptedSumMinor + 1 };
    if (
      !isConcurrentBudgetCompositionHonest(forgedLive) &&
      !isConcurrentBudgetCompositionHonest(forgedSum)
    ) {
      details.push(
        "Honesty predicate rejects forged liveWiring and acceptedSumMinor",
      );
    } else {
      passed = false;
      details.push("Honesty predicate unexpectedly accepted forged composition");
    }

    // 5d8. Known-zero cancel restores headroom; compose accepts (M7).
    const zeroRelSeed = createBudgetAccount({
      dayKey: "2026-11-22-zero-rel",
      currency: "USD",
      limitMinor: 1000,
    });
    const zeroRes = reserveBudget(zeroRelSeed, "r-zero-rel", 600);
    if (!zeroRes.ok) {
      passed = false;
      details.push(`Known-zero reserve unexpectedly ${JSON.stringify(zeroRes)}`);
    } else {
      const zeroRel = cancelBudgetReservation(zeroRes.account, "r-zero-rel", {
        known: true,
        actualMinor: 0,
      });
      if (!zeroRel.ok) {
        passed = false;
        details.push(`Known-zero cancel unexpectedly ${JSON.stringify(zeroRel)}`);
      } else {
        const afterZero = composeConcurrentFinalBudgetReserves(zeroRel.account, [
          { reservationId: "r-za", amountMinor: 400 },
          { reservationId: "r-zb", amountMinor: 400 },
        ]);
        if (
          zeroRel.account.heldMinor === 0 &&
          afterZero.availableAtSnapshotMinor === 1000 &&
          afterZero.acceptedSumMinor === 800 &&
          afterZero.exhausted.length === 0 &&
          isConcurrentBudgetCompositionHonest(afterZero)
        ) {
          details.push(
            "Known-zero cancel restores headroom; concurrent compose accepts 800; compositionHonest",
          );
        } else {
          passed = false;
          details.push(
            `Known-zero compose unexpectedly ${JSON.stringify(afterZero)}`,
          );
        }
      }
    }

    // 5d9. Settled reservationId reuse throws; snap immutable (M7).
    const settlePrior = reserveBudget(first.account, "r-settle-reuse", 100);
    if (!settlePrior.ok) {
      passed = false;
      details.push(`Settle prior unexpectedly ${JSON.stringify(settlePrior)}`);
    } else {
      const settledReuse = settleBudget(
        settlePrior.account,
        "r-settle-reuse",
        40,
      );
      if (!settledReuse.ok) {
        passed = false;
        details.push(
          `Settle reuse unexpectedly ${JSON.stringify(settledReuse)}`,
        );
      } else {
        const snapSettled = settledReuse.account.settledMinor;
        let settledThrew = false;
        try {
          composeConcurrentFinalBudgetReserves(settledReuse.account, [
            { reservationId: "r-settle-reuse", amountMinor: 50 },
          ]);
        } catch (err) {
          settledThrew = /already exists/i.test(
            err instanceof Error ? err.message : String(err),
          );
        }
        if (
          settledThrew &&
          settledReuse.account.settledMinor === snapSettled
        ) {
          details.push(
            "Settled reservationId reuse throws; input snap immutable",
          );
        } else {
          passed = false;
          details.push(
            `Settled-id unexpectedly threw=${settledThrew} settled=${settledReuse.account.settledMinor}`,
          );
        }
      }
    }

    // 5d10. Honesty rejects forged externalEffects / isolation flag (M7).
    const forgedFx = {
      ...fit,
      externalEffects: "SOME" as "NONE",
    };
    const forgedIso = {
      ...fit,
      isolationWouldOversubscribe: !fit.isolationWouldOversubscribe,
    };
    if (
      !isConcurrentBudgetCompositionHonest(forgedFx) &&
      !isConcurrentBudgetCompositionHonest(forgedIso)
    ) {
      details.push(
        "Honesty predicate rejects forged externalEffects and isolationWouldOversubscribe",
      );
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged externalEffects/isolation",
      );
    }

    // 5d11. Open reservationId collision throws; snap immutable (M8).
    const openSeed = createBudgetAccount({
      dayKey: "2026-11-22-open-id",
      currency: "USD",
      limitMinor: 1000,
    });
    const openPrior = reserveBudget(openSeed, "r-open", 250);
    if (!openPrior.ok) {
      passed = false;
      details.push(`Open prior unexpectedly ${JSON.stringify(openPrior)}`);
    } else {
      const snapOpen = openPrior.account.reservedMinor;
      let openThrew = false;
      try {
        composeConcurrentFinalBudgetReserves(openPrior.account, [
          { reservationId: "r-open", amountMinor: 100 },
          { reservationId: "r-peer", amountMinor: 100 },
        ]);
      } catch (err) {
        openThrew = /already exists/i.test(
          err instanceof Error ? err.message : String(err),
        );
      }
      if (openThrew && openPrior.account.reservedMinor === snapOpen) {
        details.push(
          "Open reservationId collision: compose throws; snap immutable",
        );
      } else {
        passed = false;
        details.push(
          `Open-id unexpectedly threw=${openThrew} reserved=${openPrior.account.reservedMinor}`,
        );
      }
    }

    // 5d12. Held reservationId collision throws; snap immutable (M8).
    const heldSeed = createBudgetAccount({
      dayKey: "2026-11-22-held-id",
      currency: "USD",
      limitMinor: 1000,
    });
    const heldRes = reserveBudget(heldSeed, "r-held", 400);
    if (!heldRes.ok) {
      passed = false;
      details.push(`Held reserve unexpectedly ${JSON.stringify(heldRes)}`);
    } else {
      const heldCancel = cancelBudgetReservation(heldRes.account, "r-held", {
        known: false,
      });
      if (!heldCancel.ok) {
        passed = false;
        details.push(
          `Held cancel unexpectedly ${JSON.stringify(heldCancel)}`,
        );
      } else {
        const snapHeld = heldCancel.account.heldMinor;
        let heldThrew = false;
        try {
          composeConcurrentFinalBudgetReserves(heldCancel.account, [
            { reservationId: "r-held", amountMinor: 50 },
          ]);
        } catch (err) {
          heldThrew = /already exists/i.test(
            err instanceof Error ? err.message : String(err),
          );
        }
        if (heldThrew && heldCancel.account.heldMinor === snapHeld) {
          details.push(
            "Held reservationId collision: compose throws; snap immutable",
          );
        } else {
          passed = false;
          details.push(
            `Held-id unexpectedly threw=${heldThrew} held=${heldCancel.account.heldMinor}`,
          );
        }
      }
    }

    // 5d13. Settled+held combined headroom caps concurrent compose (M8).
    const comboSeed = createBudgetAccount({
      dayKey: "2026-11-22-settle-held",
      currency: "USD",
      limitMinor: 1000,
    });
    const comboSettleRes = reserveBudget(comboSeed, "r-settle", 300);
    if (!comboSettleRes.ok) {
      passed = false;
      details.push(
        `Combo settle reserve unexpectedly ${JSON.stringify(comboSettleRes)}`,
      );
    } else {
      const comboSettled = settleBudget(
        comboSettleRes.account,
        "r-settle",
        200,
      );
      if (!comboSettled.ok) {
        passed = false;
        details.push(
          `Combo settle unexpectedly ${JSON.stringify(comboSettled)}`,
        );
      } else {
        const comboHoldRes = reserveBudget(
          comboSettled.account,
          "r-hold",
          500,
        );
        if (!comboHoldRes.ok) {
          passed = false;
          details.push(
            `Combo hold reserve unexpectedly ${JSON.stringify(comboHoldRes)}`,
          );
        } else {
          const comboHeld = cancelBudgetReservation(
            comboHoldRes.account,
            "r-hold",
            { known: false },
          );
          if (!comboHeld.ok) {
            passed = false;
            details.push(
              `Combo hold cancel unexpectedly ${JSON.stringify(comboHeld)}`,
            );
          } else {
            const combo = composeConcurrentFinalBudgetReserves(
              comboHeld.account,
              [
                { reservationId: "r-a", amountMinor: 200 },
                { reservationId: "r-b", amountMinor: 200 },
              ],
            );
            if (
              combo.availableAtSnapshotMinor === 300 &&
              combo.acceptedSumMinor === 200 &&
              combo.exhaustedReservationIds.length === 1 &&
              combo.exhausted[0]?.availableMinor === 100 &&
              combo.committedMinor === 900 &&
              combo.reservedNeverExceedsLimit &&
              isConcurrentBudgetCompositionHonest(combo)
            ) {
              details.push(
                "settled+held headroom: concurrent compose accepts 200 then BUDGET_EXHAUSTED; committed=900; compositionHonest",
              );
            } else {
              passed = false;
              details.push(
                `settled+held compose unexpectedly ${JSON.stringify(combo)}`,
              );
            }
          }
        }
      }
    }

    // 5d14. Honesty rejects forged committedMinor / acceptedIds length (M8).
    const forgedCommitted = {
      ...fit,
      committedMinor: fit.committedMinor + 1,
    };
    const forgedAcceptedIds = {
      ...fit,
      acceptedReservationIds: [...fit.acceptedReservationIds, "ghost"],
    };
    if (
      !isConcurrentBudgetCompositionHonest(forgedCommitted) &&
      !isConcurrentBudgetCompositionHonest(forgedAcceptedIds)
    ) {
      details.push(
        "Honesty predicate rejects forged committedMinor and acceptedReservationIds length",
      );
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged committedMinor/acceptedIds",
      );
    }

    // 5d15. Blank reservationId preflight throws; snap immutable (M9).
    const blankSeed = createBudgetAccount({
      dayKey: "2026-11-22-blank-id",
      currency: "USD",
      limitMinor: 1000,
    });
    let blankThrew = false;
    try {
      composeConcurrentFinalBudgetReserves(blankSeed, [
        { reservationId: "   ", amountMinor: 100 },
        { reservationId: "r-peer", amountMinor: 100 },
      ]);
    } catch (err) {
      blankThrew = /non-blank/i.test(
        err instanceof Error ? err.message : String(err),
      );
    }
    if (blankThrew && blankSeed.reservedMinor === 0) {
      details.push(
        "Blank reservationId preflight: compose throws; snap immutable",
      );
    } else {
      passed = false;
      details.push(
        `Blank-id unexpectedly threw=${blankThrew} reserved=${blankSeed.reservedMinor}`,
      );
    }

    // 5d16. Known-reconcile hold then compose restores headroom (M9).
    const reconSeed = createBudgetAccount({
      dayKey: "2026-11-22-reconcile",
      currency: "USD",
      limitMinor: 1000,
    });
    const reconRes = reserveBudget(reconSeed, "r-reconcile", 400);
    if (!reconRes.ok) {
      passed = false;
      details.push(`Reconcile reserve unexpectedly ${JSON.stringify(reconRes)}`);
    } else {
      const reconHeld = cancelBudgetReservation(reconRes.account, "r-reconcile", {
        known: false,
      });
      if (!reconHeld.ok) {
        passed = false;
        details.push(
          `Reconcile hold unexpectedly ${JSON.stringify(reconHeld)}`,
        );
      } else {
        const reconResolved = cancelBudgetReservation(
          reconHeld.account,
          "r-reconcile",
          { known: true, actualMinor: 175 },
        );
        if (!reconResolved.ok) {
          passed = false;
          details.push(
            `Reconcile resolve unexpectedly ${JSON.stringify(reconResolved)}`,
          );
        } else {
          const recon = composeConcurrentFinalBudgetReserves(
            reconResolved.account,
            [
              { reservationId: "r-a", amountMinor: 500 },
              { reservationId: "r-b", amountMinor: 500 },
            ],
          );
          if (
            recon.availableAtSnapshotMinor === 825 &&
            recon.acceptedSumMinor === 500 &&
            recon.exhaustedReservationIds.length === 1 &&
            recon.exhausted[0]?.availableMinor === 325 &&
            recon.committedMinor === 675 &&
            isConcurrentBudgetCompositionHonest(recon)
          ) {
            details.push(
              "known-reconcile restore: concurrent compose accepts 500 then BUDGET_EXHAUSTED; committed=675; compositionHonest",
            );
          } else {
            passed = false;
            details.push(
              `known-reconcile compose unexpectedly ${JSON.stringify(recon)}`,
            );
          }
        }
      }
    }

    // 5d17. All-exhaust leaves input snap immutable (M9).
    const exhaustSeed = createBudgetAccount({
      dayKey: "2026-11-22-all-exhaust-imm",
      currency: "USD",
      limitMinor: 1000,
    });
    const exhaustFill = reserveBudget(exhaustSeed, "r-fill", 1000);
    if (!exhaustFill.ok) {
      passed = false;
      details.push(
        `All-exhaust fill unexpectedly ${JSON.stringify(exhaustFill)}`,
      );
    } else {
      const snapReserved = exhaustFill.account.reservedMinor;
      const allEx = composeConcurrentFinalBudgetReserves(exhaustFill.account, [
        { reservationId: "r-z1", amountMinor: 1 },
        { reservationId: "r-z2", amountMinor: 50 },
      ]);
      if (
        allEx.acceptedSumMinor === 0 &&
        allEx.exhaustedReservationIds.length === 2 &&
        exhaustFill.account.reservedMinor === snapReserved &&
        exhaustFill.account.openReservations["r-fill"] === 1000 &&
        isConcurrentBudgetCompositionHonest(allEx)
      ) {
        details.push(
          "All-exhaust snap immutable: reservedMinor unchanged; acceptedSumMinor=0; compositionHonest",
        );
      } else {
        passed = false;
        details.push(
          `All-exhaust immutability unexpectedly ${JSON.stringify(allEx)} reserved=${exhaustFill.account.reservedMinor}`,
        );
      }
    }

    // 5d18. Honesty rejects forged fixture/availableMatches/exhausted/isolationSum (M9).
    const forgedFixture = {
      ...fit,
      fixtureAcceptedNotVerified: false as true,
    };
    const forgedAvailMatch = {
      ...fit,
      availableMatchesLimitMinusCommitted:
        !fit.availableMatchesLimitMinusCommitted,
    };
    const forgedExhaustedIds = {
      ...fit,
      exhaustedReservationIds: [...fit.exhaustedReservationIds, "ghost"],
    };
    const forgedIsolationSum = {
      ...fit,
      isolationSumMinor: fit.availableAtSnapshotMinor + 1,
      isolationWouldOversubscribe: false,
    };
    if (
      !isConcurrentBudgetCompositionHonest(forgedFixture) &&
      !isConcurrentBudgetCompositionHonest(forgedAvailMatch) &&
      !isConcurrentBudgetCompositionHonest(forgedExhaustedIds) &&
      !isConcurrentBudgetCompositionHonest(forgedIsolationSum)
    ) {
      details.push(
        "Honesty predicate rejects forged fixtureAcceptedNotVerified/availableMatches/exhaustedIds/isolationSum",
      );
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged fixture/availableMatches/exhausted/isolationSum",
      );
    }

    // 5d19. Duplicate ids in finals[] preflight throws; snap immutable (M10).
    const dupPreflightSeed = createBudgetAccount({
      dayKey: "2026-11-22-dup-preflight",
      currency: "USD",
      limitMinor: 1000,
    });
    let dupPreflightThrew = false;
    try {
      composeConcurrentFinalBudgetReserves(dupPreflightSeed, [
        { reservationId: "r-dup", amountMinor: 100 },
        { reservationId: "r-dup", amountMinor: 200 },
      ]);
    } catch (err) {
      dupPreflightThrew = /already exists/i.test(
        err instanceof Error ? err.message : String(err),
      );
    }
    if (dupPreflightThrew && dupPreflightSeed.reservedMinor === 0) {
      details.push(
        "Duplicate-id preflight: compose throws before apply; snap immutable",
      );
    } else {
      passed = false;
      details.push(
        `Duplicate-id preflight unexpectedly threw=${dupPreflightThrew} reserved=${dupPreflightSeed.reservedMinor}`,
      );
    }

    // 5d20. Known-positive cancel then compose restores headroom (M10).
    const posSeed = createBudgetAccount({
      dayKey: "2026-11-22-known-positive",
      currency: "USD",
      limitMinor: 1000,
    });
    const posRes = reserveBudget(posSeed, "r-pos", 400);
    if (!posRes.ok) {
      passed = false;
      details.push(`Known-positive reserve unexpectedly ${JSON.stringify(posRes)}`);
    } else {
      const posCancel = cancelBudgetReservation(posRes.account, "r-pos", {
        known: true,
        actualMinor: 150,
      });
      if (!posCancel.ok) {
        passed = false;
        details.push(
          `Known-positive cancel unexpectedly ${JSON.stringify(posCancel)}`,
        );
      } else {
        const pos = composeConcurrentFinalBudgetReserves(posCancel.account, [
          { reservationId: "r-a", amountMinor: 500 },
          { reservationId: "r-b", amountMinor: 500 },
        ]);
        if (
          pos.availableAtSnapshotMinor === 850 &&
          pos.acceptedSumMinor === 500 &&
          pos.exhaustedReservationIds.length === 1 &&
          pos.exhausted[0]?.availableMinor === 350 &&
          pos.committedMinor === 650 &&
          isConcurrentBudgetCompositionHonest(pos)
        ) {
          details.push(
            "known-positive restore: concurrent compose accepts 500 then BUDGET_EXHAUSTED; committed=650; compositionHonest",
          );
        } else {
          passed = false;
          details.push(
            `known-positive compose unexpectedly ${JSON.stringify(pos)}`,
          );
        }
      }
    }

    // 5d21. Exhausted availableMinor after prior accept (M10).
    const exhAvail = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-exh-avail",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-a", amountMinor: 600 },
        { reservationId: "r-b", amountMinor: 500 },
        { reservationId: "r-c", amountMinor: 450 },
      ],
    );
    if (
      exhAvail.acceptedReservationIds.length === 1 &&
      exhAvail.exhaustedReservationIds.length === 2 &&
      exhAvail.exhausted.every((e) => e.availableMinor === 400) &&
      exhAvail.acceptedSumMinor === 600 &&
      isConcurrentBudgetCompositionHonest(exhAvail)
    ) {
      details.push(
        "Exhausted availableMinor after accept: peers see remaining=400; compositionHonest",
      );
    } else {
      passed = false;
      details.push(
        `Exhausted availableMinor unexpectedly ${JSON.stringify(exhAvail)}`,
      );
    }

    // 5d22. Honesty rejects forged reservedNever/availableMinor/acceptedSum (M10).
    const forgedReservedNever = {
      ...fit,
      reservedNeverExceedsLimit: false,
    };
    const forgedAvailableMinor = {
      ...fit,
      availableMinor: fit.availableMinor + 1,
    };
    const forgedAcceptedSum = {
      ...fit,
      acceptedSumMinor: fit.acceptedSumMinor + 1,
    };
    if (
      !isConcurrentBudgetCompositionHonest(forgedReservedNever) &&
      !isConcurrentBudgetCompositionHonest(forgedAvailableMinor) &&
      !isConcurrentBudgetCompositionHonest(forgedAcceptedSum)
    ) {
      details.push(
        "Honesty predicate rejects forged reservedNeverExceedsLimit/availableMinor/acceptedSumMinor",
      );
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged reservedNever/availableMinor/acceptedSum",
      );
    }

  const rowIdDrift = {
      ...fit,
      accepted: [{ reservationId: "r-forged", amountMinor: fit.acceptedSumMinor }],
    };
    if (!isConcurrentBudgetCompositionHonest(rowIdDrift)) {
      details.push(
        "Honesty predicate rejects accepted row id drift vs acceptedReservationIds",
      );
    } else {
      passed = false;
      details.push("Honesty predicate unexpectedly accepted row-id drift");
    }

    const exhDrift = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-exh-drift",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-ex-a", amountMinor: 700 },
        { reservationId: "r-ex-b", amountMinor: 400 },
      ],
    );
    const exhRowDrift = {
      ...exhDrift,
      exhausted: exhDrift.exhausted.map((row) => ({
        ...row,
        reservationId: "r-forged-exhaust",
      })),
    };
    if (
      exhDrift.exhausted.length > 0 &&
      !isConcurrentBudgetCompositionHonest(exhRowDrift)
    ) {
      details.push(
        "Honesty predicate rejects exhausted row id drift vs exhaustedReservationIds",
      );
    } else if (exhDrift.exhausted.length === 0) {
      passed = false;
      details.push("Exhausted drift sample missing exhausted rows");
    } else {
      passed = false;
      details.push("Honesty predicate unexpectedly accepted exhausted row-id drift");
    }

    const multiAccept = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-id-order",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-ord-a", amountMinor: 200 },
        { reservationId: "r-ord-b", amountMinor: 300 },
      ],
    );
  const permutedIds = {
      ...multiAccept,
      acceptedReservationIds: [...multiAccept.acceptedReservationIds].reverse(),
    };
    if (
      multiAccept.accepted.length >= 2 &&
      !isConcurrentBudgetCompositionHonest(permutedIds)
    ) {
      details.push(
        "Honesty predicate rejects permuted acceptedReservationIds vs row order",
      );
    } else if (multiAccept.accepted.length < 2) {
      passed = false;
      details.push("Order-drift sample missing multi-accept rows");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted permuted acceptedReservationIds",
      );
    }

    const multiExhaust = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-exh-order",
        currency: "USD",
        limitMinor: 500,
      }),
      [
        { reservationId: "r-exh-a", amountMinor: 300 },
        { reservationId: "r-exh-b", amountMinor: 300 },
        { reservationId: "r-exh-c", amountMinor: 300 },
      ],
    );
    const permutedExhIds = {
      ...multiExhaust,
      exhaustedReservationIds: [...multiExhaust.exhaustedReservationIds].reverse(),
    };
    if (
      multiExhaust.exhausted.length >= 2 &&
      !isConcurrentBudgetCompositionHonest(permutedExhIds)
    ) {
      details.push(
        "Honesty predicate rejects permuted exhaustedReservationIds vs row order",
      );
    } else if (multiExhaust.exhausted.length < 2) {
      passed = false;
      details.push("Exhausted order-drift sample missing multi-exhaust rows");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted permuted exhaustedReservationIds",
      );
    }

    const amountHonest = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-amt-drift",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-amt-a", amountMinor: 200 },
        { reservationId: "r-amt-b", amountMinor: 300 },
      ],
    );
    const forgedAmtRow = {
      ...amountHonest,
      accepted: amountHonest.accepted.map((row, i) =>
        i === 0 ? { ...row, amountMinor: row.amountMinor + 1 } : row,
      ),
    };
    if (
      amountHonest.accepted.length > 0 &&
      !isConcurrentBudgetCompositionHonest(forgedAmtRow)
    ) {
      details.push(
        "Honesty predicate rejects forged accepted row amountMinor vs acceptedSumMinor",
      );
    } else if (amountHonest.accepted.length === 0) {
      passed = false;
      details.push("Amount-drift sample missing accepted rows");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged accepted amountMinor",
      );
    }

    const exhLengthSample = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-exh-len",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-len-a", amountMinor: 700 },
        { reservationId: "r-len-b", amountMinor: 500 },
      ],
    );
    const extraExhRow = {
      ...exhLengthSample,
      exhausted: [
        ...exhLengthSample.exhausted,
        { reservationId: "r-ghost-exhaust", availableMinor: 0 },
      ],
    };
    if (
      exhLengthSample.exhausted.length > 0 &&
      !isConcurrentBudgetCompositionHonest(extraExhRow)
    ) {
      details.push(
        "Honesty predicate rejects extra exhausted row vs exhaustedReservationIds length",
      );
    } else if (exhLengthSample.exhausted.length === 0) {
      passed = false;
      details.push("Exhausted length-drift sample missing exhausted rows");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted extra exhausted row",
      );
    }

    const accLengthSample = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-acc-len",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-acc-a", amountMinor: 200 },
        { reservationId: "r-acc-b", amountMinor: 300 },
      ],
    );
    const extraAccRow = {
      ...accLengthSample,
      accepted: [
        ...accLengthSample.accepted,
        { reservationId: "r-ghost-accept", amountMinor: 1 },
      ],
    };
    if (
      accLengthSample.accepted.length > 0 &&
      !isConcurrentBudgetCompositionHonest(extraAccRow)
    ) {
      details.push(
        "Honesty predicate rejects extra accepted row vs acceptedReservationIds length",
      );
    } else if (accLengthSample.accepted.length === 0) {
      passed = false;
      details.push("Accepted length-drift sample missing accepted rows");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted extra accepted row",
      );
    }

    const accShortSample = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-acc-short",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-sh-a", amountMinor: 100 },
        { reservationId: "r-sh-b", amountMinor: 200 },
      ],
    );
    const shortAccRows = {
      ...accShortSample,
      accepted: accShortSample.accepted.slice(0, 1),
    };
    if (
      accShortSample.accepted.length >= 2 &&
      !isConcurrentBudgetCompositionHonest(shortAccRows)
    ) {
      details.push(
        "Honesty predicate rejects shortened accepted rows vs acceptedReservationIds",
      );
    } else if (accShortSample.accepted.length < 2) {
      passed = false;
      details.push("Accepted short-drift sample missing multi-accept rows");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted shortened accepted rows",
      );
    }

    const exhShortSample = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-exh-short",
        currency: "USD",
        limitMinor: 500,
      }),
      [
        { reservationId: "r-shx-a", amountMinor: 300 },
        { reservationId: "r-shx-b", amountMinor: 300 },
        { reservationId: "r-shx-c", amountMinor: 300 },
      ],
    );
    const shortExhRows = {
      ...exhShortSample,
      exhausted: exhShortSample.exhausted.slice(0, 1),
    };
    if (
      exhShortSample.exhausted.length >= 2 &&
      !isConcurrentBudgetCompositionHonest(shortExhRows)
    ) {
      details.push(
        "Honesty predicate rejects shortened exhausted rows vs exhaustedReservationIds",
      );
    } else if (exhShortSample.exhausted.length < 2) {
      passed = false;
      details.push("Exhausted short-drift sample missing multi-exhaust rows");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted shortened exhausted rows",
      );
    }

    const availMinorSample = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-avail-forge",
        currency: "USD",
        limitMinor: 1000,
      }),
      [{ reservationId: "r-avail-a", amountMinor: 150 }],
    );
    const forgedAvailMinor = {
      ...availMinorSample,
      availableMinor: availMinorSample.availableMinor + 1,
    };
    if (!isConcurrentBudgetCompositionHonest(forgedAvailMinor)) {
      details.push(
        "Honesty predicate rejects forged composition availableMinor vs account",
      );
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged availableMinor",
      );
    }

    const matchIdentitySample = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-avail-match",
        currency: "USD",
        limitMinor: 1000,
      }),
      [{ reservationId: "r-match-a", amountMinor: 100 }],
    );
    const forgedAvailIdentityMatch = {
      ...matchIdentitySample,
      availableMatchesLimitMinusCommitted: false,
    };
    if (
      matchIdentitySample.availableMatchesLimitMinusCommitted &&
      !isConcurrentBudgetCompositionHonest(forgedAvailIdentityMatch)
    ) {
      details.push(
        "Honesty predicate rejects forged availableMatchesLimitMinusCommitted",
      );
    } else if (!matchIdentitySample.availableMatchesLimitMinusCommitted) {
      passed = false;
      details.push("Avail-match sample missing identity match flag");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged availableMatchesLimitMinusCommitted",
      );
    }

    const isolationSample = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-iso-flag",
        currency: "USD",
        limitMinor: 1000,
      }),
      [
        { reservationId: "r-iso-a", amountMinor: 600 },
        { reservationId: "r-iso-b", amountMinor: 600 },
      ],
    );
    const forgedIsolationFlag = {
      ...isolationSample,
      isolationWouldOversubscribe: !isolationSample.isolationWouldOversubscribe,
    };
    if (
      isolationSample.isolationSumMinor > isolationSample.availableAtSnapshotMinor &&
      !isConcurrentBudgetCompositionHonest(forgedIsolationFlag)
    ) {
      details.push(
        "Honesty predicate rejects forged isolationWouldOversubscribe vs isolationSum",
      );
    } else if (
      isolationSample.isolationSumMinor <= isolationSample.availableAtSnapshotMinor
    ) {
      passed = false;
      details.push("Isolation-flag sample missing oversubscribe isolationSum");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged isolationWouldOversubscribe",
      );
    }

    const isolationSumForge = {
      ...isolationSample,
      isolationSumMinor: isolationSample.availableAtSnapshotMinor,
      isolationWouldOversubscribe: true,
    };
    if (
      isolationSample.isolationWouldOversubscribe &&
      !isConcurrentBudgetCompositionHonest(isolationSumForge)
    ) {
      details.push(
        "Honesty predicate rejects forged isolationSumMinor vs oversubscribe flag",
      );
    } else if (!isolationSample.isolationWouldOversubscribe) {
      passed = false;
      details.push("Isolation-sum forge sample missing oversubscribe baseline");
    } else {
      passed = false;
      details.push(
        "Honesty predicate unexpectedly accepted forged isolationSumMinor",
      );
    }

    const trimNormSeed = createBudgetAccount({
      dayKey: "2026-11-22-trim-norm",
      currency: "USD",
      limitMinor: 1000,
    });
    let trimDupThrew = false;
    try {
      composeConcurrentFinalBudgetReserves(trimNormSeed, [
        { reservationId: " r-trim ", amountMinor: 100 },
        { reservationId: "r-trim", amountMinor: 200 },
      ]);
    } catch {
      trimDupThrew = true;
    }
    const trimPad = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-trim-pad",
        currency: "USD",
        limitMinor: 1000,
      }),
      [{ reservationId: "  r-pad  ", amountMinor: 25 }],
    );
    if (
      trimDupThrew &&
      trimPad.acceptedReservationIds[0] === "r-pad" &&
      isConcurrentBudgetCompositionHonest(trimPad)
    ) {
      details.push(
        "Trim-normalized duplicate-id preflight; padded id composes as trimmed",
      );
    } else {
      passed = false;
      details.push(
        `Trim-normalized duplicate unexpectedly dupThrew=${trimDupThrew} pad=${JSON.stringify(trimPad.acceptedReservationIds)}`,
      );
    }

    const fracSeed = createBudgetAccount({
      dayKey: "2026-11-22-frac-amount",
      currency: "USD",
      limitMinor: 1000,
    });
    let fracThrew = false;
    try {
      composeConcurrentFinalBudgetReserves(fracSeed, [
        { reservationId: "r-frac", amountMinor: 1.25 },
      ]);
    } catch {
      fracThrew = true;
    }
    if (fracThrew && fracSeed.reservedMinor === 0) {
      details.push(
        "Non-integer amountMinor preflight refuses before apply; snap immutable",
      );
    } else {
      passed = false;
      details.push(
        `Non-integer amount preflight unexpectedly fracThrew=${fracThrew} reserved=${fracSeed.reservedMinor}`,
      );
    }

    const nanSeed = createBudgetAccount({
      dayKey: "2026-11-22-nan-amount",
      currency: "USD",
      limitMinor: 1000,
    });
    let nanThrew = false;
    try {
      composeConcurrentFinalBudgetReserves(nanSeed, [
        { reservationId: "r-nan", amountMinor: Number.NaN },
      ]);
    } catch {
      nanThrew = true;
    }
    if (nanThrew && nanSeed.reservedMinor === 0) {
      details.push(
        "Non-finite amountMinor (NaN) preflight refuses; snap immutable",
      );
    } else {
      passed = false;
      details.push(
        `Non-finite amount preflight unexpectedly nanThrew=${nanThrew}`,
      );
    }

    // 5e. Zero-headroom snapshot — all concurrent finals exhaust (M3).
    const zeroSeed = createBudgetAccount({
      dayKey: "2026-11-22-zero",
      currency: "USD",
      limitMinor: 1000,
    });
    const zeroFill = reserveBudget(zeroSeed, "r-zero-fill", 1000);
    if (!zeroFill.ok) {
      passed = false;
      details.push(`Zero fill unexpectedly ${JSON.stringify(zeroFill)}`);
    } else {
      const zero = composeConcurrentFinalBudgetReserves(zeroFill.account, [
        { reservationId: "r-z1", amountMinor: 1 },
        { reservationId: "r-z2", amountMinor: 50 },
      ]);
      if (
        zero.availableAtSnapshotMinor === 0 &&
        zero.isolationWouldOversubscribe &&
        zero.acceptedSumMinor === 0 &&
        zero.acceptedReservationIds.length === 0 &&
        zero.exhaustedReservationIds.length === 2 &&
        zero.exhausted.every((e) => e.availableMinor === 0) &&
        zero.reservedNeverExceedsLimit &&
        zero.externalEffects === "NONE"
      ) {
        details.push(
          "Zero-headroom concurrent: all finals BUDGET_EXHAUSTED availableMinor=0; acceptedSumMinor=0",
        );
      } else {
        passed = false;
        details.push(`Zero-headroom unexpectedly ${JSON.stringify(zero)}`);
      }
    }
  }

  // 6. Memory BudgetStore: sequential final pair after prior reserve (honest serialize).
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

    // Exact-cap then peer refuse on memory store (hillclimb).
    const storeExact = createMemoryBudgetStore();
    const exactAcct = await storeExact.ensureAccount({
      dayKey: "2026-11-22-store-exact",
      currency: "USD",
      limitMinor: 1000,
    });
    const fill = await storeExact.reserve({
      accountId: exactAcct.accountId,
      reservationId: "store-fill",
      amountMinor: 1000,
    });
    const peer = await storeExact.reserve({
      accountId: exactAcct.accountId,
      reservationId: "store-peer",
      amountMinor: 1,
    });
    const exactAfter = await storeExact.getAccount(exactAcct.accountId);
    if (
      fill.ok &&
      !peer.ok &&
      peer.code === "BUDGET_EXHAUSTED" &&
      peer.availableMinor === 0 &&
      exactAfter &&
      exactAfter.reservedMinor === 1000 &&
      exactAfter.reservedMinor <= exactAfter.limitMinor
    ) {
      details.push(
        "Memory BudgetStore exact-cap fill then peer BUDGET_EXHAUSTED availableMinor=0",
      );
    } else {
      passed = false;
      details.push(
        `Store exact-cap unexpectedly fill=${JSON.stringify(fill)} peer=${JSON.stringify(peer)}`,
      );
    }

    // Concurrent-looking Promise.all still serializes before await (M3 honesty).
    const storeRace = createMemoryBudgetStore();
    const raceAcct = await storeRace.ensureAccount({
      dayKey: "2026-11-22-store-race",
      currency: "USD",
      limitMinor: 1000,
    });
    await storeRace.reserve({
      accountId: raceAcct.accountId,
      reservationId: "store-race-prior",
      amountMinor: 600,
    });
    const [raceA, raceB] = await Promise.all([
      storeRace.reserve({
        accountId: raceAcct.accountId,
        reservationId: "store-race-a",
        amountMinor: 400,
      }),
      storeRace.reserve({
        accountId: raceAcct.accountId,
        reservationId: "store-race-b",
        amountMinor: 400,
      }),
    ]);
    const raceAfter = await storeRace.getAccount(raceAcct.accountId);
    const raceOkCount = [raceA, raceB].filter((r) => r.ok).length;
    const raceExhausted = [raceA, raceB].some(
      (r) => !r.ok && r.code === "BUDGET_EXHAUSTED",
    );
    if (
      raceOkCount === 1 &&
      raceExhausted &&
      raceAfter &&
      raceAfter.reservedMinor === 1000 &&
      raceAfter.reservedMinor <= raceAfter.limitMinor
    ) {
      details.push(
        "Memory BudgetStore Promise.all concurrent-looking pair: one ok, one BUDGET_EXHAUSTED; reserved≤limit",
      );
    } else {
      passed = false;
      details.push(
        `Store Promise.all unexpectedly a=${JSON.stringify(raceA)} b=${JSON.stringify(raceB)} reserved=${raceAfter?.reservedMinor}`,
      );
    }
  }

  details.push(
    `liveProviderSuccessClaimed=false liveWiring=${BUDGET_RESERVATION_LIVE_WIRING} externalEffects=NONE`,
  );

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
