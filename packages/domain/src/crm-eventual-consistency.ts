/**
 * T-X023 — Eventual consistency false not-found: no unsafe retry.
 *
 * A temporary empty CRM read must not trigger a new lead create when a
 * local correlated write/receipt already exists. Bound the consistency
 * window, inspect correlated receipts, then reconcile once visible.
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 */

import type { CanaryRemoteReceipt } from "./monitoring.js";
import {
  ProbeVerdict,
  ReconciliationStatus,
  reconcileCanaryIntent,
  type CanaryIntent,
  type ReconciliationResult,
} from "./monitoring.js";

/** Default eventual-consistency window for fixture CRM lead reads (30s). */
export const DEFAULT_CRM_CONSISTENCY_WINDOW_MS = 30_000;

/** Decision actions after an empty / lagging CRM read. */
export const CrmEmptyReadAction = {
  /** Local write exists; still inside window — wait, do not create. */
  BOUND_WAIT: "BOUND_WAIT",
  /** Local write exists; inspect receipts / outbox — create forbidden. */
  REFUSE_CREATE: "REFUSE_CREATE",
  /** Remote finally visible — reconcile matched; still no create. */
  RECONCILE: "RECONCILE",
  /** Window exceeded and still empty — escalate missing; never invent create. */
  ESCALATE_MISSING: "ESCALATE_MISSING",
} as const;

export type CrmEmptyReadActionValue =
  (typeof CrmEmptyReadAction)[keyof typeof CrmEmptyReadAction];

export type DecideCrmLeadRetryAfterEmptyReadInput = {
  correlationId: string;
  /** Durable local write / outbox / provider ack for this correlation. */
  localWriteReceiptPresent: boolean;
  /** Remote CRM get-by-correlation returned empty / not-found. */
  remoteReadEmpty: boolean;
  /** Elapsed ms since local write (or first empty observation). */
  elapsedMs: number;
  /** Bound wait window before escalating missing. */
  consistencyWindowMs: number;
  /** Correlated remote receipts already observed (may be empty under lag). */
  correlatedReceipts: readonly CanaryRemoteReceipt[];
};

export type DecideCrmLeadRetryAfterEmptyReadResult = {
  action: CrmEmptyReadActionValue;
  /** Always false for T-X023 pass paths — false not-found ≠ create. */
  createLead: false;
  reason: string;
  withinConsistencyWindow: boolean;
};

/**
 * Decide CRM lead retry after an empty remote read.
 * Never authorizes a second create when a local write already exists.
 */
export function decideCrmLeadRetryAfterEmptyRead(
  input: DecideCrmLeadRetryAfterEmptyReadInput,
): DecideCrmLeadRetryAfterEmptyReadResult {
  const windowMs = Math.max(0, input.consistencyWindowMs);
  const elapsed = Math.max(0, input.elapsedMs);
  const within = elapsed <= windowMs;
  const hasVisibleReceipt = input.correlatedReceipts.some(
    (r) =>
      r.correlationId === input.correlationId &&
      r.recordId !== null &&
      r.recordId !== undefined,
  );

  if (hasVisibleReceipt) {
    return {
      action: CrmEmptyReadAction.RECONCILE,
      createLead: false,
      reason:
        "Correlated CRM receipt visible — reconcile; refuse second create",
      withinConsistencyWindow: within,
    };
  }

  if (input.localWriteReceiptPresent) {
    if (input.remoteReadEmpty && within) {
      return {
        action: CrmEmptyReadAction.BOUND_WAIT,
        createLead: false,
        reason:
          "Local write present; empty remote within consistency window — BOUND_WAIT (false not-found)",
        withinConsistencyWindow: true,
      };
    }
    if (input.remoteReadEmpty && !within) {
      return {
        action: CrmEmptyReadAction.ESCALATE_MISSING,
        createLead: false,
        reason:
          "Local write present; empty remote after window — ESCALATE_MISSING (still no create)",
        withinConsistencyWindow: false,
      };
    }
    return {
      action: CrmEmptyReadAction.REFUSE_CREATE,
      createLead: false,
      reason:
        "Local write/outbox present — REFUSE_CREATE even if remote still lagging",
      withinConsistencyWindow: within,
    };
  }

  // No local write: still never invent a success create from empty alone
  // after the window — escalate missing / refuse speculative create.
  if (input.remoteReadEmpty && within) {
    return {
      action: CrmEmptyReadAction.BOUND_WAIT,
      createLead: false,
      reason:
        "No local write yet; empty remote within window — BOUND_WAIT (no speculative create)",
      withinConsistencyWindow: true,
    };
  }

  return {
    action: CrmEmptyReadAction.ESCALATE_MISSING,
    createLead: false,
    reason:
      "Empty remote without local write after window — ESCALATE_MISSING (no create)",
    withinConsistencyWindow: within,
  };
}

/**
 * Counterfactual: trusting an empty EC read as durable not-found would
 * authorize an unsafe create. Used only to document the forbidden path.
 */
export function counterfactualUnsafeCreateOnEmptyRead(input: {
  remoteReadEmpty: boolean;
  localWriteReceiptPresent: boolean;
}): { wouldCreateLead: boolean; forbidden: true; reason: string } {
  const would =
    input.remoteReadEmpty === true && input.localWriteReceiptPresent === true;
  return {
    wouldCreateLead: would,
    forbidden: true,
    reason: would
      ? "Counterfactual: empty EC read + local write would create a duplicate lead"
      : "Counterfactual create not triggered",
  };
}

/**
 * After lag clears, reconcile the canary intent against visible receipts.
 * Pass requires MATCHED + blocksRetry false + create still refused.
 */
export function reconcileAfterConsistencyVisibility(input: {
  intent: CanaryIntent;
  receipts: readonly CanaryRemoteReceipt[];
  expectedModuleId: string;
}): {
  reconcile: ReconciliationResult;
  createLead: false;
  matched: boolean;
} {
  const reconcile = reconcileCanaryIntent({
    intent: input.intent,
    receipts: input.receipts,
    expectedModuleId: input.expectedModuleId,
  });
  const matched =
    reconcile.status === ReconciliationStatus.MATCHED &&
    reconcile.verdict === ProbeVerdict.SUCCESS &&
    reconcile.blocksRetry === false;
  return { reconcile, createLead: false, matched };
}
