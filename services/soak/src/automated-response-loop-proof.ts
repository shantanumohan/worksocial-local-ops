/**
 * Fixture proof for T-X056 — Automated response loop bounded; handoff.
 * External effects: NONE. Live wiring NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * Hillclimb: over-bound, max=1/max=0 edges, honesty fields on every path.
 */

import { randomUUID } from "node:crypto";
import {
  ConversationStatus,
  InboxChannel,
  MessageDirection,
  MessageSendStatus,
  SoakProofKind,
  createConversation,
  defaultResponsePolicy,
  evaluateAutomatedResponseLoopBound,
  type SoakProofRecord,
} from "@worksocial/domain";

function queuedOutbound(
  conversationId: string,
  preparedAtVersion: number,
  nowIso: string,
) {
  return {
    messageId: `msg-${randomUUID().slice(0, 8)}`,
    conversationId,
    providerMessageId: null as string | null,
    direction: MessageDirection.OUTBOUND,
    body: "Fixture auto-reply within after-hours coverage",
    sender: "agent" as const,
    preparedAtVersion,
    sendStatus: MessageSendStatus.QUEUED,
    citedFactIds: ["fact-hours"],
    gatewayOperationId: null as string | null,
    bookingClaim: null,
    fixtureOnly: true,
    createdAtIso: nowIso,
    sentAtIso: null as string | null,
    deliveredAtIso: null as string | null,
  };
}

function honestyOk(decision: {
  liveProviderWiring: string;
  chatgptAdsAccess: string;
  externalEffects: string;
}): boolean {
  return (
    decision.liveProviderWiring === "NOT_WIRED" &&
    decision.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    decision.externalEffects === "NONE"
  );
}

/**
 * Complete expected proof set for T-X056 fixture ACCEPTED.
 */
export function proofAutomatedResponseLoopBoundedHandoff(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const conversation = createConversation({
    conversationId: `conv-${randomUUID().slice(0, 8)}`,
    providerThreadId: `thr-${randomUUID().slice(0, 8)}`,
    channel: InboxChannel.FIXTURE,
    customerDisplayName: "Fixture Customer",
    customerEmail: "fixture@worksocial.test.local",
    nowIso,
  });
  const policy = {
    ...defaultResponsePolicy(nowIso),
    maxAgentMessagesPerConversation: 2,
  };

  // Positive control: under the bound, send remains allowed (no handoff).
  const within = evaluateAutomatedResponseLoopBound({
    conversation,
    message: queuedOutbound(
      conversation.conversationId,
      conversation.version,
      nowIso,
    ),
    policy,
    sentAgentMessageCount: 1,
    handoffId: `ho-within-${randomUUID().slice(0, 8)}`,
    nowIso,
  });
  if (
    within.allowed === true &&
    within.code === "WITHIN_BOUND" &&
    within.handoffRequired === false &&
    within.handoff === null &&
    within.conversation.agentSendAllowed === true &&
    honestyOk(within)
  ) {
    details.push(
      "sentAgentMessageCount=1 < max=2 → WITHIN_BOUND; no handoff; liveProviderWiring=NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Within-bound unexpectedly ${JSON.stringify(within)}`);
  }

  // At bound: MESSAGE_LIMIT → handoff; agent send stopped.
  const atBound = evaluateAutomatedResponseLoopBound({
    conversation,
    message: queuedOutbound(
      conversation.conversationId,
      conversation.version,
      nowIso,
    ),
    policy,
    sentAgentMessageCount: 2,
    handoffId: `ho-bound-${randomUUID().slice(0, 8)}`,
    nowIso,
  });
  if (
    atBound.allowed === false &&
    atBound.code === "MESSAGE_LIMIT_HANDOFF" &&
    atBound.handoffRequired === true &&
    atBound.handoff != null &&
    atBound.handoff.acknowledged === false &&
    atBound.conversation.status === ConversationStatus.HANDED_OFF &&
    atBound.conversation.humanOwned === true &&
    atBound.conversation.agentSendAllowed === false &&
    honestyOk(atBound)
  ) {
    details.push(
      "sentAgentMessageCount=2 ≥ max=2 → MESSAGE_LIMIT_HANDOFF; status=handed_off; agentSendAllowed=false",
    );
  } else {
    passed = false;
    details.push(`At-bound unexpectedly ${JSON.stringify(atBound)}`);
  }

  // Over bound still handoffs (no unbounded continuation).
  const over = evaluateAutomatedResponseLoopBound({
    conversation,
    message: queuedOutbound(
      conversation.conversationId,
      conversation.version,
      nowIso,
    ),
    policy,
    sentAgentMessageCount: 5,
    handoffId: `ho-over-${randomUUID().slice(0, 8)}`,
    nowIso,
  });
  if (
    over.allowed === false &&
    over.code === "MESSAGE_LIMIT_HANDOFF" &&
    over.handoffRequired === true &&
    over.conversation.agentSendAllowed === false &&
    honestyOk(over)
  ) {
    details.push(
      "Over-bound sentAgentMessageCount=5 still MESSAGE_LIMIT_HANDOFF (no unbounded loop)",
    );
  } else {
    passed = false;
    details.push(`Over-bound unexpectedly ${JSON.stringify(over)}`);
  }

  // max=0: even with zero prior sends, bound handoffs immediately.
  const max0 = evaluateAutomatedResponseLoopBound({
    conversation,
    message: queuedOutbound(
      conversation.conversationId,
      conversation.version,
      nowIso,
    ),
    policy: { ...policy, maxAgentMessagesPerConversation: 0 },
    sentAgentMessageCount: 0,
    handoffId: `ho-max0-${randomUUID().slice(0, 8)}`,
    nowIso,
  });
  if (
    max0.allowed === false &&
    max0.code === "MESSAGE_LIMIT_HANDOFF" &&
    max0.handoffRequired === true &&
    max0.conversation.agentSendAllowed === false &&
    honestyOk(max0)
  ) {
    details.push(
      "maxAgentMessagesPerConversation=0 → MESSAGE_LIMIT_HANDOFF with sent=0 (no unbounded loop)",
    );
  } else {
    passed = false;
    details.push(`max=0 unexpectedly ${JSON.stringify(max0)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
  );

  return {
    proofId: `proof-auto-loop-${randomUUID()}`,
    kind: SoakProofKind.AUTOMATED_RESPONSE_LOOP_BOUNDED_HANDOFF,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx056-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
