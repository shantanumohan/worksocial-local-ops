import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  PilotGateStatus,
  PILOT_SOAK_REQUIRED_MS,
  SoakProofKind,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import { createSoakService } from "./service.js";
import { runSoakRecoveryHarness } from "./harness.js";
import { compileAcceptanceEvidence } from "./evidence-compiler.js";

describe("soak service (M9)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-soak-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes crash-restart / no-dup / continuity / reconcile / backup-omit / recover-rotate / competing-supervisor / self-approval proofs", async () => {
    const result = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(result.allPassed).toBe(true);
    expect(result.proofs).toHaveLength(8);
    expect(result.proofs.every((p) => p.passed)).toBe(true);
    expect(result.proofs.every((p) => p.applyAttemptCount === 1)).toBe(true);
    expect(
      result.proofs.some((p) => p.kind === SoakProofKind.BACKUP_OMIT_RECEIPT),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.RECOVER_ROTATE_RECONCILE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.COMPETING_SUPERVISOR_LEASE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some((p) => p.kind === SoakProofKind.SELF_APPROVAL_REJECTED),
    ).toBe(true);
  });

  it("compiles fixture ACCEPTED for complete proof sets including T-X018/T-US-054", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-test-compile-1",
    });
    expect(compiled.blockedLiveVerified).toBe(true);
    expect(compiled.chatgptAds.allowed).toBe(false);
    const accepted = compiled.caseResults.filter(
      (c) => c.status === AcceptanceCaseStatus.ACCEPTED,
    );
    expect(accepted.map((c) => c.caseId).sort()).toEqual([
      "T-F24",
      "T-US-002",
      "T-US-047",
      "T-US-048",
      "T-US-054",
      "T-X002",
      "T-X014",
      "T-X018",
      "T-X020",
      "T-X066",
    ]);
    expect(compiled.caseResults.every((c) => c.status !== "VERIFIED")).toBe(
      true,
    );
    expect(
      accepted.every(
        (c) =>
          c.artifactId?.startsWith(`art-fixture-${c.caseId.toLowerCase()}-`),
      ),
    ).toBe(true);
    const tx066 = accepted.find((c) => c.caseId === "T-X066");
    expect(tx066?.environment).toBe("fixture");
    expect(accepted.find((c) => c.caseId === "T-F24")?.environment).toBe(
      "fixture",
    );
  });

  it("does not ACCEPTED T-X014 when crash-restart fails but job continuity passes", () => {
    const proofs = [
      {
        proofId: "p-crash-fail",
        kind: SoakProofKind.CRASH_RESTART,
        passed: false,
        details: ["restart failed"],
        applyAttemptCount: 1,
        operationId: "op-1",
        createdAtIso: "2026-11-21T18:00:00.000Z",
        fixtureOnly: true as const,
      },
      {
        proofId: "p-job-ok",
        kind: SoakProofKind.JOB_CONTINUITY,
        passed: true,
        details: ["job ok"],
        applyAttemptCount: 1,
        operationId: "op-2",
        createdAtIso: "2026-11-21T18:00:00.000Z",
        fixtureOnly: true as const,
      },
    ];
    const compiled = compileAcceptanceEvidence({
      proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-partial-tx014",
      caseIds: ["T-X014"],
    });
    expect(compiled.caseResults).toHaveLength(1);
    expect(compiled.caseResults[0]!.status).toBe(AcceptanceCaseStatus.FAILED);
    expect(compiled.caseResults[0]!.artifactId).toBeNull();
    expect(compiled.artifacts).toHaveLength(0);
    expect(
      compiled.caseResults[0]!.reasons.some((r) => /failed|Incomplete/i.test(r)),
    ).toBe(true);
  });

  it("does not ACCEPTED T-X066 from retry-only no-dup proof", () => {
    const proofs = [
      {
        proofId: "p-nodup",
        kind: SoakProofKind.NO_DUPLICATE_EFFECTS,
        passed: true,
        details: ["retry idempotent"],
        applyAttemptCount: 1,
        operationId: "op-nodup",
        createdAtIso: "2026-11-21T18:00:00.000Z",
        fixtureOnly: true as const,
      },
    ];
    const compiled = compileAcceptanceEvidence({
      proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-nodup-only",
      caseIds: ["T-X014", "T-X020", "T-US-048", "T-X066"],
    });
    expect(
      compiled.caseResults.every((c) => c.status === AcceptanceCaseStatus.NOT_RUN),
    ).toBe(true);
    expect(compiled.artifacts).toHaveLength(0);
    expect(
      compiled.caseResults.find((c) => c.caseId === "T-X066")?.status,
    ).toBe(AcceptanceCaseStatus.NOT_RUN);
  });

  it("records soak run with pilot gate NOT_MET; client-forged 72h clock cannot set MET", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    // Inject a clock that jumps 72h between start and end of the same run —
    // still requires observation continuity heartbeats for MET, and proves
    // request-body claim dates are not part of the API.
    let tick = Date.parse("2026-11-21T18:00:00.000Z");
    const result = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T18:00:00.000Z",
      now: () => {
        const d = new Date(tick);
        // After first read (start), jump 72h for end — but no heartbeats in between.
        tick += PILOT_SOAK_REQUIRED_MS;
        return d;
      },
    });
    expect(result.ok).toBe(true);
    expect(result.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(result.run.pilotGate.serverObservationsOnly).toBe(true);
    expect(result.run.pilotGate.reasons.some((r) => /gap/i.test(r))).toBe(true);
    expect(result.run.r1CompleteClaimed).toBe(false);
    expect(result.run.externalEffects).toBe("NONE");
    expect(result.run.liveWiring.temporal).toBe("NOT_WIRED");
    expect(soak.status().chatgptAdsWiring).toBe("NOT_WIRED");
    expect(
      result.run.caseResults.find((c) => c.caseId === "T-X066")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      soak.listCases().find((c) => c.caseId === "T-X066")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(soak.listArtifacts().length).toBeGreaterThan(0);
    expect(soak.ownerReport().acceptedCases.length).toBe(10);
  });

  it("preserves unique artifact ids across two soak runs", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    const first = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T18:00:00.000Z",
    });
    const second = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T18:10:00.000Z",
    });
    const firstIds = first.run.caseResults
      .filter((c) => c.artifactId)
      .map((c) => c.artifactId!);
    const secondIds = second.run.caseResults
      .filter((c) => c.artifactId)
      .map((c) => c.artifactId!);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(secondIds.length).toBeGreaterThan(0);
    for (const id of firstIds) {
      expect(secondIds).not.toContain(id);
    }
    const stored = soak.listArtifacts(200).map((a) => a.artifactId);
    for (const id of [...firstIds, ...secondIds]) {
      expect(stored).toContain(id);
    }
  });
});
