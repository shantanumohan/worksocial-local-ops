/**
 * Action gateway — sole mutation authority stub (R1-02 + R1-03).
 * Durable intent → authorize → apply/deny. Provider acceptance ≠ verified.
 * Pilot write classes require mapped ownership + prior read evidence.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  ActionClass,
  EffectState,
  OperatingMode,
  SimulatedEffectLedger,
  actionClassRequiresPilotWriteGates,
  evaluateStandingAuthority,
  resolvePilotWriteGates,
  transition,
  type ActionClassValue,
  type AuthorityEvaluation,
  type CapabilityGrant,
  type EffectStateValue,
  type OperatingModeValue,
  type ProductionMappingState,
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
  /** Optional explicit pilot write-path id; otherwise channel/asset/operation match. */
  writePathId?: string | null;
  /**
   * When productionMapping is absent, callers may supply resolved gates.
   * For write classes, unset defaults to false (fail closed).
   */
  ownershipProven?: boolean;
  readEvidencePresent?: boolean;
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
  /** When present, gateway resolves ownership + read-evidence gates from mapping. */
  productionMapping?: ProductionMappingState;
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
  writePathId: string | null;
  gateDetails: string[];
};

export type GatewaySubmitResult = {
  decision: GatewayDecisionRecord;
  evaluation: AuthorityEvaluation;
};

export function digestPayload(payload: Record<string, unknown>): string {
  const canonical = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash("sha256").update(canonical).digest("hex");
}

function resolveIntentGates(
  intent: GatewayIntent,
  authority: GatewayAuthoritySnapshot,
): {
  ownershipProven: boolean;
  readEvidencePresent: boolean;
  prerequisiteMissing: boolean;
  writePathId: string | null;
  details: string[];
} {
  if (authority.productionMapping) {
    const gates = resolvePilotWriteGates({
      actionClass: intent.actionClass,
      writePathId: intent.writePathId ?? null,
      channelId: intent.channelId,
      assetId: intent.assetId,
      operation: intent.operation,
      mapping: authority.productionMapping,
    });
    return {
      ownershipProven: gates.ownershipProven,
      readEvidencePresent: gates.readEvidencePresent,
      prerequisiteMissing:
        gates.prerequisiteMissing || (intent.prerequisiteMissing ?? false),
      writePathId: gates.matchedWritePath?.writePathId ?? intent.writePathId ?? null,
      details: gates.details,
    };
  }

  const requires = actionClassRequiresPilotWriteGates(intent.actionClass);
  const ownershipProven = intent.ownershipProven ?? !requires;
  const readEvidencePresent = intent.readEvidencePresent ?? !requires;
  return {
    ownershipProven,
    readEvidencePresent,
    prerequisiteMissing: intent.prerequisiteMissing ?? false,
    writePathId: intent.writePathId ?? null,
    details: requires
      ? [
          ownershipProven ? "ownership flag supplied" : "ownershipProven defaulted false for write class",
          readEvidencePresent
            ? "read evidence flag supplied"
            : "readEvidencePresent defaulted false for write class",
        ]
      : ["write gates not required"],
  };
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

    const gates = resolveIntentGates(intent, authority);

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
      ownershipProven: gates.ownershipProven,
      readEvidencePresent: gates.readEvidencePresent,
      sourceStale: intent.sourceStale ?? false,
      prerequisiteMissing: gates.prerequisiteMissing,
      prerequisiteConflict: intent.prerequisiteConflict ?? false,
      policies: authority.policies,
      grants: authority.grants,
    });

    if (!evaluation.decision.allowed) {
      effectState = transition(effectState, EffectState.QUARANTINED);
      const deniedReason =
        evaluation.decision.allowed === false
          ? `${evaluation.decision.reason}${
              gates.details.length > 0 ? ` | ${gates.details.join("; ")}` : ""
            }`
          : "Denied";
      const denied: GatewayDecisionRecord = {
        decisionId: `dec-${randomBytes(6).toString("hex")}`,
        operationId: intent.operationId,
        payloadDigest,
        allowed: false,
        code: evaluation.decision.allowed === false ? evaluation.decision.code : null,
        reason: deniedReason,
        grantId: evaluation.match?.grant.grantId ?? null,
        policyId: evaluation.match?.policy.policyId ?? null,
        decidedAtIso: authority.nowIso,
        effectState,
        outcome: "DENIED",
        writePathId: gates.writePathId,
        gateDetails: gates.details,
      };
      decisions.set(intent.operationId, denied);
      return { decision: denied, evaluation };
    }

    effectState = transition(effectState, EffectState.AUTHORIZED);
    effectState = transition(effectState, EffectState.APPLYING);
    // Stub apply: record provider acceptance only — not verified environment evidence.
    ledger.settle(intent.operationId, "ACCEPTED_PENDING");
    effectState = transition(effectState, EffectState.VERIFYING);

    const requiresGates = actionClassRequiresPilotWriteGates(intent.actionClass);
    const acceptedReason = requiresGates
      ? "Authorized by standing grant with proven ownership and read evidence; stub apply accepted pending verification"
      : "Authorized by standing grant; observe/create skipped pilot ownership/read-evidence gates; stub apply accepted pending verification";

    const accepted: GatewayDecisionRecord = {
      decisionId: `dec-${randomBytes(6).toString("hex")}`,
      operationId: intent.operationId,
      payloadDigest,
      allowed: true,
      code: null,
      reason: acceptedReason,
      grantId: evaluation.match?.grant.grantId ?? null,
      policyId: evaluation.match?.policy.policyId ?? null,
      decidedAtIso: authority.nowIso,
      effectState,
      outcome: "ACCEPTED_PENDING",
      writePathId: gates.writePathId,
      gateDetails: gates.details,
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
