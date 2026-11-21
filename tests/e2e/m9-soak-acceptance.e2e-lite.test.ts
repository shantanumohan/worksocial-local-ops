/**
 * E2E-lite (offline): M9 fixture soak → evidence → owner report.
 * No live providers. External effects: none.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PilotGateStatus } from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import { createSoakService } from "@worksocial/soak";

describe("e2e-lite: M9 soak acceptance", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-m9-e2e-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs fixture soak and exposes honest owner report", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    const result = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T20:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.run.proofs.every((p) => p.passed)).toBe(true);
    expect(result.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(result.run.pilotGate.serverObservationsOnly).toBe(true);
    expect(result.run.chatgptAds.allowed).toBe(false);
    expect(result.run.externalEffects).toBe("NONE");

    const report = soak.ownerReport();
    expect(report.latestRun?.runId).toBe(result.run.runId);
    expect(report.acceptedCases.length).toBe(12);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X066")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F24")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-047")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-002")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X002")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X018")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-054")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X073")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-060")).toBe(true);
    expect(
      report.acceptedCases.every((c) => String(c.status).toUpperCase() !== "VERIFIED"),
    ).toBe(true);
    expect(report.status.r1CompleteClaimed).toBe(false);
    expect(report.status.chatgptAdsWiring).toBe("NOT_WIRED");
    expect(report.note).toMatch(/pilotGate=NOT_MET/);
  });
});
