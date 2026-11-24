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

  it("real takeover transition yields VERSION_MISMATCH for stale prepare (T-X053)", () => {
    const before = {
      conversationId: "c1",
      version: 5,
      humanOwned: false,
      agentSendAllowed: true,
    };
    const after = applyTakeover(before).conversation;
    // Reply prepared at pre-takeover version — race invalidates send.
    expect(canAgentSend(after, before.version)).toEqual({
      allowed: false,
      code: "VERSION_MISMATCH",
    });
  });

  it("matching-version ownership denial is CONVERSATION_TAKEOVER", () => {
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

  it("version mismatch wins over ownership when preparedAtVersion is stale", () => {
    const state = {
      conversationId: "c1",
      version: 9,
      humanOwned: true,
      agentSendAllowed: false,
    };
    expect(canAgentSend(state, 1)).toEqual({
      allowed: false,
      code: "VERSION_MISMATCH",
    });
  });

  it("allows send when version matches and agent send is allowed", () => {
    const state = {
      conversationId: "c1",
      version: 5,
      humanOwned: false,
      agentSendAllowed: true,
    };
    expect(canAgentSend(state, 5)).toEqual({ allowed: true });
  });
});
