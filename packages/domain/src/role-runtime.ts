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
  // secret_exfiltration / broker_secret_read close T-X063 indirect injection.
  const absoluteForbidden = [
    "bypass_gateway",
    "credential_access",
    "secret_exfiltration",
    "broker_secret_read",
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
 * Pure — no spawn/network. Live CLI wiring stays NOT_WIRED (T-X009).
 */
export type ClaudeCliCompletionClassification =
  | { ok: true; jobShouldFail: false; externalEffects: "NONE" }
  | {
      ok: false;
      code: "NONZERO_EXIT" | "CLI_REPORTED_ERROR";
      reason: string;
      jobShouldFail: true;
      exitCode: number;
      externalEffects: "NONE";
    };

/** Live Claude CLI fleet remains unwired in fixture soak (T-X009). */
export function claudeCliLiveWiringStatus(): "NOT_WIRED" {
  return "NOT_WIRED";
}

/**
 * Fail-closed is_error signal: boolean true, integer 1, or trimmed
 * case-insensitive "true" / "1". Never invent success from ambiguous truthy junk.
 */
export function cliReportsIsError(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1";
  }
  return false;
}

function cliReportsErrorLabel(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === "error" || normalized.startsWith("error_")) return true;
  return (
    normalized === "api_error" || normalized === "error_during_execution"
  );
}

/** status=error|failed|failure (trimmed, case-insensitive). */
function cliReportsFailedStatus(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "error" ||
    normalized === "failed" ||
    normalized === "failure"
  );
}

/** stop_reason / stopReason abort-style labels. */
function cliReportsAbortStopReason(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "error" ||
    normalized === "refusal" ||
    normalized === "aborted" ||
    normalized === "cancelled" ||
    normalized === "canceled"
  );
}

function cliReportsNonzeroEmbeddedExit(value: unknown): boolean {
  if (typeof value === "number" && Number.isFinite(value) && value !== 0) {
    return true;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return false;
    const asNum = Number(trimmed);
    return Number.isFinite(asNum) && asNum !== 0;
  }
  return false;
}

function cliErrorsArrayPresent(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function cliReportsSuccessFalse(value: unknown): boolean {
  if (value === false || value === 0) return true;
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "false";
  }
  return false;
}

function cliErrorFieldPresent(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function asCliStdoutObject(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i -= 1) {
      const el = value[i];
      if (el && typeof el === "object" && !Array.isArray(el)) {
        return el as Record<string, unknown>;
      }
    }
  }
  return null;
}

/** Parse stdout as JSON object, last array element, or last NDJSON line. Strips BOM. */
function parseClaudeCliStdoutJson(
  raw: string,
): Record<string, unknown> | null {
  const stripped = raw.replace(/^\uFEFF/, "").trim();
  try {
    const parsed = JSON.parse(stripped) as unknown;
    const asObject = asCliStdoutObject(parsed);
    if (asObject) return asObject;
  } catch {
    // fall through to NDJSON last-line
  }
  const lines = stripped
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(lines[i]!) as unknown;
      const asObject = asCliStdoutObject(parsed);
      if (asObject) return asObject;
    } catch {
      // try earlier line
    }
  }
  return null;
}

