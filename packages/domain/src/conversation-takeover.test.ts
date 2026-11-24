import { describe, expect, it } from "vitest";
import { applyTakeover, canAgentSend } from "./conversation-takeover.js";

describe("conversation takeover", () => {
  it("increments version and blocks agent send with honesty markers", () => {
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
    expect(result.liveProviderWiring).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("rejects stale prepared replies as VERSION_MISMATCH (T-X053 race)", () => {
    const state = {
      conversationId: "c1",
      version: 5,
      humanOwned: false,
      agentSendAllowed: true,
    };
    expect(canAgentSend(state, 4)).toEqual({
      allowed: false,
      code: "VERSION_MISMATCH",
    });
    expect(canAgentSend(state, 5)).toEqual({ allowed: true });
  });

  it("rejects human-owned conversation as CONVERSATION_TAKEOVER", () => {
    const state = {
      conversationId: "c1",
      version: 5,
      humanOwned: true,
      agentSendAllowed: false,
    };
    expect(canAgentSend(state, 5)).toEqual({
      allowed: false,
      code: "CONVERSATION_TAKEOVER",
    });
  });

  it("ownership denial wins over version check", () => {
    const state = {
      conversationId: "c1",
      version: 9,
      humanOwned: true,
      agentSendAllowed: false,
    };
    // Stale version + takeover → still CONVERSATION_TAKEOVER (ownership first).
    expect(canAgentSend(state, 1).allowed).toBe(false);
    if (!canAgentSend(state, 1).allowed) {
      expect(canAgentSend(state, 1).code).toBe("CONVERSATION_TAKEOVER");
    }
  });
});
