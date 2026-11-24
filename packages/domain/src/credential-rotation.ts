/**
 * WP10 / F24 credential rotation + offboarding honesty (fixture paths).
 *
 * Revocation: mark connection revoked, deny new leases / send-time effects,
 * cancel eligible queued work, retain audit history.
 * T-X029: token identity that maps to a *different* account requires explicit
 * rebind — never treat as a transparent same-account refresh.
 * Live provider revoke stays NOT_WIRED — never invent remote token revocation.
 * External effects: NONE. Broader catalog (T-F24 / T-US-047 / T-X073) stay
 * NOT_RUN here; T-X029 may be fixture ACCEPTED only via explicit rebind proof.
 */

import {
  ConnectionState,
  WriteReadiness,
  VerificationState,
  buildProviderStatusView,
  type ConnectionStateValue,
  type ProviderStatusView,
  type WriteReadinessValue,
  type VerificationStateValue,
} from "./connection-status.js";
import {
  EffectState,
  canTransition,
  type EffectStateValue,
} from "./effect-state-machine.js";

/** Related catalog ids — do not mark VERIFIED without authorized evidence. */
export const CREDENTIAL_ROTATION_RELATED_CASE_IDS = [
  "T-F24",
  "T-US-047",
  "T-X029",
  "T-X073",
] as const;

export const CredentialConnectionStatus = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  ROTATED_AWAY: "ROTATED_AWAY",
} as const;

export type CredentialConnectionStatusValue =
  (typeof CredentialConnectionStatus)[keyof typeof CredentialConnectionStatus];

export const CredentialAuditKind = {
  CONNECTION_SEEDED: "CONNECTION_SEEDED",
  LEASE_GRANTED: "LEASE_GRANTED",
  LEASE_DENIED: "LEASE_DENIED",
  EFFECT_DENIED: "EFFECT_DENIED",
  REVOKED: "REVOKED",
  ROTATED: "ROTATED",
  REBIND_REQUIRED: "REBIND_REQUIRED",
  REBOUND: "REBOUND",
  QUEUED_CANCELLED: "QUEUED_CANCELLED",
  QUEUED_RETAINED_POST_APPLY: "QUEUED_RETAINED_POST_APPLY",
  OFFBOARDED: "OFFBOARDED",
  LIVE_PROVIDER_REVOKE_NOT_WIRED: "LIVE_PROVIDER_REVOKE_NOT_WIRED",
} as const;

/** Account identity change classification for rotate vs rebind (T-X029). */
export const AccountTokenChange = {
  SAME_ACCOUNT: "SAME_ACCOUNT",
  DIFFERENT_ACCOUNT: "DIFFERENT_ACCOUNT",
} as const;

export type AccountTokenChangeValue =
  (typeof AccountTokenChange)[keyof typeof AccountTokenChange];

export type CredentialAuditKindValue =
  (typeof CredentialAuditKind)[keyof typeof CredentialAuditKind];

export const ResidualObligationKind = {
  ACTIVE_TOKEN: "ACTIVE_TOKEN",
  SCHEDULE: "SCHEDULE",
  QUEUED_WORK: "QUEUED_WORK",
  AUDIT_RETENTION: "AUDIT_RETENTION",
  BACKUP_COPY: "BACKUP_COPY",
  PROVIDER_REVOKE: "PROVIDER_REVOKE",
} as const;

export type ResidualObligationKindValue =
  (typeof ResidualObligationKind)[keyof typeof ResidualObligationKind];

export const ResidualObligationStatus = {
  OPEN: "OPEN",
  SATISFIED: "SATISFIED",
  BLOCKED_NOT_WIRED: "BLOCKED_NOT_WIRED",
} as const;

export type ResidualObligationStatusValue =
  (typeof ResidualObligationStatus)[keyof typeof ResidualObligationStatus];

export type FixtureCredentialConnection = {
  connectionId: string;
  providerId: string;
  /** Opaque broker reference — never a raw secret. */
  referenceId: string;
  accountLabel: string;
  status: CredentialConnectionStatusValue;
  connectionState: ConnectionStateValue;
  writeReadiness: WriteReadinessValue;
  verificationState: VerificationStateValue;
  scopes: string[];
  createdAtIso: string;
  revokedAtIso: string | null;
  /** Successor reference after local rotation (fixture). */
  rotatedToReferenceId: string | null;
  approvedBy: string | null;
};

