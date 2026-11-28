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
 * T-X028 fixture ACCEPTED only via ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE.
 * T-X058 fixture ACCEPTED only via REPAIR_ATTEMPT_LIMIT_ESCALATED.
 * T-X029 fixture ACCEPTED only via EXPLICIT_ACCOUNT_REBIND.
 * T-X031 fixture ACCEPTED only via GA4_WRONG_PROPERTY_KIND_REFUSED.
 * T-X020 fixture ACCEPTED only via UNKNOWN_REMOTE_RECONCILE.
 * T-X022 fixture ACCEPTED only via IDEMPOTENCY_KEY_PAYLOAD_MISMATCH.
 * T-X057 fixture ACCEPTED only via REPAIR_WEAKEN_TEST_REJECTED.
 * T-X059 fixture ACCEPTED only via DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING.
 * T-X061 fixture ACCEPTED only via KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG.
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

  it("T-X028 fixture artifact names actual-cost overrun visibility (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x028.json",
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
    expect(art.artifactId).toBe("art-fixture-t-x028");
    expect(art.caseId).toBe("T-X028");
    expect(art.environment).toBe("fixture");
    expect(art.redacted).toBe(true);
    expect(art.evidenceRef).toBe("soak/evidence/art-fixture-t-x028.json");
    expect(art.proofKinds).toEqual([
      "actual_cost_exceeds_estimate_overrun_visible",
    ]);
    expect(art.summary).toMatch(/Fixture ACCEPTED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("proof=actual_cost_exceeds_estimate_overrun_visible");
    expect(art.summary).toContain("overrunMinor=150 visible");
    expect(art.summary).toContain("never capped");
    expect(art.summary).toContain("liveProviderWiring=NOT_WIRED");
    expect(art.summary).toContain("chatgptAdsAccess=ACCESS_BLOCKED");
    expect(art.summary).toContain("ACTUAL_COST_OVERRUN_RELATED_CASE_IDS=[T-X028]");
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X028 \(Actual cost exceeds estimate — overrun visible\)/,
    );
    expect(art.proofKinds).not.toContain("VERIFIED");
    expect(art.summary).toMatch(
      /liveProviderSuccessClaimed=false externalEffects=NONE$/,
    );
  });

  it("T-X058 fixture artifact names repair attempt limit escalate (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x058.json",
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
    expect(art.artifactId).toBe("art-fixture-t-x058");
    expect(art.caseId).toBe("T-X058");
    expect(art.environment).toBe("fixture");
    expect(art.redacted).toBe(true);
    expect(art.evidenceRef).toBe("soak/evidence/art-fixture-t-x058.json");
    expect(art.proofKinds).toEqual(["repair_attempt_limit_escalated"]);
    expect(art.summary).toMatch(/Fixture ACCEPTED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("proof=repair_attempt_limit_escalated");
    expect(art.summary).toContain("MAX_REPAIR_ATTEMPTS=2");
    expect(art.summary).toContain("ATTEMPT_LIMIT");
    expect(art.summary).toContain("cmsRepairWiring=NOT_WIRED");
    expect(art.summary).toMatch(/ticket status=ESCALATED/);
    // P33 D1: within-limit RELEASED must not premature-escalate (post-#291 tip fence)
    expect(art.summary).toContain("RELEASED_PENDING");
    expect(art.summary).toMatch(/no premature escalate/);
    // P33 D2: third attempt denied without recording — ATTEMPT_LIMIT path (wipe15 @578b1a08)
    expect(art.summary).toContain("Third automatic attempt denied");
    expect(art.summary).toMatch(/GATE_DENIED/);
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X058 \(Third automatic repair attempt — escalate\)/,
    );
    // P33 D3: attempts 1–2 recorded; third refused unrecorded (wipe15 @e969eb6e)
    expect(art.summary).toContain("applyCount=1");
    expect(art.summary).toContain("Attempt 1 recorded (TESTS_FAILED)");
    expect(art.summary).toContain("Second automatic attempt allowed (at max)");
    expect(art.summary).toMatch(/escalate without recording attempt/);
    expect(art.summary).toMatch(/GATE_DENIED ×2 → ESCALATED/);
    expect(art.uniqueSourceArtifactId).toMatch(/^art-fixture-t-x058-/);
    // P33 D4: first/second attempt ledger + CMS honesty (wipe15 @e7226169)
    expect(art.summary).toContain("First automatic attempt allowed");
    expect(art.summary).toContain("Attempt 2 recorded");
    expect(art.summary).toContain("CMS repair wiring NOT_WIRED");
    expect(art.createdAtIso).toMatch(/^2026-/);
    // P34 D5: RELEASED-within-limit + third ATTEMPT_LIMIT path (retip @1fb05770)
    expect(art.summary).toContain("RELEASED within limit");
    expect(art.summary).toMatch(/third attempt ATTEMPT_LIMIT/);
    expect(art.summary).toContain(
      "liveProviderSuccessClaimed=false cmsRepairWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
    );
    expect(art.proofKinds).toHaveLength(1);
    // P34 D6: applyCount fence + RELEASED_PENDING arrow (wipe15 @d6731fcd)
    expect(art.summary).toMatch(/applyCount=1 :: MAX_REPAIR_ATTEMPTS=2/);
    expect(art.summary).toMatch(
      /Attempt 2 recorded; ticket status=ESCALATED/,
    );
    expect(art.summary).toMatch(/→ RELEASED_PENDING/);
    // P34 D7: denied-path wording + summary proof prefix (wipe15 @1fb05770)
    expect(art.summary).toMatch(
      /Third automatic attempt denied \(ATTEMPT_LIMIT\)/,
    );
    expect(art.summary).toContain(
      "proof=repair_attempt_limit_escalated applyCount=1",
    );
    // P34 D8: GATE_DENIED stage delimiter + source id (wipe15 @60b4b782)
    expect(art.summary).toMatch(
      /cmsRepairWiring=NOT_WIRED externalEffects=NONE \| GATE_DENIED ×2/,
    );
    expect(art.uniqueSourceArtifactId).toMatch(
      /^art-fixture-t-x058-[a-f0-9]+$/,
    );
    // P34 D9: ACCEPTED≠VERIFIED + externalEffects=NONE honesty fences (deepen @60b4b782)
    expect(art.summary).not.toMatch(/\bVERIFIED\b/);
    expect(art.summary).not.toMatch(/cmsRepairWiring=WIRED/);
    expect(art.summary).not.toMatch(/liveProviderSuccessClaimed=true/);
    expect(art.summary).not.toMatch(/externalEffects=(?!NONE\b)\S+/);
    expect(art.externalEffects).not.toBe("LIVE");
    expect(art.liveProviderSuccessClaimed).not.toBe(true);
    expect(art.proofKinds).not.toContain("VERIFIED");
    expect(art.summary).toMatch(
      /liveProviderSuccessClaimed=false externalEffects=NONE$/,
    );
    // P34 D10: soft-skip Ads + pool ≤T-X073 + cross-proof drift fences (SOLE #334 @e8323165)
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X058");
    expect(Number(art.caseId.slice(3))).toBeLessThanOrEqual(73);
    for (const id of SOAK_FIXTURE_CASE_IDS) {
      const tx = /^T-X(\d+)$/.exec(id);
      if (tx) {
        expect(Number(tx[1])).toBeLessThanOrEqual(73);
      }
    }
    expect(art.summary).toContain("chatgptAdsAccess=ACCESS_BLOCKED");
    expect(art.proofKinds).not.toContain(
      "duplicate_platform_attribution_one_booking",
    );
    expect(art.summary).not.toMatch(
      /duplicate_platform_attribution_one_booking/,
    );
    expect(art.proofKinds).not.toContain("offboard_active_token_residual");
    expect(art.summary).not.toMatch(/offboard_active_token_residual/);
    expect(art.summary).toContain("TESTS_FAILED");
    expect(art.summary).toContain("CMS repair wiring NOT_WIRED");
  });

  it("T-X031 fixture artifact names GA4 wrong property kind honesty (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x031.json",
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
    expect(art.artifactId).toBe("art-fixture-t-x031");
    expect(art.createdAtIso).toMatch(/^2026-/);
    expect(art.uniqueSourceArtifactId).toMatch(/^art-fixture-t-x031-/);
    expect(art.evidenceRef).toBe("soak/evidence/art-fixture-t-x031.json");
    expect(art.caseId).toBe("T-X031");
    expect(art.environment).toBe("fixture");
    expect(art.redacted).toBe(true);
    expect(art.proofKinds).toEqual(["ga4_wrong_property_kind_refused"]);
    expect(art.summary).toMatch(/Fixture ACCEPTED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("ACCEPTED≠VERIFIED");
    expect(art.summary).toContain("catalogClaim=ACCEPTED≠VERIFIED");
    expect(art.summary).toContain("proof=ga4_wrong_property_kind_refused");
    expect(art.summary).toContain("applyCount=1");
    expect(art.summary).toContain("WRONG_PROPERTY_KIND");
    expect(art.summary).toContain("measurement_id_only");
    expect(art.summary).toContain("MISSING_PROPERTY");
    expect(art.summary).toContain("GA4_KIND_HONEST");
    expect(art.summary).toContain("LIVE_CLAIM_REFUSED");
    expect(art.summary).toContain("NOT_WIRED");
    expect(art.summary).toContain("Live GA4 bind refused");
    expect(art.summary).toContain("Fixture GA4 property accepted");
    expect(art.summary).toContain("Sandbox GA4 accepted");
    expect(art.summary).toContain("claimLiveVerified");
    expect(art.summary).toContain("requestLiveGa4Transport");
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X031 \(Wrong GA4 property kind — refuse bind\)/,
    );
    expect(art.summary).toMatch(/UA property kind → WRONG_PROPERTY_KIND refuse/);
    expect(art.summary).toMatch(
      /assertGa4WrongPropertyKindHonest → GA4_KIND_HONEST; ACCEPTED≠VERIFIED/,
    );
    expect(art.summary).toMatch(
      /idempotent reclaim: double UA refuse agrees; post-live-claim reclaim still WRONG_PROPERTY_KIND/,
    );
    expect(art.summary).toMatch(
      /I10 edges: padded id \+ measurement-id-shaped property refuse/,
    );
    expect(art.summary).toMatch(
      /dual live-claim LIVE_CLAIM_REFUSED; triple reclaim idempotent/,
    );
    // K31: I13 reclaim drift + live-transport invent closed
    expect(art.summary).toMatch(
      /I13 edges: claim-on-padded\/mid LIVE_CLAIM_REFUSED; invent live-transport closed dishonest/,
    );
    expect(art.summary).toMatch(/honest\+dishonest reclaim DRIFT/);
    expect(art.proofKinds).not.toContain("VERIFIED");
    expect(art.summary).toMatch(
      /liveProviderSuccessClaimed=false externalEffects=NONE catalogClaim=ACCEPTED≠VERIFIED/,
    );
    // K32: UNAVAILABLE env refuse bind edge
    expect(art.summary).toMatch(
      /UA-shaped id \+ UNAVAILABLE env → WRONG_PROPERTY_KIND refuse/,
    );
    // K33: post-#266 tip fences
    expect(art.summary).toMatch(/Empty property id → MISSING_PROPERTY/);
    expect(art.summary).toMatch(
      /post-live-claim reclaim still WRONG_PROPERTY_KIND \(no invent bind\)/,
    );
    // K34: post-#267 tip — unknown measurement kinds fence
    expect(art.summary).toMatch(
      /measurement_id_only \+ unknown kinds → WRONG_PROPERTY_KIND refuse/,
    );
    // K35: wipe15 — sandbox GA4 label distinct from fixture/live
    expect(art.summary).toMatch(
      /Sandbox GA4 accepted as distinct label \(≠ fixture ≠ live\)/,
    );
    // K36: post-#268 tip — live transport refuse bind
    expect(art.summary).toMatch(/Live GA4 bind refused while transport NOT_WIRED/);
    // K37: post-#269 tip — live-claim path fenced NOT_WIRED
    expect(art.summary).toMatch(
      /claimLiveVerified \/ requestLiveGa4Transport → LIVE_CLAIM_REFUSED \(NOT_WIRED\)/,
    );
    // K38: wipe15 — fixture GA4 accepted not live metrics
    expect(art.summary).toMatch(
      /Fixture GA4 property accepted \(not live metrics\)/,
    );
    // K39: post-#270 tip — idempotent UA refuse reclaim
    expect(art.summary).toMatch(/double UA refuse agrees/);
    // K40: post-#271 tip — triple reclaim idempotent
    expect(art.summary).toMatch(/triple reclaim idempotent/);
    // K41: wipe15 — I13 claim-on-padded/mid LIVE_CLAIM_REFUSED
    expect(art.summary).toMatch(/claim-on-padded\/mid LIVE_CLAIM_REFUSED/);
    // K42: post-#272 tip — I10 padded id + measurement-id-shaped refuse
    expect(art.summary).toMatch(/padded id \+ measurement-id-shaped property refuse/);
    // K43: post-#273 tip — invent live-transport closed dishonest
    expect(art.summary).toMatch(/invent live-transport closed dishonest/);
    // K44: wipe15 ON_TIP e5f43ded — dual live-claim fence
    expect(art.summary).toMatch(/dual live-claim LIVE_CLAIM_REFUSED/);
    // K45: post-#274 tip — I13 edges fence
    expect(art.summary).toMatch(/I13 edges:/);
    // K46: post-#275 tip — I10 edges fence
    expect(art.summary).toMatch(/I10 edges:/);
    // K47: post-#277 tip — idempotent reclaim fence
    expect(art.summary).toMatch(/idempotent reclaim:/);
    // K48: wipe15 ON_TIP 64e25ce8 — post-live-claim reclaim
    expect(art.summary).toMatch(/post-live-claim reclaim/);
    // K49: post-#278 tip — no invent bind fence
    expect(art.summary).toMatch(/no invent bind/);
    // K50: post-#279 tip — post-live-claim still WRONG_PROPERTY_KIND
    expect(art.summary).toMatch(/still WRONG_PROPERTY_KIND/);
    // K51: post-#280 tip — unknown measurement kinds refuse
    expect(art.summary).toMatch(/unknown kinds/);
    // K52: post-#281 tip — assertGa4WrongPropertyKindHonest
    expect(art.summary).toMatch(/assertGa4WrongPropertyKindHonest/);
  });

  it("T-X020 fixture artifact names unknown-remote reconcile (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x020.json",
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
    };
    expect(art.artifactId).toBe("art-fixture-t-x020");
    expect(art.caseId).toBe("T-X020");
    expect(art.environment).toBe("fixture");
    expect(art.redacted).toBe(true);
    expect(art.evidenceRef).toBe("soak/evidence/art-fixture-t-x020.json");
    expect(art.proofKinds).toEqual(["unknown_remote_reconcile"]);
    expect(art.summary).toMatch(/Fixture ACCEPTED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("proof=unknown_remote_reconcile");
    expect(art.summary).toContain("RECONCILED_VERIFIED_NO_RESEND");
    expect(art.summary).toContain("liveProviderWiring=NOT_WIRED");
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X020 \(Timeout after provider acceptance\)/,
    );
    expect(art.proofKinds).not.toContain("VERIFIED");
    expect(art.summary).toMatch(
      /liveProviderSuccessClaimed=false externalEffects=NONE$/,
    );
  });

  it("T-X061 fixture artifact names keyboard focus restore (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x061.json",
    );
    const art = JSON.parse(readFileSync(artPath, "utf8")) as {
      artifactId: string;
      caseId: string;
      environment: string;
      summary: string;
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
      proofKinds: string[];
    };
    expect(art.artifactId).toBe("art-fixture-t-x061");
    expect(art.caseId).toBe("T-X061");
    expect(art.environment).toBe("fixture");
    expect(art.proofKinds).toEqual(["keyboard_focus_restore_after_dialog"]);
    expect(art.summary).toMatch(/Fixture ACCEPTED for T-X061/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain(
      "proof=keyboard_focus_restore_after_dialog",
    );
    expect(art.summary).toMatch(/liveProviderSuccessClaimed=false/);
    expect(art.proofKinds).not.toContain("VERIFIED");
  });

  it("T-X022 fixture artifact names idempotency payload mismatch (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x022.json",
    );
    const art = JSON.parse(readFileSync(artPath, "utf8")) as {
      artifactId: string;
      caseId: string;
      environment: string;
      summary: string;
      liveProviderSuccessClaimed: boolean;
      externalEffects: string;
      proofKinds: string[];
    };
    expect(art.artifactId).toBe("art-fixture-t-x022");
    expect(art.caseId).toBe("T-X022");
    expect(art.environment).toBe("fixture");
    expect(art.proofKinds).toEqual(["idempotency_key_payload_mismatch"]);
    expect(art.summary).toMatch(/Fixture ACCEPTED for T-X022/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("proof=idempotency_key_payload_mismatch");
    expect(art.summary).toMatch(/liveProviderWiring=NOT_WIRED/);
    expect(art.proofKinds).not.toContain("VERIFIED");
  });

  it("T-X057 fixture artifact names repair weaken-test rejection honesty (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x057.json",
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
    expect(art.artifactId).toBe("art-fixture-t-x057");
    expect(art.createdAtIso).toMatch(/^2026-/);
    expect(art.uniqueSourceArtifactId).toMatch(/^art-fixture-t-x057-/);
    expect(art.evidenceRef).toBe("soak/evidence/art-fixture-t-x057.json");
    expect(art.caseId).toBe("T-X057");
    expect(art.environment).toBe("fixture");
    expect(art.redacted).toBe(true);
    expect(art.proofKinds).toEqual(["repair_weaken_test_rejected"]);
    expect(art.summary).toMatch(/Fixture ACCEPTED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("proof=repair_weaken_test_rejected");
    expect(art.summary).toContain("applyCount=1");
    expect(art.summary).toContain("Healthy repair preserves test baseline");
    expect(art.summary).toContain("TEST_INTEGRITY_VIOLATION");
    expect(art.summary).toContain("DISABLE_TEST");
    expect(art.summary).toContain("Disable-Test rejected");
    expect(art.summary).toContain("tests/unit/cta.test.ts");
    expect(art.summary).toContain("__tests__/cta.spec.ts");
    expect(art.summary).toContain("PROTECTED_PATH");
    expect(art.summary).toContain("Test baseline digest mutation rejected");
    expect(art.summary).toContain("cmsRepairWiringStatus=NOT_WIRED");
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X057 \(Repair disables failing test — rejected\)/,
    );
    expect(art.summary).toMatch(
      /All 7 WeakenTestOperation values rejected \(TEST_INTEGRITY_VIOLATION\)/,
    );
    expect(art.proofKinds).not.toContain("VERIFIED");
    expect(art.summary).toMatch(
      /liveProviderSuccessClaimed=false externalEffects=NONE/,
    );
    // K32: greenfield post-#282 — catalog disable-test edge + paired US-042 proof kind fence
    expect(art.summary).toMatch(
      /Hyphen\/casing alias Disable-Test rejected \(TEST_INTEGRITY_VIOLATION\)/,
    );
    expect(art.summary).toMatch(/__tests__\/ path patch rejected \(PROTECTED_PATH\)/);
    expect(art.proofKinds).not.toContain("ga4_wrong_property_kind_refused");
    // K33: post-#283 tip — protected CTA paths + unit test patch refuse
    expect(art.summary).toMatch(
      /tests\/unit\/cta\.test\.ts and __tests__\/cta\.spec\.ts are protected/,
    );
    expect(art.summary).toMatch(
      /Protected test path patch rejected \(PROTECTED_PATH\)/,
    );
    // K34: post-#284 tip — DISABLE_TEST enumerated + live CMS repair stays NOT_WIRED
    expect(art.summary).toMatch(/incl\. DISABLE_TEST/);
    expect(art.summary).not.toMatch(/cmsRepairWiringStatus=WIRED/);
    // K35: post-#285 tip — repair proof not concurrent-release / remote-reconcile drift
    expect(art.proofKinds).not.toContain("concurrent_idempotent_release");
    expect(art.proofKinds).not.toContain("unknown_remote_reconcile");
    expect(art.summary).not.toMatch(/claimedOneDispatchPass/);
    // K36: post-#286 tip — repair weaken not idempotency-key mismatch drift
    expect(art.proofKinds).not.toContain("idempotency_key_payload_mismatch");
    expect(art.summary).not.toMatch(/idempotency_key_payload_mismatch/);
    // K37: post-#287 tip — repair weaken not T-X017 stop-after-dispatch drift
    expect(art.proofKinds).not.toContain("stop_after_dispatch_reconcile");
    expect(art.summary).not.toMatch(/stop_after_dispatch_reconcile/);
    // K38: post-#288 tip — repair weaken not T-X019 approved-payload edit drift
    expect(art.proofKinds).not.toContain("approved_payload_edit_invalidated");
    expect(art.summary).not.toMatch(/approved_payload_edit_invalidated/);
    // K39: post-#289 tip — repair weaken not T-X023 eventual-consistency CRM drift
    expect(art.proofKinds).not.toContain("eventual_consistency_false_not_found");
    expect(art.summary).not.toMatch(/eventual_consistency_false_not_found/);
    // K40: post-#290 tip — repair weaken not T-X024 old-fence-after-reassignment drift
    expect(art.proofKinds).not.toContain("old_fence_after_reassignment");
    expect(art.summary).not.toMatch(/old_fence_after_reassignment/);
    // K41: post-#291 tip — repair weaken not T-X025 external-human-edit staging drift
    expect(art.proofKinds).not.toContain("external_human_edit_conflict_retained");
    expect(art.summary).not.toMatch(/external_human_edit_conflict_retained/);
    // K42: wipe15 timer c9b7bd66 — sole proof kind + no T-X029 account-rebind drift
    expect(art.proofKinds).toHaveLength(1);
    expect(art.proofKinds).not.toContain("explicit_account_rebind");
    expect(art.summary).not.toMatch(/explicit_account_rebind/);
    // K43: post-#292 tip — repair weaken not T-X026 budget-reservation drift
    expect(art.proofKinds).not.toContain("concurrent_final_budget_reservation_cap");
    expect(art.summary).not.toMatch(/concurrent_final_budget_reservation_cap/);
    // K44: wipe15 timer 578b1a08 — repair weaken not T-X028 overrun-visible drift
    expect(art.proofKinds).not.toContain("actual_cost_exceeds_estimate_overrun_visible");
    expect(art.summary).not.toMatch(/actual_cost_exceeds_estimate_overrun_visible/);
    // K45: post-#293 tip — repair weaken not T-X027 unknown-usage-cancel residual drift
    expect(art.proofKinds).not.toContain("unknown_usage_cancel_holds_residual");
    expect(art.summary).not.toMatch(/unknown_usage_cancel_holds_residual/);
    // K46: post-#294 tip — repair weaken not T-X032 GA4 debug-not-delivered drift
    expect(art.proofKinds).not.toContain("ga4_debug_not_delivered_conversion");
    expect(art.summary).not.toMatch(/ga4_debug_not_delivered_conversion/);
    // K47: post-#295 tip — repair weaken not T-X037 eval-only operational-tool drift
    expect(art.proofKinds).not.toContain("eval_only_operational_tool_forbidden");
    expect(art.summary).not.toMatch(/eval_only_operational_tool_forbidden/);
    // K48: wipe15 @ e969eb6e — repair weaken summary not T-X031 GA4 wrong-property drift
    expect(art.summary).not.toMatch(/ga4_wrong_property_kind_refused/);
    expect(art.summary).not.toMatch(/GA4_WRONG_PROPERTY_KIND_REFUSED/);
    // K49: post-#296 tip — repair weaken not T-X038 eval no-grounding drift
    expect(art.proofKinds).not.toContain("eval_no_grounding_fail_closed");
    expect(art.summary).not.toMatch(/eval_no_grounding_fail_closed/);
    // K50: post-#297 tip — repair weaken not T-X041 incomparable-trend-indices drift
    expect(art.proofKinds).not.toContain("incomparable_trend_indices_rejected");
    expect(art.summary).not.toMatch(/incomparable_trend_indices_rejected/);
    // K51: wipe15 @ e7226169 — repair weaken not T-X039 metric-denominator drift
    expect(art.proofKinds).not.toContain("metric_denominators_honest");
    expect(art.summary).not.toMatch(/metric_denominators_honest/);
    // K52: post-#298 tip — repair weaken not T-X043 optimization-breaks-CTA drift
    expect(art.proofKinds).not.toContain("optimization_breaks_cta_journey_fails");
    expect(art.summary).not.toMatch(/optimization_breaks_cta_journey_fails/);
    // K53: post-#299 tip — repair weaken not T-X058 attempt-limit escalate drift
    expect(art.proofKinds).not.toContain("repair_attempt_limit_escalated");
    expect(art.summary).not.toMatch(/repair_attempt_limit_escalated/);
    expect(art.summary).not.toMatch(/ATTEMPT_LIMIT.*ESCALATED/);
    // K54: wipe15 @ 63d2c0e0 — repair weaken summary not T-X058 attempt-ledger drift
    expect(art.summary).not.toMatch(/MAX_REPAIR_ATTEMPTS=/);
    expect(art.summary).not.toMatch(/Third automatic repair attempt/);
    expect(art.summary).not.toMatch(/ticket status=ESCALATED/);
    // K55: post-#300 tip — repair weaken not T-X058 P33 escalate-ledger drift
    expect(art.summary).not.toMatch(/GATE_DENIED ×2/);
    expect(art.summary).not.toMatch(/RELEASED within limit/);
    expect(art.summary).not.toMatch(/Second automatic attempt allowed/);
    // K56: post-#301 tip — repair weaken not T-X059 duplicate-attribution drift
    expect(art.proofKinds).not.toContain("duplicate_platform_attribution_one_booking");
    expect(art.summary).not.toMatch(/duplicate_platform_attribution_one_booking/);
    expect(art.summary).not.toMatch(/SILENT_PLATFORM_SUM_REFUSED/);
    expect(art.summary).not.toMatch(/INVALID_ATTRIBUTION_CLAIM/);
    // K57: wipe15 @ d6731fcd — repair weaken summary not T-X059 booking-uniqueness drift
    expect(art.summary).not.toMatch(/uniqueBookingCount=/);
    expect(art.summary).not.toMatch(/double-count blocked/);
    expect(art.summary).not.toMatch(/platformClaimCount=/);
    // K58: post-#302 tip — repair weaken not T-X060 currency/timezone mismatch drift
    expect(art.proofKinds).not.toContain("currency_timezone_mismatch_no_silent_sum");
    expect(art.summary).not.toMatch(/currency_timezone_mismatch_no_silent_sum/);
    expect(art.summary).not.toMatch(/CURRENCY_MISMATCH/);
    expect(art.summary).not.toMatch(/TIMEZONE_MISMATCH/);
    // K59: post-#303 tip — repair weaken not T-X061 keyboard-focus-restore drift
    expect(art.proofKinds).not.toContain("keyboard_focus_restore_after_dialog");
    expect(art.summary).not.toMatch(/keyboard_focus_restore_after_dialog/);
    expect(art.summary).not.toMatch(/FOCUS_LOST/);
    expect(art.summary).not.toMatch(/savedTrigger=/);
    // K60: wipe15 @ 1fb05770 — repair weaken summary not T-X061 dialog-trap drift
    expect(art.summary).not.toMatch(/activeFocus=dlg-close/);
    expect(art.summary).not.toMatch(/Re-open refused/);
    expect(art.summary).not.toMatch(/fixtureOnly keyboard/);
    // K61: post-#304 tip — repair weaken not T-X062 SSE gap resync drift
    expect(art.proofKinds).not.toContain("sse_gap_full_state_resync");
    expect(art.summary).not.toMatch(/sse_gap_full_state_resync/);
    expect(art.summary).not.toMatch(/SSE_GAP_FULL_RESYNC_REQUIRED/);
    expect(art.summary).not.toMatch(/SNAPSHOT_INSUFFICIENT_COVERAGE/);
    // K62: post-#305 tip — repair weaken not T-X063 indirect-injection exfil drift
    expect(art.proofKinds).not.toContain("indirect_prompt_injection_exfil_denied");
    expect(art.summary).not.toMatch(/indirect_prompt_injection_exfil_denied/);
    expect(art.summary).not.toMatch(/EXFILTRATION_DENIED/);
    expect(art.summary).not.toMatch(/instructionEligible=false/);
    // K63: post-#306 tip — repair weaken not T-X064 SSRF redirect/DNS-rebind drift
    expect(art.proofKinds).not.toContain("ssrf_redirect_dns_rebind_blocked_every_hop");
    expect(art.summary).not.toMatch(/ssrf_redirect_dns_rebind_blocked_every_hop/);
    expect(art.summary).not.toMatch(/DNS_REBIND_PRIVATE_ADDRESS/);
    expect(art.summary).not.toMatch(/ALL_HOPS_ALLOWED/);
    // K64: wipe15 @ 64829602 — repair weaken summary not T-X064 SSRF hop-ledger drift
    expect(art.summary).not.toMatch(/PRIVATE_OR_LOCAL_HOSTNAME/);
    expect(art.summary).not.toMatch(/HOST_NOT_ALLOWLISTED/);
    expect(art.summary).not.toMatch(/CREDENTIALS_FORBIDDEN/);
    expect(art.summary).not.toMatch(/liveDnsResolve=NOT_WIRED/);
    // K65: post-#307 tip — repair weaken not T-X065 browser-auth OS-deny drift
    expect(art.proofKinds).not.toContain("worker_browser_auth_state_os_denied");
    expect(art.summary).not.toMatch(/worker_browser_auth_state_os_denied/);
    expect(art.summary).not.toMatch(/liveBrowserAuthWiring=NOT_WIRED/);
    expect(art.summary).not.toMatch(/workspace_browser_partition/);
    // K66: post-#308 tip — repair weaken not T-X066 backup-omit-receipt drift
    expect(art.proofKinds).not.toContain("backup_omit_receipt");
    expect(art.summary).not.toMatch(/backup_omit_receipt/);
    expect(art.summary).not.toMatch(/Omit-receipt backup/);
    expect(art.summary).not.toMatch(/UNKNOWN_REMOTE_RECONCILE/);
    // K67: wipe15 @ 5ed3d15d — repair weaken summary not T-X066 backup-reconcile ledger drift
    expect(art.summary).not.toMatch(/remoteRef=remote-/);
    expect(art.summary).not.toMatch(/Post-restore decision=ACCEPTED_PENDING/);
    expect(art.summary).not.toMatch(/Reconciled remoteRef=/);
    expect(art.summary).not.toMatch(/providerEffects=\[\]/);
    // K68: post-#309 tip — repair weaken not T-X067 incompatible workflow upgrade drift
    expect(art.proofKinds).not.toContain(
      "incompatible_workflow_upgrade_blocked_or_retained",
    );
    expect(art.summary).not.toMatch(
      /incompatible_workflow_upgrade_blocked_or_retained/,
    );
    expect(art.summary).not.toMatch(/INCOMPATIBLE_UPGRADE_BLOCKED/);
    expect(art.summary).not.toMatch(/COMPATIBLE_UPGRADE_APPLIED/);
    // K69: post-#310 tip — repair weaken not T-X068 grouped-outage incident drift
    expect(art.proofKinds).not.toContain("thirty_alerts_one_outage_grouped");
    expect(art.summary).not.toMatch(/thirty_alerts_one_outage_grouped/);
    expect(art.summary).not.toMatch(/outageKey=host:/);
    expect(art.summary).not.toMatch(/one-alert-one-incident fan-out/);
    // K70: wipe15 @ 7a9be9a1 — repair weaken summary not T-X068 incident-group ledger drift
    expect(art.summary).not.toMatch(/alertCount=30/);
    expect(art.summary).not.toMatch(/uniqueSourceCount=/);
    expect(art.summary).not.toMatch(/no silent cross-key merge/);
    expect(art.summary).not.toMatch(/Incident count < alert count/);
    // K71: post-#311 tip — repair weaken not T-X069 imported-doc quarantine drift
    expect(art.proofKinds).not.toContain("imported_doc_quarantined_as_data");
    expect(art.summary).not.toMatch(/imported_doc_quarantined_as_data/);
    expect(art.summary).not.toMatch(/UNTRUSTED_SOURCE_NOT_INSTRUCTION/);
    expect(art.summary).not.toMatch(/instructionVersion while QUARANTINED/);
    // K72: post-#312 tip — repair weaken not T-X070 validated-payload collection drift
    expect(art.proofKinds).not.toContain(
      "validated_payload_not_collected_separate_states",
    );
    expect(art.summary).not.toMatch(
      /validated_payload_not_collected_separate_states/,
    );
    expect(art.summary).not.toMatch(/COLLECTION_FAILED/);
    expect(art.summary).not.toMatch(/VALIDATION_FAILED ≠ COLLECTION_FAILED/);
    // K73: wipe15 @ 579ffaf8 — repair weaken summary not T-X070 collection-state ledger drift
    expect(art.summary).not.toMatch(/collectionAttempted=false/);
    expect(art.summary).not.toMatch(/validated=true collected=false/);
    expect(art.summary).not.toMatch(/chatgptAdsAccess=ACCESS_BLOCKED/);
    expect(art.summary).not.toMatch(/validated=true collected=true/);
    // K74: post-#313 tip — repair weaken not T-X071 host-offline public discovery drift
    expect(art.proofKinds).not.toContain(
      "host_offline_public_discovery_unavailable",
    );
    expect(art.summary).not.toMatch(/host_offline_public_discovery_unavailable/);
    expect(art.summary).not.toMatch(/CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED/);
    expect(art.summary).not.toMatch(/activeCoverageClaimed=false/);
    // K75: post-#314 tip — repair weaken not T-X072 customer eval redaction drift
    expect(art.proofKinds).not.toContain("customer_data_eval_redaction_blocks");
    expect(art.summary).not.toMatch(/customer_data_eval_redaction_blocks/);
    expect(art.summary).not.toMatch(/CUSTOMER_DATA_LEAK_BLOCKED/);
    expect(art.summary).not.toMatch(/liveEvalWiring=NOT_WIRED/);
    // K76: promoted tip 4feba617 — repair weaken not T-X073 offboard ACTIVE_TOKEN residual drift
    expect(art.proofKinds).not.toContain("offboard_active_token_residual");
    expect(art.summary).not.toMatch(/offboard_active_token_residual/);
    expect(art.summary).not.toMatch(/BLOCKED_NOT_WIRED/);
    expect(art.summary).not.toMatch(/OFFBOARD_RESIDUAL_HONEST/);
    // K77: post-#316 tip 60b4b782 — repair weaken summary not T-X073 offboard residual ledger drift
    expect(art.summary).not.toMatch(/liveProviderRevoke=NOT_WIRED/);
    expect(art.summary).not.toMatch(/CONNECTION_REVOKED/);
    expect(art.summary).not.toMatch(/leaseId=lease-/);
    expect(art.summary).not.toMatch(/catalogClaim=NOT_RUN/);
    expect(art.summary).not.toMatch(/auditRetained=true/);
    // K78: post-#317 tip 07005dc0 — repair weaken not T-X058 P34 repair-attempt-limit ledger drift
    expect(art.summary).not.toMatch(/Attempt 1 recorded \(TESTS_FAILED\)/);
    expect(art.summary).not.toMatch(/Attempt 2 recorded/);
    expect(art.summary).not.toMatch(/CMS repair wiring NOT_WIRED/);
    expect(art.summary).not.toMatch(/third attempt ATTEMPT_LIMIT/);
    expect(art.summary).not.toMatch(/First automatic attempt allowed/);
    // K79: post-#318 tip c71fa3d1 — repair weaken not T-X059 Q35 attribution ledger drift
    expect(art.summary).not.toMatch(/claim-google-/);
    expect(art.summary).not.toMatch(/claim-meta-/);
    expect(art.summary).not.toMatch(/chronological retainedClaims/);
    expect(art.summary).not.toMatch(/counterfactual: naive platform sum/);
    expect(art.summary).not.toMatch(/three platforms one booking/);
    // K80: post-#319 tip 9bafea42 — repair weaken not T-X060 G44 currency aggregation ledger drift
    expect(art.summary).not.toMatch(/INVALID_DIMENSION/);
    expect(art.summary).not.toMatch(/EMPTY_SERIES/);
    expect(art.summary).not.toMatch(/totalMinor=550/);
    expect(art.summary).not.toMatch(/FALSE_AGGREGATED/);
    expect(art.summary).not.toMatch(/deepen=G35/);
    // K81: post-#320 tip 48f62f95 — repair weaken not T-X061 T43 keyboard-focus ledger drift
    expect(art.summary).not.toMatch(/savedTrigger=btn-keyboard-review/);
    expect(art.summary).not.toMatch(/dlg-secondary/);
    expect(art.summary).not.toMatch(/Tab backward:/);
    expect(art.summary).not.toMatch(/Focus restored to trigger/);
    expect(art.summary).not.toMatch(/Overlay opened/);
    // K82: post-#321 tip 9d500a62 — repair weaken not T-X062 F32 SSE gap-resync ledger drift
    expect(art.summary).not.toMatch(/lastAppliedSeq=/);
    expect(art.summary).not.toMatch(/minResyncThroughSeq=/);
    expect(art.summary).not.toMatch(/FULL_STATE_RESYNC/);
    expect(art.summary).not.toMatch(/INCREMENTAL_APPLY/);
    expect(art.summary).not.toMatch(/coversThroughSeq=/);
    // K83: post-#322 tip 5428b523 — repair weaken not T-X063 R34 injection-exfil ledger drift
    expect(art.summary).not.toMatch(/T-X063 R26:/);
    expect(art.summary).not.toMatch(/compileInputPackage repeat gate/);
    expect(art.summary).not.toMatch(/broker_secret_read/);
    expect(art.summary).not.toMatch(/FORBIDDEN_EFFECT/);
    expect(art.summary).not.toMatch(/attack suite quad repeat gate/);
    // K84: post-#323 tip 62ca532e — repair weaken not T-X064 D85 SSRF IPv4-mapped ledger drift
    expect(art.summary).not.toMatch(/IPv4-mapped rebind/);
    expect(art.summary).not.toMatch(/Expanded IPv4-mapped/);
    expect(art.summary).not.toMatch(/0:0:0:0:0:ffff:10\.1\.2\.3/);
    expect(art.summary).not.toMatch(/::ffff:10\.1\.2\.3/);
    expect(art.summary).not.toMatch(/fe90::1/);
    // K85: post-#324 tip 27a52df2 — repair weaken not T-X065 M17/M18 browser-auth OS_DENY ledger drift
    expect(art.summary).not.toMatch(/no-consent domain path/);
    expect(art.summary).not.toMatch(/explicitUserConsent=false/);
    expect(art.summary).not.toMatch(/ALLOWED honesty locked/);
    expect(art.summary).not.toMatch(/CONSENT_REQUIRED \(explicitUserConsent=false\)/);
    expect(art.summary).not.toMatch(/OS_DENY \(consent cannot escalate\)/);
    // K86: post-#325 tip bc661ad0 — repair weaken not T-X066 L56–L63 backup-omit ledger drift
    expect(art.summary).not.toMatch(/Applied ACCEPTED_PENDING applyCount=1/);
    expect(art.summary).not.toMatch(/localProvider=omitted receipts=0/);
    expect(art.summary).not.toMatch(/Post-reconcile verified matched=true/);
    expect(art.summary).not.toMatch(/Post-reconcile retry providerCreated=false/);
    expect(art.summary).not.toMatch(/Distinct from NO_DUPLICATE_EFFECTS/);
    // K87: post-#326 tip e585ad89 — repair weaken not T-X067 S39–S63 incompatible-upgrade ledger drift
    expect(art.summary).not.toMatch(/S39 IDLE\+breakingRevision mismatch/);
    expect(art.summary).not.toMatch(/COMPATIBLE_DEFINITION_RETAINED/);
    expect(art.summary).not.toMatch(/S48 IDLE incompatible retain leaves updatedAtIso unchanged/);
    expect(art.summary).not.toMatch(/S63 RUNNING block externalEffects=NONE/);
    expect(art.summary).not.toMatch(/temporalWiring=NOT_WIRED/);
    // K88: post-#327 tip d70969c6 — repair weaken not T-X068 J28–J42 outageKey-collapse ledger drift
    expect(art.summary).not.toMatch(/J28: ZWSP\/BOM-wrapped outageKey collapsed/);
    expect(art.summary).not.toMatch(/J36: four-per-em\/punctuation-space outageKey collapsed/);
    expect(art.summary).not.toMatch(/J40: ogham\/MVS\/function-application outageKey collapsed/);
    expect(art.summary).not.toMatch(/J41: bidi embedding\/override outageKey collapsed/);
    expect(art.summary).not.toMatch(/J42: bidi-isolate outageKey collapsed/);
    // K89: post-#328 tip bfed7a60 — repair weaken not T-X069 A22 quarantine instructionVersion ledger drift
    expect(art.summary).not.toMatch(/A22 bind-c27aaaa0 continue: sext PENDING claim instructionVersion/);
    expect(art.summary).not.toMatch(/A22 tip-moved-316 edge: padded instructionVersion refused/);
    expect(art.summary).not.toMatch(/whitespace-only never pins/);
    expect(art.summary).not.toMatch(/A22 tip-moved-316 channel edge: untrusted email\+web/);
    expect(art.summary).not.toMatch(/sext QUARANTINED claim instructionVersion → refused/);
    // K90: post-#329 tip 1b78b873 — repair weaken not T-X070 B24–B35 validated-payload ledger drift
    expect(art.summary).not.toMatch(/Short signature hex \(B31/);
    expect(art.summary).not.toMatch(/Envelope\/body eventId mismatch/);
    expect(art.summary).not.toMatch(/durable write → COLLECTED/);
    expect(art.summary).not.toMatch(/Bad webhook signature/);
    expect(art.summary).not.toMatch(/Non-hex signature suffix/);
    // K91: post-#330 tip b2024cf8 — repair weaken not T-X071 I71–I74 host-offline discovery ledger drift
    expect(art.summary).not.toMatch(/HOST_ONLINE_NO_PRIOR_UNAVAILABLE/);
    expect(art.summary).not.toMatch(/CLAIMED_AVAILABLE_WHILE_OFFLINE_REFUSED/);
    expect(art.summary).not.toMatch(/UNAVAILABLE\/HOST_OFFLINE on geo_presence/);
    expect(art.summary).not.toMatch(/wipe15 I71/);
    expect(art.summary).not.toMatch(/wipe15 I72/);
    // K92: post-#331 tip 79a4fc8f — repair weaken not T-X072 N115 customer eval redaction ledger drift
    expect(art.summary).not.toMatch(/buildEvalSafePromptFromPayload/);
    expect(art.summary).not.toMatch(/EVAL_PROMPT_CLEAN/);
    expect(art.summary).not.toMatch(/REDACTED_FOR_EVAL/);
    expect(art.summary).not.toMatch(/\[REDACTED_NAME\]/);
    expect(art.summary).not.toMatch(/retip N115/);
    // K93: post-#332 tip f160027f — repair weaken not T-X073 O70 offboard ACTIVE_TOKEN residual ledger drift
    expect(art.summary).not.toMatch(/Pre-offboard lease granted/);
    expect(art.summary).not.toMatch(/PROVIDER_REVOKE residual/);
    expect(art.summary).not.toMatch(/manifest=ob-/);
    expect(art.summary).not.toMatch(/I17 edges:/);
    expect(art.summary).not.toMatch(/double liveProviderRevoke/);
    // K94: post-#333 tip e8323165 — repair weaken not T-X058 repair-attempt-limit proof drift (HOLD #334)
    expect(art.proofKinds).not.toContain("repair_attempt_limit_escalated");
    expect(art.summary).not.toMatch(/repair_attempt_limit_escalated/);
    expect(art.summary).not.toMatch(/MAX_REPAIR_ATTEMPTS=2/);
    expect(art.summary).not.toMatch(/ticket status=ESCALATED/);
    expect(art.summary).not.toMatch(/RELEASED_PENDING/);
    expect(art.summary).not.toMatch(/Third automatic repair attempt/);
    // K95: post-#334 tip 27a872ed — repair weaken not T-X058 P34 D10 repair-attempt ledger drift
    expect(art.summary).not.toMatch(/chatgptAdsAccess=ACCESS_BLOCKED/);
    expect(art.summary).not.toMatch(/GATE_DENIED ×2/);
    expect(art.summary).not.toMatch(/cmsRepairWiring=NOT_WIRED/);
    expect(art.summary).not.toMatch(/Second automatic attempt allowed \(at max\)/);
    expect(art.summary).not.toMatch(/Third automatic attempt denied/);
    // K96: post-#335 tip 360889c7 — repair weaken not T-X059 Q36 duplicate-attribution ledger drift
    expect(art.proofKinds).not.toContain("duplicate_platform_attribution_one_booking");
    expect(art.summary).not.toMatch(/duplicate_platform_attribution_one_booking/);
    expect(art.summary).not.toMatch(/SILENT_PLATFORM_SUM_REFUSED/);
    expect(art.summary).not.toMatch(/INVALID_ATTRIBUTION_CLAIM/);
    expect(art.summary).not.toMatch(/uniqueBookingCount=1/);
    expect(art.summary).not.toMatch(/offset timestamps sorted by parsed instant/);
    // K97: post-#336 tip d4348d7e — repair weaken not T-X060 G45+ currency/timezone ledger drift
    expect(art.summary).not.toMatch(/CURRENCY_MISMATCH/);
    expect(art.summary).not.toMatch(/TIMEZONE_MISMATCH/);
    expect(art.summary).not.toMatch(/SILENT_SUM refused/);
    expect(art.summary).not.toMatch(/Signed-zero amountMinor/);
    expect(art.summary).not.toMatch(/America\/New_York \(whitespace-normalized\)/);
    expect(art.summary).not.toMatch(/Fractional amountMinor/);
    // K98: post-#337 tip 4ab21ddb — repair weaken not T-X061 T53–T54 keyboard-focus ledger drift
    expect(art.summary).not.toMatch(/Overlay opened; savedTrigger=btn-keyboard-review/);
    expect(art.summary).not.toMatch(/Tab backward: dlg-close → dlg-secondary/);
    expect(art.summary).not.toMatch(/Focus restored to trigger btn-keyboard-review/);
    expect(art.summary).not.toMatch(/Trigger btn-keyboard-review unrestorable — FOCUS_LOST/);
    expect(art.summary).not.toMatch(/fixtureOnly keyboard\/focus model/);
    // K99: post-#338 tip 183592cf — repair weaken not T-X062 F45+ SSE gap-resync ledger drift
    expect(art.summary).not.toMatch(/SSE_GAP_FULL_RESYNC_REQUIRED/);
    expect(art.summary).not.toMatch(/Outstanding gap blocks contiguous seq=102 invent/);
    expect(art.summary).not.toMatch(/F35 coversThroughSeq=13 equals minResyncThroughSeq=13/);
    expect(art.summary).not.toMatch(/SNAPSHOT_INSUFFICIENT_COVERAGE/);
    expect(art.summary).not.toMatch(/Online contiguous seq=101 → INCREMENTAL_APPLY/);
    // K100: post-#339 tip 2bad2127 — repair weaken not T-X063 R40+ injection-exfil ledger drift
    expect(art.summary).not.toMatch(/T-X063 R35:/);
    expect(art.summary).not.toMatch(/attack suite nonet repeat gate/);
    expect(art.summary).not.toMatch(/trusted near-miss exact-match-only/);
    expect(art.summary).not.toMatch(/CREDENTIAL_ACCESS_DENIED/);
    expect(art.summary).not.toMatch(/Absolute exfil denied across 3 channels/);
    // K101: post-#340 tip c4b3aeb2 — repair weaken not T-X064 D86–D102 SSRF redirect/DNS-rebind ledger drift
    expect(art.summary).not.toMatch(/169\.254\.169\.254/);
    expect(art.summary).not.toMatch(/cdn\.worksocial\.com/);
    expect(art.summary).not.toMatch(/Initial hop credentials in URL/);
    expect(art.summary).not.toMatch(/IPv6 link-local/);
    expect(art.summary).not.toMatch(/liveFetch=NOT_WIRED/);
    // K102: post-#341 tip 3bd3caab — repair weaken not T-X065 M browser-auth OS_DENY ledger drift
    expect(art.summary).not.toMatch(/liveBrowserAuthRead=NOT_WIRED/);
    expect(art.summary).not.toMatch(/sealed workspace ref/);
    expect(art.summary).not.toMatch(/fixture vault intact after OS_DENY matrix/);
    expect(art.summary).not.toMatch(/Positive control: browser-pool \+ consent/);
    expect(art.summary).not.toMatch(/no silent reuse/);
    // K103: post-#342 tip b106092f — repair weaken not T-X066 L64 backup-omit-receipt ledger drift
    expect(art.summary).not.toMatch(/remote-967348a6/);
    expect(art.summary).not.toMatch(/remote ledger preserved separately/);
    expect(art.summary).not.toMatch(/T-F24\/T-US-047/);
    expect(art.summary).not.toMatch(/T-X020\/T-US-048/);
    expect(art.summary).not.toMatch(/Backup omits remote receipt/);
  });
  it("T-X059 fixture artifact names duplicate platform attribution (ACCEPTED ≠ VERIFIED)", () => {
    const artPath = resolve(
      repoRoot,
      "tests/acceptance-evidence/fixture/art-fixture-t-x059.json",
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
    };
    expect(art.artifactId).toBe("art-fixture-t-x059");
    expect(art.caseId).toBe("T-X059");
    expect(art.environment).toBe("fixture");
    expect(art.redacted).toBe(true);
    expect(art.evidenceRef).toBe("soak/evidence/art-fixture-t-x059.json");
    expect(art.proofKinds).toEqual([
      "duplicate_platform_attribution_one_booking",
    ]);
    expect(art.summary).toMatch(/Fixture ACCEPTED/);
    expect(art.summary).not.toMatch(/Fixture VERIFIED/);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain(
      "proof=duplicate_platform_attribution_one_booking",
    );
    expect(art.summary).toContain("SILENT_PLATFORM_SUM_REFUSED");
    expect(art.summary).toContain("INVALID_ATTRIBUTION_CLAIM");
    expect(art.summary).toContain("liveProviderWiring=NOT_WIRED");
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X059 \(Duplicate platform attribution — one booking; separate claims\)/,
    );
    expect(art.proofKinds).not.toContain("VERIFIED");
    expect(art.summary).toContain("ACCEPTED≠VERIFIED");
    expect(art.summary).toMatch(/chronological/);
    expect(art.summary).toMatch(/uniqueBookingCount=1/);
    // Q35/K53 @ d6731fcd — not T-X060 currency/timezone silent-sum drift
    expect(art.proofKinds).not.toContain(
      "currency_timezone_mismatch_no_silent_sum",
    );
    expect(art.summary).not.toMatch(/currency_timezone_mismatch_no_silent_sum/);
    // Q35 wipe15 @ d6731fcd — sole duplicate-platform proof kind
    expect(art.proofKinds).toHaveLength(1);
    expect(art.summary).toMatch(
      /Fixture ACCEPTED for T-X059 \(Duplicate platform attribution/,
    );
    // Q35 wipe15 @ 1fb05770 — not T-X061 keyboard-focus drift (#303)
    expect(art.proofKinds).not.toContain("keyboard_focus_restore_after_dialog");
    expect(art.summary).not.toMatch(/keyboard_focus_restore_after_dialog/);
    // Q35 wipe15 @ 64829602 — not T-X064 SSRF drift (#306)
    expect(art.proofKinds).not.toContain(
      "ssrf_redirect_dns_rebind_blocked_every_hop",
    );
    expect(art.summary).not.toMatch(/ssrf_redirect_dns_rebind/);
    // Q35 wipe15 @ 5ed3d15d — not T-X066 backup-omit drift (#308)
    expect(art.proofKinds).not.toContain("backup_omit_receipt");
    expect(art.summary).not.toMatch(/backup_omit_receipt/);
    // Q35 wipe15 @ 7a9be9a1 — not T-X068 grouped-outage drift (#310)
    expect(art.proofKinds).not.toContain("thirty_alerts_one_outage_grouped");
    expect(art.summary).not.toMatch(/thirty_alerts_one_outage_grouped/);
    // Q35 wipe15 @ 579ffaf8 — not T-X070 validated-payload drift (#312)
    expect(art.proofKinds).not.toContain(
      "validated_payload_not_collected_separate_states",
    );
    expect(art.summary).not.toMatch(
      /validated_payload_not_collected_separate_states/,
    );
    // Q35 tip-moved-316 @ 60b4b782 — not T-X057 repair-weaken drift (#316)
    expect(art.proofKinds).not.toContain("repair_weaken_test_rejected");
    expect(art.summary).not.toMatch(/repair_weaken_test_rejected/);
    // Q35 tip-moved-316 — not T-X073 offboard residual drift (#315 main)
    expect(art.proofKinds).not.toContain("offboard_active_token_residual");
    expect(art.summary).not.toMatch(/offboard_active_token_residual/);
    // Q35/S39 FULL wipe @ 60b4b782 — not T-X071 host-offline drift (#313)
    expect(art.proofKinds).not.toContain(
      "host_offline_public_discovery_unavailable",
    );
    expect(art.summary).not.toMatch(/host_offline_public_discovery/);
    // Q35/S40 — not T-X072 customer-eval redaction drift (#314)
    expect(art.proofKinds).not.toContain("customer_data_eval_redaction_blocks");
    expect(art.summary).not.toMatch(/customer_data_eval_redaction/);
    // Q35/S41 — fence exclusive T-X058 (#317) without claiming it
    expect(art.proofKinds).not.toContain("repair_attempt_limit_escalated");
    expect(art.summary).not.toMatch(/repair_attempt_limit_escalated/);
    // Q36/S42 tip-moved-334 @ 27a872ed — not T-X060 currency/timezone drift (#319)
    expect(art.proofKinds).not.toContain(
      "currency_timezone_mismatch_no_silent_sum",
    );
    expect(art.summary).not.toMatch(
      /currency_timezone_mismatch_no_silent_sum/,
    );
    // Q36/S46 — not T-X063 indirect-prompt-injection drift (#322)
    expect(art.proofKinds).not.toContain(
      "indirect_prompt_injection_exfil_denied",
    );
    expect(art.summary).not.toMatch(/indirect_prompt_injection_exfil_denied/);
    // Q36/S47 — not T-X065 browser-auth drift (#324)
    expect(art.proofKinds).not.toContain(
      "worker_browser_auth_state_os_denied",
    );
    expect(art.summary).not.toMatch(/worker_browser_auth_state_os_denied/);
    // Q36/S48 — not T-X066 backup-omit drift (#325)
    expect(art.proofKinds).not.toContain("backup_omit_receipt");
    expect(art.summary).not.toMatch(/backup_omit_receipt/);
    // Q36/S49 — not T-X067 workflow-upgrade drift (#326)
    expect(art.proofKinds).not.toContain(
      "incompatible_workflow_upgrade_blocked_or_retained",
    );
    expect(art.summary).not.toMatch(
      /incompatible_workflow_upgrade_blocked_or_retained/,
    );
    // Q36/S50 — not T-X068 grouped-outage drift (#327)
    expect(art.proofKinds).not.toContain("thirty_alerts_one_outage_grouped");
    expect(art.summary).not.toMatch(/thirty_alerts_one_outage_grouped/);
    // Q36/S51 — not T-X069 imported-doc drift (#328)
    expect(art.proofKinds).not.toContain("imported_doc_quarantined_as_data");
    expect(art.summary).not.toMatch(/imported_doc_quarantined_as_data/);
    // Q36/S52 — not T-X070 validated-payload drift (#329)
    expect(art.proofKinds).not.toContain(
      "validated_payload_not_collected_separate_states",
    );
    expect(art.summary).not.toMatch(
      /validated_payload_not_collected_separate_states/,
    );
    // Q36/S53 — not T-X071 host-offline drift (#330)
    expect(art.proofKinds).not.toContain(
      "host_offline_public_discovery_unavailable",
    );
    expect(art.summary).not.toMatch(/host_offline_public_discovery/);
    // Q36/S54 — not T-X072 eval-redaction drift (#331)
    expect(art.proofKinds).not.toContain("customer_data_eval_redaction_blocks");
    expect(art.summary).not.toMatch(/customer_data_eval_redaction/);
    // Q36/S55 — not T-X073 offboard residual drift (#332)
    expect(art.proofKinds).not.toContain("offboard_active_token_residual");
    expect(art.summary).not.toMatch(/offboard_active_token_residual/);
    // Q36/S56 — not T-X057 repair-weaken drift (#333)
    expect(art.proofKinds).not.toContain("repair_weaken_test_rejected");
    expect(art.summary).not.toMatch(/repair_weaken_test_rejected/);
    // Q36/S57 — not T-X058 repair-limit drift (#334 merged); SOLE exclusive is #335
    expect(art.proofKinds).not.toContain("repair_attempt_limit_escalated");
    expect(art.summary).not.toMatch(/repair_attempt_limit_escalated/);
    // Q36/S58 — sole duplicate-platform proof kind for SOLE #335
    expect(art.proofKinds).toEqual([
      "duplicate_platform_attribution_one_booking",
    ]);
    expect(art.proofKinds).toHaveLength(1);
    // Soft-skip Ads — T-X059 fixture must not invent Ads access claims
    expect(art.summary).not.toMatch(/chatgptAdsAccess=/);
    // Pool ≤ T-X073 — no invented fixture past offboard residual
    expect(SOAK_FIXTURE_CASE_IDS).toContain("T-X073");
    expect(SOAK_FIXTURE_CASE_IDS).not.toContain("T-X074");
    // Honesty pins — ACCEPTED≠VERIFIED; NONE/NOT_WIRED
    expect(art.summary).toContain("ACCEPTED≠VERIFIED");
    expect(art.externalEffects).toBe("NONE");
    expect(art.summary).toContain("liveProviderWiring=NOT_WIRED");
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.proofKinds).not.toContain("VERIFIED");
  });
});
