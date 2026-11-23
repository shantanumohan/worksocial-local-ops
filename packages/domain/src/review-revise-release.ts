/**
 * T-US-035 — Review/revise/release (F18/SC-05) — release receipt or blocked
 * exception.
 *
 * Offline fixture gate (happy-path family): a proposed revision with evidence
 * and QA is reviewed by an independent reviewer; the decision is bound to the
 * exact revision and policy; approve yields a release receipt, while reject /
 * request-revision / gate failures yield a blocked exception. Self-approval
 * and stale approvals (revision changed after decision) are refused. Live
 * CMS/provider apply stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-027 (demand→page improvement release receipt),
 * T-US-036/T-X019 (approved payload edit / stale approval invalidated), and
 * T-US-054/T-X018 (self-approval rejected alone).
 */

export type ReviewDecisionKind =
  | "APPROVE"
  | "REQUEST_REVISION"
  | "REJECT";

export type QaGateStatus = "pass" | "fail" | "not_run" | "not_applicable";

export type ReviewQaGate = {
  gateId: string;
  kind: "technical" | "factual" | "policy";
  status: QaGateStatus;
};

export type ReviewReviseReleaseInput = {
  reviewItemId: string;
  revisionId: string;
  /** Human-readable before/after diff bound to revisionId. */
  humanReadableDiff: string;
  /** Why the change is proposed (observation / hypothesis summary). */
  evidenceSummary: string;
  qaBundleId: string;
  qaGates: readonly ReviewQaGate[];
  /** Independent reviewer role — must not equal authorRoleId. */
  reviewerRoleId: string;
  authorRoleId: string;
  decision: ReviewDecisionKind;
  /** Required when decision is REQUEST_REVISION or REJECT. */
  decisionReason: string | null;
  /** Policy version the decision is bound to. */
  policyVersion: string;
  /**
   * When approving, either a release receipt id (happy path) or a blocked
   * exception code must be present — never both, never neither.
   */
  releaseReceiptId: string | null;
  blockedExceptionCode: string | null;
  /**
   * Author edited the revision after the decision was minted — must refuse
   * (stale approval; T-US-036/T-X019 territory but enforced here too).
   */
  revisionChangedAfterDecision: boolean;
  /** Claim live CMS/provider apply already verified — must refuse offline. */
  claimLiveVerifiedRelease: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
  /** Attempt a production write from the review surface — must refuse. */
  attemptProductionWrite: boolean;
};

