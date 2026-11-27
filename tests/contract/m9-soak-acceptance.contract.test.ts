/**
 * Contract: M9 soak proofs + evidence compiler honesty.
 * Fixture ≠ sandbox ≠ prod. Ads blocked. No silent live VERIFIED.
 * T-X066 fixture ACCEPTED only via BACKUP_OMIT_RECEIPT (not live VERIFIED).
 * T-F24 / T-US-75 fixture ACCEPTED only via RECOVER_ROTATE_RECONCILE.
 * T-US-002 / T-X002 fixture ACCEPTED only via COMPETING_SUPERVISOR_LEASE.
 * T-X018 / T-US-75 fixture ACCEPTED only via SELF_APPROVAL_REJECTED.
 * T-X073 fixture ACCEPTED only via OFFBOARD_ACTIVE_TOKEN_RESIDUAL.
 * T-US-75 fixture ACCEPTED only via EMERGENCY_STOP_AT_COMMIT.
 * T-X005 fixture ACCEPTED only via FORGED_BROWSER_ROLE_IGNORED.
 * T-X006 fixture ACCEPTED only via CROSS_WORKSPACE_REFERENCE_DENIED.
 * T-X019/T-US-75 fixture ACCEPTED only via APPROVED_PAYLOAD_EDIT_INVALIDATED.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

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
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X041");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X042");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X046");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X047");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X051");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X043");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X004");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X025");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X016");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X065");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X063");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-F18");
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
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-023");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-025");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-026");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-027");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-028");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-029");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-030");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-031");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-033");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-034");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-035");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-049");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-050");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-024");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-041");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-032");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-042");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-043");
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
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X013");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X027");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X026");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X052");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X055");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X059");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-038");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-039");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X060");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X070");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X028");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X044");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X045");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-052");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X030");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-056");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X040");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-012");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-053");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-055");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-003");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-004");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-005");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-007");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-009");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-011");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-US-045");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X072");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X064");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X071");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X067");
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X036");

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
    const backupOmit = run.run.proofs.find(
      (p) => p.kind === "backup_omit_receipt",
    );
    expect(backupOmit?.passed).toBe(true);
    expect(
      backupOmit?.details.some((d) =>
        /Distinct from NO_DUPLICATE_EFFECTS/.test(d),
      ),
    ).toBe(true);
    expect(
      backupOmit?.details.some((d) => /NOT_WIRED/.test(d)),
    ).toBe(true);
    const tx047 = run.run.caseResults.find((c) => c.caseId === "T-X047");
    expect(tx047?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx047?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx047?.status).toUpperCase()).not.toBe("VERIFIED");
    const layoutCap = run.run.proofs.find(
      (p) => p.kind === "layout_specific_capacity_mismatch_filters",
    );
    expect(layoutCap?.passed).toBe(true);
    expect(
      layoutCap?.details.some((d) => /NOT_WIRED/.test(d)),
    ).toBe(true);
    expect(
      layoutCap?.details.some((d) =>
        /Distinct from HARD_SEARCH_CONSTRAINTS_NO_INVENTION/.test(d),
      ),
    ).toBe(true);
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
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-US-056")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      run.run.caseResults.find((c) => c.caseId === "T-US-043")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    const tx064 = run.run.caseResults.find((c) => c.caseId === "T-X064");
    expect(tx064?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx064?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx064?.status).toUpperCase()).not.toBe("VERIFIED");
  });

  it("rejects silent VERIFIED status for live claims", () => {
    const bad = validateAcceptanceCaseStatus({
      status: "VERIFIED",
      environment: AcceptanceEnvironment.AUTHORIZED_PRODUCTION,
      evidenceArtifactId: "x",
    });
    expect(bad.ok).toBe(false);
  });

  it("T-X029 fixture artifact names explicit rebind honesty (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x029.json",
    );
    const art = JSON.parse(readFileSync(artPath, "utf8")) as {
      artifactId: string;
      caseId: string;
      environment: string;
      redacted: boolean;
      summary: string;
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
      proofKinds: string[];
      evidenceRef: string;
      uniqueSourceArtifactId: string;
      createdAtIso: string;
    };
    expect(art.artifactId).toBe("art-fixture-t-x029");
    expect(art.createdAtIso).toMatch(/^2026-/);
    expect(art.uniqueSourceArtifactId).toMatch(/^art-fixture-t-x029-/);
    expect(art.evidenceRef).toBe("soak/evidence/art-fixture-t-x029.json");
    expect(art.caseId).toBe("T-X029");
    expect(art.environment).toBe("fixture");
    expect(art.redacted).toBe(true);
    expect(art.proofKinds).toEqual(["explicit_account_rebind"]);
    expect(art.summary).toMatch(/Fixture ACCEPTED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.summary).toContain("ACCEPTED≠VERIFIED");
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("REBIND_REQUIRED");
    expect(art.summary).toContain("ACCOUNT_IDENTITY_REQUIRED");
    expect(art.summary).toContain("LIVE_TRANSPORT_NOT_WIRED");
    expect(art.summary).toContain("liveProviderRevoke=NOT_WIRED");
    expect(art.summary).toContain("liveProviderWiring=NOT_WIRED");
    expect(art.summary).toContain("silentRefreshRejected=true");
    expect(art.summary).toContain("ACCOUNT_LABEL_REQUIRED");
    expect(art.summary).toContain("CONNECTION_ID_COLLISION");
    expect(art.summary).toContain("CONNECTION_ROTATED_AWAY");
    expect(art.summary).toContain("ROTATED_AWAY");
    expect(art.summary).toContain("SAME_ACCOUNT");
    expect(art.summary).toContain("catalogCaseId=T-X029");
    expect(art.summary).toContain("liveProviderRevocation=NOT_WIRED");
    expect(art.summary).toContain("proof=explicit_account_rebind");
    expect(art.summary).toContain("applyAttemptCount=1");
    expect(art.summary).toContain("Whitespace-only observedAccountLabel denied");
    expect(art.summary).toContain("Same-account rebind correctly denied");
    expect(art.summary).toContain("never silently VERIFIED for live");
    expect(art.summary).toContain("Audit retained and redacted");
    expect(art.summary).toContain("Measured broker putReference");
    expect(art.summary).toContain("Silent different-account rotate denied");
    expect(art.summary).toContain("Blank observedAccountLabel denied");
    expect(art.summary).toContain("Whitespace-trimmed account labels match");
    expect(art.summary).toContain("Case-fold account labels match");
    expect(art.summary).toContain("Blank/whitespace newAccountLabel denied");
    expect(art.summary).toContain("Fixture match with liveProviderWiring=WIRED");
    expect(art.summary).toContain("Explicit rebind complete");
    expect(art.summary).toContain("Successor connectionId collision rejected");
    expect(art.summary).toContain("Old connection leases denied");
    expect(art.summary).toContain("New connection lease granted");
    expect(art.summary).toContain("no secret material in records");
    expect(art.summary).toContain("Token rotates to different account");
    expect(art.summary).toContain("applyCount=1");
    expect(art.summary).toContain("not treated as transparent refresh");
    expect(art.summary).toContain("no silent different-account bind");
    expect(art.summary).toContain("intentional fold");
    expect(art.summary).toContain("no invented live revoke/rebind");
    expect(art.summary).toContain("use rotate for same-account refresh");
    expect(art.summary).toContain("liveProviderSuccessClaimed=false");
    expect(art.summary).toContain("honesty NOT_WIRED/NONE");
    expect(art.summary).toContain("silent SAME_ACCOUNT allowed");
    expect(art.summary).toContain("during rebind");
    expect(art.summary).toContain("Seeded connection");
    expect(art.summary).toMatch(/leaseId=lease-[0-9a-f-]+/);
    expect(art.summary).toContain("fixture-account-alpha");
    expect(art.summary).toContain("fixture-account-beta");
    expect(art.summary).toMatch(/conn-old-rebind-[0-9a-f]+→ROTATED_AWAY/);
    expect(art.summary).toContain("externalEffects=NONE liveProviderWiring=NOT_WIRED");
    expect(art.summary).toMatch(
      /Successor connectionId collision rejected \(CONNECTION_ID_COLLISION\)/,
    );
    expect(art.summary).toMatch(/conn-new-rebind-[0-9a-f]+/);
    expect(art.summary).toMatch(
      /Old connection leases denied \(CONNECTION_ROTATED_AWAY\)/,
    );
    expect(art.summary).toContain("honesty externalEffects=NONE");
    expect(art.summary).toContain(
      "ACCEPTED≠VERIFIED — never silently VERIFIED for live",
    );
    expect(art.summary).toContain("proof=explicit_account_rebind applyCount=1");
    expect(art.summary).toMatch(
      /Seeded connection=conn-old-rebind-[0-9a-f]+ account=fixture-account-alpha/,
    );
    expect(art.summary).toMatch(
      /Explicit rebind complete old=conn-old-rebind-[0-9a-f]+→ROTATED_AWAY new=conn-new-rebind-[0-9a-f]+ account=fixture-account-beta/,
    );
    expect(art.summary).toMatch(
      /silentRefreshRejected=true catalogCaseId=T-X029 liveProviderRevoke=NOT_WIRED externalEffects=NONE/,
    );
    expect(art.summary).toMatch(
      /Silent different-account rotate denied \(REBIND_REQUIRED\)/,
    );
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X029 \(Token rotates to different account\)/,
    );
    expect(art.summary).toMatch(
      /Blank observedAccountLabel denied \(ACCOUNT_IDENTITY_REQUIRED\) — no silent different-account bind/,
    );
    expect(art.summary).toMatch(
      /Measured broker putReference during rebind applyAttemptCount=1/,
    );
    expect(art.summary).toMatch(
      /New connection lease granted leaseId=lease-[0-9a-f-]+/,
    );
    expect(art.summary).toMatch(
      /proof=explicit_account_rebind applyCount=1 :: Seeded connection=/,
    );
    expect(art.summary).toMatch(
      /Whitespace-only observedAccountLabel denied \(ACCOUNT_IDENTITY_REQUIRED\)/,
    );
    expect(art.summary).toMatch(
      /Fixture match with liveProviderWiring=WIRED → LIVE_TRANSPORT_NOT_WIRED; no invented live revoke\/rebind/,
    );
    expect(art.summary).toMatch(
      /Same-account rebind correctly denied \(use rotate for same-account refresh\)/,
    );
    expect(art.summary).toMatch(
      /Silent different-account rotate denied \(REBIND_REQUIRED\) — not treated as transparent refresh/,
    );
    expect(art.summary).toMatch(
      /Whitespace-trimmed account labels match → silent SAME_ACCOUNT allowed; honesty externalEffects=NONE liveProviderWiring=NOT_WIRED/,
    );
    expect(art.summary).toMatch(
      /Case-fold account labels match → silent SAME_ACCOUNT \(intentional fold\)/,
    );
    expect(art.summary).toMatch(
      /Audit retained and redacted; no secret material in records/,
    );
    expect(art.summary).toMatch(
      /Blank\/whitespace newAccountLabel denied \(ACCOUNT_LABEL_REQUIRED\); honesty NOT_WIRED\/NONE/,
    );
    expect(art.summary).toMatch(
      /liveProviderRevocation=NOT_WIRED externalEffects=NONE liveProviderWiring=NOT_WIRED ACCEPTED≠VERIFIED — never silently VERIFIED for live/,
    );
    expect(art.summary).toMatch(
      /liveProviderSuccessClaimed=false externalEffects=NONE$/,
    );
    expect(art.summary).toMatch(
      /Successor connectionId collision rejected \(CONNECTION_ID_COLLISION\) \| Old connection leases denied/,
    );
    expect(art.summary).toMatch(
      /Old connection leases denied \(CONNECTION_ROTATED_AWAY\) \| New connection lease granted/,
    );
    expect(art.summary).toMatch(
      /conn-old-rebind-([0-9a-f]+)→ROTATED_AWAY new=conn-new-rebind-\1 account=fixture-account-beta/,
    );
    expect(art.summary).toMatch(
      /not treated as transparent refresh \| Blank observedAccountLabel denied/,
    );
    expect(art.summary).toMatch(
      /for live\nliveProviderSuccessClaimed=false externalEffects=NONE/,
    );
    expect(art.summary).toMatch(
      /applyAttemptCount=1 \| Successor connectionId collision rejected/,
    );
    expect(art.summary).toMatch(
      /no silent different-account bind \| Whitespace-only observedAccountLabel denied/,
    );
    expect(art.summary).toMatch(
      /account=fixture-account-beta \| silentRefreshRejected=true catalogCaseId=T-X029/,
    );
    expect(art.summary).toMatch(
      /during rebind applyAttemptCount=1 \| Successor connectionId collision rejected \(CONNECTION_ID_COLLISION\)/,
    );
    expect(art.summary).toMatch(
      /\(ACCOUNT_IDENTITY_REQUIRED\) \| Whitespace-trimmed account labels match/,
    );
    expect(art.summary).toMatch(
      /no secret material in records \| liveProviderRevocation=NOT_WIRED/,
    );
    expect(art.summary).toMatch(
      /liveProviderRevoke=NOT_WIRED externalEffects=NONE \| Measured broker putReference/,
    );
    expect(art.summary).toMatch(
      /\(ACCOUNT_LABEL_REQUIRED\); honesty NOT_WIRED\/NONE \| Fixture match with liveProviderWiring=WIRED/,
    );
    // K27: fence explicit rebind proof kind against silent VERIFIED drift
    expect(art.proofKinds).not.toContain("VERIFIED");
    expect(art.summary).toMatch(
      /New connection lease granted leaseId=lease-[0-9a-f-]+ \| Same-account rebind correctly denied/,
    );
  });
});
