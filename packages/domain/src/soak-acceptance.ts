/**
 * M9 / NEXT-20 — R1 soak / acceptance evidence harness (domain).
 *
 * Fixture ≠ sandbox ≠ authorized production.
 * Catalog cases may be NOT_RUN or ACCEPTED (with real evidence only).
 * Never silently VERIFIED for live. ChatGPT Ads stays blocked without transport.
 * 72h pilot gate is explicit — short CI soaks prove mechanics, not R1-complete.
 * Pilot duration uses server-recorded start/heartbeat/end observations only.
 * Pure types + validators. No network I/O.
 */

import {
  AnalyticsEnvironment,
  evaluateChatGptAdsAccess,
} from "./analytics.js";

/** Declared execution environment for acceptance evidence. */
export const AcceptanceEnvironment = {
  FIXTURE: "fixture",
  SANDBOX: "sandbox",
  AUTHORIZED_PRODUCTION: "authorized_production",
} as const;

export type AcceptanceEnvironmentValue =
  (typeof AcceptanceEnvironment)[keyof typeof AcceptanceEnvironment];

/**
 * Product-case execution status for the matrix / evidence ledger.
 * VERIFIED is intentionally absent — live/prod verification is never silent.
 */
export const AcceptanceCaseStatus = {
  NOT_RUN: "NOT_RUN",
  ACCEPTED: "ACCEPTED",
  FAILED: "FAILED",
  BLOCKED: "BLOCKED",
} as const;

export type AcceptanceCaseStatusValue =
  (typeof AcceptanceCaseStatus)[keyof typeof AcceptanceCaseStatus];

/** Forbidden matrix/evidence status for live claims without explicit auth evidence. */
export const FORBIDDEN_SILENT_LIVE_STATUS = "VERIFIED" as const;