export type ReviewReviseReleaseDecision =
  | {
      allowed: true;
      code: "REVIEW_RELEASE_RECEIPT_RECORDED" | "REVIEW_BLOCKED_EXCEPTION_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        reviewItemId: string;
        revisionId: string;
        humanReadableDiff: string;
        evidenceSummary: string;
        qaBundleId: string;
        qaGateCount: number;
        decision: ReviewDecisionKind;
        decisionReason: string | null;
        policyVersion: string;
        reviewerRoleId: string;
        authorRoleId: string;
        releaseReceiptId: string | null;
        blockedExceptionCode: string | null;
        productionWrites: false;
        releaseVerifiedLive: false;
        blockingDecision: string;
        currentState: "RELEASED_FIXTURE" | "BLOCKED_EXCEPTION_RECORDED";
        recoveryPath:
          | "TRACK_RELEASE_RECEIPT"
          | "RESOLVE_BLOCKED_EXCEPTION_THEN_REREVIEW";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "REVIEW_IDENTITY_INCOMPLETE"
        | "EVIDENCE_OR_DIFF_REQUIRED"
        | "QA_BUNDLE_INCOMPLETE"
        | "SELF_APPROVAL_FORBIDDEN"
        | "NEGATIVE_DECISION_REASON_REQUIRED"
        | "STALE_APPROVAL_INVALIDATED"
        | "RELEASE_OUTCOME_REQUIRED"
        | "RELEASE_OUTCOME_AMBIGUOUS"
        | "PRODUCTION_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_RELEASE_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        reviewItemId: string | null;
        revisionId: string | null;
        humanReadableDiff: string | null;
        evidenceSummary: string | null;
        qaBundleId: string | null;
        qaGateCount: number;
        decision: ReviewDecisionKind | null;
        decisionReason: string | null;
        policyVersion: string | null;
        reviewerRoleId: string | null;
        authorRoleId: string | null;
        releaseReceiptId: string | null;
        blockedExceptionCode: string | null;
        productionWrites: false;
        releaseVerifiedLive: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_REVIEW_EVIDENCE"
          | "AWAITING_INDEPENDENT_REVIEW"
          | "AWAITING_RELEASE_OUTCOME";
        recoveryPath:
          | "COMPLETE_REVIEW_PACKAGE"
          | "USE_INDEPENDENT_REVIEWER"
          | "RE_REVIEW_AFTER_REVISION"
          | "RECORD_RECEIPT_OR_BLOCKED_EXCEPTION";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const REVIEW_REVISE_RELEASE_RELATED_CASE_IDS = [
  "T-US-035",
  "T-F18",
] as const;

function isQaGateStatus(value: string): value is QaGateStatus {
  return (
    value === "pass" ||
    value === "fail" ||
    value === "not_run" ||
    value === "not_applicable"
  );
}

function preservedInputCount(input: ReviewReviseReleaseInput): number {
  return (
    (input.reviewItemId.trim() ? 1 : 0) +
    (input.revisionId.trim() ? 1 : 0) +
    (input.humanReadableDiff.trim() ? 1 : 0) +
    (input.evidenceSummary.trim() ? 1 : 0) +
    (input.qaBundleId.trim() ? 1 : 0) +
    (input.qaGates.length > 0 ? 1 : 0) +
    (input.policyVersion.trim() ? 1 : 0) +
    (input.reviewerRoleId.trim() ? 1 : 0) +
    (input.authorRoleId.trim() ? 1 : 0)
  );
}

/**
 * Evaluate the F18 review → revise → release path offline.
 * Approve + receipt → RELEASE_RECEIPT_RECORDED; negative decision or explicit
 * blocked exception → BLOCKED_EXCEPTION_RECORDED; live stays NOT_WIRED.
 */
export function evaluateReviewReviseRelease(
  input: ReviewReviseReleaseInput,
): ReviewReviseReleaseDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_REVIEW_EVIDENCE"
      | "AWAITING_INDEPENDENT_REVIEW"
      | "AWAITING_RELEASE_OUTCOME",
    recoveryPath:
      | "COMPLETE_REVIEW_PACKAGE"
      | "USE_INDEPENDENT_REVIEWER"
      | "RE_REVIEW_AFTER_REVISION"
      | "RECORD_RECEIPT_OR_BLOCKED_EXCEPTION",
  ): NonNullable<
    Extract<ReviewReviseReleaseDecision, { allowed: false }>["evidence"]
  > => ({
    reviewItemId: input.reviewItemId.trim() || null,
    revisionId: input.revisionId.trim() || null,
    humanReadableDiff: input.humanReadableDiff.trim() || null,
    evidenceSummary: input.evidenceSummary.trim() || null,
    qaBundleId: input.qaBundleId.trim() || null,
    qaGateCount: input.qaGates.length,
    decision: input.decision,
    decisionReason: input.decisionReason,
    policyVersion: input.policyVersion.trim() || null,
    reviewerRoleId: input.reviewerRoleId.trim() || null,
    authorRoleId: input.authorRoleId.trim() || null,
    releaseReceiptId: input.releaseReceiptId,
    blockedExceptionCode: input.blockedExceptionCode,
    productionWrites: false,
    releaseVerifiedLive: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live review/revise/release CMS/provider apply remains NOT_WIRED — refuse live wiring (T-US-035)",
      ],
    };
  }

  if (input.claimLiveVerifiedRelease) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_RELEASE_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified release claim offline (T-US-035) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptProductionWrite) {
    return {
      allowed: false,
      code: "PRODUCTION_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_WRITE_FROM_REVIEW_REFUSED",
        "BLOCKED",
        "COMPLETE_REVIEW_PACKAGE",
      ),
      reasons: [
        "Review/revise/release must not perform production writes offline (T-US-035)",
      ],
    };
  }

  if (
    !input.reviewItemId.trim() ||
    !input.revisionId.trim() ||
    !input.policyVersion.trim() ||
    !input.reviewerRoleId.trim() ||
    !input.authorRoleId.trim()
  ) {
    return {
      allowed: false,
      code: "REVIEW_IDENTITY_INCOMPLETE",
      ...base,
      evidence: blockedEvidence(
        "REVIEW_IDENTITY_INCOMPLETE",
        "AWAITING_REVIEW_EVIDENCE",
        "COMPLETE_REVIEW_PACKAGE",
      ),
      reasons: [
        "Review item, revision, policy version, author, and independent reviewer are required (T-US-035)",
      ],
    };
  }

  if (!input.humanReadableDiff.trim() || !input.evidenceSummary.trim()) {
    return {
      allowed: false,
      code: "EVIDENCE_OR_DIFF_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "EVIDENCE_OR_DIFF_REQUIRED",
        "AWAITING_REVIEW_EVIDENCE",
        "COMPLETE_REVIEW_PACKAGE",
      ),
      reasons: [
        "Evidence summary and human-readable diff bound to the revision are required (T-US-035)",
      ],
    };
  }

  if (
    !input.qaBundleId.trim() ||
    input.qaGates.length === 0 ||
    !input.qaGates.every(
      (g) =>
        !!g.gateId.trim() &&
        (g.kind === "technical" ||
          g.kind === "factual" ||
          g.kind === "policy") &&
        isQaGateStatus(g.status),
    )
  ) {
    return {
      allowed: false,
      code: "QA_BUNDLE_INCOMPLETE",
      ...base,
      evidence: blockedEvidence(
        "QA_BUNDLE_INCOMPLETE",
        "AWAITING_REVIEW_EVIDENCE",
        "COMPLETE_REVIEW_PACKAGE",
      ),
      reasons: [
        "QA bundle with technical/factual/policy gates (pass/fail/not_run/not_applicable) is required (T-US-035)",
      ],
    };
  }

  if (input.reviewerRoleId.trim() === input.authorRoleId.trim()) {
    return {
      allowed: false,
      code: "SELF_APPROVAL_FORBIDDEN",
      ...base,
      evidence: blockedEvidence(
        "SELF_APPROVAL_FORBIDDEN",
        "AWAITING_INDEPENDENT_REVIEW",
        "USE_INDEPENDENT_REVIEWER",
      ),
      reasons: [
        "Author cannot approve their own revision — independent reviewer required (T-US-035)",
      ],
    };
  }

  if (input.revisionChangedAfterDecision) {
    return {
      allowed: false,
      code: "STALE_APPROVAL_INVALIDATED",
      ...base,
      evidence: blockedEvidence(
        "REVISION_CHANGED_AFTER_DECISION",
        "AWAITING_INDEPENDENT_REVIEW",
        "RE_REVIEW_AFTER_REVISION",
      ),
      reasons: [
        "Revision changed after decision — approval invalidated; re-review required (T-US-035)",
      ],
    };
  }

  if (
    (input.decision === "REQUEST_REVISION" || input.decision === "REJECT") &&
    !(input.decisionReason && input.decisionReason.trim())
  ) {
    return {
      allowed: false,
      code: "NEGATIVE_DECISION_REASON_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "NEGATIVE_DECISION_REASON_REQUIRED",
        "AWAITING_REVIEW_EVIDENCE",
        "COMPLETE_REVIEW_PACKAGE",
      ),
      reasons: [
        "Request-revision and reject decisions require a reason (T-US-035)",
      ],
    };
  }

  const hasReceipt = !!(input.releaseReceiptId && input.releaseReceiptId.trim());
  const hasBlocked = !!(
    input.blockedExceptionCode && input.blockedExceptionCode.trim()
  );

  if (input.decision === "APPROVE") {
    if (hasReceipt && hasBlocked) {
      return {
        allowed: false,
        code: "RELEASE_OUTCOME_AMBIGUOUS",
        ...base,
        evidence: blockedEvidence(
          "RECEIPT_AND_BLOCKED_EXCEPTION_BOTH_SET",
          "AWAITING_RELEASE_OUTCOME",
          "RECORD_RECEIPT_OR_BLOCKED_EXCEPTION",
        ),
        reasons: [
          "Approve must record either a release receipt or a blocked exception, not both (T-US-035)",
        ],
      };
    }
    if (!hasReceipt && !hasBlocked) {
      return {
        allowed: false,
        code: "RELEASE_OUTCOME_REQUIRED",
        ...base,
        evidence: blockedEvidence(
          "RELEASE_RECEIPT_OR_BLOCKED_EXCEPTION_REQUIRED",
          "AWAITING_RELEASE_OUTCOME",
          "RECORD_RECEIPT_OR_BLOCKED_EXCEPTION",
        ),
        reasons: [
          "Approve requires a release receipt or a blocked exception (T-US-035)",
        ],
      };
    }
  } else {
    // Negative decisions always record a blocked exception (no silent release).
    if (hasReceipt) {
      return {
        allowed: false,
        code: "RELEASE_OUTCOME_AMBIGUOUS",
        ...base,
        evidence: blockedEvidence(
          "NEGATIVE_DECISION_CANNOT_CARRY_RELEASE_RECEIPT",
          "AWAITING_RELEASE_OUTCOME",
          "RECORD_RECEIPT_OR_BLOCKED_EXCEPTION",
        ),
        reasons: [
          "Request-revision/reject cannot carry a release receipt (T-US-035)",
        ],
      };
    }
    if (!hasBlocked) {
      return {
        allowed: false,
        code: "RELEASE_OUTCOME_REQUIRED",
        ...base,
        evidence: blockedEvidence(
          "BLOCKED_EXCEPTION_REQUIRED_FOR_NEGATIVE_DECISION",
          "AWAITING_RELEASE_OUTCOME",
          "RECORD_RECEIPT_OR_BLOCKED_EXCEPTION",
        ),
        reasons: [
          "Request-revision/reject must record a blocked exception (T-US-035)",
        ],
      };
    }
  }

  if (hasReceipt) {
    return {
      allowed: true,
      code: "REVIEW_RELEASE_RECEIPT_RECORDED",
      ...base,
      evidence: {
        reviewItemId: input.reviewItemId,
        revisionId: input.revisionId,
        humanReadableDiff: input.humanReadableDiff,
        evidenceSummary: input.evidenceSummary,
        qaBundleId: input.qaBundleId,
        qaGateCount: input.qaGates.length,
        decision: input.decision,
        decisionReason: input.decisionReason,
        policyVersion: input.policyVersion,
        reviewerRoleId: input.reviewerRoleId,
        authorRoleId: input.authorRoleId,
        releaseReceiptId: input.releaseReceiptId,
        blockedExceptionCode: null,
        productionWrites: false,
        releaseVerifiedLive: false,
        blockingDecision: "NONE",
        currentState: "RELEASED_FIXTURE",
        recoveryPath: "TRACK_RELEASE_RECEIPT",
        preservedInputCount: preserved,
      },
      reasons: [
        "Independent review approved exact revision; release receipt recorded; live NOT_WIRED (T-US-035)",
      ],
    };
  }

  return {
    allowed: true,
    code: "REVIEW_BLOCKED_EXCEPTION_RECORDED",
    ...base,
    evidence: {
      reviewItemId: input.reviewItemId,
      revisionId: input.revisionId,
      humanReadableDiff: input.humanReadableDiff,
      evidenceSummary: input.evidenceSummary,
      qaBundleId: input.qaBundleId,
      qaGateCount: input.qaGates.length,
      decision: input.decision,
      decisionReason: input.decisionReason,
      policyVersion: input.policyVersion,
      reviewerRoleId: input.reviewerRoleId,
      authorRoleId: input.authorRoleId,
      releaseReceiptId: null,
      blockedExceptionCode: input.blockedExceptionCode,
      productionWrites: false,
      releaseVerifiedLive: false,
      blockingDecision: input.blockedExceptionCode!.trim(),
      currentState: "BLOCKED_EXCEPTION_RECORDED",
      recoveryPath: "RESOLVE_BLOCKED_EXCEPTION_THEN_REREVIEW",
      preservedInputCount: preserved,
    },
    reasons: [
      "Review decision recorded with blocked exception; no silent release; live NOT_WIRED (T-US-035)",
    ],
  };
}
