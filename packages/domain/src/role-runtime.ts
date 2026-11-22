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

/**
 * How costMinor was obtained (F07). Invented placeholders must never look like ACTUAL.
 */
export const CostRecordingKind = {
  /** Parsed from provider/CLI usage fields. */
  ACTUAL: "actual",
  /** Explicitly labeled estimate — not observed usage. */
  ESTIMATE: "estimate",
  /** No usable usage; costMinor is 0 / unset and must not be treated as spend. */
  UNKNOWN: "unknown",
  /** Deterministic fixture accounting — never production spend. */
  FIXTURE: "fixture",
} as const;

export type CostRecordingKindValue =
  (typeof CostRecordingKind)[keyof typeof CostRecordingKind];

export type ParsedUsageCost = {
  costMinor: number;
  costKind: CostRecordingKindValue;
  /** Present when usage tokens/cost fields were found. */
  usageSource: "cli_json" | "none" | "fixture" | "estimate_labeled";
  detail: string;
};

/**
 * Parse usage/cost from Claude CLI JSON stdout when present.
 * Never invents 25/50/75 as actual spend.
 */
export function parseClaudeUsageCost(input: {
  stdout?: string | null;
  executionMode: RoleExecutionModeValue;
  /** Optional explicit estimate when live usage is absent — must be labeled. */
  estimateMinor?: number;
}): ParsedUsageCost {
  if (input.executionMode === RoleExecutionMode.FIXTURE) {
    return {
      costMinor: 0,
      costKind: CostRecordingKind.FIXTURE,
      usageSource: "fixture",
      detail: "Fixture mode — no provider usage; costMinor=0 (not production spend)",
    };
  }

  const raw = input.stdout?.trim() ?? "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const usage =
        (parsed.usage as Record<string, unknown> | undefined) ??
        (parsed.result &&
        typeof parsed.result === "object" &&
        parsed.result !== null
          ? ((parsed.result as Record<string, unknown>).usage as
              | Record<string, unknown>
              | undefined)
          : undefined);

      const totalCostUsd =
        typeof parsed.total_cost_usd === "number"
          ? parsed.total_cost_usd
          : typeof usage?.total_cost_usd === "number"
            ? usage.total_cost_usd
            : typeof parsed.cost_usd === "number"
              ? parsed.cost_usd
              : null;

      if (totalCostUsd !== null && Number.isFinite(totalCostUsd)) {
        return {
          costMinor: Math.max(0, Math.round(totalCostUsd * 100)),
          costKind: CostRecordingKind.ACTUAL,
          usageSource: "cli_json",
          detail: `Parsed total_cost_usd=${totalCostUsd}`,
        };
      }

      const inputTokens =
        typeof usage?.input_tokens === "number"
          ? usage.input_tokens
          : typeof usage?.inputTokens === "number"
            ? usage.inputTokens
            : null;
      const outputTokens =
        typeof usage?.output_tokens === "number"
          ? usage.output_tokens
          : typeof usage?.outputTokens === "number"
            ? usage.outputTokens
            : null;
      if (inputTokens !== null || outputTokens !== null) {
        return {
          costMinor: 0,
          costKind: CostRecordingKind.UNKNOWN,
          usageSource: "cli_json",
          detail: `Usage tokens present (in=${inputTokens ?? "n/a"}, out=${outputTokens ?? "n/a"}) but no cost_usd — recorded unknown, not an invented amount`,
        };
      }
    } catch {
      // fall through to unknown / estimate
    }
  }

  if (
    typeof input.estimateMinor === "number" &&
    Number.isFinite(input.estimateMinor) &&
    input.estimateMinor >= 0
  ) {
    return {
      costMinor: Math.round(input.estimateMinor),
      costKind: CostRecordingKind.ESTIMATE,
      usageSource: "estimate_labeled",
      detail: "No parseable usage; estimateMinor recorded as labeled ESTIMATE (not ACTUAL)",
    };
  }

  return {
    costMinor: 0,
    costKind: CostRecordingKind.UNKNOWN,
    usageSource: "none",
    detail: "No usage fields and no labeled estimate — cost unknown",
  };
}

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
  /** How costMinor was obtained — ACTUAL only when usage was parsed. */
  costKind: CostRecordingKindValue;
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
  costKind?: CostRecordingKindValue;
  recordedAtIso: string;
  featureHints?: Readonly<Record<string, string | number | boolean>>;
}): RoleRunOutcomeEvidence {
  if (input.label !== OutcomeLabel.SUCCESS && input.label !== OutcomeLabel.FAILURE) {
    throw new Error("Role outcomes must be SUCCESS or FAILURE labels");
  }
  const costKind =
    input.costKind ??
    (input.executionMode === RoleExecutionMode.FIXTURE
      ? CostRecordingKind.FIXTURE
      : CostRecordingKind.UNKNOWN);
  const costMinor = input.costMinor ?? 0;
  if (
    costKind === CostRecordingKind.ACTUAL &&
    !(Number.isFinite(costMinor) && costMinor >= 0)
  ) {
    throw new Error("ACTUAL cost requires a finite non-negative costMinor");
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
    costMinor,
    costKind,
    recordedAtIso: input.recordedAtIso,
    featureHints: {
      ...(input.featureHints ?? {}),
      costKind,
    },
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

export type ValidateRoleOutputOptions = {
  /** When set, output.roleId must equal this envelope role. */
  expectedRoleId?: AgentRoleId;
  /** When set, output.jobId must equal this envelope job. */
  expectedJobId?: string;
};

function parseEffectProposal(
  value: unknown,
  expectedAuthorRoleId: AgentRoleId,
):
  | { ok: true; proposal: EffectProposal }
  | { ok: false; code: string; reason: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "proposedEffect must be an object" };
  }
  const p = value as Record<string, unknown>;
  if (typeof p.proposalId !== "string" || p.proposalId.length < 1) {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "proposalId required" };
  }
  if (typeof p.authorRoleId !== "string" || !isAgentRoleId(p.authorRoleId)) {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "authorRoleId must be A01–A30" };
  }
  if (p.authorRoleId !== expectedAuthorRoleId) {
    return {
      ok: false,
      code: "AUTHOR_MISMATCH",
      reason: `proposal authorRoleId ${p.authorRoleId} must equal job role ${expectedAuthorRoleId}`,
    };
  }
  if (typeof p.actionClass !== "string" || p.actionClass.length < 1) {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "actionClass required" };
  }
  if (typeof p.operation !== "string" || p.operation.length < 1) {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "operation required" };
  }
  if (typeof p.assetId !== "string" || p.assetId.length < 1) {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "assetId required" };
  }
  if (typeof p.channelId !== "string" || p.channelId.length < 1) {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "channelId required" };
  }
  if (typeof p.payloadDigest !== "string") {
    return { ok: false, code: "INVALID_PROPOSAL", reason: "payloadDigest required" };
  }
  const evidenceArtifactIds = Array.isArray(p.evidenceArtifactIds)
    ? p.evidenceArtifactIds.filter((x): x is string => typeof x === "string")
    : [];
  const proposal: EffectProposal = {
    proposalId: p.proposalId,
    authorRoleId: p.authorRoleId,
    actionClass: p.actionClass,
    operation: p.operation,
    assetId: p.assetId,
    channelId: p.channelId,
    payloadDigest: p.payloadDigest,
    evidenceArtifactIds,
  };
  if (p.selfApprovalAttempted === true) {
    proposal.selfApprovalAttempted = true;
  }
  return { ok: true, proposal };
}

