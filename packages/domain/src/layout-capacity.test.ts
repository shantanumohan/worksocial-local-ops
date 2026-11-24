import { describe, expect, it } from "vitest";
import {
  RoomLayout,
  effectiveCapacityForLayout,
  filterByLayoutCapacity,
  filterInventoryByLayoutCapacity,
  parseLayoutRequest,
  parseRequestedLayout,
} from "./layout-capacity.js";

describe("layout-capacity (T-X047)", () => {
  const hudson = {
    entryId: "hudson",
    defaultCapacity: 40,
    layoutCapacities: {
      [RoomLayout.THEATER]: 40,
      [RoomLayout.CLASSROOM]: 12,
      [RoomLayout.BOARDROOM]: 8,
    },
  };

  it("parses explicit layout phrases only", () => {
    expect(parseRequestedLayout("classroom seating for 20")).toBe(
      RoomLayout.CLASSROOM,
    );
    expect(parseRequestedLayout("theatre layout for 30")).toBe(
      RoomLayout.THEATER,
    );
    expect(parseRequestedLayout("board-room setup for 6")).toBe(
      RoomLayout.BOARDROOM,
    );
    expect(parseRequestedLayout("meeting for 8")).toBeNull();
    expect(parseRequestedLayout("Hudson Boardroom for 8")).toBeNull();
  });

  it("marks multi-layout phrases ambiguous", () => {
    const amb = parseLayoutRequest(
      "classroom seating and theater layout for 20",
    );
    expect(amb.status).toBe("ambiguous");
  });

  it("uses layout-specific capacity, not marketing max", () => {
    const classroom = effectiveCapacityForLayout({
      defaultCapacity: hudson.defaultCapacity,
      layoutCapacities: hudson.layoutCapacities,
      requestedLayout: RoomLayout.CLASSROOM,
    });
    expect(classroom).toMatchObject({
      capacity: 12,
      layoutUsed: RoomLayout.CLASSROOM,
      source: "layout_specific",
      maxWouldOverstate: true,
      missingLayoutCapacity: false,
    });
  });

  it("fails closed when requested layout capacity is absent", () => {
    const missing = effectiveCapacityForLayout({
      defaultCapacity: 40,
      layoutCapacities: { [RoomLayout.THEATER]: 40 },
      requestedLayout: RoomLayout.CLASSROOM,
    });
    expect(missing).toMatchObject({
      capacity: 0,
      source: "missing_layout_capacity",
      missingLayoutCapacity: true,
      maxWouldOverstate: true,
    });
  });

  it("filters classroom mismatch even when theater/default would fit", () => {
    const mismatch = filterByLayoutCapacity({
      entryId: hudson.entryId,
      defaultCapacity: hudson.defaultCapacity,
      layoutCapacities: hudson.layoutCapacities,
      requestedLayout: RoomLayout.CLASSROOM,
      people: 20,
    });
    expect(mismatch.allowed).toBe(false);
    expect(mismatch.effectiveCapacity).toBe(12);
    expect(mismatch.defaultWouldAllowMismatch).toBe(true);
    expect(mismatch.filterTrace).toMatch(/wrongly allow/);
  });

  it("counterfactual uses other layout maxima when default is lower", () => {
    const mismatch = filterByLayoutCapacity({
      entryId: "room",
      defaultCapacity: 10,
      layoutCapacities: {
        [RoomLayout.CLASSROOM]: 12,
        [RoomLayout.THEATER]: 40,
      },
      requestedLayout: RoomLayout.CLASSROOM,
      people: 20,
    });
    expect(mismatch.allowed).toBe(false);
    expect(mismatch.defaultWouldAllowMismatch).toBe(true);
  });

  it("allows when layout-specific capacity fits", () => {
    const ok = filterByLayoutCapacity({
      entryId: hudson.entryId,
      defaultCapacity: hudson.defaultCapacity,
      layoutCapacities: hudson.layoutCapacities,
      requestedLayout: RoomLayout.CLASSROOM,
      people: 10,
    });
    expect(ok.allowed).toBe(true);
    expect(ok.effectiveCapacity).toBe(12);
  });

  it("filters inventory to layout-correct rooms only", () => {
    const exchange = {
      entryId: "exchange",
      defaultCapacity: 24,
      layoutCapacities: {
        [RoomLayout.CLASSROOM]: 24,
        [RoomLayout.THEATER]: 30,
      },
    };
    const result = filterInventoryByLayoutCapacity({
      entries: [hudson, exchange],
      requestedLayout: RoomLayout.CLASSROOM,
      people: 20,
    });
    expect(result.allowed.map((e) => e.entryId)).toEqual(["exchange"]);
    expect(result.excluded.map((e) => e.entryId)).toEqual(["hudson"]);
    expect(result.excluded[0]?.filter.defaultWouldAllowMismatch).toBe(true);
  });

  it("excludes boardroom over boardroom cap while marketing max would allow", () => {
    const over = filterByLayoutCapacity({
      entryId: hudson.entryId,
      defaultCapacity: hudson.defaultCapacity,
      layoutCapacities: hudson.layoutCapacities,
      requestedLayout: RoomLayout.BOARDROOM,
      people: 20,
    });
    expect(over.allowed).toBe(false);
    expect(over.effectiveCapacity).toBe(8);
    expect(over.defaultWouldAllowMismatch).toBe(true);
  });

  it("admits theatre seating within theater layout capacity", () => {
    expect(parseRequestedLayout("theatre seating for 30")).toBe(
      RoomLayout.THEATER,
    );
    const ok = filterByLayoutCapacity({
      entryId: hudson.entryId,
      defaultCapacity: hudson.defaultCapacity,
      layoutCapacities: hudson.layoutCapacities,
      requestedLayout: RoomLayout.THEATER,
      people: 30,
    });
    expect(ok.allowed).toBe(true);
    expect(ok.effectiveCapacity).toBe(40);
  });
});
