import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PilotGateStatus } from "@worksocial/domain";
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

  it("passes crash-restart / no-dup / continuity / reconcile proofs", async () => {
    const result = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(result.allPassed).toBe(true);
    expect(result.proofs).toHaveLength(4);
    expect(result.proofs.every((p) => p.passed)).toBe(true);
    expect(result.proofs.every((p) => p.applyAttemptCount === 1)).toBe(true);
  });

  it("compiles fixture ACCEPTED evidence and never claims live VERIFIED", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
    });
    expect(compiled.blockedLiveVerified).toBe(true);
    expect(compiled.chatgptAds.allowed).toBe(false);
    expect(compiled.artifacts.length).toBeGreaterThanOrEqual(3);
    expect(compiled.caseResults.every((c) => c.status !== "VERIFIED")).toBe(true);
    expect(
      compiled.caseResults.filter((c) => c.status === "ACCEPTED").every((c) => c.artifactId),
    ).toBe(true);
  });

  it("records soak run with pilot gate NOT_MET for short CI soak", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    const result = await soak.runFixtureSoak({
      startedAtIso: "2026-11-21T18:00:00.000Z",
      endedAtIso: "2026-11-21T18:10:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(result.run.r1CompleteClaimed).toBe(false);
    expect(result.run.externalEffects).toBe("NONE");
    expect(result.run.liveWiring.temporal).toBe("NOT_WIRED");
    expect(soak.status().chatgptAdsWiring).toBe("NOT_WIRED");
    expect(soak.listArtifacts().length).toBeGreaterThan(0);
    expect(soak.ownerReport().acceptedCases.length).toBeGreaterThan(0);
  });
});
