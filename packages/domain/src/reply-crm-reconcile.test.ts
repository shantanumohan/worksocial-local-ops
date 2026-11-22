import { describe, expect, it } from "vitest";
import {
  MessageDirection,
  MessageSendStatus,
  type MessageRecord,
} from "./inbox.js";
import {
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
  });

  it("on CRM fail retains SENT, reconciles CRM, forbids resend", () => {
    const message = sentOutbound();
    const intent = {
      operationId: "op-1",
      writePathId: "wp-inbox-crm",
      formId: "inbox-lead",
      correlationId: "corr-1",
      payloadDigest: "digest-1",
      synthetic: true as const,
      submittedAtIso: "2026-11-22T18:00:02.000Z",
    };
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

    expect(
      assertOutboundResendSuppressed({
        messages: [message],
        conversationId: message.conversationId,
        body: message.body,
        nowIso: "2026-11-22T18:00:30.000Z",
      }),
    ).toBe(true);
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
  });
});
