/**
 * Fixture proof for T-X054 — reply SENT but CRM fails → CRM reconciles;
 * outbound retained; no resend. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  MessageDirection,
  MessageSendStatus,
  ProbeVerdict,
  ReconciliationStatus,
  SoakProofKind,
  assertOutboundResendSuppressed,
  evaluateReplySentCrmFailure,
  isMissingRemoteReconcile,
  type CanaryIntent,
  type MessageRecord,
  type SoakProofRecord,
} from "@worksocial/domain";

function fixtureSentReply(nowIso: string): MessageRecord {
  return {
    messageId: `msg-${randomUUID().slice(0, 8)}`,
    conversationId: `conv-${randomUUID().slice(0, 8)}`,
    providerMessageId: `prov-${randomUUID().slice(0, 8)}`,
    direction: MessageDirection.OUTBOUND,
    body: "Thanks for writing — a teammate will follow up during business hours.",
    sender: "agent",
    preparedAtVersion: 1,
    sendStatus: MessageSendStatus.SENT,
    citedFactIds: ["fact-hours"],
    gatewayOperationId: `gw-${randomUUID().slice(0, 8)}`,
    bookingClaim: null,
    fixtureOnly: true,
    createdAtIso: nowIso,
    sentAtIso: nowIso,
    deliveredAtIso: null,
  };
}

/**
 * Complete expected proof set for T-X054 fixture ACCEPTED.
 */
export function proofReplySentCrmReconcilesNoResend(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const sent = fixtureSentReply(nowIso);
  const intent: CanaryIntent = {
    operationId: `op-crm-${randomUUID().slice(0, 8)}`,
    writePathId: "wp-inbox-crm-lead",
    formId: "inbox-lead",
    correlationId: `corr-${randomUUID().slice(0, 8)}`,
    payloadDigest: "fixture-reply-crm-digest",
    synthetic: true,
    submittedAtIso: nowIso,
  };

  // Queued reply cannot enter the post-send CRM reconcile path.
  const queued = {
    ...sent,
    sendStatus: MessageSendStatus.QUEUED,
    sentAtIso: null,
  };
  const notSent = evaluateReplySentCrmFailure({
    message: queued,
    crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
  });
  if (notSent.allowed === false && notSent.code === "REPLY_NOT_SENT") {
    details.push("QUEUED reply → REPLY_NOT_SENT (gate requires SENT first)");
  } else {
    passed = false;
    details.push(`Queued gate unexpectedly ${JSON.stringify(notSent)}`);
  }

  // SENT + CRM fail → retain_sent, reconcile CRM, resendAllowed=false.
  const failed = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
    crmIntent: intent,
    crmReceipts: [],
  });
  if (
    failed.allowed === true &&
    failed.code === "CRM_RECONCILE_NO_RESEND" &&
    failed.replyAction === "retain_sent" &&
    failed.crmAction === "reconcile_or_retry" &&
    failed.resendAllowed === false &&
    isMissingRemoteReconcile(failed.reconcile) &&
    failed.reconcile?.status === ReconciliationStatus.MISSING_REMOTE &&
    failed.reconcile.verdict === ProbeVerdict.FAILURE
  ) {
    details.push(
      "SENT + CRM fail → CRM_RECONCILE_NO_RESEND; MISSING_REMOTE; resendAllowed=false",
    );
  } else {
    passed = false;
    details.push(`CRM-fail gate unexpectedly ${JSON.stringify(failed)}`);
  }

  // Same-body resend suppressed while SENT retained.
  const suppressed = assertOutboundResendSuppressed({
    messages: [sent],
    conversationId: sent.conversationId,
    body: sent.body,
    nowIso,
  });
  if (suppressed) {
    details.push("detectDuplicateOutbound suppresses same-body resend after SENT");
  } else {
    passed = false;
    details.push("Expected outbound resend suppression after SENT");
  }

  // Later matched CRM receipt reconciles without changing reply status / without resend.
  const email = `canary+${intent.correlationId}@worksocial.test.local`;
  const reconciled = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: false, reason: "prior CRM fail — reconcile retry" },
    crmIntent: intent,
    crmReceipts: [
      {
        receiptId: `rcpt-${randomUUID().slice(0, 8)}`,
        correlationId: intent.correlationId,
        moduleId: "Leads",
        recordId: `crm-${randomUUID().slice(0, 8)}`,
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot: {
          Email: email,
          Last_Name: "Canary",
          ws_synthetic: "true",
          ws_correlation_id: intent.correlationId,
        },
      },
    ],
  });
  if (
    reconciled.allowed === true &&
    reconciled.resendAllowed === false &&
    reconciled.replyAction === "retain_sent" &&
    reconciled.reconcile?.status === ReconciliationStatus.MATCHED &&
    reconciled.reconcile.verdict === ProbeVerdict.SUCCESS &&
    sent.sendStatus === MessageSendStatus.SENT
  ) {
    details.push(
      "CRM reconcile MATCHED on retry; outbound remains SENT; still no resend",
    );
  } else {
    passed = false;
    details.push(`Reconcile-retry unexpectedly ${JSON.stringify(reconciled)}`);
  }

  // Positive control: CRM ok still forbids resend.
  const crmOk = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: true, crmRecordId: "crm-ok-1" },
  });
  if (
    crmOk.code === "CRM_OK" &&
    crmOk.resendAllowed === false &&
    crmOk.replyAction === "retain_sent"
  ) {
    details.push("Positive control: CRM_OK still forbids outbound resend");
  } else {
    passed = false;
    details.push(`CRM_OK unexpectedly ${JSON.stringify(crmOk)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-reply-crm-${randomUUID()}`,
    kind: SoakProofKind.REPLY_SENT_CRM_RECONCILES_NO_RESEND,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx054-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
