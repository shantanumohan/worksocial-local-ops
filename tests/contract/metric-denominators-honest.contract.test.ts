/**
 * Contract: T-X039 / T-US-058 metric denominators honesty.
 * ACCEPTED ≠ VERIFIED. externalEffects NONE. live metrics NOT_WIRED. Ads ACCESS_BLOCKED.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  METRIC_LIVE_WIRING,
  SoakProofKind,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixPath = resolve(root, "tests/acceptance-matrix-v6.json");
const artPath = resolve(
  root,
  "tests/acceptance-evidence/fixture/art-fixture-t-x039.json",
);

describe("contract: T-X039 / T-US-058 metric denominators honest", () => {
  it("maps proof kind to T-X039 and T-US-058", () => {
    expect(METRIC_LIVE_WIRING).toBe("NOT_WIRED");
    expect(expectedProofsForFixtureCase("T-X039")).toEqual([
      SoakProofKind.METRIC_DENOMINATORS_HONEST,
    ]);
    expect(expectedProofsForFixtureCase("T-US-058")).toEqual([
      SoakProofKind.METRIC_DENOMINATORS_HONEST,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.METRIC_DENOMINATORS_HONEST),
    ).toEqual(["T-X039", "T-US-058"]);
  });

  it("matrix evidenceNote stays fixture-honest", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      cases: Array<{ id: string; status: string; evidenceNote?: string }>;
    };
    for (const id of ["T-X039", "T-US-058"] as const) {
      const row = matrix.cases.find((c) => c.id === id);
      expect(row?.status).toBe("ACCEPTED");
      expect(row?.evidenceNote).toMatch(/METRIC_DENOMINATORS_HONEST/i);
      expect(row?.evidenceNote).toMatch(/NOT_WIRED/i);
      expect(row?.evidenceNote).toMatch(/non_finite/i);
      expect(row?.evidenceNote).toMatch(/insufficient_sample/i);
      expect(row?.evidenceNote).toMatch(/unsupported|partial/i);
      expect(row?.evidenceNote).toMatch(/MEASURED|countsInDenominator/i);
      expect(row?.evidenceNote).toMatch(/null sampleSize|non_finite/i);
      expect(row?.evidenceNote).toMatch(/missingCount|UNAVAILABLE_AS_ZERO/i);
      expect(row?.evidenceNote).toMatch(/minSample/i);
      expect(row?.evidenceNote).toMatch(/unavailableCount|non-finite minSample/i);
      expect(row?.evidenceNote).toMatch(/excludedCount/i);
      expect(row?.evidenceNote).toMatch(/ACCEPTED\s*≠|ACCEPTED ≠/);
    }
  });

  it("fixture art summary stays non-VERIFIED", () => {
    const art = JSON.parse(readFileSync(artPath, "utf8")) as {
      caseId: string;
      summary: string;
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
    };
    expect(art.caseId).toBe("T-X039");
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toMatch(/ACCESS_BLOCKED|chatgptAdsAccess/);
    expect(art.summary).toMatch(/NOT_WIRED/);
  });
});