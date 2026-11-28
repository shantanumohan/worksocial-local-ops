import { describe, expect, it } from "vitest";
import { proofCustomerDataEvalRedactionBlocks } from "./customer-eval-redaction-proof.js";

describe("proofCustomerDataEvalRedactionBlocks", () => {
  it("retip N115: proof bundle passes ON_TIP b2024cf8 (T-X072)", () => {
    const proof = proofCustomerDataEvalRedactionBlocks(
      "2026-11-28T00:45:00.000Z",
    );
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);
    expect(proof.details.at(-1)).toMatch(/externalEffects=NONE/);
  });
});
