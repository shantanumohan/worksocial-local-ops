/**
 * T-F01 — Create a trusted local workspace (complete F01 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F01 evidence
 * package — owner id/role/session, workspace configuration revision,
 * timestamped host diagnostics (not a decorative online badge), initial
 * Observe authority decision, startup result, recovery test, and explicit
 * blockers with next actions. Public writes must not occur. Incomplete
 * evidence packages and false live-verified claims are refused. Live
 * provider wiring stays NOT_WIRED. Pure domain — no network I/O. Fixture
 * ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from open T-US-001 readiness summary
 * (`TRUSTED_WORKSPACE_READINESS_BLOCKERS_NEXT_ACTIONS`) — this records the
 * complete F01 flow evidence package, not the four-dimension readiness
 * blockers map.
 */

export const InitialOperatingMode = {
  OBSERVE: "Observe",
} as const;

export type InitialOperatingModeValue =
  (typeof InitialOperatingMode)[keyof typeof InitialOperatingMode];

export const DiagnosticProbeKind = {
  SERVICE_IDENTITY: "service_identity",
  LEASE: "lease",
  STORAGE: "storage",
  CLOCK: "clock",
  /** Decorative online badge — never sufficient for F01 evidence. */
  ONLINE_BADGE: "online_badge",
} as const;

export type DiagnosticProbeKindValue =
  (typeof DiagnosticProbeKind)[keyof typeof DiagnosticProbeKind];

export const REQUIRED_DIAGNOSTIC_KINDS = [
  DiagnosticProbeKind.SERVICE_IDENTITY,
  DiagnosticProbeKind.LEASE,
  DiagnosticProbeKind.STORAGE,
  DiagnosticProbeKind.CLOCK,
] as const;

export type OwnerSessionRecord = {
  ownerId: string;
  role: string;
  sessionId: string;
};

export type TimestampedDiagnostic = {
  probeId: string;
  kind: DiagnosticProbeKindValue;
  label: string;
  ok: boolean;
  detail: string;
  /** Required — decorative badges without timestamps are refused. */
  observedAtIso: string;
};

export type InitialAuthorityDecision = {
  decisionId: string;
  operatingMode: InitialOperatingModeValue;
  decidedAtIso: string;
  /** Observe must deny publish / public writes. */
  observeDeniesPublish: boolean;
};

export type StartupResultRecord = {
  startupId: string;
  status: "PASSED" | "FAILED" | "BLOCKED";
  unattendedStartupEnabled: boolean;
  hostRequirementsReviewed: boolean;
  completedAtIso: string;
};

export type RecoveryTestRecord = {
  recoveryTestId: string;
  status: "PASSED" | "FAILED" | "BLOCKED";
  completedAtIso: string;
};

export type BlockerNextAction = {
  blockerId: string;
  blocker: string;
  nextAction: string;
};

