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
  it("passes with fenceCause classify, self-renew, and honesty markers", async () => {
    const proof = await proofOldFenceAfterReassignment(
      "2026-11-21T18:00:00.000Z",
    );

    expect(proof.kind).toBe(SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT);
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);

    const joined = proof.details.join(" | ");
    expect(joined).toMatch(/Worker A self-renew while live ok/);
    expect(joined).toMatch(/fenceCause=expired/);
    expect(joined).toMatch(/Expired-pre-reassignment A bind denied.*fenceCause=expired/);
    expect(joined).toMatch(/attemptCount=3/);
    expect(joined).toMatch(/expired≠wrong_holder/);
    expect(joined).toMatch(/Old worker A reclaim refused/);
    expect(joined).toMatch(/Old worker A bind denied.*fenceCause=wrong_holder/);
    expect(joined).toMatch(
      /Old worker A markEffectPending denied.*fenceCause=wrong_holder/,
    );
    expect(joined).toMatch(/Post-bind old A mark denied.*fenceCause=wrong_holder/);
    expect(joined).toMatch(/Worker B commit ok/);
    expect(joined).toMatch(/Post-commit old A bind denied/);
    expect(joined).toContain("relatedCases=T-X024");
    expect(joined).toContain(
      `liveTemporalWiring=${OLD_FENCE_TEMPORAL_WIRING}`,
    );
    expect(joined).toContain("softSkipAds=T-F07,T-US-013,T-US-014");
    expect(joined).toContain("liveProviderSuccessClaimed=false");
    expect(joined).toContain("externalEffects=NONE");
    expect(OLD_FENCE_TEMPORAL_WIRING).toBe("NOT_WIRED");
  });
});
