/**
 * Role runtime gates for R1-04: independent review, bounded delegation,
 * and durable SUCCESS/FAILURE outcome hooks (learning-worker compatible).
 * Pure — no CLI, network, or Node process APIs.
 */

import {
  getAgentRoleContract,
  isAgentRoleId,
  roleAllowsTool,
  type AgentRoleId,
  RoleToolClass,
} from "./agent-roles.js";
import { OutcomeLabel, type OutcomeLabelValue } from "./production-mapping.js";

/** Max typed delegation depth for Release 1 — no free-form nested subagents. */
export const MAX_DELEGATION_DEPTH = 2;

export const RoleRunStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  DENIED: "denied",
  TIMED_OUT: "timed_out",
  BUDGET_EXHAUSTED: "budget_exhausted",
  AWAITING_REVIEW: "awaiting_review",
} as const;

export type RoleRunStatusValue =
  (typeof RoleRunStatus)[keyof typeof RoleRunStatus];

export const RoleExecutionMode = {
  /** Live Claude Code CLI when executable is present and pinned. */
  LIVE_CLI: "live_cli",
  /** Deterministic offline fixture path when CLI is absent or forced. */
  FIXTURE: "fixture",
} as const;

export type RoleExecutionModeValue =
  (typeof RoleExecutionMode)[keyof typeof RoleExecutionMode];

export type TypedTaskRequest = {
  requestId: string;
  fromRoleId: AgentRoleId;
  toRoleId: AgentRoleId;
  objective: string;
  inputArtifactIds: readonly string[];
  /** Depth of the parent job that emitted this request (0 = root). */
  parentDepth: number;
};

export type EffectProposal = {
  proposalId: string;
  authorRoleId: AgentRoleId;
  actionClass: string;
  operation: string;
  assetId: string;
  channelId: string;
  payloadDigest: string;
  evidenceArtifactIds: readonly string[];
  /** Set when the author also attempted to approve — must be rejected. */
  selfApprovalAttempted?: boolean;
};

export type ReviewVerdict = {
  verdictId: string;
  proposalId: string;
  reviewerRoleId: AgentRoleId;
  authorRoleId: AgentRoleId;
  approved: boolean;
  reason: string;
  decidedAtIso: string;
};

export type RoleRunOutcomeEvidence = {
  outcomeId: string;
  roleId: AgentRoleId;
  jobId: string;
  runId: string;
  label: OutcomeLabelValue;
  status: RoleRunStatusValue;
  executionMode: RoleExecutionModeValue;
  reason: string;
  artifactIds: readonly string[];
  costMinor: number;
  recordedAtIso: string;
  /** Compatible with later learning-worker feature extraction. */
  featureHints: Readonly<Record<string, string | number | boolean>>;
};

export type DelegationDecision =
  | { ok: true; request: TypedTaskRequest; nextDepth: number }
  | {
      ok: false;
      code:
        | "UNCONTROLLED_RECURSION"
        | "ROLE_UNKNOWN"
        | "TOOL_DENIED"
        | "SELF_DELEGATION"
        | "FANOUT_EXCEEDED";
      reason: string;
    };

export type ReviewGateDecision =
  | { ok: true; requiresReview: true; reviewerRoleId: AgentRoleId }
  | { ok: true; requiresReview: false; reason: string }
  | {
      ok: false;
      code:
        | "SELF_APPROVAL_FORBIDDEN"
        | "REVIEWER_CANNOT_AUTHOR_SAME"
        | "REVIEWER_UNAUTHORIZED"
        | "AUTHOR_UNKNOWN";
      reason: string;
    };

export type EffectProposalDecision =
  | { ok: true; proposal: EffectProposal; review: ReviewGateDecision }
  | {
      ok: false;
      code: "FORBIDDEN_EFFECT" | "TOOL_DENIED" | "SELF_APPROVAL_FORBIDDEN";
      reason: string;
    };

/**
 * Validates a typed task request. Free-form / nested CLI subagent recursion
 * is out of scope — only scheduler-validated typed requests are allowed.
 */
