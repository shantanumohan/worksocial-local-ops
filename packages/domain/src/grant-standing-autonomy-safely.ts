/**
 * T-F12 — Grant standing autonomy safely (complete F12 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F12 evidence
 * package — workstream/scope snapshot, autonomy mode selection, versioned
 * authority draft, policy constraints (limits/expiry/notifications/exclusions
 * with inference vs ad-spend separated), policy test matrix (allowed +
 * blocked previews), owner-signed grant + audit event, and pause / stop-writes
 * / pause-replies control-test receipts. Incomplete packages, agent
 * self-approve, ad-spend side effects, and false live-verified claims are
 * refused. Live provider wiring stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-023 (`STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS`) — this
 * records the complete F12 flow evidence package (structured scope + mode +
 * draft + constraints + matrix + signed grant + control receipts), not the
 * control-receipts readiness summary alone. Distinct from T-US-024 (agent
 * cannot widen grant) and T-US-060 (emergency stop at commit).
 */

import {
  AutonomyMode,
  ControlTestKind,
  PolicyTestExpectation,
  type AutonomyModeValue,
  type ControlTestKindValue,
  type PolicyTestExpectationValue,
  type StandingAutonomyControlTest,
  type StandingAutonomyPolicyConstraints,
  type StandingAutonomyPolicyTestCase,
  type StandingAutonomyScopeSnapshot,
} from "./standing-autonomy-grant.js";

