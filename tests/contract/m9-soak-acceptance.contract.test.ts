/**
 * Contract: M9 soak proofs + evidence compiler honesty.
 * Fixture ≠ sandbox ≠ prod. Ads blocked. No silent live VERIFIED.
 * T-X066 stays NOT_RUN until backup/omit-receipt proof exists.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  PilotGateStatus,
  SOAK_FIXTURE_CASE_IDS,
  validateAcceptanceCaseStatus,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import {
  compileAcceptanceEvidence,
  createSoakService,
  runSoakRecoveryHarness,
} from "@worksocial/soak";

describe("contract: M9 soak / acceptance evidence", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-m9-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("proves crash-restart without duplicate effects and compiles fixture ACCEPTED", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: "2026-11-21T19:00:00.000Z",
    });
    expect(harness.allPassed).toBe(true);

    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T19:01:00.000Z",
      runId: "soak-contract-1",
    });
    expect(compiled.chatgptAds.allowed).toBe(false);
    expect(compiled.blockedLiveVerified).toBe(true);

    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const row = compiled.caseResults.find((c) => c.caseId === id);
      expect(row?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
      expect(row?.environment).toBe(AcceptanceEnvironment.FIXTURE);
      expect(row?.artifactId).toBeTruthy();
      const check = validateAcceptanceCaseStatus({
        status: row!.status,
        environment: row!.environment,
        evidenceArtifactId: row!.artifactId,
      });
      expect(check.ok).toBe(true);
    }

    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X066");

    const soak = createSoakService(createFileSoakStore(dir));
    const run = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T19:00:00.000Z",
    });
    expect(run.ok).toBe(true);
    expect(run.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(run.run.pilotGate.serverObservationsOnly).toBe(true);
    expect(run.run.r1CompleteClaimed).toBe(false);
    expect(run.run.liveWiring.cms).toBe("NOT_WIRED");
    expect(
      run.run.caseResults.every((c) => c.caseId !== "T-X066"),
    ).toBe(true);
  });

  it("rejects silent VERIFIED status for live claims", () => {
    const bad = validateAcceptanceCaseStatus({
      status: "VERIFIED",
      environment: AcceptanceEnvironment.AUTHORIZED_PRODUCTION,
      evidenceArtifactId: "x",
    });
    expect(bad.ok).toBe(false);
  });
});
