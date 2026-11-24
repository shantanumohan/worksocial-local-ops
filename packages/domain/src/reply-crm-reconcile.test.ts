import { describe, expect, it } from "vitest";
import {
  MessageDirection,
  MessageSendStatus,
  type MessageRecord,
} from "./inbox.js";
import {
  REPLY_CRM_LIVE_WIRING,
  assertOutboundResendSuppressed,
  evaluateReplySentCrmFailure,
  isMissingRemoteReconcile,
} from "./reply-crm-reconcile.js";

function sentOutbound(overrides: Partial<MessageRecord> = {}): MessageRecord {
  return {
    messageId: "msg-1",
    conversationId: "conv-1",
    providerMessageId: "prov-1",
    direction: MessageDirection.OUTBOUND,
    body: "Thanks — a teammate will follow up shortly.",
    sender: "agent",
    preparedAtVersion: 1,
    sendStatus: MessageSendStatus.SENT,
    citedFactIds: [],
    gatewayOperationId: "gw-1",
    bookingClaim: null,
    fixtureOnly: true,
    createdAtIso: "2026-11-22T18:00:00.000Z",
    sentAtIso: "2026-11-22T18:00:01.000Z",
    deliveredAtIso: null,
    ...overrides,
  };
}

const intent = {
  operationId: "op-1",
  writePathId: "wp-inbox-crm",
  formId: "inbox-lead",
  correlationId: "corr-1",
  payloadDigest: "digest-1",
  synthetic: true as const,
  submittedAtIso: "2026-11-22T18:00:02.000Z",
};

