/**
 * Fixture proof for T-X028 — actual cost exceeds estimate / overrun visible.
 *
 * Exercises pure budget settlement: settleBudget posts the full actual when
 * actualMinor > reservedMinor (not capped to the estimate) and releases the
 * reservation. Overrun is first-class via overrunMinor. Preserves
 * createBudgetAccount heldMinor:0 (T-X027 hold path untouched). External
 * effects: NONE. Live provider wiring: NOT_WIRED. Does not claim T-X026.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. No invent past T-X073.
 */

import { randomUUID } from "node:crypto";
import {
  BUDGET_ACCOUNTING_LIVE_WIRING,
  SoakProofKind,
  availableBudgetMinor,
  cancelBudgetReservation,
  createBudgetAccount,
  ACTUAL_COST_OVERRUN_RELATED_CASE_IDS,
  assertBudgetSettlementHonesty,
  describeActualCostOverrunVisibility,
  isActualCostOverrun,
  overrunMinor,
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
    // Sibling reservation must survive overrun settle on a different id.
    const withSibling = reserveBudget(reserved.account, "r-sib", 200);
    if (!withSibling.ok) {
      passed = false;
      details.push(`Sibling reserve failed: ${JSON.stringify(withSibling)}`);
    } else {
      const overrun = settleBudget(withSibling.account, "r-overrun", 750);
      if (
        overrun.ok &&
        !overrun.replayed &&
        overrun.reservedMinor === 600 &&
        overrun.actualMinor === 750 &&
        overrun.overrunMinor === 150 &&
        overrun.overrunMinor === overrunMinor(600, 750) &&
        isActualCostOverrun(overrun.reservedMinor, overrun.actualMinor) &&
        overrun.externalEffects === "NONE" &&
        overrun.liveProviderWiring === BUDGET_ACCOUNTING_LIVE_WIRING &&
        overrun.liveProviderWiring === "NOT_WIRED" &&
        overrun.account.reservedMinor === 200 &&
        overrun.account.heldMinor === 0 &&
        overrun.account.settledMinor === 750 &&
        overrun.account.openReservations["r-overrun"] === undefined &&
        overrun.account.openReservations["r-sib"] === 200 &&
        overrun.account.settledReservations["r-overrun"]?.actualMinor === 750 &&
        overrun.account.settledReservations["r-overrun"]?.reservedMinor === 600 &&
        overrun.account.settledReservations["r-overrun"]?.overrunMinor === 150 &&
        overrun.liveProviderSuccessClaimed === false &&
        overrun.chatgptAdsAccess === "ACCESS_BLOCKED" &&
        describeActualCostOverrunVisibility(600, 750).overrunVisible === true &&
        describeActualCostOverrunVisibility(600, 750).chatgptAdsAccess ===
          "ACCESS_BLOCKED" &&
        describeActualCostOverrunVisibility(600, 750).cappedToEstimate === false &&
        overrun.actualMinor > overrun.reservedMinor &&
        availableBudgetMinor(overrun.account) === 50
      ) {
        details.push(
          "Settle r-overrun actualMinor=750 (> reserved 600) → overrunMinor=150 visible; settledMinor=750; sibling r-sib preserved; heldMinor=0",
        );

        // Replay keeps overrun visible; conflicting actual must throw.
        const replay = settleBudget(overrun.account, "r-overrun", 750);
        let conflictThrew = false;
        try {
          settleBudget(overrun.account, "r-overrun", 800);
        } catch {
          conflictThrew = true;
        }
        if (
          replay.ok &&
          replay.replayed &&
          replay.overrunMinor === 150 &&
          replay.account.settledMinor === 750 &&
          replay.externalEffects === "NONE" &&
          replay.liveProviderWiring === "NOT_WIRED" &&
          replay.liveProviderSuccessClaimed === false &&
          conflictThrew
        ) {
          details.push(
            "Overrun replay idempotent → overrunMinor=150 retained; conflicting actual throws (fail-closed)",
          );
        } else {
          passed = false;
          details.push(
            `Overrun replay/conflict failed: replay=${JSON.stringify(replay)} conflictThrew=${conflictThrew}`,
          );
        }
      } else {
        passed = false;
        details.push(`Overrun settle failed: ${JSON.stringify(overrun)}`);
      }
    }
  }

  // Past day-limit overrun: still posts full actual — never silently capped.
  const pastSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const pastReserve = reserveBudget(pastSeed, "r-past", 600);
  if (pastReserve.ok) {
    const past = settleBudget(pastReserve.account, "r-past", 1200);
    if (
      past.ok &&
      past.actualMinor === 1200 &&
      past.overrunMinor === 600 &&
      past.account.settledMinor === 1200 &&
      past.account.reservedMinor === 0 &&
      past.account.heldMinor === 0 &&
      availableBudgetMinor(past.account) === -200 &&
      past.externalEffects === "NONE" &&
      past.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Past-limit overrun: actual=1200 on limit=1000 → settledMinor=1200 overrunMinor=600 visible (never capped); available=-200",
      );
    } else {
      passed = false;
      details.push(`Past-limit overrun failed: ${JSON.stringify(past)}`);
    }
  } else {
    passed = false;
    details.push(`Past-limit reserve failed: ${JSON.stringify(pastReserve)}`);
  }

  // Sequential multi-overrun: both deltas persist on snapshots; totals accumulate.
  const multiSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 2000,
  });
  const multiA = reserveBudget(multiSeed, "r-a", 400);
  if (multiA.ok) {
    const multiB = reserveBudget(multiA.account, "r-b", 400);
    if (multiB.ok) {
      const sa = settleBudget(multiB.account, "r-a", 550);
      const sb = sa.ok ? settleBudget(sa.account, "r-b", 500) : null;
      if (
        sa.ok &&
        sb &&
        sb.ok &&
        sa.overrunMinor === 150 &&
        sb.overrunMinor === 100 &&
        sa.liveProviderSuccessClaimed === false &&
        sb.liveProviderSuccessClaimed === false &&
        sa.account.settledReservations["r-a"]?.overrunMinor === 150 &&
        sb.account.settledReservations["r-a"]?.overrunMinor === 150 &&
        sb.account.settledReservations["r-b"]?.overrunMinor === 100 &&
        sb.account.settledMinor === 1050 &&
        availableBudgetMinor(sb.account) === 950
      ) {
        details.push(
          "Sequential multi-overrun: r-a overrunMinor=150 + r-b overrunMinor=100 → settledMinor=1050; snapshots persist both deltas",
        );
      } else {
        passed = false;
        details.push(
          `Sequential multi-overrun failed: sa=${JSON.stringify(sa)} sb=${JSON.stringify(sb)}`,
        );
      }
    } else {
      passed = false;
      details.push(`Sequential multi B reserve failed: ${JSON.stringify(multiB)}`);
    }
  } else {
    passed = false;
    details.push(`Sequential multi A reserve failed: ${JSON.stringify(multiA)}`);
  }

  // Equal-estimate control: overrunMinor=0 when actual equals reserved.
  const eqSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const eqReserve = reserveBudget(eqSeed, "r-eq", 600);
  if (eqReserve.ok) {
    const eq = settleBudget(eqReserve.account, "r-eq", 600);
    if (
      eq.ok &&
      eq.overrunMinor === 0 &&
      !isActualCostOverrun(eq.reservedMinor, eq.actualMinor) &&
      eq.account.settledMinor === 600 &&
      eq.externalEffects === "NONE" &&
      eq.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Equal-estimate control: actual=600 (= reserved) → overrunMinor=0; settled posts actual; liveProviderWiring=NOT_WIRED",
      );
    } else {
      passed = false;
      details.push(`Equal-estimate settle failed: ${JSON.stringify(eq)}`);
    }
  } else {
    passed = false;
    details.push(`Equal-estimate reserve failed: ${JSON.stringify(eqReserve)}`);
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
      under.overrunMinor === 0 &&
      under.account.settledMinor === 120 &&
      under.account.reservedMinor === 0 &&
      under.account.heldMinor === 0 &&
      under.account.openReservations["r-under"] === undefined &&
      under.externalEffects === "NONE" &&
      under.liveProviderWiring === "NOT_WIRED"
    ) {
      details.push(
        "Positive control: under-estimate settle actual=120 (< reserved 500) → overrunMinor=0; settled posts actual; reserved released; heldMinor=0",
      );
    } else {
      passed = false;
      details.push(`Under-estimate settle failed: ${JSON.stringify(under)}`);
    }
  } else {
    passed = false;
    details.push(`Under-estimate reserve failed: ${JSON.stringify(underReserve)}`);
  }

  // Minimal +1 overrun still first-class visible; Ads ACCESS_BLOCKED.
  const minSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const minReserve = reserveBudget(minSeed, "r-min", 600);
  if (minReserve.ok) {
    const min = settleBudget(minReserve.account, "r-min", 601);
    if (
      min.ok &&
      min.overrunMinor === 1 &&
      min.account.settledReservations["r-min"]?.overrunMinor === 1 &&
      min.chatgptAdsAccess === "ACCESS_BLOCKED" &&
      min.liveProviderSuccessClaimed === false &&
      describeActualCostOverrunVisibility(600, 601).chatgptAdsAccess ===
        "ACCESS_BLOCKED"
    ) {
      details.push(
        "Minimal +1 overrun: actual=601 → overrunMinor=1 visible; chatgptAdsAccess=ACCESS_BLOCKED",
      );
    } else {
      passed = false;
      details.push(`Minimal +1 overrun failed: ${JSON.stringify(min)}`);
    }
  } else {
    passed = false;
    details.push(`Minimal +1 reserve failed: ${JSON.stringify(minReserve)}`);
  }

  // Held unknown-usage cannot be settled as overrun (T-X027 path preserved).
  const holdSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const holdReserve = reserveBudget(holdSeed, "r-hold", 600);
  if (holdReserve.ok) {
    const held = cancelBudgetReservation(holdReserve.account, "r-hold", {
      known: false,
    });
    let heldSettleThrew = false;
    if (held.ok && held.account.heldMinor === 600) {
      try {
        settleBudget(held.account, "r-hold", 750);
      } catch {
        heldSettleThrew = true;
      }
    }
    if (held.ok && heldSettleThrew && held.account.heldMinor === 600) {
      details.push(
        "Held unknown-usage refuse settle-as-overrun (fail-closed; heldMinor=600 preserved; T-X027 path)",
      );
    } else {
      passed = false;
      details.push(
        `Held settle refuse failed: held=${JSON.stringify(held)} threw=${heldSettleThrew}`,
      );
    }
  } else {
    passed = false;
    details.push(`Hold reserve failed: ${JSON.stringify(holdReserve)}`);
  }

  // Zero-actual settle: under-estimate extreme; overrunMinor=0; Ads blocked.
  const zeroSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const zeroReserve = reserveBudget(zeroSeed, "r-zero", 600);
  if (zeroReserve.ok) {
    const zero = settleBudget(zeroReserve.account, "r-zero", 0);
    if (
      zero.ok &&
      zero.overrunMinor === 0 &&
      zero.account.settledMinor === 0 &&
      zero.account.settledReservations["r-zero"]?.overrunMinor === 0 &&
      zero.chatgptAdsAccess === "ACCESS_BLOCKED" &&
      zero.liveProviderWiring === "NOT_WIRED" &&
      zero.liveProviderSuccessClaimed === false
    ) {
      details.push(
        "Zero-actual settle: actual=0 → overrunMinor=0; chatgptAdsAccess=ACCESS_BLOCKED; liveProviderWiring=NOT_WIRED",
      );
    } else {
      passed = false;
      details.push(`Zero-actual settle failed: ${JSON.stringify(zero)}`);
    }
  } else {
    passed = false;
    details.push(`Zero-actual reserve failed: ${JSON.stringify(zeroReserve)}`);
  }

  // Held→known-cancel reconcile with actual>reserved persists overrunMinor.
  const reconSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const reconReserve = reserveBudget(reconSeed, "r-recon", 600);
  if (reconReserve.ok) {
    const held = cancelBudgetReservation(reconReserve.account, "r-recon", {
      known: false,
    });
    if (held.ok && held.account.heldMinor === 600) {
      const recon = cancelBudgetReservation(held.account, "r-recon", {
        known: true,
        actualMinor: 750,
      });
      if (
        recon.ok &&
        recon.account.heldMinor === 0 &&
        recon.account.settledMinor === 750 &&
        recon.account.settledReservations["r-recon"]?.overrunMinor === 150 &&
        availableBudgetMinor(recon.account) === 250
      ) {
        details.push(
          "Held→known-cancel reconcile: actual=750 > reserved=600 → snapshot overrunMinor=150; heldMinor=0",
        );
      } else {
        passed = false;
        details.push(`Held reconcile failed: ${JSON.stringify(recon)}`);
      }
    } else {
      passed = false;
      details.push(`Held for reconcile failed: ${JSON.stringify(held)}`);
    }
  } else {
    passed = false;
    details.push(`Reconcile reserve failed: ${JSON.stringify(reconReserve)}`);
  }

  // Negative actual refused (fail-closed; never silent invent).
  const negSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const negReserve = reserveBudget(negSeed, "r-neg", 600);
  let negThrew = false;
  if (negReserve.ok) {
    try {
      settleBudget(negReserve.account, "r-neg", -1);
    } catch {
      negThrew = true;
    }
  }
  if (negReserve.ok && negThrew) {
    details.push("Negative actual refused (fail-closed; amounts must be non-negative)");
  } else {
    passed = false;
    details.push(`Negative actual refuse failed: reserved=${JSON.stringify(negReserve)} threw=${negThrew}`);
  }

  // Non-finite actual refused (NaN/∞ never invent overrun).
  const nanSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const nanReserve = reserveBudget(nanSeed, "r-nan", 600);
  let nanThrew = false;
  if (nanReserve.ok) {
    try {
      settleBudget(nanReserve.account, "r-nan", Number.NaN);
    } catch {
      nanThrew = true;
    }
  }
  if (nanReserve.ok && nanThrew) {
    details.push("Non-finite actual refused (fail-closed; NaN/∞ never invent overrun)");
  } else {
    passed = false;
    details.push(`Non-finite actual refuse failed: reserved=${JSON.stringify(nanReserve)} threw=${nanThrew}`);
  }

  // Post-overrun settle → unknown-cancel refuse (fail-closed).
  const postSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const postReserve = reserveBudget(postSeed, "r-post", 600);
  let postThrew = false;
  let postOverrun = -1;
  if (postReserve.ok) {
    const postSettle = settleBudget(postReserve.account, "r-post", 750);
    if (postSettle.ok) {
      postOverrun = postSettle.overrunMinor;
      try {
        cancelBudgetReservation(postSettle.account, "r-post", { known: false });
      } catch {
        postThrew = true;
      }
    }
  }
  if (postReserve.ok && postThrew && postOverrun === 150) {
    details.push(
      "Post-overrun unknown-cancel refused (fail-closed; overrunMinor=150 retained)",
    );
  } else {
    passed = false;
    details.push(
      `Post-overrun unknown-cancel refuse failed: threw=${postThrew} overrun=${postOverrun}`,
    );
  }

  // Fractional actual refused (minor units are integers).
  const fracSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const fracReserve = reserveBudget(fracSeed, "r-frac", 600);
  let fracThrew = false;
  if (fracReserve.ok) {
    try {
      settleBudget(fracReserve.account, "r-frac", 600.5);
    } catch {
      fracThrew = true;
    }
  }
  if (fracReserve.ok && fracThrew) {
    details.push("Fractional actual refused (fail-closed; minor units are integers)");
  } else {
    passed = false;
    details.push(`Fractional actual refuse failed: reserved=${JSON.stringify(fracReserve)} threw=${fracThrew}`);
  }

  // Replayed overrun settle still passes honesty assert.
  const replaySeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const replayReserve = reserveBudget(replaySeed, "r-replay-hon", 600);
  if (replayReserve.ok) {
    const first = settleBudget(replayReserve.account, "r-replay-hon", 750);
    if (first.ok) {
      const replay = settleBudget(first.account, "r-replay-hon", 750);
      if (replay.ok && replay.replayed && replay.overrunMinor === 150) {
        try {
          assertBudgetSettlementHonesty(replay);
          details.push(
            "Replayed overrun settle passes assertBudgetSettlementHonesty (overrunMinor=150)",
          );
        } catch (err) {
          passed = false;
          details.push(`Replay honesty assert failed: ${String(err)}`);
        }
      } else {
        passed = false;
        details.push(`Replay settle unexpected: ${JSON.stringify(replay)}`);
      }
    } else {
      passed = false;
      details.push(`Replay first settle failed: ${JSON.stringify(first)}`);
    }
  } else {
    passed = false;
    details.push(`Replay reserve failed: ${JSON.stringify(replayReserve)}`);
  }

  // Fail-closed: assertBudgetSettlementHonesty rejects tampered overrun settlement fields.
  const tamperSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const tamperReserve = reserveBudget(tamperSeed, "r-tamper-hon", 600);
  if (tamperReserve.ok) {
    const tamperSettle = settleBudget(tamperReserve.account, "r-tamper-hon", 750);
    if (tamperSettle.ok && tamperSettle.overrunMinor === 150) {
      type OkSettlement = Extract<typeof tamperSettle, { ok: true }>;
      const rejectCases: Array<{
        label: string;
        tampered: OkSettlement;
        pattern: RegExp;
      }> = [
        {
          label: "externalEffects",
          tampered: { ...tamperSettle, externalEffects: "SOMETHING" as "NONE" },
          pattern: /externalEffects must be NONE/i,
        },
        {
          label: "liveProviderWiring",
          tampered: {
            ...tamperSettle,
            liveProviderWiring: "WIRED" as typeof BUDGET_ACCOUNTING_LIVE_WIRING,
          },
          pattern: /liveProviderWiring must be NOT_WIRED/i,
        },
        {
          label: "liveProviderSuccessClaimed",
          tampered: { ...tamperSettle, liveProviderSuccessClaimed: true as false },
          pattern: /must not claim live provider success/i,
        },
        {
          label: "chatgptAdsAccess",
          tampered: {
            ...tamperSettle,
            chatgptAdsAccess: "ALLOWED" as "ACCESS_BLOCKED",
          },
          pattern: /chatgptAdsAccess must be ACCESS_BLOCKED/i,
        },
        {
          label: "overrunMinor",
          tampered: { ...tamperSettle, overrunMinor: 0 },
          pattern: /overrunMinor mismatch/i,
        },
      ];
      let tamperRejected = 0;
      for (const chk of rejectCases) {
        try {
          assertBudgetSettlementHonesty(chk.tampered);
        } catch (err) {
          if (chk.pattern.test(String(err))) {
            tamperRejected += 1;
          }
        }
      }
      if (tamperRejected === rejectCases.length) {
        details.push(
          "assertBudgetSettlementHonesty rejects tampered settlement (externalEffects / NOT_WIRED / Ads ACCESS_BLOCKED / overrunMinor; fail-closed)",
        );
      } else {
        passed = false;
        details.push(
          `Tampered settlement honesty reject incomplete: ${tamperRejected}/${rejectCases.length}`,
        );
      }
    } else {
      passed = false;
      details.push(`Tamper honesty settle failed: ${JSON.stringify(tamperSettle)}`);
    }
  } else {
    passed = false;
    details.push(`Tamper honesty reserve failed: ${JSON.stringify(tamperReserve)}`);
  }

  // Post-overspend reserve fails closed with negative available visible.
  const exhSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const exhReserve = reserveBudget(exhSeed, "r-exh", 600);
  if (exhReserve.ok) {
    const exhSettle = settleBudget(exhReserve.account, "r-exh", 1200);
    if (
      exhSettle.ok &&
      exhSettle.overrunMinor === 600 &&
      availableBudgetMinor(exhSettle.account) === -200
    ) {
      const more = reserveBudget(exhSettle.account, "r-more", 1);
      if (
        !more.ok &&
        more.code === "BUDGET_EXHAUSTED" &&
        more.availableMinor === -200
      ) {
        details.push(
          "Post-overspend reserve → BUDGET_EXHAUSTED availableMinor=-200 (never silent zero)",
        );
      } else {
        passed = false;
        details.push(`Post-overspend reserve unexpected: ${JSON.stringify(more)}`);
      }
    } else {
      passed = false;
      details.push(`Post-overspend settle unexpected: ${JSON.stringify(exhSettle)}`);
    }
  } else {
    passed = false;
    details.push(`Post-overspend reserve failed: ${JSON.stringify(exhReserve)}`);
  }

  // Non-integer reserve refused (minor units are integers).
  let resFracThrew = false;
  try {
    reserveBudget(
      createBudgetAccount({
        dayKey: "2026-11-22",
        currency: "USD",
        limitMinor: 1000,
      }),
      "r-frac-res",
      100.5,
    );
  } catch {
    resFracThrew = true;
  }
  if (resFracThrew) {
    details.push("Non-integer reserve refused (fail-closed; positive integer minors)");
  } else {
    passed = false;
    details.push("Non-integer reserve refuse failed");
  }

  // Conflicting known-cancel after overrun settle refused.
  const confSeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const confReserve = reserveBudget(confSeed, "r-conf", 600);
  let confThrew = false;
  if (confReserve.ok) {
    const confSettle = settleBudget(confReserve.account, "r-conf", 750);
    if (confSettle.ok && confSettle.overrunMinor === 150) {
      try {
        cancelBudgetReservation(confSettle.account, "r-conf", {
          known: true,
          actualMinor: 800,
        });
      } catch {
        confThrew = true;
      }
    }
  }
  if (confReserve.ok && confThrew) {
    details.push(
      "Conflicting known-cancel after overrun settle refused (fail-closed; overrunMinor=150 retained)",
    );
  } else {
    passed = false;
    details.push(`Conflicting known-cancel refuse failed: threw=${confThrew}`);
  }

  // describe helper refuses sandbox VERIFIED claim.
  const vis = describeActualCostOverrunVisibility(600, 750);
  if (
    vis.fixtureAcceptedOnly === true &&
    vis.sandboxVerifiedClaimed === false &&
    vis.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    vis.liveProviderWiring === "NOT_WIRED"
  ) {
    details.push(
      "describeActualCostOverrunVisibility → fixtureAcceptedOnly; sandboxVerifiedClaimed=false; Ads ACCESS_BLOCKED",
    );
  } else {
    passed = false;
    details.push(`Visibility describe honesty failed: ${JSON.stringify(vis)}`);
  }

  // Fail-closed: unknown reservation id.
  const unknown = settleBudget(seed, "missing-reservation", 10);
  if (!unknown.ok && unknown.code === "UNKNOWN_RESERVATION") {
    details.push("Unknown reservation → UNKNOWN_RESERVATION (fail-closed)");
  } else {
    passed = false;
    details.push(`Unknown settle unexpectedly ${JSON.stringify(unknown)}`);
  }

  // Settlement honesty helper on a fresh overrun settle.
  const honestySeed = createBudgetAccount({
    dayKey: "2026-11-22",
    currency: "USD",
    limitMinor: 1000,
  });
  const honestyReserve = reserveBudget(honestySeed, "r-hon", 600);
  if (honestyReserve.ok) {
    const honesty = settleBudget(honestyReserve.account, "r-hon", 750);
    if (honesty.ok) {
      try {
        assertBudgetSettlementHonesty(honesty);
        details.push(
          "assertBudgetSettlementHonesty ok on overrun settle (NONE / NOT_WIRED / Ads ACCESS_BLOCKED)",
        );
      } catch (err) {
        passed = false;
        details.push(`assertBudgetSettlementHonesty failed: ${String(err)}`);
      }
    } else {
      passed = false;
      details.push(`Honesty settle failed: ${JSON.stringify(honesty)}`);
    }
  } else {
    passed = false;
    details.push(`Honesty reserve failed: ${JSON.stringify(honestyReserve)}`);
  }

  if (
    !isActualCostOverrun(600, 750) ||
    isActualCostOverrun(600, 600) ||
    overrunMinor(600, 750) !== 150
  ) {
    passed = false;
    details.push("isActualCostOverrun / overrunMinor baseline sanity failed");
  } else {
    details.push(
      "isActualCostOverrun(600,750)=true; equal-estimate=false; overrunMinor=150",
    );
  }

  if (!ACTUAL_COST_OVERRUN_RELATED_CASE_IDS.includes("T-X028")) {
    passed = false;
    details.push("ACTUAL_COST_OVERRUN_RELATED_CASE_IDS missing T-X028");
  } else {
    details.push(
      "ACTUAL_COST_OVERRUN_RELATED_CASE_IDS=[T-X028] only (catalog ≤T-X073; no invent)",
    );
  }

    details.push(`proofClock=${nowIso}`);
  details.push(
    `liveProviderSuccessClaimed=false liveProviderWiring=${BUDGET_ACCOUNTING_LIVE_WIRING} chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE`,
  );

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
