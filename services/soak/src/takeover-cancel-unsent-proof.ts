/**
 * Fixture proof for T-US-044 / T-X053 — takeover cancels unsent agent replies.
 *
 * Human takeover increments conversation version, cancels queued outbound,
 * invalidates drafts, and blocks send. T-X053 race: replies prepared before
 * takeover see VERSION_MISMATCH through the real applyConversationTakeover
 * transition (version bump + ownership flip). Matching-version post-takeover
 * queue attempts see CONVERSATION_TAKEOVER. SENT/DELIVERED rows are preserved.
 * External effects: NONE.
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

  // Second queued row — multi-queue cancel (T-X053 race surface).
  const queued2 = queueOutboundReply({
    messageId: "out-takeover-2",
    conversation,
    draft: { ...draftResult.draft, draftId: "d-takeover-shadow" },
    nowIso,
  });
  if (!queued2.ok) {
    return {
      proofId: `proof-takeover-${randomUUID()}`,
      kind: SoakProofKind.TAKEOVER_CANCELS_UNSENT_REPLIES,
      passed: false,
      details: ["Failed to queue second outbound reply before takeover"],
      applyAttemptCount: 1,
      operationId: `op-us044-${randomUUID().slice(0, 8)}`,
      createdAtIso: nowIso,
      fixtureOnly: true,
    };
  }
  details.push("Second queued agent reply bound to same conversation version");

  // Already-sent row must survive takeover (not cancelled).
  const alreadySent = {
    ...queued.message,
    messageId: "out-already-sent",
    sendStatus: MessageSendStatus.SENT,
    sentAtIso: nowIso,
  };

  let state = emptyInboxState(nowIso);
  state = {
    ...state,
    responsePolicy: policy,
    conversations: [conversation],
    messages: [queued.message, queued2.message, alreadySent],
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
      takeover.liveProviderWiring !== "NOT_WIRED" ||
      takeover.externalEffects !== "NONE"
    ) {
      passed = false;
      details.push("Takeover honesty markers missing (NOT_WIRED / NONE)");
    } else {
      details.push(
        "Takeover honesty: liveProviderWiring=NOT_WIRED externalEffects=NONE",
      );
    }

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

    const cancelledBoth =
      takeover.cancelledMessageIds.includes("out-takeover") &&
      takeover.cancelledMessageIds.includes("out-takeover-2") &&
      takeover.invalidatedDraftIds.includes("d-takeover");
    if (cancelledBoth) {
      details.push(
        "Multi-queue: both queued replies cancelled and draft invalidated",
      );
    } else {
      passed = false;
      details.push("Queued reply or draft not cancelled/invalidated");
    }

    const cancelled = takeover.state.messages.find(
      (m) => m.messageId === "out-takeover",
    );
    const cancelled2 = takeover.state.messages.find(
      (m) => m.messageId === "out-takeover-2",
    );
    if (
      cancelled?.sendStatus === MessageSendStatus.BLOCKED_TAKEOVER &&
      cancelled2?.sendStatus === MessageSendStatus.BLOCKED_TAKEOVER
    ) {
      details.push("Message sendStatus=BLOCKED_TAKEOVER (both queued rows)");
    } else {
      passed = false;
      details.push(
        `Unexpected sendStatus after takeover: ${cancelled?.sendStatus}/${cancelled2?.sendStatus}`,
      );
    }

    const sentPreserved = takeover.state.messages.find(
      (m) => m.messageId === "out-already-sent",
    );
    if (
      sentPreserved?.sendStatus === MessageSendStatus.SENT &&
      !takeover.cancelledMessageIds.includes("out-already-sent")
    ) {
      details.push("SENT message preserved (not cancelled by takeover)");
    } else {
      passed = false;
      details.push("SENT message was incorrectly cancelled or mutated");
    }

    // T-X053 race via real takeover: stale preparedAtVersion → VERSION_MISMATCH.
    const raceGate = evaluateOutboundSendGate({
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
    if (!raceGate.allowed && raceGate.code === "VERSION_MISMATCH") {
      details.push(
        "T-X053 takeover race → VERSION_MISMATCH (stale preparedAtVersion via applyConversationTakeover)",
      );
    } else {
      passed = false;
      details.push(
        `Expected VERSION_MISMATCH after real takeover; got ${
          raceGate.allowed ? "allowed" : raceGate.code
        }`,
      );
    }

    // Queue-after-takeover at the new version → CONVERSATION_TAKEOVER (ownership).
    const postQueue = queueOutboundReply({
      messageId: "out-after-takeover",
      conversation: takeover.conversation,
      draft: {
        ...draftResult.draft,
        draftId: "d-after",
        preparedAtVersion: takeover.conversation.version,
        invalidatedAtIso: null,
      },
      nowIso,
    });
    if (!postQueue.ok && postQueue.code === "CONVERSATION_TAKEOVER") {
      details.push(
        "Queue-after-takeover refused (CONVERSATION_TAKEOVER at matching version)",
      );
    } else {
      passed = false;
      details.push(
        `Queue-after-takeover unexpectedly ${
          postQueue.ok ? "succeeded" : `failed as ${postQueue.code}`
        }`,
      );
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
