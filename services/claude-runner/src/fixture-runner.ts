/**
 * Offline/fixture role evaluations when Claude CLI is unavailable.
 * Deterministic — no network, no uncontrolled recursion.
 */

import {
  AGENT_ROLE_IDS,
  getAgentRoleContract,
  proposeEffect,
  validateTypedDelegation,
  type AgentRoleId,
  type EffectProposal,
  type RoleStructuredOutput,
  type TypedTaskRequest,
} from "@worksocial/domain";
import type { JobEnvelope } from "@worksocial/contracts";

export type FixtureRunInput = {
  envelope: JobEnvelope;
  /** Simulated unauthorized effect attempt for contract tests. */
  attemptUnauthorizedEffect?: boolean | undefined;
  /** Simulated self-approval attempt for contract tests. */
  attemptSelfApproval?: boolean | undefined;
  /** Simulated uncontrolled recursion attempt for contract tests. */
  attemptUncontrolledRecursion?: boolean | undefined;
};

export type FixtureRunResult = {
  output: RoleStructuredOutput;
  deniedEffects: Array<{ code: string; reason: string }>;
  deniedDelegations: Array<{ code: string; reason: string }>;
};

export function runRoleFixture(input: FixtureRunInput): FixtureRunResult {
  const roleId = input.envelope.roleId as AgentRoleId;
  const contract = getAgentRoleContract(roleId);
  const deniedEffects: Array<{ code: string; reason: string }> = [];
  const deniedDelegations: Array<{ code: string; reason: string }> = [];
  const proposedEffects: EffectProposal[] = [];
  const taskRequests: TypedTaskRequest[] = [];

  if (input.attemptUnauthorizedEffect) {
    const decision = proposeEffect({
      proposalId: `fixture-unauth-${input.envelope.jobId}`,
      authorRoleId: roleId,
      actionClass: "access_or_policy_change",
      operation: "bypass_gateway",
      assetId: input.envelope.assetId,
      channelId: "unauthorized",
      payloadDigest: "fixture",
      evidenceArtifactIds: [],
      selfApprovalAttempted: false,
    });
    if (!decision.ok) {
      deniedEffects.push({ code: decision.code, reason: decision.reason });
    }
  }

  if (input.attemptSelfApproval) {
    const decision = proposeEffect({
      proposalId: `fixture-self-${input.envelope.jobId}`,
      authorRoleId: roleId,
      actionClass: "routine_publish",
      operation: "publish_page",
      assetId: input.envelope.assetId,
      channelId: "owned-site",
      payloadDigest: "fixture",
      evidenceArtifactIds: input.envelope.inputArtifactIds,
      selfApprovalAttempted: true,
    });
    if (!decision.ok) {
      deniedEffects.push({ code: decision.code, reason: decision.reason });
    }
  }

  if (input.attemptUncontrolledRecursion) {
    const decision = validateTypedDelegation({
      requestId: `fixture-recur-${input.envelope.jobId}`,
      fromRoleId: roleId,
      toRoleId: roleId === "A01" ? "A13" : "A01",
      objective: "unbounded improve everything",
      inputArtifactIds: [],
      parentDepth: 99,
    });
    if (!decision.ok) {
      deniedDelegations.push({ code: decision.code, reason: decision.reason });
    }
  }

  // Happy-path fixture: observe/plan roles succeed; write roles emit a reviewable proposal when allowed.
  if (contract.approvedTools.includes("write_proposal") && !input.attemptSelfApproval) {
    const proposal: EffectProposal = {
      proposalId: `fixture-prop-${input.envelope.jobId}`,
      authorRoleId: roleId,
      actionClass: "create",
      operation: "stage_artifact",
      assetId: input.envelope.assetId,
      channelId: "local-artifact",
      payloadDigest: `fixture-${roleId}`,
      evidenceArtifactIds: [...input.envelope.inputArtifactIds],
    };
    const decision = proposeEffect(proposal);
    if (decision.ok) {
      proposedEffects.push(proposal);
    } else {
      deniedEffects.push({ code: decision.code, reason: decision.reason });
    }
  }

  if (
    contract.approvedTools.includes("task_request") &&
    !input.attemptUncontrolledRecursion
  ) {
    const target: AgentRoleId = roleId === "A01" ? "A12" : "A25";
    if (target !== roleId) {
      const request: TypedTaskRequest = {
        requestId: `fixture-task-${input.envelope.jobId}`,
        fromRoleId: roleId,
        toRoleId: target,
        objective: `fixture follow-up for ${roleId}`,
        inputArtifactIds: [...input.envelope.inputArtifactIds],
        parentDepth: 0,
      };
      const decision = validateTypedDelegation(request);
      if (decision.ok) {
        taskRequests.push(request);
      } else {
        deniedDelegations.push({ code: decision.code, reason: decision.reason });
      }
    }
  }

  const hasDenials = deniedEffects.length > 0 || deniedDelegations.length > 0;
  const output: RoleStructuredOutput = {
    roleId,
    jobId: input.envelope.jobId,
    status: hasDenials && (input.attemptUnauthorizedEffect || input.attemptSelfApproval)
      ? "error"
      : proposedEffects.length > 0
        ? "needs_review"
        : "ok",
    summary: `Fixture evaluation for ${roleId} (${contract.evaluationSuiteId})`,
    artifactIds: [
      `fixture/${roleId}/${input.envelope.jobId}.json`,
      ...input.envelope.inputArtifactIds,
    ],
    proposedEffects,
    taskRequests,
    modelConfidence: null,
  };

  return { output, deniedEffects, deniedDelegations };
}

/** Run offline evaluation suite for all 30 roles. */
export function runAllRoleFixtureEvaluations(
  makeEnvelope: (roleId: AgentRoleId) => JobEnvelope,
): Array<{ roleId: AgentRoleId; result: FixtureRunResult }> {
  return AGENT_ROLE_IDS.map((roleId) => ({
    roleId,
    result: runRoleFixture({ envelope: makeEnvelope(roleId) }),
  }));
}
