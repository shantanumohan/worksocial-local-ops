/**
 * T-X024 old-fence hillclimb — soak proof assertions.
 * Fixture only. ACCEPTED ≠ VERIFIED. externalEffects NONE. Temporal NOT_WIRED.
 */

import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import {
  OLD_FENCE_TEMPORAL_WIRING,
  proofOldFenceAfterReassignment,
} from "./old-fence-after-reassignment-proof.js";

describe("proofOldFenceAfterReassignment (T-X024)", () => {
  it("passes with exact-expiry, reclaim refuse, and honesty markers", async () => {
    const proof = await proofOldFenceAfterReassignment(
      "2026-11-21T18:00:00.000Z",
    );

    expect(proof.kind).toBe(SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT);
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);

    const joined = proof.details.join(" | ");
    expect(joined).toMatch(/Exact expiry boundary/);
    expect(joined).toMatch(/Expired-pre-reassignment A bind denied/);
    expect(joined).toMatch(/attemptCount=2/);
    expect(joined).toMatch(/Old worker A reclaim refused/);
    expect(joined).toMatch(/Old worker A bind denied/);
    expect(joined).toMatch(/Worker B commit ok/);
    expect(joined).toMatch(/Post-commit old A bind denied/);
    expect(joined).toContain(
      `liveTemporalWiring=${OLD_FENCE_TEMPORAL_WIRING}`,
    );
    expect(joined).toContain("liveProviderSuccessClaimed=false");
    expect(joined).toContain("externalEffects=NONE");
    expect(OLD_FENCE_TEMPORAL_WIRING).toBe("NOT_WIRED");
  });
});
