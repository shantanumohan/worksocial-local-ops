import { describe, expect, it } from "vitest";
import { applyTakeover, canAgentSend } from "./conversation-takeover.js";

describe("conversation takeover", () => {
  it("increments version and blocks agent send", () => {
    const before = {
      conversationId: "c1",
      version: 3,
      humanOwned: false,
      agentSendAllowed: true,
    };
    const result = applyTakeover(before);
    expect(result.conversation.version).toBe(4);
    expect(result.conversation.humanOwned).toBe(true);
    expect(result.conversation.agentSendAllowed).toBe(false);
    expect(result.invalidatedAgentDrafts).toBe(true);
  });

  it("rejects stale prepared replies", () => {
    const state = {
      conversationId: "c1",
      version: 5,
      humanOwned: false,
      agentSendAllowed: true,
    };
    expect(canAgentSend(state, 4)).toEqual({
      allowed: false,
      code: "CONVERSATION_TAKEOVER",
    });
    expect(canAgentSend(state, 5)).toEqual({ allowed: true });
  });
});
