import { describe, expect, it } from "vitest";
import {
  availableBudgetMinor,
  BUDGET_LIVE_PROVIDER_WIRING,
  BUDGET_RESERVATION_LIVE_WIRING,
  UNKNOWN_USAGE_CANCEL_RELATED_CASE_IDS,
  cancelBudgetReservation,
  committedBudgetMinor,
  composeConcurrentFinalBudgetReserves,
  createBudgetAccount,
  heldReservationsTotalMinor,
  isConcurrentBudgetCompositionHonest,
  isUnknownUsageHold,
  listUnknownUsageHoldIds,
  normalizeBudgetHolds,
  openReservationsTotalMinor,
  reserveBudget,
  settledReservationsActualTotalMinor,
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

  it("composes exact-remaining concurrent finals without exceeding the cap", () => {
    const first = reserveBudget(account(), "r-prior", 600);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(availableBudgetMinor(first.account)).toBe(400);

    const composition = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-exact", amountMinor: 400 },
      { reservationId: "r-stale-peer", amountMinor: 400 },
    ]);
    expect(composition.acceptedReservationIds).toEqual(["r-exact"]);
    expect(composition.exhaustedReservationIds).toEqual(["r-stale-peer"]);
    expect(composition.account.reservedMinor).toBe(1000);
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(composition.availableMinor).toBe(0);
    expect(composition.availableAtSnapshotMinor).toBe(400);
    expect(composition.isolationWouldOversubscribe).toBe(true);
    expect(composition.exhausted).toEqual([
      { reservationId: "r-stale-peer", availableMinor: 0 },
    ]);
    expect(composition.liveWiring).toBe(BUDGET_RESERVATION_LIVE_WIRING);
    expect(composition.externalEffects).toBe("NONE");
  });

  it("composes three-way same-snapshot finals with reserved ≤ limit", () => {
    const first = reserveBudget(account(), "r-seed", 500);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // Remaining 500 — three 300 finals each ok in isolation; composition keeps ≤1000.
    const snap = first.account;
    const isol = ["r-t1", "r-t2", "r-t3"].map((id) =>
      reserveBudget(snap, id, 300),
    );
    expect(isol.every((r) => r.ok)).toBe(true);

    const composition = composeConcurrentFinalBudgetReserves(snap, [
      { reservationId: "r-t1", amountMinor: 300 },
      { reservationId: "r-t2", amountMinor: 300 },
      { reservationId: "r-t3", amountMinor: 300 },
    ]);
    expect(composition.acceptedReservationIds).toEqual(["r-t1"]);
    expect(composition.exhaustedReservationIds).toEqual(["r-t2", "r-t3"]);
    expect(composition.account.reservedMinor).toBe(800);
    expect(composition.account.reservedMinor).toBeLessThanOrEqual(
      composition.account.limitMinor,
    );
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(composition.availableMinor).toBe(200);
    expect(composition.availableAtSnapshotMinor).toBe(500);
    expect(composition.isolationSumMinor).toBe(900);
    expect(composition.isolationWouldOversubscribe).toBe(true);
    expect(composition.exhausted).toEqual([
      { reservationId: "r-t2", availableMinor: 200 },
      { reservationId: "r-t3", availableMinor: 200 },
    ]);
    expect(composition.liveWiring).toBe("NOT_WIRED");
    expect(composition.externalEffects).toBe("NONE");
    // Input snapshot is not mutated by composition.
    expect(snap.reservedMinor).toBe(500);
    expect(snap.openReservations).toEqual({ "r-seed": 500 });
  });

  it("composes four-way pack then exhausts with oversubscribe honesty", () => {
    const first = reserveBudget(account(), "r-prior", 600);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const snap = first.account;
    const composition = composeConcurrentFinalBudgetReserves(snap, [
      { reservationId: "r-p1", amountMinor: 200 },
      { reservationId: "r-p2", amountMinor: 200 },
      { reservationId: "r-p3", amountMinor: 200 },
      { reservationId: "r-p4", amountMinor: 200 },
    ]);
    expect(composition.acceptedReservationIds).toEqual(["r-p1", "r-p2"]);
    expect(composition.exhaustedReservationIds).toEqual(["r-p3", "r-p4"]);
    expect(composition.account.reservedMinor).toBe(1000);
    expect(composition.availableAtSnapshotMinor).toBe(400);
    expect(composition.isolationSumMinor).toBe(800);
    expect(composition.isolationWouldOversubscribe).toBe(true);
    expect(composition.exhausted).toEqual([
      { reservationId: "r-p3", availableMinor: 0 },
      { reservationId: "r-p4", availableMinor: 0 },
    ]);
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(composition.liveWiring).toBe(BUDGET_RESERVATION_LIVE_WIRING);
    expect(snap.reservedMinor).toBe(600);
  });

  it("enforces concurrent cap after settled spend reduces headroom", () => {
    const reserved = reserveBudget(account(), "r-settle", 400);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-settle", 400);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    // Settled 400 consumes limit; remaining 600 — two 400 finals oversubscribe.
    expect(availableBudgetMinor(settled.account)).toBe(600);
    const composition = composeConcurrentFinalBudgetReserves(settled.account, [
      { reservationId: "r-after-a", amountMinor: 400 },
      { reservationId: "r-after-b", amountMinor: 400 },
    ]);
    expect(composition.acceptedReservationIds).toEqual(["r-after-a"]);
    expect(composition.exhaustedReservationIds).toEqual(["r-after-b"]);
    expect(composition.availableAtSnapshotMinor).toBe(600);
    expect(composition.isolationWouldOversubscribe).toBe(true);
    expect(composition.acceptedSumMinor).toBe(400);
    expect(composition.account.reservedMinor).toBe(400);
    expect(composition.account.settledMinor).toBe(400);
    expect(
      composition.account.reservedMinor + composition.account.settledMinor,
    ).toBeLessThanOrEqual(composition.account.limitMinor);
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(composition.exhausted[0]?.availableMinor).toBe(200);
    expect(composition.externalEffects).toBe("NONE");
  });

  it("composes non-oversubscribe fit path with acceptedSumMinor", () => {
    const first = reserveBudget(account(), "r-prior", 600);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const composition = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-fit-a", amountMinor: 150 },
      { reservationId: "r-fit-b", amountMinor: 150 },
    ]);
    expect(composition.isolationWouldOversubscribe).toBe(false);
    expect(composition.availableAtSnapshotMinor).toBe(400);
    expect(composition.isolationSumMinor).toBe(300);
    expect(composition.acceptedReservationIds).toEqual(["r-fit-a", "r-fit-b"]);
    expect(composition.exhaustedReservationIds).toEqual([]);
    expect(composition.acceptedSumMinor).toBe(300);
    expect(composition.account.reservedMinor).toBe(900);
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(composition.availableMinor).toBe(100);
    expect(composition.liveWiring).toBe(BUDGET_RESERVATION_LIVE_WIRING);
  });

  it("exhausts all finals when snapshot headroom is zero", () => {
    const fill = reserveBudget(account(), "r-fill", 1000);
    expect(fill.ok).toBe(true);
    if (!fill.ok) return;
    expect(availableBudgetMinor(fill.account)).toBe(0);
    const composition = composeConcurrentFinalBudgetReserves(fill.account, [
      { reservationId: "r-z1", amountMinor: 1 },
      { reservationId: "r-z2", amountMinor: 50 },
    ]);
    expect(composition.availableAtSnapshotMinor).toBe(0);
    expect(composition.isolationWouldOversubscribe).toBe(true);
    expect(composition.acceptedReservationIds).toEqual([]);
    expect(composition.accepted).toEqual([]);
    expect(composition.acceptedSumMinor).toBe(0);
    expect(composition.exhaustedReservationIds).toEqual(["r-z1", "r-z2"]);
    expect(composition.exhausted).toEqual([
      { reservationId: "r-z1", availableMinor: 0 },
      { reservationId: "r-z2", availableMinor: 0 },
    ]);
    expect(composition.account.reservedMinor).toBe(1000);
    expect(committedBudgetMinor(composition.account)).toBe(1000);
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(composition.fixtureAcceptedNotVerified).toBe(true);
    expect(composition.externalEffects).toBe("NONE");
  });

  it("keeps empty finals as identity composition", () => {
    const first = reserveBudget(account(), "r-prior", 250);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const composition = composeConcurrentFinalBudgetReserves(first.account, []);
    expect(composition.accepted).toEqual([]);
    expect(composition.exhausted).toEqual([]);
    expect(composition.acceptedSumMinor).toBe(0);
    expect(composition.isolationSumMinor).toBe(0);
    expect(composition.isolationWouldOversubscribe).toBe(false);
    expect(composition.availableAtSnapshotMinor).toBe(750);
    expect(composition.availableMinor).toBe(750);
    expect(composition.account.reservedMinor).toBe(250);
    expect(composition.fixtureAcceptedNotVerified).toBe(true);
    expect(composition.liveWiring).toBe(BUDGET_RESERVATION_LIVE_WIRING);
    expect(first.account.reservedMinor).toBe(250);
  });

  it("exhausts a single oversize final without accepting", () => {
    const first = reserveBudget(account(), "r-prior", 800);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const composition = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-oversize", amountMinor: 500 },
    ]);
    expect(composition.availableAtSnapshotMinor).toBe(200);
    expect(composition.isolationWouldOversubscribe).toBe(true);
    expect(composition.accepted).toEqual([]);
    expect(composition.acceptedSumMinor).toBe(0);
    expect(composition.exhausted).toEqual([
      { reservationId: "r-oversize", availableMinor: 200 },
    ]);
    expect(composition.account.reservedMinor).toBe(800);
    expect(committedBudgetMinor(composition.account)).toBe(800);
    expect(composition.committedMinor).toBe(800);
    expect(composition.availableMatchesLimitMinusCommitted).toBe(true);
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(composition.fixtureAcceptedNotVerified).toBe(true);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("throws on duplicate reservationId without mutating the snapshot", () => {
    const first = reserveBudget(account(), "r-prior", 400);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const snap = first.account;
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-dup", amountMinor: 100 },
        { reservationId: "r-dup", amountMinor: 100 },
      ]),
    ).toThrow(/already exists/i);
    expect(snap.reservedMinor).toBe(400);
    expect(snap.openReservations).toEqual({ "r-prior": 400 });
  });

  it("keeps composition honesty predicate on fit path", () => {
    const first = reserveBudget(account(), "r-prior", 500);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const composition = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-a", amountMinor: 200 },
      { reservationId: "r-b", amountMinor: 200 },
    ]);
    expect(composition.committedMinor).toBe(900);
    expect(composition.availableMatchesLimitMinusCommitted).toBe(true);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("caps concurrent finals against heldMinor headroom (M6)", () => {
    const reserved = reserveBudget(account(), "r-hold", 700);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cancelled = cancelBudgetReservation(reserved.account, "r-hold", {
      known: false,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.account.heldMinor).toBe(700);
    expect(availableBudgetMinor(cancelled.account)).toBe(300);
    const composition = composeConcurrentFinalBudgetReserves(
      cancelled.account,
      [
        { reservationId: "r-a", amountMinor: 300 },
        { reservationId: "r-b", amountMinor: 300 },
      ],
    );
    expect(composition.availableAtSnapshotMinor).toBe(300);
    expect(composition.isolationWouldOversubscribe).toBe(true);
    expect(composition.accepted).toEqual([
      { reservationId: "r-a", amountMinor: 300 },
    ]);
    expect(composition.exhausted).toEqual([
      { reservationId: "r-b", availableMinor: 0 },
    ]);
    expect(composition.committedMinor).toBe(1000);
    expect(composition.availableMatchesLimitMinusCommitted).toBe(true);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
    expect(cancelled.account.heldMinor).toBe(700);
    expect(cancelled.account.reservedMinor).toBe(0);
  });

  it("throws on non-positive amount without mutating the snapshot (M6)", () => {
    const first = reserveBudget(account(), "r-prior", 400);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const snap = first.account;
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-ok", amountMinor: 100 },
        { reservationId: "r-zero", amountMinor: 0 },
      ]),
    ).toThrow(/positive/i);
    expect(snap.reservedMinor).toBe(400);
    expect(snap.openReservations).toEqual({ "r-prior": 400 });
  });

  it("fails honesty predicate on forged composition fields (M6)", () => {
    const first = reserveBudget(account(), "r-prior", 500);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const honest = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-a", amountMinor: 100 },
    ]);
    expect(isConcurrentBudgetCompositionHonest(honest)).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        liveWiring: "WIRED" as typeof honest.liveWiring,
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        fixtureAcceptedNotVerified: false as true,
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        acceptedSumMinor: honest.acceptedSumMinor + 1,
      }),
    ).toBe(false);
  });

  it("restores headroom after known-zero cancel then composes (M7)", () => {
    const reserved = reserveBudget(account(), "r-zero-rel", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const released = cancelBudgetReservation(reserved.account, "r-zero-rel", {
      known: true,
      actualMinor: 0,
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.account.heldMinor).toBe(0);
    expect(availableBudgetMinor(released.account)).toBe(1000);
    const composition = composeConcurrentFinalBudgetReserves(
      released.account,
      [
        { reservationId: "r-a", amountMinor: 400 },
        { reservationId: "r-b", amountMinor: 400 },
      ],
    );
    expect(composition.availableAtSnapshotMinor).toBe(1000);
    expect(composition.acceptedSumMinor).toBe(800);
    expect(composition.exhausted).toEqual([]);
    expect(composition.committedMinor).toBe(800);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("throws on settled reservationId reuse without mutating snap (M7)", () => {
    const reserved = reserveBudget(account(), "r-settle", 300);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-settle", 120);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const snap = settled.account;
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-settle", amountMinor: 100 },
      ]),
    ).toThrow(/already exists/i);
    expect(snap.settledMinor).toBe(120);
    expect(snap.openReservations).toEqual({});
  });

  it("fails honesty on forged externalEffects and isolation flag (M7)", () => {
    const first = reserveBudget(account(), "r-prior", 500);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const honest = composeConcurrentFinalBudgetReserves(first.account, [
      { reservationId: "r-a", amountMinor: 100 },
      { reservationId: "r-b", amountMinor: 500 },
    ]);
    expect(isConcurrentBudgetCompositionHonest(honest)).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        externalEffects: "SOME" as "NONE",
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        isolationWouldOversubscribe: !honest.isolationWouldOversubscribe,
      }),
    ).toBe(false);
  });

  it("throws on open reservationId collision without mutating snap (M8)", () => {
    const open = reserveBudget(account(), "r-open", 250);
    expect(open.ok).toBe(true);
    if (!open.ok) return;
    const snap = open.account;
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-open", amountMinor: 100 },
        { reservationId: "r-peer", amountMinor: 100 },
      ]),
    ).toThrow(/already exists/i);
    expect(snap.reservedMinor).toBe(250);
    expect(snap.openReservations).toEqual({ "r-open": 250 });
  });

  it("throws on held reservationId collision without mutating snap (M8)", () => {
    const reserved = reserveBudget(account(), "r-held", 400);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-held", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const snap = held.account;
    expect(snap.heldMinor).toBe(400);
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-held", amountMinor: 50 },
      ]),
    ).toThrow(/already exists/i);
    expect(snap.heldMinor).toBe(400);
    expect(snap.heldReservations["r-held"]).toBe(400);
  });

  it("caps concurrent finals against settled+held headroom (M8)", () => {
    const first = reserveBudget(account(), "r-settle", 300);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const settled = settleBudget(first.account, "r-settle", 200);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const second = reserveBudget(settled.account, "r-hold", 500);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const held = cancelBudgetReservation(second.account, "r-hold", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    // available = 1000 - settled200 - held500 = 300
    expect(availableBudgetMinor(held.account)).toBe(300);
    const composition = composeConcurrentFinalBudgetReserves(held.account, [
      { reservationId: "r-a", amountMinor: 200 },
      { reservationId: "r-b", amountMinor: 200 },
    ]);
    expect(composition.availableAtSnapshotMinor).toBe(300);
    expect(composition.acceptedSumMinor).toBe(200);
    expect(composition.exhaustedReservationIds).toEqual(["r-b"]);
    expect(composition.exhausted[0]?.availableMinor).toBe(100);
    expect(composition.committedMinor).toBe(900);
    expect(composition.reservedNeverExceedsLimit).toBe(true);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("fails honesty on forged committedMinor and acceptedIds length (M8)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 100 },
      { reservationId: "r-b", amountMinor: 100 },
    ]);
    expect(isConcurrentBudgetCompositionHonest(honest)).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        committedMinor: honest.committedMinor + 1,
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        acceptedReservationIds: [...honest.acceptedReservationIds, "ghost"],
      }),
    ).toBe(false);
  });

  it("throws on blank reservationId without mutating snap (M9)", () => {
    const snap = account();
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "   ", amountMinor: 100 },
        { reservationId: "r-peer", amountMinor: 100 },
      ]),
    ).toThrow(/non-blank/i);
    expect(snap.reservedMinor).toBe(0);
    expect(snap.openReservations).toEqual({});
  });

  it("composes after known-reconcile of hold restores headroom (M9)", () => {
    const reserved = reserveBudget(account(), "r-reconcile", 400);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-reconcile", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const resolved = cancelBudgetReservation(held.account, "r-reconcile", {
      known: true,
      actualMinor: 175,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(availableBudgetMinor(resolved.account)).toBe(825);
    const composition = composeConcurrentFinalBudgetReserves(
      resolved.account,
      [
        { reservationId: "r-a", amountMinor: 500 },
        { reservationId: "r-b", amountMinor: 500 },
      ],
    );
    expect(composition.availableAtSnapshotMinor).toBe(825);
    expect(composition.acceptedSumMinor).toBe(500);
    expect(composition.exhaustedReservationIds).toEqual(["r-b"]);
    expect(composition.exhausted[0]?.availableMinor).toBe(325);
    expect(composition.committedMinor).toBe(675);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("keeps all-exhaust snap immutable (M9)", () => {
    const first = reserveBudget(account(), "r-fill", 1000);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const snap = first.account;
    const composition = composeConcurrentFinalBudgetReserves(snap, [
      { reservationId: "r-z1", amountMinor: 1 },
      { reservationId: "r-z2", amountMinor: 50 },
    ]);
    expect(composition.acceptedSumMinor).toBe(0);
    expect(composition.exhaustedReservationIds).toEqual(["r-z1", "r-z2"]);
    expect(snap.reservedMinor).toBe(1000);
    expect(snap.openReservations).toEqual({ "r-fill": 1000 });
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("fails honesty on forged fixture/availableMatches/exhausted/isolationSum (M9)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 100 },
      { reservationId: "r-b", amountMinor: 100 },
    ]);
    expect(isConcurrentBudgetCompositionHonest(honest)).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        fixtureAcceptedNotVerified: false as true,
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        availableMatchesLimitMinusCommitted: !honest.availableMatchesLimitMinusCommitted,
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        exhaustedReservationIds: [...honest.exhaustedReservationIds, "ghost"],
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        // Flip isolationSum past snapshot while leaving the flag false.
        isolationSumMinor: honest.availableAtSnapshotMinor + 1,
        isolationWouldOversubscribe: false,
      }),
    ).toBe(false);
  });

  it("throws on duplicate ids in finals before any apply (M10)", () => {
    const snap = account();
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-dup", amountMinor: 100 },
        { reservationId: "r-dup", amountMinor: 200 },
      ]),
    ).toThrow(/already exists/i);
    expect(snap.reservedMinor).toBe(0);
    expect(snap.openReservations).toEqual({});
  });

  it("fails honesty when exhausted row id drifts from exhaustedReservationIds (M15)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 600 },
      { reservationId: "r-b", amountMinor: 500 },
    ]);
    expect(honest.exhausted.length).toBeGreaterThan(0);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        exhausted: honest.exhausted.map((row) => ({
          ...row,
          reservationId: "r-forged-exhaust",
        })),
      }),
    ).toBe(false);
  });

  it("fails honesty when accepted row id drifts from acceptedReservationIds (M14)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 100 },
    ]);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        accepted: [{ reservationId: "r-forged", amountMinor: 100 }],
      }),
    ).toBe(false);
  });

  it("fails honesty when acceptedReservationIds order permuted vs accepted rows (M16)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 100 },
      { reservationId: "r-b", amountMinor: 200 },
    ]);
    expect(honest.accepted.length).toBe(2);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        acceptedReservationIds: [...honest.acceptedReservationIds].reverse(),
      }),
    ).toBe(false);
  });

  it("fails honesty when exhaustedReservationIds order permuted vs exhausted rows (M17)", () => {
    const honest = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-exh-order",
        currency: "USD",
        limitMinor: 500,
      }),
      [
        { reservationId: "r-a", amountMinor: 300 },
        { reservationId: "r-b", amountMinor: 300 },
        { reservationId: "r-c", amountMinor: 300 },
      ],
    );
    expect(honest.exhausted.length).toBeGreaterThanOrEqual(2);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        exhaustedReservationIds: [...honest.exhaustedReservationIds].reverse(),
      }),
    ).toBe(false);
  });

  it("fails honesty when accepted row amountMinor drifts from composed rows (M18)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 200 },
      { reservationId: "r-b", amountMinor: 300 },
    ]);
    expect(honest.accepted.length).toBeGreaterThan(0);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        accepted: honest.accepted.map((row, i) =>
          i === 0 ? { ...row, amountMinor: row.amountMinor + 1 } : row,
        ),
      }),
    ).toBe(false);
  });

  it("fails honesty when exhausted row count drifts from exhaustedReservationIds (M19)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 700 },
      { reservationId: "r-b", amountMinor: 500 },
    ]);
    expect(honest.exhausted.length).toBeGreaterThan(0);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        exhausted: [
          ...honest.exhausted,
          { reservationId: "r-ghost-exhaust", availableMinor: 0 },
        ],
      }),
    ).toBe(false);
  });

  it("fails honesty when accepted row count drifts from acceptedReservationIds (M20)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 200 },
      { reservationId: "r-b", amountMinor: 300 },
    ]);
    expect(honest.accepted.length).toBeGreaterThan(0);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        accepted: [
          ...honest.accepted,
          { reservationId: "r-ghost-accept", amountMinor: 1 },
        ],
      }),
    ).toBe(false);
  });

  it("fails honesty when accepted rows shortened vs acceptedReservationIds (M21)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 100 },
      { reservationId: "r-b", amountMinor: 200 },
    ]);
    expect(honest.accepted.length).toBeGreaterThanOrEqual(2);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        accepted: honest.accepted.slice(0, 1),
      }),
    ).toBe(false);
  });

  it("fails honesty when exhausted rows shortened vs exhaustedReservationIds (M22)", () => {
    const honest = composeConcurrentFinalBudgetReserves(
      createBudgetAccount({
        dayKey: "2026-11-22-exh-short",
        currency: "USD",
        limitMinor: 500,
      }),
      [
        { reservationId: "r-a", amountMinor: 300 },
        { reservationId: "r-b", amountMinor: 300 },
        { reservationId: "r-c", amountMinor: 300 },
      ],
    );
    expect(honest.exhausted.length).toBeGreaterThanOrEqual(2);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        exhausted: honest.exhausted.slice(0, 1),
      }),
    ).toBe(false);
  });

  it("fails honesty when composition availableMinor drifts from account (M23)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 150 },
    ]);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        availableMinor: honest.availableMinor + 1,
      }),
    ).toBe(false);
  });

  it("fails honesty when availableMatchesLimitMinusCommitted is forged (M24)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 100 },
    ]);
    expect(honest.availableMatchesLimitMinusCommitted).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        availableMatchesLimitMinusCommitted: false,
      }),
    ).toBe(false);
  });

  it("fails honesty when isolationWouldOversubscribe flag mismatches isolationSum (M25)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 600 },
      { reservationId: "r-b", amountMinor: 600 },
    ]);
    expect(honest.isolationSumMinor).toBeGreaterThan(
      honest.availableAtSnapshotMinor,
    );
    expect(honest.isolationWouldOversubscribe).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        isolationWouldOversubscribe: !honest.isolationWouldOversubscribe,
      }),
    ).toBe(false);
  });

  it("fails honesty when isolationSumMinor inconsistent with oversubscribe flag (M26)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 600 },
      { reservationId: "r-b", amountMinor: 600 },
    ]);
    expect(honest.isolationWouldOversubscribe).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        isolationSumMinor: honest.availableAtSnapshotMinor,
        isolationWouldOversubscribe: true,
      }),
    ).toBe(false);
  });

  it("throws on non-finite amountMinor before apply (M13)", () => {
    const snap = account();
    for (const amountMinor of [Number.NaN, Number.POSITIVE_INFINITY, -0]) {
      expect(() =>
        composeConcurrentFinalBudgetReserves(snap, [
          { reservationId: "r-bad", amountMinor },
        ]),
      ).toThrow(/finite positive integer/i);
      expect(snap.reservedMinor).toBe(0);
    }
  });

  it("throws on non-integer amountMinor before apply (M12)", () => {
    const snap = account();
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: "r-frac", amountMinor: 10.5 },
      ]),
    ).toThrow(/integer minor unit/i);
    expect(snap.reservedMinor).toBe(0);
  });

  it("throws on trim-normalized duplicate ids before apply (M11)", () => {
    const snap = account();
    expect(() =>
      composeConcurrentFinalBudgetReserves(snap, [
        { reservationId: " r-trim ", amountMinor: 100 },
        { reservationId: "r-trim", amountMinor: 200 },
      ]),
    ).toThrow(/already exists/i);
    expect(snap.reservedMinor).toBe(0);
    const ok = composeConcurrentFinalBudgetReserves(snap, [
      { reservationId: "  r-pad  ", amountMinor: 50 },
    ]);
    expect(ok.acceptedReservationIds).toEqual(["r-pad"]);
    expect(isConcurrentBudgetCompositionHonest(ok)).toBe(true);
  });

  it("composes after known-positive cancel restores headroom (M10)", () => {
    const reserved = reserveBudget(account(), "r-pos", 400);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const released = cancelBudgetReservation(reserved.account, "r-pos", {
      known: true,
      actualMinor: 150,
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(availableBudgetMinor(released.account)).toBe(850);
    const composition = composeConcurrentFinalBudgetReserves(
      released.account,
      [
        { reservationId: "r-a", amountMinor: 500 },
        { reservationId: "r-b", amountMinor: 500 },
      ],
    );
    expect(composition.availableAtSnapshotMinor).toBe(850);
    expect(composition.acceptedSumMinor).toBe(500);
    expect(composition.exhaustedReservationIds).toEqual(["r-b"]);
    expect(composition.exhausted[0]?.availableMinor).toBe(350);
    expect(composition.committedMinor).toBe(650);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("records exhausted availableMinor after prior accept (M10)", () => {
    const composition = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 600 },
      { reservationId: "r-b", amountMinor: 500 },
      { reservationId: "r-c", amountMinor: 450 },
    ]);
    expect(composition.acceptedReservationIds).toEqual(["r-a"]);
    expect(composition.exhaustedReservationIds).toEqual(["r-b", "r-c"]);
    expect(composition.exhausted.map((e) => e.availableMinor)).toEqual([
      400, 400,
    ]);
    expect(composition.acceptedSumMinor).toBe(600);
    expect(isConcurrentBudgetCompositionHonest(composition)).toBe(true);
  });

  it("fails honesty on forged reservedNeverExceeds/availableMinor/acceptedSum (M10)", () => {
    const honest = composeConcurrentFinalBudgetReserves(account(), [
      { reservationId: "r-a", amountMinor: 100 },
      { reservationId: "r-b", amountMinor: 100 },
    ]);
    expect(isConcurrentBudgetCompositionHonest(honest)).toBe(true);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        reservedNeverExceedsLimit: false,
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        availableMinor: honest.availableMinor + 1,
      }),
    ).toBe(false);
    expect(
      isConcurrentBudgetCompositionHonest({
        ...honest,
        acceptedSumMinor: honest.acceptedSumMinor + 1,
      }),
    ).toBe(false);
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

  it("settleBudget rejects non-finite and fractional actual (L16 / T-X028)", () => {
    const reserved = reserveBudget(account(), "r-val", 100);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(() => settleBudget(reserved.account, "r-val", Number.NaN)).toThrow();
    expect(() => settleBudget(reserved.account, "r-val", 50.5)).toThrow();
    expect(() => reserveBudget(account(), "r-bad", 10.5)).toThrow();
  });

  it("posts overrun when actual exceeds reserved estimate (T-X028)", () => {
    const seed = account();
    expect(seed.heldMinor).toBe(0);
    const reserved = reserveBudget(seed, "r-over", 600);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.account.heldMinor).toBe(0);
    const settled = settleBudget(reserved.account, "r-over", 750);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.actualMinor).toBe(750);
    expect(settled.reservedMinor).toBe(600);
    expect(settled.actualMinor).toBeGreaterThan(settled.reservedMinor);
    expect(settled.account.reservedMinor).toBe(0);
    expect(settled.account.settledMinor).toBe(750);
    expect(settled.account.heldMinor).toBe(0);
    expect(settled.account.openReservations["r-over"]).toBeUndefined();
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

  it("known reconcile from hold persists overrunMinor on snapshot (L18)", () => {
    const reserved = reserveBudget(account(), "r-recon", 200);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-recon", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const reconciled = cancelBudgetReservation(held.account, "r-recon", {
      known: true,
      actualMinor: 280,
    });
    expect(reconciled.ok).toBe(true);
    if (!reconciled.ok) return;
    expect(reconciled.costKind).toBe("actual");
    expect(reconciled.account.settledReservations["r-recon"]).toEqual({
      reservedMinor: 200,
      actualMinor: 280,
      overrunMinor: 80,
    });
    expect(reconciled.account.heldMinor).toBe(0);
    expect(availableBudgetMinor(reconciled.account)).toBe(720);
  });

  it("multi-hold under-run reconcile posts zero overrunMinor; sibling hold intact (L20)", () => {
    const a = reserveBudget(account(), "r-primary", 400);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = reserveBudget(a.account, "r-sibling", 120);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const holdPrimary = cancelBudgetReservation(b.account, "r-primary", {
      known: false,
    });
    expect(holdPrimary.ok).toBe(true);
    if (!holdPrimary.ok) return;
    const holdSibling = cancelBudgetReservation(holdPrimary.account, "r-sibling", {
      known: false,
    });
    expect(holdSibling.ok).toBe(true);
    if (!holdSibling.ok) return;
    expect(holdSibling.account.heldMinor).toBe(520);

    const underRun = cancelBudgetReservation(holdSibling.account, "r-primary", {
      known: true,
      actualMinor: 250,
    });
    expect(underRun.ok).toBe(true);
    if (!underRun.ok) return;
    expect(underRun.costKind).toBe("actual");
    expect(underRun.account.settledReservations["r-primary"]).toEqual({
      reservedMinor: 400,
      actualMinor: 250,
      overrunMinor: 0,
    });
    expect(isUnknownUsageHold(underRun.account, "r-sibling")).toBe(true);
    expect(underRun.account.heldMinor).toBe(120);
    expect(underRun.account.settledMinor).toBe(250);
    expect(availableBudgetMinor(underRun.account)).toBe(630);
    expect(underRun.liveBudgetProviderWiring).toBe("NOT_WIRED");
  });

  it("multi-hold overrun reconcile persists overrunMinor; sibling hold intact (L21)", () => {
    const a = reserveBudget(account(), "r-over", 300);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = reserveBudget(a.account, "r-sib", 80);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const holdOver = cancelBudgetReservation(b.account, "r-over", {
      known: false,
    });
    expect(holdOver.ok).toBe(true);
    if (!holdOver.ok) return;
    const holdSib = cancelBudgetReservation(holdOver.account, "r-sib", {
      known: false,
    });
    expect(holdSib.ok).toBe(true);
    if (!holdSib.ok) return;
    const overrun = cancelBudgetReservation(holdSib.account, "r-over", {
      known: true,
      actualMinor: 380,
    });
    expect(overrun.ok).toBe(true);
    if (!overrun.ok) return;
    expect(overrun.account.settledReservations["r-over"]).toEqual({
      reservedMinor: 300,
      actualMinor: 380,
      overrunMinor: 80,
    });
    expect(isUnknownUsageHold(overrun.account, "r-sib")).toBe(true);
    expect(overrun.account.heldMinor).toBe(80);
    expect(overrun.account.settledMinor).toBe(380);
    expect(availableBudgetMinor(overrun.account)).toBe(540);
    expect(overrun.liveBudgetProviderWiring).toBe("NOT_WIRED");
  });

  it("known-zero release after hold posts explicit zero settled snapshot (L19)", () => {
    const reserved = reserveBudget(account(), "r-zrelease", 180);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-zrelease", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.account.heldMinor).toBe(180);
    const released = cancelBudgetReservation(held.account, "r-zrelease", {
      known: true,
      actualMinor: 0,
    });
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(released.costKind).toBe("zero_release");
    expect(released.account.settledReservations["r-zrelease"]).toEqual({
      reservedMinor: 180,
      actualMinor: 0,
      overrunMinor: 0,
    });
    expect(released.account.settledMinor).toBe(0);
    expect(released.account.heldMinor).toBe(0);
    expect(availableBudgetMinor(released.account)).toBe(1000);
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
    expect(held.externalEffects).toBe("NONE");
    expect(held.liveBudgetProviderWiring).toBe(BUDGET_LIVE_PROVIDER_WIRING);

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
    expect(resolved.externalEffects).toBe("NONE");
    expect(resolved.liveBudgetProviderWiring).toBe("NOT_WIRED");

    const replay = cancelBudgetReservation(resolved.account, "r-reconcile", {
      known: true,
      actualMinor: 175,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replayed).toBe(true);
    expect(replay.actualMinor).toBe(175);
    expect(availableBudgetMinor(replay.account)).toBe(825);
  });

  it("stacks concurrent unknown-usage holds (T-X027 multi-hold)", () => {
    const a = reserveBudget(account(), "r-a", 300);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = reserveBudget(a.account, "r-b", 200);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const holdA = cancelBudgetReservation(b.account, "r-a", { known: false });
    expect(holdA.ok).toBe(true);
    if (!holdA.ok) return;
    const holdB = cancelBudgetReservation(holdA.account, "r-b", {
      known: false,
    });
    expect(holdB.ok).toBe(true);
    if (!holdB.ok) return;
    expect(holdB.account.heldMinor).toBe(500);
    expect(holdB.account.heldReservations).toEqual({ "r-a": 300, "r-b": 200 });
    expect(availableBudgetMinor(holdB.account)).toBe(500);
    expect(holdB.liveBudgetProviderWiring).toBe("NOT_WIRED");
  });

  it("refuses settle with non-zero actual on unknown-usage hold", () => {
    const reserved = reserveBudget(account(), "r-nz", 250);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-nz", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(() => settleBudget(held.account, "r-nz", 40)).toThrow(
      /held for unknown usage/i,
    );
  });

  it("refuses unknown-cancel replay after settled", () => {
    const reserved = reserveBudget(account(), "r-settled", 150);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-settled", 90);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(() =>
      cancelBudgetReservation(settled.account, "r-settled", { known: false }),
    ).toThrow(/already settled/i);
  });

  it("allows under-cap reserve while unknown hold consumes residual", () => {
    const reserved = reserveBudget(account(), "r-hold", 700);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-hold", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(availableBudgetMinor(held.account)).toBe(300);
    const under = reserveBudget(held.account, "r-under", 300);
    expect(under.ok).toBe(true);
    if (!under.ok) return;
    expect(under.account.reservedMinor).toBe(300);
    expect(under.account.heldMinor).toBe(700);
    expect(availableBudgetMinor(under.account)).toBe(0);
    expect(() => reserveBudget(held.account, "r-hold", 50)).toThrow(
      /already exists/i,
    );
  });

  it("resolves unknown-usage hold to known zero without inventing at cancel", () => {
    const reserved = reserveBudget(account(), "r-zero-hold", 180);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-zero-hold", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(held.costKind).toBe("unknown_hold");
    expect(held.actualMinor).toBeNull();
    const zeroed = cancelBudgetReservation(held.account, "r-zero-hold", {
      known: true,
      actualMinor: 0,
    });
    expect(zeroed.ok).toBe(true);
    if (!zeroed.ok) return;
    expect(zeroed.costKind).toBe("zero_release");
    expect(zeroed.actualMinor).toBe(0);
    expect(zeroed.account.heldMinor).toBe(0);
    expect(availableBudgetMinor(zeroed.account)).toBe(1000);
  });

  it("pins T-X027 related ids and live wiring NOT_WIRED", () => {
    expect(UNKNOWN_USAGE_CANCEL_RELATED_CASE_IDS).toEqual(["T-X027"]);
    expect(BUDGET_LIVE_PROVIDER_WIRING).toBe("NOT_WIRED");
  });

  it("keeps heldMinor equal to sum of heldReservations across hold/resolve", () => {
    const a = reserveBudget(account(), "r1", 300);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = reserveBudget(a.account, "r2", 250);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const hold1 = cancelBudgetReservation(b.account, "r1", { known: false });
    expect(hold1.ok).toBe(true);
    if (!hold1.ok) return;
    expect(heldReservationsTotalMinor(hold1.account)).toBe(300);
    expect(hold1.account.heldMinor).toBe(
      heldReservationsTotalMinor(hold1.account),
    );
    const hold2 = cancelBudgetReservation(hold1.account, "r2", {
      known: false,
    });
    expect(hold2.ok).toBe(true);
    if (!hold2.ok) return;
    expect(hold2.account.heldMinor).toBe(550);
    expect(heldReservationsTotalMinor(hold2.account)).toBe(550);

    const resolved = cancelBudgetReservation(hold2.account, "r1", {
      known: true,
      actualMinor: 110,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.account.heldMinor).toBe(250);
    expect(heldReservationsTotalMinor(resolved.account)).toBe(250);
    expect(resolved.account.heldMinor).toBe(
      heldReservationsTotalMinor(resolved.account),
    );
  });

  it("refuses conflicting known-cancel after settled", () => {
    const reserved = reserveBudget(account(), "r-conflict", 200);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-conflict", 80);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(() =>
      cancelBudgetReservation(settled.account, "r-conflict", {
        known: true,
        actualMinor: 99,
      }),
    ).toThrow(/already settled with actual 80/i);
  });

  it("isUnknownUsageHold detects hold vs open/settled", () => {
    const reserved = reserveBudget(account(), "r-flag", 120);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(isUnknownUsageHold(reserved.account, "r-flag")).toBe(false);
    const held = cancelBudgetReservation(reserved.account, "r-flag", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    expect(isUnknownUsageHold(held.account, "r-flag")).toBe(true);
    expect(isUnknownUsageHold(held.account, "missing")).toBe(false);
    const resolved = cancelBudgetReservation(held.account, "r-flag", {
      known: true,
      actualMinor: 40,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(isUnknownUsageHold(resolved.account, "r-flag")).toBe(false);
  });

  it("available uses hold map even when heldMinor field is stale (T-X027)", () => {
    const reserved = reserveBudget(account(), "r-stale", 400);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-stale", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const stale = {
      ...held.account,
      heldMinor: 0, // stale — must not invent capacity
    };
    expect(heldReservationsTotalMinor(stale)).toBe(400);
    expect(availableBudgetMinor(stale)).toBe(600);
    const blocked = reserveBudget(stale, "r-over", 700);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("BUDGET_EXHAUSTED");
      expect(blocked.availableMinor).toBe(600);
    }
    const normalized = normalizeBudgetHolds(stale);
    expect(normalized.heldMinor).toBe(400);
    expect(availableBudgetMinor(normalized)).toBe(600);
  });

  it("resolves unknown hold when known actual equals reserved", () => {
    const reserved = reserveBudget(account(), "r-eq", 275);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-eq", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const resolved = cancelBudgetReservation(held.account, "r-eq", {
      known: true,
      actualMinor: 275,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.costKind).toBe("actual");
    expect(resolved.actualMinor).toBe(275);
    expect(resolved.account.heldMinor).toBe(0);
    expect(availableBudgetMinor(resolved.account)).toBe(725);
    expect(resolved.liveBudgetProviderWiring).toBe("NOT_WIRED");
  });

  it("ignores non-finite hold map amounts in sum", () => {
    const weird = {
      ...account(),
      heldReservations: {
        bad: Number.NaN,
        neg: -50,
        ok: 200,
      },
      heldMinor: 0,
    };
    expect(heldReservationsTotalMinor(weird)).toBe(200);
    expect(availableBudgetMinor(weird)).toBe(800);
  });

  it("resolves hold without negative heldMinor when field is stale", () => {
    const a = reserveBudget(account(), "r1", 300);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const b = reserveBudget(a.account, "r2", 200);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const hold1 = cancelBudgetReservation(b.account, "r1", { known: false });
    expect(hold1.ok).toBe(true);
    if (!hold1.ok) return;
    const hold2 = cancelBudgetReservation(hold1.account, "r2", {
      known: false,
    });
    expect(hold2.ok).toBe(true);
    if (!hold2.ok) return;
    expect(hold2.account.heldMinor).toBe(500);

    const stale = { ...hold2.account, heldMinor: 0 };
    const resolved = cancelBudgetReservation(stale, "r1", {
      known: true,
      actualMinor: 90,
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.account.heldMinor).toBe(200);
    expect(resolved.account.heldMinor).toBeGreaterThanOrEqual(0);
    expect(heldReservationsTotalMinor(resolved.account)).toBe(200);
    expect(isUnknownUsageHold(resolved.account, "r2")).toBe(true);
    expect(availableBudgetMinor(resolved.account)).toBe(710);
  });

  it("open unknown-cancel with stale heldMinor still stacks map sum", () => {
    const reserved = reserveBudget(account(), "r-a", 150);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-a", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const stale = { ...held.account, heldMinor: 0 };
    const next = reserveBudget(stale, "r-b", 100);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    // available uses map (150 hold) so 1000-150-100 reserved path...
    const heldB = cancelBudgetReservation(
      { ...next.account, heldMinor: 0 },
      "r-b",
      { known: false },
    );
    expect(heldB.ok).toBe(true);
    if (!heldB.ok) return;
    expect(heldB.account.heldMinor).toBe(250);
    expect(heldReservationsTotalMinor(heldB.account)).toBe(250);
    expect(availableBudgetMinor(heldB.account)).toBe(750);
  });

  it("unknown-hold replay normalizes stale heldMinor on returned account", () => {
    const reserved = reserveBudget(account(), "r-replay", 320);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-replay", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const stale = { ...held.account, heldMinor: 0 };
    const replay = cancelBudgetReservation(stale, "r-replay", { known: false });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.replayed).toBe(true);
    expect(replay.account.heldMinor).toBe(320);
    expect(listUnknownUsageHoldIds(replay.account)).toEqual(["r-replay"]);
  });

  it("settle open reservation while sibling hold remains intact", () => {
    const a = reserveBudget(account(), "r-hold", 400);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    const held = cancelBudgetReservation(a.account, "r-hold", { known: false });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const b = reserveBudget(held.account, "r-open", 100);
    expect(b.ok).toBe(true);
    if (!b.ok) return;
    const settled = settleBudget(b.account, "r-open", 55);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.account.settledMinor).toBe(55);
    expect(isUnknownUsageHold(settled.account, "r-hold")).toBe(true);
    expect(listUnknownUsageHoldIds(settled.account)).toEqual(["r-hold"]);
    expect(heldReservationsTotalMinor(settled.account)).toBe(400);
    expect(availableBudgetMinor(settled.account)).toBe(545);
  });

  it("corrupt zero/NaN map entries are not unknown holds; settle normalizes stale heldMinor", () => {
    const reserved = reserveBudget(account(), "r-real", 300);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-real", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const corrupt = {
      ...held.account,
      heldMinor: 0,
      heldReservations: {
        ...held.account.heldReservations,
        "ghost-zero": 0,
        "ghost-nan": Number.NaN,
      },
    };
    expect(isUnknownUsageHold(corrupt, "ghost-zero")).toBe(false);
    expect(isUnknownUsageHold(corrupt, "ghost-nan")).toBe(false);
    expect(isUnknownUsageHold(corrupt, "r-real")).toBe(true);
    expect(listUnknownUsageHoldIds(corrupt)).toEqual(["r-real"]);
    expect(heldReservationsTotalMinor(corrupt)).toBe(300);

    const next = reserveBudget(corrupt, "r-open", 50);
    expect(next.ok).toBe(true);
    if (!next.ok) return;
    expect(next.account.heldMinor).toBe(300);

    const settled = settleBudget(
      { ...next.account, heldMinor: 0 },
      "r-open",
      40,
    );
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    expect(settled.account.heldMinor).toBe(300);
    expect(availableBudgetMinor(settled.account)).toBe(660);
  });

  it("ghost-zero cancel is UNKNOWN_RESERVATION; normalize scrubs corrupt keys", () => {
    const reserved = reserveBudget(account(), "r-keep", 250);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const held = cancelBudgetReservation(reserved.account, "r-keep", {
      known: false,
    });
    expect(held.ok).toBe(true);
    if (!held.ok) return;
    const corrupt = {
      ...held.account,
      heldMinor: 999,
      heldReservations: {
        ...held.account.heldReservations,
        "ghost-zero": 0,
        "ghost-nan": Number.NaN,
      },
    };
    const ghostCancel = cancelBudgetReservation(corrupt, "ghost-zero", {
      known: false,
    });
    expect(ghostCancel.ok).toBe(false);
    if (ghostCancel.ok) return;
    expect(ghostCancel.code).toBe("UNKNOWN_RESERVATION");

    const scrubbed = normalizeBudgetHolds(corrupt);
    expect(scrubbed.heldMinor).toBe(250);
    expect(scrubbed.heldReservations).toEqual({ "r-keep": 250 });
    expect(listUnknownUsageHoldIds(scrubbed)).toEqual(["r-keep"]);
  });

  it("reserve reuses ghost-zero id; open cancel scrubs sibling ghosts", () => {
    const withGhost = {
      ...account(),
      heldMinor: 0,
      heldReservations: { "ghost-reuse": 0 as number },
    };
    const reserved = reserveBudget(withGhost, "ghost-reuse", 120);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(reserved.account.openReservations["ghost-reuse"]).toBe(120);
    expect(reserved.account.heldReservations["ghost-reuse"]).toBeUndefined();
    expect(reserved.account.heldMinor).toBe(0);

    const siblingGhost = {
      ...reserved.account,
      heldReservations: {
        ...reserved.account.heldReservations,
        "ghost-sib": 0,
        "ghost-nan": Number.NaN,
      },
    };
    const cancelled = cancelBudgetReservation(siblingGhost, "ghost-reuse", {
      known: false,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.costKind).toBe("unknown_hold");
    expect(cancelled.account.heldReservations).toEqual({ "ghost-reuse": 120 });
    expect(cancelled.account.heldMinor).toBe(120);
    expect(listUnknownUsageHoldIds(cancelled.account)).toEqual([
      "ghost-reuse",
    ]);
  });

  it("stale reservedMinor=0 with open map cannot invent capacity", () => {
    const reserved = reserveBudget(account(), "r-open", 400);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const stale = {
      ...reserved.account,
      reservedMinor: 0,
      openReservations: {
        ...reserved.account.openReservations,
        "ghost-open": 0,
      },
    };
    expect(openReservationsTotalMinor(stale)).toBe(400);
    expect(availableBudgetMinor(stale)).toBe(600);
    const blocked = reserveBudget(stale, "r-over", 700);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("BUDGET_EXHAUSTED");
      expect(blocked.availableMinor).toBe(600);
    }
    const scrubbed = normalizeBudgetHolds(stale);
    expect(scrubbed.reservedMinor).toBe(400);
    expect(scrubbed.openReservations).toEqual({ "r-open": 400 });
  });

  it("stale settledMinor=0 with settled map cannot invent capacity", () => {
    const reserved = reserveBudget(account(), "r-settle", 300);
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const settled = settleBudget(reserved.account, "r-settle", 180);
    expect(settled.ok).toBe(true);
    if (!settled.ok) return;
    const stale = {
      ...settled.account,
      settledMinor: 0,
    };
    expect(settledReservationsActualTotalMinor(stale)).toBe(180);
    expect(availableBudgetMinor(stale)).toBe(820);
    const blocked = reserveBudget(stale, "r-over", 900);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.code).toBe("BUDGET_EXHAUSTED");
      expect(blocked.availableMinor).toBe(820);
    }
    const normalized = normalizeBudgetHolds(stale);
    expect(normalized.settledMinor).toBe(180);
  });

  it("normalizeBudgetHolds preserves legacy scalar-only totals when maps empty (L15)", () => {
    const legacy = {
      ...createBudgetAccount({
        dayKey: "2026-11-17",
        currency: "USD",
        limitMinor: 2000,
      }),
      reservedMinor: 100,
      settledMinor: 220,
      heldMinor: 700,
      openReservations: {},
      heldReservations: {},
      settledReservations: {},
    };
    const normalized = normalizeBudgetHolds(legacy);
    expect(normalized.reservedMinor).toBe(100);
    expect(normalized.settledMinor).toBe(220);
    expect(normalized.heldMinor).toBe(700);
    expect(availableBudgetMinor(normalized)).toBe(980);
    const blocked = reserveBudget(legacy, "legacy-over", 990);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.availableMinor).toBe(980);
    }
  });

  it("legacy scalars when maps empty still constrain available", () => {
    const legacy = createBudgetAccount({
      dayKey: "2026-11-17",
      currency: "USD",
      limitMinor: 1000,
    });
  const withScalars = {
      ...legacy,
      reservedMinor: 200,
      settledMinor: 100,
      heldMinor: 150,
      openReservations: {},
      heldReservations: {},
      settledReservations: {},
    };
    expect(openReservationsTotalMinor(withScalars)).toBe(200);
    expect(heldReservationsTotalMinor(withScalars)).toBe(150);
    expect(settledReservationsActualTotalMinor(withScalars)).toBe(100);
    expect(availableBudgetMinor(withScalars)).toBe(550);
  });
});