function classifyParsedClaudeCliEnvelope(
  parsed: Record<string, unknown>,
  depth = 0,
): ClaudeCliCompletionClassification | null {
  if (
    cliReportsIsError(parsed.is_error) ||
    cliReportsIsError(parsed.isError)
  ) {
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
      externalEffects: "NONE",
    };
  }
  if (
    cliReportsErrorLabel(parsed.subtype) ||
    cliReportsErrorLabel(parsed.type) ||
    cliReportsFailedStatus(parsed.status)
  ) {
    return {
      ok: false,
      code: "CLI_REPORTED_ERROR",
      reason: "CLI error subtype/type/status despite exit 0",
      jobShouldFail: true,
      exitCode: 0,
      externalEffects: "NONE",
    };
  }
  if (
    cliReportsSuccessFalse(parsed.success) ||
    cliReportsSuccessFalse(parsed.ok)
  ) {
    return {
      ok: false,
      code: "CLI_REPORTED_ERROR",
      reason: "CLI success/ok=false despite exit 0",
      jobShouldFail: true,
      exitCode: 0,
      externalEffects: "NONE",
    };
  }
  if (
    cliReportsIsError(parsed.failed) ||
    cliReportsIsError(parsed.has_error) ||
    cliReportsIsError(parsed.had_error) ||
    cliReportsIsError(parsed.hadError) ||
    cliReportsIsError(parsed.was_error) ||
    cliReportsIsError(parsed.wasError) ||
    cliReportsIsError(parsed.with_error) ||
    cliReportsIsError(parsed.withError) ||
    cliReportsIsError(parsed.errored) ||
    cliReportsIsError(parsed.is_errored) ||
    cliReportsIsError(parsed.isErrored) ||
    cliReportsIsError(parsed.is_failure) ||
    cliReportsIsError(parsed.isFailure) ||
    cliReportsIsError(parsed.is_failed) ||
    cliReportsIsError(parsed.isFailed) ||
    cliReportsIsError(parsed.aborted) ||
    cliReportsIsError(parsed.cancelled) ||
    cliReportsIsError(parsed.canceled)
  ) {
    return {
      ok: false,
      code: "CLI_REPORTED_ERROR",
      reason: "CLI failed/has_error/errored/aborted flag despite exit 0",
      jobShouldFail: true,
      exitCode: 0,
      externalEffects: "NONE",
    };
  }
  if (
    cliReportsAbortStopReason(parsed.stop_reason) ||
    cliReportsAbortStopReason(parsed.stopReason)
  ) {
    return {
      ok: false,
      code: "CLI_REPORTED_ERROR",
      reason: "CLI abort stop_reason despite exit 0",
      jobShouldFail: true,
      exitCode: 0,
      externalEffects: "NONE",
    };
  }
  if (
    cliReportsNonzeroEmbeddedExit(parsed.exit_code) ||
    cliReportsNonzeroEmbeddedExit(parsed.exitCode)
  ) {
    return {
      ok: false,
      code: "CLI_REPORTED_ERROR",
      reason: "CLI embedded nonzero exit_code despite process exit 0",
      jobShouldFail: true,
      exitCode: 0,
      externalEffects: "NONE",
    };
  }
  if (cliErrorsArrayPresent(parsed.errors)) {
    return {
      ok: false,
      code: "CLI_REPORTED_ERROR",
      reason: "CLI errors[] non-empty despite exit 0",
      jobShouldFail: true,
      exitCode: 0,
      externalEffects: "NONE",
    };
  }
  if (
    cliErrorFieldPresent(parsed.error) ||
    cliErrorFieldPresent(parsed.error_code) ||
    cliErrorFieldPresent(parsed.errorCode)
  ) {
    return {
      ok: false,
      code: "CLI_REPORTED_ERROR",
      reason: "CLI error field present despite exit 0",
      jobShouldFail: true,
      exitCode: 0,
      externalEffects: "NONE",
    };
  }
  // Nested result string/object may itself report is_error (poisoned envelope).
  if (depth < 2) {
    if (typeof parsed.result === "string" && parsed.result.trim().length > 0) {
      const nested = parseClaudeCliStdoutJson(parsed.result);
      if (nested) {
        const nestedHit = classifyParsedClaudeCliEnvelope(nested, depth + 1);
        if (nestedHit) return nestedHit;
      }
    } else if (parsed.result && typeof parsed.result === "object") {
      const nestedObj = asCliStdoutObject(parsed.result);
      if (nestedObj) {
        const nestedHit = classifyParsedClaudeCliEnvelope(nestedObj, depth + 1);
        if (nestedHit) return nestedHit;
      }
    }
  }
  return null;
}

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
      externalEffects: "NONE",
    };
  }

  const rawStdout = input.stdout.trim();
  const parsedStdout = rawStdout ? parseClaudeCliStdoutJson(rawStdout) : null;
  if (parsedStdout) {
    const hit = classifyParsedClaudeCliEnvelope(parsedStdout);
    if (hit) return hit;
    // Parsed clean success envelope — do not fail on stderr chatter.
    return { ok: true, jobShouldFail: false, externalEffects: "NONE" };
  }

  // Empty/unparseable stdout: fail-closed on structured stderr error signals.
  const rawStderr = (input.stderr ?? "").trim();
  if (rawStderr) {
    const parsedStderr = parseClaudeCliStdoutJson(rawStderr);
    if (parsedStderr) {
      const hit = classifyParsedClaudeCliEnvelope(parsedStderr);
      if (hit) return hit;
    }
  }

  return { ok: true, jobShouldFail: false, externalEffects: "NONE" };
}

