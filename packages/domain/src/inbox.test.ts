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
  evaluateUnknownPolicyQuestion,
  evaluateUnknownPolicyQuestionAttackSuite,
  UNKNOWN_POLICY_QUESTION_RELATED_CASE_IDS,
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
    expect(takeover.liveProviderWiring).toBe("NOT_WIRED");
    expect(takeover.externalEffects).toBe("NONE");

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
    if (!sendGate.allowed) {
      expect(sendGate.code).toBe("CONVERSATION_TAKEOVER");
    }
  });

  it("T-X053 pure version race yields VERSION_MISMATCH", () => {
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

    const raced = {
      ...conversation,
      version: conversation.version + 1,
    };
    const raceGate = evaluateOutboundSendGate({
      conversation: raced,
      message: queued.message,
      policy,
      sentAgentMessageCount: 0,
      bookingEvidence: [],
      nowIso: now,
    });
    expect(raceGate.allowed).toBe(false);
    if (!raceGate.allowed) {
      expect(raceGate.code).toBe("VERSION_MISMATCH");
    }
  });

  it("takeover cancels multi-queue and preserves SENT; queue-after fails", () => {
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

    const q1 = queueOutboundReply({
      messageId: "out-1",
      conversation,
      draft: draft.draft,
      nowIso: now,
    });
    const q2 = queueOutboundReply({
      messageId: "out-2",
      conversation,
      draft: { ...draft.draft, draftId: "d-shadow" },
      nowIso: now,
    });
    expect(q1.ok && q2.ok).toBe(true);
    if (!q1.ok || !q2.ok) return;

    const sent = {
      ...q1.message,
      messageId: "out-sent",
      sendStatus: MessageSendStatus.SENT,
      sentAtIso: now,
    };

    let state = emptyInboxState(now);
    state = {
      ...state,
      responsePolicy: policy,
      conversations: [conversation],
      messages: [q1.message, q2.message, sent],
      drafts: [draft.draft],
    };

    const takeover = applyConversationTakeover({
      state,
      conversationId: "c1",
      nowIso: now,
    });
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) return;
    expect(takeover.cancelledMessageIds.sort()).toEqual(["out-1", "out-2"]);
    expect(
      takeover.state.messages.find((m) => m.messageId === "out-sent")
        ?.sendStatus,
    ).toBe(MessageSendStatus.SENT);

    const after = queueOutboundReply({
      messageId: "out-after",
      conversation: takeover.conversation,
      draft: {
        ...draft.draft,
        draftId: "d-after",
        preparedAtVersion: takeover.conversation.version,
        invalidatedAtIso: null,
      },
      nowIso: now,
    });
    expect(after.ok).toBe(false);
    if (!after.ok) {
      expect(after.code).toBe("CONVERSATION_TAKEOVER");
    }
  });

  it("escalates unknown policy questions without promising an answer", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = defaultResponsePolicy(now);

    const unknown = evaluateUnknownPolicyQuestion({
      questionId: "undocumented_cancellation_guarantee",
      policy,
    });
    expect(unknown.allowed).toBe(false);
    if (!unknown.allowed) {
      expect(unknown.code).toBe("UNKNOWN_POLICY_QUESTION");
      expect(unknown.escalateWithoutPromise).toBe(true);
      expect(unknown.liveProviderWiring).toBe("NOT_WIRED");
      expect(unknown.externalEffects).toBe("NONE");
    }

    const allowed = evaluateUnknownPolicyQuestion({
      questionId: "documented_policies",
      policy,
    });
    expect(allowed.allowed).toBe(true);
    if (allowed.allowed) {
      expect(allowed.liveProviderWiring).toBe("NOT_WIRED");
      expect(allowed.externalEffects).toBe("NONE");
    }

    const refusedDraft = prepareConciergeReply({
      draftId: "d-unknown",
      conversation,
      inboundBody: "Can you guarantee a full refund if I cancel anytime?",
      citedFactIds: ["fact-hours"],
      factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      policy,
      bookingEvidence: [],
      questionId: "undocumented_cancellation_guarantee",
      nowIso: now,
    });
    expect(refusedDraft.ok).toBe(false);
    if (!refusedDraft.ok) {
      expect(refusedDraft.code).toBe("UNKNOWN_POLICY_QUESTION");
    }

    const { handoff, conversation: handed } = createHandoff({
      handoffId: "ho-unknown-policy",
      conversation,
      reason: "Unknown policy question — escalate without promise",
      nextOwner: policy.escalationOwner,
      customerQuestions: [
        "Can you guarantee a full refund if I cancel anytime?",
      ],
      verifiedAnswers: [],
      requestedAction: "Owner answers undocumented policy; do not invent coverage",
      nowIso: now,
    });
    expect(handoff.verifiedAnswers).toEqual([]);
    expect(handed.agentSendAllowed).toBe(false);
    expect(handed.humanOwned).toBe(true);
  });

  it("unknown-policy attack suite covers allowed + unknown/empty with NOT_WIRED", () => {
    const policy = defaultResponsePolicy(now);
    const conversation = createConversation({
      conversationId: "c-suite",
      providerThreadId: "thr-suite",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const suite = evaluateUnknownPolicyQuestionAttackSuite({
      policy,
      draftProbe: {
        conversation,
        nowIso: now,
        citedFactIds: ["fact-hours"],
        factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
      },
    });
    expect(suite.passed).toBe(true);
    expect(
      suite.details.some((d) => /liveProviderWiring=NOT_WIRED/i.test(d)),
    ).toBe(true);
    expect(
      suite.details.some((d) =>
        /prepareConciergeReply questionId="" → UNKNOWN_POLICY_QUESTION/.test(d),
      ),
    ).toBe(true);
    expect([...UNKNOWN_POLICY_QUESTION_RELATED_CASE_IDS]).toEqual(["T-X055"]);
  });

  it("prepareConciergeReply routes empty/whitespace questionId through unknown-policy gate", () => {
    const conversation = createConversation({
      conversationId: "c-empty-qid",
      providerThreadId: "thr-empty",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = defaultResponsePolicy(now);
    for (const questionId of ["", "   "] as const) {
      const refused = prepareConciergeReply({
        draftId: `d-empty-${questionId.length}`,
        conversation,
        inboundBody: "What is your cancellation policy?",
        citedFactIds: ["fact-hours"],
        factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
        policy,
        bookingEvidence: [],
        questionId,
        nowIso: now,
      });
      expect(refused.ok).toBe(false);
      if (!refused.ok) {
        expect(refused.code).toBe("UNKNOWN_POLICY_QUESTION");
      }
    }
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
    expect(first.ok).toBe(true);
    if (!first.ok) return;
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
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.duplicate).toBe(true);
    expect(second.message.messageId).toBe(first.message.messageId);
    expect(second.state.messages).toHaveLength(1);
    expect(second.state.webhookEvents).toHaveLength(1);
  });

  it("records a new providerEventId when providerMessageId already exists", () => {
    const first = ingestFixtureWebhook({
      state: emptyInboxState(now),
      eventId: "e1",
      providerEventId: "wh-1",
      providerThreadId: "thr-wh",
      providerMessageId: "pm-shared",
      body: "Need a room Friday",
      customerDisplayName: "Alex",
      messageId: "m-wh-1",
      nowIso: now,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = ingestFixtureWebhook({
      state: first.state,
      eventId: "e2",
      providerEventId: "wh-2",
      providerThreadId: "thr-wh",
      providerMessageId: "pm-shared",
      body: "Need a room Friday",
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      messageId: "m-wh-2",
      nowIso: now,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.duplicate).toBe(true);
    expect(second.eventRecorded).toBe(true);
    expect(second.state.messages).toHaveLength(1);
    expect(second.state.webhookEvents).toHaveLength(2);
    expect(second.conversation.customerEmail).toBe("alex@example.com");
  });

  it("coalesces leads by inbound message / event key only after CRM success", () => {
    const conversation = createConversation({
      conversationId: "c1",
      providerThreadId: "thr-1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      nowIso: now,
    });
    const denied = createQualifiedLead({
      leadId: "lead-denied",
      conversation,
      correlationId: "corr-denied",
      email: "alex@example.com",
      displayName: "Alex",
      sourceInboundMessageId: "m1",
      providerEventId: "wh-1",
      nowIso: now,
    });
    expect(
      findCoalescedLead({
        leads: [denied],
        conversationId: "c1",
        sourceInboundMessageId: "m1",
      }),
    ).toBeNull();

    const lead = { ...denied, leadId: "lead-1", crmRecordId: "zoho-fixture-1" };
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

  it("rejects conflicting conversationId vs providerThreadId on webhook ingest", () => {
    let state = emptyInboxState(now);
    const a = createConversation({
      conversationId: "conv-a",
      providerThreadId: "thr-a",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "A",
      nowIso: now,
    });
    const b = createConversation({
      conversationId: "conv-b",
      providerThreadId: "thr-b",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "B",
      nowIso: now,
    });
    state = { ...state, conversations: [a, b] };
    const conflict = ingestFixtureWebhook({
      state,
      eventId: "e-conflict",
      providerEventId: "wh-conflict",
      providerThreadId: "thr-b",
      providerMessageId: "pm-conflict",
      body: "hello",
      customerDisplayName: "A",
      conversationId: "conv-a",
      messageId: "m-conflict",
      nowIso: now,
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) expect(conflict.code).toBe("CONFLICTING_CONVERSATION_IDS");
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
