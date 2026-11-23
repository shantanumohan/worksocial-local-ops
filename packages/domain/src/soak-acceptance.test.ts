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

  it("maps proof kinds to fixture cases including OFFBOARD_ACTIVE_TOKEN_RESIDUAL → T-X073; NO_DUPLICATE_EFFECTS stays unmapped", () => {
    expect(mapProofToFixtureCases(SoakProofKind.NO_DUPLICATE_EFFECTS)).toEqual(
      [],
    );
    expect(mapProofToFixtureCases(SoakProofKind.BACKUP_OMIT_RECEIPT)).toEqual([
      "T-X066",
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.RECOVER_ROTATE_RECONCILE),
    ).toEqual(["T-F24", "T-US-047"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.COMPETING_SUPERVISOR_LEASE),
    ).toEqual(["T-US-002", "T-X002"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SELF_APPROVAL_REJECTED),
    ).toEqual(["T-X018", "T-US-054"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL),
    ).toEqual(["T-X073"]);
    expect(expectedProofsForFixtureCase("T-X014")).toEqual([
      SoakProofKind.CRASH_RESTART,
      SoakProofKind.JOB_CONTINUITY,
    ]);
    expect(expectedProofsForFixtureCase("T-X066")).toEqual([
      SoakProofKind.BACKUP_OMIT_RECEIPT,
    ]);
    expect(expectedProofsForFixtureCase("T-F24")).toEqual([
      SoakProofKind.RECOVER_ROTATE_RECONCILE,
    ]);
    expect(expectedProofsForFixtureCase("T-US-047")).toEqual([
      SoakProofKind.RECOVER_ROTATE_RECONCILE,
    ]);
    expect(expectedProofsForFixtureCase("T-US-002")).toEqual([
      SoakProofKind.COMPETING_SUPERVISOR_LEASE,
    ]);
    expect(expectedProofsForFixtureCase("T-X002")).toEqual([
      SoakProofKind.COMPETING_SUPERVISOR_LEASE,
    ]);
    expect(expectedProofsForFixtureCase("T-X018")).toEqual([
      SoakProofKind.SELF_APPROVAL_REJECTED,
    ]);
    expect(expectedProofsForFixtureCase("T-US-054")).toEqual([
      SoakProofKind.SELF_APPROVAL_REJECTED,
    ]);
    expect(expectedProofsForFixtureCase("T-X073")).toEqual([
      SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EMERGENCY_STOP_AT_COMMIT),
    ).toEqual(["T-US-060"]);

    expect(expectedProofsForFixtureCase("T-X029")).toEqual([
      SoakProofKind.EXPLICIT_ACCOUNT_REBIND,
    ]);
    expect(mapProofToFixtureCases(SoakProofKind.EXPLICIT_ACCOUNT_REBIND)).toEqual([
      "T-X029",
    ]);
    expect(expectedProofsForFixtureCase("T-US-060")).toEqual([
      SoakProofKind.EMERGENCY_STOP_AT_COMMIT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.FORGED_BROWSER_ROLE_IGNORED),
    ).toEqual(["T-X005"]);
    expect(expectedProofsForFixtureCase("T-X005")).toEqual([
      SoakProofKind.FORGED_BROWSER_ROLE_IGNORED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED),
    ).toEqual(["T-X006"]);
    expect(expectedProofsForFixtureCase("T-X006")).toEqual([
      SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED),
    ).toEqual(["T-X019", "T-US-036"]);
    expect(expectedProofsForFixtureCase("T-X019")).toEqual([
      SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED,
    ]);
    expect(expectedProofsForFixtureCase("T-US-036")).toEqual([
      SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED,
    ]);
    expect(expectedProofsForFixtureCase("T-US-057")).toEqual([
      SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION),
    ).toEqual(["T-US-057"]);
    expect(expectedProofsForFixtureCase("T-US-024")).toEqual([
      SoakProofKind.AGENT_CANNOT_WIDEN_GRANT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.AGENT_CANNOT_WIDEN_GRANT),
    ).toEqual(["T-US-024"]);
    expect(expectedProofsForFixtureCase("T-US-042")).toEqual([
      SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED,
    ]);
    expect(expectedProofsForFixtureCase("T-X057")).toEqual([
      SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED),
    ).toEqual(["T-US-042", "T-X057"]);
    expect(expectedProofsForFixtureCase("T-US-044")).toEqual([
      SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES,
    ]);
    expect(expectedProofsForFixtureCase("T-X053")).toEqual([
      SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES),
    ).toEqual(["T-US-044", "T-X053"]);
    expect(expectedProofsForFixtureCase("T-US-018")).toEqual([
      SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
    ]);
    expect(expectedProofsForFixtureCase("T-X037")).toEqual([
      SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN),
    ).toEqual(["T-US-018", "T-X037"]);
    expect(expectedProofsForFixtureCase("T-X058")).toEqual([
      SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED),
    ).toEqual(["T-X058"]);
    expect(expectedProofsForFixtureCase("T-X069")).toEqual([
      SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA),
    ).toEqual(["T-X069"]);
    expect(expectedProofsForFixtureCase("T-X038")).toEqual([
      SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED),
    ).toEqual(["T-X038"]);
    expect(expectedProofsForFixtureCase("T-X039")).toEqual([
      SoakProofKind.METRIC_DENOMINATORS_HONEST,
    ]);
    expect(expectedProofsForFixtureCase("T-US-058")).toEqual([
      SoakProofKind.METRIC_DENOMINATORS_HONEST,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.METRIC_DENOMINATORS_HONEST),
    ).toEqual(["T-X039", "T-US-058"]);
    expect(expectedProofsForFixtureCase("T-US-046")).toEqual([
      SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION,
    ]);
    expect(expectedProofsForFixtureCase("T-X048")).toEqual([
      SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION),
    ).toEqual(["T-US-046", "T-X048"]);
    expect(expectedProofsForFixtureCase("T-US-010")).toEqual([
      SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO,
    ]);
    expect(expectedProofsForFixtureCase("T-X033")).toEqual([
      SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO),
    ).toEqual(["T-US-010", "T-X033"]);
    expect(expectedProofsForFixtureCase("T-US-008")).toEqual([
      SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
    ]);
    expect(expectedProofsForFixtureCase("T-X032")).toEqual([
      SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION),
    ).toEqual(["T-US-008", "T-X032"]);
    expect(expectedProofsForFixtureCase("T-X031")).toEqual([
      SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED),
    ).toEqual(["T-X031"]);
    expect(expectedProofsForFixtureCase("T-US-040")).toEqual([
      SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY,
    ]);
    expect(expectedProofsForFixtureCase("T-X049")).toEqual([
      SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY),
    ).toEqual(["T-US-040", "T-X049"]);
    expect(expectedProofsForFixtureCase("T-X017")).toEqual([
      SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE),
    ).toEqual(["T-X017"]);
    expect(expectedProofsForFixtureCase("T-X024")).toEqual([
      SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT),
    ).toEqual(["T-X024"]);
    expect(expectedProofsForFixtureCase("T-X011")).toEqual([
      SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED),
    ).toEqual(["T-X011"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION),
    ).toEqual(["T-X003"]);
    expect(expectedProofsForFixtureCase("T-X003")).toEqual([
      SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION,
    ]);
    expect(expectedProofsForFixtureCase("T-X015")).toEqual([
      SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES),
    ).toEqual(["T-X015"]);
    expect(expectedProofsForFixtureCase("T-X001")).toEqual([
      SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP),
    ).toEqual(["T-X001"]);

  });

    expect(expectedProofsForFixtureCase("T-X050")).toEqual([
      SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT,
      ),
    ).toEqual(["T-X050"]);

    expect(expectedProofsForFixtureCase("T-X009")).toEqual([
      SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO),
    ).toEqual(["T-X009"]);

  it("maps T-X021 to CONCURRENT_IDEMPOTENT_RELEASE only", () => {
    expect(expectedProofsForFixtureCase("T-X021")).toEqual([
      SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE),
    ).toEqual(["T-X021"]);
  });

  it("maps T-X022 to IDEMPOTENCY_KEY_PAYLOAD_MISMATCH only", () => {
    expect(expectedProofsForFixtureCase("T-X022")).toEqual([
      SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
    ]);
    expect(expectedProofsForFixtureCase("T-X065")).toEqual([
      SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED),
    ).toEqual(["T-X065"]);
    expect(
      mapProofToFixtureCases(SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH),
    ).toEqual(["T-X022"]);
    expect(expectedProofsForFixtureCase("T-X063")).toEqual([
      SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).toEqual(["T-X063"]);
  });

  it("maps T-X008 to FACT_CHANGES_AFTER_REVIEW_STALE only", () => {
    expect(expectedProofsForFixtureCase("T-X008")).toEqual([
      SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE),
    ).toEqual(["T-X008"]);
    expect(expectedProofsForFixtureCase("T-X012")).toEqual([
      SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED),
    ).toEqual(["T-X012"]);
    expect(expectedProofsForFixtureCase("T-X007")).toEqual([
      SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP,
      ),
    ).toEqual(["T-X007"]);
  });

  it("maps T-X013 to REPLAY_HISTORICAL_NO_REPEAT_IO only", () => {
    expect(expectedProofsForFixtureCase("T-X013")).toEqual([
      SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO),
    ).toEqual(["T-X013"]);
  });

  it("maps T-X045 to PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE only", () => {
    expect(expectedProofsForFixtureCase("T-X045")).toEqual([
      SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.PARTIAL_CAMPAIGN_DESTINATIONS_PER_STATE,
      ),
    ).toEqual(["T-X045"]);
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

  it("maps T-X027 to UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL only", () => {
    expect(expectedProofsForFixtureCase("T-X027")).toEqual([
      SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL),
    ).toEqual(["T-X027"]);
    expect(expectedProofsForFixtureCase("T-X004")).toEqual([
      SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED,
      ),
    ).toEqual(["T-X004"]);

    expect(expectedProofsForFixtureCase("T-X025")).toEqual([
      SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED,
      ),
    ).toEqual(["T-X025"]);
  });

  it("maps T-X043 to OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS only", () => {
    expect(expectedProofsForFixtureCase("T-X043")).toEqual([
      SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
      ),
    ).toEqual(["T-X043"]);
  });

  it("maps T-X026 to CONCURRENT_FINAL_BUDGET_RESERVATION_CAP only", () => {
    expect(expectedProofsForFixtureCase("T-X026")).toEqual([
      SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
      ),
    ).toEqual(["T-X026"]);
  });

  it("maps T-X052 to SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED only", () => {
    expect(expectedProofsForFixtureCase("T-X052")).toEqual([
      SoakProofKind.SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED,
      ),
    ).toEqual(["T-X052"]);
  });

  it("maps T-X054 to REPLY_SENT_CRM_RECONCILES_NO_RESEND only", () => {
    expect(expectedProofsForFixtureCase("T-X054")).toEqual([
      SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND,
      ),
    ).toEqual(["T-X054"]);
  });

  it("maps T-X055 to UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE only", () => {
    expect(expectedProofsForFixtureCase("T-X055")).toEqual([
      SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
      ),
    ).toEqual(["T-X055"]);
  });

  it("maps T-X056 to AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF only", () => {
    expect(expectedProofsForFixtureCase("T-X056")).toEqual([
      SoakProofKind.AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF,
      ),
    ).toEqual(["T-X056"]);
  });

  it("maps T-X059 / T-US-038 to DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING", () => {
    expect(expectedProofsForFixtureCase("T-X059")).toEqual([
      SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
    ]);
    expect(expectedProofsForFixtureCase("T-US-038")).toEqual([
      SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING,
      ),
    ).toEqual(["T-X059", "T-US-038"]);
  });

  it("maps T-X060 to CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM only", () => {
    expect(expectedProofsForFixtureCase("T-X060")).toEqual([
      SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
      ),
    ).toEqual(["T-X060"]);
  });

  it("maps T-X070 to VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES only", () => {
    expect(expectedProofsForFixtureCase("T-X070")).toEqual([
      SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).toEqual(["T-X070"]);
  });


  it("maps T-X028 to ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE only", () => {
    expect(expectedProofsForFixtureCase("T-X028")).toEqual([
      SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE,
      ),
    ).toEqual(["T-X028"]);
  });


  it("maps T-X044 to UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED only", () => {
    expect(expectedProofsForFixtureCase("T-X044")).toEqual([
      SoakProofKind.UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED,
      ),
    ).toEqual(["T-X044"]);
  });


  it("maps T-X023 to EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND only", () => {
    expect(expectedProofsForFixtureCase("T-X023")).toEqual([
      SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND),
    ).toEqual(["T-X023"]);
  });

  it("maps T-US-006 to UNBOUND_WRITE_PATH_FAIL_CLOSED only", () => {
    expect(expectedProofsForFixtureCase("T-US-006")).toEqual([
      SoakProofKind.UNBOUND_WRITE_PATH_FAIL_CLOSED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.UNBOUND_WRITE_PATH_FAIL_CLOSED),
    ).toEqual(["T-US-006"]);
  });



  it("maps T-X030 to RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE only", () => {
    expect(expectedProofsForFixtureCase("T-X030")).toEqual([
      SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE,
      ),
    ).toEqual(["T-X030"]);
  });

  it("maps T-US-052 to MOCKED_CONNECTOR_NOT_PRODUCTION_READY only", () => {
    expect(expectedProofsForFixtureCase("T-US-052")).toEqual([
      SoakProofKind.MOCKED_CONNECTOR_NOT_PRODUCTION_READY,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.MOCKED_CONNECTOR_NOT_PRODUCTION_READY,
      ),
    ).toEqual(["T-US-052"]);
  });


  it("maps T-X040 to LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE only", () => {
    expect(expectedProofsForFixtureCase("T-X040")).toEqual([
      SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE,
      ),
    ).toEqual(["T-X040"]);
  });

  it("maps T-US-012 to GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED only", () => {
    expect(expectedProofsForFixtureCase("T-US-012")).toEqual([
      SoakProofKind.GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED,
      ),
    ).toEqual(["T-US-012"]);
  });

  it("maps T-US-015 to CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY only", () => {
    expect(expectedProofsForFixtureCase("T-US-015")).toEqual([
      SoakProofKind.CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY,
      ),
    ).toEqual(["T-US-015"]);
  });

  it("maps T-US-017 to CONNECT_GEMINI_EVALUATION_EVAL_ONLY only", () => {
    expect(expectedProofsForFixtureCase("T-US-017")).toEqual([
      SoakProofKind.CONNECT_GEMINI_EVALUATION_EVAL_ONLY,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONNECT_GEMINI_EVALUATION_EVAL_ONLY,
      ),
    ).toEqual(["T-US-017"]);
  });

  it("maps T-US-019 to MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY only", () => {
    expect(expectedProofsForFixtureCase("T-US-019")).toEqual([
      SoakProofKind.MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY,
      ),
    ).toEqual(["T-US-019"]);
  });

  it("maps T-US-020 to SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION only", () => {
    expect(expectedProofsForFixtureCase("T-US-020")).toEqual([
      SoakProofKind.SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION,
      ),
    ).toEqual(["T-US-020"]);
  });

  it("maps T-US-021 to CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT only", () => {
    expect(expectedProofsForFixtureCase("T-US-021")).toEqual([
      SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT,
      ),
    ).toEqual(["T-US-021"]);
  });

  it("maps T-US-022 to UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED only", () => {
    expect(expectedProofsForFixtureCase("T-US-022")).toEqual([
      SoakProofKind.UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED,
      ),
    ).toEqual(["T-US-022"]);
  });

  it("maps T-US-023 to STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS only", () => {
    expect(expectedProofsForFixtureCase("T-US-023")).toEqual([
      SoakProofKind.STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS,
      ),
    ).toEqual(["T-US-023"]);
  });

  it("maps T-US-025 to LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME only", () => {
    expect(expectedProofsForFixtureCase("T-US-025")).toEqual([
      SoakProofKind.LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.LAUNCH_WORKSTREAM_SCHEDULE_MISSION_OUTCOME,
      ),
    ).toEqual(["T-US-025"]);
  });

  it("maps T-US-026 to MISSED_SCHEDULE_COALESCE_NO_BURST only", () => {
    expect(expectedProofsForFixtureCase("T-US-026")).toEqual([
      SoakProofKind.MISSED_SCHEDULE_COALESCE_NO_BURST,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.MISSED_SCHEDULE_COALESCE_NO_BURST),
    ).toEqual(["T-US-026"]);
  });

  it("maps T-US-027 to DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT only", () => {
    expect(expectedProofsForFixtureCase("T-US-027")).toEqual([
      SoakProofKind.DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DEMAND_PAGE_IMPROVEMENT_RELEASE_RECEIPT,
      ),
    ).toEqual(["T-US-027"]);
  });

  it("maps T-US-028 to KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE only", () => {
    expect(expectedProofsForFixtureCase("T-US-028")).toEqual([
      SoakProofKind.KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.KEYWORD_PROLIFERATION_ONE_USEFUL_UPDATE,
      ),
    ).toEqual(["T-US-028"]);
  });

  it("maps T-US-029 to CAMPAIGN_MANIFEST_DISTRIBUTION only", () => {
    expect(expectedProofsForFixtureCase("T-US-029")).toEqual([
      SoakProofKind.CAMPAIGN_MANIFEST_DISTRIBUTION,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CAMPAIGN_MANIFEST_DISTRIBUTION),
    ).toEqual(["T-US-029"]);
  });

  it("maps T-US-030 to UNCERTAIN_POST_RECONCILE_BEFORE_RETRY only", () => {
    expect(expectedProofsForFixtureCase("T-US-030")).toEqual([
      SoakProofKind.UNCERTAIN_POST_RECONCILE_BEFORE_RETRY,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNCERTAIN_POST_RECONCILE_BEFORE_RETRY,
      ),
    ).toEqual(["T-US-030"]);
  });

  it("maps T-US-031 to PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE only", () => {
    expect(expectedProofsForFixtureCase("T-US-031")).toEqual([
      SoakProofKind.PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.PAID_MEDIA_RECOMMENDATION_MUTATION_OR_FAILURE,
      ),
    ).toEqual(["T-US-031"]);
  });

  it("maps T-US-033 to EVAL_SUITE_ADJUDICATION_BACKLOG only", () => {
    expect(expectedProofsForFixtureCase("T-US-033")).toEqual([
      SoakProofKind.EVAL_SUITE_ADJUDICATION_BACKLOG,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EVAL_SUITE_ADJUDICATION_BACKLOG),
    ).toEqual(["T-US-033"]);
  });

  it("maps T-US-034 to PROVIDER_ERROR_NOT_PASS only", () => {
    expect(expectedProofsForFixtureCase("T-US-034")).toEqual([
      SoakProofKind.PROVIDER_ERROR_NOT_PASS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.PROVIDER_ERROR_NOT_PASS),
    ).toEqual(["T-US-034"]);
  });
});
