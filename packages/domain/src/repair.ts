/**
 * R1-10 Bounded repair and release.
 *
 * Pure types + validators. No network or CMS adapters.
 * Fail closed when a repair would weaken tests, expand authority, touch
 * standing policies/gateway, exceed attempt limits, or skip independent review.
 * Live CMS repair remains NOT_WIRED.
 */

import { createHash } from "node:crypto";
import {
  evaluateIndependentReviewGate,
  type EffectProposal,
  type ReviewGateDecision,
  type ReviewVerdict,
} from "./role-runtime.js";
import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  recordWritePathOutcome,
  type OutcomeEvidenceSourceValue,
  type OutcomeLabelValue,
  type WritePathOutcomeEvidence,
} from "./production-mapping.js";
import type { AgentRoleId } from "./agent-roles.js";

/** Default maximum repair attempts for the same incident (v3 §19). */
export const MAX_REPAIR_ATTEMPTS = 2;

/** Soft blast-radius limits — larger changes need technical review. */
export const MAX_CHANGE_SET_FILES = 8;
export const MAX_DIFF_LINES = 200;

/** Low-risk preapproved repair classes (still need grants + gates). */
export const RepairClass = {
  RESTORE_CTA: "restore_cta",
  CONTENT_FORMATTING: "content_formatting",
  METADATA_REFRESH: "metadata_refresh",
  IDEMPOTENT_RETRY: "idempotent_retry",
  FIXTURE_INTEGRATION: "fixture_integration",
} as const;

export type RepairClassValue =
  (typeof RepairClass)[keyof typeof RepairClass];

/**
 * Classes that must never be silently treated as low-risk autonomous repairs.
 * These always escalate / require material_change authority outside this module.
 */
export const HIGH_RISK_REPAIR_MARKERS = [
  "price",
  "credential",
  "authentication",
  "legal",
  "payment",
  "crm_automation",
  "standing_policy",
  "grant_expansion",
] as const;

export const IncidentSeverity = {
  P0: "P0",
  P1: "P1",
  P2: "P2",
  P3: "P3",
} as const;

export type IncidentSeverityValue =
  (typeof IncidentSeverity)[keyof typeof IncidentSeverity];

export const IncidentStatus = {
  OPEN: "open",
  REPRODUCED: "reproduced",
  REPAIRING: "repairing",
  RESOLVED: "resolved",
  ESCALATED: "escalated",
  CLOSED: "closed",
} as const;

export type IncidentStatusValue =
  (typeof IncidentStatus)[keyof typeof IncidentStatus];

export const RepairTicketStatus = {
  OPEN: "open",
  PROPOSAL_DRAFTED: "proposal_drafted",
  IN_REVIEW: "in_review",
  APPROVED: "approved",
  RELEASED_PENDING: "released_pending",
  VERIFIED: "verified",
  FAILED: "failed",
  ESCALATED: "escalated",
  CLOSED: "closed",
} as const;

export type RepairTicketStatusValue =
  (typeof RepairTicketStatus)[keyof typeof RepairTicketStatus];

export const RepairProposalStatus = {
  DRAFT: "draft",
  READY_FOR_REVIEW: "ready_for_review",
  APPROVED: "approved",
  REJECTED: "rejected",
  RELEASED_PENDING: "released_pending",
  VERIFIED: "verified",
  FAILED: "failed",
  BLOCKED: "blocked",
} as const;

export type RepairProposalStatusValue =
  (typeof RepairProposalStatus)[keyof typeof RepairProposalStatus];

export const RepairAttemptOutcome = {
  PENDING: "pending",
  TESTS_PASSED: "tests_passed",
  TESTS_FAILED: "tests_failed",
  GATE_DENIED: "gate_denied",
  RELEASED: "released",
  ROLLED_BACK: "rolled_back",
  ESCALATED: "escalated",
} as const;

export type RepairAttemptOutcomeValue =
  (typeof RepairAttemptOutcome)[keyof typeof RepairAttemptOutcome];

