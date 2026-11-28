/**
 * Contract: T-X068 thirty alerts one outage — grouped incident (hillclimb J28–J42).
 * ACCEPTED ≠ VERIFIED. externalEffects NONE. live provider NOT_WIRED. Ads soft-skip.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ALERT_OUTAGE_GROUPING_RELATED_CASE_IDS,
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  AlertSeverity,
  SoakProofKind,
  createProbeAlert,
  expectedProofsForFixtureCase,
  groupAlertsIntoIncidents,
  mapProofToFixtureCases,
  normalizeOutageKey,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import {
  compileAcceptanceEvidence,
  createSoakService,
  runSoakRecoveryHarness,
} from "@worksocial/soak";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const matrixPath = resolve(root, "tests/acceptance-matrix-v6.json");
const now = "2026-11-21T18:00:00.000Z";

describe("contract: T-X068 thirty alerts one outage grouped", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-tx068-contract-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("maps only to THIRTY_ALERTS_ONE_OUTAGE_GROUPED", () => {
    expect([...ALERT_OUTAGE_GROUPING_RELATED_CASE_IDS]).toEqual(["T-X068"]);
    expect(expectedProofsForFixtureCase("T-X068")).toEqual([
      SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED),
    ).toEqual(["T-X068"]);
  });

  it("matrix row stays fixture-honest (whitespace + NOT_WIRED)", () => {
    const matrix = JSON.parse(readFileSync(matrixPath, "utf8")) as {
      cases: Array<{ id: string; status: string; evidenceNote?: string }>;
    };
    const row = matrix.cases.find((c) => c.id === "T-X068");
    expect(row?.status).toBe("ACCEPTED");
    expect(row?.evidenceNote).toMatch(/THIRTY_ALERTS_ONE_OUTAGE_GROUPED/i);
    expect(row?.evidenceNote).toMatch(/NOT_WIRED/i);
    expect(row?.evidenceNote).toMatch(/no case-fold merge/i);
    expect(row?.evidenceNote).toMatch(/line-separator/i);
    expect(row?.evidenceNote).toMatch(/word-joiner/i);
    expect(row?.evidenceNote).toMatch(/control-char/i);
    expect(row?.evidenceNote).toMatch(/en-quad|three-per-em|ogham/i);
    expect(row?.evidenceNote).toMatch(/bidi embedding|bidi-isolate|isolate/i);
    expect(row?.evidenceNote).toMatch(/externalEffects=NONE/i);
    expect(row?.evidenceNote).toMatch(/ACCEPTED/);
  });

  it("J28–J29 normalization prevents phantom parallel incidents", () => {
    const key = "host:local-1";
    expect(normalizeOutageKey(`\u200b${key}`)).toBe(key);
    expect(normalizeOutageKey(`provider:fix\u00adture-crm`)).toBe(
      "provider:fixture-crm",
    );
    const alerts = [
      createProbeAlert({
        alertId: "c-a1",
        outageKey: `\u200b${key}`,
        source: "p1",
        raisedAtIso: now,
        severity: AlertSeverity.P1,
        message: "m",
      }),
      createProbeAlert({
        alertId: "c-a2",
        outageKey: key,
        source: "p2",
        raisedAtIso: "2026-11-21T18:00:01.000Z",
        severity: AlertSeverity.P1,
        message: "m",
      }),
    ];
    const incidents = groupAlertsIntoIncidents({
      alerts,
      incidentIdForOutageKey: (k) => `inc-${k}`,
    });
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.alertCount).toBe(2);
    expect(incidents[0]!.externalEffects).toBe("NONE");
  });

  it("harness + compiler mark T-X068 fixture ACCEPTED, never VERIFIED", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: now,
    });
    expect(harness.allPassed).toBe(true);
    const proof = harness.proofs.find(
      (p) => p.kind === SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED,
    );
    expect(proof).toBeDefined();
    expect(proof?.passed).toBe(true);
    expect(proof?.fixtureOnly).toBe(true);
    expect(proof?.details.some((d) => /J28:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J29:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J30:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J31:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J32:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J33:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J34:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J35:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J36:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J37:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J38:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J39:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J40:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J41:/i.test(d))).toBe(true);
    expect(proof?.details.some((d) => /J42:/i.test(d))).toBe(true);
    expect(
      proof?.details.some((d) => /externalEffects=NONE/i.test(d)),
    ).toBe(true);

    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-tx068-contract",
    });
    const row = compiled.caseResults.find((c) => c.caseId === "T-X068");
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
    const tx068 = run.run.caseResults.find((c) => c.caseId === "T-X068");
    expect(tx068?.status).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(String(tx068?.status).toUpperCase()).not.toBe("VERIFIED");
  });
});