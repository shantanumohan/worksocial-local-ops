/**
 * T-US-023 — Grant standing autonomy (F12/SC-19) — control tests with receipts.
 *
 * Offline fixture gate: owner chooses workstream/scope, selects an autonomy
 * mode, sets limits/expiry/exclusions, previews a policy test matrix, signs
 * the grant, then runs pause / stop-writes / pause-replies control tests that
 * each produce a receipt. Routine eligible actions may proceed; material
 * exceptions and advertising spend remain explicit. Live provider adapters
 * stay NOT_WIRED. Distinct from T-US-024 (agent cannot widen grant) and
 * T-US-060 (emergency stop at commit). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export const AutonomyMode = {
  OBSERVE: "OBSERVE",
  DRAFT: "DRAFT",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  BOUNDED_AUTOMATIC: "BOUNDED_AUTOMATIC",
} as const;

export type AutonomyModeValue =
  (typeof AutonomyMode)[keyof typeof AutonomyMode];

export const PolicyTestExpectation = {
  ALLOWED: "ALLOWED",
  BLOCKED: "BLOCKED",
} as const;

export type PolicyTestExpectationValue =
  (typeof PolicyTestExpectation)[keyof typeof PolicyTestExpectation];

export const ControlTestKind = {
  PAUSE_NEW_WORK: "PAUSE_NEW_WORK",
  STOP_WRITES: "STOP_WRITES",
  PAUSE_REPLIES: "PAUSE_REPLIES",
} as const;

export type ControlTestKindValue =
  (typeof ControlTestKind)[keyof typeof ControlTestKind];

export type StandingAutonomyScopeSnapshot = {
  scopeSnapshotId: string;
  workstreamId: string;
  siteIds: readonly string[];
  channelIds: readonly string[];
  actionClasses: readonly string[];
  delegatedAgentIds: readonly string[];
};

export type StandingAutonomyPolicyConstraints = {
  inferenceBudgetMinor: number;
  /** Advertising spend is tracked separately and never inferred from SEO. */
  adSpendBudgetMinor: number;
  expiresAtIso: string;
  notificationRulesPresent: boolean;
  excludedActions: readonly string[];
};

export type StandingAutonomyPolicyTestCase = {
  actionId: string;
  actionClass: string;
  expectation: PolicyTestExpectationValue;
};

export type StandingAutonomyControlTest = {
  kind: ControlTestKindValue;
  /** Fixture receipt id produced by the control test. */
  receiptId: string;
};