export type CreateTrustedLocalWorkspaceInput = {
  packageId: string;
  ownerSession: OwnerSessionRecord;
  workspaceConfigRevision: string;
  businessName: string;
  timezone: string;
  notificationRecipients: readonly string[];
  diagnostics: readonly TimestampedDiagnostic[];
  initialAuthority: InitialAuthorityDecision;
  startupResult: StartupResultRecord;
  recoveryTest: RecoveryTestRecord;
  blockers: readonly BlockerNextAction[];
  /** Must stay false for fixture ACCEPTED honesty. */
  publicWritesOccurred: boolean;
  /** Attempt a public write during F01 — must refuse. */
  attemptPublicWrite: boolean;
  /** Claim the workspace path is live-verified — must refuse offline. */
  claimLiveVerifiedWorkspace: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type CreateTrustedLocalWorkspaceDecision =
  | {
      allowed: true;
      code: "CREATE_TRUSTED_LOCAL_WORKSPACE_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        ownerId: string;
        role: string;
        sessionId: string;
        workspaceConfigRevision: string;
        businessName: string;
        timezone: string;
        notificationRecipientCount: number;
        diagnosticCount: number;
        requiredDiagnosticKindsCovered: true;
        decorativeOnlineBadgeOnly: false;
        authorityDecisionId: string;
        operatingMode: "Observe";
        observeDeniesPublish: true;
        startupStatus: "PASSED";
        recoveryTestStatus: "PASSED";
        blockerCount: number;
        everyBlockerHasNextAction: true;
        publicWritesOccurred: false;
        workspaceVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F01_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "TRUSTED_LOCAL_WORKSPACE_RECORDED";
        recoveryPath: "KEEP_OBSERVE_NO_PUBLIC_WRITES";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "OWNER_SESSION_REQUIRED"
        | "WORKSPACE_CONFIG_REVISION_REQUIRED"
        | "TIMESTAMPED_DIAGNOSTICS_REQUIRED"
        | "DECORATIVE_ONLINE_BADGE_REFUSED"
        | "INITIAL_AUTHORITY_REQUIRED"
        | "OBSERVE_MODE_REQUIRED"
        | "STARTUP_RESULT_REQUIRED"
        | "RECOVERY_TEST_REQUIRED"
        | "BLOCKER_NEXT_ACTION_REQUIRED"
        | "PUBLIC_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_WORKSPACE_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        ownerId: string | null;
        role: string | null;
        sessionId: string | null;
        workspaceConfigRevision: string | null;
        businessName: string | null;
        timezone: string | null;
        notificationRecipientCount: number;
        diagnosticCount: number;
        requiredDiagnosticKindsCovered: boolean;
        decorativeOnlineBadgeOnly: boolean;
        authorityDecisionId: string | null;
        operatingMode: string | null;
        observeDeniesPublish: boolean;
        startupStatus: string | null;
        recoveryTestStatus: string | null;
        blockerCount: number;
        everyBlockerHasNextAction: boolean;
        publicWritesOccurred: boolean;
        workspaceVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_OWNER_SESSION"
          | "AWAITING_WORKSPACE_REVISION"
          | "AWAITING_TIMESTAMPED_DIAGNOSTICS"
          | "AWAITING_INITIAL_AUTHORITY"
          | "AWAITING_STARTUP_RESULT"
          | "AWAITING_RECOVERY_TEST"
          | "AWAITING_BLOCKER_NEXT_ACTIONS";
        recoveryPath:
          | "PROVIDE_OWNER_SESSION"
          | "SET_WORKSPACE_CONFIG_REVISION"
          | "RECORD_TIMESTAMPED_DIAGNOSTICS"
          | "CHOOSE_OBSERVE_AUTHORITY"
          | "COMPLETE_STARTUP_AND_RECOVERY"
          | "ATTACH_NEXT_ACTION_PER_BLOCKER"
          | "KEEP_OBSERVE_NO_PUBLIC_WRITES";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CREATE_TRUSTED_LOCAL_WORKSPACE_RELATED_CASE_IDS = [
  "T-F01",
] as const;

function preservedInputCount(input: CreateTrustedLocalWorkspaceInput): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.ownerSession.ownerId.trim() ? 1 : 0) +
    (input.workspaceConfigRevision.trim() ? 1 : 0) +
    (input.diagnostics.length > 0 ? 1 : 0) +
    (input.initialAuthority.decisionId.trim() ? 1 : 0) +
    (input.startupResult.startupId.trim() ? 1 : 0) +
    (input.recoveryTest.recoveryTestId.trim() ? 1 : 0)
  );
}

function requiredKindsCovered(
  diagnostics: readonly TimestampedDiagnostic[],
): boolean {
  const kinds = new Set(
    diagnostics
      .filter((d) => d.ok && d.observedAtIso.trim() && d.probeId.trim())
      .map((d) => d.kind),
  );
  return REQUIRED_DIAGNOSTIC_KINDS.every((k) => kinds.has(k));
}

function decorativeOnlineBadgeOnly(
  diagnostics: readonly TimestampedDiagnostic[],
): boolean {
  if (diagnostics.length === 0) return false;
  return diagnostics.every((d) => d.kind === DiagnosticProbeKind.ONLINE_BADGE);
}

function everyBlockerHasNextAction(
  blockers: readonly BlockerNextAction[],
): boolean {
  return blockers.every(
    (b) =>
      b.blockerId.trim() &&
      b.blocker.trim() &&
      b.nextAction.trim(),
  );
}

/**
 * Evaluate the T-F01 create-trusted-local-workspace path offline.
 * Complete F01 evidence package → CREATE_TRUSTED_LOCAL_WORKSPACE_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and public writes refused.
 */
