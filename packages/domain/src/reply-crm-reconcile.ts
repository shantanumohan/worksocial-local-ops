/**
 * T-X054 — Reply sent but CRM fails: CRM reconciles; no resend.
 *
 * Once an outbound agent reply is SENT (or DELIVERED), a subsequent CRM
 * write failure must reconcile/retry CRM only. The outbound must stay
 * retain_sent — never re-queue or re-send the same reply. Distinct from
 * thank-you-without-CRM (T-US-040/T-X049) and unknown-remote reconcile
 * (T-X020). External effects: NONE.
 */

import {
  MessageDirection,
  MessageSendStatus,
  detectDuplicateOutbound,
  type MessageRecord,
} from "./inbox.js";
import {
  ProbeVerdict,
  ReconciliationStatus,
  reconcileCanaryIntent,
  type CanaryIntent,
  type CanaryRemoteReceipt,
  type ReconciliationResult,
} from "./monitoring.js";

export type CrmAttemptOutcome =
  | { ok: true; crmRecordId: string }
  | { ok: false; reason: string };

export type ReplyCrmReconcileCode =
  | "REPLY_NOT_SENT"
  | "CRM_OK"
  | "CRM_RECONCILE_NO_RESEND"
  | null;

export type ReplyCrmReconcileDecision = {
  allowed: boolean;
  code: ReplyCrmReconcileCode;
  replyAction: "retain_sent" | "none";
  crmAction: "none" | "reconcile_or_retry" | "recorded";
  resendAllowed: boolean;
  reasons: string[];
  /** Present when CRM failed and reconcile was evaluated. */
  reconcile: ReconciliationResult | null;
};

/**
 * Evaluate post-send CRM failure: retain SENT reply; reconcile CRM; forbid resend.
 */
export function evaluateReplySentCrmFailure(input: {
  message: MessageRecord;
  crmAttempt: CrmAttemptOutcome;
  /** Optional canary intent used when CRM failed (reconcile path). */
  crmIntent?: CanaryIntent;
  /** Remote receipts observed during reconcile (may be empty on failure). */
  crmReceipts?: readonly CanaryRemoteReceipt[];
  expectedModuleId?: string;
}): ReplyCrmReconcileDecision {
  if (input.message.direction !== MessageDirection.OUTBOUND) {
    return {
      allowed: false,
      code: "REPLY_NOT_SENT",
      replyAction: "none",
      crmAction: "none",
      resendAllowed: false,
      reasons: ["Only outbound replies participate in reply+CRM reconcile"],
      reconcile: null,
    };
  }
  if (
    input.message.sendStatus !== MessageSendStatus.SENT &&
    input.message.sendStatus !== MessageSendStatus.DELIVERED
  ) {
    return {
      allowed: false,
      code: "REPLY_NOT_SENT",
      replyAction: "none",
      crmAction: "none",
      resendAllowed: false,
      reasons: [
        `Reply must already be SENT/DELIVERED for T-X054; current=${input.message.sendStatus}`,
      ],
      reconcile: null,
    };
  }

  if (input.crmAttempt.ok) {
    return {
      allowed: true,
      code: "CRM_OK",
      replyAction: "retain_sent",
      crmAction: "recorded",
      resendAllowed: false,
      reasons: [
        `CRM recorded (${input.crmAttempt.crmRecordId}); outbound remains ${input.message.sendStatus}; resend forbidden`,
      ],
      reconcile: null,
    };
  }

  const intent = input.crmIntent;
  let reconcile: ReconciliationResult | null = null;
  if (intent) {
    reconcile = reconcileCanaryIntent({
      intent,
      receipts: input.crmReceipts ?? [],
      expectedModuleId: input.expectedModuleId ?? "Leads",
    });
  }

  return {
    allowed: true,
    code: "CRM_RECONCILE_NO_RESEND",
    replyAction: "retain_sent",
    crmAction: "reconcile_or_retry",
    resendAllowed: false,
    reasons: [
      `CRM failed (${input.crmAttempt.reason}) after reply ${input.message.sendStatus} — reconcile/retry CRM only; do not resend outbound (T-X054)`,
      ...(reconcile
        ? [
            `CRM reconcile status=${reconcile.status} verdict=${reconcile.verdict} blocksRetry=${reconcile.blocksRetry}`,
          ]
        : []),
    ],
    reconcile,
  };
}

/**
 * Assert that re-sending the same outbound body is suppressed after SENT.
 */
export function assertOutboundResendSuppressed(input: {
  messages: readonly MessageRecord[];
  conversationId: string;
  body: string;
  nowIso: string;
  windowSec?: number;
}): boolean {
  return detectDuplicateOutbound({
    messages: input.messages,
    conversationId: input.conversationId,
    body: input.body,
    nowIso: input.nowIso,
    windowSec: input.windowSec ?? 3600,
  });
}

export function isMissingRemoteReconcile(
  result: ReconciliationResult | null,
): boolean {
  return (
    result != null &&
    result.status === ReconciliationStatus.MISSING_REMOTE &&
    result.verdict === ProbeVerdict.FAILURE
  );
}

export const REPLY_CRM_RECONCILE_RELATED_CASE_IDS = ["T-X054"] as const;
