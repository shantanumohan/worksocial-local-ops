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
  });
});
