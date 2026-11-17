/**
 * Human takeover increments conversation version and blocks unsent agent replies.
 */

export type ConversationState = {
  conversationId: string;
  version: number;
  humanOwned: boolean;
  agentSendAllowed: boolean;
};

export type TakeoverResult = {
  conversation: ConversationState;
  invalidatedAgentDrafts: true;
};

export function applyTakeover(state: ConversationState): TakeoverResult {
  return {
    conversation: {
      ...state,
      version: state.version + 1,
      humanOwned: true,
      agentSendAllowed: false,
    },
    invalidatedAgentDrafts: true,
  };
}

/**
 * Gateway check before send: preparedAtVersion must equal current version
 * and agent send must still be allowed.
 */
export function canAgentSend(
  state: ConversationState,
  preparedAtVersion: number,
): { allowed: true } | { allowed: false; code: "CONVERSATION_TAKEOVER" } {
  if (!state.agentSendAllowed || state.humanOwned) {
    return { allowed: false, code: "CONVERSATION_TAKEOVER" };
  }
  if (preparedAtVersion !== state.version) {
    return { allowed: false, code: "CONVERSATION_TAKEOVER" };
  }
  return { allowed: true };
}
