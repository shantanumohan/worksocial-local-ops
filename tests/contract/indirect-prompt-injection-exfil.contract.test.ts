/**
 * Contract: T-X063 indirect prompt-injection exfiltration (hillclimb).
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
  INDIRECT_PROMPT_INJECTION_RELATED_CASE_IDS,
  SoakProofKind,
  evaluateIndirectPromptInjectionAttackSuite,
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

describe("contract: T-X063 indirect prompt-injection exfil", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("attack suite denies all absolute exfil paths with NOT_WIRED honesty", () => {
    const suite = evaluateIndirectPromptInjectionAttackSuite();
    expect(suite.passed).toBe(true);
    expect([...INDIRECT_PROMPT_INJECTION_RELATED_CASE_IDS]).toEqual(["T-X063"]);
    expect(expectedProofsForFixtureCase("T-X063")).toEqual([
      SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).toEqual(["T-X063"]);
  });

  it("harness + compiler mark T-X063 fixture ACCEPTED, never VERIFIED", async () => {
    const harnessDir = mkdtempSync(join(tmpdir(), "ws-tx063-harness-"));
    dirs.push(harnessDir);
    const harness = await runSoakRecoveryHarness({
      stateDir: harnessDir,
      nowIso: now,
    });
    if (!harness.allPassed) {
      const failedKinds = harness.proofs
        .filter((p) => !p.passed)
        .map((p) => p.kind);
      expect(failedKinds, "runSoakRecoveryHarness proof failures").toEqual([]);
    }
    expect(harness.allPassed).toBe(true);
    const proof = harness.proofs.find(
      (p) =>
        p.kind === SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) => /Absolute exfil denied/i.test(d)),
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
      runId: "soak-tx063-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X063");
    expect(row?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(row?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(row?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(compiled.chatgptAds.allowed).toBe(false);
    expect(compiled.blockedLiveVerified).toBe(true);

    const soakDir = mkdtempSync(join(tmpdir(), "ws-tx063-soak-"));
    dirs.push(soakDir);
    const soak = createSoakService(createFileSoakStore(soakDir));
    const run = await soak.runFixtureSoak({ harnessNowIso: now });
    if (!run.ok) {
      const failedKinds = run.run.proofs
        .filter((p) => !p.passed)
        .map((p) => p.kind);
      expect(failedKinds, "runFixtureSoak harness proof failures").toEqual([]);
    }
    expect(run.ok).toBe(true);
    expect(run.run.externalEffects).toBe("NONE");
    expect(run.run.liveWiring.cms).toBe("NOT_WIRED");
    const tx063 = run.run.caseResults.find((c) => c.caseId === "T-X063");
    expect(tx063?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx063?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx063?.status).toUpperCase()).not.toBe("VERIFIED");
  });
});
