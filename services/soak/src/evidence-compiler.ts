/**
 * Acceptance evidence compiler — runs selected catalog cases in fixture
 * (declared) environments, emits redacted artifacts, marks ACCEPTED only
 * with the complete expected proof set and no failed related proofs.
 * Never silently VERIFIED for live.
 */

import {
  AcceptanceCaseStatus,
  AcceptanceEnvironment,
  SOAK_FIXTURE_CASE_IDS,
  buildRedactedArtifact,
  expectedProofsForFixtureCase,
  mapProofToFixtureCases,
  soakChatGptAdsBlocked,
  uniqueFixtureEvidenceArtifactId,
  validateAcceptanceCaseStatus,
  type AcceptanceCaseEvidenceRecord,
  type RedactedEvidenceArtifact,
  type SoakProofRecord,
  type SoakFixtureCaseId,
  type SoakProofKindValue,
} from "@worksocial/domain";

export type EvidenceCompileInput = {
  proofs: readonly SoakProofRecord[];
  nowIso: string;
  /** Immutable discriminator so historical run refs keep provenance. */
  runId: string;
  /** Optional override; default is the soak fixture case set. */
  caseIds?: readonly SoakFixtureCaseId[];
};

export type EvidenceCompileResult = {
  artifacts: RedactedEvidenceArtifact[];
  caseResults: AcceptanceCaseEvidenceRecord[];
  chatgptAds: ReturnType<typeof soakChatGptAdsBlocked>;
  blockedLiveVerified: true;
  details: string[];
};

const CASE_TITLES: Record<SoakFixtureCaseId, string> = {
  "T-X014": "Approval wait survives restart",
  "T-X020": "Timeout after provider acceptance",
  "T-US-048": "Unknown remote effects reconciled before resume",
  "T-X066": "Backup omits remote receipt",
  "T-F24": "Recover, rotate access and reconcile",
  "T-US-047": "Recover/rotate/reconcile — offboarding manifest",
  "T-US-002": "Competing supervisors refused; no duplicate leases",
  "T-X002": "Two supervisors start together — single host lease",
  "T-X018": "Self-approval rejected",
  "T-US-054": "Independent approval enforced (no ordinary self-approval)",
  "T-X073": "Offboarding retains active token — incomplete until revoked",
  "T-US-060": "Emergency stop checked at commit time",
  "T-X005": "Forged browser role — payload role ignored",
  "T-X006": "Cross-workspace object reference — deny without leak",
  "T-X019": "Approved payload edited — digest conflict",
  "T-US-036": "Stale approval invalidated on revision change",
  "T-X029": "Token rotates to different account",
  "T-US-057": "Cross-workspace resource substitution rejected",
  "T-US-024": "Agent cannot widen its own grant",
  "T-US-042": "Repair cannot weaken protected tests",
  "T-X057": "Repair disables failing test — rejected",
  "T-US-044": "Takeover cancels unsent agent replies",
  "T-X053": "Takeover races queued reply — version invalidates send",
  "T-US-018": "Gemini never used for publish/CRM/customer reply",
  "T-X037": "Gemini tries operational tool — no effect",
  "T-X058": "Third automatic repair attempt — escalate",
  "T-X069": "Imported document quarantined as data",
  "T-X038": "Grounded eval without grounding — fail closed",
  "T-X039": "Provider error vs answer failure — separate denominators",
  "T-US-058": "Synthetic excluded from business denominators",
  "T-US-046": "Hard search constraints enforced; no invented availability",
  "T-X048": "Unknown price or availability — no invention",
  "T-US-010": "Missing GSC rows ≠ zero demand",
  "T-X033": "Omitted GSC rows — Unknown ≠ zero",
  "T-US-008": "GA4 debug validation ≠ measured receipt",
  "T-X032": "GA4 debug validation success only — not delivered conversion",
  "T-X031": "Wrong GA4 property kind — refuse bind",
  "T-US-040": "Thank-you without Zoho record fails at CRM",
  "T-X049": "Thank-you but no CRM record — fail at delivery",
  "T-X017": "Stop after provider dispatch starts — reconcile; no fake cancel",
  "T-X024": "Old fence after reassignment — old worker cannot commit",
  "T-X011": "Output bomb — bounded/quarantined",
  "T-X003": "Symlink escape after root verification — write denied outside root",
  "T-X050": "Public synthetic flag abuse — server grant required",
  "T-X010": "Malicious prompt interpolation — no shell injection",
  "T-X009": "CLI error despite exit 0 — job fails",
  "T-X015": "DST recurring schedule — no unintended duplicates",
  "T-X001": "Host sleeps during scheduled monitoring — coverage gap honest; coalesce",
  "T-X021": "Concurrent idempotent releases — one dispatch",
  "T-X022": "Idempotency key payload mismatch — Conflict",
  "T-X065": "Worker reads browser auth state — OS deny",
  "T-X027": "Unknown usage on cancelled request — hold; not zero cost",
  "T-X008": "Fact changes after review — stale; no publish",
  "T-X012": "Orphan worker on deadline — process tree stopped",
  "T-X007": "Wrong CMS environment — no production op",
  "T-X016": "Stop before dispatch claim — no adapter mutation",
  "T-X063": "Indirect prompt-injection exfiltration — boundary denies",
  "T-X013": "Replay historical workflow — no repeated external I/O",
  "T-X004": "Disk full during evidence write — no partial completed manifest",
  "T-X025": "External human edit during staging — conflict retained",
  "T-X043": "Optimization breaks CTA — journey regression fails",
  "T-X026": "Concurrent final budget reservation — cap enforced",
  "T-X052": "Synthetic conversion contamination — excluded from commerce",
  "T-X054": "Reply sent but CRM fails — CRM reconciles; no resend",
  "T-X055": "Unknown policy question — escalate without promise",
  "T-X056": "Automated response loop — bounded; handoff",
  "T-X059": "Duplicate platform attribution — one booking; separate claims",
  "T-X060": "Currency/timezone mismatch — no silent sum",
  "T-X070": "Validated payload not collected — separate failure states",
  "T-US-006": "Unbound URL: analysis ok, write blocked",
};

