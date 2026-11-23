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
    expect(report.acceptedCases.length).toBe(119);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X066")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X043")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X026")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X052")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X054")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X055")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X056")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X059")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-038")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X060")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X070")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X028")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X044")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X045")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-006")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X023")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X030")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X040")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-012")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-015")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-017")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-019")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-020")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-021")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-022")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-023")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-025")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-026")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-027")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-028")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-029")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-030")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-031")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-033")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-034")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-035")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-049")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-050")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-051")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-053")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-055")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-059")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F01")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F02")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F03")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F04")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F05")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F06")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F08")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F09")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F10")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F11")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F12")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F13")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F14")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F15")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F16")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F20")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F22")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X004")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X016")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X022")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X065")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X063")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-F24")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-047")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-002")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X002")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X018")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-054")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X073")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-060")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X005")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X006")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X019")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-036")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X029")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-057")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-024")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-042")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X057")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-044")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X053")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-018")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X037")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X058")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X069")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X038")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X039")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-058")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-046")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X048")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-010")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X033")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-008")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X032")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X031")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-US-040")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X049")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X017")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X024")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X025")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X011")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X003")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X050")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X010")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X009")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X015")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X001")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X021")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X008")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X007")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X013")).toBe(true);
    expect(report.acceptedCases.some((c) => c.caseId === "T-X027")).toBe(true);
    expect(
      report.acceptedCases.every((c) => String(c.status).toUpperCase() !== "VERIFIED"),
    ).toBe(true);
    expect(report.status.r1CompleteClaimed).toBe(false);
    expect(report.status.chatgptAdsWiring).toBe("NOT_WIRED");
    expect(report.note).toMatch(/pilotGate=NOT_MET/);
  });
});