export function evaluateCreateTrustedLocalWorkspace(
  input: CreateTrustedLocalWorkspaceInput,
): CreateTrustedLocalWorkspaceDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const kindsOk = requiredKindsCovered(input.diagnostics);
  const badgeOnly = decorativeOnlineBadgeOnly(input.diagnostics);
  const blockersOk = everyBlockerHasNextAction(input.blockers);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_OWNER_SESSION"
      | "AWAITING_WORKSPACE_REVISION"
      | "AWAITING_TIMESTAMPED_DIAGNOSTICS"
      | "AWAITING_INITIAL_AUTHORITY"
      | "AWAITING_STARTUP_RESULT"
      | "AWAITING_RECOVERY_TEST"
      | "AWAITING_BLOCKER_NEXT_ACTIONS",
    recoveryPath:
      | "PROVIDE_OWNER_SESSION"
      | "SET_WORKSPACE_CONFIG_REVISION"
      | "RECORD_TIMESTAMPED_DIAGNOSTICS"
      | "CHOOSE_OBSERVE_AUTHORITY"
      | "COMPLETE_STARTUP_AND_RECOVERY"
      | "ATTACH_NEXT_ACTION_PER_BLOCKER"
      | "KEEP_OBSERVE_NO_PUBLIC_WRITES",
  ): NonNullable<
    Extract<CreateTrustedLocalWorkspaceDecision, { allowed: false }>["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    ownerId: input.ownerSession.ownerId.trim() || null,
    role: input.ownerSession.role.trim() || null,
    sessionId: input.ownerSession.sessionId.trim() || null,
    workspaceConfigRevision: input.workspaceConfigRevision.trim() || null,
    businessName: input.businessName.trim() || null,
    timezone: input.timezone.trim() || null,
    notificationRecipientCount: input.notificationRecipients.filter((r) =>
      r.trim(),
    ).length,
    diagnosticCount: input.diagnostics.length,
    requiredDiagnosticKindsCovered: kindsOk,
    decorativeOnlineBadgeOnly: badgeOnly,
    authorityDecisionId: input.initialAuthority.decisionId.trim() || null,
    operatingMode: input.initialAuthority.operatingMode || null,
    observeDeniesPublish: input.initialAuthority.observeDeniesPublish,
    startupStatus: input.startupResult.status || null,
    recoveryTestStatus: input.recoveryTest.status || null,
    blockerCount: input.blockers.length,
    everyBlockerHasNextAction: blockersOk,
    publicWritesOccurred: input.publicWritesOccurred,
    workspaceVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live create-trusted-local-workspace provider wiring remains NOT_WIRED — refuse live wiring (T-F01)",
      ],
    };
  }

  if (input.claimLiveVerifiedWorkspace) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_WORKSPACE_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified trusted-workspace claim offline (T-F01) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptPublicWrite || input.publicWritesOccurred) {
    return {
      allowed: false,
      code: "PUBLIC_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PUBLIC_WRITE_DURING_F01_REFUSED",
        "BLOCKED",
        "KEEP_OBSERVE_NO_PUBLIC_WRITES",
      ),
      reasons: [
        "Trusted local workspace creation must not perform public writes (T-F01)",
      ],
    };
  }

  const session = input.ownerSession;
  if (
    !input.packageId.trim() ||
    !session.ownerId.trim() ||
    !session.role.trim() ||
    !session.sessionId.trim() ||
    !input.businessName.trim() ||
    !input.timezone.trim() ||
    input.notificationRecipients.filter((r) => r.trim()).length === 0
  ) {
    return {
      allowed: false,
      code: "OWNER_SESSION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OWNER_SESSION_INCOMPLETE",
        "AWAITING_OWNER_SESSION",
        "PROVIDE_OWNER_SESSION",
      ),
      reasons: [
        "F01 requires owner id, role, session, business name, timezone, and notification recipients (T-F01)",
      ],
    };
  }

  if (!input.workspaceConfigRevision.trim()) {
    return {
      allowed: false,
      code: "WORKSPACE_CONFIG_REVISION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "WORKSPACE_REVISION_MISSING",
        "AWAITING_WORKSPACE_REVISION",
        "SET_WORKSPACE_CONFIG_REVISION",
      ),
      reasons: [
        "Workspace configuration revision is required evidence (T-F01)",
      ],
    };
  }

  if (badgeOnly) {
    return {
      allowed: false,
      code: "DECORATIVE_ONLINE_BADGE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "DECORATIVE_ONLINE_BADGE_NOT_EVIDENCE",
        "AWAITING_TIMESTAMPED_DIAGNOSTICS",
        "RECORD_TIMESTAMPED_DIAGNOSTICS",
      ),
      reasons: [
        "Decorative online badges are not timestamped diagnostic evidence (T-F01)",
      ],
    };
  }

  if (
    input.diagnostics.length === 0 ||
    !kindsOk ||
    input.diagnostics.some(
      (d) =>
        !d.probeId.trim() ||
        !d.label.trim() ||
        !d.observedAtIso.trim() ||
        d.kind === DiagnosticProbeKind.ONLINE_BADGE,
    )
  ) {
    return {
      allowed: false,
      code: "TIMESTAMPED_DIAGNOSTICS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "TIMESTAMPED_DIAGNOSTICS_INCOMPLETE",
        "AWAITING_TIMESTAMPED_DIAGNOSTICS",
        "RECORD_TIMESTAMPED_DIAGNOSTICS",
      ),
      reasons: [
        "F01 requires timestamped diagnostics covering service identity, lease, storage, and clock (T-F01)",
      ],
    };
  }

  const auth = input.initialAuthority;
  if (
    !auth.decisionId.trim() ||
    !auth.decidedAtIso.trim() ||
    !auth.observeDeniesPublish
  ) {
    return {
      allowed: false,
      code: "INITIAL_AUTHORITY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INITIAL_AUTHORITY_INCOMPLETE",
        "AWAITING_INITIAL_AUTHORITY",
        "CHOOSE_OBSERVE_AUTHORITY",
      ),
      reasons: [
        "Initial authority decision with Observe denying publish is required (T-F01)",
      ],
    };
  }

  if (auth.operatingMode !== InitialOperatingMode.OBSERVE) {
    return {
      allowed: false,
      code: "OBSERVE_MODE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INITIAL_MODE_NOT_OBSERVE",
        "AWAITING_INITIAL_AUTHORITY",
        "CHOOSE_OBSERVE_AUTHORITY",
      ),
      reasons: [
        "Initial operating mode must be Observe for trusted workspace creation (T-F01)",
      ],
    };
  }

  const startup = input.startupResult;
  if (
    !startup.startupId.trim() ||
    !startup.completedAtIso.trim() ||
    startup.status !== "PASSED" ||
    !startup.hostRequirementsReviewed ||
    !startup.unattendedStartupEnabled
  ) {
    return {
      allowed: false,
      code: "STARTUP_RESULT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "STARTUP_RESULT_INCOMPLETE",
        "AWAITING_STARTUP_RESULT",
        "COMPLETE_STARTUP_AND_RECOVERY",
      ),
      reasons: [
        "Startup result must pass after reviewing host requirements and enabling unattended startup (T-F01)",
      ],
    };
  }

  const recovery = input.recoveryTest;
  if (
    !recovery.recoveryTestId.trim() ||
    !recovery.completedAtIso.trim() ||
    recovery.status !== "PASSED"
  ) {
    return {
      allowed: false,
      code: "RECOVERY_TEST_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "RECOVERY_TEST_INCOMPLETE",
        "AWAITING_RECOVERY_TEST",
        "COMPLETE_STARTUP_AND_RECOVERY",
      ),
      reasons: [
        "Recovery test must pass as part of the F01 evidence package (T-F01)",
      ],
    };
  }

  if (!blockersOk) {
    return {
      allowed: false,
      code: "BLOCKER_NEXT_ACTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BLOCKER_MISSING_NEXT_ACTION",
        "AWAITING_BLOCKER_NEXT_ACTIONS",
        "ATTACH_NEXT_ACTION_PER_BLOCKER",
      ),
      reasons: [
        "Every recorded blocker must include an explicit next action (T-F01)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CREATE_TRUSTED_LOCAL_WORKSPACE_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      ownerId: session.ownerId.trim(),
      role: session.role.trim(),
      sessionId: session.sessionId.trim(),
      workspaceConfigRevision: input.workspaceConfigRevision.trim(),
      businessName: input.businessName.trim(),
      timezone: input.timezone.trim(),
      notificationRecipientCount: input.notificationRecipients.filter((r) =>
        r.trim(),
      ).length,
      diagnosticCount: input.diagnostics.length,
      requiredDiagnosticKindsCovered: true,
      decorativeOnlineBadgeOnly: false,
      authorityDecisionId: auth.decisionId.trim(),
      operatingMode: "Observe",
      observeDeniesPublish: true,
      startupStatus: "PASSED",
      recoveryTestStatus: "PASSED",
      blockerCount: input.blockers.length,
      everyBlockerHasNextAction: true,
      publicWritesOccurred: false,
      workspaceVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F01_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "TRUSTED_LOCAL_WORKSPACE_RECORDED",
      recoveryPath: "KEEP_OBSERVE_NO_PUBLIC_WRITES",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F01 evidence package recorded (owner session, workspace revision, timestamped diagnostics, Observe authority, startup + recovery); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
