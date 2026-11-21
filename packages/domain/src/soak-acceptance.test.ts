import { describe, expect, it } from "vitest";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  FORBIDDEN_SILENT_LIVE_STATUS,
  PILOT_SOAK_REQUIRED_MS,
  PilotGateStatus,
  PilotObservationKind,
  SoakProofKind,
  buildRedactedArtifact,
  evaluatePilotGate,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
  redactEvidenceSummary,
  soakChatGptAdsBlocked,
  uniqueFixtureEvidenceArtifactId,
  validateAcceptanceCaseStatus,
} from "./soak-acceptance.js";

function allProofs(ended: string) {
  return [
    SoakProofKind.CRASH_RESTART,
    SoakProofKind.NO_DUPLICATE_EFFECTS,
    SoakProofKind.JOB_CONTINUITY,
    SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
  ].map((kind, i) => ({
    proofId: `p-${i}`,
    kind,
    passed: true,
    details: ["ok"],
    applyAttemptCount: 1,
    operationId: `op-${i}`,
    createdAtIso: ended,
    fixtureOnly: true as const,
  }));
}

describe("soak-acceptance domain", () => {
  it("rejects VERIFIED and ACCEPTED without evidence", () => {
    const verified = validateAcceptanceCaseStatus({
      status: FORBIDDEN_SILENT_LIVE_STATUS,
      environment: AcceptanceEnvironment.FIXTURE,
      evidenceArtifactId: "art-1",
    });
    expect(verified.ok).toBe(false);

    const bare = validateAcceptanceCaseStatus({
      status: AcceptanceCaseStatus.ACCEPTED,
      environment: AcceptanceEnvironment.FIXTURE,
      evidenceArtifactId: null,
    });
    expect(bare.ok).toBe(false);

    const liveAccepted = validateAcceptanceCaseStatus({
      status: AcceptanceCaseStatus.ACCEPTED,
      environment: AcceptanceEnvironment.AUTHORIZED_PRODUCTION,
      evidenceArtifactId: "art-1",
    });
    expect(liveAccepted.ok).toBe(false);
  });

  it("accepts ACCEPTED with fixture evidence", () => {
    const ok = validateAcceptanceCaseStatus({
      status: AcceptanceCaseStatus.ACCEPTED,
      environment: AcceptanceEnvironment.FIXTURE,
      evidenceArtifactId: "art-fixture-tx014",
    });
    expect(ok).toEqual({ ok: true });
  });

  it("keeps 72h pilot gate unmet for short server observations even when proofs pass", () => {
    const started = "2026-11-21T00:00:00.000Z";
    const ended = "2026-11-21T00:05:00.000Z";
    const gate = evaluatePilotGate({
      observations: [
        { kind: PilotObservationKind.START, recordedAtIso: started },
        { kind: PilotObservationKind.HEARTBEAT, recordedAtIso: "2026-11-21T00:02:00.000Z" },
        { kind: PilotObservationKind.END, recordedAtIso: ended },
      ],
      proofs: allProofs(ended),
    });
    expect(gate.status).toBe(PilotGateStatus.NOT_MET);
    expect(gate.requiredMs).toBe(PILOT_SOAK_REQUIRED_MS);
    expect(gate.observedMs).toBe(5 * 60 * 1000);
    expect(gate.serverObservationsOnly).toBe(true);
    expect(gate.reasons.some((r) => /72h/.test(r))).toBe(true);
  });

  it("meets pilot gate only after server-recorded 72h window with continuity and all proofs", () => {
    const started = "2026-11-18T00:00:00.000Z";
    const ended = "2026-11-21T00:00:00.000Z";
    const startMs = Date.parse(started);
    const observations = [
      { kind: PilotObservationKind.START, recordedAtIso: started },
      // Heartbeats every 6h inclusive so continuity gaps stay within the default max.
      ...Array.from({ length: 11 }, (_, i) => ({
        kind: PilotObservationKind.HEARTBEAT,
        recordedAtIso: new Date(startMs + (i + 1) * 6 * 60 * 60 * 1000).toISOString(),
      })),
      { kind: PilotObservationKind.END, recordedAtIso: ended },
    ];
    const gate = evaluatePilotGate({
      observations,
      proofs: allProofs(ended),
    });
    expect(gate.status).toBe(PilotGateStatus.MET);
    expect(gate.observedMs).toBe(PILOT_SOAK_REQUIRED_MS);
    expect(gate.serverObservationsOnly).toBe(true);
  });

  it("does not treat client-forged claim-date pairs as MET without server observations", () => {
    // Simulate what a forged POST body used to do: pass 72h-apart claim dates.
    // evaluatePilotGate no longer accepts those fields — empty/short server obs stay NOT_MET.
    const forgedStart = "2026-11-18T00:00:00.000Z";
    const forgedEnd = "2026-11-21T00:00:00.000Z";
    const gate = evaluatePilotGate({
      observations: [],
      proofs: allProofs(forgedEnd),
    });
    expect(gate.status).toBe(PilotGateStatus.NOT_MET);
    expect(gate.observedMs).toBe(0);
    expect(gate.reasons.some((r) => /server-recorded/i.test(r))).toBe(true);

    // Even constructing observations from forged strings is only valid when the
    // service itself minted them via server clock — HTTP rejects claim dates.
    const forgedAsObs = evaluatePilotGate({
      observations: [
        { kind: PilotObservationKind.START, recordedAtIso: forgedStart },
        { kind: PilotObservationKind.END, recordedAtIso: forgedEnd },
      ],
      proofs: allProofs(forgedEnd),
      // Huge gap without heartbeats breaks continuity
      maxObservationGapMs: 6 * 60 * 60 * 1000,
    });
    expect(forgedAsObs.status).toBe(PilotGateStatus.NOT_MET);
    expect(forgedAsObs.reasons.some((r) => /gap/i.test(r))).toBe(true);
  });

  it("maps BACKUP_OMIT_RECEIPT to T-X066; NO_DUPLICATE_EFFECTS stays unmapped", () => {
    expect(mapProofToFixtureCases(SoakProofKind.NO_DUPLICATE_EFFECTS)).toEqual(
      [],
    );
    expect(mapProofToFixtureCases(SoakProofKind.BACKUP_OMIT_RECEIPT)).toEqual([
      "T-X066",
    ]);
    expect(expectedProofsForFixtureCase("T-X014")).toEqual([
      SoakProofKind.CRASH_RESTART,
      SoakProofKind.JOB_CONTINUITY,
    ]);
    expect(expectedProofsForFixtureCase("T-X066")).toEqual([
      SoakProofKind.BACKUP_OMIT_RECEIPT,
    ]);
  });

  it("builds unique per-run artifact ids", () => {
    const a = uniqueFixtureEvidenceArtifactId("T-X014", "soak-abcdef123456");
    const b = uniqueFixtureEvidenceArtifactId("T-X014", "soak-zzz999888777");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^art-fixture-t-x014-/);
  });

  it("redacts secrets and blocks ChatGPT Ads", () => {
    expect(
      redactEvidenceSummary("token=abc123 Bearer xyz password: hunter2 a@b.co"),
    ).toMatch(/REDACTED/);
    const ads = soakChatGptAdsBlocked();
    expect(ads.allowed).toBe(false);
    expect(ads.wiring).toBe("NOT_WIRED");
  });

  it("builds redacted fixture artifacts only", () => {
    const art = buildRedactedArtifact({
      artifactId: "art-1",
      caseId: "T-X014",
      environment: AcceptanceEnvironment.FIXTURE,
      summary: "restart proof token=secret",
      proofKinds: [SoakProofKind.CRASH_RESTART],
      evidenceRef: "evidence/art-1.json",
      createdAtIso: "2026-11-21T12:00:00.000Z",
    });
    expect(art.redacted).toBe(true);
    expect(art.liveProviderSuccessClaimed).toBe(false);
    expect(art.summary).toMatch(/REDACTED/);
    expect(() =>
      buildRedactedArtifact({
        artifactId: "art-bad",
        caseId: "T-F24",
        environment: AcceptanceEnvironment.AUTHORIZED_PRODUCTION,
        summary: "nope",
        proofKinds: [],
        evidenceRef: "x",
        createdAtIso: "2026-11-21T12:00:00.000Z",
      }),
    ).toThrow(/authorized_production/);
  });
});
