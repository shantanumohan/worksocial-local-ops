/**
 * E2E-lite (offline): T-X061 keyboard focus restore soak path.
 * Recently landed #107 — additive coverage beyond m9 presence checks.
 * No live providers / browser. External effects: NONE. ACCEPTED ≠ VERIFIED.
 * Distinct from T-US-055 (still NOT_RUN).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  PilotGateStatus,
  SoakProofKind,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import { createSoakService } from "@worksocial/soak";

describe("e2e-lite: T-X061 keyboard focus restore", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx061-e2e-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs fixture soak with T-X061 ACCEPTED proof and honest wiring", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    const result = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T20:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.run.externalEffects).toBe("NONE");
    expect(result.run.chatgptAds.allowed).toBe(false);
    expect(result.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(result.run.liveWiring.cms).toBe("NOT_WIRED");
    expect(result.run.r1CompleteClaimed).toBe(false);

    const proof = result.run.proofs.find(
      (p) => p.kind === SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) =>
        /FOCUS_RESTORED|FOCUS_LOST|trap retained|Re-open refused/i.test(d),
      ),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /not browser VERIFIED/i.test(d)),
    ).toBe(true);

    const tx061 = result.run.caseResults.find((c) => c.caseId === "T-X061");
    expect(tx061?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx061?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx061?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(tx061?.artifactId).toBeTruthy();

    const report = soak.ownerReport();
    expect(report.acceptedCases.some((c) => c.caseId === "T-X061")).toBe(true);
    expect(report.latestRun?.runId).toBe(result.run.runId);
  });
});
