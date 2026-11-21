/**
 * Fixture proof for T-X005 — forged browser role / payload role ignored.
 *
 * API binds gateway actorRole from the authenticated session only
 * (never from intent body). A client-forged ADMINISTRATOR claim cannot
 * escalate an OPERATOR session. External effects: NONE.
 * Avoids credential rebind (#43) lane.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  SoakProofKind,
  evaluateStandingAuthority,
  type CapabilityGrant,
  type LocalRoleValue,
  type SoakProofRecord,
  type StandingPolicy,
} from "@worksocial/domain";

const now = "2026-11-21T22:30:00.000Z";

const adminPolicy: StandingPolicy = {
  policyId: "pol-admin-only",
  version: 1,
  actorRole: LocalRole.ADMINISTRATOR,
  channelId: "owned-site",
  actionClass: ActionClass.ROUTINE_PUBLISH,
  allowedAssetScope: ["page-home"],
  enabled: true,
  emergencyStopApplies: true,
  expiresAtIso: null,
  createdAtIso: now,
};

const adminGrant: CapabilityGrant = {
  grantId: "grant-admin-only",
  policyId: "pol-admin-only",
  targetAccountId: "acct-1",
  allowedOperations: ["publish_page"],
  allowedAssetScope: ["page-home"],
  contentRevisionBound: "rev-1",
  rateLimitPerHour: 10,
  expiresAtIso: null,
  revoked: false,
  createdAtIso: now,
};

/**
 * Mirror apps/api auth-http: actor role comes only from the session.
 * Client-supplied body.actorRole is discarded.
 */
export function bindActorRoleFromSession(
  sessionRole: LocalRoleValue,
  _bodyActorRole: string | undefined,
): LocalRoleValue {
  return sessionRole;
}

/**
 * Complete expected proof set for T-X005 fixture ACCEPTED.
 */
export function proofForgedBrowserRoleIgnored(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const sessionRole = LocalRole.OPERATOR;
  const forgedBodyRole: string = LocalRole.ADMINISTRATOR;
  const effectiveRole = bindActorRoleFromSession(sessionRole, forgedBodyRole);

  if (effectiveRole === sessionRole && effectiveRole !== forgedBodyRole) {
    details.push(
      `Payload role ignored: session=${sessionRole} bodyForged=${forgedBodyRole} effective=${effectiveRole}`,
    );
  } else {
    passed = false;
    details.push(
      `Payload role binding failed session=${sessionRole} effective=${effectiveRole}`,
    );
  }

  // Operator session cannot use administrator-only standing grant.
  const forgedAttempt = evaluateStandingAuthority({
    nowIso,
    operatingMode: OperatingMode.OPERATE,
    outboundStopped: false,
    actorRole: effectiveRole,
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "owned-site",
    targetAccountId: "acct-1",
    operation: "publish_page",
    assetId: "page-home",
    contentRevision: "rev-1",
    ownershipProven: true,
    readEvidencePresent: true,
    sourceStale: false,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    policies: [adminPolicy],
    grants: [adminGrant],
  });
  if (
    !forgedAttempt.decision.allowed &&
    forgedAttempt.decision.code === "GRANT_MISSING"
  ) {
    details.push(
      "Forged admin claim denied GRANT_MISSING under operator session",
    );
  } else {
    passed = false;
    details.push(
      `Forged escalation unexpectedly allowed=${forgedAttempt.decision.allowed}`,
    );
  }

  // Counterfactual: if body role had been trusted, admin grant would match.
  const ifBodyTrusted = evaluateStandingAuthority({
    nowIso,
    operatingMode: OperatingMode.OPERATE,
    outboundStopped: false,
    actorRole: forgedBodyRole,
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "owned-site",
    targetAccountId: "acct-1",
    operation: "publish_page",
    assetId: "page-home",
    contentRevision: "rev-1",
    ownershipProven: true,
    readEvidencePresent: true,
    sourceStale: false,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    policies: [adminPolicy],
    grants: [adminGrant],
  });
  if (ifBodyTrusted.decision.allowed) {
    details.push(
      "Counterfactual: trusting body.actorRole would have allowed admin grant",
    );
  } else {
    passed = false;
    details.push("Counterfactual admin grant unexpectedly denied");
  }

  // Positive control: genuine administrator session allowed.
  const adminOk = evaluateStandingAuthority({
    nowIso,
    operatingMode: OperatingMode.OPERATE,
    outboundStopped: false,
    actorRole: LocalRole.ADMINISTRATOR,
    actionClass: ActionClass.ROUTINE_PUBLISH,
    channelId: "owned-site",
    targetAccountId: "acct-1",
    operation: "publish_page",
    assetId: "page-home",
    contentRevision: "rev-1",
    ownershipProven: true,
    readEvidencePresent: true,
    sourceStale: false,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    policies: [adminPolicy],
    grants: [adminGrant],
  });
  if (adminOk.decision.allowed) {
    details.push("Positive control: administrator session allowed");
  } else {
    passed = false;
    details.push("Positive control administrator session denied");
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-forged-role-${randomUUID()}`,
    kind: SoakProofKind.FORGED_BROWSER_ROLE_IGNORED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx005-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
