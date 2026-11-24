/**
 * T-X056 — Automated response loop: bounded; handoff.
 *
 * Concierge auto-replies are capped by `maxAgentMessagesPerConversation`.
 * When the bound is reached, further outbound sends refuse with MESSAGE_LIMIT
 * and the conversation must hand off (no unbounded loop). Distinct from
 * takeover-cancels-unsent (T-US-044/T-X053) and unknown-policy escalate
 * (T-X055). External effects: NONE. Live wiring NOT_WIRED.
 * Hillclimb: honesty fields on every decision; over-bound still handoffs;
 * max=1 and max=0 edges stay MESSAGE_LIMIT_HANDOFF (no unbounded loop).
 */

import {
  ConversationStatus,
  createHandoff,
  evaluateOutboundSendGate,
  type BookingEvidence,
  type ConversationRecord,
  type HandoffRecord,
  type MessageRecord,
  type ResponsePolicy,
} from "./inbox.js";

export type AutomatedResponseLoopCode =
  | "WITHIN_BOUND"
  | "MESSAGE_LIMIT_HANDOFF"
  | null;

export type AutomatedResponseLoopDecision = {
  allowed: boolean;
  code: AutomatedResponseLoopCode;
  handoffRequired: boolean;
  reasons: string[];
  /** Present when bound was hit and a handoff was materialized. */
  handoff: HandoffRecord | null;
  conversation: ConversationRecord;
  /** Live inbox wiring is never claimed from this fixture path. */
  liveProviderWiring: "NOT_WIRED";
  chatgptAdsAccess: "ACCESS_BLOCKED";
  externalEffects: "NONE";
};

const HONESTY = {
  liveProviderWiring: "NOT_WIRED" as const,
  chatgptAdsAccess: "ACCESS_BLOCKED" as const,
  externalEffects: "NONE" as const,
};

/**
 * Evaluate the automated response-loop bound and, when exceeded, create a
 * handoff that stops further agent sends.
 */
export function evaluateAutomatedResponseLoopBound(input: {
  conversation: ConversationRecord;
  /** Queued candidate outbound under evaluation. */
  message: MessageRecord;
  policy: ResponsePolicy;
  /** Count of already-SENT/DELIVERED agent messages (excludes the candidate). */
  sentAgentMessageCount: number;
  bookingEvidence?: readonly BookingEvidence[];
  handoffId: string;
  nowIso: string;
}): AutomatedResponseLoopDecision {
  const sendGate = evaluateOutboundSendGate({
    conversation: input.conversation,
    message: input.message,
    policy: input.policy,
    sentAgentMessageCount: input.sentAgentMessageCount,
    bookingEvidence: input.bookingEvidence ?? [],
    nowIso: input.nowIso,
  });

  if (sendGate.allowed) {
    return {
      allowed: true,
      code: "WITHIN_BOUND",
      handoffRequired: false,
      reasons: [
        `Sent agent count ${input.sentAgentMessageCount} < max ${input.policy.maxAgentMessagesPerConversation} — loop within bound`,
        "liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
      ],
      handoff: null,
      conversation: input.conversation,
      ...HONESTY,
    };
  }

  if (sendGate.code === "MESSAGE_LIMIT") {
    const { handoff, conversation } = createHandoff({
      handoffId: input.handoffId,
      conversation: input.conversation,
      reason: `Automated response loop bound reached (${input.policy.maxAgentMessagesPerConversation} agent messages) — hand off`,
      urgency: "normal",
      nextOwner: input.policy.escalationOwner,
      customerQuestions: ["Continued after-hours thread past automated bound"],
      verifiedAnswers: [
        `Agent message limit ${input.policy.maxAgentMessagesPerConversation} enforced; no further auto-replies`,
      ],
      requestedAction: "Morning desk continues the thread",
      nowIso: input.nowIso,
    });
    return {
      allowed: false,
      code: "MESSAGE_LIMIT_HANDOFF",
      handoffRequired: true,
      reasons: [
        ...sendGate.reasons,
        `Handoff ${handoff.handoffId} required; conversation status=${ConversationStatus.HANDED_OFF}`,
        "liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
      ],
      handoff,
      conversation,
      ...HONESTY,
    };
  }

  return {
    allowed: false,
    code: null,
    handoffRequired: false,
    reasons: [
      ...sendGate.reasons,
      "liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
    ],
    handoff: null,
    conversation: input.conversation,
    ...HONESTY,
  };
}

export const AUTOMATED_RESPONSE_LOOP_RELATED_CASE_IDS = ["T-X056"] as const;
