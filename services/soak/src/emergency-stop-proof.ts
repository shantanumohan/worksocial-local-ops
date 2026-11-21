/**
 * Fixture proof for T-US-060 — emergency stop checked at commit time.
 *
 * Owner outbound stop blocks policy + standing-authority commit paths
 * (OUTBOUND_STOPPED). Operator cannot toggle the stop switch; administrator
 * can. External effects: NONE. Never invents live VERIFIED.
 * Avoids credential rebind (#43) lane.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  LocalRole,
  OperatingMode,
  SoakProofKind,
  evaluatePolicy,
  evaluateStandingAuthority,
  roleMayPerform,
  type CapabilityGrant,
  type SoakProofRecord,
  type StandingPolicy,
} from "@worksocial/domain";

const now = "2026-11-21T22:00:00.000Z";

const policy: StandingPolicy = {
  policyId: "pol-stop",
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

const grant: CapabilityGrant = {
  grantId: "grant-stop",
  policyId: "pol-stop",
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
 * Complete expected proof set for T-US-060 fixture ACCEPTED.
 */
export function proofEmergencyStopAtCommit(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Commit-time policy gate: outbound stop denies first.
  const policyStopped = evaluatePolicy({
    outboundStopped: true,
    sourceStale: false,
    grantPresent: true,
    grantExpired: false,
    ownershipProven: true,
    readEvidencePresent: true,
    prerequisiteMissing: false,
    prerequisiteConflict: false,
    revisionMatches: true,
    rateLimitExceeded: false,
  });
  if (!policyStopped.allowed && policyStopped.code === "OUTBOUND_STOPPED") {
    details.push(
      `Policy commit gate denied OUTBOUND_STOPPED reason=${policyStopped.reason}`,
    );
  } else {
    passed = false;
    details.push(
      `Policy commit gate failed ok=${policyStopped.allowed} code=${"code" in policyStopped ? policyStopped.code : "n/a"}`,
    );
  }

  // 2. Standing authority inherits stop at evaluation / commit time.
  const authorityStopped = evaluateStandingAuthority({
    nowIso,
    operatingMode: OperatingMode.OPERATE,
    outboundStopped: true,
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
    policies: [policy],
    grants: [grant],
  });
  if (
    !authorityStopped.decision.allowed &&
    authorityStopped.decision.code === "OUTBOUND_STOPPED"
  ) {
    details.push("Standing authority commit path denied OUTBOUND_STOPPED");
  } else {
    passed = false;
    details.push(
      `Standing authority stop check failed allowed=${authorityStopped.decision.allowed}`,
    );
  }

  // 3. Positive control: stop cleared → matching grant may proceed.
  const authorityOk = evaluateStandingAuthority({
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
    policies: [policy],
    grants: [grant],
  });
  if (authorityOk.decision.allowed) {
    details.push("Standing authority allows publish when outboundStopped=false");
  } else {
    passed = false;
    details.push("Positive control publish failed with stop cleared");
  }

  // 4. Stop-switch privilege: operator cannot toggle; administrator can.
  const opToggle = roleMayPerform(LocalRole.OPERATOR, "toggle_stop_switch");
  const adminToggle = roleMayPerform(
    LocalRole.ADMINISTRATOR,
    "toggle_stop_switch",
  );
  if (opToggle === false && adminToggle === true) {
    details.push(
      "Stop-switch privilege: operator denied, administrator allowed",
    );
  } else {
    passed = false;
    details.push(
      `Stop-switch privilege unexpected operator=${opToggle} admin=${adminToggle}`,
    );
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-emergency-stop-${randomUUID()}`,
    kind: SoakProofKind.EMERGENCY_STOP_AT_COMMIT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us060-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