export type CredentialLeaseDecision =
  | {
      ok: true;
      leaseId: string;
      connectionId: string;
      referenceId: string;
      scopes: string[];
      expiresAtIso: string;
    }
  | {
      ok: false;
      code:
        | "CONNECTION_MISSING"
        | "CONNECTION_REVOKED"
        | "CONNECTION_ROTATED_AWAY"
        | "SCOPE_DENIED";
      reason: string;
    };

export type CredentialEffectDecision =
  | { ok: true; connectionId: string }
  | {
      ok: false;
      code: "CONNECTION_REVOKED" | "CONNECTION_MISSING" | "CONNECTION_ROTATED_AWAY";
      reason: string;
    };

export type CredentialQueuedWorkItem = {
  workId: string;
  connectionId: string;
  capabilityId: string;
  operationId: string | null;
  effectState: EffectStateValue;
  queuedAtIso: string;
  summary: string;
};

export type QueuedWorkCancelResult = {
  workId: string;
  fromState: EffectStateValue;
  toState: EffectStateValue | null;
  cancelled: boolean;
  retainedForReconcile: boolean;
  reason: string;
};

export type CredentialAuditEntry = {
  entryId: string;
  kind: CredentialAuditKindValue;
  connectionId: string | null;
  referenceId: string | null;
  summary: string;
  /** Must never contain raw secrets. */
  redacted: true;
  recordedAtIso: string;
  details: Record<string, string | number | boolean | null>;
};

export type CredentialRotationRecord = {
  rotationId: string;
  connectionId: string;
  oldReferenceId: string;
  newReferenceId: string;
  approvedBy: string;
  /** Fixture-only local switch — not live provider revoke. */
  localSwitchComplete: true;
  /** Same-account local rotate only — not different-account rebind. */
  sameAccount: true;
  liveProviderRevoke: "NOT_WIRED";
  secretsExported: false;
  createdAtIso: string;
  summary: string;
};

/**
 * Explicit different-account rebind record (T-X029 fixture).
 * Never claims live provider revoke or silent same-connection refresh.
 */
export type CredentialRebindRecord = {
  rebindId: string;
  oldConnectionId: string;
  newConnectionId: string;
  oldAccountLabel: string;
  newAccountLabel: string;
  oldReferenceId: string;
  newReferenceId: string;
  approvedBy: string;
  explicitRebind: true;
  silentRefreshRejected: true;
  localSwitchComplete: true;
  liveProviderRevoke: "NOT_WIRED";
  secretsExported: false;
  catalogCaseId: "T-X029";
  externalEffects: "NONE";
  createdAtIso: string;
  summary: string;
};

export type ResidualObligation = {
  obligationId: string;
  kind: ResidualObligationKindValue;
  status: ResidualObligationStatusValue;
  summary: string;
  connectionId: string | null;
};

export type OffboardingManifest = {
  manifestId: string;
  connectionId: string;
  revokedLocally: true;
  schedulesDisabled: true;
  queuedCancelledCount: number;
  queuedRetainedPostApplyCount: number;
  auditRetained: true;
  residualObligations: ResidualObligation[];
  /** Live remote revoke is never claimed complete here. */
  liveProviderRevoke: "NOT_WIRED";
  externalEffects: "NONE";
  productionActivated: false;
  catalogClaim: "NOT_RUN";
  createdAtIso: string;
  summary: string;
};

export type CredentialRotationState = {
  version: 1;
  updatedAtIso: string;
  connections: FixtureCredentialConnection[];
  queuedWork: CredentialQueuedWorkItem[];
  audit: CredentialAuditEntry[];
  rotations: CredentialRotationRecord[];
  rebinds: CredentialRebindRecord[];
  offboardingManifests: OffboardingManifest[];
  liveWiring: {
    localRevoke: "fixture";
    localRotation: "fixture";
    localRebind: "fixture";
    offboardingManifest: "fixture";
    liveProviderRevocation: "NOT_WIRED";
  };
  /** Broader F24/offboarding stay NOT_RUN; T-X029 ACCEPTED only via evidence compiler. */
  catalogClaim: "NOT_RUN";
  chatgptAdsWiring: "NOT_WIRED";
  productionActivated: false;
  externalEffects: "NONE";
};

export function emptyCredentialRotationState(
  nowIso: string,
): CredentialRotationState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    connections: [],
    queuedWork: [],
    audit: [],
    rotations: [],
    rebinds: [],
    offboardingManifests: [],
    liveWiring: {
      localRevoke: "fixture",
      localRotation: "fixture",
      localRebind: "fixture",
      offboardingManifest: "fixture",
      liveProviderRevocation: "NOT_WIRED",
    },
    catalogClaim: "NOT_RUN",
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
    externalEffects: "NONE",
  };
}