export const SoakProofKind = {
  CRASH_RESTART: "crash_restart",
  NO_DUPLICATE_EFFECTS: "no_duplicate_effects",
  JOB_CONTINUITY: "job_continuity",
  UNKNOWN_REMOTE_RECONCILE: "unknown_remote_reconcile",
  /** Backup restore that omitted the remote receipt; reconcile before retry. */
  BACKUP_OMIT_RECEIPT: "backup_omit_receipt",
  /**
   * F24 recover → capability stop → rotate (no secrets) → reconcile → offboard.
   * Feeds fixture ACCEPTED for T-F24 / T-US-047 only — never live VERIFIED.
   */
  RECOVER_ROTATE_RECONCILE: "recover_rotate_reconcile",
  /**
   * Competing supervisors / singleton host lease (T-US-002 / T-X002).
   * Second live generation refused; dead-holder reclaim allowed; ownership fail-closed.
   */
  COMPETING_SUPERVISOR_LEASE: "competing_supervisor_lease",
  /**
   * Self-approval rejected; independent A25 approval required (T-X018 / T-US-054).
   */
  SELF_APPROVAL_REJECTED: "self_approval_rejected",
  /**
   * Offboarding retains ACTIVE_TOKEN residual until live revoke (T-X073).
   * Incomplete until revoked — never claims live provider revoke complete.
   */
  OFFBOARD_ACTIVE_TOKEN_RESIDUAL: "offboard_active_token_residual",
  /**
   * Emergency stop / outbound stop checked at commit time (T-US-060).
   */
  EMERGENCY_STOP_AT_COMMIT: "emergency_stop_at_commit",
  /**
   * Forged browser / client payload role ignored (T-X005).
   * Session role binds; body.actorRole cannot escalate.
   */
  FORGED_BROWSER_ROLE_IGNORED: "forged_browser_role_ignored",
  /**
   * Cross-workspace object reference denied without leak (T-X006).
   */
  CROSS_WORKSPACE_REFERENCE_DENIED: "cross_workspace_reference_denied",
  /**
   * Approved payload edited / stale approval invalidated (T-X019 / T-US-036).
   * Digest conflict on edit; revision change invalidates binding.
   */
  APPROVED_PAYLOAD_EDIT_INVALIDATED: "approved_payload_edit_invalidated",
  /** Token identity maps to a different account — explicit rebind required (T-X029). */
  EXPLICIT_ACCOUNT_REBIND: "explicit_account_rebind",
  /**
   * Cross-workspace resource substitution rejected (T-US-057).
   */
  CROSS_WORKSPACE_RESOURCE_SUBSTITUTION: "cross_workspace_resource_substitution",
  /**
   * Agent cannot widen its own grant (T-US-024).
   */
  AGENT_CANNOT_WIDEN_GRANT: "agent_cannot_widen_grant",
  /**
   * Repair cannot weaken protected tests (T-US-042 / T-X057).
   */
  REPAIR_WEAKEN_TEST_REJECTED: "repair_weaken_test_rejected",
  /**
   * Takeover cancels unsent agent replies (T-US-044 / T-X053).
   */
  TAKEOVER_CANCELS_UNSENT_REPLIES: "takeover_cancels_unsent_replies",
  /**
   * EVAL_ONLY forbids operational tools (T-US-018 / T-X037).
   * Gemini/Claude cannot publish / CRM-write / customer-message / ads-mutate.
   */
  EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN: "eval_only_operational_tool_forbidden",
  /**
   * Third automatic repair attempt escalates (T-X058).
   */
  REPAIR_ATTEMPT_LIMIT_ESCALATED: "repair_attempt_limit_escalated",
  /**
   * Imported document quarantined as data, not executable instructions (T-X069).
   */
  IMPORTED_DOC_QUARANTINED_AS_DATA: "imported_doc_quarantined_as_data",
  /**
   * Grounded eval without grounding fails closed (T-X038).
   */
  EVAL_NO_GROUNDING_FAIL_CLOSED: "eval_no_grounding_fail_closed",
  /**
   * Metric denominators stay honest (T-X039 / T-US-058):
   * provider_error → unavailable (not zero/pass); synthetic → excluded from business.
   */
  METRIC_DENOMINATORS_HONEST: "metric_denominators_honest",
  /**
   * Hard search constraints; unknown price/availability not invented (T-US-046 / T-X048).
   */
  HARD_SEARCH_CONSTRAINTS_NO_INVENTION: "hard_search_constraints_no_invention",
  /**
   * Omitted/missing GSC rows are UNKNOWN demand, never invent zero (T-US-010 / T-X033).
   */
  GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO: "gsc_omitted_rows_unknown_not_zero",
  /**
   * GA4 debug validation is not a delivered conversion (T-US-008 / T-X032).
   */
  GA4_DEBUG_NOT_DELIVERED_CONVERSION: "ga4_debug_not_delivered_conversion",
  /**
   * Wrong GA4 property kind refused (T-X031).
   */
  GA4_WRONG_PROPERTY_KIND_REFUSED: "ga4_wrong_property_kind_refused",
  /**
   * Thank-you without CRM record fails at delivery (T-US-040 / T-X049).
   */
  THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY: "thank_you_without_crm_fails_delivery",
  /**
   * Stop after provider dispatch starts — reconcile; no fake cancel (T-X017).
   */
  STOP_AFTER_DISPATCH_RECONCILE: "stop_after_dispatch_reconcile",
  /**
   * Old fence after reassignment — old worker cannot commit (T-X024).
   */
  OLD_FENCE_AFTER_REASSIGNMENT: "old_fence_after_reassignment",
  /**
   * Output bomb bounded and quarantined — oversized stdout not delivered (T-X011).
   */
  OUTPUT_BOMB_BOUNDED_QUARANTINED: "output_bomb_bounded_quarantined",
  /**
   * Symlink escape after root verification — write denied outside root (T-X003).
   */
  SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION:
    "symlink_escape_after_root_verification",
  /**
   * Public synthetic flag abuse — server canary grant required (T-X050).
   * Client/public ws_synthetic / is_synthetic cannot authorize alone.
   */
  PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT:
    "public_synthetic_flag_requires_server_grant",
  /**
   * Malicious prompt interpolation blocked — prompt via stdin, shell false (T-X010).
   */
  MALICIOUS_PROMPT_NO_SHELL_INJECTION: "malicious_prompt_no_shell_injection",
  /**
   * CLI error despite process exit 0 → job fails (T-X009).
   * Claude `--output-format json` may set is_error while exiting 0.
   */
  CLI_ERROR_DESPITE_EXIT_ZERO: "cli_error_despite_exit_zero",
  /**
   * DST recurring schedule — no unintended duplicates (T-X015).
   */
  DST_RECURRING_SCHEDULE_NO_DUPLICATES: "dst_recurring_schedule_no_duplicates",
  /**
   * Host sleeps during scheduled monitoring — coverage gap honest; coalesce (T-X001).
   */
  HOST_SLEEP_MONITORING_COVERAGE_GAP: "host_sleep_monitoring_coverage_gap",
  /**
   * Concurrent idempotent releases → one dispatch (T-X021).
   * Distinct from NO_DUPLICATE_EFFECTS (sequential retry-only).
   */
  CONCURRENT_IDEMPOTENT_RELEASE: "concurrent_idempotent_release",
  /**
   * Fact changes after review -> stale; no publish (T-X008).
   * Cited-fact set change invalidates A25 content binding; support flip fails publish gates.
   */
  FACT_CHANGES_AFTER_REVIEW_STALE: "fact_changes_after_review_stale",
  /**
   * Orphan worker on deadline — process tree stopped (T-X012).
   */
  ORPHAN_WORKER_DEADLINE_TREE_STOPPED: "orphan_worker_deadline_tree_stopped",
} as const;

