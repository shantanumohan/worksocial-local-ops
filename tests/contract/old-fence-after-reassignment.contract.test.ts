/**
 * Contract: T-X024 old fence after reassignment (edge honesty deepen O4).
 * Fixture ACCEPTED ≠ VERIFIED. Temporal NOT_WIRED. Soft-skip Ads.
 * External effects NONE. Catalog ≤ T-X073.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
  SoakProofKind,
} from "@worksocial/domain";
import {
  evaluateFixtureTemporalWiring,
  evaluateOldFenceAcceptanceLabel,
  missionLeaseFenceFailedMessage,
  parseMissionLeaseFenceCause,
  OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS,
  OLD_FENCE_HONESTY,
} from "@worksocial/persistence";

const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  here,
  "../acceptance-evidence/fixture/art-fixture-t-x024.json",
);

describe("contract: T-X024 old fence after reassignment", () => {
  it("maps only OLD_FENCE_AFTER_REASSIGNMENT ↔ T-X024", () => {
    expect(expectedProofsForFixtureCase("T-X024")).toEqual([
      SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT),
    ).toEqual(["T-X024"]);
    expect([...OLD_FENCE_AFTER_REASSIGNMENT_RELATED_CASE_IDS]).toEqual([
      "T-X024",
    ]);
  });

  it("keeps fixture honesty edges (ACCEPTED≠VERIFIED; Ads soft-skip; NOT_WIRED)", () => {
    expect(OLD_FENCE_HONESTY.acceptedNotVerified).toBe(true);
    expect(OLD_FENCE_HONESTY.liveTemporalWiring).toBe("NOT_WIRED");
    expect(OLD_FENCE_HONESTY.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(OLD_FENCE_HONESTY.externalEffects).toBe("NONE");
    expect(OLD_FENCE_HONESTY.liveProviderSuccessClaimed).toBe(false);
    expect([...OLD_FENCE_HONESTY.softSkipAdsCases]).toEqual([
      "T-F07",
      "T-US-013",
      "T-US-014",
    ]);

    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      caseId: string;
      summary: string;
      status?: string;
    };
    expect(art.caseId).toBe("T-X024");
    expect(evaluateFixtureTemporalWiring("TEMPORAL").code).toBe(
      "LIVE_TEMPORAL_CLAIM_REFUSED",
    );
    expect(evaluateFixtureTemporalWiring("FIXTURE").code).toBe("FIXTURE_OK");
    expect(evaluateOldFenceAcceptanceLabel("ACCEPTED").code).toBe("ACCEPTED_OK");
    expect(evaluateOldFenceAcceptanceLabel("VERIFIED").code).toBe(
      "VERIFIED_CLAIM_REFUSED",
    );
    expect(
      parseMissionLeaseFenceCause(
        missionLeaseFenceFailedMessage("wf-c", "wrong_holder"),
      ),
    ).toBe("wrong_holder");

    expect(art.summary).toMatch(/LIVE_TEMPORAL_CLAIM_REFUSED/);
    expect(art.summary).toMatch(/FIXTURE_OK/);
    expect(art.summary).toMatch(/VERIFIED_CLAIM_REFUSED/);
    expect(art.summary).toMatch(/ACCEPTED_OK/);
    expect(art.summary).toMatch(/1ms-before-expiry boundary/);
    expect(art.summary).toMatch(/fenceCause=expired/);
    expect(art.summary).toMatch(/fenceCause=wrong_holder/);
    expect(art.summary).toMatch(/Post-commit old A mark denied/);
    expect(art.summary).toMatch(/softSkipAds=T-F07,T-US-013,T-US-014/);
    expect(art.summary).toMatch(/liveTemporalWiring=NOT_WIRED/);
    expect(art.summary).toMatch(/acceptedNotVerified=true/);
    expect(art.summary).toMatch(/chatgptAdsAccess=ACCESS_BLOCKED/);
    expect(art.summary).not.toMatch(/\bVERIFIED\b/);
    if (art.status) {
      expect(art.status).not.toBe("VERIFIED");
    }
  });
});