export function connectionStatusView(
  connection: FixtureCredentialConnection,
): ProviderStatusView {
  return buildProviderStatusView({
    providerId: connection.providerId,
    connectionState: connection.connectionState,
    writeReadiness: connection.writeReadiness,
    verificationState: connection.verificationState,
  });
}

/**
 * Mark a connection revoked locally. Denies future leases/effects.
 * Does not call the live provider.
 */
export function markConnectionRevoked(
  connection: FixtureCredentialConnection,
  nowIso: string,
  approvedBy: string | null,
): FixtureCredentialConnection {
  return {
    ...connection,
    status: CredentialConnectionStatus.REVOKED,
    connectionState: ConnectionState.REVOKED,
    writeReadiness: WriteReadiness.BLOCKED,
    verificationState: VerificationState.NOT_VERIFIED,
    revokedAtIso: nowIso,
    approvedBy,
  };
}

export function evaluateCredentialLease(input: {
  connection: FixtureCredentialConnection | null;
  requestedScopes: string[];
  leaseId: string;
  nowIso: string;
  ttlMs?: number;
}): CredentialLeaseDecision {
  if (!input.connection) {
    return {
      ok: false,
      code: "CONNECTION_MISSING",
      reason: "Unknown credential connection",
    };
  }
  if (input.connection.status === CredentialConnectionStatus.REVOKED) {
    return {
      ok: false,
      code: "CONNECTION_REVOKED",
      reason:
        "Connection is revoked — new leases denied (local honesty; live provider revoke may still be outstanding)",
    };
  }
  if (input.connection.status === CredentialConnectionStatus.ROTATED_AWAY) {
    return {
      ok: false,
      code: "CONNECTION_ROTATED_AWAY",
      reason: "Connection was rotated away — use the successor reference",
    };
  }
  for (const scope of input.requestedScopes) {
    if (
      !input.connection.scopes.includes(scope) &&
      !input.connection.scopes.includes("*")
    ) {
      return {
        ok: false,
        code: "SCOPE_DENIED",
        reason: `Scope '${scope}' is not present on the connection`,
      };
    }
  }
  const ttlMs = input.ttlMs ?? 60_000;
  return {
    ok: true,
    leaseId: input.leaseId,
    connectionId: input.connection.connectionId,
    referenceId: input.connection.referenceId,
    scopes: [...input.requestedScopes],
    expiresAtIso: new Date(Date.parse(input.nowIso) + ttlMs).toISOString(),
  };
}

export function evaluateSendTimeEffect(input: {
  connection: FixtureCredentialConnection | null;
}): CredentialEffectDecision {
  if (!input.connection) {
    return {
      ok: false,
      code: "CONNECTION_MISSING",
      reason: "Unknown credential connection",
    };
  }
  if (input.connection.status === CredentialConnectionStatus.REVOKED) {
    return {
      ok: false,
      code: "CONNECTION_REVOKED",
      reason: "Revoked connection blocks send-time effects",
    };
  }
  if (input.connection.status === CredentialConnectionStatus.ROTATED_AWAY) {
    return {
      ok: false,
      code: "CONNECTION_ROTATED_AWAY",
      reason: "Rotated-away connection blocks send-time effects",
    };
  }
  return { ok: true, connectionId: input.connection.connectionId };
}

/**
 * Cancel eligible queued work on revoke.
 * Pre-apply / waiting states → CANCELLED.
 * Post-apply (APPLYING/VERIFYING/URO/COMPLETE) retained for reconcile — not cancelled.
 */
export function cancelEligibleQueuedWork(
  items: readonly CredentialQueuedWorkItem[],
): QueuedWorkCancelResult[] {
  return items.map((item) => {
    if (
      item.effectState === EffectState.APPLYING ||
      item.effectState === EffectState.VERIFYING ||
      item.effectState === EffectState.UNKNOWN_REMOTE_OUTCOME ||
      item.effectState === EffectState.COMPLETE
    ) {
      return {
        workId: item.workId,
        fromState: item.effectState,
        toState: null,
        cancelled: false,
        retainedForReconcile: true,
        reason:
          "Post-apply work retained for reconcile — revoke does not cancel ambiguous remote outcomes",
      };
    }
    if (
      item.effectState === EffectState.CANCELLED ||
      item.effectState === EffectState.QUARANTINED
    ) {
      return {
        workId: item.workId,
        fromState: item.effectState,
        toState: item.effectState,
        cancelled: false,
        retainedForReconcile: false,
        reason: `Already terminal (${item.effectState})`,
      };
    }
    if (!canTransition(item.effectState, EffectState.CANCELLED)) {
      return {
        workId: item.workId,
        fromState: item.effectState,
        toState: null,
        cancelled: false,
        retainedForReconcile: true,
        reason: `Cannot cancel from ${item.effectState} — retained`,
      };
    }
    return {
      workId: item.workId,
      fromState: item.effectState,
      toState: EffectState.CANCELLED,
      cancelled: true,
      retainedForReconcile: false,
      reason: "Eligible queued work cancelled after local revoke",
    };
  });
}

