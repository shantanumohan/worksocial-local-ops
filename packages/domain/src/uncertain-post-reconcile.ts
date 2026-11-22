/**
 * T-US-030 — Uncertain post: reconcile before retry.
 *
 * Offline fixture gate (failure/gate family): when a social/CMS post attempt
 * returns an uncertain/unknown remote outcome, refuse blind retry. Require a
 * reconcile/read-back settlement first. If reconcile finds the post present,
 * refuse retry (would double-post). If absent, authorize a single linked
 * retry. False success claims refused; live adapters stay NOT_WIRED.
 * Distinct from T-US-048/T-X020 (general unknown-remote resume), T-X017
 * (stop-after-dispatch), T-US-029 (campaign manifest), and T-X045 (partial
 * destinations). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type UncertainPostAttempt = {
  postId: string;
  destinationId: string;
  attemptId: string;
  /** Stable correlation / idempotency key for the original attempt. */
  correlationId: string;
  remoteState: "UNCERTAIN" | "TIMEOUT" | "UNKNOWN_REMOTE";
};

export type PostReconcileSettlement = {
  reconcileId: string;
  /**
   * Read-back settlement of the uncertain attempt:
   * - VERIFIED_PRESENT: remote already has the post — do not retry
   * - VERIFIED_ABSENT: remote has no post — linked retry may proceed
   * - STILL_UNCERTAIN: reconcile did not settle — still blocked
   * - FAILED: reconcile failed — escalate, do not blind retry
   */
  settlement:
    | "VERIFIED_PRESENT"
    | "VERIFIED_ABSENT"
    | "STILL_UNCERTAIN"
    | "FAILED";
  remoteReceiptId: string | null;
};