export type SoakProofKindValue =
  (typeof SoakProofKind)[keyof typeof SoakProofKind];

export const PilotGateStatus = {
  NOT_MET: "NOT_MET",
  MET: "MET",
  BLOCKED: "BLOCKED",
} as const;

export type PilotGateStatusValue =
  (typeof PilotGateStatus)[keyof typeof PilotGateStatus];

export const PilotObservationKind = {
  START: "start",
  HEARTBEAT: "heartbeat",
  END: "end",
} as const;

export type PilotObservationKindValue =
  (typeof PilotObservationKind)[keyof typeof PilotObservationKind];

/**
 * Server-recorded pilot soak observation. Callers must never supply claim dates —
 * only the host clock may mint `recordedAtIso`.
 */
export type PilotGateObservation = {
  kind: PilotObservationKindValue;
  recordedAtIso: string;
};

/** Default R1 pilot soak window (72 hours). */
export const PILOT_SOAK_REQUIRED_MS = 72 * 60 * 60 * 1000;

/** Max gap between consecutive server observations for continuity (6 hours). */
export const DEFAULT_PILOT_MAX_OBSERVATION_GAP_MS = 6 * 60 * 60 * 1000;

/**
 * Catalog cases the fixture soak/evidence harness can honestly ACCEPTED offline.
 * T-X066 requires BACKUP_OMIT_RECEIPT (not retry-only NO_DUPLICATE_EFFECTS).
 * T-F24 / T-US-047 require RECOVER_ROTATE_RECONCILE (complete F24 evidence set).
 * T-US-002 / T-X002 require COMPETING_SUPERVISOR_LEASE (singleton host lease).
 * T-X018 / T-US-054 require SELF_APPROVAL_REJECTED (independent A25).
 * T-X073 requires OFFBOARD_ACTIVE_TOKEN_RESIDUAL (incomplete until live revoke).
 * T-US-060 requires EMERGENCY_STOP_AT_COMMIT (outbound stop at commit).
 * T-X005 requires FORGED_BROWSER_ROLE_IGNORED (payload role ignored).
 * T-X006 requires CROSS_WORKSPACE_REFERENCE_DENIED (deny without leak).
 * T-X019 / T-US-036 require APPROVED_PAYLOAD_EDIT_INVALIDATED (digest/revision).
 * T-X029 requires EXPLICIT_ACCOUNT_REBIND (not same-account local rotate).
 * T-US-057 requires CROSS_WORKSPACE_RESOURCE_SUBSTITUTION.
 * T-US-024 requires AGENT_CANNOT_WIDEN_GRANT.
 * T-US-042 / T-X057 require REPAIR_WEAKEN_TEST_REJECTED.
 * T-US-044 / T-X053 require TAKEOVER_CANCELS_UNSENT_REPLIES.
 * T-US-018 / T-X037 require EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN.
 * T-X058 requires REPAIR_ATTEMPT_LIMIT_ESCALATED.
 * T-X069 requires IMPORTED_DOC_QUARANTINED_AS_DATA.
 * T-X038 requires EVAL_NO_GROUNDING_FAIL_CLOSED.
 * T-X039 / T-US-058 require METRIC_DENOMINATORS_HONEST.
 * T-US-046 / T-X048 require HARD_SEARCH_CONSTRAINTS_NO_INVENTION.
 * T-US-010 / T-X033 require GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO.
 * T-US-008 / T-X032 require GA4_DEBUG_NOT_DELIVERED_CONVERSION.
 * T-X031 requires GA4_WRONG_PROPERTY_KIND_REFUSED.
 * T-US-040 / T-X049 require THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY.
 * T-X017 requires STOP_AFTER_DISPATCH_RECONCILE (no fake cancel after APPLYING).
 * T-X024 requires OLD_FENCE_AFTER_REASSIGNMENT.
 * T-X011 requires OUTPUT_BOMB_BOUNDED_QUARANTINED (oversized stdout quarantined).
 * T-X003 requires SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION.
 * T-X050 requires PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT.
 * T-X010 requires MALICIOUS_PROMPT_NO_SHELL_INJECTION.
 * T-X009 requires CLI_ERROR_DESPITE_EXIT_ZERO (job fails when CLI reports error on exit 0).
 * T-X015 requires DST_RECURRING_SCHEDULE_NO_DUPLICATES.
 * T-X001 requires HOST_SLEEP_MONITORING_COVERAGE_GAP.
 * T-X021 requires CONCURRENT_IDEMPOTENT_RELEASE (not retry-only NO_DUPLICATE_EFFECTS).
 * T-X008 requires FACT_CHANGES_AFTER_REVIEW_STALE (cited/support change; no publish).
 * T-X012 requires ORPHAN_WORKER_DEADLINE_TREE_STOPPED (process tree stopped on deadline).
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */
export const SOAK_FIXTURE_CASE_IDS = [
  "T-X014",
  "T-X020",
  "T-US-048",
  "T-X066",
  "T-F24",
  "T-US-047",
  "T-US-002",
  "T-X002",
  "T-X018",
  "T-US-054",
  "T-X073",
  "T-US-060",
  "T-X005",
  "T-X006",
  "T-X019",
  "T-US-036",
  "T-X029",
  "T-US-057",
  "T-US-024",
  "T-US-042",
  "T-X057",
  "T-US-044",
  "T-X053",
  "T-US-018",
  "T-X037",
  "T-X058",
  "T-X069",
  "T-X038",
  "T-X039",
  "T-US-058",
  "T-US-046",
  "T-X048",
  "T-US-010",
  "T-X033",
  "T-US-008",
  "T-X032",
  "T-X031",
  "T-US-040",
  "T-X049",
  "T-X017",
  "T-X024",
  "T-X011",
  "T-X003",
  "T-X050",
  "T-X010",
  "T-X009",
  "T-X015",
  "T-X001",
  "T-X021",
  "T-X008",
  "T-X012",
] as const;

