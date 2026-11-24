import { describe, expect, it } from "vitest";
import {
  ConversationStatus,
  InboxChannel,
  MessageDirection,
  MessageSendStatus,
  createConversation,
  defaultResponsePolicy,
  evaluateAutomatedResponseLoopBound,
} from "./index.js";

const now = "2026-11-21T18:00:00.000Z"; // Saturday → full coverage window

function queuedOutbound(
  conversationId: string,
  preparedAtVersion: number,
): Parameters<typeof evaluateAutomatedResponseLoopBound>[0]["message"] {
  return {
    messageId: "msg-queued",
    conversationId,
    providerMessageId: null,
    direction: MessageDirection.OUTBOUND,
    body: "Fixture auto-reply",
    sender: "agent",
    preparedAtVersion,
    sendStatus: MessageSendStatus.QUEUED,
    citedFactIds: ["fact-hours"],
    gatewayOperationId: null,
    bookingClaim: null,
    fixtureOnly: true,
    createdAtIso: now,
    sentAtIso: null,
    deliveredAtIso: null,
  };
}

function expectHonesty(
  decision: ReturnType<typeof evaluateAutomatedResponseLoopBound>,
) {
  expect(decision.liveProviderWiring).toBe("NOT_WIRED");
  expect(decision.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  expect(decision.externalEffects).toBe("NONE");
}

describe("automated response loop bound (T-X056)", () => {
  it("allows send under the agent-message bound", () => {
    const conversation = createConversation({
      conversationId: "c-loop",
      providerThreadId: "thr-loop",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = {
      ...defaultResponsePolicy(now),
      maxAgentMessagesPerConversation: 2,
    };
    const decision = evaluateAutomatedResponseLoopBound({
      conversation,
      message: queuedOutbound(conversation.conversationId, conversation.version),
      policy,
      sentAgentMessageCount: 1,
      handoffId: "ho-under",
      nowIso: now,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("WITHIN_BOUND");
    expect(decision.handoffRequired).toBe(false);
    expect(decision.handoff).toBeNull();
    expect(decision.conversation.agentSendAllowed).toBe(true);
    expectHonesty(decision);
  });

  it("refuses at bound and creates a handoff", () => {
    const conversation = createConversation({
      conversationId: "c-loop",
      providerThreadId: "thr-loop",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = {
      ...defaultResponsePolicy(now),
      maxAgentMessagesPerConversation: 2,
    };
    const decision = evaluateAutomatedResponseLoopBound({
      conversation,
      message: queuedOutbound(conversation.conversationId, conversation.version),
      policy,
      sentAgentMessageCount: 2,
      handoffId: "ho-bound",
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("MESSAGE_LIMIT_HANDOFF");
    expect(decision.handoffRequired).toBe(true);
    expect(decision.handoff?.handoffId).toBe("ho-bound");
    expect(decision.handoff?.acknowledged).toBe(false);
    expect(decision.conversation.status).toBe(ConversationStatus.HANDED_OFF);
    expect(decision.conversation.humanOwned).toBe(true);
    expect(decision.conversation.agentSendAllowed).toBe(false);
    expectHonesty(decision);
  });

  it("over-bound still handoffs (no unbounded loop)", () => {
    const conversation = createConversation({
      conversationId: "c-over",
      providerThreadId: "thr-over",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = {
      ...defaultResponsePolicy(now),
      maxAgentMessagesPerConversation: 2,
    };
    const decision = evaluateAutomatedResponseLoopBound({
      conversation,
      message: queuedOutbound(conversation.conversationId, conversation.version),
      policy,
      sentAgentMessageCount: 5,
      handoffId: "ho-over",
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("MESSAGE_LIMIT_HANDOFF");
    expect(decision.handoffRequired).toBe(true);
    expect(decision.conversation.agentSendAllowed).toBe(false);
    expectHonesty(decision);
  });

  it("max=1: zero sent is WITHIN_BOUND; one sent handoffs", () => {
    const conversation = createConversation({
      conversationId: "c-max1",
      providerThreadId: "thr-max1",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = {
      ...defaultResponsePolicy(now),
      maxAgentMessagesPerConversation: 1,
    };
    const within = evaluateAutomatedResponseLoopBound({
      conversation,
      message: queuedOutbound(conversation.conversationId, conversation.version),
      policy,
      sentAgentMessageCount: 0,
      handoffId: "ho-max1-under",
      nowIso: now,
    });
    expect(within.code).toBe("WITHIN_BOUND");
    expect(within.allowed).toBe(true);
    expectHonesty(within);

    const at = evaluateAutomatedResponseLoopBound({
      conversation,
      message: queuedOutbound(conversation.conversationId, conversation.version),
      policy,
      sentAgentMessageCount: 1,
      handoffId: "ho-max1-at",
      nowIso: now,
    });
    expect(at.code).toBe("MESSAGE_LIMIT_HANDOFF");
    expect(at.handoffRequired).toBe(true);
    expect(at.conversation.agentSendAllowed).toBe(false);
    expectHonesty(at);
  });

  it("max=0 forces MESSAGE_LIMIT_HANDOFF with no prior sends", () => {
    const conversation = createConversation({
      conversationId: "c-max0",
      providerThreadId: "thr-max0",
      channel: InboxChannel.FIXTURE,
      customerDisplayName: "Alex",
      nowIso: now,
    });
    const policy = {
      ...defaultResponsePolicy(now),
      maxAgentMessagesPerConversation: 0,
    };
    const decision = evaluateAutomatedResponseLoopBound({
      conversation,
      message: queuedOutbound(conversation.conversationId, conversation.version),
      policy,
      sentAgentMessageCount: 0,
      handoffId: "ho-max0",
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("MESSAGE_LIMIT_HANDOFF");
    expect(decision.handoffRequired).toBe(true);
    expect(decision.conversation.agentSendAllowed).toBe(false);
    expectHonesty(decision);
  });

  it("non-MESSAGE_LIMIT refusal keeps code null without handoff", () => {
    const conversation = {
      ...createConversation({
        conversationId: "c-owned",
        providerThreadId: "thr-owned",
        channel: InboxChannel.FIXTURE,
        customerDisplayName: "Alex",
        nowIso: now,
      }),
      agentSendAllowed: false,
      humanOwned: true,
      status: ConversationStatus.HANDED_OFF,
    };
    const policy = {
      ...defaultResponsePolicy(now),
      maxAgentMessagesPerConversation: 8,
    };
    const decision = evaluateAutomatedResponseLoopBound({
      conversation,
      message: queuedOutbound(conversation.conversationId, conversation.version),
      policy,
      sentAgentMessageCount: 0,
      handoffId: "ho-noop",
      nowIso: now,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBeNull();
    expect(decision.handoffRequired).toBe(false);
    expect(decision.handoff).toBeNull();
    expectHonesty(decision);
  });
});
