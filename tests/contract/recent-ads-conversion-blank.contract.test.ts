/**
 * Contract: T-X036 recent Ads conversion blank → PENDING (hillclimb).
 * Additive coverage around domain attack suite + soak map honesty.
 * ACCEPTED ≠ VERIFIED. External effects NONE. Live wiring NOT_WIRED.
 * Soft-skip ChatGPT Ads connect trio (T-F07 / T-US-013 / T-US-014).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  RECENT_ADS_CONVERSION_RELATED_CASE_IDS,
  SoakProofKind,
  evaluateRecentAdsConversionAttackSuite,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import {
  compileAcceptanceEvidence,
  createSoakService,
  runSoakRecoveryHarness,
} from "@worksocial/soak";

/** Same fixture clock as m9 soak contracts (after-hours coverage windows). */
const now = "2026-11-21T19:00:00.000Z";

describe("contract: T-X036 recent Ads conversion blank", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx036-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("attack suite covers blank/NaN/unsettled with NOT_WIRED honesty", () => {
    const suite = evaluateRecentAdsConversionAttackSuite();
    expect(suite.passed).toBe(true);
    expect(
      suite.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect(
      suite.details.some((d) => /never expose displayValue=0/i.test(d)),
    ).toBe(true);
    expect([...RECENT_ADS_CONVERSION_RELATED_CASE_IDS]).toEqual(["T-X036"]);
    expect(expectedProofsForFixtureCase("T-X036")).toEqual([
      SoakProofKind.RECENT_ADS_CONVERSION_BLANK_PENDING,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.RECENT_ADS_CONVERSION_BLANK_PENDING,
      ),
    ).toEqual(["T-X036"]);
  });

  it("harness + compiler mark T-X036 fixture ACCEPTED, never VERIFIED", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: now,
    });
    expect(harness.allPassed).toBe(true);
    const proof = harness.proofs.find(
      (p) => p.kind === SoakProofKind.RECENT_ADS_CONVERSION_BLANK_PENDING,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) =>
        /PENDING|not false zero|NOT_WIRED|PARTIAL_SPEND/i.test(d),
      ),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);

    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T19:01:00.000Z",
      runId: "soak-tx036-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X036");
    expect(row?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(row?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(row?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(compiled.chatgptAds.allowed).toBe(false);
    expect(compiled.blockedLiveVerified).toBe(true);

    const soak = createSoakService(createFileSoakStore(dir));
    const run = await soak.runFixtureSoak({ harnessNowIso: now });
    expect(run.ok).toBe(true);
    expect(run.run.externalEffects).toBe("NONE");
    expect(run.run.liveWiring.cms).toBe("NOT_WIRED");
    const tx036 = run.run.caseResults.find((c) => c.caseId === "T-X036");
    expect(tx036?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx036?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx036?.status).toUpperCase()).not.toBe("VERIFIED");
  });
});
