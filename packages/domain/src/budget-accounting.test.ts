import { describe, expect, it } from "vitest";
import {
  ACTUAL_COST_OVERRUN_RELATED_CASE_IDS,
  BUDGET_ACCOUNTING_LIVE_WIRING,
  assertBudgetSettlementHonesty,
  availableBudgetMinor,
  cancelBudgetReservation,
  createBudgetAccount,
  describeActualCostOverrunVisibility,
  isActualCostOverrun,
  overrunMinor,
  reserveBudget,
  settleBudget,
} from "./budget-accounting.js";

const account = () =>
  createBudgetAccount({
    dayKey: "2026-11-17",
    currency: "USD",
    limitMinor: 1000,
  });

describe("budget accounting", () => {
  it("reserves within limit", () => {
    const result = reserveBudget(account(), "r1", 400);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.account.reservedMinor).toBe(400);
      expect(result.account.openReservations.r1).toBe(400);
      expect(result.account.heldMinor).toBe(0);
    }
  });

  it("returns BUDGET_EXHAUSTED when over limit", () => {
    const result = reserveBudget(account(), "r2", 1001);
    expect(result).toEqual({
      ok: false,
      code: "BUDGET_EXHAUSTED",
      availableMinor: 1000,
    });
  });

  it("enforces the cap on concurrent final budget reservation", () => {
    const first = reserveBudget(account(), "r-a", 600);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const raced = reserveBudget(first.account, "r-b", 500);
    expect(raced).toEqual({
      ok: false,
      code: "BUDGET_EXHAUSTED",
      availableMinor: 400,
    });
    const snap = first.account;
    const isolA = reserveBudget(snap, "r-final-a", 400);
    const isolB = reserveBudget(snap, "r-final-b", 400);
    expect(isolA.ok).toBe(true);
    expect(isolB.ok).toBe(true);
    if (!isolA.ok) return;
    const composed = reserveBudget(isolA.account, "r-final-b", 400);
    expect(composed).toEqual({
      ok: false,
      code: "BUDGET_EXHAUSTED",
      availableMinor: 0,
    });
    expect(isolA.account.reservedMinor).toBe(1000);
  });

  it("settles actual cost honestly (may be less than reserved)", () => {
    const reserved = reserveBudget(account(), "r3", 500);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r3", 120);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.account.reservedMinor).toBe(0);
    expect(settled.account.settledMinor).toBe(120);
    expect(settled.replayed).toBe(false);
  });

  it("posts overrun when actual exceeds reserved estimate (T-X028)", () => {
    const seed = account();
    expect(seed.heldMinor).toBe(0);
    expect(BUDGET_ACCOUNTING_LIVE_WIRING).toBe("NOT_WIRED");
    expect(ACTUAL_COST_OVERRUN_RELATED_CASE_IDS).toEqual(["T-X028"]);
    expect(overrunMinor(600, 750)).toBe(150);
    expect(isActualCostOverrun(600, 750)).toBe(true);
    expect(isActualCostOverrun(600, 600)).toBe(false);
    const reserved = reserveBudget(seed, "r-over", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.account.heldMinor).toBe(0);
    const settled = settleBudget(reserved.account, "r-over", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.actualMinor).toBe(750);
    expect(settled.reservedMinor).toBe(600);
    expect(settled.overrunMinor).toBe(150);
    expect(settled.actualMinor).toBeGreaterThan(settled.reservedMinor);
    expect(settled.externalEffects).toBe("NONE");
    expect(settled.liveProviderWiring).toBe("NOT_WIRED");
    expect(settled.liveProviderSuccessClaimed).toBe(false);
    expect(settled.account.reservedMinor).toBe(0);
    expect(settled.account.settledMinor).toBe(750);
    expect(settled.account.heldMinor).toBe(0);
    expect(settled.account.openReservations["r-over"]).toBeUndefined();
    expect(settled.account.settledReservations["r-over"]).toEqual({
      reservedMinor: 600,
      actualMinor: 750,
      overrunMinor: 150,
    });
    expect(describeActualCostOverrunVisibility(600, 750)).toEqual({
      overrunMinor: 150,
      overrunVisible: true,
      cappedToEstimate: false,
      liveProviderWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      chatgptAdsAccess: "ACCESS_BLOCKED",
      externalEffects: "NONE",
      fixtureAcceptedOnly: true,
      sandboxVerifiedClaimed: false,
    });
    expect(settled.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(() => assertBudgetSettlementHonesty(settled)).not.toThrow();
    // Available uses full posted actual, not the capped estimate.
    expect(availableBudgetMinor(settled.account)).toBe(250);
  });

  it("rejects negative actual on settle (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-neg", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(() => settleBudget(reserved.account, "r-neg", -1)).toThrow(
      /non-negative integers/i,
    );
  });

  it("rejects non-finite actual on settle (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-nan", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(() => settleBudget(reserved.account, "r-nan", Number.NaN)).toThrow(
      /non-negative integers/i,
    );
    expect(() =>
      settleBudget(reserved.account, "r-nan", Number.POSITIVE_INFINITY),
    ).toThrow(/non-negative integers/i);
  });

  it("rejects fractional actual on settle (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-frac", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(() => settleBudget(reserved.account, "r-frac", 600.5)).toThrow(
      /non-negative integers/i,
    );
  });

  it("rejects non-integer / non-finite reserve amounts (T-X028 edge)", () => {
    expect(() => reserveBudget(account(), "r-frac-res", 100.5)).toThrow(
      /positive integer/i,
    );
    expect(() => reserveBudget(account(), "r-nan-res", Number.NaN)).toThrow(
      /positive integer/i,
    );
  });

  it("refuses conflicting known-cancel after overrun settle (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-conf", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-conf", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.overrunMinor).toBe(150);
    expect(() =>
      cancelBudgetReservation(settled.account, "r-conf", {
        known: true,
        actualMinor: 800,
      }),
    ).toThrow(/already settled/i);
  });

  it("assertBudgetSettlementHonesty rejects tampered liveProviderWiring", () => {
    const reserved = reserveBudget(account(), "r-wire", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-wire", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const tampered = {
      ...settled,
      liveProviderWiring: "WIRED" as typeof BUDGET_ACCOUNTING_LIVE_WIRING,
    };
    expect(() => assertBudgetSettlementHonesty(tampered)).toThrow(
      /liveProviderWiring must be NOT_WIRED/i,
    );
  });

  it("assertBudgetSettlementHonesty rejects claimed live provider success", () => {
    const reserved = reserveBudget(account(), "r-live", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-live", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const tampered = { ...settled, liveProviderSuccessClaimed: true as false };
    expect(() => assertBudgetSettlementHonesty(tampered)).toThrow(
      /must not claim live provider success/i,
    );
  });

  it("assertBudgetSettlementHonesty rejects tampered Ads access", () => {
    const reserved = reserveBudget(account(), "r-ads", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-ads", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const tampered = {
      ...settled,
      chatgptAdsAccess: "ALLOWED" as "ACCESS_BLOCKED",
    };
    expect(() => assertBudgetSettlementHonesty(tampered)).toThrow(
      /chatgptAdsAccess must be ACCESS_BLOCKED/i,
    );
  });

  it("post-overspend reserve returns BUDGET_EXHAUSTED with negative available (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-over", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-over", 1200);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.overrunMinor).toBe(600);
    expect(availableBudgetMinor(settled.account)).toBe(-200);
    expect(reserveBudget(settled.account, "r-more", 1)).toEqual({
      ok: false,
      code: "BUDGET_EXHAUSTED",
      availableMinor: -200,
    });
  });

  it("assertBudgetSettlementHonesty rejects tampered externalEffects", () => {
    const reserved = reserveBudget(account(), "r-tamper", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-tamper", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const tampered = { ...settled, externalEffects: "SOMETHING" as "NONE" };
    expect(() => assertBudgetSettlementHonesty(tampered)).toThrow(
      /externalEffects must be NONE/i,
    );
  });

  it("assertBudgetSettlementHonesty rejects tampered overrunMinor (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-orm", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-orm", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const tampered = { ...settled, overrunMinor: 0 };
    expect(() => assertBudgetSettlementHonesty(tampered)).toThrow(
      /overrunMinor mismatch/i,
    );
  });

  it("assertBudgetSettlementHonesty accepts replayed overrun settle", () => {
    const reserved = reserveBudget(account(), "r-replay", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const first = settleBudget(reserved.account, "r-replay", 750);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const replay = settleBudget(first.account, "r-replay", 750);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replayed).toBe(true);
    expect(replay.overrunMinor).toBe(150);
    expect(() => assertBudgetSettlementHonesty(replay)).not.toThrow();
  });

  it("refuses unknown-cancel after overrun settle (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-post", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-post", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.overrunMinor).toBe(150);
    expect(() =>
      cancelBudgetReservation(settled.account, "r-post", { known: false }),
    ).toThrow(/already settled/i);
  });

  it("minimal +1 overrun is visible and Ads-blocked (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-min", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-min", 601);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.overrunMinor).toBe(1);
    expect(settled.account.settledReservations["r-min"]?.overrunMinor).toBe(1);
    expect(settled.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(settled.liveProviderSuccessClaimed).toBe(false);
  });

  it("refuses settle on held unknown-usage reservation (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-hold", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-hold", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.account.heldMinor).toBe(600);
    expect(() => settleBudget(held.account, "r-hold", 750)).toThrow(
      /held for unknown usage/i,
    );
  });

  it("zero-actual settle shows overrunMinor=0 with Ads blocked (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-zero", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-zero", 0);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.overrunMinor).toBe(0);
    expect(settled.account.settledMinor).toBe(0);
    expect(settled.account.settledReservations["r-zero"]?.overrunMinor).toBe(0);
    expect(settled.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(settled.liveProviderWiring).toBe("NOT_WIRED");
    expect(settled.liveProviderSuccessClaimed).toBe(false);
  });

  it("held→known-cancel with actual>reserved persists overrunMinor (T-X028 edge)", () => {
    const reserved = reserveBudget(account(), "r-recon", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-recon", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const reconciled = cancelBudgetReservation(held.account, "r-recon", {
      known: true,
      actualMinor: 750,
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.account.heldMinor).toBe(0);
    expect(reconciled.account.settledMinor).toBe(750);
    expect(reconciled.account.settledReservations["r-recon"]).toEqual({
      reservedMinor: 600,
      actualMinor: 750,
      overrunMinor: 150,
    });
    expect(availableBudgetMinor(reconciled.account)).toBe(250);
  });

  it("accumulates sequential overruns without capping either (T-X028)", () => {
    let state = createBudgetAccount({
      dayKey: "2026-11-17",
      currency: "USD",
      limitMinor: 2000,
    });
    const a = reserveBudget(state, "r-a", 400);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    state = a.account;
    const b = reserveBudget(state, "r-b", 400);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    state = b.account;
    const sa = settleBudget(state, "r-a", 550);
    expect(sa.ok).toBe(true);
    if (!sa.ok) return;
    expect(sa.overrunMinor).toBe(150);
    expect(sa.liveProviderSuccessClaimed).toBe(false);
    expect(sa.account.settledReservations["r-a"]?.overrunMinor).toBe(150);
    state = sa.account;
    const sb = settleBudget(state, "r-b", 500);
    expect(sb.ok).toBe(true);
    if (!sb.ok) return;
    expect(sb.overrunMinor).toBe(100);
    expect(sb.account.settledMinor).toBe(1050);
    expect(sb.account.settledReservations["r-a"]?.overrunMinor).toBe(150);
    expect(sb.account.settledReservations["r-b"]?.overrunMinor).toBe(100);
    expect(availableBudgetMinor(sb.account)).toBe(950);
  });

  it("equal-estimate settle shows overrunMinor=0 (T-X028 control)", () => {
    const reserved = reserveBudget(account(), "r-eq", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-eq", 600);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.overrunMinor).toBe(0);
    expect(isActualCostOverrun(settled.reservedMinor, settled.actualMinor)).toBe(
      false,
    );
    expect(settled.account.settledMinor).toBe(600);
    expect(settled.externalEffects).toBe("NONE");
    expect(settled.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("overrun settle preserves sibling open reservation (T-X028)", () => {
    let state = account();
    const a = reserveBudget(state, "r-over", 600);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    state = a.account;
    const b = reserveBudget(state, "r-sib", 200);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    state = b.account;
    const overrun = settleBudget(state, "r-over", 750);
    expect(overrun.ok).toBe(true);
    if (!overrun.ok) return;
    expect(overrun.overrunMinor).toBe(150);
    expect(overrun.account.openReservations["r-sib"]).toBe(200);
    expect(overrun.account.reservedMinor).toBe(200);
    expect(overrun.account.settledMinor).toBe(750);
    expect(overrun.account.heldMinor).toBe(0);
    expect(availableBudgetMinor(overrun.account)).toBe(50);
  });

  it("posts full overrun past day limit — never silently capped (T-X028)", () => {
    const reserved = reserveBudget(account(), "r-past", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-past", 1200);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.actualMinor).toBe(1200);
    expect(settled.overrunMinor).toBe(600);
    expect(settled.account.settledMinor).toBe(1200);
    expect(settled.account.reservedMinor).toBe(0);
    expect(settled.account.heldMinor).toBe(0);
    // Honesty: overspend is visible in available (negative), not capped to limit.
    expect(availableBudgetMinor(settled.account)).toBe(-200);
    expect(settled.externalEffects).toBe("NONE");
    expect(settled.liveProviderWiring).toBe("NOT_WIRED");
  });

  it("overrun settle replay is idempotent; conflicting actual throws (T-X028)", () => {
    const reserved = reserveBudget(account(), "r-replay", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const first = settleBudget(reserved.account, "r-replay", 750);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.overrunMinor).toBe(150);
    const replay = settleBudget(first.account, "r-replay", 750);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replayed).toBe(true);
    expect(replay.overrunMinor).toBe(150);
    expect(replay.account.settledMinor).toBe(750);
    expect(replay.externalEffects).toBe("NONE");
    expect(replay.liveProviderWiring).toBe("NOT_WIRED");
    expect(() => settleBudget(replay.account, "r-replay", 800)).toThrow(
      /already settled with actual 750/,
    );
  });

  it("does not let a replayed settlement consume another reservation", () => {
    let state = account();
    const a = reserveBudget(state, "r-a", 400);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    state = a.account;
    const b = reserveBudget(state, "r-b", 400);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    state = b.account;

    const first = settleBudget(state, "r-a", 100);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    state = first.account;
    expect(state.openReservations["r-b"]).toBe(400);
    expect(state.settledMinor).toBe(100);

    const replay = settleBudget(state, "r-a", 100);
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replayed).toBe(true);
    expect(replay.account.settledMinor).toBe(100);
    expect(replay.account.openReservations["r-b"]).toBe(400);

    const second = settleBudget(replay.account, "r-b", 50);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.account.settledMinor).toBe(150);
    expect(second.account.openReservations).toEqual({});
  });

  it("rejects unknown reservation ids", () => {
    expect(settleBudget(account(), "missing", 10)).toEqual({
      ok: false,
      code: "UNKNOWN_RESERVATION",
      reservationId: "missing",
    });
  });

  it("holds residual on cancel with unknown usage (T-X027 — not zero cost)", () => {
    const reserved = reserveBudget(account(), "r-cancel", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(availableBudgetMinor(reserved.account)).toBe(400);

    const cancelled = cancelBudgetReservation(reserved.account, "r-cancel", {
      known: false,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.usageKnown).toBe(false);
    expect(cancelled.actualMinor).toBeNull();
    expect(cancelled.heldMinor).toBe(600);
    expect(cancelled.costKind).toBe("unknown_hold");
    expect(cancelled.account.heldMinor).toBe(600);
    expect(cancelled.account.reservedMinor).toBe(0);
    expect(cancelled.account.settledMinor).toBe(0);
    expect(cancelled.account.heldReservations["r-cancel"]).toBe(600);
    // Hold keeps capacity consumed — not released as zero.
    expect(availableBudgetMinor(cancelled.account)).toBe(400);

    const replay = cancelBudgetReservation(cancelled.account, "r-cancel", {
      known: false,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replayed).toBe(true);
    expect(replay.heldMinor).toBe(600);
    expect(availableBudgetMinor(replay.account)).toBe(400);
  });

  it("refuses settle-as-zero after unknown-usage hold", () => {
    const reserved = reserveBudget(account(), "r-hold", 300);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cancelled = cancelBudgetReservation(reserved.account, "r-hold", {
      known: false,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(() => settleBudget(cancelled.account, "r-hold", 0)).toThrow(
      /held for unknown usage/i,
    );
  });

  it("allows known-zero cancel to release (usage known)", () => {
    const reserved = reserveBudget(account(), "r-known-zero", 250);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cancelled = cancelBudgetReservation(reserved.account, "r-known-zero", {
      known: true,
      actualMinor: 0,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.costKind).toBe("zero_release");
    expect(cancelled.heldMinor).toBe(0);
    expect(cancelled.actualMinor).toBe(0);
    expect(availableBudgetMinor(cancelled.account)).toBe(1000);
  });

  it("resolves an unknown-usage hold with later known actual", () => {
    const reserved = reserveBudget(account(), "r-reconcile", 400);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-reconcile", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.account.heldMinor).toBe(400);
    expect(availableBudgetMinor(held.account)).toBe(600);

    const resolved = cancelBudgetReservation(held.account, "r-reconcile", {
      known: true,
      actualMinor: 175,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.costKind).toBe("actual");
    expect(resolved.heldMinor).toBe(0);
    expect(resolved.actualMinor).toBe(175);
    expect(resolved.account.heldMinor).toBe(0);
    expect(resolved.account.settledMinor).toBe(175);
    expect(resolved.account.heldReservations).toEqual({});
    expect(availableBudgetMinor(resolved.account)).toBe(825);
  });
});
