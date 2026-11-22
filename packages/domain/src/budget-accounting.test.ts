import { describe, expect, it } from "vitest";
import {
  availableBudgetMinor,
  cancelBudgetReservation,
  createBudgetAccount,
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