export type SoakFixtureCaseId = (typeof SOAK_FIXTURE_CASE_IDS)[number];

/** Related catalog IDs (fixture ACCEPTED set + adjacent recovery/ads cases). */
export const SOAK_RELATED_CASE_IDS: readonly string[] = [
  ...SOAK_FIXTURE_CASE_IDS,
  "T-F07",
  "T-US-013",
  "T-X073",
] as const;

export type RedactedEvidenceArtifact = {
  artifactId: string;
  caseId: string;
  environment: AcceptanceEnvironmentValue;
  /** Always redacted — never includes secrets, tokens, or raw PII. */
  redacted: true;
  summary: string;
  proofKinds: SoakProofKindValue[];
  /** Relative path or logical ref inside the evidence store. */
  evidenceRef: string;
  createdAtIso: string;
  /** Explicit: fixture proofs are not live provider success. */
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

export type AcceptanceCaseEvidenceRecord = {
  caseId: string;
  status: AcceptanceCaseStatusValue;
  environment: AcceptanceEnvironmentValue;
  artifactId: string | null;
  reasons: string[];
  updatedAtIso: string;
};

export type SoakProofRecord = {
  proofId: string;
  kind: SoakProofKindValue;
  passed: boolean;
  details: string[];
  /** Apply attempts observed for the business key (must be 1 when no-dup). */
  applyAttemptCount: number | null;
  operationId: string | null;
  createdAtIso: string;
  fixtureOnly: true;
};

export type SoakRunRecord = {
  runId: string;
  startedAtIso: string;
  endedAtIso: string;
  durationMs: number;
  environment: AcceptanceEnvironmentValue;
  proofs: SoakProofRecord[];
  caseResults: AcceptanceCaseEvidenceRecord[];
  pilotGate: PilotGateEvaluation;
  /** Server-recorded observations used for this run's gate evaluation. */
  pilotObservations: PilotGateObservation[];
  chatgptAds: {
    allowed: false;
    wiring: "NOT_WIRED";
    reason: string;
  };
  liveWiring: {
    cms: "NOT_WIRED";
    gsc: "NOT_WIRED";
    ga4: "NOT_WIRED";
    zoho: "NOT_WIRED";
    temporal: "NOT_WIRED";
  };
  r1CompleteClaimed: false;
  externalEffects: "NONE";
  honestNote: string;
};

export type PilotGateEvaluation = {
  status: PilotGateStatusValue;
  requiredMs: number;
  observedMs: number;
  proofsRequired: SoakProofKindValue[];
  proofsPassed: SoakProofKindValue[];
  reasons: string[];
  /** True when duration came from server observations (never client claim dates). */
  serverObservationsOnly: true;
};

export type SoakAcceptanceState = {
  version: 1;
  updatedAtIso: string;
  runs: SoakRunRecord[];
  artifacts: RedactedEvidenceArtifact[];
  caseLedger: AcceptanceCaseEvidenceRecord[];
  /** Active pilot window observations (server clock only). */
  pilotObservations: PilotGateObservation[];
  liveWiring: SoakRunRecord["liveWiring"];
  chatgptAdsWiring: "NOT_WIRED";
};

export function emptySoakAcceptanceState(nowIso: string): SoakAcceptanceState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    runs: [],
    artifacts: [],
    caseLedger: [],
    pilotObservations: [],
    liveWiring: {
      cms: "NOT_WIRED",
      gsc: "NOT_WIRED",
      ga4: "NOT_WIRED",
      zoho: "NOT_WIRED",
      temporal: "NOT_WIRED",
    },
    chatgptAdsWiring: "NOT_WIRED",
  };
}

