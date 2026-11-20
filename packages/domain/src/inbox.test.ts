import { describe, expect, it } from "vitest";
import { SupportLabel } from "./knowledge.js";
import {
  BookingClaimKind,
  ConversationStatus,
  InboxChannel,
  LeadQualification,
  MessageSendStatus,
  applyConversationTakeover,
  confirmOutboundDelivery,
  countAgentMessages,
  createConversation,
  createHandoff,
  createQualifiedLead,
  defaultResponsePolicy,
  detectDuplicateOutbound,
  emptyInboxState,
  evaluateBookingClaim,
  evaluateOutboundSendGate,
  findCoalescedLead,
  ingestFixtureWebhook,
  ingestInboundMessage,
  prepareConciergeReply,
  queueOutboundReply,
} from "./inbox.js";

const now = "2026-11-20T02:00:00.000Z";

describe("inbox domain", () => {
  it("deduplicates inbound by provider message id", () => {
    let state = emptyInboxState(now);
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      nowIso: now,
    });
    state = { ...state, conversations: [conversation] };

    const first = ingestInboundMessage({
      state,
      conversation,
      messageId: "m1",
      providerMessageId: "prov-1",
      body: "Do you have a training room Friday?",
      nowIso: now,
    });
    expect(first.duplicate).toBe(false);

    const second = ingestInboundMessage({
      state: first.state,
      conversation: first.conversation,
      messageId: "m2",
      providerMessageId: "prov-1",
      body: "Do you have a training room Friday?",
      nowIso: now,
    });
    expect(second.duplicate).toBe(true);
    expect(second.message.messageId).toBe("m1");
    expect(second.state.messages).toHaveLength(1);
  });

  it("grounds concierge drafts in SUPPORTED facts only", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = defaultResponsePolicy(now);
    const denied = prepareConciergeReply({
      draftId: "d1",
      conversation,
      inboundBody: "What are your hours?",
      citedFactIds: ["fact-hypothesis"],
      factLabels: new Map([["fact-hypothesis", SupportLabel.HYPOTHESIS]]),
      policy,
      bookingEvidence: [],
      nowIso: now,
    });
    expect(denied.ok).toBe(false);

    const ok = prepareConciergeReply({
      draftId: "d2",
      conversation,
      inboundBody: "What are your hours?",
      citedFactIds: ["fact-hours"],
      factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      policy,
      bookingEvidence: [],
      nowIso: now,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.draft.preparedAtVersion).toBe(1);
      expect(ok.draft.body).toContain("virtual assistant");
    }
  });

  it("takeover increments version and cancels queued replies", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = defaultResponsePolicy(now);
    const draft = prepareConciergeReply({
      draftId: "d1",
      conversation,
      inboundBody: "Need a room",
      citedFactIds: ["fact-hours"],
      factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      policy,
      bookingEvidence: [],
      nowIso: now,
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const queued = queueOutboundReply({
      messageId: "out-1",
      conversation,
      draft: draft.draft,
      nowIso: now,
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    let state = emptyInboxState(now);
    state = {
      ...state,
      responsePolicy: policy,
      conversations: [conversation],
      messages: [queued.message],
      drafts: [draft.draft],
    };

    const takeover = applyConversationTakeover({
      state,
      conversationId: "c1",
      nowIso: now,
    });
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) return;
    expect(takeover.conversation.version).toBe(2);
    expect(takeover.conversation.humanOwned).toBe(true);
    expect(takeover.conversation.agentSendAllowed).toBe(false);
    expect(takeover.cancelledMessageIds).toEqual(["out-1"]);
    expect(takeover.invalidatedDraftIds).toEqual(["d1"]);
    expect(takeover.state.messages[0]!.sendStatus).toBe(
      MessageSendStatus.BLOCKED_TAKEOVER,
    );
    expect(takeover.state.drafts[0]!.invalidatedAtIso).toBe(now);
    expect(takeover.state.ownershipEvents).toHaveLength(1);

    const sendGate = evaluateOutboundSendGate({
      conversation: takeover.conversation,
      message: {
        ...queued.message,
        sendStatus: MessageSendStatus.QUEUED,
      },
      policy,
      sentAgentMessageCount: 0,
      bookingEvidence: [],
      nowIso: now,
    });
    expect(sendGate.allowed).toBe(false);
  });

  it("rejects human-request drafts and requires booking URL for links", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = defaultResponsePolicy(now);
    const human = prepareConciergeReply({
      draftId: "d-h",
      conversation,
      inboundBody: "Please let me speak to a human about a refund",
      citedFactIds: ["fact-hours"],
      factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      policy,
      bookingEvidence: [],
      nowIso: now,
    });
    expect(human.ok).toBe(false);
    if (!human.ok) expect(human.code).toBe("HUMAN_REQUESTED");

    const noUrl = prepareConciergeReply({
      draftId: "d-link",
      conversation,
      inboundBody: "Need a booking link",
      citedFactIds: ["fact-hours"],
      factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      policy,
      bookingEvidence: [],
      bookingClaim: BookingClaimKind.AVAILABILITY_LINK,
      nowIso: now,
    });
    expect(noUrl.ok).toBe(false);

    const withUrl = prepareConciergeReply({
      draftId: "d-link-ok",
      conversation,
      inboundBody: "Need a booking link",
      citedFactIds: ["fact-hours"],
      factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      policy,
      bookingEvidence: [],
      bookingClaim: BookingClaimKind.AVAILABILITY_LINK,
      bookingLinkUrl: "https://fixture.worksocial.local/book",
      nowIso: now,
    });
    expect(withUrl.ok).toBe(true);
    if (withUrl.ok) {
      expect(withUrl.draft.body).toContain("https://fixture.worksocial.local/book");
    }
  });

  it("rejects reservation without booking evidence", () => {
    const denied = evaluateBookingClaim({
      claim: BookingClaimKind.RESERVATION,
      conversationId: "c1",
      bookingEvidence: [],
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.code).toBe("BOOKING_EVIDENCE_REQUIRED");
    }

    const allowed = evaluateBookingClaim({
      claim: BookingClaimKind.TOUR_REQUEST,
      conversationId: "c1",
      bookingEvidence: [],
    });
    expect(allowed.allowed).toBe(true);

    const withEvidence = evaluateBookingClaim({
      claim: BookingClaimKind.RESERVATION,
      conversationId: "c1",
      bookingEvidence: [
        {
          evidenceId: "be1",
          conversationId: "c1",
          providerReceiptId: "bk-123",
          claimKind: BookingClaimKind.RESERVATION,
          verified: true,
          observedAtIso: now,
        },
      ],
    });
    expect(withEvidence.allowed).toBe(true);
  });

  it("creates qualified lead and morning handoff", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      nowIso: now,
    });
    const lead = createQualifiedLead({
      leadId: "lead-1",
      conversation,
      correlationId: "corr-1",
      email: "alex@example.com",
      displayName: "Alex",
      locationNeed: "Jersey City",
      sizeNeed: "12",
      nowIso: now,
    });
    expect(lead.synthetic).toBe(true);
    expect(lead.qualification).toBe(LeadQualification.QUALIFIED);

    const { handoff, conversation: handed } = createHandoff({
      handoffId: "ho-1",
      conversation,
      reason: "Customer requested human",
      nextOwner: "owner-morning-desk",
      customerQuestions: ["Need a room Friday"],
      verifiedAnswers: ["Shared booking link"],
      requestedAction: "Call back",
      nowIso: now,
    });
    expect(handed.status).toBe(ConversationStatus.HANDED_OFF);
    expect(handed.agentSendAllowed).toBe(false);
    expect(handoff.acknowledged).toBe(false);
  });

  it("detects duplicate outbound within suppression window", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const msg = {
      messageId: "m1",
      conversationId: conversation.conversationId,
      providerMessageId: null,
      direction: "outbound" as const,
      body: "Same reply",
      sender: "agent" as const,
      preparedAtVersion: 1,
      sendStatus: MessageSendStatus.SENT,
      citedFactIds: [],
      gatewayOperationId: null,
      bookingClaim: null,
      fixtureOnly: true,
      createdAtIso: now,
      sentAtIso: now,
      deliveredAtIso: null,
    };
    expect(
      detectDuplicateOutbound({
        messages: [msg],
        conversationId: "c1",
        body: "Same reply",
        nowIso: now,
        windowSec: 300,
      }),
    ).toBe(true);
    expect(countAgentMessages([msg], "c1")).toBe(1);
  });

  it("coalesces duplicate fixture webhooks by providerEventId", () => {
    let state = emptyInboxState(now);
    const first = ingestFixtureWebhook({
      state,
      eventId: "e1",
      providerEventId: "wh-1",
      providerThreadId: "thr-wh",
      providerMessageId: "pm-1",
      body: "Need a room Friday",
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      messageId: "m-wh-1",
      nowIso: now,
    });
    expect(first.duplicate).toBe(false);
    expect(first.state.messages).toHaveLength(1);
    expect(first.state.webhookEvents).toHaveLength(1);

    const second = ingestFixtureWebhook({
      state: first.state,
      eventId: "e2",
      providerEventId: "wh-1",
      providerThreadId: "thr-wh",
      providerMessageId: "pm-1",
      body: "Need a room Friday",
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      messageId: "m-wh-2",
      nowIso: now,
    });
    expect(second.duplicate).toBe(true);
    expect(second.message.messageId).toBe(first.message.messageId);
    expect(second.state.messages).toHaveLength(1);
    expect(second.state.webhookEvents).toHaveLength(1);
  });

  it("coalesces leads by inbound message / event key", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      nowIso: now,
    });
    const lead = createQualifiedLead({
      leadId: "lead-1",
      conversation,
      correlationId: "corr-1",
      email: "alex@example.com",
      displayName: "Alex",
      sourceInboundMessageId: "m1",
      providerEventId: "wh-1",
      nowIso: now,
    });
    expect(
      findCoalescedLead({
        leads: [lead],
        conversationId: "c1",
        sourceInboundMessageId: "m1",
      })?.leadId,
    ).toBe("lead-1");
    expect(
      findCoalescedLead({
        leads: [lead],
        conversationId: "c1",
        providerEventId: "wh-1",
      })?.leadId,
    ).toBe("lead-1");
    expect(
      findCoalescedLead({
        leads: [lead],
        conversationId: "c1",
        sourceInboundMessageId: "other",
      }),
    ).toBeNull();
  });

  it("confirms delivery only after sent", () => {
    const queued = {
      messageId: "out-1",
      conversationId: "c1",
      providerMessageId: null,
      direction: "outbound" as const,
      body: "Hello",
      sender: "agent" as const,
      preparedAtVersion: 1,
      sendStatus: MessageSendStatus.QUEUED,
      citedFactIds: [],
      gatewayOperationId: null,
      bookingClaim: null,
      fixtureOnly: true,
      createdAtIso: now,
      sentAtIso: null,
      deliveredAtIso: null,
    };
    const denied = confirmOutboundDelivery({ message: queued, nowIso: now });
    expect(denied.ok).toBe(false);

    const sent = { ...queued, sendStatus: MessageSendStatus.SENT, sentAtIso: now };
    const ok = confirmOutboundDelivery({ message: sent, nowIso: now });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.message.sendStatus).toBe(MessageSendStatus.DELIVERED);
      expect(ok.message.deliveredAtIso).toBe(now);
    }
  });
});
