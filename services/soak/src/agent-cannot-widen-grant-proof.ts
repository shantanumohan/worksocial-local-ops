/**
 * Fixture proof for T-US-024 — agent cannot widen its own grant.
 *
 * Agent contracts forbid self_grant_capability; operator cannot manage
 * standing policies/grants; ACCESS_OR_POLICY_CHANGE never standing-authorizes.
 * External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  SoakProofKind,
  evaluateStandingAuthority,
  roleForbidsEffect,
  roleMayPerform,
  type CapabilityGrant,
  type SoakProofRecord,
  type StandingPolicy,
} from "@worksocial/domain";

const now = "2026-11-21T23:00:00.000Z";

const policyChange: StandingPolicy = {
  policyId: "pol-widen",
  version: 1,
  actorRole: LocalRole.ADMINISTRATOR,
  channelId: "owned-site",
  actionClass: ActionClass.ACCESS_OR_POLICY_CHANGE,
  allowedAssetScope: ["*"],
  enabled: true,
  emergencyStopApplies: true,
  expiresAtIso: null,
  createdAtIso: now,
};

const grantWiden: CapabilityGrant = {
  grantId: "grant-widen",
  policyId: "pol-widen",
  targetAccountId: "acct-1",
  allowedOperations: ["widen_grant", "*"],
  allowedAssetScope: ["*"],
  contentRevisionBound: null,
  rateLimitPerHour: null,
  expiresAtIso: null,
  revoked: false,
  createdAtIso: now,
};

/**
 * Complete expected proof set for T-US-024 fixture ACCEPTED.
 */
export function proofAgentCannotWidenGrant(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. A01 (and peers) forbid self-grant capability widening.
  if (roleForbidsEffect("A01", "self_grant_capability")) {
    details.push("A01 forbids self_grant_capability");
  } else {
    passed = false;
    details.push("A01 unexpectedly allows self_grant_capability");
  }
  if (roleForbidsEffect("A23", "widen_oauth_scope")) {
    details.push("A23 forbids widen_oauth_scope");
  } else {
    passed = false;
    details.push("A23 unexpectedly allows widen_oauth_scope");
  }

  // 2. Operator cannot manage standing policies or capability grants.
  const opPolicy = roleMayPerform(
    LocalRole.OPERATOR,
    "manage_standing_policies",
  );
  const opGrants = roleMayPerform(
    LocalRole.OPERATOR,
    "manage_capability_grants",
  );
  const adminPolicy = roleMayPerform(
    LocalRole.ADMINISTRATOR,
    "manage_standing_policies",
  );
  if (opPolicy === false && opGrants === false && adminPolicy === true) {
    details.push(
      "Operator denied policy/grant management; administrator allowed",
    );
  } else {
    passed = false;
    details.push(
      `Privilege check failed opPolicy=${opPolicy} opGrants=${opGrants} admin=${adminPolicy}`,
    );
  }

  // 3. Standing authority never authorizes ACCESS_OR_POLICY_CHANGE (widen).
  const widenAttempt = evaluateStandingAuthority({
    nowIso,
    operatingMode: OperatingMode.OPERATE,
    outboundStopped: false,
    actorRole: LocalRole.ADMINISTRATOR,
    actionClass: ActionClass.ACCESS_OR_POLICY_CHANGE,
    channelId: "owned-site",
    targetAccountId: "acct-1",
    operation: "widen_grant",
    assetId: "grant-scope",
    contentRevision: "rev-1",
    ownershipProven: true,
    readEvidencePresent: true,
    sourceStale: false,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    policies: [policyChange],
    grants: [grantWiden],
  });
  if (!widenAttempt.decision.allowed) {
    details.push(
      "Standing authority denies ACCESS_OR_POLICY_CHANGE (cannot self-widen)",
    );
  } else {
    passed = false;
    details.push("ACCESS_OR_POLICY_CHANGE unexpectedly allowed");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-no-widen-${randomUUID()}`,
    kind: SoakProofKind.AGENT_CANNOT_WIDEN_GRANT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us024-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
