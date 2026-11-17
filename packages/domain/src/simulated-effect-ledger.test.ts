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
});
