/**
 * Fixture proof for T-F22 — Handle after-hours messages and take over.
 * Complete F22 evidence package: response policy, inbound conversation
 * versions, sources/allowed-action evaluation, send+CRM lead, ownership
 * audit takeover, acknowledged morning handoff; competing replies and
 * unsafe claims refused; live providers NOT_WIRED. Distinct from T-US-043
 * handoff summary, T-US-044/T-X053 takeover-cancel, T-X055 unknown-policy
 * escalate, and T-X056 bounded auto-reply loop. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateHandleAfterHoursMessagesAndTakeover,
  type HandleAfterHoursMessagesAndTakeoverInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<HandleAfterHoursMessagesAndTakeoverInput> = {},
): HandleAfterHoursMessagesAndTakeoverInput {
  return {
    packageId: "pkg-f22-soak",
    responsePolicy: {
      policyId: "policy-f22-soak",
      timezone: "America/New_York",
      coverageWindows: [
        { dayOfWeek: 1, startHour: 18, endHour: 23 },
        { dayOfWeek: 5, startHour: 18, endHour: 23 },
      ],
      allowedQuestionIds: ["q-hours-soak", "q-day-pass-soak"],
      escalationOwner: "owner-morning-desk-soak",
    },
    approvedFacts: {
      factSetId: "facts-f22-soak",
      approvedFactIds: ["fact-hours-soak", "fact-day-pass-soak"],
    },
    inboxConnectionReady: true,
    inbound: {
      conversationId: "c-f22-soak",
      inboundVersion: 1,
      inboundMessageId: "in-f22-soak",
      customerQuestionId: "q-hours-soak",
      channel: "WEBCHAT",
    },
    allowedAction: {
      evaluationId: "eval-f22-soak",
      questionAllowed: true,
      sourcesCited: ["fact-hours-soak"],
      proposedResponseBody:
        "Our Midtown location is open weekdays 8am–8pm. I am a virtual assistant.",
      inspectedOrAllowed: true,
    },
    sendAndLead: {
      outboundMessageId: "out-f22-soak",
      preparedAtVersion: 1,
      sendReceiptId: "rcpt-f22-soak",
      leadId: "lead-f22-soak",
      crmRecordId: "crm-f22-soak",
      sendRecorded: true,
    },
    ownershipAudit: {
      auditEventId: "own-f22-soak",
      kind: "takeover",
      fromVersion: 1,
      toVersion: 2,
      actorUserId: "human-desk-soak",
      humanOwned: true,
      agentSendAllowed: false,
      competingRepliesPrevented: true,
    },
    morningHandoff: {
      handoffId: "handoff-f22-soak",
      nextOwner: "owner-morning-desk-soak",
      reason: "Customer asked for tour scheduling follow-up",
      acknowledged: true,
      acknowledgedAtIso: "2026-11-22T12:30:00.000Z",
      morningReviewCompleted: true,
    },
    claimLiveVerifiedAfterHours: false,
    requestLiveProviderWiring: false,
    requestCompetingReplyAfterTakeover: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F22 fixture ACCEPTED.
 */