describe("reply-crm-reconcile (T-X054)", () => {
  it("requires SENT/DELIVERED before CRM reconcile path", () => {
    const queued = sentOutbound({ sendStatus: MessageSendStatus.QUEUED });
    const d = evaluateReplySentCrmFailure({
      message: queued,
      crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("REPLY_NOT_SENT");
    expect(d.resendAllowed).toBe(false);
    expect(d.liveCrmWiring).toBe(REPLY_CRM_LIVE_WIRING);
    expect(d.externalEffects).toBe("NONE");
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("refuses inbound messages", () => {
    const inbound = sentOutbound({
      direction: MessageDirection.INBOUND,
      sendStatus: MessageSendStatus.DELIVERED,
    });
    const d = evaluateReplySentCrmFailure({
      message: inbound,
      crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("REPLY_NOT_SENT");
    expect(d.resendAllowed).toBe(false);
    expect(d.liveCrmWiring).toBe("NOT_WIRED");
  });

  it("DELIVERED + CRM fail retains outbound and forbids resend", () => {
    const message = sentOutbound({
      sendStatus: MessageSendStatus.DELIVERED,
      deliveredAtIso: "2026-11-22T18:00:05.000Z",
    });
    const d = evaluateReplySentCrmFailure({
      message,
      crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
      crmIntent: intent,
      crmReceipts: [],
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("CRM_RECONCILE_NO_RESEND");
    expect(d.replyAction).toBe("retain_sent");
    expect(d.resendAllowed).toBe(false);
    expect(d.reasons.some((r) => /delivered/i.test(r))).toBe(true);
    expect(d.liveCrmWiring).toBe("NOT_WIRED");
  });

  it("on CRM fail retains SENT, reconciles CRM, forbids resend", () => {
    const message = sentOutbound();
    const d = evaluateReplySentCrmFailure({
      message,
      crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
      crmIntent: intent,
      crmReceipts: [],
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("CRM_RECONCILE_NO_RESEND");
    expect(d.replyAction).toBe("retain_sent");
    expect(d.crmAction).toBe("reconcile_or_retry");
    expect(d.resendAllowed).toBe(false);
    expect(isMissingRemoteReconcile(d.reconcile)).toBe(true);
    expect(d.externalEffects).toBe("NONE");
    expect(d.liveCrmWiring).toBe("NOT_WIRED");
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expect(d.reasons.some((r) => /ACCEPTED≠VERIFIED/.test(r))).toBe(true);

    expect(
      assertOutboundResendSuppressed({
        messages: [message],
        conversationId: message.conversationId,
        body: message.body,
        nowIso: "2026-11-22T18:00:30.000Z",
      }),
    ).toBe(true);
  });

  it("CRM fail without intent still retains SENT and forbids resend", () => {
    const d = evaluateReplySentCrmFailure({
      message: sentOutbound(),
      crmAttempt: { ok: false, reason: "fixture CRM skipWrite" },
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("CRM_RECONCILE_NO_RESEND");
    expect(d.replyAction).toBe("retain_sent");
    expect(d.resendAllowed).toBe(false);
    expect(d.reconcile).toBeNull();
    expect(d.reasons.some((r) => /without intent/.test(r))).toBe(true);
  });

  it("module mismatch on reconcile still forbids outbound resend", () => {
    const message = sentOutbound();
    const d = evaluateReplySentCrmFailure({
      message,
      crmAttempt: { ok: false, reason: "prior CRM fail — reconcile retry" },
      crmIntent: intent,
      expectedModuleId: "Leads",
      crmReceipts: [
        {
          receiptId: "rcpt-1",
          correlationId: intent.correlationId,
          moduleId: "Contacts",
          recordId: "crm-wrong-module",
          synthetic: true,
          observedAtIso: "2026-11-22T18:00:10.000Z",
          source: "fixture_crm",
          fieldSnapshot: {
            Email: "canary@worksocial.test.local",
            ws_synthetic: "true",
            ws_correlation_id: intent.correlationId,
          },
        },
      ],
    });
    expect(d.allowed).toBe(true);
    expect(d.resendAllowed).toBe(false);
    expect(d.replyAction).toBe("retain_sent");
    expect(d.reconcile).not.toBeNull();
    expect(d.reconcile?.status).not.toBe("MATCHED");
  });

  it("CRM success still forbids outbound resend", () => {
    const message = sentOutbound();
    const d = evaluateReplySentCrmFailure({
      message,
      crmAttempt: { ok: true, crmRecordId: "crm-99" },
    });
    expect(d.code).toBe("CRM_OK");
    expect(d.resendAllowed).toBe(false);
    expect(d.replyAction).toBe("retain_sent");
    expect(d.liveCrmWiring).toBe("NOT_WIRED");
    expect(d.liveProviderSuccessClaimed).toBe(false);
  });

  it("refuses claimLiveVerified and requestLiveCrmWire", () => {
    const verified = evaluateReplySentCrmFailure({
      message: sentOutbound(),
      crmAttempt: { ok: true, crmRecordId: "crm-live" },
      claimLiveVerified: true,
    });
    expect(verified.allowed).toBe(false);
    expect(verified.code).toBe("LIVE_CRM_CLAIM_REFUSED");
    expect(verified.resendAllowed).toBe(false);
    expect(verified.reasons.some((r) => /VERIFIED/.test(r))).toBe(true);
    expect(verified.liveCrmWiring).toBe("NOT_WIRED");

    const wire = evaluateReplySentCrmFailure({
      message: sentOutbound(),
      crmAttempt: { ok: false, reason: "fixture" },
      requestLiveCrmWire: true,
    });
    expect(wire.allowed).toBe(false);
    expect(wire.code).toBe("LIVE_CRM_CLAIM_REFUSED");
    expect(wire.reasons.some((r) => /NOT_WIRED/.test(r))).toBe(true);
    expect(wire.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("refuses non-fixture messages before asserting fixture honesty", () => {
    const d = evaluateReplySentCrmFailure({
      message: sentOutbound({ fixtureOnly: false }),
      crmAttempt: { ok: true, crmRecordId: "crm-live-write" },
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("LIVE_CRM_CLAIM_REFUSED");
    expect(d.resendAllowed).toBe(false);
    expect(d.crmAction).toBe("none");
    expect(d.reasons.some((r) => /fixtureOnly/.test(r))).toBe(true);
    expect(d.liveCrmWiring).toBe("NOT_WIRED");
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.externalEffects).toBe("NONE");
  });
});
