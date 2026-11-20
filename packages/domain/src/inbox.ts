/**
 * R1-09 Customer response / after-hours operations.
 *
 * Pure types + validators. No network I/O.
 * Takeover increments conversation version and blocks unsent agent replies.
 * No reservation without booking evidence. Live inbox providers remain NOT_WIRED.
 */

import {
  applyTakeover,
  canAgentSend,
  type ConversationState,
} from "./conversation-takeover.js";
import {
  OutcomeEvidenceSource,
  OutcomeLabel,
  recordWritePathOutcome,
  type OutcomeEvidenceSourceValue,
  type OutcomeLabelValue,
  type WritePathOutcomeEvidence,
} from "./production-mapping.js";
import { SupportLabel, type SupportLabelValue } from "./knowledge.js";

export const InboxChannel = {
  FIXTURE: "fixture",
  EMAIL: "email",
  WEB_CHAT: "web_chat",
  SMS: "sms",
  WHATSAPP: "whatsapp",
} as const;

export type InboxChannelValue =
  (typeof InboxChannel)[keyof typeof InboxChannel];

export const ConversationStatus = {
  OPEN: "open",
  AWAITING_CUSTOMER: "awaiting_customer",
  AWAITING_HUMAN: "awaiting_human",
  HANDED_OFF: "handed_off",
  CLOSED: "closed",
} as const;