function parseTypedTaskRequest(
  value: unknown,
  expectedFromRoleId: AgentRoleId,
):
  | { ok: true; request: TypedTaskRequest }
  | { ok: false; code: string; reason: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, code: "INVALID_TASK", reason: "taskRequest must be an object" };
  }
  const t = value as Record<string, unknown>;
  if (typeof t.requestId !== "string" || t.requestId.length < 1) {
    return { ok: false, code: "INVALID_TASK", reason: "requestId required" };
  }
  if (typeof t.fromRoleId !== "string" || !isAgentRoleId(t.fromRoleId)) {
    return { ok: false, code: "INVALID_TASK", reason: "fromRoleId must be A01–A30" };
  }
  if (t.fromRoleId !== expectedFromRoleId) {
    return {
      ok: false,
      code: "FROM_ROLE_MISMATCH",
      reason: `task fromRoleId ${t.fromRoleId} must equal job role ${expectedFromRoleId}`,
    };
  }
  if (typeof t.toRoleId !== "string" || !isAgentRoleId(t.toRoleId)) {
    return { ok: false, code: "INVALID_TASK", reason: "toRoleId must be A01–A30" };
  }
  if (typeof t.objective !== "string" || t.objective.length < 1) {
    return { ok: false, code: "INVALID_TASK", reason: "objective required" };
  }
  if (typeof t.parentDepth !== "number" || !Number.isInteger(t.parentDepth) || t.parentDepth < 0) {
    return { ok: false, code: "INVALID_TASK", reason: "parentDepth must be a non-negative integer" };
  }
  const inputArtifactIds = Array.isArray(t.inputArtifactIds)
    ? t.inputArtifactIds.filter((x): x is string => typeof x === "string")
    : [];
  return {
    ok: true,
    request: {
      requestId: t.requestId,
      fromRoleId: t.fromRoleId,
      toRoleId: t.toRoleId,
      objective: t.objective,
      inputArtifactIds,
      parentDepth: t.parentDepth,
    },
  };
}

/**
 * Classify Claude Code CLI completion from exit code + stdout.
 * Claude may exit 0 while `--output-format json` sets `is_error: true`
 * (or subtype/type "error"). That must fail the job — never treat as success.
 * Pure — no spawn/network.
 */
export type ClaudeCliCompletionClassification =
  | { ok: true; jobShouldFail: false }
  | {
      ok: false;
      code: "NONZERO_EXIT" | "CLI_REPORTED_ERROR";
      reason: string;
      jobShouldFail: true;
      exitCode: number;
    };