export function validateTypedDelegation(
  request: TypedTaskRequest,
  options?: { currentFanout?: number },
): DelegationDecision {
  if (!isAgentRoleId(request.fromRoleId) || !isAgentRoleId(request.toRoleId)) {
    return {
      ok: false,
      code: "ROLE_UNKNOWN",
      reason: "fromRoleId and toRoleId must be registered A01–A30 roles",
    };
  }
  if (request.fromRoleId === request.toRoleId) {
    return {
      ok: false,
      code: "SELF_DELEGATION",
      reason: "A role cannot recursively delegate to itself",
    };
  }
  if (!roleAllowsTool(request.fromRoleId, RoleToolClass.TASK_REQUEST)) {
    return {
      ok: false,
      code: "TOOL_DENIED",
      reason: `${request.fromRoleId} is not approved to emit task requests`,
    };
  }
  if (request.parentDepth >= MAX_DELEGATION_DEPTH) {
    return {
      ok: false,
      code: "UNCONTROLLED_RECURSION",
      reason: `Delegation depth ${request.parentDepth} exceeds max ${MAX_DELEGATION_DEPTH}`,
    };
  }
  const from = getAgentRoleContract(request.fromRoleId);
  const fanout = options?.currentFanout ?? 0;
  if (fanout >= from.resourceLimits.maxDelegationFanout) {
    return {
      ok: false,
      code: "FANOUT_EXCEEDED",
      reason: `${request.fromRoleId} exceeded maxDelegationFanout ${from.resourceLimits.maxDelegationFanout}`,
    };
  }
  return {
    ok: true,
    request,
    nextDepth: request.parentDepth + 1,
  };
}

/**
 * Independent review gate: author cannot self-approve; A25 cannot review its
 * own authorship. External effects still require gateway + grants (R1-02/R1-03).
 */
export function evaluateIndependentReviewGate(input: {
  proposal: EffectProposal;
  reviewerRoleId?: AgentRoleId | null;
}): ReviewGateDecision {
  if (!isAgentRoleId(input.proposal.authorRoleId)) {
    return {
      ok: false,
      code: "AUTHOR_UNKNOWN",
      reason: "Author role is not a registered agent role",
    };
  }

  if (input.proposal.selfApprovalAttempted) {
    return {
      ok: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      reason: "Author role cannot self-approve effects",
    };
  }

  const author = getAgentRoleContract(input.proposal.authorRoleId);
  const reviewerRoleId =
    input.reviewerRoleId ?? author.independentReviewerRoleId;

  if (reviewerRoleId === input.proposal.authorRoleId) {
    return {
      ok: false,
      code: "REVIEWER_CANNOT_AUTHOR_SAME",
      reason:
        "The same specialist cannot author a change and issue its independent approval",
    };
  }

  const reviewer = getAgentRoleContract(reviewerRoleId);
  if (!reviewer.mayIssueReviewVerdicts) {
    return {
      ok: false,
      code: "REVIEWER_UNAUTHORIZED",
      reason: `${reviewerRoleId} is not permitted to issue review verdicts`,
    };
  }

  if (!roleAllowsTool(reviewerRoleId, RoleToolClass.REVIEW_VERDICT)) {
    return {
      ok: false,
      code: "REVIEWER_UNAUTHORIZED",
      reason: `${reviewerRoleId} lacks review_verdict tool approval`,
    };
  }

  return {
    ok: true,
    requiresReview: true,
    reviewerRoleId,
  };
}

/**
 * Authoring roles propose effects; they never apply them. Forbidden effects
 * and self-approval attempts are denied here before gateway submission.
 */
export function proposeEffect(
  proposal: EffectProposal,
  options?: { reviewerRoleId?: AgentRoleId | null },
): EffectProposalDecision {
  if (proposal.selfApprovalAttempted) {
    return {
      ok: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      reason: `${proposal.authorRoleId} cannot self-approve effects`,
    };
  }

  // Absolute denials for every reasoning role — never solvable by CLI flags.
  const absoluteForbidden = [
    "bypass_gateway",
    "credential_access",
    "unrestricted_shell",
  ] as const;
  for (const effect of absoluteForbidden) {
    if (
      proposal.operation === effect ||
      proposal.actionClass === effect ||
      proposal.operation.includes(effect)
    ) {
      return {
        ok: false,
        code: "FORBIDDEN_EFFECT",
        reason: `${proposal.authorRoleId} cannot perform absolute-forbidden effect '${effect}'`,
      };
    }
  }
  for (const effect of getAgentRoleContract(proposal.authorRoleId)
    .forbiddenEffects) {
    if (proposal.operation === effect) {
      return {
        ok: false,
        code: "FORBIDDEN_EFFECT",
        reason: `${proposal.authorRoleId} forbids effect '${effect}'`,
      };
    }
  }

  if (!roleAllowsTool(proposal.authorRoleId, RoleToolClass.WRITE_PROPOSAL)) {
    return {
      ok: false,
      code: "TOOL_DENIED",
      reason: `${proposal.authorRoleId} cannot emit write proposals`,
    };
  }

  const review =
    options?.reviewerRoleId !== undefined
      ? evaluateIndependentReviewGate({
          proposal,
          reviewerRoleId: options.reviewerRoleId,
        })
      : evaluateIndependentReviewGate({ proposal });
  if (!review.ok) {
    return {
      ok: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      reason: review.reason,
    };
  }

  return { ok: true, proposal, review };
}

