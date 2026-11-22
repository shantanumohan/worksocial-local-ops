import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  AcceptanceCaseStatus,
  PilotGateStatus,
  PILOT_SOAK_REQUIRED_MS,
  SoakProofKind,
} from "@worksocial/domain";
import { createFileSoakStore } from "@worksocial/persistence";
import { createSoakService } from "./service.js";
import { runSoakRecoveryHarness } from "./harness.js";
import { compileAcceptanceEvidence } from "./evidence-compiler.js";

describe("soak service (M9)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ws-soak-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("passes crash-restart through offboard-active-token soak proofs", async () => {
    const result = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    expect(result.allPassed).toBe(true);
    expect(result.proofs).toHaveLength(74);
    expect(result.proofs.every((p) => p.passed)).toBe(true);
    expect(
      result.proofs.every((p) =>
        p.kind === SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION ||
        p.kind === SoakProofKind.UNBOUND_WRITE_PATH_FAIL_CLOSED ||
        p.kind === SoakProofKind.GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED ||
        p.kind === SoakProofKind.CONNECT_CLAUDE_CODE_TEST_API_EVAL_ONLY ||
        p.kind === SoakProofKind.CONNECT_GEMINI_EVALUATION_EVAL_ONLY ||
        p.kind === SoakProofKind.MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY ||
        p.kind === SoakProofKind.SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION ||
        p.kind === SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT ||
        p.kind === SoakProofKind.UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED ||
        p.kind === SoakProofKind.STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS
          ? p.applyAttemptCount === 0
          : p.applyAttemptCount === 1,
      ),
    ).toBe(true);
    expect(
      result.proofs.some((p) => p.kind === SoakProofKind.BACKUP_OMIT_RECEIPT),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.RECOVER_ROTATE_RECONCILE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.COMPETING_SUPERVISOR_LEASE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some((p) => p.kind === SoakProofKind.SELF_APPROVAL_REJECTED),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.EMERGENCY_STOP_AT_COMMIT,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.FORGED_BROWSER_ROLE_IGNORED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.AGENT_CANNOT_WIDEN_GRANT,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.METRIC_DENOMINATORS_HONEST,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.STOP_BEFORE_DISPATCH_NO_MUTATION,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.IDEMPOTENCY_KEY_PAYLOAD_MISMATCH,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.WORKER_BROWSER_AUTH_STATE_OS_DENIED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.INDIRECT_PROMPT_INJECTION_EXFIL_DENIED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.REPLAY_HISTORICAL_NO_REPEAT_IO,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.OPTIMIZATION_BREAKS_CTA_JOURNEY_FAILS,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.CONCURRENT_FINAL_BUDGET_RESERVATION_CAP,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind ===
          SoakProofKind.SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind ===
          SoakProofKind.UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind ===
          SoakProofKind.VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind ===
          SoakProofKind.ACTUAL_COST_EXCEEDS_ESTIMATE_OVERRUN_VISIBLE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.UNLICENSED_VENUE_MEDIA_PUBLISH_BLOCKED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) => p.kind === SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.MOCKED_CONNECTOR_NOT_PRODUCTION_READY,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.RATE_LIMIT_BOUNDED_BACKOFF_PRESERVES_DEADLINE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind ===
          SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind ===
          SoakProofKind.SYNTHETIC_LEADS_CLASSIFIED_NO_COMMERCE_POLLUTION,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.CONNECT_LOCAL_SOCIAL_INBOX_TEST_ARTIFACT,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind ===
          SoakProofKind.UNSUPPORTED_DESTINATION_CAPABILITIES_RESPECTED,
      ),
    ).toBe(true);
    expect(
      result.proofs.some(
        (p) =>
          p.kind === SoakProofKind.STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS,
      ),
    ).toBe(true);
  });

  it("compiles fixture ACCEPTED for complete proof sets including T-US-023", async () => {
    const harness = await runSoakRecoveryHarness({
      stateDir: dir,
      nowIso: "2026-11-21T18:00:00.000Z",
    });
    const compiled = compileAcceptanceEvidence({
      proofs: harness.proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-test-compile-1",
    });
    expect(compiled.blockedLiveVerified).toBe(true);
    expect(compiled.chatgptAds.allowed).toBe(false);
    const accepted = compiled.caseResults.filter(
      (c) => c.status === AcceptanceCaseStatus.ACCEPTED,
    );
    expect(accepted.map((c) => c.caseId).sort()).toEqual([
      "T-F24",
      "T-US-002",
      "T-US-006",
      "T-US-008",
      "T-US-010",
      "T-US-012",
      "T-US-015",
      "T-US-017",
      "T-US-018",
      "T-US-019",
      "T-US-020",
      "T-US-021",
      "T-US-022",
      "T-US-023",
      "T-US-024",
      "T-US-036",
      "T-US-038",
      "T-US-040",
      "T-US-042",
      "T-US-044",
      "T-US-046",
      "T-US-047",
      "T-US-048",
      "T-US-052",
      "T-US-054",
      "T-US-057",
      "T-US-058",
      "T-US-060",
      "T-X001",
      "T-X002",
      "T-X003",
      "T-X004",
      "T-X005",
      "T-X006",
      "T-X007",
      "T-X008",
      "T-X009",
      "T-X010",
      "T-X011",
      "T-X012",
      "T-X013",
      "T-X014",
      "T-X015",
      "T-X016",
      "T-X017",
      "T-X018",
      "T-X019",
      "T-X020",
      "T-X021",
      "T-X022",
      "T-X023",
      "T-X024",
      "T-X025",
      "T-X026",
      "T-X027",
      "T-X028",
      "T-X029",
      "T-X030",
      "T-X031",
      "T-X032",
      "T-X033",
      "T-X037",
      "T-X038",
      "T-X039",
      "T-X040",
      "T-X043",
      "T-X044",
      "T-X045",
      "T-X048",
      "T-X049",
      "T-X050",
      "T-X052",
      "T-X053",
      "T-X054",
      "T-X055",
      "T-X056",
      "T-X057",
      "T-X058",
      "T-X059",
      "T-X060",
      "T-X063",
      "T-X065",
      "T-X066",
      "T-X069",
      "T-X070",
      "T-X073"
    ]);
    expect(compiled.caseResults.every((c) => c.status !== "VERIFIED")).toBe(
      true,
    );
    expect(
      accepted.every(
        (c) =>
          c.artifactId?.startsWith(`art-fixture-${c.caseId.toLowerCase()}-`),
      ),
    ).toBe(true);
    const tx066 = accepted.find((c) => c.caseId === "T-X066");
    expect(tx066?.environment).toBe("fixture");
    expect(accepted.find((c) => c.caseId === "T-F24")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X017")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X004")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X011")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X009")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X015")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X001")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X008")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X022")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-US-022")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-US-023")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X025")?.environment).toBe(
      "fixture",
    );
    expect(accepted.find((c) => c.caseId === "T-X026")?.environment).toBe(
      "fixture",
    );
  });

  it("does not ACCEPTED T-X014 when crash-restart fails but job continuity passes", () => {
    const proofs = [
      {
        proofId: "p-crash-fail",
        kind: SoakProofKind.CRASH_RESTART,
        passed: false,
        details: ["restart failed"],
        applyAttemptCount: 1,
        operationId: "op-1",
        createdAtIso: "2026-11-21T18:00:00.000Z",
        fixtureOnly: true as const,
      },
      {
        proofId: "p-job-ok",
        kind: SoakProofKind.JOB_CONTINUITY,
        passed: true,
        details: ["job ok"],
        applyAttemptCount: 1,
        operationId: "op-2",
        createdAtIso: "2026-11-21T18:00:00.000Z",
        fixtureOnly: true as const,
      },
    ];
    const compiled = compileAcceptanceEvidence({
      proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-partial-tx014",
      caseIds: ["T-X014"],
    });
    expect(compiled.caseResults).toHaveLength(1);
    expect(compiled.caseResults[0]!.status).toBe(AcceptanceCaseStatus.FAILED);
    expect(compiled.caseResults[0]!.artifactId).toBeNull();
    expect(compiled.artifacts).toHaveLength(0);
    expect(
      compiled.caseResults[0]!.reasons.some((r) => /failed|Incomplete/i.test(r)),
    ).toBe(true);
  });

  it("does not ACCEPTED T-X066 from retry-only no-dup proof", () => {
    const proofs = [
      {
        proofId: "p-nodup",
        kind: SoakProofKind.NO_DUPLICATE_EFFECTS,
        passed: true,
        details: ["retry idempotent"],
        applyAttemptCount: 1,
        operationId: "op-nodup",
        createdAtIso: "2026-11-21T18:00:00.000Z",
        fixtureOnly: true as const,
      },
    ];
    const compiled = compileAcceptanceEvidence({
      proofs,
      nowIso: "2026-11-21T18:01:00.000Z",
      runId: "soak-nodup-only",
      caseIds: ["T-X014", "T-X020", "T-US-048", "T-X066"],
    });
    expect(
      compiled.caseResults.every((c) => c.status === AcceptanceCaseStatus.NOT_RUN),
    ).toBe(true);
    expect(compiled.artifacts).toHaveLength(0);
    expect(
      compiled.caseResults.find((c) => c.caseId === "T-X066")?.status,
    ).toBe(AcceptanceCaseStatus.NOT_RUN);
  });

  it("records soak run with pilot gate NOT_MET; client-forged 72h clock cannot set MET", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    // Inject a clock that jumps 72h between start and end of the same run —
    // still requires observation continuity heartbeats for MET, and proves
    // request-body claim dates are not part of the API.
    let tick = Date.parse("2026-11-21T18:00:00.000Z");
    const result = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T18:00:00.000Z",
      now: () => {
        const d = new Date(tick);
        // After first read (start), jump 72h for end — but no heartbeats in between.
        tick += PILOT_SOAK_REQUIRED_MS;
        return d;
      },
    });
    expect(result.ok).toBe(true);
    expect(result.run.pilotGate.status).toBe(PilotGateStatus.NOT_MET);
    expect(result.run.pilotGate.serverObservationsOnly).toBe(true);
    expect(result.run.pilotGate.reasons.some((r) => /gap/i.test(r))).toBe(true);
    expect(result.run.r1CompleteClaimed).toBe(false);
    expect(result.run.externalEffects).toBe("NONE");
    expect(result.run.liveWiring.temporal).toBe("NOT_WIRED");
    expect(soak.status().chatgptAdsWiring).toBe("NOT_WIRED");
    expect(
      result.run.caseResults.find((c) => c.caseId === "T-X066")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(
      soak.listCases().find((c) => c.caseId === "T-X066")?.status,
    ).toBe(AcceptanceCaseStatus.ACCEPTED);
    expect(soak.listArtifacts().length).toBeGreaterThan(0);
    expect(soak.ownerReport().acceptedCases.length).toBe(86);
  });

  it("preserves unique artifact ids across two soak runs", async () => {
    const soak = createSoakService(createFileSoakStore(dir));
    const first = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T18:00:00.000Z",
    });
    const second = await soak.runFixtureSoak({
      harnessNowIso: "2026-11-21T18:10:00.000Z",
    });
    const firstIds = first.run.caseResults
      .filter((c) => c.artifactId)
      .map((c) => c.artifactId!);
    const secondIds = second.run.caseResults
      .filter((c) => c.artifactId)
      .map((c) => c.artifactId!);
    expect(firstIds.length).toBeGreaterThan(0);
    expect(secondIds.length).toBeGreaterThan(0);
    for (const id of firstIds) {
      expect(secondIds).not.toContain(id);
  }
    const stored = soak.listArtifacts(200).map((a) => a.artifactId);
    for (const id of [...firstIds, ...secondIds]) {
      expect(stored).toContain(id);
  }
  });
});