export function isAllowedAcceptanceStatus(
  status: string,
): status is AcceptanceCaseStatusValue {
  return (
    status === AcceptanceCaseStatus.NOT_RUN ||
    status === AcceptanceCaseStatus.ACCEPTED ||
    status === AcceptanceCaseStatus.FAILED ||
    status === AcceptanceCaseStatus.BLOCKED
  );
}

/**
 * ACCEPTED requires a real evidence artifact and a non-production environment
 * for fixture harness results. VERIFIED is always rejected here.
 */
export function validateAcceptanceCaseStatus(input: {
  status: string;
  environment?: string | null;
  evidenceArtifactId?: string | null;
}): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (statusLooksVerified(input.status)) {
    reasons.push(
      "VERIFIED is forbidden in the acceptance matrix/evidence ledger without an explicit authorized-production evidence package — never silently VERIFIED for live",
    );
  }
  if (!isAllowedAcceptanceStatus(input.status)) {
    reasons.push(`Unsupported acceptance status: ${input.status}`);
  }
  if (input.status === AcceptanceCaseStatus.ACCEPTED) {
    if (!input.evidenceArtifactId || !String(input.evidenceArtifactId).trim()) {
      reasons.push("ACCEPTED requires evidenceArtifactId with real evidence");
    }
    const env = input.environment ?? "";
    if (
      env !== AcceptanceEnvironment.FIXTURE &&
      env !== AcceptanceEnvironment.SANDBOX
    ) {
      reasons.push(
        `ACCEPTED harness results require environment fixture|sandbox, got ${JSON.stringify(env)}`,
      );
    }
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

function statusLooksVerified(status: string): boolean {
  return status.toUpperCase() === FORBIDDEN_SILENT_LIVE_STATUS;
}

/**
 * Evaluate the 72h pilot gate from **server-recorded** observations only.
 * Client-supplied startedAtIso/endedAtIso claim dates must never be passed here.
 */
export function evaluatePilotGate(input: {
  observations: readonly PilotGateObservation[];
  proofs: readonly SoakProofRecord[];
  requiredMs?: number;
  maxObservationGapMs?: number;
}): PilotGateEvaluation {
  const requiredMs = input.requiredMs ?? PILOT_SOAK_REQUIRED_MS;
  const maxGap =
    input.maxObservationGapMs ?? DEFAULT_PILOT_MAX_OBSERVATION_GAP_MS;

  const proofsRequired = [
    SoakProofKind.CRASH_RESTART,
    SoakProofKind.NO_DUPLICATE_EFFECTS,
    SoakProofKind.JOB_CONTINUITY,
    SoakProofKind.UNKNOWN_REMOTE_RECONCILE,
  ] as const;

  const proofsPassed = proofsRequired.filter((kind) =>
    input.proofs.some((p) => p.kind === kind && p.passed),
  );

  const reasons: string[] = [];
  const sorted = [...input.observations]
    .filter((o) => Number.isFinite(Date.parse(o.recordedAtIso)))
    .sort(
      (a, b) => Date.parse(a.recordedAtIso) - Date.parse(b.recordedAtIso),
    );

  const start = sorted.find((o) => o.kind === PilotObservationKind.START);
  const end = [...sorted]
    .reverse()
    .find((o) => o.kind === PilotObservationKind.END);

  let observedMs = 0;
  if (!start || !end) {
    reasons.push(
      "Pilot gate requires server-recorded start and end observations (client claim dates ignored)",
    );
  } else {
    const startMs = Date.parse(start.recordedAtIso);
    const endMs = Date.parse(end.recordedAtIso);
    observedMs = Math.max(0, endMs - startMs);

    const window = sorted.filter((o) => {
      const t = Date.parse(o.recordedAtIso);
      return t >= startMs && t <= endMs;
    });
    for (let i = 1; i < window.length; i++) {
      const gap =
        Date.parse(window[i]!.recordedAtIso) -
        Date.parse(window[i - 1]!.recordedAtIso);
      if (gap > maxGap) {
        reasons.push(
          `Observation gap ${gap}ms exceeds max ${maxGap}ms — soak continuity broken`,
        );
      }
    }

    if (observedMs < requiredMs) {
      reasons.push(
        `Soak duration ${observedMs}ms < required ${requiredMs}ms (72h pilot gate)`,
      );
    }
  }

  for (const kind of proofsRequired) {
    if (!proofsPassed.includes(kind)) {
      reasons.push(`Missing passing soak proof: ${kind}`);
    }
  }

  if (reasons.length > 0) {
    return {
      status: PilotGateStatus.NOT_MET,
      requiredMs,
      observedMs,
      proofsRequired: [...proofsRequired],
      proofsPassed: [...proofsPassed],
      reasons,
      serverObservationsOnly: true,
    };
  }

  return {
    status: PilotGateStatus.MET,
    requiredMs,
    observedMs,
    proofsRequired: [...proofsRequired],
    proofsPassed: [...proofsPassed],
    reasons: [
      "72h soak window and required recovery proofs satisfied via server observations",
    ],
    serverObservationsOnly: true,
  };
}

export function redactEvidenceSummary(raw: string): string {
  return raw
    .replace(
      /(password|secret|token|api[_-]?key|authorization)\s*[:=]\s*\S+/gi,
      "$1=[REDACTED]",
    )
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]");
}

