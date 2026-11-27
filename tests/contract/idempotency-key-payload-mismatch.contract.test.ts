/**
 * Contract: T-X022 idempotency key payload mismatch → Conflict.
 * ACCEPTED ≠ VERIFIED. externalEffects NONE. live NOT_WIRED. Ads soft-skip.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP,
  IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING,
} from "@worksocial/persistence";
import { SoakProofKind, expectedProofsForFixtureCase, mapProofToFixtureCases } from "@worksocial/domain";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixPath = resolve(root, "tests/acceptance-matrix-v6.json");
const artPath = resolve(
  root,
  "tests/acceptance-evidence/fixture/art-fixture-t-x022.json",
);

describe("contract: T-X022 idempotency key payload mismatch", () => {
  it("maps proof kind to T-X022 only", () => {
    expect(IDEMPOTENCY_PAYLOAD_MISMATCH_LIVE_WIRING).toBe("NOT_WIRED");
    expect([...IDEMPOTENCY_PAYLOAD_MISMATCH_ADS_SOFT_SKIP]).toEqual([
      "T-F07",
      "T-US-013",
      "T-US-014",
    ]);
    expect(expectedProofsForFixtureCase("T-X022")).toEqual([
      SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH),
    ).toEqual(["T-X022"]);
  });

  it("matrix evidenceNote stays IDEMPOTENCY_KEY_PAYLOAD_MISMATCH honest", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      cases: Array<{ id: string; status: string; evidenceNote?: string }>;
    };
    const row = matrix.cases.find((c) => c.id === "T-X022");
    expect(row?.status).toBe("ACCEPTED");
    expect(row?.evidenceNote).toMatch(/IDEMPOTENCY_KEY_PAYLOAD_MISMATCH/i);
    expect(row?.evidenceNote).toMatch(/Conflict/i);
    expect(row?.evidenceNote).toMatch(/applyCount=1|countApplyAttempts=1/i);
    expect(row?.evidenceNote).toMatch(/byte-exact/i);
    expect(row?.evidenceNote).toMatch(/Post-VERIFIED|post-VERIFIED/i);
    expect(row?.evidenceNote).toMatch(/Post-FAILED/i);
    expect(row?.evidenceNote).toMatch(/ACCEPTED\s*≠|ACCEPTED ≠/);
  });

  it("fixture art summary stays non-VERIFIED with Ads soft-skip", () => {
    const art = JSON.parse(readFileSync(artPath, "utf8")) as {
      caseId: string;
      summary: string;
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
      proofKinds: string[];
    };
    expect(art.caseId).toBe("T-X022");
    expect(art.proofKinds).toEqual(["idempotency_key_payload_mismatch"]);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toMatch(/NOT_WIRED/);
    expect(art.summary).toMatch(/chatgptAdsConnectSoftSkip/);
    expect(art.summary).toMatch(/ACCESS_BLOCKED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
  });
});