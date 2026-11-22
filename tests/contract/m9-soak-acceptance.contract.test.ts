/**
 * Contract: M9 soak proofs + evidence compiler honesty.
 * Fixture ≠ sandbox ≠ prod. Ads blocked. No silent live VERIFIED.
 * T-X066 fixture ACCEPTED only via BACKUP_OMIT_RECEIPT (not live VERIFIED).
 * T-F24 / T-US-047 fixture ACCEPTED only via RECOVER_ROTATE_RECONCILE.
 * T-US-002 / T-X002 fixture ACCEPTED only via COMPETING_SUPERVISOR_LEASE.
 * T-X018 / T-US-054 fixture ACCEPTED only via SELF_APPROVAL_REJECTED.
 * T-X073 fixture ACCEPTED only via OFFBOARD_ACTIVE_TOKEN_RESIDUAL.
 * T-US-060 fixture ACCEPTED only via EMERGENCY_STOP_AT_COMMIT.
 * T-X005 fixture ACCEPTED only via FORGED_BROWSER_ROLE_IGNORED.
 * T-X006 fixture ACCEPTED only via CROSS_WORKSPACE_REFERENCE_DENIED.
 * T-X019/T-US-036 fixture ACCEPTED only via APPROVED_PAYLOAD_EDIT_INVALIDATED. */import { describe, expect, it, beforeEach, afterEach } from "vitest";
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

    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X066");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X016");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X065");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X063");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-F24");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-047");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-002");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X002");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X018");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-054");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X073");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-060");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X005");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X006");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X019");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-036");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X029");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-057");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-024");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-042");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X057");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-044");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X053");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-018");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X037");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X058");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X069");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X038");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X039");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-058");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-046");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X048");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-010");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X033");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-008");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X032");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X031");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-040");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X049");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X017");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X024");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X011");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X003");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X050");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X009");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X015");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X001");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X021");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X008");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X012");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X007");

    const soak = createSoakService(createFileSoakStore(dir));
    const run = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T19:00:00.000Z",
    });
    expect(run.ok).toBe(true);
    expect(run.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(run.run.pilotGate.serverObservationsOnly).toBe(true);
    expect(run.run.r1CompleteClaimed).toBe(false);
    expect(run.run.liveWiring.cms).toBe("NOT_WIRED");
    const tx066 = run.run.caseResults.find((c) => c.caseId === "T-X066");
    expect(tx066?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx066?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx066?.status).toUpperCase()).not.toBe("VERIFIED");
    const tf24 = run.run.caseResults.find((c) => c.caseId === "T-F24");
    expect(tf24?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tf24?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-US-047")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-US-002")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-X002")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-X018")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-US-054")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-X073")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-US-060")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
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