export function applyQueuedCancelResults(
  items: readonly CredentialQueuedWorkItem[],
  results: readonly QueuedWorkCancelResult[],
): CredentialQueuedWorkItem[] {
  const byId = new Map(results.map((r) => [r.workId, r]));
  return items.map((item) => {
    const result = byId.get(item.workId);
    if (!result || !result.cancelled || result.toState === null) {
      return item;
    }
    return { ...item, effectState: result.toState };
  });
}

export function buildRotationRecord(input: {
  rotationId: string;
  connectionId: string;
  oldReferenceId: string;
  newReferenceId: string;
  approvedBy: string;
  nowIso: string;
}): CredentialRotationRecord {
  return {
    rotationId: input.rotationId,
    connectionId: input.connectionId,
    oldReferenceId: input.oldReferenceId,
    newReferenceId: input.newReferenceId,
    approvedBy: input.approvedBy,
    localSwitchComplete: true,
    sameAccount: true,
    liveProviderRevoke: "NOT_WIRED",
    secretsExported: false,
    createdAtIso: input.nowIso,
    summary:
      "Local broker reference rotated (fixture, same account). Old reference marked revoked. Live provider revoke NOT_WIRED — no secret export. Different-account tokens require explicit rebind (T-X029).",
  };
}

/** Normalize account labels for identity comparison. */
export function normalizeAccountLabel(label: string): string {
  return label.trim().toLowerCase();
}

/**
 * Classify whether an observed token identity maps to the same account
 * or a different one (T-X029).
 */
export function classifyAccountTokenChange(input: {
  previousAccountLabel: string;
  observedAccountLabel: string;
}): AccountTokenChangeValue {
  const prev = normalizeAccountLabel(input.previousAccountLabel);
  const next = normalizeAccountLabel(input.observedAccountLabel);
  if (!prev || !next) {
    // Empty/unknown labels cannot prove same-account — treat as different
    // so callers must use explicit rebind rather than silent refresh.
    return AccountTokenChange.DIFFERENT_ACCOUNT;
  }
  return prev === next
    ? AccountTokenChange.SAME_ACCOUNT
    : AccountTokenChange.DIFFERENT_ACCOUNT;
}

/**
 * Same-account rotate requires a non-empty observed account identity that
 * matches the bound connection. Blank/missing identity cannot prove same-account
 * and must not allow silent different-account bind (T-X029).
 */
export function evaluateSilentRotateAllowed(input: {
  previousAccountLabel: string;
  observedAccountLabel: string | null | undefined;
}):
  | { ok: true; change: "SAME_ACCOUNT" }
  | {
      ok: false;
      code: "ACCOUNT_IDENTITY_REQUIRED" | "REBIND_REQUIRED";
      change: "DIFFERENT_ACCOUNT" | null;
      reason: string;
    } {
  if (
    input.observedAccountLabel === null ||
    input.observedAccountLabel === undefined ||
    input.observedAccountLabel.trim() === ""
  ) {
    return {
      ok: false,
      code: "ACCOUNT_IDENTITY_REQUIRED",
      change: null,
      reason:
        "Same-account rotate requires a non-empty observedAccountLabel proving token identity (T-X029); blank identity cannot authorize silent refresh",
    };
  }
  const change = classifyAccountTokenChange({
    previousAccountLabel: input.previousAccountLabel,
    observedAccountLabel: input.observedAccountLabel,
  });
  if (change === AccountTokenChange.DIFFERENT_ACCOUNT) {
    return {
      ok: false,
      code: "REBIND_REQUIRED",
      change: AccountTokenChange.DIFFERENT_ACCOUNT,
      reason:
        "Token identity maps to a different account — explicit rebind required (T-X029); silent same-connection refresh denied",
    };
  }
  return { ok: true, change: AccountTokenChange.SAME_ACCOUNT };
}