export type UncertainPostReconcileInput = {
  attempt: UncertainPostAttempt;
  /** Null until a reconcile/read-back has been performed. */
  reconcile: PostReconcileSettlement | null;
  /** Blind retry without reconcile — must refuse. */
  requestBlindRetry: boolean;
  /** Retry after a completed reconcile settlement. */
  requestRetryAfterReconcile: boolean;
  /** Claim the uncertain post already succeeded — must refuse. */
  claimPostSucceededDespiteUncertainty: boolean;
  /** Request live provider apply — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type UncertainPostReconcileDecision =
  | {
      allowed: true;
      code:
        | "RECONCILED_POST_PRESENT_NO_RETRY"
        | "RECONCILED_POST_ABSENT_RETRY_AUTHORIZED";
      blindRetryRefused: true;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        postId: string;
        destinationId: string;
        attemptId: string;
        correlationId: string;
        remoteState: string;
        reconcileId: string;
        settlement: string;
        remoteReceiptId: string | null;
        retryAuthorized: boolean;
        blockingDecision: "UNCERTAIN_POST_REQUIRES_RECONCILE";
        currentState: "RECONCILED";
        recoveryPath: "RECONCILE_BEFORE_RETRY";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "ATTEMPT_INCOMPLETE"
        | "BLIND_RETRY_REFUSED"
        | "RECONCILE_REQUIRED"
        | "RECONCILE_STILL_UNCERTAIN"
        | "RECONCILE_FAILED"
        | "RETRY_REFUSED_POST_PRESENT"
        | "FALSE_SUCCESS_CLAIM_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      blindRetryRefused: boolean;
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      evidence: {
        postId: string;
        destinationId: string;
        attemptId: string;
        correlationId: string;
        remoteState: string;
        reconcileId: string | null;
        settlement: string | null;
        blockingDecision: string;
        currentState: "BLOCKED" | "UNCERTAIN" | "RECONCILED";
        recoveryPath: "RECONCILE_BEFORE_RETRY";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const UNCERTAIN_POST_RECONCILE_RELATED_CASE_IDS = [
  "T-US-030",
] as const;

function preservedInputCount(input: UncertainPostReconcileInput): number {
  const a = input.attempt;
  return (
    (a.postId.trim() ? 1 : 0) +
    (a.destinationId.trim() ? 1 : 0) +
    (a.attemptId.trim() ? 1 : 0) +
    (a.correlationId.trim() ? 1 : 0) +
    (a.remoteState ? 1 : 0) +
    (input.reconcile ? 1 : 0)
  );
}

function attemptComplete(attempt: UncertainPostAttempt): boolean {
  return (
    !!attempt.postId.trim() &&
    !!attempt.destinationId.trim() &&
    !!attempt.attemptId.trim() &&
    !!attempt.correlationId.trim() &&
    (attempt.remoteState === "UNCERTAIN" ||
      attempt.remoteState === "TIMEOUT" ||
      attempt.remoteState === "UNKNOWN_REMOTE")
  );
}

/**
 * Evaluate the uncertain-post reconcile-before-retry gate offline.
 * Blind retry and false success are refused; live stays NOT_WIRED.
 */
export function evaluateUncertainPostReconcile(
  input: UncertainPostReconcileInput,
): UncertainPostReconcileDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
  };

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      blindRetryRefused: true,
      ...base,
      evidence: null,
      reasons: [
        "Live social/CMS post apply remains NOT_WIRED — refuse live wiring (T-US-030)",
      ],
    };
  }

  if (input.claimPostSucceededDespiteUncertainty) {
    return {
      allowed: false,
      code: "FALSE_SUCCESS_CLAIM_REFUSED",
      blindRetryRefused: true,
      ...base,
      evidence: null,
      reasons: [
        "Refused false post-success claim while remote outcome is uncertain (T-US-030)",
      ],
    };
  }

  const attempt = input.attempt;
  if (!attemptComplete(attempt)) {
    return {
      allowed: false,
      code: "ATTEMPT_INCOMPLETE",
      blindRetryRefused: true,
      ...base,
      evidence: null,
      reasons: [
        "Uncertain post attempt requires postId, destinationId, attemptId, correlationId, and uncertain remoteState (T-US-030)",
      ],
    };
  }

  const preserved = preservedInputCount(input);

  if (input.requestBlindRetry && !input.reconcile) {
    return {
      allowed: false,
      code: "BLIND_RETRY_REFUSED",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: null,
        settlement: null,
        blockingDecision: "BLIND_RETRY_WHILE_UNCERTAIN",
        currentState: "UNCERTAIN",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        `Blind retry refused for uncertain post ${attempt.postId} on ${attempt.destinationId} — reconcile before retry (T-US-030)`,
      ],
    };
  }

  if (!input.reconcile) {
    return {
      allowed: false,
      code: "RECONCILE_REQUIRED",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: null,
        settlement: null,
        blockingDecision: "UNCERTAIN_POST_REQUIRES_RECONCILE",
        currentState: "UNCERTAIN",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        `Uncertain remote state ${attempt.remoteState} for post ${attempt.postId} requires reconcile/read-back before any retry (T-US-030)`,
      ],
    };
  }

  const reconcile = input.reconcile;
  if (!reconcile.reconcileId.trim()) {
    return {
      allowed: false,
      code: "RECONCILE_REQUIRED",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: null,
        settlement: null,
        blockingDecision: "UNCERTAIN_POST_REQUIRES_RECONCILE",
        currentState: "UNCERTAIN",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        "Reconcile settlement requires a non-empty reconcileId (T-US-030)",
      ],
    };
  }

  if (reconcile.settlement === "STILL_UNCERTAIN") {
    return {
      allowed: false,
      code: "RECONCILE_STILL_UNCERTAIN",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: reconcile.reconcileId,
        settlement: reconcile.settlement,
        blockingDecision: "RECONCILE_DID_NOT_SETTLE",
        currentState: "UNCERTAIN",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        `Reconcile ${reconcile.reconcileId} still uncertain — escalate; do not blind retry (T-US-030)`,
      ],
    };
  }

  if (reconcile.settlement === "FAILED") {
    return {
      allowed: false,
      code: "RECONCILE_FAILED",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: reconcile.reconcileId,
        settlement: reconcile.settlement,
        blockingDecision: "RECONCILE_FAILED",
        currentState: "BLOCKED",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        `Reconcile ${reconcile.reconcileId} failed — escalate rather than risk duplicate post (T-US-030)`,
      ],
    };
  }

  if (reconcile.settlement === "VERIFIED_PRESENT") {
    if (input.requestRetryAfterReconcile || input.requestBlindRetry) {
      return {
        allowed: false,
        code: "RETRY_REFUSED_POST_PRESENT",
        blindRetryRefused: true,
        ...base,
        evidence: {
          postId: attempt.postId,
          destinationId: attempt.destinationId,
          attemptId: attempt.attemptId,
          correlationId: attempt.correlationId,
          remoteState: attempt.remoteState,
          reconcileId: reconcile.reconcileId,
          settlement: reconcile.settlement,
          blockingDecision: "RETRY_WOULD_DOUBLE_POST",
          currentState: "RECONCILED",
          recoveryPath: "RECONCILE_BEFORE_RETRY",
          preservedInputCount: preserved,
        },
        reasons: [
          `Reconcile ${reconcile.reconcileId} found post present — retry refused to avoid double-post (T-US-030)`,
        ],
      };
    }

    return {
      allowed: true,
      code: "RECONCILED_POST_PRESENT_NO_RETRY",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: reconcile.reconcileId,
        settlement: reconcile.settlement,
        remoteReceiptId: reconcile.remoteReceiptId,
        retryAuthorized: false,
        blockingDecision: "UNCERTAIN_POST_REQUIRES_RECONCILE",
        currentState: "RECONCILED",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        `Reconcile ${reconcile.reconcileId} settled VERIFIED_PRESENT for post ${attempt.postId}`,
        `Receipt ${reconcile.remoteReceiptId ?? "(none)"}; retry not authorized`,
        "liveProviderWiring=NOT_WIRED externalEffects=NONE",
      ],
    };
  }

  // VERIFIED_ABSENT
  if (input.requestBlindRetry && !input.requestRetryAfterReconcile) {
    return {
      allowed: false,
      code: "BLIND_RETRY_REFUSED",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: reconcile.reconcileId,
        settlement: reconcile.settlement,
        blockingDecision: "BLIND_RETRY_WHILE_UNCERTAIN",
        currentState: "RECONCILED",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        "Even after reconcile, retries must be explicitly linked (requestRetryAfterReconcile) — blind retry refused (T-US-030)",
      ],
    };
  }

  if (!input.requestRetryAfterReconcile) {
    // Reconciled absent but caller has not yet requested the linked retry —
    // still blocked until an authorized retry is requested (gate honesty).
    return {
      allowed: false,
      code: "RECONCILE_REQUIRED",
      blindRetryRefused: true,
      ...base,
      evidence: {
        postId: attempt.postId,
        destinationId: attempt.destinationId,
        attemptId: attempt.attemptId,
        correlationId: attempt.correlationId,
        remoteState: attempt.remoteState,
        reconcileId: reconcile.reconcileId,
        settlement: reconcile.settlement,
        blockingDecision: "LINKED_RETRY_NOT_REQUESTED",
        currentState: "RECONCILED",
        recoveryPath: "RECONCILE_BEFORE_RETRY",
        preservedInputCount: preserved,
      },
      reasons: [
        `Reconcile ${reconcile.reconcileId} settled VERIFIED_ABSENT — linked retry may be requested next (T-US-030)`,
      ],
    };
  }

  return {
    allowed: true,
    code: "RECONCILED_POST_ABSENT_RETRY_AUTHORIZED",
    blindRetryRefused: true,
    ...base,
    evidence: {
      postId: attempt.postId,
      destinationId: attempt.destinationId,
      attemptId: attempt.attemptId,
      correlationId: attempt.correlationId,
      remoteState: attempt.remoteState,
      reconcileId: reconcile.reconcileId,
      settlement: reconcile.settlement,
      remoteReceiptId: reconcile.remoteReceiptId,
      retryAuthorized: true,
      blockingDecision: "UNCERTAIN_POST_REQUIRES_RECONCILE",
      currentState: "RECONCILED",
      recoveryPath: "RECONCILE_BEFORE_RETRY",
      preservedInputCount: preserved,
    },
    reasons: [
      `Reconcile ${reconcile.reconcileId} settled VERIFIED_ABSENT for post ${attempt.postId}`,
      `Linked retry authorized under correlation ${attempt.correlationId}`,
      "liveProviderWiring=NOT_WIRED externalEffects=NONE",
    ],
  };
}
