/**
 * Contract: T-X023 eventual consistency false not-found honesty.
 * ACCEPTED ≠ VERIFIED. externalEffects NONE. Zoho NOT_WIRED. Ads ACCESS_BLOCKED.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CRM_CHATGPT_ADS_ACCESS,
  CRM_EVENTUAL_CONSISTENCY_RELATED_CASE_IDS,
  CRM_LIVE_ZOHO_WIRING,
  SoakProofKind,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixPath = resolve(root, "tests/acceptance-matrix-v6.json");
const artPath = resolve(
  root,
  "tests/acceptance-evidence/fixture/art-fixture-t-x023.json",
);

describe("contract: T-X023 eventual consistency false not-found", () => {
  it("maps proof kind 1:1 to T-X023 and pins honesty constants", () => {
    expect(CRM_EVENTUAL_CONSISTENCY_RELATED_CASE_IDS).toEqual(["T-X023"]);
    expect(CRM_LIVE_ZOHO_WIRING).toBe("NOT_WIRED");
    expect(CRM_CHATGPT_ADS_ACCESS).toBe("ACCESS_BLOCKED");
    expect(expectedProofsForFixtureCase("T-X023")).toEqual([
      SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND,
      ),
    ).toEqual(["T-X023"]);
  });

  it("matrix evidenceNote stays fixture-honest (ACCEPTED ≠ VERIFIED)", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      cases: Array<{ id: string; status: string; evidenceNote?: string }>;
    };
    const row = matrix.cases.find((c) => c.id === "T-X023");
    expect(row?.status).toBe("ACCEPTED");
    expect(row?.evidenceNote).toMatch(/EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND/);
    expect(row?.evidenceNote).toMatch(/NOT_WIRED/);
    expect(row?.evidenceNote).toMatch(/ACCESS_BLOCKED|chatgptAdsAccess/);
    expect(row?.evidenceNote).toMatch(/externalEffects\s*=\s*NONE/i);
    expect(row?.evidenceNote).toMatch(/liveProviderSuccessClaimed\s*=\s*false/i);
    expect(row?.evidenceNote).toMatch(/recordId|durable/i);
    expect(row?.evidenceNote).toMatch(/ACCEPTED\s*≠|ACCEPTED ≠/);
  });

  it("fixture art summary stays Ads-blocked and non-VERIFIED", () => {
    const art = JSON.parse(readFileSync(artPath, "utf8")) as {
      caseId: string;
      summary: string;
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
    };
    expect(art.caseId).toBe("T-X023");
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toMatch(/ACCESS_BLOCKED|chatgptAdsAccess=ACCESS_BLOCKED/);
    expect(art.summary).toMatch(/NOT_WIRED/);
    expect(art.summary).toMatch(/ACCEPTED≠VERIFIED|ACCEPTED ≠ VERIFIED/);
  });
});
