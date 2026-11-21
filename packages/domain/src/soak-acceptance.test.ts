import { describe, expect, it } from "vitest";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  FORBIDDEN_SILENT_LIVE_STATUS,
  PILOT_SOAK_REQUIRED_MS,
  PilotGateStatus,
  SoakProofKind,
  buildRedactedArtifact,
  evaluatePilotGate,
  redactEvidenceSummary,
  soakChatGptAdsBlocked,
  validateAcceptanceCaseStatus,
} from "./soak-acceptance.js";

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

  it("keeps 72h pilot gate unmet for short soaks even when proofs pass", () => {
    const started = "2026-11-21T00:00:00.000Z";
    const ended = "2026-11-21T00:05:00.000Z";
    const proofs = [
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

    const gate = evaluatePilotGate({ startedAtIso: started, endedAtIso: ended, proofs });
    expect(gate.status).toBe(PilotGateStatus.NOT_MET);
    expect(gate.requiredMs).toBe(PILOT_SOAK_REQUIRED_MS);
    expect(gate.observedMs).toBe(5 * 60 * 1000);
    expect(gate.reasons.some((r) => /72h/.test(r))).toBe(true);
  });

  it("meets pilot gate only after 72h and all proofs", () => {
    const started = "2026-11-18T00:00:00.000Z";
    const ended = "2026-11-21T00:00:00.000Z";
    const proofs = [
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
    const gate = evaluatePilotGate({ startedAtIso: started, endedAtIso: ended, proofs });
    expect(gate.status).toBe(PilotGateStatus.MET);
    expect(gate.observedMs).toBe(PILOT_SOAK_REQUIRED_MS);
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
