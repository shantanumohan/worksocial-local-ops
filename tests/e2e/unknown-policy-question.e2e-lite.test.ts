/**
 * E2E-lite (offline): T-X055 unknown policy question soak path.
 * Additive hillclimb — fixture already ACCEPTED; deepen honesty coverage.
 * No live providers. External effects: NONE. ACCEPTED ≠ VERIFIED.
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

describe("e2e-lite: T-X055 unknown policy question", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx055-e2e-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs fixture soak with T-X055 ACCEPTED proof and honest wiring", async () => {
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
      (p) =>
        p.kind === SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) =>
        /UNKNOWN_POLICY_QUESTION|escalateWithoutPromise|Attack suite|NOT_WIRED/i.test(
          d,
        ),
      ),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);

    const tx055 = result.run.caseResults.find((c) => c.caseId === "T-X055");
    expect(tx055?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx055?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx055?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(tx055?.artifactId).toBeTruthy();

    const report = soak.ownerReport();
    expect(report.acceptedCases.some((c) => c.caseId === "T-X055")).toBe(true);
    expect(report.latestRun?.runId).toBe(result.run.runId);
  });
});
