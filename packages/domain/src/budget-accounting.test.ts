import { describe, expect, it } from "vitest";
import {
  availableBudgetMinor,
  BUDGET_RESERVATION_LIVE_WIRING,
  cancelBudgetReservation,
  committedBudgetMinor,
  composeConcurrentFinalBudgetReserves,
  createBudgetAccount,
  isConcurrentBudgetCompositionHonest,
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