export type ConversationStatusValue =
  (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const MessageDirection = {
  INBOUND: "inbound",
  OUTBOUND: "outbound",
} as const;

export type MessageDirectionValue =
  (typeof MessageDirection)[keyof typeof MessageDirection];

export const MessageSendStatus = {
  DRAFT: "draft",
  QUEUED: "queued",
  SENT: "sent",
  CANCELLED: "cancelled",
  FAILED: "failed",
  BLOCKED_TAKEOVER: "blocked_takeover",
} as const;

export type MessageSendStatusValue =
  (typeof MessageSendStatus)[keyof typeof MessageSendStatus];

export const LeadQualification = {
  UNQUALIFIED: "unqualified",
  QUALIFIED: "qualified",
  NEEDS_HUMAN: "needs_human",
} as const;

export type LeadQualificationValue =
  (typeof LeadQualification)[keyof typeof LeadQualification];

/** Booking claims — reservation requires provider evidence (v3 §16 / v6). */
export const BookingClaimKind = {
  RECOMMENDATION: "recommendation",
  TOUR_REQUEST: "tour_request",
  AVAILABILITY_LINK: "availability_link",
  RESERVATION: "reservation",
} as const;

export type BookingClaimKindValue =
  (typeof BookingClaimKind)[keyof typeof BookingClaimKind];

export const InboxAdapterStatus = {
  NOT_WIRED: "NOT_WIRED",
  FIXTURE: "FIXTURE",
} as const;

export type InboxAdapterStatusValue =
  (typeof InboxAdapterStatus)[keyof typeof InboxAdapterStatus];

export const InboxOutcomeDecision = {
  SUCCESS: "SUCCESS",
  FAILURE: "FAILURE",
  UNKNOWN: "UNKNOWN",
} as const;

export type InboxOutcomeDecisionValue =
  (typeof InboxOutcomeDecision)[keyof typeof InboxOutcomeDecision];

export type CoverageWindow = {
  dayOfWeek: number; // 0=Sun … 6=Sat
  startHour: number; // 0–23 local
  endHour: number;
};

export type ResponsePolicy = {
  policyId: string;
  timezone: string;
  /** After-hours windows when concierge may auto-reply. */
  coverageWindows: CoverageWindow[];
  allowedQuestionIds: string[];
  escalationOwner: string;
  maxAgentMessagesPerConversation: number;
  duplicateSuppressionWindowSec: number;
  identifyAsVirtualAssistant: boolean;
  /** When true, agent outbound sends are globally paused. */
  repliesPaused: boolean;
  updatedAtIso: string;
};

export type ConversationRecord = {
  conversationId: string;
  providerThreadId: string;
  channel: InboxChannelValue;
  version: number;
  humanOwned: boolean;
  agentSendAllowed: boolean;
  status: ConversationStatusValue;
  customerDisplayName: string;
  customerEmail: string | null;
  fixtureOnly: boolean;
  leaseOwner: string | null;
  leaseExpiresAtIso: string | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export type MessageRecord = {
  messageId: string;
  conversationId: string;
  providerMessageId: string | null;
  direction: MessageDirectionValue;
  body: string;
  sender: "customer" | "agent" | "human" | "system";
  /** Conversation version when this outbound was prepared. */
  preparedAtVersion: number | null;
  sendStatus: MessageSendStatusValue;
  citedFactIds: string[];
  gatewayOperationId: string | null;
  bookingClaim: BookingClaimKindValue | null;
  fixtureOnly: boolean;
  createdAtIso: string;
  sentAtIso: string | null;
};

export type ConciergeDraft = {
  draftId: string;
  conversationId: string;
  body: string;
  citedFactIds: string[];
  preparedAtVersion: number;
  qualification: LeadQualificationValue;
  asksForHuman: boolean;
  bookingClaim: BookingClaimKindValue | null;
  createdAtIso: string;
};

export type QualifiedLead = {
  leadId: string;
  conversationId: string;
  correlationId: string;
  email: string;
  displayName: string;
  locationNeed: string | null;
  dateNeed: string | null;
  sizeNeed: string | null;
  qualification: LeadQualificationValue;
  /** Always true for fixture/synthetic — never enter commercial totals. */
  synthetic: boolean;
  crmRecordId: string | null;
  fixtureOnly: boolean;
  gatewayOperationId: string | null;
  writePathId: string | null;
  createdAtIso: string;
};

export type BookingEvidence = {
  evidenceId: string;
  conversationId: string;
  providerReceiptId: string;
  claimKind: BookingClaimKindValue;
  verified: boolean;
  observedAtIso: string;
};

export type HandoffRecord = {
  handoffId: string;
  conversationId: string;
  reason: string;
  urgency: "low" | "normal" | "high";
  nextOwner: string;
  customerQuestions: string[];
  verifiedAnswers: string[];
  requestedAction: string;
  acknowledged: boolean;
  acknowledgedAtIso: string | null;
  createdAtIso: string;
};

export type InboxState = {
  version: 1;
  responsePolicy: ResponsePolicy | null;
  conversations: ConversationRecord[];
  messages: MessageRecord[];
  drafts: ConciergeDraft[];
  leads: QualifiedLead[];
  handoffs: HandoffRecord[];
  bookingEvidence: BookingEvidence[];
  sendOutcomes: WritePathOutcomeEvidence[];
  liveInboxWiring: InboxAdapterStatusValue;
  liveCrmLeadWiring: InboxAdapterStatusValue;
  updatedAtIso: string;
};

export type FactSupportLookup =
  | ReadonlyMap<string, SupportLabelValue>
  | Record<string, SupportLabelValue>;

function lookupFactLabel(
  labels: FactSupportLookup,
  factId: string,
): SupportLabelValue | undefined {
  if (typeof (labels as ReadonlyMap<string, SupportLabelValue>).get === "function") {
    return (labels as ReadonlyMap<string, SupportLabelValue>).get(factId);
  }
  return (labels as Record<string, SupportLabelValue>)[factId];
}

export function emptyInboxState(nowIso: string): InboxState {
  return {
    version: 1,
    responsePolicy: null,
    conversations: [],
    messages: [],
    drafts: [],
    leads: [],
    handoffs: [],
    bookingEvidence: [],
    sendOutcomes: [],
    liveInboxWiring: InboxAdapterStatus.NOT_WIRED,
    liveCrmLeadWiring: InboxAdapterStatus.NOT_WIRED,
    updatedAtIso: nowIso,
  };
}

export function defaultResponsePolicy(nowIso: string): ResponsePolicy {
  return {
    policyId: "pol-after-hours-default",
    timezone: "America/New_York",
    coverageWindows: [
      { dayOfWeek: 0, startHour: 0, endHour: 24 },
      { dayOfWeek: 1, startHour: 18, endHour: 24 },
      { dayOfWeek: 1, startHour: 0, endHour: 8 },
      { dayOfWeek: 2, startHour: 18, endHour: 24 },
      { dayOfWeek: 2, startHour: 0, endHour: 8 },
      { dayOfWeek: 3, startHour: 18, endHour: 24 },
      { dayOfWeek: 3, startHour: 0, endHour: 8 },
      { dayOfWeek: 4, startHour: 18, endHour: 24 },
      { dayOfWeek: 4, startHour: 0, endHour: 8 },
      { dayOfWeek: 5, startHour: 18, endHour: 24 },
      { dayOfWeek: 5, startHour: 0, endHour: 8 },
      { dayOfWeek: 6, startHour: 0, endHour: 24 },
    ],
    allowedQuestionIds: [
      "room_details",
      "documented_policies",
      "booking_link",
      "tour_request",
      "location_hours",
    ],
    escalationOwner: "owner-morning-desk",
    maxAgentMessagesPerConversation: 8,
    duplicateSuppressionWindowSec: 300,
    identifyAsVirtualAssistant: true,
    repliesPaused: false,
    updatedAtIso: nowIso,
  };
}

export function toConversationState(
  conversation: ConversationRecord,
): ConversationState {
  return {
    conversationId: conversation.conversationId,
    version: conversation.version,
    humanOwned: conversation.humanOwned,
    agentSendAllowed: conversation.agentSendAllowed,
  };
}

export function createConversation(input: {
  conversationId: string;
  providerThreadId: string;
  channel: InboxChannelValue;
  customerDisplayName: string;
  customerEmail?: string | null;
  fixtureOnly?: boolean;
  nowIso: string;
}): ConversationRecord {
  return {
    conversationId: input.conversationId,
    providerThreadId: input.providerThreadId,
    channel: input.channel,
    version: 1,
    humanOwned: false,
    agentSendAllowed: true,
    status: ConversationStatus.OPEN,
    customerDisplayName: input.customerDisplayName,
    customerEmail: input.customerEmail ?? null,
    fixtureOnly: input.fixtureOnly !== false,
    leaseOwner: null,
    leaseExpiresAtIso: null,
    createdAtIso: input.nowIso,
    updatedAtIso: input.nowIso,
  };
}

/**
 * Ingest inbound message with provider-message dedupe.
 * Returns existing message when providerMessageId already recorded.
 */
export function ingestInboundMessage(input: {
  state: InboxState;
  conversation: ConversationRecord;
  messageId: string;
  providerMessageId: string | null;
  body: string;
  fixtureOnly?: boolean;
  nowIso: string;
}): {
  conversation: ConversationRecord;
  message: MessageRecord;
  duplicate: boolean;
  state: InboxState;
} {
  if (input.providerMessageId) {
    const existing = input.state.messages.find(
      (m) =>
        m.conversationId === input.conversation.conversationId &&
        m.providerMessageId === input.providerMessageId,
    );
    if (existing) {
      return {
        conversation: input.conversation,
        message: existing,
        duplicate: true,
        state: input.state,
      };
    }
  }

  const message: MessageRecord = {
    messageId: input.messageId,
    conversationId: input.conversation.conversationId,
    providerMessageId: input.providerMessageId,
    direction: MessageDirection.INBOUND,
    body: input.body,
    sender: "customer",
    preparedAtVersion: null,
    sendStatus: MessageSendStatus.SENT,
    citedFactIds: [],
    gatewayOperationId: null,
    bookingClaim: null,
    fixtureOnly: input.fixtureOnly !== false,
    createdAtIso: input.nowIso,
    sentAtIso: input.nowIso,
  };

  const conversation: ConversationRecord = {
    ...input.conversation,
    status: ConversationStatus.OPEN,
    updatedAtIso: input.nowIso,
  };

  const conversations = input.state.conversations.map((c) =>
    c.conversationId === conversation.conversationId ? conversation : c,
  );
  if (
    !conversations.some((c) => c.conversationId === conversation.conversationId)
  ) {
    conversations.push(conversation);
  }

  return {
    conversation,
    message,
    duplicate: false,
    state: {
      ...input.state,
      conversations,
      messages: [...input.state.messages, message].slice(-2000),
      updatedAtIso: input.nowIso,
    },
  };
}

export function acquireConversationLease(input: {
  conversation: ConversationRecord;
  leaseOwner: string;
  leaseExpiresAtIso: string;
  nowIso: string;
}):
  | { ok: true; conversation: ConversationRecord }
  | { ok: false; code: "LEASE_HELD"; reason: string } {
  if (
    input.conversation.leaseOwner &&
    input.conversation.leaseOwner !== input.leaseOwner &&
    input.conversation.leaseExpiresAtIso &&
    input.conversation.leaseExpiresAtIso > input.nowIso
  ) {
    return {
      ok: false,
      code: "LEASE_HELD",
      reason: `Conversation leased by ${input.conversation.leaseOwner} until ${input.conversation.leaseExpiresAtIso}`,
    };
  }
  return {
    ok: true,
    conversation: {
      ...input.conversation,
      leaseOwner: input.leaseOwner,
      leaseExpiresAtIso: input.leaseExpiresAtIso,
      updatedAtIso: input.nowIso,
    },
  };
}

/**
 * Prepare a concierge reply grounded only in SUPPORTED facts.
 * Never invents prices/availability; reservation claims require booking evidence.
 */
export function prepareConciergeReply(input: {
  draftId: string;
  conversation: ConversationRecord;
  inboundBody: string;
  citedFactIds: string[];
  factLabels: FactSupportLookup;
  policy: ResponsePolicy;
  bookingEvidence: readonly BookingEvidence[];
  bookingClaim?: BookingClaimKindValue | null;
  nowIso: string;
}):
  | { ok: true; draft: ConciergeDraft; reasons: string[] }
  | { ok: false; code: string; reasons: string[] } {
  const reasons: string[] = [];

  if (input.policy.repliesPaused) {
    return {
      ok: false,
      code: "REPLIES_PAUSED",
      reasons: ["Automated replies are paused by response policy"],
    };
  }
  if (input.conversation.humanOwned || !input.conversation.agentSendAllowed) {
    return {
      ok: false,
      code: "CONVERSATION_TAKEOVER",
      reasons: ["Human owns this conversation; agent draft blocked"],
    };
  }

  for (const factId of input.citedFactIds) {
    const label = lookupFactLabel(input.factLabels, factId);
    if (label !== SupportLabel.SUPPORTED) {
      reasons.push(
        `Fact ${factId} is ${label ?? "missing"} — only SUPPORTED facts may ground replies`,
      );
    }
  }
  if (reasons.length > 0) {
    return { ok: false, code: "UNSUPPORTED_FACTS", reasons };
  }

  const lower = input.inboundBody.toLowerCase();
  const asksForHuman =
    /\b(human|person|agent|someone|call me|speak to)\b/.test(lower) ||
    /\b(refund|legal|lawyer|dispute|emergency|locked out)\b/.test(lower);

  const bookingClaim = input.bookingClaim ?? null;
  if (bookingClaim === BookingClaimKind.RESERVATION) {
    const bookingGate = evaluateBookingClaim({
      claim: bookingClaim,
      conversationId: input.conversation.conversationId,
      bookingEvidence: input.bookingEvidence,
    });
    if (!bookingGate.allowed) {
      return {
        ok: false,
        code: bookingGate.code,
        reasons: bookingGate.reasons,
      };
    }
  }

  const identity = input.policy.identifyAsVirtualAssistant
    ? "I'm WorkSocial's virtual assistant. "
    : "";
  let body: string;
  if (asksForHuman) {
    body = `${identity}I can connect you with a teammate. I've flagged this for human follow-up.`;
  } else if (bookingClaim === BookingClaimKind.AVAILABILITY_LINK) {
    body = `${identity}Here is our booking link for current availability. A link is not a reservation — confirm only after the booking system returns a receipt.`;
  } else if (bookingClaim === BookingClaimKind.TOUR_REQUEST) {
    body = `${identity}I can log a tour request with your preferred location, date, and group size. A tour request is not a confirmed appointment.`;
  } else {
    body = `${identity}Thanks for reaching out. Based on our verified room details and documented policies, I can share supported information and collect the minimum details for a qualified lead.`;
  }

  const qualification: LeadQualificationValue = asksForHuman
    ? LeadQualification.NEEDS_HUMAN
    : LeadQualification.QUALIFIED;

  return {
    ok: true,
    draft: {
      draftId: input.draftId,
      conversationId: input.conversation.conversationId,
      body,
      citedFactIds: [...input.citedFactIds],
      preparedAtVersion: input.conversation.version,
      qualification,
      asksForHuman,
      bookingClaim,
      createdAtIso: input.nowIso,
    },
    reasons: ["Draft grounded in SUPPORTED facts only"],
  };
}

/** Queue an outbound agent reply bound to conversation version at prepare time. */
export function queueOutboundReply(input: {
  messageId: string;
  conversation: ConversationRecord;
  draft: ConciergeDraft;
  fixtureOnly?: boolean;
  nowIso: string;
}):
  | { ok: true; message: MessageRecord }
  | { ok: false; code: string; reasons: string[] } {
  if (input.draft.conversationId !== input.conversation.conversationId) {
    return {
      ok: false,
      code: "DRAFT_MISMATCH",
      reasons: ["Draft conversation does not match"],
    };
  }
  const gate = canAgentSend(
    toConversationState(input.conversation),
    input.draft.preparedAtVersion,
  );
  if (!gate.allowed) {
    return {
      ok: false,
      code: gate.code,
      reasons: ["Cannot queue — takeover or stale conversation version"],
    };
  }
  return {
    ok: true,
    message: {
      messageId: input.messageId,
      conversationId: input.conversation.conversationId,
      providerMessageId: null,
      direction: MessageDirection.OUTBOUND,
      body: input.draft.body,
      sender: "agent",
      preparedAtVersion: input.draft.preparedAtVersion,
      sendStatus: MessageSendStatus.QUEUED,
      citedFactIds: [...input.draft.citedFactIds],
      gatewayOperationId: null,
      bookingClaim: input.draft.bookingClaim,
      fixtureOnly: input.fixtureOnly !== false,
      createdAtIso: input.nowIso,
      sentAtIso: null,
    },
  };
}

/**
 * Gateway pre-send gate: version must match and agent send still allowed.
 */
export function evaluateOutboundSendGate(input: {
  conversation: ConversationRecord;
  message: MessageRecord;
  policy: ResponsePolicy;
  agentMessageCount: number;
}):
  | { allowed: true }
  | { allowed: false; code: string; reasons: string[] } {
  if (input.policy.repliesPaused) {
    return {
      allowed: false,
      code: "REPLIES_PAUSED",
      reasons: ["Automated replies are paused"],
    };
  }
  if (input.message.sendStatus !== MessageSendStatus.QUEUED) {
    return {
      allowed: false,
      code: "NOT_QUEUED",
      reasons: [`Message status is ${input.message.sendStatus}`],
    };
  }
  if (
    input.message.preparedAtVersion === null ||
    input.message.preparedAtVersion === undefined
  ) {
    return {
      allowed: false,
      code: "MISSING_PREPARED_VERSION",
      reasons: ["Queued reply missing preparedAtVersion"],
    };
  }
  const gate = canAgentSend(
    toConversationState(input.conversation),
    input.message.preparedAtVersion,
  );
  if (!gate.allowed) {
    return {
      allowed: false,
      code: gate.code,
      reasons: ["Conversation takeover or version mismatch blocks send"],
    };
  }
  if (
    input.agentMessageCount >= input.policy.maxAgentMessagesPerConversation
  ) {
    return {
      allowed: false,
      code: "MESSAGE_LIMIT",
      reasons: [
        `Agent message limit ${input.policy.maxAgentMessagesPerConversation} reached`,
      ],
    };
  }
  if (input.message.bookingClaim === BookingClaimKind.RESERVATION) {
    return {
      allowed: false,
      code: "BOOKING_EVIDENCE_REQUIRED",
      reasons: [
        "Reservation claims cannot be sent without verified booking evidence — use evaluateBookingClaim first",
      ],
    };
  }
  return { allowed: true };
}

/**
 * Atomic human takeover: increments version, blocks agent send, cancels queued.
 */
export function applyConversationTakeover(input: {
  state: InboxState;
  conversationId: string;
  nowIso: string;
}):
  | {
      ok: true;
      conversation: ConversationRecord;
      cancelledMessageIds: string[];
      state: InboxState;
    }
  | { ok: false; code: string; reasons: string[] } {
  const idx = input.state.conversations.findIndex(
    (c) => c.conversationId === input.conversationId,
  );
  if (idx < 0) {
    return {
      ok: false,
      code: "CONVERSATION_NOT_FOUND",
      reasons: [`Unknown conversation ${input.conversationId}`],
    };
  }
  const before = input.state.conversations[idx]!;
  const takeover = applyTakeover(toConversationState(before));
  const conversation: ConversationRecord = {
    ...before,
    version: takeover.conversation.version,
    humanOwned: takeover.conversation.humanOwned,
    agentSendAllowed: takeover.conversation.agentSendAllowed,
    status: ConversationStatus.AWAITING_HUMAN,
    updatedAtIso: input.nowIso,
  };

  const cancelledMessageIds: string[] = [];
  const messages = input.state.messages.map((m) => {
    if (
      m.conversationId === input.conversationId &&
      m.sendStatus === MessageSendStatus.QUEUED
    ) {
      cancelledMessageIds.push(m.messageId);
      return {
        ...m,
        sendStatus: MessageSendStatus.BLOCKED_TAKEOVER,
      };
    }
    return m;
  });

  const conversations = [...input.state.conversations];
  conversations[idx] = conversation;

  return {
    ok: true,
    conversation,
    cancelledMessageIds,
    state: {
      ...input.state,
      conversations,
      messages,
      updatedAtIso: input.nowIso,
    },
  };
}

export function evaluateBookingClaim(input: {
  claim: BookingClaimKindValue;
  conversationId: string;
  bookingEvidence: readonly BookingEvidence[];
}):
  | { allowed: true }
  | { allowed: false; code: string; reasons: string[] } {
  if (input.claim !== BookingClaimKind.RESERVATION) {
    return { allowed: true };
  }
  const evidence = input.bookingEvidence.find(
    (e) =>
      e.conversationId === input.conversationId &&
      e.claimKind === BookingClaimKind.RESERVATION &&
      e.verified,
  );
  if (!evidence) {
    return {
      allowed: false,
      code: "BOOKING_EVIDENCE_REQUIRED",
      reasons: [
        "No reservation without booking evidence — recommendation/tour request are not confirmations",
      ],
    };
  }
  return { allowed: true };
}

export function createQualifiedLead(input: {
  leadId: string;
  conversation: ConversationRecord;
  correlationId: string;
  email: string;
  displayName: string;
  locationNeed?: string | null;
  dateNeed?: string | null;
  sizeNeed?: string | null;
  qualification?: LeadQualificationValue;
  synthetic?: boolean;
  fixtureOnly?: boolean;
  nowIso: string;
}): QualifiedLead {
  return {
    leadId: input.leadId,
    conversationId: input.conversation.conversationId,
    correlationId: input.correlationId,
    email: input.email,
    displayName: input.displayName,
    locationNeed: input.locationNeed ?? null,
    dateNeed: input.dateNeed ?? null,
    sizeNeed: input.sizeNeed ?? null,
    qualification: input.qualification ?? LeadQualification.QUALIFIED,
    synthetic: input.synthetic !== false,
    crmRecordId: null,
    fixtureOnly: input.fixtureOnly !== false,
    gatewayOperationId: null,
    writePathId: null,
    createdAtIso: input.nowIso,
  };
}

export function createHandoff(input: {
  handoffId: string;
  conversation: ConversationRecord;
  reason: string;
  urgency?: HandoffRecord["urgency"];
  nextOwner: string;
  customerQuestions: string[];
  verifiedAnswers: string[];
  requestedAction: string;
  nowIso: string;
}): { handoff: HandoffRecord; conversation: ConversationRecord } {
  const handoff: HandoffRecord = {
    handoffId: input.handoffId,
    conversationId: input.conversation.conversationId,
    reason: input.reason,
    urgency: input.urgency ?? "normal",
    nextOwner: input.nextOwner,
    customerQuestions: [...input.customerQuestions],
    verifiedAnswers: [...input.verifiedAnswers],
    requestedAction: input.requestedAction,
    acknowledged: false,
    acknowledgedAtIso: null,
    createdAtIso: input.nowIso,
  };
  const conversation: ConversationRecord = {
    ...input.conversation,
    status: ConversationStatus.HANDED_OFF,
    humanOwned: true,
    agentSendAllowed: false,
    updatedAtIso: input.nowIso,
  };
  return { handoff, conversation };
}

export function acknowledgeHandoff(input: {
  handoff: HandoffRecord;
  nowIso: string;
}): HandoffRecord {
  return {
    ...input.handoff,
    acknowledged: true,
    acknowledgedAtIso: input.nowIso,
  };
}

export function buildInboxSendOutcome(input: {
  outcomeId: string;
  conversationId: string;
  messageId: string;
  writePathId: string;
  operationId: string;
  decision: InboxOutcomeDecisionValue;
  source: OutcomeEvidenceSourceValue;
  fixtureOnly: boolean;
  summary: string;
  recordedAtIso: string;
  featureHints?: Record<string, string | number | boolean | null>;
}): WritePathOutcomeEvidence {
  const label: OutcomeLabelValue =
    input.decision === InboxOutcomeDecision.SUCCESS
      ? OutcomeLabel.SUCCESS
      : input.decision === InboxOutcomeDecision.FAILURE
        ? OutcomeLabel.FAILURE
        : OutcomeLabel.UNKNOWN;
  return recordWritePathOutcome({
    outcomeId: input.outcomeId,
    writePathId: input.writePathId,
    operationId: input.operationId,
    label,
    source: input.source,
    fixtureOnly: input.fixtureOnly,
    summary: input.summary,
    recordedAtIso: input.recordedAtIso,
    featureHints: {
      conversationId: input.conversationId,
      messageId: input.messageId,
      ...(input.featureHints ?? {}),
    },
  });
}

export function listInboxOutcomesForLearning(
  state: InboxState,
  options?: { includeFixture?: boolean },
): WritePathOutcomeEvidence[] {
  const includeFixture = options?.includeFixture === true;
  return state.sendOutcomes.filter((row) => {
    if (row.label === OutcomeLabel.UNKNOWN) return false;
    if (row.fixtureOnly && !includeFixture) return false;
    return true;
  });
}

export function countAgentMessages(
  messages: readonly MessageRecord[],
  conversationId: string,
): number {
  return messages.filter(
    (m) =>
      m.conversationId === conversationId &&
      m.direction === MessageDirection.OUTBOUND &&
      m.sender === "agent" &&
      (m.sendStatus === MessageSendStatus.SENT ||
        m.sendStatus === MessageSendStatus.QUEUED),
  ).length;
}

export function detectDuplicateOutbound(input: {
  messages: readonly MessageRecord[];
  conversationId: string;
  body: string;
  nowIso: string;
  windowSec: number;
}): boolean {
  const nowMs = Date.parse(input.nowIso);
  if (Number.isNaN(nowMs)) return false;
  return input.messages.some((m) => {
    if (
      m.conversationId !== input.conversationId ||
      m.direction !== MessageDirection.OUTBOUND ||
      m.body !== input.body
    ) {
      return false;
    }
    if (
      m.sendStatus !== MessageSendStatus.SENT &&
      m.sendStatus !== MessageSendStatus.QUEUED
    ) {
      return false;
    }
    const ts = Date.parse(m.createdAtIso);
    if (Number.isNaN(ts)) return false;
    return nowMs - ts <= input.windowSec * 1000;
  });
}

export const INBOX_RELATED_CASE_IDS = [
  "T-F22", // after-hours messages and takeover
  "T-I01", // conversation version + queued-send cancellation
  "T-I02", // fixture lead logging + Zoho path
  "T-I03", // no reservation without booking evidence
] as const;

// Re-export OutcomeEvidenceSource for callers that build inbox outcomes.
export { OutcomeEvidenceSource };
