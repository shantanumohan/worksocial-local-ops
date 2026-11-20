/**
 * Standing policies and capability grants (v3 §9, R1-02).
 * Pure evaluation — maps into evaluatePolicy inputs for the action gateway.
 */

import {
  evaluatePolicy,
  type PolicyDecision,
  type PolicyInput,
} from "./policy-evaluation.js";

export const ActionClass = {
  OBSERVE: "observe",
  CREATE: "create",
  ROUTINE_PUBLISH: "routine_publish",
  ROUTINE_CUSTOMER_SERVICE: "routine_customer_service",
  BOUNDED_REPAIR: "bounded_repair",
  MATERIAL_CHANGE: "material_change",
  ACCESS_OR_POLICY_CHANGE: "access_or_policy_change",
} as const;

export type ActionClassValue = (typeof ActionClass)[keyof typeof ActionClass];

export const OperatingMode = {
  OBSERVE: "observe",
  OPERATE: "operate",
  MAINTENANCE: "maintenance",
} as const;

export type OperatingModeValue =
  (typeof OperatingMode)[keyof typeof OperatingMode];

export type StandingPolicy = {
  policyId: string;
  version: number;
  actorRole: string;
  channelId: string;
  actionClass: ActionClassValue;
  allowedAssetScope: string[];
  enabled: boolean;
  emergencyStopApplies: boolean;
  expiresAtIso: string | null;
  createdAtIso: string;
};

export type CapabilityGrant = {
  grantId: string;
  policyId: string;
  targetAccountId: string;
  allowedOperations: string[];
  allowedAssetScope: string[];
  contentRevisionBound: string | null;
  rateLimitPerHour: number | null;
  expiresAtIso: string | null;
  revoked: boolean;
  createdAtIso: string;
};

export type AuthorityRequest = {
  nowIso: string;
  operatingMode: OperatingModeValue;
  outboundStopped: boolean;
  /**
   * Authenticated caller role from server session/context — never from client body.
   * Must match StandingPolicy.actorRole for a grant to apply.
   */
  actorRole: string;
  actionClass: ActionClassValue;
  channelId: string;
  targetAccountId: string;
  operation: string;
  assetId: string;
  contentRevision: string | null;
  ownershipProven: boolean;
  /** Required for pilot write classes (R1-03); observe/create may pass true. */
  readEvidencePresent: boolean;
  sourceStale: boolean;
  prerequisiteMissing: boolean;
  prerequisiteConflict: boolean;
  policies: StandingPolicy[];
  grants: CapabilityGrant[];
  /**
   * Count of allowed gateway decisions for the matched grant in the trailing hour.
   * Supplied by the gateway; unused grants pass 0.
   */
  grantUsesInLastHour?: number;
};

export type AuthorityMatch = {
  policy: StandingPolicy;
  grant: CapabilityGrant;
};

export type AuthorityEvaluation = {
  decision: PolicyDecision;
  match: AuthorityMatch | null;
  policyInput: PolicyInput;
};

function parseTime(iso: string): number {
  return Date.parse(iso);
}

function isExpired(expiresAtIso: string | null, nowIso: string): boolean {
  if (expiresAtIso === null) {
    return false;
  }
  return parseTime(expiresAtIso) <= parseTime(nowIso);
}

function scopeAllows(scope: string[], assetId: string): boolean {
  if (scope.includes("*")) {
    return true;
  }
  return scope.includes(assetId);
}

/**
 * Observe mode never authorizes external write classes.
 * Access/policy changes are never self-approved via standing grants alone.
 */
function modeBlocksWrite(
  mode: OperatingModeValue,
  actionClass: ActionClassValue,
): boolean {
  if (actionClass === ActionClass.OBSERVE || actionClass === ActionClass.CREATE) {
    return false;
  }
  if (mode === OperatingMode.OBSERVE) {
    return true;
  }
  if (actionClass === ActionClass.ACCESS_OR_POLICY_CHANGE) {
    return true;
  }
  return false;
}

export function findMatchingGrant(
  request: AuthorityRequest,
): AuthorityMatch | null {
  if (modeBlocksWrite(request.operatingMode, request.actionClass)) {
    return null;
  }

  for (const policy of request.policies) {
    if (!policy.enabled) {
      continue;
    }
    if (policy.actorRole !== request.actorRole && policy.actorRole !== "*") {
      continue;
    }
    if (policy.channelId !== request.channelId && policy.channelId !== "*") {
      continue;
    }
    if (policy.actionClass !== request.actionClass) {
      continue;
    }
    if (isExpired(policy.expiresAtIso, request.nowIso)) {
      continue;
    }
    if (!scopeAllows(policy.allowedAssetScope, request.assetId)) {
      continue;
    }

    for (const grant of request.grants) {
      if (grant.policyId !== policy.policyId) {
        continue;
      }
      if (grant.revoked) {
        continue;
      }
      if (
        grant.targetAccountId !== request.targetAccountId &&
        grant.targetAccountId !== "*"
      ) {
        continue;
      }
      if (
        !grant.allowedOperations.includes(request.operation) &&
        !grant.allowedOperations.includes("*")
      ) {
        continue;
      }
      if (!scopeAllows(grant.allowedAssetScope, request.assetId)) {
        continue;
      }
      if (isExpired(grant.expiresAtIso, request.nowIso)) {
        continue;
      }
      return { policy, grant };
    }
  }

  return null;
}

export function evaluateStandingAuthority(
  request: AuthorityRequest,
): AuthorityEvaluation {
  const match = findMatchingGrant(request);
  const grantExpired =
    match !== null && isExpired(match.grant.expiresAtIso, request.nowIso);

  let revisionMatches = true;
  if (
    match?.grant.contentRevisionBound !== null &&
    match?.grant.contentRevisionBound !== undefined
  ) {
    revisionMatches = match.grant.contentRevisionBound === request.contentRevision;
  }

  const rateLimitExceeded =
    match !== null &&
    match.grant.rateLimitPerHour !== null &&
    (request.grantUsesInLastHour ?? 0) >= match.grant.rateLimitPerHour;

  const policyInput: PolicyInput = {
    outboundStopped: request.outboundStopped,
    sourceStale: request.sourceStale,
    grantPresent: match !== null,
    grantExpired,
    ownershipProven: request.ownershipProven,
    readEvidencePresent: request.readEvidencePresent,
    prerequisiteMissing: request.prerequisiteMissing,
    prerequisiteConflict: request.prerequisiteConflict,
    revisionMatches,
    rateLimitExceeded,
  };

  const decision = evaluatePolicy(policyInput);
  return { decision, match, policyInput };
}