function relatedProofsForCase(
  caseId: SoakFixtureCaseId,
  proofs: readonly SoakProofRecord[],
): SoakProofRecord[] {
  return proofs.filter((p) => mapProofToFixtureCases(p.kind).includes(caseId));
}

function hasCompletePassingSet(
  caseId: SoakFixtureCaseId,
  related: readonly SoakProofRecord[],
): { ok: true; passed: SoakProofRecord[] } | { ok: false; reasons: string[] } {
  const expected = expectedProofsForFixtureCase(caseId);
  const reasons: string[] = [];
  if (expected.length === 0) {
    return {
      ok: false,
      reasons: [`No expected proof set configured for ${caseId}`],
    };
  }

  const failed = related.filter((p) => !p.passed);
  if (failed.length > 0) {
    reasons.push(
      `Related proof(s) failed for ${caseId}: ${failed.map((p) => p.kind).join(", ")}`,
    );
  }

  const passedKinds = new Set(
    related.filter((p) => p.passed).map((p) => p.kind),
  );
  const missing: SoakProofKindValue[] = expected.filter(
    (k) => !passedKinds.has(k),
  );
  if (missing.length > 0) {
    reasons.push(
      `Incomplete proof set for ${caseId}; missing: ${missing.join(", ")}`,
    );
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const passed = related.filter(
    (p) => p.passed && expected.includes(p.kind),
  );
  return { ok: true, passed };
}

export function compileAcceptanceEvidence(
  input: EvidenceCompileInput,
): EvidenceCompileResult {
  const caseIds = input.caseIds ?? [...SOAK_FIXTURE_CASE_IDS];
  const ads = soakChatGptAdsBlocked();
  const details: string[] = [
    "Evidence compiler environment=fixture only",
    "Fixture ≠ sandbox ≠ authorized production",
    "Never silently VERIFIED for live",
    "ACCEPTED requires complete expected proof set with no failed related proofs",
    `ChatGPT Ads blocked: ${ads.reason}`,
    `runId=${input.runId}`,
  ];

  const artifacts: RedactedEvidenceArtifact[] = [];
  const caseResults: AcceptanceCaseEvidenceRecord[] = [];

  for (const caseId of caseIds) {
    const related = relatedProofsForCase(caseId, input.proofs);
    const completeness = hasCompletePassingSet(caseId, related);

    if (!completeness.ok) {
      const hasAny = related.length > 0;
      caseResults.push({
        caseId,
        status: hasAny
          ? AcceptanceCaseStatus.FAILED
          : AcceptanceCaseStatus.NOT_RUN,
        environment: AcceptanceEnvironment.FIXTURE,
        artifactId: null,
        reasons: completeness.reasons,
        updatedAtIso: input.nowIso,
      });
      continue;
    }

    const artifactId = uniqueFixtureEvidenceArtifactId(caseId, input.runId);
    const summary = [
      `Fixture ACCEPTED for ${caseId} (${CASE_TITLES[caseId]})`,
      ...completeness.passed.map(
        (p) =>
          `proof=${p.kind} applyCount=${p.applyAttemptCount ?? "n/a"} :: ${p.details.join(" | ")}`,
      ),
      "liveProviderSuccessClaimed=false externalEffects=NONE",
    ].join("\n");

    const artifact = buildRedactedArtifact({
      artifactId,
      caseId,
      environment: AcceptanceEnvironment.FIXTURE,
      summary,
      proofKinds: completeness.passed.map((p) => p.kind),
      evidenceRef: `soak/evidence/${artifactId}.json`,
      createdAtIso: input.nowIso,
    });

    const statusCheck = validateAcceptanceCaseStatus({
      status: AcceptanceCaseStatus.ACCEPTED,
      environment: AcceptanceEnvironment.FIXTURE,
      evidenceArtifactId: artifactId,
    });
    if (!statusCheck.ok) {
      caseResults.push({
        caseId,
        status: AcceptanceCaseStatus.FAILED,
        environment: AcceptanceEnvironment.FIXTURE,
        artifactId: null,
        reasons: statusCheck.reasons,
        updatedAtIso: input.nowIso,
      });
      continue;
    }

    artifacts.push(artifact);
    caseResults.push({
      caseId,
      status: AcceptanceCaseStatus.ACCEPTED,
      environment: AcceptanceEnvironment.FIXTURE,
      artifactId,
      reasons: [
        `Fixture evidence compiled from complete proof set (${completeness.passed.length})`,
        "Not sandbox-verified; not production-canary-verified",
      ],
      updatedAtIso: input.nowIso,
    });
  }

  details.push(
    `Compiled ${artifacts.length} redacted artifact(s); ACCEPTED=${caseResults.filter((c) => c.status === "ACCEPTED").length}`,
    "T-X066 fixture ACCEPTED only via BACKUP_OMIT_RECEIPT (not retry-only no-dup)",
    "T-F24/T-US-047 fixture ACCEPTED only via RECOVER_ROTATE_RECONCILE (complete F24 evidence set)",
    "T-US-002/T-X002 fixture ACCEPTED only via COMPETING_SUPERVISOR_LEASE (singleton host lease)",
    "T-X018/T-US-054 fixture ACCEPTED only via SELF_APPROVAL_REJECTED (independent A25)",
    "T-X073 fixture ACCEPTED only via OFFBOARD_ACTIVE_TOKEN_RESIDUAL (incomplete until live revoke)",
    "T-US-060 fixture ACCEPTED only via EMERGENCY_STOP_AT_COMMIT (outbound stop at commit)",
    "T-X005 fixture ACCEPTED only via FORGED_BROWSER_ROLE_IGNORED (payload role ignored)",
    "T-X006 fixture ACCEPTED only via CROSS_WORKSPACE_REFERENCE_DENIED (deny without leak)",
    "T-X019/T-US-036 fixture ACCEPTED only via APPROVED_PAYLOAD_EDIT_INVALIDATED (digest/revision)",
    "T-US-057 fixture ACCEPTED only via CROSS_WORKSPACE_RESOURCE_SUBSTITUTION",
    "T-US-024 fixture ACCEPTED only via AGENT_CANNOT_WIDEN_GRANT",
    "T-US-042/T-X057 fixture ACCEPTED only via REPAIR_WEAKEN_TEST_REJECTED",
    "T-US-044/T-X053 fixture ACCEPTED only via TAKEOVER_CANCELS_UNSENT_REPLIES",
    "T-US-018/T-X037 fixture ACCEPTED only via EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN",
    "T-X058 fixture ACCEPTED only via REPAIR_ATTEMPT_LIMIT_ESCALATED",
    "T-X069 fixture ACCEPTED only via IMPORTED_DOC_QUARANTINED_AS_DATA",
    "T-X038 fixture ACCEPTED only via EVAL_NO_GROUNDING_FAIL_CLOSED",
    "T-X039/T-US-058 fixture ACCEPTED only via METRIC_DENOMINATORS_HONEST",
    "T-US-046/T-X048 fixture ACCEPTED only via HARD_SEARCH_CONSTRAINTS_NO_INVENTION",
    "T-US-010/T-X033 fixture ACCEPTED only via GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO",
    "T-US-008/T-X032 fixture ACCEPTED only via GA4_DEBUG_NOT_DELIVERED_CONVERSION",
    "T-X031 fixture ACCEPTED only via GA4_WRONG_PROPERTY_KIND_REFUSED",
    "T-US-040/T-X049 fixture ACCEPTED only via THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY",
    "T-X017 fixture ACCEPTED only via STOP_AFTER_DISPATCH_RECONCILE (no fake cancel)",
    "T-X024 fixture ACCEPTED only via OLD_FENCE_AFTER_REASSIGNMENT",
    "T-X011 fixture ACCEPTED only via OUTPUT_BOMB_BOUNDED_QUARANTINED",
    "T-X003 fixture ACCEPTED only via SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION",
    "T-X050 fixture ACCEPTED only via PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT",
    "T-X010 fixture ACCEPTED only via MALICIOUS_PROMPT_NO_SHELL_INJECTION",
    "T-X009 fixture ACCEPTED only via CLI_ERROR_DESPITE_EXIT_ZERO (job fails)",
    "T-X015 fixture ACCEPTED only via DST_RECURRING_SCHEDULE_NO_DUPLICATES (no unintended duplicates)",
    "T-X001 fixture ACCEPTED only via HOST_SLEEP_MONITORING_COVERAGE_GAP",
    "T-X021 fixture ACCEPTED only via CONCURRENT_IDEMPOTENT_RELEASE (not retry-only NO_DUPLICATE_EFFECTS)",
    "T-X008 fixture ACCEPTED only via FACT_CHANGES_AFTER_REVIEW_STALE (stale; no publish)",
    "T-X012 fixture ACCEPTED only via ORPHAN_WORKER_DEADLINE_TREE_STOPPED",
    "T-X007 fixture ACCEPTED only via WRONG_CMS_ENVIRONMENT_NO_PRODUCTION_OP",
    "T-X016 fixture ACCEPTED only via STOP_BEFORE_DISPATCH_NO_MUTATION",
    "T-X022 fixture ACCEPTED only via IDEMPOTENCY_KEY_PAYLOAD_MISMATCH",
    "T-X065 fixture ACCEPTED only via WORKER_BROWSER_AUTH_STATE_OS_DENIED",
    "T-X004 fixture ACCEPTED only via DISK_FULL_EVIDENCE_NO_PARTIAL_COMPLETED (no partial COMPLETED manifest)",
    "T-X027 fixture ACCEPTED only via UNKNOWN_USAGE_CANCEL_HOLDS_RESIDUAL",
    "T-X063 fixture ACCEPTED only via INDIRECT_PROMPT_INJECTION_EXFIL_DENIED",
    "T-X013 fixture ACCEPTED only via REPLAY_HISTORICAL_NO_REPEAT_IO (history replay; no repeated I/O)",
    "T-X025 fixture ACCEPTED only via EXTERNAL_HUMAN_EDIT_CONFLICT_RETAINED",
    "T-X026 fixture ACCEPTED only via CONCURRENT_FINAL_BUDGET_RESERVATION_CAP",
    "T-X052 fixture ACCEPTED only via SYNTHETIC_CONVERSION_CONTAMINATION_EXCLUDED",
    "T-X054 fixture ACCEPTED only via REPLY_SENT_CRM_RECONCILES_NO_RESEND",
    "T-X055 fixture ACCEPTED only via UNKNOWN_POLICY_QUESTION_ESCALATES_WITHOUT_PROMISE",
    "T-X056 fixture ACCEPTED only via AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF",
    "T-X059 fixture ACCEPTED only via DUPLICATE_PLATFORM_ATTRIBUTION_ONE_BOOKING",
    "T-X060 fixture ACCEPTED only via CURRENCY_TIMEZONE_MISMATCH_NO_SILENT_SUM",
    "T-X070 fixture ACCEPTED only via VALIDATED_PAYLOAD_NOT_COLLECTED_SEPARATE_STATES",
    "T-US-006 fixture ACCEPTED only via UNBOUND_WRITE_PATH_FAIL_CLOSED",
    "Never silently VERIFIED for live; externalEffects=NONE",
  );

  return {
    artifacts,
    caseResults,
    chatgptAds: ads,
    blockedLiveVerified: true,
    details,
  };
}
