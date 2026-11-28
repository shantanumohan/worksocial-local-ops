import { describe, expect, it } from "vitest";
import { proofCustomerDataEvalRedactionBlocks } from "./customer-eval-redaction-proof.js";

describe("proofCustomerDataEvalRedactionBlocks", () => {
  it("retip N129: proof bundle passes ON_TIP b106092f (T-X072)", () => {
    const proof = proofCustomerDataEvalRedactionBlocks(
      "2026-11-28T03:15:00.000Z",
    );
    expect(proof.passed, proof.details.join(" | ")).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);
    expect(proof.details.at(-1)).toMatch(/externalEffects=NONE/);
  });
});