export function acceptReviewVerdict(input: {
  proposal: EffectProposal;
  verdict: ReviewVerdict;
}):
  | { ok: true; verdict: ReviewVerdict }
  | { ok: false; code: string; reason: string } {
  if (input.verdict.authorRoleId !== input.proposal.authorRoleId) {
    return {
      ok: false,
      code: "AUTHOR_MISMATCH",
      reason: "Verdict authorRoleId does not match proposal author",
    };
  }
  if (input.verdict.proposalId !== input.proposal.proposalId) {
    return {
      ok: false,
      code: "PROPOSAL_MISMATCH",
      reason: "Verdict proposalId does not match proposal",
    };
  }
  if (input.verdict.reviewerRoleId === input.proposal.authorRoleId) {
    return {
      ok: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      reason: "Reviewer cannot be the author",
    };
  }
  const gate = evaluateIndependentReviewGate({
    proposal: input.proposal,
    reviewerRoleId: input.verdict.reviewerRoleId,
  });
  if (!gate.ok) {
    return { ok: false, code: gate.code, reason: gate.reason };
  }
  return { ok: true, verdict: input.verdict };
}

export function createRoleRunOutcome(input: {
  outcomeId: string;
  roleId: AgentRoleId;
  jobId: string;
  runId: string;
  label: OutcomeLabelValue;
  status: RoleRunStatusValue;
  executionMode: RoleExecutionModeValue;
  reason: string;
  artifactIds?: readonly string[];
  costMinor?: number;
  recordedAtIso: string;
  featureHints?: Readonly<Record<string, string | number | boolean>>;
}): RoleRunOutcomeEvidence {
  if (input.label !== OutcomeLabel.SUCCESS && input.label !== OutcomeLabel.FAILURE) {
    throw new Error("Role outcomes must be SUCCESS or FAILURE labels");
  }
  return {
    outcomeId: input.outcomeId,
    roleId: input.roleId,
    jobId: input.jobId,
    runId: input.runId,
    label: input.label,
    status: input.status,
    executionMode: input.executionMode,
    reason: input.reason,
    artifactIds: input.artifactIds ?? [],
    costMinor: input.costMinor ?? 0,
    recordedAtIso: input.recordedAtIso,
    featureHints: input.featureHints ?? {},
  };
}

export function listRoleOutcomesForLearning(
  outcomes: readonly RoleRunOutcomeEvidence[],
): readonly RoleRunOutcomeEvidence[] {
  return outcomes.filter(
    (o) =>
      o.label === OutcomeLabel.SUCCESS || o.label === OutcomeLabel.FAILURE,
  );
}

/** Structured role output schema expectations (validated by claude-runner). */
export type RoleStructuredOutput = {
  roleId: AgentRoleId;
  jobId: string;
  status: "ok" | "error" | "needs_review";
  summary: string;
  artifactIds: string[];
  proposedEffects: EffectProposal[];
  taskRequests: TypedTaskRequest[];
  /** Never treat model self-confidence as authorization. */
  modelConfidence: number | null;
};

export function validateRoleStructuredOutput(
  value: unknown,
):
  | { ok: true; output: RoleStructuredOutput }
  | { ok: false; code: string; reason: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, code: "INVALID_OUTPUT", reason: "Output must be an object" };
  }
  const v = value as Record<string, unknown>;
  if (typeof v.roleId !== "string" || !isAgentRoleId(v.roleId)) {
    return { ok: false, code: "INVALID_ROLE", reason: "roleId must be A01–A30" };
  }
  if (typeof v.jobId !== "string" || v.jobId.length < 1) {
    return { ok: false, code: "INVALID_JOB", reason: "jobId required" };
  }
  if (v.status !== "ok" && v.status !== "error" && v.status !== "needs_review") {
    return { ok: false, code: "INVALID_STATUS", reason: "status must be ok|error|needs_review" };
  }
  if (typeof v.summary !== "string") {
    return { ok: false, code: "INVALID_SUMMARY", reason: "summary must be a string" };
  }
  const artifactIds = Array.isArray(v.artifactIds)
    ? v.artifactIds.filter((x): x is string => typeof x === "string")
    : [];
  const proposedEffects = Array.isArray(v.proposedEffects)
    ? (v.proposedEffects as EffectProposal[])
    : [];
  const taskRequests = Array.isArray(v.taskRequests)
    ? (v.taskRequests as TypedTaskRequest[])
    : [];
  const modelConfidence =
    typeof v.modelConfidence === "number" ? v.modelConfidence : null;

  return {
    ok: true,
    output: {
      roleId: v.roleId,
      jobId: v.jobId,
      status: v.status,
      summary: v.summary,
      artifactIds,
      proposedEffects,
      taskRequests,
      modelConfidence,
    },
  };
}