/**
 * Mark the prior connection ROTATED_AWAY after an explicit different-account rebind.
 * Denies leases/effects on the old connection; successor is a new connection.
 */
export function markConnectionRotatedAway(
  connection: FixtureCredentialConnection,
  nowIso: string,
  approvedBy: string | null,
  rotatedToReferenceId: string,
): FixtureCredentialConnection {
  return {
    ...connection,
    status: CredentialConnectionStatus.ROTATED_AWAY,
    connectionState: ConnectionState.REVOKED,
    writeReadiness: WriteReadiness.BLOCKED,
    verificationState: VerificationState.NOT_VERIFIED,
    revokedAtIso: nowIso,
    approvedBy,
    rotatedToReferenceId,
  };
}

export function buildRebindRecord(input: {
  rebindId: string;
  oldConnectionId: string;
  newConnectionId: string;
  oldAccountLabel: string;
  newAccountLabel: string;
  oldReferenceId: string;
  newReferenceId: string;
  approvedBy: string;
  nowIso: string;
}): CredentialRebindRecord {
  return {
    rebindId: input.rebindId,
    oldConnectionId: input.oldConnectionId,
    newConnectionId: input.newConnectionId,
    oldAccountLabel: input.oldAccountLabel,
    newAccountLabel: input.newAccountLabel,
    oldReferenceId: input.oldReferenceId,
    newReferenceId: input.newReferenceId,
    approvedBy: input.approvedBy,
    explicitRebind: true,
    silentRefreshRejected: true,
    localSwitchComplete: true,
    liveProviderRevoke: "NOT_WIRED",
    secretsExported: false,
    catalogCaseId: "T-X029",
    externalEffects: "NONE",
    createdAtIso: input.nowIso,
    summary:
      "Explicit different-account rebind (T-X029 fixture). Old connection ROTATED_AWAY; new connection bound. Silent refresh rejected. Live provider revoke NOT_WIRED. External effects NONE.",
  };
}

/**
 * Validate an explicit rebind request. Requires a different account label
 * and non-empty approval — never invents same-account rebind as ACCEPTED proof.
 */
export function evaluateExplicitRebind(input: {
  connection: FixtureCredentialConnection | null;
  newAccountLabel: string;
  approvedBy: string;
}):
  | {
      ok: true;
      oldAccountLabel: string;
      newAccountLabel: string;
      change: "DIFFERENT_ACCOUNT";
    }
  | {
      ok: false;
      code:
        | "CONNECTION_MISSING"
        | "CONNECTION_NOT_ACTIVE"
        | "SAME_ACCOUNT"
        | "APPROVAL_REQUIRED"
        | "ACCOUNT_LABEL_REQUIRED";
      reason: string;
    } {
  if (!input.connection) {
    return {
      ok: false,
      code: "CONNECTION_MISSING",
      reason: "Unknown credential connection",
    };
  }
  if (input.connection.status !== CredentialConnectionStatus.ACTIVE) {
    return {
      ok: false,
      code: "CONNECTION_NOT_ACTIVE",
      reason: `Cannot rebind connection in status ${input.connection.status}`,
    };
  }
  if (!input.approvedBy.trim()) {
    return {
      ok: false,
      code: "APPROVAL_REQUIRED",
      reason: "Explicit rebind requires approvedBy (T-X029)",
    };
  }
  const newLabel = input.newAccountLabel.trim();
  if (!newLabel) {
    return {
      ok: false,
      code: "ACCOUNT_LABEL_REQUIRED",
      reason: "Explicit rebind requires newAccountLabel (T-X029)",
    };
  }
  const change = classifyAccountTokenChange({
    previousAccountLabel: input.connection.accountLabel,
    observedAccountLabel: newLabel,
  });
  if (change !== AccountTokenChange.DIFFERENT_ACCOUNT) {
    return {
      ok: false,
      code: "SAME_ACCOUNT",
      reason:
        "Observed account matches the bound connection — use rotate for same-account local refresh, not rebind",
    };
  }
  return {
    ok: true,
    oldAccountLabel: input.connection.accountLabel,
    newAccountLabel: newLabel,
    change: AccountTokenChange.DIFFERENT_ACCOUNT,
  };
}

/**
 * Honest live provider revoke attempt — always NOT_WIRED in this slice.
 * Never invents remote token revocation or live VERIFIED completion (T-X073).
 * claimLiveVerified / forceCompleteRemoteRevoke still refuse (edge honesty I9).
 */