/**
 * Map CLI completion classification to role-run status (job fails on CLI error).
 * Never invent SUCCEEDED when the classifier says the job must fail (T-X009).
 */
export function roleRunStatusForClaudeCliCompletion(
  classification: ClaudeCliCompletionClassification,
): RoleRunStatusValue {
  if (!classification.ok || classification.jobShouldFail) {
    return RoleRunStatus.FAILED;
  }
  return RoleRunStatus.SUCCEEDED;
}

/**
 * Default CLI error retry fence for fixture soak (T-X009) — one recorded
 * failed apply; further starts are refused without inflating attemptCount.
 */
export const DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS = 1 as const;

export type ClaudeCliErrorRetryBudgetDecision = {
  allowed: boolean;
  code: "RETRY_BUDGET_EXHAUSTED" | null;
  reason: string;
  attemptCount: number;
  maxAttempts: number;
  /**
   * Whether a denial/failure at this gate should be persisted as another
   * apply attempt. RETRY_BUDGET_EXHAUSTED → false (fence honesty).
   */
  recordAttempt: boolean;
  jobShouldFail: boolean;
  externalEffects: "NONE";
  claudeCliLiveWiring: "NOT_WIRED";
};

/**
 * T-X009 retry budget fence: CLI_REPORTED_ERROR / NONZERO_EXIT consume the
 * attempt budget. Evaluating a start past maxAttempts → RETRY_BUDGET_EXHAUSTED
 * without recording another apply (mirrors repair ATTEMPT_LIMIT honesty).
 * Clean success does not open further retries. Live CLI stays NOT_WIRED.
 */
export function evaluateClaudeCliErrorRetryBudget(input: {
  classification: ClaudeCliCompletionClassification;
  /** Failed CLI applies already recorded (not including a refused start). */
  attemptCount: number;
  /** True when deciding whether to start another CLI apply. */
  startingNewAttempt: boolean;
  maxAttempts?: number;
}): ClaudeCliErrorRetryBudgetDecision {
  const maxAttempts = Math.max(
    1,
    Math.floor(input.maxAttempts ?? DEFAULT_CLI_ERROR_RETRY_MAX_ATTEMPTS),
  );
  const used = Math.max(0, Math.floor(input.attemptCount));
  const wiring = claudeCliLiveWiringStatus();

  if (input.classification.ok && !input.classification.jobShouldFail) {
    return {
      allowed: true,
      code: null,
      reason: "Clean CLI completion — retry budget not consumed",
      attemptCount: used,
      maxAttempts,
      recordAttempt: false,
      jobShouldFail: false,
      externalEffects: "NONE",
      claudeCliLiveWiring: wiring,
    };
  }

  const next = input.startingNewAttempt ? used + 1 : used;
  if (next > maxAttempts) {
    return {
      allowed: false,
      code: "RETRY_BUDGET_EXHAUSTED",
      reason: `CLI retry attempt ${next} exceeds max ${maxAttempts} — refuse without recording`,
      attemptCount: used,
      maxAttempts,
      recordAttempt: false,
      jobShouldFail: true,
      externalEffects: "NONE",
      claudeCliLiveWiring: wiring,
    };
  }

  return {
    allowed: true,
    code: null,
    reason: `CLI error attempt ${Math.max(next, 1)} within retry budget ${maxAttempts}`,
    attemptCount: used,
    maxAttempts,
    recordAttempt: true,
    jobShouldFail: true,
    externalEffects: "NONE",
    claudeCliLiveWiring: wiring,
  };
}

/**
 * T-X009: RETRY_BUDGET_EXHAUSTED denials must not be persisted as another
 * apply attempt (would inflate attemptCount past maxAttempts).
 */
export function shouldRecordClaudeCliAttemptOnBudgetDenial(
  code: string | null,
): boolean {
  return code !== "RETRY_BUDGET_EXHAUSTED";
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
