/**
 * Fixture proof for T-X054 — reply SENT but CRM fails → CRM reconciles;
 * outbound retained; no resend. Hillclimb: liveCrmWiring NOT_WIRED;
 * refuse live VERIFIED / live CRM wire; DELIVERED + inbound + no-intent
 * paths; module mismatch still no resend. External effects: NONE.
 * Never invents live VERIFIED.
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
  if (
    notSent.allowed === false &&
    notSent.code === "REPLY_NOT_SENT" &&
    notSent.liveCrmWiring === "NOT_WIRED" &&
    notSent.externalEffects === "NONE"
  ) {
    details.push(
      "QUEUED reply → REPLY_NOT_SENT (gate requires SENT first; liveCrmWiring=NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(`Queued gate unexpectedly ${JSON.stringify(notSent)}`);
  }

  // Inbound refused.
  const inbound = {
    ...sent,
    direction: MessageDirection.INBOUND,
    sendStatus: MessageSendStatus.DELIVERED,
  };
  const inboundGate = evaluateReplySentCrmFailure({
    message: inbound,
    crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
  });
  if (
    inboundGate.allowed === false &&
    inboundGate.code === "REPLY_NOT_SENT" &&
    inboundGate.resendAllowed === false
  ) {
    details.push("INBOUND message → REPLY_NOT_SENT (outbound only)");
  } else {
    passed = false;
    details.push(`Inbound gate unexpectedly ${JSON.stringify(inboundGate)}`);
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
    failed.reconcile.verdict === ProbeVerdict.FAILURE &&
    failed.liveCrmWiring === "NOT_WIRED" &&
    failed.liveProviderSuccessClaimed === false &&
    failed.chatgptAdsAccess === "ACCESS_BLOCKED"
  ) {
    details.push(
      "SENT + CRM fail → CRM_RECONCILE_NO_RESEND; MISSING_REMOTE; resendAllowed=false; liveCrmWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`CRM-fail gate unexpectedly ${JSON.stringify(failed)}`);
  }

  // DELIVERED + CRM fail still retain / no resend.
  const delivered = {
    ...sent,
    sendStatus: MessageSendStatus.DELIVERED,
    deliveredAtIso: nowIso,
  };
  const deliveredFail = evaluateReplySentCrmFailure({
    message: delivered,
    crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
    crmIntent: intent,
    crmReceipts: [],
  });
  if (
    deliveredFail.allowed === true &&
    deliveredFail.code === "CRM_RECONCILE_NO_RESEND" &&
    deliveredFail.resendAllowed === false &&
    deliveredFail.replyAction === "retain_sent"
  ) {
    details.push("DELIVERED + CRM fail → retain_sent; resendAllowed=false");
  } else {
    passed = false;
    details.push(
      `DELIVERED CRM-fail unexpectedly ${JSON.stringify(deliveredFail)}`,
    );
  }

  // CRM fail without intent still no resend.
  const noIntent = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
  });
  if (
    noIntent.allowed === true &&
    noIntent.code === "CRM_RECONCILE_NO_RESEND" &&
    noIntent.resendAllowed === false &&
    noIntent.reconcile === null
  ) {
    details.push(
      "CRM fail without intent → CRM_RECONCILE_NO_RESEND; reconcile=null; still no resend",
    );
  } else {
    passed = false;
    details.push(`No-intent CRM-fail unexpectedly ${JSON.stringify(noIntent)}`);
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

  // Module mismatch still forbids resend.
  const mismatch = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: false, reason: "prior CRM fail — reconcile retry" },
    crmIntent: intent,
    expectedModuleId: "Leads",
    crmReceipts: [
      {
        receiptId: `rcpt-mm-${randomUUID().slice(0, 8)}`,
        correlationId: intent.correlationId,
        moduleId: "Contacts",
        recordId: `crm-mm-${randomUUID().slice(0, 8)}`,
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot: {
          Email: email,
          ws_synthetic: "true",
          ws_correlation_id: intent.correlationId,
        },
      },
    ],
  });
  if (
    mismatch.allowed === true &&
    mismatch.resendAllowed === false &&
    mismatch.replyAction === "retain_sent" &&
    mismatch.reconcile != null &&
    mismatch.reconcile.status !== ReconciliationStatus.MATCHED
  ) {
    details.push(
      "module mismatch on reconcile → still retain_sent; resendAllowed=false",
    );
  } else {
    passed = false;
    details.push(`Module-mismatch unexpectedly ${JSON.stringify(mismatch)}`);
  }

  // Positive control: CRM ok still forbids resend.
  const crmOk = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: true, crmRecordId: "crm-ok-1" },
  });
  if (
    crmOk.code === "CRM_OK" &&
    crmOk.resendAllowed === false &&
    crmOk.replyAction === "retain_sent" &&
    crmOk.liveCrmWiring === "NOT_WIRED"
  ) {
    details.push(
      "Positive control: CRM_OK still forbids outbound resend (liveCrmWiring=NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(`CRM_OK unexpectedly ${JSON.stringify(crmOk)}`);
  }

  // Live VERIFIED / live CRM wire claims refused.
  const liveVerified = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: true, crmRecordId: "crm-live" },
    claimLiveVerified: true,
  });
  const liveWire = evaluateReplySentCrmFailure({
    message: sent,
    crmAttempt: { ok: false, reason: "fixture" },
    requestLiveCrmWire: true,
  });
  if (
    liveVerified.allowed === false &&
    liveVerified.code === "LIVE_CRM_CLAIM_REFUSED" &&
    liveWire.allowed === false &&
    liveWire.code === "LIVE_CRM_CLAIM_REFUSED" &&
    liveWire.liveCrmWiring === "NOT_WIRED"
  ) {
    details.push(
      "claimLiveVerified / requestLiveCrmWire → LIVE_CRM_CLAIM_REFUSED (NOT_WIRED)",
    );
  } else {
    passed = false;
    details.push(
      `live claims unexpectedly verified=${JSON.stringify(liveVerified)} wire=${JSON.stringify(liveWire)}`,
    );
  }

  // Non-fixture message refused before fixture honesty fields can mislabel a live write.
  const nonFixture = evaluateReplySentCrmFailure({
    message: { ...sent, fixtureOnly: false },
    crmAttempt: { ok: true, crmRecordId: "crm-non-fixture" },
  });
  if (
    nonFixture.allowed === false &&
    nonFixture.code === "LIVE_CRM_CLAIM_REFUSED" &&
    nonFixture.resendAllowed === false &&
    nonFixture.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "fixtureOnly=false → LIVE_CRM_CLAIM_REFUSED (fixture boundary before honesty fields)",
    );
  } else {
    passed = false;
    details.push(`non-fixture unexpectedly ${JSON.stringify(nonFixture)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveCrmWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE ACCEPTED≠VERIFIED",
  );

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
