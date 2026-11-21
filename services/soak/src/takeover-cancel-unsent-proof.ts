/**
 * Fixture proof for T-US-044 / T-X053 — takeover cancels unsent agent replies.
 *
 * Human takeover increments conversation version, cancels queued outbound,
 * invalidates drafts, and blocks send via version mismatch. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  InboxChannel,
  MessageSendStatus,
  SoakProofKind,
  SupportLabel,
  applyConversationTakeover,
  createConversation,
  defaultResponsePolicy,
  emptyInboxState,
  evaluateOutboundSendGate,
  prepareConciergeReply,
  queueOutboundReply,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-044 / T-X053 fixture ACCEPTED.
 */
export function proofTakeoverCancelsUnsentReplies(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const conversation = createConversation({
    conversationId: "c-takeover",
    providerThreadId: "thr-takeover",
    channel: InboxChannel.FIXTURE,
    customerDisplayName: "Alex",
    nowIso,
  });
  const policy = defaultResponsePolicy(nowIso);

  const draftResult = prepareConciergeReply({
    draftId: "d-takeover",
    conversation,
    inboundBody: "Need a room",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy,
    bookingEvidence: [],
    nowIso,
  });
  if (!draftResult.ok) {
    return {
      proofId: `proof-takeover-${randomUUID()}`,
      kind: SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES,
      passed: false,
      details: ["Failed to prepare concierge draft for positive control"],
      applyAttemptCount: 1,
      operationId: `op-us044-${randomUUID().slice(0, 8)}`,
      createdAtIso: nowIso,
      fixtureOnly: true,
    };
  }

  const queued = queueOutboundReply({
    messageId: "out-takeover",
    conversation,
    draft: draftResult.draft,
    nowIso,
  });
  if (!queued.ok) {
    return {
      proofId: `proof-takeover-${randomUUID()}`,
      kind: SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES,
      passed: false,
      details: ["Failed to queue outbound reply before takeover"],
      applyAttemptCount: 1,
      operationId: `op-us044-${randomUUID().slice(0, 8)}`,
      createdAtIso: nowIso,
      fixtureOnly: true,
    };
  }
  details.push("Queued agent reply bound to conversation version");

  let state = emptyInboxState(nowIso);
  state = {
    ...state,
    responsePolicy: policy,
    conversations: [conversation],
    messages: [queued.message],
    drafts: [draftResult.draft],
  };

  const takeover = applyConversationTakeover({
    state,
    conversationId: "c-takeover",
    nowIso,
  });
  if (!takeover.ok) {
    passed = false;
    details.push(`Takeover failed: ${takeover.code}`);
  } else {
    if (
      takeover.conversation.version === conversation.version + 1 &&
      takeover.conversation.humanOwned === true &&
      takeover.conversation.agentSendAllowed === false
    ) {
      details.push(
        `Takeover incremented version ${conversation.version}→${takeover.conversation.version}; humanOwned; agent send blocked`,
      );
    } else {
      passed = false;
      details.push("Takeover did not flip ownership/version as expected");
    }

    if (
      takeover.cancelledMessageIds.includes("out-takeover") &&
      takeover.invalidatedDraftIds.includes("d-takeover")
    ) {
      details.push("Queued reply cancelled and draft invalidated");
    } else {
      passed = false;
      details.push("Queued reply or draft not cancelled/invalidated");
    }

    const cancelled = takeover.state.messages.find(
      (m) => m.messageId === "out-takeover",
    );
    if (cancelled?.sendStatus === MessageSendStatus.BLOCKED_TAKEOVER) {
      details.push("Message sendStatus=BLOCKED_TAKEOVER");
    } else {
      passed = false;
      details.push(
        `Unexpected sendStatus after takeover: ${cancelled?.sendStatus}`,
      );
    }

    // Stale prepared version / post-takeover send refused — T-X053 race.
    const sendGate = evaluateOutboundSendGate({
      conversation: takeover.conversation,
      message: {
        ...queued.message,
        sendStatus: MessageSendStatus.QUEUED,
      },
      policy,
      sentAgentMessageCount: 0,
      bookingEvidence: [],
      nowIso,
    });
    if (!sendGate.allowed) {
      details.push(
        `Outbound send gate denies post-takeover/stale-version send (${sendGate.code})`,
      );
    } else {
      passed = false;
      details.push("Outbound send unexpectedly allowed after takeover");
    }
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-takeover-${randomUUID()}`,
    kind: SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us044-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