export function attemptLiveProviderRevoke(input: {
  connectionId: string;
  referenceId: string;
  claimLiveVerified?: boolean;
  forceCompleteRemoteRevoke?: boolean;
}): {
  ok: false;
  code: "LIVE_PROVIDER_REVOKE_NOT_WIRED" | "LIVE_CLAIM_REFUSED";
  liveProviderRevoke: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
  reason: string;
} {
  if (
    input.claimLiveVerified === true ||
    input.forceCompleteRemoteRevoke === true
  ) {
    return {
      ok: false,
      code: "LIVE_CLAIM_REFUSED",
      liveProviderRevoke: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
      reason:
        "Live VERIFIED / force-complete remote revoke refused — live provider revoke stays NOT_WIRED (T-X073); ACCEPTED≠VERIFIED; externalEffects=NONE.",
    };
  }
  // Whitespace-padded / empty ids still refuse inventing a live revoke (I11).
  if (
    input.connectionId !== input.connectionId.trim() ||
    input.referenceId !== input.referenceId.trim()
  ) {
    return {
      ok: false,
      code: "LIVE_PROVIDER_REVOKE_NOT_WIRED",
      liveProviderRevoke: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      externalEffects: "NONE",
      reason:
        "Whitespace-padded connection/reference id — live provider revoke stays NOT_WIRED (T-X073); ACCEPTED≠VERIFIED; externalEffects=NONE.",
    };
  }
  return {
    ok: false,
    code: "LIVE_PROVIDER_REVOKE_NOT_WIRED",
    liveProviderRevoke: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
    reason:
      "Live provider credential revocation is NOT_WIRED (T-X073). Local connection may be marked revoked; remote token revoke must be performed through the provider process separately. ACCEPTED≠VERIFIED; externalEffects=NONE.",
  };
}

export function buildOffboardingManifest(input: {
  manifestId: string;
  connectionId: string;
  cancelResults: readonly QueuedWorkCancelResult[];
  hasActiveTokenResidual: boolean;
  nowIso: string;
}): OffboardingManifest {
  const cancelled = input.cancelResults.filter((r) => r.cancelled).length;
  const retained = input.cancelResults.filter(
    (r) => r.retainedForReconcile,
  ).length;

  const residualObligations: ResidualObligation[] = [
    {
      obligationId: `obl-audit-${input.manifestId}`,
      kind: ResidualObligationKind.AUDIT_RETENTION,
      status: ResidualObligationStatus.SATISFIED,
      summary: "Local audit history retained after offboarding",
      connectionId: input.connectionId,
    },
    {
      obligationId: `obl-sched-${input.manifestId}`,
      kind: ResidualObligationKind.SCHEDULE,
      status: ResidualObligationStatus.SATISFIED,
      summary: "Local schedules disabled for revoked connection",
      connectionId: input.connectionId,
    },
    {
      obligationId: `obl-queue-${input.manifestId}`,
      kind: ResidualObligationKind.QUEUED_WORK,
      status:
        retained > 0
          ? ResidualObligationStatus.OPEN
          : ResidualObligationStatus.SATISFIED,
      summary:
        retained > 0
          ? `${retained} post-apply item(s) retained for reconcile; ${cancelled} cancelled`
          : `${cancelled} eligible queued item(s) cancelled`,
      connectionId: input.connectionId,
    },
    {
      obligationId: `obl-provider-${input.manifestId}`,
      kind: ResidualObligationKind.PROVIDER_REVOKE,
      status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
      summary:
        "Live provider token revoke NOT_WIRED — residual stays BLOCKED_NOT_WIRED until performed externally (never silently COMPLETED/VERIFIED)",
      connectionId: input.connectionId,
    },
  ];

  if (input.hasActiveTokenResidual) {
    residualObligations.unshift({
      obligationId: `obl-token-${input.manifestId}`,
      kind: ResidualObligationKind.ACTIVE_TOKEN,
      status: ResidualObligationStatus.BLOCKED_NOT_WIRED,
      summary:
        "T-X073: provider-side token may still be active until live revoke is wired/performed — incomplete until revoked; ACCEPTED≠VERIFIED",
      connectionId: input.connectionId,
    });
  }

  return {
    manifestId: input.manifestId,
    connectionId: input.connectionId,
    revokedLocally: true,
    schedulesDisabled: true,
    queuedCancelledCount: cancelled,
    queuedRetainedPostApplyCount: retained,
    auditRetained: true,
    residualObligations,
    liveProviderRevoke: "NOT_WIRED",
    externalEffects: "NONE",
    productionActivated: false,
    catalogClaim: "NOT_RUN",
    createdAtIso: input.nowIso,
    summary:
      "Offboarding manifest (fixture). Local revoke + queue cancel + audit retained. Live provider revoke NOT_WIRED. Incomplete until external revoke. ACCEPTED≠VERIFIED. Catalog NOT_RUN. externalEffects=NONE.",
  };
}

