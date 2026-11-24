/**
 * Contract: T-X045 partial campaign destinations (hillclimb).
 * Additive coverage around domain attack suite + soak map honesty.
 * ACCEPTED ≠ VERIFIED. External effects NONE. Live wiring NOT_WIRED.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  PARTIAL_CAMPAIGN_DESTINATIONS_RELATED_CASE_IDS,
  SoakProofKind,
  evaluatePartialCampaignDestinationsAttackSuite,
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

describe("contract: T-X045 partial campaign destinations", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx045-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("attack suite covers mixed/pending/failed/blocked with NOT_WIRED honesty", () => {
    const suite = evaluatePartialCampaignDestinationsAttackSuite({
      nowIso: now,
    });
    expect(suite.passed).toBe(true);
    expect(
      suite.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect([...PARTIAL_CAMPAIGN_DESTINATIONS_RELATED_CASE_IDS]).toEqual([
      "T-X045",
    ]);
    expect(expectedProofsForFixtureCase("T-X045")).toEqual([
      SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE,
      ),
    ).toEqual(["T-X045"]);
  });

  it("harness + compiler mark T-X045 fixture ACCEPTED, never VERIFIED", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: now,
    });
    expect(harness.allPassed).toBe(true);
    const proof = harness.proofs.find(
      (p) =>
        p.kind === SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) =>
        /PARTIAL|Recoverable destinations|NOT_WIRED/i.test(d),
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
      runId: "soak-tx045-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X045");
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
    const tx045 = run.run.caseResults.find((c) => c.caseId === "T-X045");
    expect(tx045?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx045?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx045?.status).toUpperCase()).not.toBe("VERIFIED");
  });
});
