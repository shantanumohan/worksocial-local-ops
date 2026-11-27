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
    expect(joined).toMatch(/LIVE_TEMPORAL_CLAIM_REFUSED for TEMPORAL\+LOCAL_DURABLE/);
    expect(joined).toMatch(/FIXTURE_OK/);
    expect(joined).toMatch(/domainTemporal=NOT_WIRED/);
    expect(joined).toMatch(/VERIFIED_CLAIM_REFUSED for upgrade-to-verified label/);
    expect(joined).toMatch(/ACCEPTED_OK only/);
    expect(joined).toMatch(/EXTERNAL_EFFECTS_CLAIM_REFUSED/);
    expect(joined).toMatch(/LIVE_PROVIDER_SUCCESS_CLAIM_REFUSED/);
    expect(joined).toMatch(/CHATGPT_ADS_ACCESS_CLAIM_REFUSED/);
    expect(joined).toMatch(/SOFT_SKIP_ADS_OK for T-F07,T-US-013,T-US-014/);
    expect(joined).toMatch(/NOT_SOFT_SKIP_ADS_CASE/);
    expect(joined).toMatch(/RELATED_CASES_OK for T-X024 only/);
    expect(joined).toMatch(/CATALOG_CEILING_REFUSED/);
    expect(joined).toMatch(/Worker A self-renew while live ok/);
    expect(joined).toMatch(
      /Self-reclaim after own expiry before foreign ok attemptCount=2/,
    );
    expect(joined).toMatch(/UNFENCED_RECOVERY_NOT_FENCE_PROOF/);
    expect(joined).toMatch(
      /Active holder operation mismatch \(not fenceCause\)/,
    );
    expect(joined).toMatch(
      /Post-succeed lease cleared fenceCause=no_holder for A and B/,
    );
    expect(joined).toMatch(/Post-succeed claimLease refused/);
    expect(joined).toMatch(
      /1ms-before-expiry boundary: fenceCause=active isMissionLeaseActive=true/,
    );
    expect(joined).toMatch(/fenceCause=expired/);
    expect(joined).toMatch(/Expired-pre-reassignment A bind denied.*fenceCause=expired/);
    expect(joined).toMatch(/Expired-pre-reassignment A mark denied.*fenceCause=expired/);
    expect(joined).toMatch(
      /At-expiry mismatched holder fenceCause=wrong_holder \(not expired\)/,
    );
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
    expect(joined).toMatch(/Post-commit old A mark denied/);
    expect(joined).toContain("relatedCases=T-X024");
    expect(joined).toContain(
      `liveTemporalWiring=${OLD_FENCE_TEMPORAL_WIRING}`,
    );
    expect(joined).toContain("chatgptAdsAccess=ACCESS_BLOCKED");
    expect(joined).toContain("softSkipAds=T-F07,T-US-013,T-US-014");
    expect(joined).toContain("liveProviderSuccessClaimed=false");
    expect(joined).toContain("externalEffects=NONE");
    expect(joined).toContain("acceptedNotVerified=true");
    expect(joined).toMatch(/ACCEPTED_NOT_VERIFIED_OK/);
    expect(joined).toMatch(/ACCEPTED_EQUALS_VERIFIED_CLAIM_REFUSED/);
    expect(joined).toMatch(/LIVE_TEMPORAL_NOT_WIRED_OK/);
    expect(joined).toMatch(/LIVE_TEMPORAL_WIRED_CLAIM_REFUSED/);
    expect(joined).toMatch(/Post-fail lease cleared fenceCause=no_holder/);
    expect(joined).toMatch(/Post-fail claimLease refused/);
    expect(joined).toMatch(/COHORT2_MERGE_HOLD_OK/);
    expect(joined).toMatch(/ASSIGNED_COHORT_SLOT_OK/);
    expect(joined).toMatch(/Post-fail old B bind denied phase fence/);
    expect(joined).toMatch(/Post-fail old B mark denied phase fence/);
    expect(joined).toMatch(/ASSIGNED_CASE_OK/);
    expect(joined).toMatch(/ASSIGNED_CASE_REFUSED/);
    expect(joined).toMatch(/Post-succeed old A bind denied phase fence/);
    expect(joined).toMatch(/Post-succeed old A mark denied phase fence/);
    expect(joined).not.toMatch(/\bVERIFIED\b/);
    expect(OLD_FENCE_TEMPORAL_WIRING).toBe("NOT_WIRED");
  });
});