/**
 * Fail-closed honesty check for T-X073 offboarding manifests:
 * ACTIVE_TOKEN + PROVIDER_REVOKE must remain BLOCKED_NOT_WIRED; live revoke NOT_WIRED;
 * never invent COMPLETED remote revoke or live VERIFIED.
 */
export function assertOffboardActiveTokenResidualHonest(
  manifest: OffboardingManifest,
): {
  ok: boolean;
  code: "OFFBOARD_RESIDUAL_HONEST" | "OFFBOARD_RESIDUAL_DISHONEST";
  reasons: string[];
  liveProviderRevoke: "NOT_WIRED";
  externalEffects: "NONE";
} {
  const reasons: string[] = [];
  const active = manifest.residualObligations.find(
    (o) => o.kind === ResidualObligationKind.ACTIVE_TOKEN,
  );
  const provider = manifest.residualObligations.find(
    (o) => o.kind === ResidualObligationKind.PROVIDER_REVOKE,
  );
  if (!active) {
    reasons.push("ACTIVE_TOKEN residual must be present (T-X073 edge honesty)");
  } else if (active.status !== ResidualObligationStatus.BLOCKED_NOT_WIRED) {
    reasons.push("ACTIVE_TOKEN residual must be BLOCKED_NOT_WIRED (T-X073)");
  }
  if (!provider) {
    reasons.push("PROVIDER_REVOKE residual must be present (T-X073 edge honesty)");
  } else if (provider.status !== ResidualObligationStatus.BLOCKED_NOT_WIRED) {
    reasons.push("PROVIDER_REVOKE residual must be BLOCKED_NOT_WIRED (T-X073)");
  }
  if (manifest.liveProviderRevoke !== "NOT_WIRED") {
    reasons.push("liveProviderRevoke must stay NOT_WIRED");
  }
  if (manifest.externalEffects !== "NONE") {
    reasons.push("externalEffects must be NONE");
  }
  if (manifest.catalogClaim !== "NOT_RUN") {
    reasons.push("catalogClaim must stay NOT_RUN (fixture ACCEPTED ≠ VERIFIED)");
  }
  if (
    (manifest as { productionActivated: boolean }).productionActivated !== false
  ) {
    reasons.push("productionActivated must stay false (T-X073 edge honesty)");
  }
  if (
    (manifest as { revokedLocally: boolean }).revokedLocally !== true
  ) {
    reasons.push("revokedLocally must be true (T-X073 edge honesty I11)");
  }
  if ((manifest as { auditRetained: boolean }).auditRetained !== true) {
    reasons.push("auditRetained must be true (T-X073 edge honesty I11)");
  }
  if (
    (manifest as { schedulesDisabled: boolean }).schedulesDisabled !== true
  ) {
    reasons.push("schedulesDisabled must be true (T-X073 edge honesty I11)");
  }
  const blob = JSON.stringify(manifest);
  // Allow honest ACCEPTED≠VERIFIED / NOT_VERIFIED / never-silently phrasing;
  // reject any remaining live-success inventions in summaries/obligations.
  const scrubbed = blob
    .replace(/ACCEPTED\s*≠\s*VERIFIED/gi, "")
    .replace(/NOT_VERIFIED/g, "")
    .replace(/never\s+silently\s+COMPLETED\/VERIFIED/gi, "")
    .replace(/fixture ACCEPTED via soak only/gi, "");
  if (
    /liveProviderSuccessClaimed"\s*:\s*true/.test(scrubbed) ||
    /\bVERIFIED\b/i.test(scrubbed) ||
    /\b(live\s+)?provider\s+revoke\s+(completed|complete|succeeded|success)\b/i.test(
      scrubbed,
    ) ||
    /\bremote\s+revoke\s+(completed|complete|succeeded|success)\b/i.test(
      scrubbed,
    ) ||
    /\blive\s+revoke\s+(completed|complete|succeeded|success)\b/i.test(
      scrubbed,
    ) ||
    /\boffboarding\s+is\s+now\s+live\b/i.test(scrubbed)
  ) {
    reasons.push("Manifest must not invent live VERIFIED or remote revoke success");
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      code: "OFFBOARD_RESIDUAL_DISHONEST",
      reasons,
      liveProviderRevoke: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }
  return {
    ok: true,
    code: "OFFBOARD_RESIDUAL_HONEST",
    reasons: [
      "ACTIVE_TOKEN + PROVIDER_REVOKE BLOCKED_NOT_WIRED",
      "liveProviderRevoke=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
    ],
    liveProviderRevoke: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export type OffboardResidualReclaimResult = {
  honesty: ReturnType<typeof assertOffboardActiveTokenResidualHonest>;
  /** Pure reclaim — never invents a prior live remote revoke. */
  priorLiveRevokeInvented: false;
  liveProviderRevoke: "NOT_WIRED";
  externalEffects: "NONE";
};

/**
 * Idempotent reclaim of T-X073 residual honesty (edge honesty I9).
 * Re-checking the same manifest must not invent live revoke success.
 */
export function reclaimOffboardActiveTokenResidual(
  manifest: OffboardingManifest,
): OffboardResidualReclaimResult {
  return {
    honesty: assertOffboardActiveTokenResidualHonest(manifest),
    priorLiveRevokeInvented: false,
    liveProviderRevoke: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

/**
 * Fail-closed: two reclaim passes over the same offboard residual must agree.
 */
export function assertOffboardActiveTokenResidualReclaimIdempotent(input: {
  first: OffboardResidualReclaimResult;
  second: OffboardResidualReclaimResult;
}): {
  ok: boolean;
  code: "OFFBOARD_RECLAIM_IDEMPOTENT" | "OFFBOARD_RECLAIM_DRIFT";
  reasons: string[];
  liveProviderRevoke: "NOT_WIRED";
  externalEffects: "NONE";
} {
  const reasons: string[] = [];
  const { first, second } = input;
  if (
    first.priorLiveRevokeInvented !== false ||
    second.priorLiveRevokeInvented !== false
  ) {
    reasons.push("priorLiveRevokeInvented must be false on both reclaim passes");
  }
  if (
    first.liveProviderRevoke !== "NOT_WIRED" ||
    second.liveProviderRevoke !== "NOT_WIRED"
  ) {
    reasons.push("liveProviderRevoke must be NOT_WIRED on reclaim");
  }
  if (first.externalEffects !== "NONE" || second.externalEffects !== "NONE") {
    reasons.push("externalEffects must be NONE on reclaim");
  }
  if (first.honesty.ok !== second.honesty.ok) {
    reasons.push("reclaim honesty.ok drifted");
  }
  if (first.honesty.code !== second.honesty.code) {
    reasons.push("reclaim honesty.code drifted");
  }
  if (!first.honesty.ok || !second.honesty.ok) {
    reasons.push("idempotent reclaim requires honest residual on both passes");
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      code: "OFFBOARD_RECLAIM_DRIFT",
      reasons,
      liveProviderRevoke: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }
  return {
    ok: true,
    code: "OFFBOARD_RECLAIM_IDEMPOTENT",
    reasons: [
      "idempotent reclaim: residual honesty agrees; no invent live revoke; ACCEPTED≠VERIFIED",
    ],
    liveProviderRevoke: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export function createAuditEntry(input: {
  entryId: string;
  kind: CredentialAuditKindValue;
  connectionId: string | null;
  referenceId: string | null;
  summary: string;
  nowIso: string;
  details?: Record<string, string | number | boolean | null>;
}): CredentialAuditEntry {
  return {
    entryId: input.entryId,
    kind: input.kind,
    connectionId: input.connectionId,
    referenceId: input.referenceId,
    summary: input.summary,
    redacted: true,
    recordedAtIso: input.nowIso,
    details: input.details ?? {},
  };
}

/** Seed an active fixture connection (no secrets). */
export function seedFixtureConnection(input: {
  connectionId: string;
  providerId: string;
  referenceId: string;
  accountLabel: string;
  scopes: string[];
  nowIso: string;
}): FixtureCredentialConnection {
  return {
    connectionId: input.connectionId,
    providerId: input.providerId,
    referenceId: input.referenceId,
    accountLabel: input.accountLabel,
    status: CredentialConnectionStatus.ACTIVE,
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.WRITE_READY,
    verificationState: VerificationState.NOT_VERIFIED,
    scopes: [...input.scopes],
    createdAtIso: input.nowIso,
    revokedAtIso: null,
    rotatedToReferenceId: null,
    approvedBy: null,
  };
}
