/**
 * Action gateway — sole mutation authority stub (R1-02).
 * Durable intent → authorize → apply/deny. Provider acceptance ≠ verified.
 * Independent of credential material and Claude runners.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  ActionClass,
  EffectState,
  OperatingMode,
  SimulatedEffectLedger,
  evaluateStandingAuthority,
  transition,
  type ActionClassValue,
  type AuthorityEvaluation,
  type CapabilityGrant,
  type EffectStateValue,
  type OperatingModeValue,
  type StandingPolicy,
} from "@worksocial/domain";

export type GatewayIntent = {
  operationId: string;
  actionClass: ActionClassValue;
  channelId: string;
  targetAccountId: string;
  operation: string;
  assetId: string;
  contentRevision: string | null;
  payload: Record<string, unknown>;
  ownershipProven?: boolean;
  sourceStale?: boolean;
  prerequisiteMissing?: boolean;
  prerequisiteConflict?: boolean;
};

export type GatewayAuthoritySnapshot = {
  outboundStopped: boolean;
  operatingMode: OperatingModeValue;
  policies: StandingPolicy[];
  grants: CapabilityGrant[];
  nowIso: string;
};

export type GatewayDecisionRecord = {
  decisionId: string;
  operationId: string;
  payloadDigest: string;
  allowed: boolean;
  code: string | null;
  reason: string;
  grantId: string | null;
  policyId: string | null;
  decidedAtIso: string;
  effectState: EffectStateValue;
  /** ACCEPTED_PENDING after stub apply — never auto-promoted to VERIFIED. */
  outcome:
    | "DENIED"
    | "INTENDED"
    | "ACCEPTED_PENDING"
    | "VERIFIED";
};

export type GatewaySubmitResult = {
  decision: GatewayDecisionRecord;
  evaluation: AuthorityEvaluation;
};

export function digestPayload(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

export type ActionGateway = {
  readonly ledger: SimulatedEffectLedger;
  submitIntent(
    intent: GatewayIntent,
    authority: GatewayAuthoritySnapshot,
  ): GatewaySubmitResult;
  /** Explicit verification step — never implied by acceptance. */
  markVerified(operationId: string, nowIso: string): GatewayDecisionRecord;
  getDecision(operationId: string): GatewayDecisionRecord | undefined;
  listDecisions(): GatewayDecisionRecord[];
};

export function createActionGateway(): ActionGateway {
  const ledger = new SimulatedEffectLedger();
  const decisions = new Map<string, GatewayDecisionRecord>();

  const submitIntent = (
    intent: GatewayIntent,
    authority: GatewayAuthoritySnapshot,
  ): GatewaySubmitResult => {
    const payloadDigest = digestPayload(intent.payload);
    ledger.recordIntent(intent.operationId, payloadDigest, authority.nowIso);

    let effectState: EffectStateValue = EffectState.QUEUED;
    effectState = transition(effectState, EffectState.LEASED);
    effectState = transition(effectState, EffectState.RUNNING);
    effectState = transition(effectState, EffectState.VALIDATING);

    const evaluation = evaluateStandingAuthority({
      nowIso: authority.nowIso,
      operatingMode: authority.operatingMode,
      outboundStopped: authority.outboundStopped,
      actionClass: intent.actionClass,
      channelId: intent.channelId,
      targetAccountId: intent.targetAccountId,
      operation: intent.operation,
      assetId: intent.assetId,
      contentRevision: intent.contentRevision,
      ownershipProven: intent.ownershipProven ?? true,
      sourceStale: intent.sourceStale ?? false,
      prerequisiteMissing: intent.prerequisiteMissing ?? false,
      prerequisiteConflict: intent.prerequisiteConflict ?? false,
      policies: authority.policies,
      grants: authority.grants,
    });

    if (!evaluation.decision.allowed) {
      effectState = transition(effectState, EffectState.QUARANTINED);
      const denied: GatewayDecisionRecord = {
        decisionId: `dec-${randomBytes(6).toString("hex")}`,
        operationId: intent.operationId,
        payloadDigest,
        allowed: false,
        code: evaluation.decision.code,
        reason: evaluation.decision.reason,
        grantId: evaluation.match?.grant.grantId ?? null,
        policyId: evaluation.match?.policy.policyId ?? null,
        decidedAtIso: authority.nowIso,
        effectState,
        outcome: "DENIED",
      };
      decisions.set(intent.operationId, denied);
      return { decision: denied, evaluation };
    }

    effectState = transition(effectState, EffectState.AUTHORIZED);
    effectState = transition(effectState, EffectState.APPLYING);
    // Stub apply: record provider acceptance only — not verified environment evidence.
    ledger.settle(intent.operationId, "ACCEPTED_PENDING");
    effectState = transition(effectState, EffectState.VERIFYING);

    const accepted: GatewayDecisionRecord = {
      decisionId: `dec-${randomBytes(6).toString("hex")}`,
      operationId: intent.operationId,
      payloadDigest,
      allowed: true,
      code: null,
      reason: "Authorized by standing grant; stub apply accepted pending verification",
      grantId: evaluation.match?.grant.grantId ?? null,
      policyId: evaluation.match?.policy.policyId ?? null,
      decidedAtIso: authority.nowIso,
      effectState,
      outcome: "ACCEPTED_PENDING",
    };
    decisions.set(intent.operationId, accepted);
    return { decision: accepted, evaluation };
  };

  const markVerified = (
    operationId: string,
    nowIso: string,
  ): GatewayDecisionRecord => {
    const existing = decisions.get(operationId);
    if (!existing) {
      throw new Error(`Unknown operation ${operationId}`);
    }
    if (!existing.allowed) {
      throw new Error(`Denied operation ${operationId} cannot be verified`);
    }
    ledger.settle(operationId, "VERIFIED");
    const verified: GatewayDecisionRecord = {
      ...existing,
      effectState: transition(existing.effectState, EffectState.COMPLETE),
      outcome: "VERIFIED",
      decidedAtIso: nowIso,
      reason: "Verified with environment evidence",
    };
    decisions.set(operationId, verified);
    return verified;
  };

  return {
    ledger,
    submitIntent,
    markVerified,
    getDecision: (operationId) => decisions.get(operationId),
    listDecisions: () => [...decisions.values()],
  };
}

export {
  ActionClass,
  OperatingMode,
};
