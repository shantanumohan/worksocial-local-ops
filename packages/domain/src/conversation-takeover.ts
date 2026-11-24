/**
 * Human takeover increments conversation version and blocks unsent agent replies.
 * T-X053 / T-US-044: version race invalidates send; ownership flip blocks agent.
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
  /** Honesty: fixture/domain path never claims live provider success. */
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
};

export type AgentSendDenialCode =
  | "CONVERSATION_TAKEOVER"
  | "VERSION_MISMATCH";

export function applyTakeover(state: ConversationState): TakeoverResult {
  return {
    conversation: {
      ...state,
      version: state.version + 1,
      humanOwned: true,
      agentSendAllowed: false,
    },
    invalidatedAgentDrafts: true,
    liveProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

/**
 * Gateway check before send/queue: preparedAtVersion must equal current version
 * and agent send must still be allowed.
 *
 * Version is checked first so a real takeover transition (version bump + ownership
 * flip) yields VERSION_MISMATCH for replies prepared before the bump — that is the
 * T-X053 race. Matching-version ownership denial → CONVERSATION_TAKEOVER.
 */
export function canAgentSend(
  state: ConversationState,
  preparedAtVersion: number,
):
  | { allowed: true }
  | { allowed: false; code: AgentSendDenialCode } {
  if (preparedAtVersion !== state.version) {
    return { allowed: false, code: "VERSION_MISMATCH" };
  }
  if (!state.agentSendAllowed || state.humanOwned) {
    return { allowed: false, code: "CONVERSATION_TAKEOVER" };
  }
  return { allowed: true };
}
