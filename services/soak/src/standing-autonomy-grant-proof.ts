/**
 * Fixture proof for T-US-023 — Grant standing autonomy (control tests with receipts).
 * Scope snapshot, versioned authority draft, policy constraints, policy test
 * matrix, owner-signed grant + audit, pause/stop-writes/pause-replies receipts.
 * Live NOT_WIRED. Distinct from T-US-024 / T-US-060. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  AutonomyMode,
  ControlTestKind,
  PolicyTestExpectation,
  SoakProofKind,
  evaluateStandingAutonomyGrant,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-023 fixture ACCEPTED.
 */
export function proofStandingAutonomyGrantControlReceipts(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const ready = evaluateStandingAutonomyGrant({
    scope: {
      scopeSnapshotId: "scope-fixture-us023",
      workstreamId: "ws-seo-pilot",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site", "inbox"],
      actionClasses: ["observe", "routine_publish", "routine_customer_service"],
      delegatedAgentIds: ["A01", "A07", "A25"],
    },
    autonomyMode: AutonomyMode.BOUNDED_AUTOMATIC,
    authorityDraftId: "draft-auth-us023",
    authorityDraftVersion: 2,
    constraints: {
      inferenceBudgetMinor: 10_000,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T00:00:00.000Z",
      notificationRulesPresent: true,
      excludedActions: ["ACCESS_OR_POLICY_CHANGE", "ADS_MUTATE"],
    },
    policyTestMatrix: [
      {
        actionId: "act-routine-publish",
        actionClass: "routine_publish",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "act-material-spend",
        actionClass: "material_change",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "owner@fixture.local",
    ownerSigned: true,
    signedGrantId: "grant-signed-us023",
    auditEventId: "audit-grant-us023",
    controlTests: [
      {
        kind: ControlTestKind.PAUSE_NEW_WORK,
        receiptId: "rcpt-pause-new-work-us023",
      },
      {
        kind: ControlTestKind.STOP_WRITES,
        receiptId: "rcpt-stop-writes-us023",
      },
      {
        kind: ControlTestKind.PAUSE_REPLIES,
        receiptId: "rcpt-pause-replies-us023",
      },
    ],
    agentSelfApprove: false,
    requestAdSpendIncreaseAsSideEffect: false,
    requestLiveProviderWiring: false,
  });
  if (
    ready.allowed &&
    ready.code === "STANDING_AUTONOMY_GRANT_READY" &&
    ready.routineEligibleActionsMayProceed &&
    ready.materialExceptionsExplicit &&
    ready.spendingExplicit &&
    ready.liveProviderWiring === "NOT_WIRED" &&
    ready.externalEffects === "NONE" &&
    ready.evidence.controlTestReceipts.length === 3 &&
    ready.evidence.signedGrantId === "grant-signed-us023"
  ) {
    details.push(
      "Ready → STANDING_AUTONOMY_GRANT_READY; 3 control receipts; spend explicit; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Ready unexpectedly ${JSON.stringify(ready)}`);
  }

  const selfApprove = evaluateStandingAutonomyGrant({
    scope: {
      scopeSnapshotId: "scope-fixture-us023",
      workstreamId: "ws-seo-pilot",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      actionClasses: ["observe"],
      delegatedAgentIds: ["A01"],
    },
    autonomyMode: AutonomyMode.OBSERVE,
    authorityDraftId: "draft-auth-us023",
    authorityDraftVersion: 1,
    constraints: {
      inferenceBudgetMinor: 1,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T00:00:00.000Z",
      notificationRulesPresent: true,
      excludedActions: [],
    },
    policyTestMatrix: [
      {
        actionId: "a1",
        actionClass: "observe",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "a2",
        actionClass: "material_change",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "agent-a01",
    ownerSigned: true,
    signedGrantId: "grant-bad",
    auditEventId: "audit-bad",
    controlTests: [
      { kind: ControlTestKind.PAUSE_NEW_WORK, receiptId: "r1" },
      { kind: ControlTestKind.STOP_WRITES, receiptId: "r2" },
      { kind: ControlTestKind.PAUSE_REPLIES, receiptId: "r3" },
    ],
    agentSelfApprove: true,
    requestAdSpendIncreaseAsSideEffect: false,
    requestLiveProviderWiring: false,
  });
  if (
    !selfApprove.allowed &&
    selfApprove.code === "AGENT_SELF_APPROVE_REFUSED"
  ) {
    details.push("agentSelfApprove → AGENT_SELF_APPROVE_REFUSED");
  } else {
    passed = false;
    details.push(`Self-approve unexpectedly ${JSON.stringify(selfApprove)}`);
  }

  const adSide = evaluateStandingAutonomyGrant({
    scope: {
      scopeSnapshotId: "scope-fixture-us023",
      workstreamId: "ws-seo-pilot",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      actionClasses: ["observe"],
      delegatedAgentIds: ["A01"],
    },
    autonomyMode: AutonomyMode.BOUNDED_AUTOMATIC,
    authorityDraftId: "draft-auth-us023",
    authorityDraftVersion: 1,
    constraints: {
      inferenceBudgetMinor: 1,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T00:00:00.000Z",
      notificationRulesPresent: true,
      excludedActions: [],
    },
    policyTestMatrix: [
      {
        actionId: "a1",
        actionClass: "observe",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "a2",
        actionClass: "material_change",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "owner@fixture.local",
    ownerSigned: true,
    signedGrantId: "grant-ok",
    auditEventId: "audit-ok",
    controlTests: [
      { kind: ControlTestKind.PAUSE_NEW_WORK, receiptId: "r1" },
      { kind: ControlTestKind.STOP_WRITES, receiptId: "r2" },
      { kind: ControlTestKind.PAUSE_REPLIES, receiptId: "r3" },
    ],
    agentSelfApprove: false,
    requestAdSpendIncreaseAsSideEffect: true,
    requestLiveProviderWiring: false,
  });
  if (!adSide.allowed && adSide.code === "AD_SPEND_SIDE_EFFECT_REFUSED") {
    details.push("adSpend side-effect → AD_SPEND_SIDE_EFFECT_REFUSED");
  } else {
    passed = false;
    details.push(`Ad side-effect unexpectedly ${JSON.stringify(adSide)}`);
  }

  const live = evaluateStandingAutonomyGrant({
    scope: {
      scopeSnapshotId: "scope-fixture-us023",
      workstreamId: "ws-seo-pilot",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      actionClasses: ["observe"],
      delegatedAgentIds: ["A01"],
    },
    autonomyMode: AutonomyMode.REVIEW_REQUIRED,
    authorityDraftId: "draft-auth-us023",
    authorityDraftVersion: 1,
    constraints: {
      inferenceBudgetMinor: 1,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T00:00:00.000Z",
      notificationRulesPresent: true,
      excludedActions: [],
    },
    policyTestMatrix: [
      {
        actionId: "a1",
        actionClass: "observe",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "a2",
        actionClass: "material_change",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "owner@fixture.local",
    ownerSigned: true,
    signedGrantId: "grant-ok",
    auditEventId: "audit-ok",
    controlTests: [
      { kind: ControlTestKind.PAUSE_NEW_WORK, receiptId: "r1" },
      { kind: ControlTestKind.STOP_WRITES, receiptId: "r2" },
      { kind: ControlTestKind.PAUSE_REPLIES, receiptId: "r3" },
    ],
    agentSelfApprove: false,
    requestAdSpendIncreaseAsSideEffect: false,
    requestLiveProviderWiring: true,
  });
  if (!live.allowed && live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED") {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live refuse unexpectedly ${JSON.stringify(live)}`);
  }

  const unsigned = evaluateStandingAutonomyGrant({
    scope: {
      scopeSnapshotId: "scope-fixture-us023",
      workstreamId: "ws-seo-pilot",
      siteIds: ["site-pilot-1"],
      channelIds: ["owned-site"],
      actionClasses: ["observe"],
      delegatedAgentIds: ["A01"],
    },
    autonomyMode: AutonomyMode.DRAFT,
    authorityDraftId: "draft-auth-us023",
    authorityDraftVersion: 1,
    constraints: {
      inferenceBudgetMinor: 1,
      adSpendBudgetMinor: 0,
      expiresAtIso: "2026-12-31T00:00:00.000Z",
      notificationRulesPresent: true,
      excludedActions: [],
    },
    policyTestMatrix: [
      {
        actionId: "a1",
        actionClass: "observe",
        expectation: PolicyTestExpectation.ALLOWED,
      },
      {
        actionId: "a2",
        actionClass: "material_change",
        expectation: PolicyTestExpectation.BLOCKED,
      },
    ],
    ownerIdentity: "owner@fixture.local",
    ownerSigned: false,
    signedGrantId: null,
    auditEventId: null,
    controlTests: [
      { kind: ControlTestKind.PAUSE_NEW_WORK, receiptId: "r1" },
      { kind: ControlTestKind.STOP_WRITES, receiptId: "r2" },
      { kind: ControlTestKind.PAUSE_REPLIES, receiptId: "r3" },
    ],
    agentSelfApprove: false,
    requestAdSpendIncreaseAsSideEffect: false,
    requestLiveProviderWiring: false,
  });
  if (!unsigned.allowed && unsigned.code === "OWNER_SIGNATURE_REQUIRED") {
    details.push("unsigned → OWNER_SIGNATURE_REQUIRED");
  } else {
    passed = false;
    details.push(`Unsigned unexpectedly ${JSON.stringify(unsigned)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  details.push(
    "Distinct from T-US-024 (agent cannot widen grant) and T-US-060 (emergency stop at commit)",
  );

  return {
    proofId: `proof-standing-autonomy-${randomUUID()}`,
    kind: SoakProofKind.STANDING_AUTONOMY_GRANT_CONTROL_RECEIPTS,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us023-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