export function buildRedactedArtifact(input: {
  artifactId: string;
  caseId: string;
  environment: AcceptanceEnvironmentValue;
  summary: string;
  proofKinds: SoakProofKindValue[];
  evidenceRef: string;
  createdAtIso: string;
}): RedactedEvidenceArtifact {
  if (input.environment === AcceptanceEnvironment.AUTHORIZED_PRODUCTION) {
    throw new Error(
      "Fixture/sandbox evidence compiler must not emit authorized_production artifacts",
    );
  }
  return {
    artifactId: input.artifactId,
    caseId: input.caseId,
    environment: input.environment,
    redacted: true,
    summary: redactEvidenceSummary(input.summary),
    proofKinds: input.proofKinds,
    evidenceRef: input.evidenceRef,
    createdAtIso: input.createdAtIso,
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

export function soakChatGptAdsBlocked(): {
  allowed: false;
  wiring: "NOT_WIRED";
  reason: string;
} {
  const decision = evaluateChatGptAdsAccess({
    localTransportVerified: false,
    entitlementVerified: false,
    authVerified: false,
    projectEnvironment: AnalyticsEnvironment.FIXTURE,
    requestedEnvironment: AnalyticsEnvironment.LIVE,
  });
  return {
    allowed: false,
    wiring: "NOT_WIRED",
    reason:
      decision.reasons.join("; ") ||
      "ChatGPT Ads access-blocked without verified local transport and entitlement",
  };
}

/**
 * Proof kinds required before a fixture case may be ACCEPTED.
 * Incomplete or failed related proofs leave the case NOT_RUN / FAILED.
 */
export function expectedProofsForFixtureCase(
  caseId: SoakFixtureCaseId,
): SoakProofKindValue[] {
  switch (caseId) {
    case "T-X014":
      return [SoakProofKind.CRASH_RESTART, SoakProofKind.JOB_CONTINUITY];
    case "T-X020":
      return [SoakProofKind.UNKNOWN_REMOTE_RECONCILE];
    case "T-US-048":
      return [SoakProofKind.UNKNOWN_REMOTE_RECONCILE];
    case "T-X066":
      return [SoakProofKind.BACKUP_OMIT_RECEIPT];
    case "T-F24":
      return [SoakProofKind.RECOVER_ROTATE_RECONCILE];
    case "T-US-047":
      return [SoakProofKind.RECOVER_ROTATE_RECONCILE];
    case "T-US-002":
      return [SoakProofKind.COMPETING_SUPERVISOR_LEASE];
    case "T-X002":
      return [SoakProofKind.COMPETING_SUPERVISOR_LEASE];
    case "T-X018":
      return [SoakProofKind.SELF_APPROVAL_REJECTED];
    case "T-US-054":
      return [SoakProofKind.SELF_APPROVAL_REJECTED];
    case "T-X073":
      return [SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL];
    case "T-US-060":
      return [SoakProofKind.EMERGENCY_STOP_AT_COMMIT];
    case "T-X005":
      return [SoakProofKind.FORGED_BROWSER_ROLE_IGNORED];
    case "T-X006":
      return [SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED];
    case "T-X019":
      return [SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED];
    case "T-US-036":
      return [SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED];
    case "T-X029":
      return [SoakProofKind.EXPLICIT_ACCOUNT_REBIND];
    case "T-US-057":
      return [SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION];
    case "T-US-024":
      return [SoakProofKind.AGENT_CANNOT_WIDEN_GRANT];
    case "T-US-042":
      return [SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED];
    case "T-X057":
      return [SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED];
    case "T-US-044":
      return [SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES];
    case "T-X053":
      return [SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES];
    case "T-US-018":
      return [SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN];
    case "T-X037":
      return [SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN];
    case "T-X058":
      return [SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED];
    case "T-X069":
      return [SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA];
    case "T-X038":
      return [SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED];
    case "T-X039":
      return [SoakProofKind.METRIC_DENOMINATORS_HONEST];
    case "T-US-058":
      return [SoakProofKind.METRIC_DENOMINATORS_HONEST];
    case "T-US-046":
      return [SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION];
    case "T-X048":
      return [SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION];
    case "T-US-010":
      return [SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO];
    case "T-X033":
      return [SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO];
    case "T-US-008":
      return [SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION];
    case "T-X032":
      return [SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION];
    case "T-X031":
      return [SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED];
    case "T-US-040":
      return [SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY];
    case "T-X049":
      return [SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY];
    case "T-X017":
      return [SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE];
    case "T-X024":
      return [SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT];
    case "T-X011":
      return [SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED];
    case "T-X003":
      return [SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION];
    case "T-X050":
      return [SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT];
    case "T-X010":
      return [SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION];
    case "T-X009":
      return [SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO];
    case "T-X015":
      return [SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES];
    case "T-X001":
      return [SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP];
    case "T-X021":
      return [SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE];
    case "T-X008":
      return [SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE];
    case "T-X012":
      return [SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED];
    default:
      return [];
  }
}

/**
 * Map a proof kind to catalog cases it honestly exercises.
 * NO_DUPLICATE_EFFECTS stays unmapped: T-X066 requires BACKUP_OMIT_RECEIPT
 * (backup / omit-receipt / post-restore reconcile), not retry-only no-dup;
 * T-X021 requires CONCURRENT_IDEMPOTENT_RELEASE, not retry-only no-dup.
 */
export function mapProofToFixtureCases(
  kind: SoakProofKindValue,
): SoakFixtureCaseId[] {
  switch (kind) {
    case SoakProofKind.CRASH_RESTART:
      return ["T-X014"];
    case SoakProofKind.UNKNOWN_REMOTE_RECONCILE:
      return ["T-US-048", "T-X020"];
    case SoakProofKind.NO_DUPLICATE_EFFECTS:
      return [];
    case SoakProofKind.JOB_CONTINUITY:
      return ["T-X014"];
    case SoakProofKind.BACKUP_OMIT_RECEIPT:
      return ["T-X066"];
    case SoakProofKind.RECOVER_ROTATE_RECONCILE:
      return ["T-F24", "T-US-047"];
    case SoakProofKind.COMPETING_SUPERVISOR_LEASE:
      return ["T-US-002", "T-X002"];
    case SoakProofKind.SELF_APPROVAL_REJECTED:
      return ["T-X018", "T-US-054"];
    case SoakProofKind.OFFBOARD_ACTIVE_TOKEN_RESIDUAL:
      return ["T-X073"];
    case SoakProofKind.EMERGENCY_STOP_AT_COMMIT:
      return ["T-US-060"];
    case SoakProofKind.FORGED_BROWSER_ROLE_IGNORED:
      return ["T-X005"];
    case SoakProofKind.CROSS_WORKSPACE_REFERENCE_DENIED:
      return ["T-X006"];
    case SoakProofKind.APPROVED_PAYLOAD_EDIT_INVALIDATED:
      return ["T-X019", "T-US-036"];
    case SoakProofKind.EXPLICIT_ACCOUNT_REBIND:
      return ["T-X029"];
    case SoakProofKind.CROSS_WORKSPACE_RESOURCE_SUBSTITUTION:
      return ["T-US-057"];
    case SoakProofKind.AGENT_CANNOT_WIDEN_GRANT:
      return ["T-US-024"];
    case SoakProofKind.REPAIR_WEAKEN_TEST_REJECTED:
      return ["T-US-042", "T-X057"];
    case SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES:
      return ["T-US-044", "T-X053"];
    case SoakProofKind.EVAL_ONLY_OPERATIONAL_TOOL_FORBIDDEN:
      return ["T-US-018", "T-X037"];
    case SoakProofKind.REPAIR_ATTEMPT_LIMIT_ESCALATED:
      return ["T-X058"];
    case SoakProofKind.IMPORTED_DOC_QUARANTINED_AS_DATA:
      return ["T-X069"];
    case SoakProofKind.EVAL_NO_GROUNDING_FAIL_CLOSED:
      return ["T-X038"];
    case SoakProofKind.METRIC_DENOMINATORS_HONEST:
      return ["T-X039", "T-US-058"];
    case SoakProofKind.HARD_SEARCH_CONSTRAINTS_NO_INVENTION:
      return ["T-US-046", "T-X048"];
    case SoakProofKind.GSC_OMITTED_ROWS_UNKNOWN_NOT_ZERO:
      return ["T-US-010", "T-X033"];
    case SoakProofKind.GA4_DEBUG_NOT_DELIVERED_CONVERSION:
      return ["T-US-008", "T-X032"];
    case SoakProofKind.GA4_WRONG_PROPERTY_KIND_REFUSED:
      return ["T-X031"];
    case SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY:
      return ["T-US-040", "T-X049"];
    case SoakProofKind.STOP_AFTER_DISPATCH_RECONCILE:
      return ["T-X017"];
    case SoakProofKind.OLD_FENCE_AFTER_REASSIGNMENT:
      return ["T-X024"];
    case SoakProofKind.OUTPUT_BOMB_BOUNDED_QUARANTINED:
      return ["T-X011"];
    case SoakProofKind.SYMLINK_ESCAPE_AFTER_ROOT_VERIFICATION:
      return ["T-X003"];
    case SoakProofKind.PUBLIC_SYNTHETIC_FLAG_REQUIRES_SERVER_GRANT:
      return ["T-X050"];
    case SoakProofKind.MALICIOUS_PROMPT_NO_SHELL_INJECTION:
      return ["T-X010"];
    case SoakProofKind.CLI_ERROR_DESPITE_EXIT_ZERO:
      return ["T-X009"];
    case SoakProofKind.DST_RECURRING_SCHEDULE_NO_DUPLICATES:
      return ["T-X015"];
    case SoakProofKind.HOST_SLEEP_MONITORING_COVERAGE_GAP:
      return ["T-X001"];
    case SoakProofKind.CONCURRENT_IDEMPOTENT_RELEASE:
      return ["T-X021"];
    case SoakProofKind.FACT_CHANGES_AFTER_REVIEW_STALE:
      return ["T-X008"];
    case SoakProofKind.ORPHAN_WORKER_DEADLINE_TREE_STOPPED:
      return ["T-X012"];
    default:
      return [];
  }
}

/** Stable matrix/publish alias for a case (separate from per-run unique artifact IDs). */
export function stableFixtureEvidenceArtifactId(caseId: string): string {
  return `art-fixture-${caseId.toLowerCase()}`;
}

/** Per-run unique artifact ID so historical SoakRunRecord refs keep provenance. */
export function uniqueFixtureEvidenceArtifactId(
  caseId: string,
  runId: string,
): string {
  const short =
    runId.replace(/^soak-/, "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) ||
    "run";
  return `art-fixture-${caseId.toLowerCase()}-${short}`;
}
