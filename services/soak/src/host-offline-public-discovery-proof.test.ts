/**
 * T-X071 host-offline public discovery — soak proof assertions.
 * Fixture only. ACCEPTED ≠ VERIFIED. externalEffects NONE. NOT_WIRED.
 */

import { describe, expect, it } from "vitest";
import { SoakProofKind } from "@worksocial/domain";
import { proofHostOfflinePublicDiscoveryUnavailable } from "./host-offline-public-discovery-proof.js";

describe("proofHostOfflinePublicDiscoveryUnavailable (T-X071)", () => {
  it("passes with surface sweep and honesty markers", () => {
    const proof = proofHostOfflinePublicDiscoveryUnavailable(
      "2026-11-21T18:00:00.000Z",
    );

    expect(proof.kind).toBe(
      SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    );
    expect(proof.passed).toBe(true);
    expect(proof.fixtureOnly).toBe(true);
    expect(proof.applyAttemptCount).toBe(1);

    const joined = proof.details.join(" | ");
    expect(joined).toMatch(/Host ONLINE \+ prior success → AVAILABLE/);
    expect(joined).toMatch(/HOST_ONLINE_NO_PRIOR_UNAVAILABLE/);
    expect(joined).toMatch(/geo_presence\+chatgpt_business\+public_visibility/);
    expect(joined).toMatch(/CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED/);
    expect(joined).toMatch(/liveProviderWiring=NOT_WIRED/);
    expect(joined).toMatch(/externalEffects=NONE/);
    expect(joined).toMatch(/liveProviderSuccessClaimed=false/);
    expect(joined).toMatch(/chatgptAdsAccess=ACCESS_BLOCKED/);
    expect(joined).not.toMatch(/\bVERIFIED\b/);
    expect(proof.operationId).toMatch(/^op-tx071-/);
    expect(proof.proofId).toMatch(/^proof-host-offline-discovery-/);
    expect(proof.createdAtIso).toBe("2026-11-21T18:00:00.000Z");
    expect(proof.details.length).toBeGreaterThanOrEqual(4);
  });

  it("still passes when host was online with prior success (control in proof bundle)", () => {
    const proof = proofHostOfflinePublicDiscoveryUnavailable(
      "2026-11-21T18:00:00.000Z",
    );
    expect(proof.passed).toBe(true);
    expect(
      proof.details.some((d) => d.includes("activeCoverageClaimed=false")),
    ).toBe(true);
    expect(proof.details.some((d) => d.includes("prior success ignored"))).toBe(
      true,
    );
    expect(proof.details.every((d) => !/\bLIVE\b.*\bVERIFIED\b/.test(d))).toBe(
      true,
    );
    expect(
      proof.details.every((d) => !/stop_after_dispatch/i.test(d)),
    ).toBe(true);
  });
});