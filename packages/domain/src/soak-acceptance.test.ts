import { describe, expect, it } from "vitest";
import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  FORBIDDEN_SILENT_LIVE_STATUS,
  PILOT_SOAK_REQUIRED_MS,
  PilotGateStatus,
  PilotObservationKind,
  SOAK_FIXTURE_HARNESS_NOW_ISO,
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
import {
  defaultResponsePolicy,
  isWithinCoverageWindow,
} from "./inbox.js";

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

  it("maps T-US-056 to HONEST_OUTAGE_HOSTED_CONTACT_PATH only", () => {
    expect(expectedProofsForFixtureCase("T-US-056")).toEqual([
      SoakProofKind.HONEST_OUTAGE_HOSTED_CONTACT_PATH,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.HONEST_OUTAGE_HOSTED_CONTACT_PATH),
    ).toEqual(["T-US-056"]);
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

  it("maps T-X041 to INCOMPARABLE_TREND_INDICES_REJECTED only", () => {
    expect(expectedProofsForFixtureCase("T-X041")).toEqual([
      SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.INCOMPARABLE_TREND_INDICES_REJECTED),
    ).toEqual(["T-X041"]);
  });

  it("maps T-X042 to SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS only", () => {
    expect(expectedProofsForFixtureCase("T-X042")).toEqual([
      SoakProofKind.SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SCHEMA_DIFFERS_FROM_PAGE_GATE_FAILS),
    ).toEqual(["T-X042"]);
  });

  it("maps T-X046 to UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION only", () => {
    expect(expectedProofsForFixtureCase("T-X046")).toEqual([
      SoakProofKind.UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNSUPPORTED_BLOG_DESTINATION_NO_FAKE_PUBLICATION,
      ),
    ).toEqual(["T-X046"]);
  });

  it("maps T-X047 to LAYOUT_SPECIFIC_CAPACITY_MISMATCH_FILTERS only", () => {
    expect(expectedProofsForFixtureCase("T-X047")).toEqual([
      SoakProofKind.LAYOUT_SPECIFIC_CAPACITY_MISMATCH_FILTERS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.LAYOUT_SPECIFIC_CAPACITY_MISMATCH_FILTERS,
      ),
    ).toEqual(["T-X047"]);
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

  it("maps T-US-016 to CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED only", () => {
    expect(expectedProofsForFixtureCase("T-US-016")).toEqual([
      SoakProofKind.CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CLAUDE_RUNTIME_EVAL_AUTH_SEPARATED),
    ).toEqual(["T-US-016"]);
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

  it("maps T-US-035 to REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED only", () => {
    expect(expectedProofsForFixtureCase("T-US-035")).toEqual([
      SoakProofKind.REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.REVIEW_REVISE_RELEASE_RECEIPT_OR_BLOCKED,
      ),
    ).toEqual(["T-US-035"]);
  });

  it("maps T-US-049 to DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE only", () => {
    expect(expectedProofsForFixtureCase("T-US-049")).toEqual([
      SoakProofKind.DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DAILY_OWNER_REVIEW_OPERATING_KNOWLEDGE,
      ),
    ).toEqual(["T-US-049"]);
  });

  it("maps T-US-050 to OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE only", () => {
    expect(expectedProofsForFixtureCase("T-US-050")).toEqual([
      SoakProofKind.OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OWNER_BRIEF_ROOT_CAUSE_ACTIONABLE),
    ).toEqual(["T-US-050"]);
  });

  it("maps T-US-051 to DESIGN_RELEASE_READINESS_PACKET only", () => {
    expect(expectedProofsForFixtureCase("T-US-051")).toEqual([
      SoakProofKind.DESIGN_RELEASE_READINESS_PACKET,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.DESIGN_RELEASE_READINESS_PACKET),
    ).toEqual(["T-US-051"]);
  });

  it("maps T-US-053 to SECRETS_NEVER_IN_BROWSER_ASSETS only", () => {
    expect(expectedProofsForFixtureCase("T-US-053")).toEqual([
      SoakProofKind.SECRETS_NEVER_IN_BROWSER_ASSETS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SECRETS_NEVER_IN_BROWSER_ASSETS),
    ).toEqual(["T-US-053"]);
  });

  it("maps T-US-055 to KEYBOARD_JOURNEY_REDUCED_MOTION only", () => {
    expect(expectedProofsForFixtureCase("T-US-055")).toEqual([
      SoakProofKind.KEYBOARD_JOURNEY_REDUCED_MOTION,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.KEYBOARD_JOURNEY_REDUCED_MOTION),
    ).toEqual(["T-US-055"]);
  });

  it("maps T-US-059 to SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED only", () => {
    expect(expectedProofsForFixtureCase("T-US-059")).toEqual([
      SoakProofKind.SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SHARED_BRIEFS_REDACTED_PRIVATE_RETAINED,
      ),
    ).toEqual(["T-US-059"]);
  });

  it("maps T-US-003 to BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED only", () => {
    expect(expectedProofsForFixtureCase("T-US-003")).toEqual([
      SoakProofKind.BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.BUSINESS_TRUTH_FOLDERS_RESTORE_SECRETS_EXCLUDED,
      ),
    ).toEqual(["T-US-003"]);
  });

  it("maps T-US-004 to UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED only", () => {
    expect(expectedProofsForFixtureCase("T-US-004")).toEqual([
      SoakProofKind.UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.UNSAFE_FOLDERS_UNRESOLVED_FACTS_BLOCKED,
      ),
    ).toEqual(["T-US-004"]);
  });

  it("maps T-F01 to CREATE_TRUSTED_LOCAL_WORKSPACE only", () => {
    expect(expectedProofsForFixtureCase("T-F01")).toEqual([
      SoakProofKind.CREATE_TRUSTED_LOCAL_WORKSPACE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CREATE_TRUSTED_LOCAL_WORKSPACE),
    ).toEqual(["T-F01"]);
  });

  it("maps T-F02 to CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH only", () => {
    expect(expectedProofsForFixtureCase("T-F02")).toEqual([
      SoakProofKind.CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CHOOSE_FOLDERS_ESTABLISH_BUSINESS_TRUTH,
      ),
    ).toEqual(["T-F02"]);
  });

  it("maps T-F03 to MAP_SITES_PAGES_EDITABLE_SOURCES only", () => {
    expect(expectedProofsForFixtureCase("T-F03")).toEqual([
      SoakProofKind.MAP_SITES_PAGES_EDITABLE_SOURCES,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.MAP_SITES_PAGES_EDITABLE_SOURCES),
    ).toEqual(["T-F03"]);
  });

  it("maps T-F04 to CONNECT_GOOGLE_ANALYTICS_4 only", () => {
    expect(expectedProofsForFixtureCase("T-F04")).toEqual([
      SoakProofKind.CONNECT_GOOGLE_ANALYTICS_4,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONNECT_GOOGLE_ANALYTICS_4),
    ).toEqual(["T-F04"]);
  });

  it("maps T-F05 to CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY only", () => {
    expect(expectedProofsForFixtureCase("T-F05")).toEqual([
      SoakProofKind.CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY,
      ),
    ).toEqual(["T-F05"]);
  });

  it("maps T-F06 to CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS only", () => {
    expect(expectedProofsForFixtureCase("T-F06")).toEqual([
      SoakProofKind.CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS,
      ),
    ).toEqual(["T-F06"]);
  });

  it("maps T-F08 to CONNECT_CLAUDE_CODE_AND_TEST_API only", () => {
    expect(expectedProofsForFixtureCase("T-F08")).toEqual([
      SoakProofKind.CONNECT_CLAUDE_CODE_AND_TEST_API,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONNECT_CLAUDE_CODE_AND_TEST_API),
    ).toEqual(["T-F08"]);
  });

  it("maps T-F09 to CONNECT_GEMINI_INDEPENDENT_TESTING only", () => {
    expect(expectedProofsForFixtureCase("T-F09")).toEqual([
      SoakProofKind.CONNECT_GEMINI_INDEPENDENT_TESTING,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONNECT_GEMINI_INDEPENDENT_TESTING),
    ).toEqual(["T-F09"]);
  });

  it("maps T-F10 to MAP_CRM_FORMS_BOOKING_TRUTH only", () => {
    expect(expectedProofsForFixtureCase("T-F10")).toEqual([
      SoakProofKind.MAP_CRM_FORMS_BOOKING_TRUTH,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.MAP_CRM_FORMS_BOOKING_TRUTH),
    ).toEqual(["T-F10"]);
  });

  it("maps T-F11 to CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS only", () => {
    expect(expectedProofsForFixtureCase("T-F11")).toEqual([
      SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_CHANNELS),
    ).toEqual(["T-F11"]);
  });

  it("maps T-F12 to GRANT_STANDING_AUTONOMY_SAFELY only", () => {
    expect(expectedProofsForFixtureCase("T-F12")).toEqual([
      SoakProofKind.GRANT_STANDING_AUTONOMY_SAFELY,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.GRANT_STANDING_AUTONOMY_SAFELY),
    ).toEqual(["T-F12"]);
  });

  it("maps T-F13 to LAUNCH_WORKSTREAM_RECURRING_SCHEDULE only", () => {
    expect(expectedProofsForFixtureCase("T-F13")).toEqual([
      SoakProofKind.LAUNCH_WORKSTREAM_RECURRING_SCHEDULE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.LAUNCH_WORKSTREAM_RECURRING_SCHEDULE),
    ).toEqual(["T-F13"]);
  });

  it("maps T-F14 to TURN_DEMAND_INTO_PAGE_IMPROVEMENT only", () => {
    expect(expectedProofsForFixtureCase("T-F14")).toEqual([
      SoakProofKind.TURN_DEMAND_INTO_PAGE_IMPROVEMENT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.TURN_DEMAND_INTO_PAGE_IMPROVEMENT),
    ).toEqual(["T-F14"]);
  });

  it("maps T-F15 to CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN only", () => {
    expect(expectedProofsForFixtureCase("T-F15")).toEqual([
      SoakProofKind.CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CREATE_AND_DISTRIBUTE_ORIGINAL_CAMPAIGN,
      ),
    ).toEqual(["T-F15"]);
  });

  it("maps T-F16 to REVIEW_PAID_MEDIA_RECOMMENDATIONS only", () => {
    expect(expectedProofsForFixtureCase("T-F16")).toEqual([
      SoakProofKind.REVIEW_PAID_MEDIA_RECOMMENDATIONS,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.REVIEW_PAID_MEDIA_RECOMMENDATIONS),
    ).toEqual(["T-F16"]);
  });

  it("maps T-F20 to VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY only", () => {
    expect(expectedProofsForFixtureCase("T-F20")).toEqual([
      SoakProofKind.VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.VERIFY_FORM_TO_CRM_JOURNEY_CONTINUOUSLY,
      ),
    ).toEqual(["T-F20"]);
  });

  it("maps T-F22 to HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER only", () => {
    expect(expectedProofsForFixtureCase("T-F22")).toEqual([
      SoakProofKind.HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER,
      ),
    ).toEqual(["T-F22"]);
  });

  it("maps T-F19 to ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS only", () => {
    expect(expectedProofsForFixtureCase("T-F19")).toEqual([
      SoakProofKind.ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.ANALYZE_PERFORMANCE_AND_TEST_HYPOTHESIS,
      ),
    ).toEqual(["T-F19"]);
  });


  it("maps T-F18 to REVIEW_REVISE_AND_RELEASE_A_CHANGE only", () => {
    expect(expectedProofsForFixtureCase("T-F18")).toEqual([
      SoakProofKind.REVIEW_REVISE_AND_RELEASE_A_CHANGE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.REVIEW_REVISE_AND_RELEASE_A_CHANGE,
      ),
    ).toEqual(["T-F18"]);
  });

  it("maps T-F21 to DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT only", () => {
    expect(expectedProofsForFixtureCase("T-F21")).toEqual([
      SoakProofKind.DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DIAGNOSE_AND_REPAIR_PERMITTED_DEFECT,
      ),
    ).toEqual(["T-F21"]);
  });

  it("maps T-F26 to CALIBRATE_DESIGN_RELEASE_READINESS only", () => {
    expect(expectedProofsForFixtureCase("T-F26")).toEqual([
      SoakProofKind.CALIBRATE_DESIGN_RELEASE_READINESS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CALIBRATE_DESIGN_RELEASE_READINESS,
      ),
    ).toEqual(["T-F26"]);
  });

  it("maps T-F23 to TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT only", () => {
    expect(expectedProofsForFixtureCase("T-F23")).toEqual([
      SoakProofKind.TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.TEST_SEMANTIC_SEARCH_IMPROVE_NO_RESULT),
    ).toEqual(["T-F23"]);
  });
  it("maps T-F17 to RUN_CLAUDE_GEMINI_EVALUATION_SUITES only", () => {
    expect(expectedProofsForFixtureCase("T-F17")).toEqual([
      SoakProofKind.RUN_CLAUDE_GEMINI_EVALUATION_SUITES,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.RUN_CLAUDE_GEMINI_EVALUATION_SUITES),
    ).toEqual(["T-F17"]);
  });

  it("maps T-F25 to OPERATE_DAILY_OWNER_REVIEW only", () => {
    expect(expectedProofsForFixtureCase("T-F25")).toEqual([
      SoakProofKind.OPERATE_DAILY_OWNER_REVIEW,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.OPERATE_DAILY_OWNER_REVIEW),
    ).toEqual(["T-F25"]);
  });

  it("maps T-US-041 to DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF only", () => {
    expect(expectedProofsForFixtureCase("T-US-041")).toEqual([
      SoakProofKind.DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.DIAGNOSE_REPAIR_DEFECT_RESOLVED_OR_HANDOFF,
      ),
    ).toEqual(["T-US-041"]);
  });

  it("maps T-US-032 to EXACT_FINANCIAL_BOUNDARIES_PRESERVED only", () => {
    expect(expectedProofsForFixtureCase("T-US-032")).toEqual([
      SoakProofKind.EXACT_FINANCIAL_BOUNDARIES_PRESERVED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.EXACT_FINANCIAL_BOUNDARIES_PRESERVED),
    ).toEqual(["T-US-032"]);
  });

  it("maps T-US-037 to PORTABLE_ANALYSIS_ARTIFACT only", () => {
    expect(expectedProofsForFixtureCase("T-US-037")).toEqual([
      SoakProofKind.PORTABLE_ANALYSIS_ARTIFACT,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.PORTABLE_ANALYSIS_ARTIFACT),
    ).toEqual(["T-US-037"]);
  });

  it("maps T-US-001 to TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS only", () => {
    expect(expectedProofsForFixtureCase("T-US-001")).toEqual([
      SoakProofKind.TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS,
      ),
    ).toEqual(["T-US-001"]);
  });

  it("maps T-US-039 to FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT only", () => {
    expect(expectedProofsForFixtureCase("T-US-039")).toEqual([
      SoakProofKind.FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT,
      ),
    ).toEqual(["T-US-039"]);
  });

  it("maps T-US-043 to AFTER_HOURS_HANDOFF_ACKNOWLEDGED only", () => {
    expect(expectedProofsForFixtureCase("T-US-043")).toEqual([
      SoakProofKind.AFTER_HOURS_HANDOFF_ACKNOWLEDGED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.AFTER_HOURS_HANDOFF_ACKNOWLEDGED),
    ).toEqual(["T-US-043"]);
  });

  it("maps T-US-007 to CONNECT_GA4_READ_READY_NEXT_SYNC only", () => {
    expect(expectedProofsForFixtureCase("T-US-007")).toEqual([
      SoakProofKind.CONNECT_GA4_READ_READY_NEXT_SYNC,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONNECT_GA4_READ_READY_NEXT_SYNC),
    ).toEqual(["T-US-007"]);
  });

  it("maps T-US-005 to SITE_PAGE_EDITABLE_SOURCES_BASELINE only", () => {
    expect(expectedProofsForFixtureCase("T-US-005")).toEqual([
      SoakProofKind.SITE_PAGE_EDITABLE_SOURCES_BASELINE,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SITE_PAGE_EDITABLE_SOURCES_BASELINE),
    ).toEqual(["T-US-005"]);
  });

  it("maps T-US-009 to CONNECT_GSC_SCHEDULE_WATERMARK only", () => {
    expect(expectedProofsForFixtureCase("T-US-009")).toEqual([
      SoakProofKind.CONNECT_GSC_SCHEDULE_WATERMARK,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONNECT_GSC_SCHEDULE_WATERMARK),
    ).toEqual(["T-US-009"]);
  });

  it("maps T-US-011 to CONNECT_GOOGLE_ADS_ANALYZE_ONLY only", () => {
    expect(expectedProofsForFixtureCase("T-US-011")).toEqual([
      SoakProofKind.CONNECT_GOOGLE_ADS_ANALYZE_ONLY,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.CONNECT_GOOGLE_ADS_ANALYZE_ONLY),
    ).toEqual(["T-US-011"]);
  });

  it("maps T-US-045 to SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON only", () => {
    expect(expectedProofsForFixtureCase("T-US-045")).toEqual([
      SoakProofKind.SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SEMANTIC_SEARCH_NO_RESULT_EVAL_COMPARISON,
      ),
    ).toEqual(["T-US-045"]);
  });

  it("maps T-X051 to WRONG_ZOHO_ORGANIZATION_IDENTITY_MISMATCH only", () => {
    expect(expectedProofsForFixtureCase("T-X051")).toEqual([
      SoakProofKind.WRONG_ZOHO_ORGANIZATION_IDENTITY_MISMATCH,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.WRONG_ZOHO_ORGANIZATION_IDENTITY_MISMATCH,
      ),
    ).toEqual(["T-X051"]);
  });

  it("maps T-X062 to SSE_GAP_FULL_STATE_RESYNC only", () => {
    expect(expectedProofsForFixtureCase("T-X062")).toEqual([
      SoakProofKind.SSE_GAP_FULL_STATE_RESYNC,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.SSE_GAP_FULL_STATE_RESYNC),
    ).toEqual(["T-X062"]);
  });

  it("maps T-X061 to KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG only", () => {
    expect(expectedProofsForFixtureCase("T-X061")).toEqual([
      SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.KEYBOARD_FOCUS_RESTORE_AFTER_DIALOG,
      ),
    ).toEqual(["T-X061"]);
  });

  it("maps T-X068 to THIRTY_ALERTS_ONE_OUTAGE_GROUPED only", () => {
    expect(expectedProofsForFixtureCase("T-X068")).toEqual([
      SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.THIRTY_ALERTS_ONE_OUTAGE_GROUPED),
    ).toEqual(["T-X068"]);
  });

  it("maps T-X072 to CUSTOMER_DATA_EVAL_REDACTION_BLOCKS only", () => {
    expect(expectedProofsForFixtureCase("T-X072")).toEqual([
      SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.CUSTOMER_DATA_EVAL_REDACTION_BLOCKS,
      ),
    ).toEqual(["T-X072"]);
  });

  it("maps T-X064 to SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP only", () => {
    expect(expectedProofsForFixtureCase("T-X064")).toEqual([
      SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
      ),
    ).toEqual(["T-X064"]);
  });

  it("maps T-X071 to HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE only", () => {
    expect(expectedProofsForFixtureCase("T-X071")).toEqual([
      SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.HOST_OFFLINE_PUBLIC_DISCOVERY_UNAVAILABLE,
      ),
    ).toEqual(["T-X071"]);
  });

  it("maps T-X067 to INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED only", () => {
    expect(expectedProofsForFixtureCase("T-X067")).toEqual([
      SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
    ]);
    expect(
      mapProofToFixtureCases(
        SoakProofKind.INCOMPATIBLE_WORKFLOW_UPGRADE_BLOCKED_OR_RETAINED,
      ),
    ).toEqual(["T-X067"]);
  });

  it("maps T-X034 to ADS_TEST_PROJECT_PRODUCTION_BLOCKED only", () => {
    expect(expectedProofsForFixtureCase("T-X034")).toEqual([
      SoakProofKind.ADS_TEST_PROJECT_PRODUCTION_BLOCKED,
    ]);
    expect(
      mapProofToFixtureCases(SoakProofKind.ADS_TEST_PROJECT_PRODUCTION_BLOCKED),
    ).toEqual(["T-X034"]);
  });

  it("pins SOAK_FIXTURE_HARNESS_NOW_ISO inside after-hours coverage", () => {
    const policy = defaultResponsePolicy(SOAK_FIXTURE_HARNESS_NOW_ISO);
    expect(
      isWithinCoverageWindow(policy, SOAK_FIXTURE_HARNESS_NOW_ISO),
    ).toBe(true);
  });

});
