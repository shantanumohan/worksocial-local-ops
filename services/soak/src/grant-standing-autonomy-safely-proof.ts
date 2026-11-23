/**
 * Fixture proof for T-F12 — Grant standing autonomy safely.
 * Complete F12 evidence package: scope snapshot, autonomy mode, versioned
 * authority draft, policy constraints, policy test matrix, owner-signed
 * grant + audit, pause/stop-writes/pause-replies control receipts; unsafe
 * claims refused; live providers NOT_WIRED. Distinct from T-US-023 control
 * receipts readiness summary, T-US-024 agent cannot widen grant, and
 * T-US-060 emergency stop at commit. External effects: NONE. Never invents
 * live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  AutonomyMode,
  ControlTestKind,
  PolicyTestExpectation,
  SoakProofKind,
  evaluateGrantStandingAutonomySafely,
  type GrantStandingAutonomySafelyInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<GrantStandingAutonomySafelyInput> = {},
): GrantStandingAutonomySafelyInput {
  return {
    packageId: "pkg-f12-soak",
    scope: {
      scopeSnapshotId: "scope-f12-soak",
      workstreamId: "ws-local-seo-pilot",
      siteIds: ["site-nyc-soak"],
      channelIds: ["ch-gbp-soak", "ch-social-soak"],
      actionClasses: ["observe", "draft_content", "post_local"],
      delegatedAgentIds: ["agent-a07", "agent-a14"],
    },
    autonomyMode: AutonomyMode.REVIEW_REQUIRED,
    authorityDraftId: "auth-draft-f12-soak",
    authorityDraftVersion: 1,
    constraints: {
      inferenceBudgetMinor: 5000,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T23:59:59.000Z",
      notificationRulesPresent: true,
      excludedActions: ["ad_spend_mutate", "live_publish_without_review"],
    },
    policyTestMatrix: [
      {
        actionId: "act-observe-soak",
        actionClass: "observe",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "act-spend-soak",
        actionClass: "ad_spend_mutate",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "owner-soak",
    ownerSigned: true,
    signedGrantId: "grant-f12-soak",
    auditEventId: "audit-f12-soak",
    controlTests: [
      {
        kind: ControlTestKind.PAUSE_NEW_WORK,
        receiptId: "rcpt-pause-f12-soak",
      },
      {
        kind: ControlTestKind.STOP_WRITES,
        receiptId: "rcpt-stop-writes-f12-soak",
      },
      {
        kind: ControlTestKind.PAUSE_REPLIES,
        receiptId: "rcpt-pause-replies-f12-soak",
      },
    ],
    agentSelfApprove: false,
    requestAdSpendIncreaseAsSideEffect: false,
    claimLiveVerifiedGrant: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F12 fixture ACCEPTED.
 */