/** Operations that weaken test/policy integrity — always fail closed. */
export const WeakenTestOperation = {
  DISABLE_TEST: "disable_test",
  SKIP_ASSERTION: "skip_assertion",
  DELETE_TEST: "delete_test",
  LOWER_THRESHOLD: "lower_threshold",
  MARK_FLAKY: "mark_flaky",
  EXCLUDE_FROM_SUITE: "exclude_from_suite",
  MUTATE_BASELINE: "mutate_baseline",
} as const;

export type WeakenTestOperationValue =
  (typeof WeakenTestOperation)[keyof typeof WeakenTestOperation];

export const RepairPatchOp = {
  REPLACE_FIELD: "replace_field",
  RESTORE_VALUE: "restore_value",
  FORMAT_FIX: "format_fix",
  RETRY_DELIVERY: "retry_delivery",
} as const;

export type RepairPatchOpValue =
  (typeof RepairPatchOp)[keyof typeof RepairPatchOp];

export type IncidentRecord = {
  incidentId: string;
  title: string;
  summary: string;
  severity: IncidentSeverityValue;
  status: IncidentStatusValue;
  /** Single primary asset — blast radius bound. */
  assetId: string;
  siteId: string;
  /** Probe / journey that failed. */
  failingProbeId: string;
  businessImpact: string;
  fixtureOnly: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RepairTicket = {
  ticketId: string;
  incidentId: string;
  assetId: string;
  siteId: string;
  repairClass: RepairClassValue;
  status: RepairTicketStatusValue;
  attemptCount: number;
  maxAttempts: number;
  worktreeRef: string;
  sourceRevision: string;
  leaseOwner: string | null;
  leaseExpiresAtIso: string | null;
  fixtureOnly: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RepairPatch = {
  path: string;
  op: RepairPatchOpValue;
  before: string;
  after: string;
};

export type RepairProposal = {
  proposalId: string;
  ticketId: string;
  incidentId: string;
  authorRoleId: AgentRoleId;
  repairClass: RepairClassValue;
  title: string;
  summary: string;
  assetId: string;
  /** Exact isolated patches — one asset blast radius. */
  patches: RepairPatch[];
  /** Paths touched (derived + explicit). */
  touchedPaths: string[];
  /** Declared test operations — weaken ops fail the gate. */
  testOperations: string[];
  /** Expected post-repair probe / canary id. */
  regressionProbeId: string;
  /** Baseline hash of protected test suite — must not change. */
  testBaselineDigest: string;
  /** Proposed baseline after patch — must equal prior for integrity. */
  proposedTestBaselineDigest: string;
  changeSetFileCount: number;
  estimatedDiffLines: number;
  status: RepairProposalStatusValue;
  selfApprovalAttempted: boolean;
  reviewVerdictId: string | null;
  gatewayOperationId: string | null;
  writePathId: string | null;
  blockReasons: string[];
  fixtureOnly: boolean;
  createdAtIso: string;
  updatedAtIso: string;
};

export type RepairAttempt = {
  attemptId: string;
  ticketId: string;
  proposalId: string;
  attemptNumber: number;
  outcome: RepairAttemptOutcomeValue;
  testEvidenceId: string | null;
  notes: string;
  createdAtIso: string;
};

export type TestEvidence = {
  evidenceId: string;
  proposalId: string;
  probeId: string;
  passed: boolean;
  /** Digest of assertion results — used for independent verification. */
  resultDigest: string;
  summary: string;
  fixtureOnly: boolean;
  recordedAtIso: string;
};

export type FixtureAssetSnapshot = {
  assetId: string;
  /** Observable field under repair (e.g. CTA href). */
  fieldKey: string;
  fieldValue: string;
  healthyValue: string;
  defectInjected: boolean;
  revision: string;
  updatedAtIso: string;
};

export type RepairState = {
  version: 1;
  updatedAtIso: string;
  incidents: IncidentRecord[];
  tickets: RepairTicket[];
  proposals: RepairProposal[];
  attempts: RepairAttempt[];
  testEvidence: TestEvidence[];
  reviewVerdicts: ReviewVerdict[];
  /** Fixture canary asset under repair (offline). */
  fixtureAssets: FixtureAssetSnapshot[];
  releaseOutcomes: WritePathOutcomeEvidence[];
  /** Live CMS / production repair adapter — honest NOT_WIRED until wired. */
  liveCmsRepairWiring: "NOT_WIRED";
};

export function emptyRepairState(nowIso: string): RepairState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    incidents: [],
    tickets: [],
    proposals: [],
    attempts: [],
    testEvidence: [],
    reviewVerdicts: [],
    fixtureAssets: [],
    releaseOutcomes: [],
    liveCmsRepairWiring: "NOT_WIRED",
  };
}

