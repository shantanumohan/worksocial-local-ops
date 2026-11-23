/**
 * Fixture proof for T-US-043 — After-hours + takeover; acknowledged handoff.
 *
 * Outside after-hours coverage refuses drafts; inside coverage allows grounded
 * replies; human-request / handoff stops agent send; acknowledgeHandoff must
 * flip acknowledged with timestamp. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  ConversationStatus,
  InboxChannel,
  SoakProofKind,
  SupportLabel,
  acknowledgeHandoff,
  createConversation,
  createHandoff,
  defaultResponsePolicy,
  prepareConciergeReply,
  type ResponsePolicy,
  type SoakProofRecord,
} from "@worksocial/domain";

function coveragePolicy(
  nowIso: string,
  windows: ResponsePolicy["coverageWindows"],
): ResponsePolicy {
  return {
    ...defaultResponsePolicy(nowIso),
    timezone: "UTC",
    coverageWindows: windows,
  };
}

/**
 * Complete expected proof set for T-US-043 fixture ACCEPTED.
 */
export function proofAfterHoursHandoffAcknowledged(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const conversation = createConversation({
    conversationId: `conv-us043-${randomUUID().slice(0, 8)}`,
    providerThreadId: `thr-us043-${randomUUID().slice(0, 8)}`,
    channel: InboxChannel.FIXTURE,
    customerDisplayName: "Fixture Customer",
    customerEmail: "fixture@worksocial.test.local",
    nowIso,
  });

  // 1. Empty coverage windows fail closed (outside after-hours honesty).
  const outsidePolicy = coveragePolicy(nowIso, []);
  const outside = prepareConciergeReply({
    draftId: `d-outside-${randomUUID().slice(0, 8)}`,
    conversation,
    inboundBody: "What are your hours?",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy: outsidePolicy,
    bookingEvidence: [],
    nowIso,
  });
  if (!outside.ok && outside.code === "OUTSIDE_COVERAGE") {
    details.push(
      "Empty coverageWindows → OUTSIDE_COVERAGE (after-hours fail-closed)",
    );
  } else {
    passed = false;
    details.push(`Outside-coverage unexpectedly ${JSON.stringify(outside)}`);
  }

  // 2. Positive control: full-day coverage allows a grounded draft.
  const insidePolicy = coveragePolicy(nowIso, [
    { dayOfWeek: 0, startHour: 0, endHour: 24 },
    { dayOfWeek: 1, startHour: 0, endHour: 24 },
    { dayOfWeek: 2, startHour: 0, endHour: 24 },
    { dayOfWeek: 3, startHour: 0, endHour: 24 },
    { dayOfWeek: 4, startHour: 0, endHour: 24 },
    { dayOfWeek: 5, startHour: 0, endHour: 24 },
    { dayOfWeek: 6, startHour: 0, endHour: 24 },
  ]);
  const inside = prepareConciergeReply({
    draftId: `d-inside-${randomUUID().slice(0, 8)}`,
    conversation,
    inboundBody: "What are your hours?",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy: insidePolicy,
    bookingEvidence: [],
    nowIso,
  });
  if (inside.ok) {
    details.push("Full-day coverage → grounded concierge draft allowed");
  } else {
    passed = false;
    details.push(`Inside-coverage unexpectedly ${JSON.stringify(inside)}`);
  }

  // 3. Human request refuses draft and forces handoff (takeover path).
  const humanAsk = prepareConciergeReply({
    draftId: `d-human-${randomUUID().slice(0, 8)}`,
    conversation,
    inboundBody: "Please let me speak to a human about a refund",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy: insidePolicy,
    bookingEvidence: [],
    nowIso,
  });
  if (!humanAsk.ok && humanAsk.code === "HUMAN_REQUESTED") {
    details.push("Human/sensitive request → HUMAN_REQUESTED (no auto-reply)");
  } else {
    passed = false;
    details.push(`Human-request unexpectedly ${JSON.stringify(humanAsk)}`);
  }

  const { handoff, conversation: handed } = createHandoff({
    handoffId: `ho-us043-${randomUUID().slice(0, 8)}`,
    conversation,
    reason: "Customer requested human during after-hours coverage",
    nextOwner: insidePolicy.escalationOwner,
    customerQuestions: ["Please let me speak to a human about a refund"],
    verifiedAnswers: [],
    requestedAction: "Morning desk acknowledges handoff; no competing agent reply",
    nowIso,
  });
  if (
    handoff.acknowledged === false &&
    handoff.acknowledgedAtIso === null &&
    handed.status === ConversationStatus.HANDED_OFF &&
    handed.humanOwned === true &&
    handed.agentSendAllowed === false
  ) {
    details.push(
      "createHandoff → acknowledged=false; status=handed_off; agentSendAllowed=false",
    );
  } else {
    passed = false;
    details.push(
      `Handoff create unexpectedly handoff=${JSON.stringify(handoff)} conversation=${JSON.stringify(handed)}`,
    );
  }

  // 4. Acknowledge handoff (catalog expected result).
  const acked = acknowledgeHandoff({ handoff, nowIso });
  if (acked.acknowledged === true && acked.acknowledgedAtIso === nowIso) {
    details.push(
      `acknowledgeHandoff → acknowledged=true at ${acked.acknowledgedAtIso}`,
    );
  } else {
    passed = false;
    details.push(`Acknowledge unexpectedly ${JSON.stringify(acked)}`);
  }

  // 5. After handoff, agent draft remains blocked (no competing reply).
  const blocked = prepareConciergeReply({
    draftId: `d-blocked-${randomUUID().slice(0, 8)}`,
    conversation: handed,
    inboundBody: "Still here — any update?",
    citedFactIds: ["fact-hours"],
    factLabels: new Map([["fact-hours", SupportLabel.SUPPORTED]]),
    policy: insidePolicy,
    bookingEvidence: [],
    nowIso,
  });
  if (!blocked.ok && blocked.code === "CONVERSATION_TAKEOVER") {
    details.push(
      "Post-handoff draft → CONVERSATION_TAKEOVER (no competing agent reply)",
    );
  } else {
    passed = false;
    details.push(`Post-handoff unexpectedly ${JSON.stringify(blocked)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-us043-handoff-${randomUUID()}`,
    kind: SoakProofKind.AFTER_HOURS_HANDOFF_ACKNOWLEDGED,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-us043-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