export type StandingAutonomyGrantInput = {
  scope: StandingAutonomyScopeSnapshot;
  autonomyMode: AutonomyModeValue;
  /** Versioned authority draft id (non-empty). */
  authorityDraftId: string;
  authorityDraftVersion: number;
  constraints: StandingAutonomyPolicyConstraints;
  policyTestMatrix: readonly StandingAutonomyPolicyTestCase[];
  /** Owner identity required to approve; never agent self-approve. */
  ownerIdentity: string;
  ownerSigned: boolean;
  signedGrantId: string | null;
  auditEventId: string | null;
  controlTests: readonly StandingAutonomyControlTest[];
  /** Agent attempting to self-approve — must refuse. */
  agentSelfApprove: boolean;
  /** Ad budget increase as side effect — must refuse (exact review required). */
  requestAdSpendIncreaseAsSideEffect: boolean;
  /** Request live provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type StandingAutonomyGrantDecision =
  | {
      allowed: true;
      code: "STANDING_AUTONOMY_GRANT_READY";
      routineEligibleActionsMayProceed: true;
      materialExceptionsExplicit: true;
      spendingExplicit: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        scopeSnapshotId: string;
        authorityDraftId: string;
        authorityDraftVersion: number;
        autonomyMode: AutonomyModeValue;
        policyConstraints: StandingAutonomyPolicyConstraints;
        policyTestMatrix: StandingAutonomyPolicyTestCase[];
        signedGrantId: string;
        auditEventId: string;
        controlTestReceipts: {
          kind: ControlTestKindValue;
          receiptId: string;
        }[];
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "SCOPE_SNAPSHOT_INCOMPLETE"
        | "AUTHORITY_DRAFT_INVALID"
        | "POLICY_CONSTRAINTS_INCOMPLETE"
        | "POLICY_TEST_MATRIX_INCOMPLETE"
        | "OWNER_SIGNATURE_REQUIRED"
        | "AGENT_SELF_APPROVE_REFUSED"
        | "AD_SPEND_SIDE_EFFECT_REFUSED"
        | "CONTROL_TESTS_INCOMPLETE"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      routineEligibleActionsMayProceed: false;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

export const STANDING_AUTONOMY_GRANT_RELATED_CASE_IDS = ["T-US-023"] as const;

const REQUIRED_CONTROL_TESTS: readonly ControlTestKindValue[] = [
  ControlTestKind.PAUSE_NEW_WORK,
  ControlTestKind.STOP_WRITES,
  ControlTestKind.PAUSE_REPLIES,
];

/**
 * Evaluate the F12 standing-autonomy grant path offline.
 * Produces control-test receipts; live stays NOT_WIRED; spend stays explicit.
 */
export function evaluateStandingAutonomyGrant(
  input: StandingAutonomyGrantInput,
): StandingAutonomyGrantDecision {
  const base = {
    routineEligibleActionsMayProceed: false as const,
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      reasons: [
        "Live standing-autonomy grant apply remains NOT_WIRED — refuse live wiring (T-US-023)",
      ],
    };
  }

  if (input.agentSelfApprove) {
    return {
      allowed: false,
      code: "AGENT_SELF_APPROVE_REFUSED",
      ...base,
      reasons: [
        "Agent self-approval of standing autonomy is refused — owner identity required (T-US-023); distinct from T-US-024 widen-grant",
      ],
    };
  }

  if (input.requestAdSpendIncreaseAsSideEffect) {
    return {
      allowed: false,
      code: "AD_SPEND_SIDE_EFFECT_REFUSED",
      ...base,
      reasons: [
        "Advertising spend increase requires exact owner review — never a side effect of an SEO/autonomy grant (T-US-023)",
      ],
    };
  }

  const scope = input.scope;
  if (
    !scope.scopeSnapshotId.trim() ||
    !scope.workstreamId.trim() ||
    scope.siteIds.length === 0 ||
    scope.channelIds.length === 0 ||
    scope.actionClasses.length === 0 ||
    scope.delegatedAgentIds.length === 0
  ) {
    return {
      allowed: false,
      code: "SCOPE_SNAPSHOT_INCOMPLETE",
      ...base,
      reasons: [
        "Scope snapshot requires workstream, sites, channels, action classes, and delegated agents (T-US-023)",
      ],
    };
  }

  if (
    !input.authorityDraftId.trim() ||
    !Number.isInteger(input.authorityDraftVersion) ||
    input.authorityDraftVersion < 1
  ) {
    return {
      allowed: false,
      code: "AUTHORITY_DRAFT_INVALID",
      ...base,
      reasons: [
        "Versioned authority draft id and version >= 1 are required (T-US-023)",
      ],
    };
  }

  const c = input.constraints;
  if (
    !Number.isFinite(c.inferenceBudgetMinor) ||
    c.inferenceBudgetMinor < 0 ||
    !Number.isFinite(c.adSpendBudgetMinor) ||
    c.adSpendBudgetMinor < 0 ||
    !c.expiresAtIso.trim() ||
    !c.notificationRulesPresent ||
    !Array.isArray(c.excludedActions)
  ) {
    return {
      allowed: false,
      code: "POLICY_CONSTRAINTS_INCOMPLETE",
      ...base,
      reasons: [
        "Policy constraints require inference vs ad-spend budgets, expiry, notification rules, and excluded-actions list (T-US-023)",
      ],
    };
  }

  if (!input.policyTestMatrix || input.policyTestMatrix.length < 2) {
    return {
      allowed: false,
      code: "POLICY_TEST_MATRIX_INCOMPLETE",
      ...base,
      reasons: [
        "Policy test matrix must include allowed and blocked preview examples (T-US-023)",
      ],
    };
  }
  const hasAllowed = input.policyTestMatrix.some(
    (t) => t.expectation === PolicyTestExpectation.ALLOWED,
  );
  const hasBlocked = input.policyTestMatrix.some(
    (t) => t.expectation === PolicyTestExpectation.BLOCKED,
  );
  if (!hasAllowed || !hasBlocked) {
    return {
      allowed: false,
      code: "POLICY_TEST_MATRIX_INCOMPLETE",
      ...base,
      reasons: [
        "Policy test matrix must preview at least one ALLOWED and one BLOCKED example (T-US-023)",
      ],
    };
  }
  for (const t of input.policyTestMatrix) {
    if (!t.actionId.trim() || !t.actionClass.trim()) {
      return {
        allowed: false,
        code: "POLICY_TEST_MATRIX_INCOMPLETE",
        ...base,
        reasons: [
          "Each policy test case requires actionId and actionClass (T-US-023)",
        ],
      };
    }
  }

  if (
    !input.ownerIdentity.trim() ||
    !input.ownerSigned ||
    !input.signedGrantId?.trim() ||
    !input.auditEventId?.trim()
  ) {
    return {
      allowed: false,
      code: "OWNER_SIGNATURE_REQUIRED",
      ...base,
      reasons: [
        "Owner identity, signed grant id, and audit event are required to activate standing autonomy (T-US-023)",
      ],
    };
  }

  const byKind = new Map<ControlTestKindValue, StandingAutonomyControlTest>();
  for (const test of input.controlTests ?? []) {
    if (!test.receiptId.trim()) {
      return {
        allowed: false,
        code: "CONTROL_TESTS_INCOMPLETE",
        ...base,
        reasons: [
          `Control test ${test.kind} missing receipt id (T-US-023)`,
        ],
      };
    }
    byKind.set(test.kind, test);
  }
  for (const required of REQUIRED_CONTROL_TESTS) {
    if (!byKind.has(required)) {
      return {
        allowed: false,
        code: "CONTROL_TESTS_INCOMPLETE",
        ...base,
        reasons: [
          `Missing control test ${required} with receipt (pause / stop-writes / pause-replies) (T-US-023)`,
        ],
      };
    }
  }

  const controlTestReceipts = REQUIRED_CONTROL_TESTS.map((kind) => {
    const t = byKind.get(kind)!;
    return { kind, receiptId: t.receiptId };
  });

  return {
    allowed: true,
    code: "STANDING_AUTONOMY_GRANT_READY",
    routineEligibleActionsMayProceed: true,
    materialExceptionsExplicit: true,
    spendingExplicit: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    evidence: {
      scopeSnapshotId: scope.scopeSnapshotId,
      authorityDraftId: input.authorityDraftId,
      authorityDraftVersion: input.authorityDraftVersion,
      autonomyMode: input.autonomyMode,
      policyConstraints: {
        inferenceBudgetMinor: c.inferenceBudgetMinor,
        adSpendBudgetMinor: c.adSpendBudgetMinor,
        expiresAtIso: c.expiresAtIso,
        notificationRulesPresent: c.notificationRulesPresent,
        excludedActions: [...c.excludedActions],
      },
      policyTestMatrix: input.policyTestMatrix.map((t) => ({ ...t })),
      signedGrantId: input.signedGrantId!,
      auditEventId: input.auditEventId!,
      controlTestReceipts,
    },
    reasons: [
      `Standing autonomy grant ready for workstream ${scope.workstreamId} in mode ${input.autonomyMode}`,
      "Routine eligible actions may proceed; material exceptions and spending remain explicit",
      `Control receipts: ${controlTestReceipts.map((r) => `${r.kind}=${r.receiptId}`).join(",")}`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
