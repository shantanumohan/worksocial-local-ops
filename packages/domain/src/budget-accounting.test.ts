import { describe, expect, it } from "vitest";
import { reserveBudget, settleBudget, type BudgetAccount } from "./budget-accounting.js";

const account = (): BudgetAccount => ({
  dayKey: "2026-11-17",
  currency: "USD",
  limitMinor: 1000,
  reservedMinor: 0,
  settledMinor: 0,
});

describe("budget accounting", () => {
  it("reserves within limit", () => {
    const result = reserveBudget(account(), "r1", 400);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.account.reservedMinor).toBe(400);
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

  it("settles actual cost honestly (may be less than reserved)", () => {
    const reserved = reserveBudget(account(), "r3", 500);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r3", 500, 120);
    expect(settled.account.reservedMinor).toBe(0);
    expect(settled.account.settledMinor).toBe(120);
  });
});