export function proofHandleAfterHoursMessagesAndTakeover(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateHandleAfterHoursMessagesAndTakeover(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_EVIDENCE_RECORDED" &&
    happy.evidence.afterHoursVerifiedLive === false &&
    happy.afterHoursHandledRecorded === true &&
    happy.evidence.handoffAcknowledged === true &&
    happy.evidence.morningReviewCompleted === true &&
    happy.evidence.competingRepliesPrevented === true &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F22 evidence package → HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER_EVIDENCE_RECORDED; response policy; inbound versions; sources/allowed-action; send+CRM lead; ownership audit takeover; acknowledged morning handoff; afterHoursVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noPolicy = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ responsePolicy: null }),
  );
  if (!noPolicy.allowed && noPolicy.code === "RESPONSE_POLICY_REQUIRED") {
    details.push("responsePolicy=null → RESPONSE_POLICY_REQUIRED");
  } else {
    passed = false;
    details.push(`Response policy unexpectedly ${JSON.stringify(noPolicy)}`);
  }

  const noFacts = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ approvedFacts: null }),
  );
  if (!noFacts.allowed && noFacts.code === "APPROVED_FACTS_REQUIRED") {
    details.push("approvedFacts=null → APPROVED_FACTS_REQUIRED");
  } else {
    passed = false;
    details.push(`Approved facts unexpectedly ${JSON.stringify(noFacts)}`);
  }

  const noInbox = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ inboxConnectionReady: false }),
  );
  if (!noInbox.allowed && noInbox.code === "INBOX_CONNECTION_REQUIRED") {
    details.push("inboxConnectionReady=false → INBOX_CONNECTION_REQUIRED");
  } else {
    passed = false;
    details.push(`Inbox connection unexpectedly ${JSON.stringify(noInbox)}`);
  }

  const noInbound = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ inbound: null }),
  );
  if (!noInbound.allowed && noInbound.code === "INBOUND_CONVERSATION_REQUIRED") {
    details.push("inbound=null → INBOUND_CONVERSATION_REQUIRED");
  } else {
    passed = false;
    details.push(`Inbound unexpectedly ${JSON.stringify(noInbound)}`);
  }

  const noAction = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ allowedAction: null }),
  );
  if (
    !noAction.allowed &&
    noAction.code === "ALLOWED_ACTION_EVALUATION_REQUIRED"
  ) {
    details.push("allowedAction=null → ALLOWED_ACTION_EVALUATION_REQUIRED");
  } else {
    passed = false;
    details.push(`Allowed action unexpectedly ${JSON.stringify(noAction)}`);
  }

  const noSend = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ sendAndLead: null }),
  );
  if (!noSend.allowed && noSend.code === "POLICY_SEND_AND_LEAD_REQUIRED") {
    details.push("sendAndLead=null → POLICY_SEND_AND_LEAD_REQUIRED");
  } else {
    passed = false;
    details.push(`Send/lead unexpectedly ${JSON.stringify(noSend)}`);
  }

  const noAudit = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ ownershipAudit: null }),
  );
  if (!noAudit.allowed && noAudit.code === "OWNERSHIP_AUDIT_REQUIRED") {
    details.push("ownershipAudit=null → OWNERSHIP_AUDIT_REQUIRED");
  } else {
    passed = false;
    details.push(`Ownership audit unexpectedly ${JSON.stringify(noAudit)}`);
  }

  const noHandoff = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ morningHandoff: null }),
  );
  if (
    !noHandoff.allowed &&
    noHandoff.code === "ACKNOWLEDGED_HANDOFF_REQUIRED"
  ) {
    details.push("morningHandoff=null → ACKNOWLEDGED_HANDOFF_REQUIRED");
  } else {
    passed = false;
    details.push(`Handoff unexpectedly ${JSON.stringify(noHandoff)}`);
  }

  const competing = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ requestCompetingReplyAfterTakeover: true }),
  );
  if (
    !competing.allowed &&
    competing.code === "COMPETING_REPLY_AFTER_TAKEOVER_REFUSED"
  ) {
    details.push(
      "requestCompetingReplyAfterTakeover → COMPETING_REPLY_AFTER_TAKEOVER_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Competing reply unexpectedly ${JSON.stringify(competing)}`);
  }

  const liveClaim = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ claimLiveVerifiedAfterHours: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_AFTER_HOURS_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedAfterHours → FALSE_LIVE_VERIFIED_AFTER_HOURS_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateHandleAfterHoursMessagesAndTakeover(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-043 (acknowledged handoff summary), T-US-044/T-X053 (takeover cancels unsent), T-X055 (unknown policy escalate), and T-X056 (bounded auto-reply loop) — complete F22 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.HANDLE_AFTER_HOURS_MESSAGES_AND_TAKEOVER,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-handle-after-hours-messages-and-takeover-f22",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