export type GrantStandingAutonomySafelyInput = {
  packageId: string;
  scope: StandingAutonomyScopeSnapshot | null;
  autonomyMode: AutonomyModeValue | null;
  authorityDraftId: string | null;
  authorityDraftVersion: number | null;
  constraints: StandingAutonomyPolicyConstraints | null;
  policyTestMatrix: readonly StandingAutonomyPolicyTestCase[] | null;
  ownerIdentity: string | null;
  ownerSigned: boolean;
  signedGrantId: string | null;
  auditEventId: string | null;
  controlTests: readonly StandingAutonomyControlTest[] | null;
  /** Agent attempting to self-approve — must refuse. */
  agentSelfApprove: boolean;
  /** Ad budget increase as side effect — must refuse. */
  requestAdSpendIncreaseAsSideEffect: boolean;
  /** Claim the F12 path is live-verified — must refuse offline. */
  claimLiveVerifiedGrant: boolean;
  /** Request live provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type GrantStandingAutonomySafelyDecision =
  | {
      allowed: true;
      code: "GRANT_STANDING_AUTONOMY_SAFELY_EVIDENCE_RECORDED";
      routineEligibleActionsMayProceed: true;
      materialExceptionsExplicit: true;
      spendingExplicit: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        scopeSnapshotId: string;
        workstreamId: string;
        siteCount: number;
        channelCount: number;
        actionClassCount: number;
        delegatedAgentCount: number;
        autonomyMode: AutonomyModeValue;
        authorityDraftId: string;
        authorityDraftVersion: number;
        inferenceBudgetMinor: number;
        adSpendBudgetMinor: number;
        expiresAtIso: string;
        notificationRulesPresent: true;
        excludedActionCount: number;
        policyTestMatrixSize: number;
        allowedPreviewCount: number;
        blockedPreviewCount: number;
        ownerIdentity: string;
        signedGrantId: string;
        auditEventId: string;
        controlTestReceipts: {
          kind: ControlTestKindValue;
          receiptId: string;
        }[];
        grantVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F12_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "STANDING_AUTONOMY_GRANT_RECORDED";
        recoveryPath: "KEEP_FIXTURE_GRANT_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "SCOPE_SNAPSHOT_REQUIRED"
        | "AUTONOMY_MODE_REQUIRED"
        | "AUTHORITY_DRAFT_REQUIRED"
        | "POLICY_CONSTRAINTS_REQUIRED"
        | "POLICY_TEST_MATRIX_REQUIRED"
        | "OWNER_SIGNATURE_REQUIRED"
        | "CONTROL_TESTS_REQUIRED"
        | "AGENT_SELF_APPROVE_REFUSED"
        | "AD_SPEND_SIDE_EFFECT_REFUSED"
        | "FALSE_LIVE_VERIFIED_GRANT_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        scopeSnapshotId: string | null;
        workstreamId: string | null;
        siteCount: number;
        channelCount: number;
        actionClassCount: number;
        delegatedAgentCount: number;
        autonomyMode: AutonomyModeValue | null;
        authorityDraftId: string | null;
        authorityDraftVersion: number | null;
        inferenceBudgetMinor: number | null;
        adSpendBudgetMinor: number | null;
        expiresAtIso: string | null;
        notificationRulesPresent: boolean;
        excludedActionCount: number;
        policyTestMatrixSize: number;
        allowedPreviewCount: number;
        blockedPreviewCount: number;
        ownerIdentity: string | null;
        signedGrantId: string | null;
        auditEventId: string | null;
        controlTestReceipts: {
          kind: ControlTestKindValue;
          receiptId: string;
        }[];
        grantVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_SCOPE_SNAPSHOT"
          | "AWAITING_AUTONOMY_MODE"
          | "AWAITING_AUTHORITY_DRAFT"
          | "AWAITING_POLICY_CONSTRAINTS"
          | "AWAITING_POLICY_TEST_MATRIX"
          | "AWAITING_OWNER_SIGNATURE"
          | "AWAITING_CONTROL_TESTS";
        recoveryPath:
          | "CHOOSE_WORKSTREAM_AND_SCOPE"
          | "SELECT_AUTONOMY_MODE"
          | "CREATE_VERSIONED_AUTHORITY_DRAFT"
          | "SET_LIMITS_EXPIRY_NOTIFICATIONS_EXCLUSIONS"
          | "PREVIEW_ALLOWED_AND_BLOCKED_EXAMPLES"
          | "APPROVE_WITH_OWNER_IDENTITY"
          | "RUN_PAUSE_STOP_WRITES_PAUSE_REPLIES"
          | "KEEP_FIXTURE_GRANT_NO_LIVE_PROVIDER";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const GRANT_STANDING_AUTONOMY_SAFELY_RELATED_CASE_IDS = [
  "T-F12",
] as const;

const VALID_AUTONOMY_MODES = new Set<string>(Object.values(AutonomyMode));

const REQUIRED_CONTROL_TESTS: readonly ControlTestKindValue[] = [
  ControlTestKind.PAUSE_NEW_WORK,
  ControlTestKind.STOP_WRITES,
  ControlTestKind.PAUSE_REPLIES,
];

function preservedInputCount(input: GrantStandingAutonomySafelyInput): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.scope?.scopeSnapshotId.trim() ? 1 : 0) +
    (input.autonomyMode ? 1 : 0) +
    (input.authorityDraftId?.trim() ? 1 : 0) +
    (input.constraints ? 1 : 0) +
    (input.policyTestMatrix && input.policyTestMatrix.length > 0 ? 1 : 0) +
    (input.ownerIdentity?.trim() ? 1 : 0) +
    (input.signedGrantId?.trim() ? 1 : 0) +
    (input.controlTests && input.controlTests.length > 0 ? 1 : 0)
  );
}

function scopeOk(
  scope: StandingAutonomyScopeSnapshot | null,
): scope is StandingAutonomyScopeSnapshot {
  if (!scope) return false;
  return (
    scope.scopeSnapshotId.trim().length > 0 &&
    scope.workstreamId.trim().length > 0 &&
    scope.siteIds.length > 0 &&
    scope.channelIds.length > 0 &&
    scope.actionClasses.length > 0 &&
    scope.delegatedAgentIds.length > 0
  );
}

function constraintsOk(
  c: StandingAutonomyPolicyConstraints | null,
): c is StandingAutonomyPolicyConstraints {
  if (!c) return false;
  return (
    Number.isFinite(c.inferenceBudgetMinor) &&
    c.inferenceBudgetMinor >= 0 &&
    Number.isFinite(c.adSpendBudgetMinor) &&
    c.adSpendBudgetMinor >= 0 &&
    c.expiresAtIso.trim().length > 0 &&
    c.notificationRulesPresent === true &&
    Array.isArray(c.excludedActions)
  );
}

function policyMatrixOk(
  matrix: readonly StandingAutonomyPolicyTestCase[] | null,
): matrix is readonly StandingAutonomyPolicyTestCase[] {
  if (!matrix || matrix.length < 2) return false;
  const hasAllowed = matrix.some(
    (t) => t.expectation === PolicyTestExpectation.ALLOWED,
  );
  const hasBlocked = matrix.some(
    (t) => t.expectation === PolicyTestExpectation.BLOCKED,
  );
  if (!hasAllowed || !hasBlocked) return false;
  return matrix.every((t) => t.actionId.trim() && t.actionClass.trim());
}

function controlTestsOk(
  tests: readonly StandingAutonomyControlTest[] | null,
): {
  ok: boolean;
  receipts: { kind: ControlTestKindValue; receiptId: string }[];
} {
  if (!tests) return { ok: false, receipts: [] };
  const byKind = new Map<ControlTestKindValue, StandingAutonomyControlTest>();
  for (const test of tests) {
    if (!test.receiptId.trim()) return { ok: false, receipts: [] };
    byKind.set(test.kind, test);
  }
  for (const required of REQUIRED_CONTROL_TESTS) {
    if (!byKind.has(required)) return { ok: false, receipts: [] };
  }
  return {
    ok: true,
    receipts: REQUIRED_CONTROL_TESTS.map((kind) => {
      const t = byKind.get(kind)!;
      return { kind, receiptId: t.receiptId };
    }),
  };
}

/**
 * Evaluate the T-F12 grant-standing-autonomy-safely path offline.
 * Complete F12 evidence package → GRANT_STANDING_AUTONOMY_SAFELY_EVIDENCE_RECORDED;
 * live providers stay NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateGrantStandingAutonomySafely(
  input: GrantStandingAutonomySafelyInput,
): GrantStandingAutonomySafelyDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const scope = input.scope;
  const constraints = input.constraints;
  const matrix = input.policyTestMatrix;
  const control = controlTestsOk(input.controlTests);

  const allowedPreviewCount =
    matrix?.filter((t) => t.expectation === PolicyTestExpectation.ALLOWED)
      .length ?? 0;
  const blockedPreviewCount =
    matrix?.filter((t) => t.expectation === PolicyTestExpectation.BLOCKED)
      .length ?? 0;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_SCOPE_SNAPSHOT"
      | "AWAITING_AUTONOMY_MODE"
      | "AWAITING_AUTHORITY_DRAFT"
      | "AWAITING_POLICY_CONSTRAINTS"
      | "AWAITING_POLICY_TEST_MATRIX"
      | "AWAITING_OWNER_SIGNATURE"
      | "AWAITING_CONTROL_TESTS",
    recoveryPath:
      | "CHOOSE_WORKSTREAM_AND_SCOPE"
      | "SELECT_AUTONOMY_MODE"
      | "CREATE_VERSIONED_AUTHORITY_DRAFT"
      | "SET_LIMITS_EXPIRY_NOTIFICATIONS_EXCLUSIONS"
      | "PREVIEW_ALLOWED_AND_BLOCKED_EXAMPLES"
      | "APPROVE_WITH_OWNER_IDENTITY"
      | "RUN_PAUSE_STOP_WRITES_PAUSE_REPLIES"
      | "KEEP_FIXTURE_GRANT_NO_LIVE_PROVIDER",
  ): NonNullable<
    Extract<
      GrantStandingAutonomySafelyDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    scopeSnapshotId: scope?.scopeSnapshotId.trim() || null,
    workstreamId: scope?.workstreamId.trim() || null,
    siteCount: scope?.siteIds.length ?? 0,
    channelCount: scope?.channelIds.length ?? 0,
    actionClassCount: scope?.actionClasses.length ?? 0,
    delegatedAgentCount: scope?.delegatedAgentIds.length ?? 0,
    autonomyMode: input.autonomyMode,
    authorityDraftId: input.authorityDraftId?.trim() || null,
    authorityDraftVersion: input.authorityDraftVersion,
    inferenceBudgetMinor: constraints?.inferenceBudgetMinor ?? null,
    adSpendBudgetMinor: constraints?.adSpendBudgetMinor ?? null,
    expiresAtIso: constraints?.expiresAtIso.trim() || null,
    notificationRulesPresent: constraints?.notificationRulesPresent === true,
    excludedActionCount: constraints?.excludedActions.length ?? 0,
    policyTestMatrixSize: matrix?.length ?? 0,
    allowedPreviewCount,
    blockedPreviewCount,
    ownerIdentity: input.ownerIdentity?.trim() || null,
    signedGrantId: input.signedGrantId?.trim() || null,
    auditEventId: input.auditEventId?.trim() || null,
    controlTestReceipts: control.receipts,
    grantVerifiedLive: false,
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
        "Live standing-autonomy grant apply remains NOT_WIRED — refuse live wiring (T-F12)",
      ],
    };
  }

  if (input.claimLiveVerifiedGrant) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_GRANT_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified standing autonomy grant claim offline (T-F12) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.agentSelfApprove) {
    return {
      allowed: false,
      code: "AGENT_SELF_APPROVE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "AGENT_SELF_APPROVE_REFUSED",
        "BLOCKED",
        "APPROVE_WITH_OWNER_IDENTITY",
      ),
      reasons: [
        "Agent self-approval of standing autonomy is refused — owner identity required (T-F12)",
      ],
    };
  }

  if (input.requestAdSpendIncreaseAsSideEffect) {
    return {
      allowed: false,
      code: "AD_SPEND_SIDE_EFFECT_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "AD_SPEND_SIDE_EFFECT_REFUSED",
        "BLOCKED",
        "KEEP_FIXTURE_GRANT_NO_LIVE_PROVIDER",
      ),
      reasons: [
        "Advertising spend increase requires exact owner review — never a side effect of an F12 autonomy grant (T-F12)",
      ],
    };
  }

  if (!input.packageId.trim() || !scopeOk(scope)) {
    return {
      allowed: false,
      code: "SCOPE_SNAPSHOT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SCOPE_SNAPSHOT_INCOMPLETE",
        "AWAITING_SCOPE_SNAPSHOT",
        "CHOOSE_WORKSTREAM_AND_SCOPE",
      ),
      reasons: [
        "F12 requires package id and complete scope snapshot (workstream, sites, channels, action classes, delegated agents) (T-F12)",
      ],
    };
  }

  if (!input.autonomyMode || !VALID_AUTONOMY_MODES.has(input.autonomyMode)) {
    return {
      allowed: false,
      code: "AUTONOMY_MODE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "AUTONOMY_MODE_INCOMPLETE",
        "AWAITING_AUTONOMY_MODE",
        "SELECT_AUTONOMY_MODE",
      ),
      reasons: [
        "F12 requires Observe, Draft, Review required, or Bounded automatic autonomy mode (T-F12)",
      ],
    };
  }

  if (
    !input.authorityDraftId?.trim() ||
    input.authorityDraftVersion === null ||
    !Number.isInteger(input.authorityDraftVersion) ||
    input.authorityDraftVersion < 1
  ) {
    return {
      allowed: false,
      code: "AUTHORITY_DRAFT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "AUTHORITY_DRAFT_INCOMPLETE",
        "AWAITING_AUTHORITY_DRAFT",
        "CREATE_VERSIONED_AUTHORITY_DRAFT",
      ),
      reasons: [
        "F12 requires versioned authority draft id and version >= 1 (T-F12)",
      ],
    };
  }

  if (!constraintsOk(constraints)) {
    return {
      allowed: false,
      code: "POLICY_CONSTRAINTS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "POLICY_CONSTRAINTS_INCOMPLETE",
        "AWAITING_POLICY_CONSTRAINTS",
        "SET_LIMITS_EXPIRY_NOTIFICATIONS_EXCLUSIONS",
      ),
      reasons: [
        "F12 requires policy constraints: inference vs ad-spend budgets, expiry, notification rules, excluded actions (T-F12)",
      ],
    };
  }

  if (!policyMatrixOk(matrix)) {
    return {
      allowed: false,
      code: "POLICY_TEST_MATRIX_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "POLICY_TEST_MATRIX_INCOMPLETE",
        "AWAITING_POLICY_TEST_MATRIX",
        "PREVIEW_ALLOWED_AND_BLOCKED_EXAMPLES",
      ),
      reasons: [
        "F12 requires policy test matrix with at least one ALLOWED and one BLOCKED preview (T-F12)",
      ],
    };
  }

  if (
    !input.ownerIdentity?.trim() ||
    !input.ownerSigned ||
    !input.signedGrantId?.trim() ||
    !input.auditEventId?.trim()
  ) {
    return {
      allowed: false,
      code: "OWNER_SIGNATURE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OWNER_SIGNATURE_INCOMPLETE",
        "AWAITING_OWNER_SIGNATURE",
        "APPROVE_WITH_OWNER_IDENTITY",
      ),
      reasons: [
        "F12 requires owner identity, signed grant id, and audit event (T-F12)",
      ],
    };
  }

  if (!control.ok) {
    return {
      allowed: false,
      code: "CONTROL_TESTS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CONTROL_TESTS_INCOMPLETE",
        "AWAITING_CONTROL_TESTS",
        "RUN_PAUSE_STOP_WRITES_PAUSE_REPLIES",
      ),
      reasons: [
        "F12 requires pause / stop-writes / pause-replies control tests with receipts (T-F12)",
      ],
    };
  }

  return {
    allowed: true,
    code: "GRANT_STANDING_AUTONOMY_SAFELY_EVIDENCE_RECORDED",
    routineEligibleActionsMayProceed: true,
    materialExceptionsExplicit: true,
    spendingExplicit: true,
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      scopeSnapshotId: scope.scopeSnapshotId.trim(),
      workstreamId: scope.workstreamId.trim(),
      siteCount: scope.siteIds.length,
      channelCount: scope.channelIds.length,
      actionClassCount: scope.actionClasses.length,
      delegatedAgentCount: scope.delegatedAgentIds.length,
      autonomyMode: input.autonomyMode,
      authorityDraftId: input.authorityDraftId.trim(),
      authorityDraftVersion: input.authorityDraftVersion,
      inferenceBudgetMinor: constraints.inferenceBudgetMinor,
      adSpendBudgetMinor: constraints.adSpendBudgetMinor,
      expiresAtIso: constraints.expiresAtIso.trim(),
      notificationRulesPresent: true,
      excludedActionCount: constraints.excludedActions.length,
      policyTestMatrixSize: matrix.length,
      allowedPreviewCount,
      blockedPreviewCount,
      ownerIdentity: input.ownerIdentity.trim(),
      signedGrantId: input.signedGrantId.trim(),
      auditEventId: input.auditEventId.trim(),
      controlTestReceipts: control.receipts,
      grantVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F12_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "STANDING_AUTONOMY_GRANT_RECORDED",
      recoveryPath: "KEEP_FIXTURE_GRANT_NO_LIVE_PROVIDER",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F12 evidence package recorded (scope snapshot, autonomy mode, versioned authority draft, policy constraints, policy test matrix, owner-signed grant + audit, pause/stop-writes/pause-replies control receipts); routine eligible actions may proceed; material exceptions and spending remain explicit; live providers NOT_WIRED; externalEffects NONE",
    ],
  };
}

export {
  AutonomyMode,
  ControlTestKind,
  PolicyTestExpectation,
  type AutonomyModeValue,
  type ControlTestKindValue,
  type PolicyTestExpectationValue,
};
