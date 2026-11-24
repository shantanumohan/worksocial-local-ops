/**
 * T-X054 — Reply sent but CRM fails: CRM reconciles; no resend.
 *
 * Once an outbound agent reply is SENT (or DELIVERED), a subsequent CRM
 * write failure must reconcile/retry CRM only. The outbound must stay
 * retain_sent — never re-queue or re-send the same reply. Distinct from
 * thank-you-without-CRM (T-US-040/T-X049) and unknown-remote reconcile
 * (T-X020). Live CRM wiring stays NOT_WIRED. External effects: NONE.
 * ChatGPT Ads ACCESS_BLOCKED. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
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

/** Live CRM provider wiring — always NOT_WIRED for fixture proofs. */
export const REPLY_CRM_LIVE_WIRING = "NOT_WIRED" as const;

export type ReplyCrmLiveWiring = typeof REPLY_CRM_LIVE_WIRING;

export type CrmAttemptOutcome =
  | { ok: true; crmRecordId: string }
  | { ok: false; reason: string };

export type ReplyCrmReconcileCode =
  | "REPLY_NOT_SENT"
  | "CRM_OK"
  | "CRM_RECONCILE_NO_RESEND"
  | "LIVE_CRM_CLAIM_REFUSED"
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
  externalEffects: "NONE";
  liveCrmWiring: ReplyCrmLiveWiring;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

function baseHonesty(): Pick<
  ReplyCrmReconcileDecision,
  | "externalEffects"
  | "liveCrmWiring"
  | "liveProviderSuccessClaimed"
  | "chatgptAdsAccess"
> {
  return {
    externalEffects: "NONE",
    liveCrmWiring: REPLY_CRM_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
  };
}

/**
 * Evaluate post-send CRM failure: retain SENT reply; reconcile CRM; forbid resend.
 * Live-verified / live-CRM-wire claims are refused (NOT_WIRED).
 */
export function evaluateReplySentCrmFailure(input: {
  message: MessageRecord;
  crmAttempt: CrmAttemptOutcome;
  /** Optional canary intent used when CRM failed (reconcile path). */
  crmIntent?: CanaryIntent;
  /** Remote receipts observed during reconcile (may be empty on failure). */
  crmReceipts?: readonly CanaryRemoteReceipt[];
  expectedModuleId?: string;
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — live CRM provider stays NOT_WIRED. */
  requestLiveCrmWire?: boolean;
}): ReplyCrmReconcileDecision {
  if (input.claimLiveVerified === true) {
    return {
      allowed: false,
      code: "LIVE_CRM_CLAIM_REFUSED",
      replyAction: "none",
      crmAction: "none",
      resendAllowed: false,
      reasons: [
        "Live VERIFIED reply+CRM claims are forbidden — fixture ACCEPTED only (T-X054)",
        "liveCrmWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      reconcile: null,
      ...baseHonesty(),
    };
  }
  if (input.requestLiveCrmWire === true) {
    return {
      allowed: false,
      code: "LIVE_CRM_CLAIM_REFUSED",
      replyAction: "none",
      crmAction: "none",
      resendAllowed: false,
      reasons: [
        "Live CRM provider remains NOT_WIRED — refuse live CRM wiring (T-X054)",
        "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
      ],
      reconcile: null,
      ...baseHonesty(),
    };
  }
  // Trusted fixture boundary — never assert fixture honesty on non-fixture messages.
  if (input.message.fixtureOnly !== true) {
    return {
      allowed: false,
      code: "LIVE_CRM_CLAIM_REFUSED",
      replyAction: "none",
      crmAction: "none",
      resendAllowed: false,
      reasons: [
        "Non-fixture message refused — T-X054 honesty fields are fixture-only (fixtureOnly required)",
        "liveCrmWiring=NOT_WIRED ACCEPTED≠VERIFIED externalEffects=NONE",
      ],
      reconcile: null,
      ...baseHonesty(),
    };
  }

  if (input.message.direction !== MessageDirection.OUTBOUND) {
    return {
      allowed: false,
      code: "REPLY_NOT_SENT",
      replyAction: "none",
      crmAction: "none",
      resendAllowed: false,
      reasons: ["Only outbound replies participate in reply+CRM reconcile"],
      reconcile: null,
      ...baseHonesty(),
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
      ...baseHonesty(),
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
        "liveCrmWiring=NOT_WIRED",
        "ACCEPTED≠VERIFIED",
      ],
      reconcile: null,
      ...baseHonesty(),
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
        : ["CRM fail without intent — still retain_sent; resend forbidden"]),
      "liveCrmWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED",
      "ACCEPTED≠VERIFIED",
    ],
    reconcile,
    ...baseHonesty(),
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