export function proofGrantStandingAutonomySafely(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateGrantStandingAutonomySafely(baseInput());
  if (
    happy.allowed &&
    happy.code === "GRANT_STANDING_AUTONOMY_SAFELY_EVIDENCE_RECORDED" &&
    happy.evidence.controlTestReceipts.length === 3 &&
    happy.evidence.allowedPreviewCount >= 1 &&
    happy.evidence.blockedPreviewCount >= 1 &&
    happy.evidence.grantVerifiedLive === false &&
    happy.routineEligibleActionsMayProceed === true &&
    happy.spendingExplicit === true &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F12 evidence package → GRANT_STANDING_AUTONOMY_SAFELY_EVIDENCE_RECORDED; scope snapshot; autonomy mode; versioned authority draft; policy constraints; policy test matrix; owner-signed grant + audit; pause/stop-writes/pause-replies control receipts; grantVerifiedLive=false; spend explicit; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noScope = evaluateGrantStandingAutonomySafely(
    baseInput({ scope: null }),
  );
  if (!noScope.allowed && noScope.code === "SCOPE_SNAPSHOT_REQUIRED") {
    details.push("scope=null → SCOPE_SNAPSHOT_REQUIRED");
  } else {
    passed = false;
    details.push(`Scope unexpectedly ${JSON.stringify(noScope)}`);
  }

  const noMode = evaluateGrantStandingAutonomySafely(
    baseInput({ autonomyMode: null }),
  );
  if (!noMode.allowed && noMode.code === "AUTONOMY_MODE_REQUIRED") {
    details.push("autonomyMode=null → AUTONOMY_MODE_REQUIRED");
  } else {
    passed = false;
    details.push(`Autonomy mode unexpectedly ${JSON.stringify(noMode)}`);
  }

  const noDraft = evaluateGrantStandingAutonomySafely(
    baseInput({ authorityDraftId: null, authorityDraftVersion: 0 }),
  );
  if (!noDraft.allowed && noDraft.code === "AUTHORITY_DRAFT_REQUIRED") {
    details.push("authorityDraft invalid → AUTHORITY_DRAFT_REQUIRED");
  } else {
    passed = false;
    details.push(`Authority draft unexpectedly ${JSON.stringify(noDraft)}`);
  }

  const noConstraints = evaluateGrantStandingAutonomySafely(
    baseInput({ constraints: null }),
  );
  if (
    !noConstraints.allowed &&
    noConstraints.code === "POLICY_CONSTRAINTS_REQUIRED"
  ) {
    details.push("constraints=null → POLICY_CONSTRAINTS_REQUIRED");
  } else {
    passed = false;
    details.push(`Constraints unexpectedly ${JSON.stringify(noConstraints)}`);
  }

  const noMatrix = evaluateGrantStandingAutonomySafely(
    baseInput({
      policyTestMatrix: [
        {
          actionId: "act-only-allowed",
          actionClass: "observe",
          expectation: PolicyTestExpectation.ALLOWED,
        },
      ],
    }),
  );
  if (!noMatrix.allowed && noMatrix.code === "POLICY_TEST_MATRIX_REQUIRED") {
    details.push("policyTestMatrix incomplete → POLICY_TEST_MATRIX_REQUIRED");
  } else {
    passed = false;
    details.push(`Policy matrix unexpectedly ${JSON.stringify(noMatrix)}`);
  }

  const unsigned = evaluateGrantStandingAutonomySafely(
    baseInput({ ownerSigned: false, signedGrantId: null }),
  );
  if (!unsigned.allowed && unsigned.code === "OWNER_SIGNATURE_REQUIRED") {
    details.push("unsigned → OWNER_SIGNATURE_REQUIRED");
  } else {
    passed = false;
    details.push(`Unsigned unexpectedly ${JSON.stringify(unsigned)}`);
  }

  const noControls = evaluateGrantStandingAutonomySafely(
    baseInput({
      controlTests: [
        {
          kind: ControlTestKind.PAUSE_NEW_WORK,
          receiptId: "rcpt-pause-only",
        },
      ],
    }),
  );
  if (!noControls.allowed && noControls.code === "CONTROL_TESTS_REQUIRED") {
    details.push("controlTests incomplete → CONTROL_TESTS_REQUIRED");
  } else {
    passed = false;
    details.push(`Control tests unexpectedly ${JSON.stringify(noControls)}`);
  }

  const selfApprove = evaluateGrantStandingAutonomySafely(
    baseInput({ agentSelfApprove: true }),
  );
  if (
    !selfApprove.allowed &&
    selfApprove.code === "AGENT_SELF_APPROVE_REFUSED"
  ) {
    details.push("agentSelfApprove → AGENT_SELF_APPROVE_REFUSED");
  } else {
    passed = false;
    details.push(`Self-approve unexpectedly ${JSON.stringify(selfApprove)}`);
  }

  const adSpend = evaluateGrantStandingAutonomySafely(
    baseInput({ requestAdSpendIncreaseAsSideEffect: true }),
  );
  if (!adSpend.allowed && adSpend.code === "AD_SPEND_SIDE_EFFECT_REFUSED") {
    details.push(
      "requestAdSpendIncreaseAsSideEffect → AD_SPEND_SIDE_EFFECT_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Ad spend unexpectedly ${JSON.stringify(adSpend)}`);
  }

  const liveClaim = evaluateGrantStandingAutonomySafely(
    baseInput({ claimLiveVerifiedGrant: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_GRANT_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedGrant → FALSE_LIVE_VERIFIED_GRANT_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateGrantStandingAutonomySafely(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-023 (control receipts readiness summary), T-US-024 (agent cannot widen grant), and T-US-060 (emergency stop at commit) — complete F12 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.GRANT_STANDING_AUTONOMY_SAFELY,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-grant-standing-autonomy-safely-f12",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