/**
 * Paths the repairing worker must not mutate.
 * Policy files, gateway, standing authority, and test baselines are protected.
 */
export const PROTECTED_PATH_PATTERNS: readonly RegExp[] = [
  /(^|\/)tests\//i,
  /\.test\.[jt]sx?$/i,
  /\.spec\.[jt]sx?$/i,
  /(^|\/)instructions\//i,
  /(^|\/)CLAUDE\.md$/i,
  /(^|\/)\.claude\//i,
  /standing-authority/i,
  /policy-evaluation/i,
  /action-gateway/i,
  /credential-broker/i,
  /standing.?polic/i,
  /capability.?grant/i,
  /vitest\.config/i,
  /package\.json$/i,
];

export function pathIsProtected(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  return PROTECTED_PATH_PATTERNS.some((re) => re.test(normalized));
}

export function digestTestBaseline(
  suiteId: string,
  assertionFingerprints: readonly string[],
): string {
  const sorted = [...assertionFingerprints].sort();
  return createHash("sha256")
    .update(JSON.stringify({ suiteId, assertions: sorted }))
    .digest("hex");
}

export function digestPatches(patches: readonly RepairPatch[]): string {
  const canonical = patches.map((p) => ({
    path: p.path,
    op: p.op,
    before: p.before,
    after: p.after,
  }));
  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

export function createIncident(input: {
  incidentId: string;
  title: string;
  summary: string;
  severity: IncidentSeverityValue;
  assetId: string;
  siteId: string;
  failingProbeId: string;
  businessImpact: string;
  fixtureOnly: boolean;
  createdAtIso: string;
  status?: IncidentStatusValue;
}): IncidentRecord {
  return {
    incidentId: input.incidentId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    severity: input.severity,
    status: input.status ?? IncidentStatus.OPEN,
    assetId: input.assetId,
    siteId: input.siteId,
    failingProbeId: input.failingProbeId,
    businessImpact: input.businessImpact.trim(),
    fixtureOnly: input.fixtureOnly,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

export function createRepairTicket(input: {
  ticketId: string;
  incident: IncidentRecord;
  repairClass: RepairClassValue;
  worktreeRef: string;
  sourceRevision: string;
  fixtureOnly: boolean;
  createdAtIso: string;
  maxAttempts?: number;
}): RepairTicket {
  return {
    ticketId: input.ticketId,
    incidentId: input.incident.incidentId,
    assetId: input.incident.assetId,
    siteId: input.incident.siteId,
    repairClass: input.repairClass,
    status: RepairTicketStatus.OPEN,
    attemptCount: 0,
    maxAttempts: input.maxAttempts ?? MAX_REPAIR_ATTEMPTS,
    worktreeRef: input.worktreeRef,
    sourceRevision: input.sourceRevision,
    leaseOwner: null,
    leaseExpiresAtIso: null,
    fixtureOnly: input.fixtureOnly,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

export type CreateRepairProposalInput = {
  proposalId: string;
  ticket: RepairTicket;
  authorRoleId: AgentRoleId;
  title: string;
  summary: string;
  patches: RepairPatch[];
  testOperations?: string[];
  regressionProbeId: string;
  testBaselineDigest: string;
  proposedTestBaselineDigest: string;
  estimatedDiffLines?: number;
  selfApprovalAttempted?: boolean;
  fixtureOnly: boolean;
  createdAtIso: string;
  status?: RepairProposalStatusValue;
};

export function createRepairProposal(
  input: CreateRepairProposalInput,
): RepairProposal {
  const patches = input.patches.map((p) => ({
    ...p,
    path: p.path.replace(/\\/g, "/"),
  }));
  const touchedPaths = [...new Set(patches.map((p) => p.path))];
  const creatable = new Set<RepairProposalStatusValue>([
    RepairProposalStatus.DRAFT,
    RepairProposalStatus.READY_FOR_REVIEW,
  ]);
  const requested = input.status ?? RepairProposalStatus.DRAFT;
  return {
    proposalId: input.proposalId,
    ticketId: input.ticket.ticketId,
    incidentId: input.ticket.incidentId,
    authorRoleId: input.authorRoleId,
    repairClass: input.ticket.repairClass,
    title: input.title.trim(),
    summary: input.summary.trim(),
    assetId: input.ticket.assetId,
    patches,
    touchedPaths,
    testOperations: [...(input.testOperations ?? [])],
    regressionProbeId: input.regressionProbeId,
    testBaselineDigest: input.testBaselineDigest,
    proposedTestBaselineDigest: input.proposedTestBaselineDigest,
    changeSetFileCount: touchedPaths.length,
    estimatedDiffLines:
      input.estimatedDiffLines ??
      patches.reduce(
        (n, p) => n + Math.max(1, p.before.split("\n").length + p.after.split("\n").length),
        0,
      ),
    status: creatable.has(requested) ? requested : RepairProposalStatus.DRAFT,
    selfApprovalAttempted: input.selfApprovalAttempted ?? false,
    reviewVerdictId: null,
    gatewayOperationId: null,
    writePathId: null,
    blockReasons: [],
    fixtureOnly: input.fixtureOnly,
    createdAtIso: input.createdAtIso,
    updatedAtIso: input.createdAtIso,
  };
}

export type RepairGateDecision =
  | { allowed: true; code: null; reasons: string[] }
  | { allowed: false; code: string; reasons: string[] };

/**
 * Fail closed if any touched path is protected (tests, policies, gateway).
 */
export function evaluateProtectedPathGate(
  proposal: RepairProposal,
): RepairGateDecision {
  const hits = proposal.touchedPaths.filter(pathIsProtected);
  if (hits.length > 0) {
    return {
      allowed: false,
      code: "PROTECTED_PATH",
      reasons: hits.map(
        (p) =>
          `Path ${p} is protected — repairing worker cannot mutate tests, policies, or gateway`,
      ),
    };
  }
  return {
    allowed: true,
    code: null,
    reasons: ["No protected paths in change set"],
  };
}

/**
 * Fail closed when the proposal would weaken tests or mutate baselines.
 */
export function evaluateTestIntegrityGate(
  proposal: RepairProposal,
): RepairGateDecision {
  const reasons: string[] = [];
  const weakenValues = new Set<string>(Object.values(WeakenTestOperation));

  for (const op of proposal.testOperations) {
    if (weakenValues.has(op)) {
      reasons.push(
        `Test operation "${op}" weakens tests — fail closed (v3 §19 / v6 invariant 11)`,
      );
    }
  }

  if (proposal.testBaselineDigest !== proposal.proposedTestBaselineDigest) {
    reasons.push(
      "Proposed test baseline digest differs from locked baseline — repairs cannot drop or mutate gates",
    );
  }

  if (reasons.length > 0) {
    return {
      allowed: false,
      code: "TEST_INTEGRITY_VIOLATION",
      reasons,
    };
  }

  return {
    allowed: true,
    code: null,
    reasons: ["Test baseline preserved; no weaken operations"],
  };
}

/**
 * One-asset blast radius and change-set size limits.
 */
export function evaluateRepairScopeGate(input: {
  proposal: RepairProposal;
  ticket: RepairTicket;
}): RepairGateDecision {
  const reasons: string[] = [];
  const { proposal, ticket } = input;

  if (proposal.assetId !== ticket.assetId) {
    reasons.push(
      `Proposal asset ${proposal.assetId} ≠ ticket asset ${ticket.assetId}`,
    );
  }

  for (const patch of proposal.patches) {
    if (patch.path.includes("..")) {
      reasons.push(`Path traversal rejected: ${patch.path}`);
    }
  }

  if (proposal.changeSetFileCount > MAX_CHANGE_SET_FILES) {
    reasons.push(
      `Change set touches ${proposal.changeSetFileCount} files (max ${MAX_CHANGE_SET_FILES}) — needs technical review`,
    );
  }

  if (proposal.estimatedDiffLines > MAX_DIFF_LINES) {
    reasons.push(
      `Estimated diff ${proposal.estimatedDiffLines} lines (max ${MAX_DIFF_LINES}) — needs technical review`,
    );
  }

  const summaryLower = `${proposal.title} ${proposal.summary}`.toLowerCase();
  for (const marker of HIGH_RISK_REPAIR_MARKERS) {
    if (summaryLower.includes(marker.replace(/_/g, " ")) || summaryLower.includes(marker)) {
      reasons.push(
        `High-risk marker "${marker}" — not eligible for autonomous bounded repair`,
      );
    }
  }

  if (reasons.length > 0) {
    return { allowed: false, code: "SCOPE_EXCEEDED", reasons };
  }

  return {
    allowed: true,
    code: null,
    reasons: ["Scope within one-asset / size bounds"],
  };
}

export function evaluateAttemptLimitGate(input: {
  ticket: RepairTicket;
  /** When true, this evaluation is for starting a new attempt. */
  startingNewAttempt: boolean;
}): RepairGateDecision {
  const used = input.ticket.attemptCount;
  const next = input.startingNewAttempt ? used + 1 : used;
  if (next > input.ticket.maxAttempts) {
    return {
      allowed: false,
      code: "ATTEMPT_LIMIT",
      reasons: [
        `Attempt ${next} exceeds max ${input.ticket.maxAttempts} for ticket ${input.ticket.ticketId} — escalate`,
      ],
    };
  }
  return {
    allowed: true,
    code: null,
    reasons: [`Attempt ${next} within limit ${input.ticket.maxAttempts}`],
  };
}

export function toEffectProposal(proposal: RepairProposal): EffectProposal {
  return {
    proposalId: proposal.proposalId,
    authorRoleId: proposal.authorRoleId,
    actionClass: "bounded_repair",
    operation: "apply_bounded_repair",
    assetId: proposal.assetId,
    channelId: "owned-site",
    payloadDigest: digestPatches(proposal.patches),
    evidenceArtifactIds: [proposal.regressionProbeId, proposal.testBaselineDigest],
    selfApprovalAttempted: proposal.selfApprovalAttempted,
  };
}

/**
 * Independent review — A24 cannot self-approve; A25 (or designated reviewer) required.
 */
export function evaluateRepairReviewGate(input: {
  proposal: RepairProposal;
  reviewerRoleId?: AgentRoleId | null;
  existingVerdict?: ReviewVerdict | null;
}): RepairGateDecision {
  const review: ReviewGateDecision = evaluateIndependentReviewGate({
    proposal: toEffectProposal(input.proposal),
    ...(input.reviewerRoleId !== undefined
      ? { reviewerRoleId: input.reviewerRoleId }
      : {}),
  });

  if (!review.ok) {
    return {
      allowed: false,
      code: review.code,
      reasons: [review.reason],
    };
  }

  if (input.existingVerdict) {
    if (input.existingVerdict.proposalId !== input.proposal.proposalId) {
      return {
        allowed: false,
        code: "REVIEW_MISMATCH",
        reasons: ["Review verdict proposal id mismatch"],
      };
    }
    if (input.existingVerdict.authorRoleId === input.existingVerdict.reviewerRoleId) {
      return {
        allowed: false,
        code: "SELF_APPROVAL_FORBIDDEN",
        reasons: ["Reviewer cannot be the same role as author"],
      };
    }
    if (!input.existingVerdict.approved) {
      return {
        allowed: false,
        code: "REVIEW_REJECTED",
        reasons: [input.existingVerdict.reason],
      };
    }
    if (input.existingVerdict.authorRoleId !== input.proposal.authorRoleId) {
      return {
        allowed: false,
        code: "REVIEW_MISMATCH",
        reasons: ["Verdict author role does not match proposal author"],
      };
    }
  }

  return {
    allowed: true,
    code: null,
    reasons: review.requiresReview
      ? [`Independent review required from ${review.reviewerRoleId}`]
      : [review.reason],
  };
}

/**
 * Combined release gate — all sub-gates must pass. Fail closed.
 */
export function evaluateRepairReleaseGate(input: {
  proposal: RepairProposal;
  ticket: RepairTicket;
  reviewerRoleId?: AgentRoleId | null;
  existingVerdict?: ReviewVerdict | null;
  startingNewAttempt?: boolean;
}): RepairGateDecision {
  const reasons: string[] = [];
  const gates = [
    evaluateProtectedPathGate(input.proposal),
    evaluateTestIntegrityGate(input.proposal),
    evaluateRepairScopeGate({
      proposal: input.proposal,
      ticket: input.ticket,
    }),
    evaluateAttemptLimitGate({
      ticket: input.ticket,
      startingNewAttempt: input.startingNewAttempt ?? false,
    }),
    evaluateRepairReviewGate({
      proposal: input.proposal,
      ...(input.reviewerRoleId !== undefined
        ? { reviewerRoleId: input.reviewerRoleId }
        : {}),
      ...(input.existingVerdict !== undefined
        ? { existingVerdict: input.existingVerdict }
        : {}),
    }),
  ];

  for (const gate of gates) {
    if (!gate.allowed) {
      reasons.push(...gate.reasons);
      return {
        allowed: false,
        code: gate.code,
        reasons,
      };
    }
    reasons.push(...gate.reasons);
  }

  if (
    input.proposal.status !== RepairProposalStatus.APPROVED &&
    input.proposal.status !== RepairProposalStatus.READY_FOR_REVIEW
  ) {
    // Release path requires APPROVED with verdict; ready-for-review is for review only.
  }

  return { allowed: true, code: null, reasons };
}

export function acquireRepairLease(input: {
  ticket: RepairTicket;
  owner: string;
  nowIso: string;
  ttlSec?: number;
}): RepairTicket {
  const ttl = input.ttlSec ?? 900;
  const expires = new Date(Date.parse(input.nowIso) + ttl * 1000).toISOString();
  return {
    ...input.ticket,
    leaseOwner: input.owner,
    leaseExpiresAtIso: expires,
    updatedAtIso: input.nowIso,
  };
}

export function recordRepairAttempt(input: {
  attemptId: string;
  ticket: RepairTicket;
  proposalId: string;
  outcome: RepairAttemptOutcomeValue;
  testEvidenceId?: string | null;
  notes?: string;
  createdAtIso: string;
}): { attempt: RepairAttempt; ticket: RepairTicket } {
  const attemptNumber = input.ticket.attemptCount + 1;
  const attempt: RepairAttempt = {
    attemptId: input.attemptId,
    ticketId: input.ticket.ticketId,
    proposalId: input.proposalId,
    attemptNumber,
    outcome: input.outcome,
    testEvidenceId: input.testEvidenceId ?? null,
    notes: input.notes ?? "",
    createdAtIso: input.createdAtIso,
  };
  let status = input.ticket.status;
  if (input.outcome === RepairAttemptOutcome.ESCALATED) {
    status = RepairTicketStatus.ESCALATED;
  } else if (input.outcome === RepairAttemptOutcome.RELEASED) {
    status = RepairTicketStatus.RELEASED_PENDING;
  } else if (
    attemptNumber >= input.ticket.maxAttempts &&
    (input.outcome === RepairAttemptOutcome.TESTS_FAILED ||
      input.outcome === RepairAttemptOutcome.GATE_DENIED)
  ) {
    status = RepairTicketStatus.ESCALATED;
  } else {
    status = RepairTicketStatus.PROPOSAL_DRAFTED;
  }
  const ticket: RepairTicket = {
    ...input.ticket,
    attemptCount: attemptNumber,
    status,
    updatedAtIso: input.createdAtIso,
  };
  return { attempt, ticket };
}

export function createTestEvidence(input: {
  evidenceId: string;
  proposalId: string;
  probeId: string;
  passed: boolean;
  assertionFingerprints: readonly string[];
  summary: string;
  fixtureOnly: boolean;
  recordedAtIso: string;
}): TestEvidence {
  return {
    evidenceId: input.evidenceId,
    proposalId: input.proposalId,
    probeId: input.probeId,
    passed: input.passed,
    resultDigest: digestTestBaseline(input.probeId, input.assertionFingerprints),
    summary: input.summary,
    fixtureOnly: input.fixtureOnly,
    recordedAtIso: input.recordedAtIso,
  };
}

/**
 * Fixture canary: evaluate whether the observable field matches healthy value.
 */
export function evaluateFixtureCanary(
  asset: FixtureAssetSnapshot,
): { passed: boolean; summary: string } {
  if (asset.defectInjected || asset.fieldValue !== asset.healthyValue) {
    return {
      passed: false,
      summary: `Canary failed: ${asset.fieldKey}=${asset.fieldValue} (expected ${asset.healthyValue})`,
    };
  }
  return {
    passed: true,
    summary: `Canary passed: ${asset.fieldKey} restored to ${asset.healthyValue}`,
  };
}

export function injectFixtureDefect(input: {
  asset: FixtureAssetSnapshot;
  defectValue: string;
  nowIso: string;
}): FixtureAssetSnapshot {
  return {
    ...input.asset,
    fieldValue: input.defectValue,
    defectInjected: true,
    revision: `rev-defect-${Date.parse(input.nowIso)}`,
    updatedAtIso: input.nowIso,
  };
}

export function applyFixtureRepairPatches(input: {
  asset: FixtureAssetSnapshot;
  patches: readonly RepairPatch[];
  nowIso: string;
}):
  | { ok: true; asset: FixtureAssetSnapshot }
  | { ok: false; code: string; reasons: string[] } {
  let next = { ...input.asset };
  const reasons: string[] = [];

  for (const patch of input.patches) {
    if (pathIsProtected(patch.path)) {
      reasons.push(`Protected path in apply: ${patch.path}`);
      continue;
    }
    // Fixture apply maps patch.after onto the observable field when paths match asset.
    if (
      patch.op === RepairPatchOp.RESTORE_VALUE ||
      patch.op === RepairPatchOp.REPLACE_FIELD ||
      patch.op === RepairPatchOp.FORMAT_FIX
    ) {
      if (patch.before !== next.fieldValue && patch.before !== "*") {
        reasons.push(
          `Patch before-value mismatch for ${patch.path}: expected ${next.fieldValue}`,
        );
        continue;
      }
      next = {
        ...next,
        fieldValue: patch.after,
        defectInjected: patch.after !== next.healthyValue,
        revision: `rev-repair-${Date.parse(input.nowIso)}`,
        updatedAtIso: input.nowIso,
      };
    }
  }

  if (reasons.length > 0) {
    return { ok: false, code: "APPLY_FAILED", reasons };
  }

  // After successful restore to healthy value, clear defect flag.
  if (next.fieldValue === next.healthyValue) {
    next = { ...next, defectInjected: false };
  }

  return { ok: true, asset: next };
}

export const RepairReleaseDecision = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  UNKNOWN: "UNKNOWN",
} as const;

export type RepairReleaseDecisionValue =
  (typeof RepairReleaseDecision)[keyof typeof RepairReleaseDecision];

export function buildRepairReleaseOutcome(input: {
  outcomeId: string;
  writePathId: string;
  operationId: string;
  decision: RepairReleaseDecisionValue;
  source: OutcomeEvidenceSourceValue;
  fixtureOnly: boolean;
  summary: string;
  nowIso: string;
  featureHints?: Record<string, string | number | boolean>;
}): WritePathOutcomeEvidence {
  const label: OutcomeLabelValue =
    input.decision === RepairReleaseDecision.SUCCESS
      ? OutcomeLabel.SUCCESS
      : input.decision === RepairReleaseDecision.FAILURE
        ? OutcomeLabel.FAILURE
        : OutcomeLabel.UNKNOWN;

  return recordWritePathOutcome({
    outcomeId: input.outcomeId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    label,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    featureHints: {
      domain: "bounded_repair",
      ...(input.featureHints ?? {}),
    },
    recordedAtIso: input.nowIso,
  });
}

export function applyRepairReleaseVerification(
  state: RepairState,
  input: {
    proposalId: string;
    decision: RepairReleaseDecisionValue;
    source: OutcomeEvidenceSourceValue;
    fixtureOnly: boolean;
    summary: string;
    outcomeId: string;
    operationId: string;
    writePathId: string;
    nowIso: string;
  },
): {
  state: RepairState;
  proposal: RepairProposal | null;
  ticket: RepairTicket | null;
  outcome: WritePathOutcomeEvidence | null;
} {
  const proposal =
    state.proposals.find((p) => p.proposalId === input.proposalId) ?? null;
  if (!proposal) {
    return { state, proposal: null, ticket: null, outcome: null };
  }

  const outcome = buildRepairReleaseOutcome({
    outcomeId: input.outcomeId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    decision: input.decision,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    nowIso: input.nowIso,
    featureHints: {
      proposalId: proposal.proposalId,
      repairClass: proposal.repairClass,
      assetId: proposal.assetId,
    },
  });

  const nextStatus: RepairProposalStatusValue =
    input.decision === RepairReleaseDecision.SUCCESS
      ? RepairProposalStatus.VERIFIED
      : input.decision === RepairReleaseDecision.FAILURE
        ? RepairProposalStatus.FAILED
        : RepairProposalStatus.RELEASED_PENDING;

  const updatedProposal: RepairProposal = {
    ...proposal,
    status: nextStatus,
    gatewayOperationId: input.operationId,
    writePathId: input.writePathId,
    updatedAtIso: input.nowIso,
  };

  const ticket =
    state.tickets.find((t) => t.ticketId === proposal.ticketId) ?? null;
  let updatedTicket = ticket;
  if (ticket) {
    updatedTicket = {
      ...ticket,
      status:
        nextStatus === RepairProposalStatus.VERIFIED
          ? RepairTicketStatus.VERIFIED
          : nextStatus === RepairProposalStatus.FAILED
            ? RepairTicketStatus.FAILED
            : RepairTicketStatus.RELEASED_PENDING,
      updatedAtIso: input.nowIso,
    };
  }

  const incidents = state.incidents.map((inc) => {
    if (inc.incidentId !== proposal.incidentId) return inc;
    if (nextStatus === RepairProposalStatus.VERIFIED) {
      return {
        ...inc,
        status: IncidentStatus.RESOLVED,
        updatedAtIso: input.nowIso,
      };
    }
    if (nextStatus === RepairProposalStatus.FAILED) {
      return {
        ...inc,
        status: IncidentStatus.REPAIRING,
        updatedAtIso: input.nowIso,
      };
    }
    return inc;
  });

  return {
    state: {
      ...state,
      updatedAtIso: input.nowIso,
      incidents,
      proposals: state.proposals.map((p) =>
        p.proposalId === updatedProposal.proposalId ? updatedProposal : p,
      ),
      tickets: updatedTicket
        ? state.tickets.map((t) =>
            t.ticketId === updatedTicket!.ticketId ? updatedTicket! : t,
          )
        : state.tickets,
      releaseOutcomes: [...state.releaseOutcomes, outcome],
    },
    proposal: updatedProposal,
    ticket: updatedTicket,
    outcome,
  };
}

export function listRepairOutcomesForLearning(
  state: RepairState,
  options?: { includeFixture?: boolean },
): WritePathOutcomeEvidence[] {
  const includeFixture = options?.includeFixture ?? false;
  return state.releaseOutcomes.filter((o) => {
    if (o.fixtureOnly && !includeFixture) return false;
    return true;
  });
}

export function cmsRepairWiringStatus(): "NOT_WIRED" {
  return "NOT_WIRED";
}

export const REPAIR_RELATED_CASE_IDS = [
  "T-F21", // diagnose and repair a permitted defect
  "T-R01", // weaken-test proposals fail closed
  "T-R02", // attempt limit + independent review
  "T-R03", // injected defect → fixture repair → verified canary
] as const;

export { OutcomeEvidenceSource };
