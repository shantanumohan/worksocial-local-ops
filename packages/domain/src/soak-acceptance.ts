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
    default:
      return [];
  }
}

/**
 * Map a proof kind to catalog cases it honestly exercises.
 * NO_DUPLICATE_EFFECTS stays unmapped: T-X066 requires BACKUP_OMIT_RECEIPT
 * (backup / omit-receipt / post-restore reconcile), not retry-only no-dup.
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
