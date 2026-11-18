/**
 * Pure policy evaluation — no network, credentials, or Node process APIs.
 * Denies when critical prerequisites are stale, missing, conflicting, or outbound is stopped.
 */

export type PolicyInput = {
  outboundStopped: boolean;
  sourceStale: boolean;
  grantPresent: boolean;
  grantExpired: boolean;
  ownershipProven: boolean;
  /** Prior successful read/capability-test evidence for the pilot write path. */
  readEvidencePresent: boolean;
  prerequisiteMissing: boolean;
  prerequisiteConflict: boolean;
  revisionMatches: boolean;
};

export type PolicyDecision =
  | { allowed: true }
  | {
      allowed: false;
      code:
        | "OUTBOUND_STOPPED"
        | "SOURCE_STALE"
        | "GRANT_MISSING"
        | "GRANT_EXPIRED"
        | "OWNERSHIP_UNPROVEN"
        | "READ_EVIDENCE_MISSING"
        | "PREREQUISITE_MISSING"
        | "PREREQUISITE_CONFLICT"
        | "REVISION_MISMATCH"
        | "POLICY_DENIED";
      reason: string;
    };

export function evaluatePolicy(input: PolicyInput): PolicyDecision {
  if (input.outboundStopped) {
    return {
      allowed: false,
      code: "OUTBOUND_STOPPED",
      reason: "Owner stop flag blocks external effects",
    };
  }
  if (!input.ownershipProven) {
    return {
      allowed: false,
      code: "OWNERSHIP_UNPROVEN",
      reason: "Source ownership is unproven",
    };
  }
  if (!input.readEvidencePresent) {
    return {
      allowed: false,
      code: "READ_EVIDENCE_MISSING",
      reason: "Pilot write path lacks required prior read evidence",
    };
  }
  if (!input.grantPresent) {
    return {
      allowed: false,
      code: "GRANT_MISSING",
      reason: "No capability grant for this action",
    };
  }
  if (input.grantExpired) {
    return {
      allowed: false,
      code: "GRANT_EXPIRED",
      reason: "Capability grant has expired",
    };
  }
  if (input.sourceStale) {
    return {
      allowed: false,
      code: "SOURCE_STALE",
      reason: "Bound source revision is stale",
    };
  }
  if (!input.revisionMatches) {
    return {
      allowed: false,
      code: "REVISION_MISMATCH",
      reason: "Approval is not bound to the current revision",
    };
  }
  if (input.prerequisiteMissing) {
    return {
      allowed: false,
      code: "PREREQUISITE_MISSING",
      reason: "Critical prerequisite is missing",
    };
  }
  if (input.prerequisiteConflict) {
    return {
      allowed: false,
      code: "PREREQUISITE_CONFLICT",
      reason: "Critical prerequisites conflict",
    };
  }
  return { allowed: true };
}