export function classifyClaudeCliCompletion(input: {
  exitCode: number | null;
  stdout: string;
  stderr?: string;
}): ClaudeCliCompletionClassification {
  const exitCode = input.exitCode ?? 0;
  if (exitCode !== 0) {
    return {
      ok: false,
      code: "NONZERO_EXIT",
      reason: `CLI exited with code ${exitCode}`,
      jobShouldFail: true,
      exitCode,
    };
  }

  const raw = input.stdout.trim();
  if (!raw) {
    return { ok: true, jobShouldFail: false };
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed.is_error === true) {
      const detail =
        typeof parsed.result === "string" && parsed.result.trim().length > 0
          ? parsed.result.trim().slice(0, 240)
          : typeof parsed.error === "string" && parsed.error.trim().length > 0
            ? parsed.error.trim().slice(0, 240)
            : "is_error=true";
      return {
        ok: false,
        code: "CLI_REPORTED_ERROR",
        reason: `CLI error despite exit 0: ${detail}`,
        jobShouldFail: true,
        exitCode: 0,
      };
    }
    if (parsed.subtype === "error" || parsed.type === "error") {
      return {
        ok: false,
        code: "CLI_REPORTED_ERROR",
        reason: "CLI error subtype/type despite exit 0",
        jobShouldFail: true,
        exitCode: 0,
      };
    }
  } catch {
    // Non-JSON stdout with exit 0 — leave to structured-output validation.
  }

  return { ok: true, jobShouldFail: false };
}

/** Map CLI completion classification to role-run status (job fails on CLI error). */
export function roleRunStatusForClaudeCliCompletion(
  classification: ClaudeCliCompletionClassification,
): RoleRunStatusValue {
  if (classification.ok) {
    return RoleRunStatus.SUCCEEDED;
  }
  if (classification.code === "NONZERO_EXIT") {
    return RoleRunStatus.FAILED;
  }
  return RoleRunStatus.FAILED;
}

/**
 * Unwrap Claude Code `--output-format json` envelope when present.
 * Live CLI returns `{ result: "<json-or-text>", ... }` rather than the model object alone.
 */
export function unwrapClaudeJsonPayload(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }
  const envelope = value as Record<string, unknown>;
  if (!("result" in envelope)) {
    return value;
  }
  const result = envelope.result;
  if (typeof result === "string") {
    const trimmed = result.trim();
    if (!trimmed) {
      return value;
    }
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      // Model returned plain text inside result — leave as string for validator to reject.
      return result;
    }
  }
  if (result && typeof result === "object") {
    return result;
  }
  return value;
}

export function validateRoleStructuredOutput(
  value: unknown,
  options?: ValidateRoleOutputOptions,
):
  | { ok: true; output: RoleStructuredOutput }
  | { ok: false; code: string; reason: string } {
  const unwrapped = unwrapClaudeJsonPayload(value);
  if (!unwrapped || typeof unwrapped !== "object") {
    return { ok: false, code: "INVALID_OUTPUT", reason: "Output must be an object" };
  }
  const v = unwrapped as Record<string, unknown>;
  if (typeof v.roleId !== "string" || !isAgentRoleId(v.roleId)) {
    return { ok: false, code: "INVALID_ROLE", reason: "roleId must be A01–A30" };
  }
  if (options?.expectedRoleId !== undefined && v.roleId !== options.expectedRoleId) {
    return {
      ok: false,
      code: "ROLE_MISMATCH",
      reason: `output roleId ${v.roleId} does not match job role ${options.expectedRoleId}`,
    };
  }
  if (typeof v.jobId !== "string" || v.jobId.length < 1) {
    return { ok: false, code: "INVALID_JOB", reason: "jobId required" };
  }
  if (options?.expectedJobId !== undefined && v.jobId !== options.expectedJobId) {
    return {
      ok: false,
      code: "JOB_MISMATCH",
      reason: `output jobId does not match envelope jobId`,
    };
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

  const proposedEffects: EffectProposal[] = [];
  if (v.proposedEffects !== undefined) {
    if (!Array.isArray(v.proposedEffects)) {
      return {
        ok: false,
        code: "INVALID_PROPOSALS",
        reason: "proposedEffects must be an array",
      };
    }
    for (const raw of v.proposedEffects) {
      const parsed = parseEffectProposal(raw, v.roleId);
      if (!parsed.ok) {
        return parsed;
      }
      proposedEffects.push(parsed.proposal);
    }
  }

  const taskRequests: TypedTaskRequest[] = [];
  if (v.taskRequests !== undefined) {
    if (!Array.isArray(v.taskRequests)) {
      return {
        ok: false,
        code: "INVALID_TASKS",
        reason: "taskRequests must be an array",
      };
    }
    for (const raw of v.taskRequests) {
      const parsed = parseTypedTaskRequest(raw, v.roleId);
      if (!parsed.ok) {
        return parsed;
      }
      taskRequests.push(parsed.request);
    }
  }

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
