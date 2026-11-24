/**
 * Contract: T-X027 unknown usage cancel holds residual (hillclimb L2).
 * Additive coverage around domain + soak map honesty.
 * ACCEPTED ≠ VERIFIED. External effects NONE. Live budget provider NOT_WIRED.
 * Soft-skip ChatGPT Ads. Distinct from T-X028 overrun-visible.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  BUDGET_LIVE_PROVIDER_WIRING,
  SoakProofKind,
  UNKNOWN_USAGE_CANCEL_RELATED_CASE_IDS,
  availableBudgetMinor,
  cancelBudgetReservation,
  createBudgetAccount,
  expectedProofsForFixtureCase,
  heldReservationsTotalMinor,
  mapProofToFixtureCases,
  reserveBudget,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import {
  compileAcceptanceEvidence,
  createSoakService,
  runSoakRecoveryHarness,
} from "@worksocial/soak";

const now = "2026-11-21T18:00:00.000Z";

describe("contract: T-X027 unknown usage cancel holds residual", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx027-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("holds residual (not zero), stamps NOT_WIRED, keeps heldMinor map sum", () => {
    const reserved = reserveBudget(
      createBudgetAccount({
        dayKey: "2026-11-22",
        currency: "USD",
        limitMinor: 1000,
      }),
      "req-hold",
      600,
    );
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    const cancelled = cancelBudgetReservation(reserved.account, "req-hold", {
      known: false,
    });
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.costKind).toBe("unknown_hold");
    expect(cancelled.actualMinor).toBeNull();
    expect(cancelled.heldMinor).toBe(600);
    expect(availableBudgetMinor(cancelled.account)).toBe(400);
    expect(cancelled.externalEffects).toBe("NONE");
    expect(cancelled.liveBudgetProviderWiring).toBe(BUDGET_LIVE_PROVIDER_WIRING);
    expect(cancelled.account.heldMinor).toBe(
      heldReservationsTotalMinor(cancelled.account),
    );
  });

  it("maps T-X027 only to UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL", () => {
    expect([...UNKNOWN_USAGE_CANCEL_RELATED_CASE_IDS]).toEqual(["T-X027"]);
    expect(expectedProofsForFixtureCase("T-X027")).toEqual([
      SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL),
    ).toEqual(["T-X027"]);
    expect(BUDGET_LIVE_PROVIDER_WIRING).toBe("NOT_WIRED");
  });

  it("harness + compiler mark T-X027 fixture ACCEPTED, never VERIFIED", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: now,
    });
    expect(harness.allPassed).toBe(true);
    const proof = harness.proofs.find(
      (p) => p.kind === SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);
    expect(
      proof?.details.some((d) => /liveBudgetProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);

    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-tx027-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X027");
    expect(row?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(row?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(row?.status).toUpperCase()).not.toBe("VERIFIED");
    expect(compiled.chatgptAds.allowed).toBe(false);
    expect(compiled.blockedLiveVerified).toBe(true);

    const soak = createSoakService(createFileSoakStore(dir));
    const run = await soak.runFixtureSoak({ harnessNowIso: now });
    expect(run.ok).toBe(true);
    expect(run.run.externalEffects).toBe("NONE");
    expect(run.run.chatgptAds.allowed).toBe(false);
    const tx027 = run.run.caseResults.find((c) => c.caseId === "T-X027");
    expect(tx027?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(tx027?.environment).toBe(AcceptanceEnvironment.FIXTURE);
    expect(String(tx027?.status).toUpperCase()).not.toBe("VERIFIED");
  });
});
