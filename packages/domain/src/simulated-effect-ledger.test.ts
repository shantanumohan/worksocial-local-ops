import { describe, expect, it } from "vitest";
import { SimulatedEffectLedger } from "./simulated-effect-ledger.js";

describe("SimulatedEffectLedger", () => {
  it("records intent idempotently for the same digest", () => {
    const ledger = new SimulatedEffectLedger();
    const a = ledger.recordIntent("op-1", "digest-a", "2026-11-17T00:00:00.000Z");
    const b = ledger.recordIntent("op-1", "digest-a", "2026-11-17T00:01:00.000Z");
    expect(a).toEqual(b);
    expect(ledger.get("op-1")?.outcome).toBe("INTENDED");
  });

  it("rejects conflicting digests for one operation id", () => {
    const ledger = new SimulatedEffectLedger();
    ledger.recordIntent("op-1", "digest-a", "2026-11-17T00:00:00.000Z");
    expect(() =>
      ledger.recordIntent("op-1", "digest-b", "2026-11-17T00:01:00.000Z"),
    ).toThrow(/different payload digest/);
  });

  it("settles to verified", () => {
    const ledger = new SimulatedEffectLedger();
    ledger.recordIntent("op-2", "d2", "2026-11-17T00:00:00.000Z");
    ledger.settle("op-2", "VERIFIED");
    expect(ledger.hasVerified("op-2")).toBe(true);
  });

  it("rejects regressive outcomes after VERIFIED", () => {
    const ledger = new SimulatedEffectLedger();
    ledger.recordIntent("op-3", "d3", "2026-11-17T00:00:00.000Z");
    ledger.settle("op-3", "VERIFIED");
    expect(() => ledger.settle("op-3", "FAILED")).toThrow(/terminal/);
    expect(() => ledger.settle("op-3", "UNKNOWN_REMOTE_OUTCOME")).toThrow(
      /terminal/,
    );
    expect(ledger.hasVerified("op-3")).toBe(true);
    expect(ledger.settle("op-3", "VERIFIED").outcome).toBe("VERIFIED");
  });

  it("rejects weaker outcomes once a stronger non-terminal is set", () => {
    const ledger = new SimulatedEffectLedger();
    ledger.recordIntent("op-4", "d4", "2026-11-17T00:00:00.000Z");
    ledger.settle("op-4", "ACCEPTED_PENDING");
    expect(() => ledger.settle("op-4", "FAILED")).not.toThrow();
    // FAILED is ranked above ACCEPTED_PENDING; re-settle to UNKNOWN is regressive from FAILED
    const ledger2 = new SimulatedEffectLedger();
    ledger2.recordIntent("op-5", "d5", "2026-11-17T00:00:00.000Z");
    ledger2.settle("op-5", "FAILED");
    expect(() => ledger2.settle("op-5", "ACCEPTED_PENDING")).toThrow(/regress/);
  });
});
