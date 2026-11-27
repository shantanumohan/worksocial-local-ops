/**
 * E2E-lite (offline): T-X027 unknown usage cancel holds residual.
 * Additive coverage beyond m9 presence checks (L2 hillclimb).
 * No live providers. External effects: NONE. ACCEPTED ≠ VERIFIED.
 * Soft-skip ChatGPT Ads. Distinct from T-X028.
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

describe("e2e-lite: T-X027 unknown usage cancel holds residual", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx027-e2e-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs fixture soak with T-X027 ACCEPTED proof and honest wiring", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    const result = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    expect(result.run.externalEffects).toBe("NONE");
    expect(result.run.chatgptAds.allowed).toBe(false);
    expect(result.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(result.run.r1CompleteClaimed).toBe(false);

    const proof = result.run.proofs.find(
      (p) => p.kind === SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) =>
        /heldMinor=700|not zero|multi-hold|NOT_WIRED/i.test(d),
      ),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /liveBudgetProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);

    const tx027 = result.run.caseResults.find((c) => c.caseId === "T-X027");
    expect(tx027?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx027?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx027?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(tx027?.artifactId).toBeTruthy();

    const report = soak.ownerReport();
    expect(report.acceptedCases.some((c) => c.caseId === "T-X027")).toBe(true);
    expect(report.latestRun?.runId).toBe(result.run.runId);
  });
});
