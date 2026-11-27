/**
 * Contract: T-X065 worker browser auth state OS deny (M16 hillclimb).
 * ACCEPTED ≠ VERIFIED. External effects NONE. Live browser-auth NOT_WIRED.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  SoakProofKind,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import {
  compileAcceptanceEvidence,
  createSoakService,
  runSoakRecoveryHarness,
} from "@worksocial/soak";

/** Same fixture clock as other m9 soak contracts (after-hours coverage windows). */
const now = "2026-11-21T19:00:00.000Z";
const here = dirname(fileURLToPath(import.meta.url));
const artifactPath = join(
  here,
  "../acceptance-evidence/fixture/art-fixture-t-x065.json",
);

describe("contract: T-X065 worker browser auth OS deny", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps only WORKER_BROWSER_AUTH_STATE_OS_DENIED ↔ T-X065", () => {
    expect(expectedProofsForFixtureCase("T-X065")).toEqual([
      SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED),
    ).toEqual(["T-X065"]);
  });

  it("harness + compiler mark T-X065 fixture ACCEPTED, never VERIFIED", async () => {
    const harnessDir = mkdtempSync(join(tmpdir(), "ws-tx065-harness-"));
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
      (p) => p.kind === SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
    );
    expect(proof?.passed).toBe(true);
    expect(
      proof?.details.some((d) =>
        /workspace_browser_partition: OS_DENY \(consent cannot escalate\)/.test(
          d,
        ),
      ),
    ).toBe(true);
    expect(
      proof?.details.some((d) =>
        /host-admin → workspace_browser_partition: OS_DENY/.test(d),
      ),
    ).toBe(true);

    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T19:01:00.000Z",
      runId: "soak-tx065-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X065");
    expect(row?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(row?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(row?.status).toUpperCase()).not.toBe("VERIFIED");

    const soakDir = mkdtempSync(join(tmpdir(), "ws-tx065-soak-"));
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
    const tx065 = run.run.caseResults.find((c) => c.caseId === "T-X065");
    expect(tx065?.status).toBe(AcceptanceCaseStatus.ACCEPTED);

    const art = JSON.parse(readFileSync(artifactPath, "utf8")) as {
      caseId: string;
      summary: string;
    };
    expect(art.caseId).toBe("T-X065");
    expect(art.summary).toMatch(
      /host-admin → workspace_browser_partition: OS_DENY \(not browser-pool\)/,
    );
    expect(art.summary).toMatch(/liveBrowserAuthWiring=NOT_WIRED/);
    expect(art.summary).not.toMatch(/\bVERIFIED\b/);
  });
});