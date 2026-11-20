/**
 * R1-09 / M7 (NEXT-18) Customer response / after-hours operations.
 *
 * Pure types + validators. No network I/O.
 * Takeover increments conversation version and blocks unsent agent replies
 * (queued + draft messages + unqueued concierge drafts).
 * Fixture webhook coalescing by providerEventId; lead coalesce by inbound key.
 * Delivery is independent of adapter acceptance (sent ≠ delivered).
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
  /** Independent fixture delivery receipt after adapter acceptance. */
  DELIVERED: "delivered",
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
  /** Independent delivery observation (fixture simulator). */
  deliveredAtIso: string | null;
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
  /** Set when human takeover invalidates an unqueued draft. */
  invalidatedAtIso: string | null;
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
  /** Inbound message that sourced this lead (coalesce key with conversation). */
  sourceInboundMessageId: string | null;
  /** Fixture webhook event id when lead was created from coalesced intake. */
  providerEventId: string | null;
  createdAtIso: string;
};

/** Durable fixture webhook envelope — coalesce by providerEventId. */
export type InboxWebhookEvent = {
  eventId: string;
  providerEventId: string;
  providerThreadId: string;
  providerMessageId: string;
  channel: InboxChannelValue;
  body: string;
  customerDisplayName: string;
  customerEmail: string | null;
  conversationId: string | null;
  messageId: string | null;
  coalesced: boolean;
  fixtureOnly: boolean;
  receivedAtIso: string;
};

export const OwnershipEventKind = {
  LEASE: "lease",
  TAKEOVER: "takeover",
  HANDOFF: "handoff",
} as const;

export type OwnershipEventKindValue =
  (typeof OwnershipEventKind)[keyof typeof OwnershipEventKind];

/** First-class ownership / version audit for conversations. */
export type OwnershipEvent = {
  eventId: string;
  conversationId: string;
  kind: OwnershipEventKindValue;
  fromVersion: number;
  toVersion: number;
  actorUserId: string | null;
  detail: string;
  atIso: string;
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
  webhookEvents: InboxWebhookEvent[];
  ownershipEvents: OwnershipEvent[];
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
    webhookEvents: [],
    ownershipEvents: [],
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

const WEEKDAY_TO_DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * True when `nowIso` falls inside at least one coverage window in policy.timezone.
 * Empty coverageWindows fails closed (no automated replies).
 */
export function isWithinCoverageWindow(
  policy: ResponsePolicy,
  nowIso: string,
): boolean {
  if (policy.coverageWindows.length === 0) return false;
  const date = new Date(nowIso);
  if (Number.isNaN(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: policy.timezone,
    weekday: "short",
    hour: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "0";
  const dayOfWeek = WEEKDAY_TO_DOW[weekday];
  const hour = Number.parseInt(hourRaw, 10);
  if (dayOfWeek === undefined || Number.isNaN(hour)) return false;
  return policy.coverageWindows.some(
    (w) =>
      w.dayOfWeek === dayOfWeek && hour >= w.startHour && hour < w.endHour,
  );
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
    deliveredAtIso: input.nowIso,
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
  /** Required when bookingClaim is AVAILABILITY_LINK — must be a real URL. */
  bookingLinkUrl?: string | null;
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
  if (!isWithinCoverageWindow(input.policy, input.nowIso)) {
    return {
      ok: false,
      code: "OUTSIDE_COVERAGE",
      reasons: [
        `Now is outside after-hours coverage windows (${input.policy.timezone})`,
      ],
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

  if (asksForHuman) {
    return {
      ok: false,
      code: "HUMAN_REQUESTED",
      reasons: [
        "Customer requested a human or raised a sensitive issue — stop automated handling and hand off",
      ],
    };
  }

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
  if (bookingClaim === BookingClaimKind.AVAILABILITY_LINK) {
    const url = input.bookingLinkUrl?.trim() ?? "";
    if (!/^https?:\/\//i.test(url)) {
      return {
        ok: false,
        code: "BOOKING_LINK_REQUIRED",
        reasons: [
          "Availability-link replies require a concrete http(s) booking URL grounded in verified evidence",
        ],
      };
    }
    body = `${identity}Here is our booking link for current availability: ${url}. A link is not a reservation — confirm only after the booking system returns a receipt.`;
  } else if (bookingClaim === BookingClaimKind.TOUR_REQUEST) {
    body = `${identity}I can log a tour request with your preferred location, date, and group size. A tour request is not a confirmed appointment.`;
  } else {
    body = `${identity}Thanks for reaching out. Based on our verified room details and documented policies, I can share supported information and collect the minimum details for a qualified lead.`;
  }

  return {
    ok: true,
    draft: {
      draftId: input.draftId,
      conversationId: input.conversation.conversationId,
      body,
      citedFactIds: [...input.citedFactIds],
      preparedAtVersion: input.conversation.version,
      qualification: LeadQualification.QUALIFIED,
      asksForHuman: false,
      bookingClaim,
      createdAtIso: input.nowIso,
      invalidatedAtIso: null,
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
  if (input.draft.asksForHuman) {
    return {
      ok: false,
      code: "HUMAN_REQUESTED",
      reasons: ["Cannot queue agent reply when customer requested a human"],
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
  if (input.draft.invalidatedAtIso) {
    return {
      ok: false,
      code: "DRAFT_INVALIDATED",
      reasons: ["Draft was invalidated by human takeover"],
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
      deliveredAtIso: null,
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
  /** Count of already-SENT agent messages (excludes the queued message under evaluation). */
  sentAgentMessageCount: number;
  bookingEvidence: readonly BookingEvidence[];
  nowIso: string;
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
  if (!isWithinCoverageWindow(input.policy, input.nowIso)) {
    return {
      allowed: false,
      code: "OUTSIDE_COVERAGE",
      reasons: [
        `Send refused outside after-hours coverage windows (${input.policy.timezone})`,
      ],
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
    input.sentAgentMessageCount >=
    input.policy.maxAgentMessagesPerConversation
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
    const booking = evaluateBookingClaim({
      claim: BookingClaimKind.RESERVATION,
      conversationId: input.conversation.conversationId,
      bookingEvidence: input.bookingEvidence,
    });
    if (!booking.allowed) {
      return {
        allowed: false,
        code: booking.code,
        reasons: booking.reasons,
      };
    }
  }
  return { allowed: true };
}

/**
 * Atomic human takeover: increments version, blocks agent send, cancels every
 * unsent agent response (queued + draft message rows) and invalidates drafts.
 */
export function applyConversationTakeover(input: {
  state: InboxState;
  conversationId: string;
  nowIso: string;
  actorUserId?: string | null;
  ownershipEventId?: string;
  /** Defaults to takeover; handoff path should pass OwnershipEventKind.HANDOFF. */
  ownershipKind?: OwnershipEventKindValue;
  ownershipDetail?: string;
  /** When set (e.g. handed_off), preserves that status instead of awaiting_human. */
  preserveStatus?: ConversationStatusValue;
}):
  | {
      ok: true;
      conversation: ConversationRecord;
      cancelledMessageIds: string[];
      invalidatedDraftIds: string[];
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
  const ownershipKind = input.ownershipKind ?? OwnershipEventKind.TAKEOVER;
  const conversation: ConversationRecord = {
    ...before,
    version: takeover.conversation.version,
    humanOwned: takeover.conversation.humanOwned,
    agentSendAllowed: takeover.conversation.agentSendAllowed,
    status: input.preserveStatus ?? ConversationStatus.AWAITING_HUMAN,
    updatedAtIso: input.nowIso,
  };

  const cancelledMessageIds: string[] = [];
  const messages = input.state.messages.map((m) => {
    if (
      m.conversationId === input.conversationId &&
      (m.sendStatus === MessageSendStatus.QUEUED ||
        m.sendStatus === MessageSendStatus.DRAFT)
    ) {
      cancelledMessageIds.push(m.messageId);
      return {
        ...m,
        sendStatus: MessageSendStatus.BLOCKED_TAKEOVER,
      };
    }
    return m;
  });

  const invalidatedDraftIds: string[] = [];
  const drafts = input.state.drafts.map((d) => {
    if (
      d.conversationId === input.conversationId &&
      d.invalidatedAtIso === null
    ) {
      invalidatedDraftIds.push(d.draftId);
      return { ...d, invalidatedAtIso: input.nowIso };
    }
    return d;
  });

  const conversations = [...input.state.conversations];
  conversations[idx] = conversation;

  const defaultDetail =
    ownershipKind === OwnershipEventKind.HANDOFF
      ? `Handoff cancelled ${cancelledMessageIds.length} unsent message(s); invalidated ${invalidatedDraftIds.length} draft(s)`
      : `Takeover cancelled ${cancelledMessageIds.length} unsent message(s); invalidated ${invalidatedDraftIds.length} draft(s)`;

  const ownershipEvent: OwnershipEvent = {
    eventId: input.ownershipEventId ?? `own-${input.conversationId}-${input.nowIso}`,
    conversationId: input.conversationId,
    kind: ownershipKind,
    fromVersion: before.version,
    toVersion: conversation.version,
    actorUserId: input.actorUserId ?? null,
    detail: input.ownershipDetail ?? defaultDetail,
    atIso: input.nowIso,
  };

  return {
    ok: true,
    conversation,
    cancelledMessageIds,
    invalidatedDraftIds,
    state: {
      ...input.state,
      conversations,
      messages,
      drafts,
      ownershipEvents: [
        ...(input.state.ownershipEvents ?? []),
        ownershipEvent,
      ].slice(-1000),
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
  sourceInboundMessageId?: string | null;
  providerEventId?: string | null;
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
    sourceInboundMessageId: input.sourceInboundMessageId ?? null,
    providerEventId: input.providerEventId ?? null,
    createdAtIso: input.nowIso,
  };
}

/**
 * Find an existing *successful* CRM lead for the same conversation + inbound
 * message / event. Denied attempts (no crmRecordId) must remain retryable.
 */
export function findCoalescedLead(input: {
  leads: readonly QualifiedLead[];
  conversationId: string;
  sourceInboundMessageId?: string | null;
  providerEventId?: string | null;
  correlationId?: string | null;
}): QualifiedLead | null {
  const successful = input.leads.filter(
    (l) =>
      l.conversationId === input.conversationId &&
      l.crmRecordId != null &&
      l.crmRecordId !== "",
  );

  const byInbound =
    input.sourceInboundMessageId != null && input.sourceInboundMessageId !== ""
      ? successful.find(
          (l) => l.sourceInboundMessageId === input.sourceInboundMessageId,
        )
      : undefined;
  if (byInbound) return byInbound;

  const byEvent =
    input.providerEventId != null && input.providerEventId !== ""
      ? successful.find((l) => l.providerEventId === input.providerEventId)
      : undefined;
  if (byEvent) return byEvent;

  const byCorr =
    input.correlationId != null && input.correlationId !== ""
      ? successful.find((l) => l.correlationId === input.correlationId)
      : undefined;
  return byCorr ?? null;
}

/**
 * Durable fixture webhook intake with providerEventId coalesce.
 * Duplicate events return the prior conversation/message without new rows.
 */
export function ingestFixtureWebhook(input: {
  state: InboxState;
  eventId: string;
  providerEventId: string;
  providerThreadId: string;
  providerMessageId: string;
  body: string;
  customerDisplayName: string;
  customerEmail?: string | null;
  channel?: InboxChannelValue;
  conversationId?: string;
  messageId: string;
  fixtureOnly?: boolean;
  nowIso: string;
}):
  | {
      ok: true;
      conversation: ConversationRecord;
      message: MessageRecord;
      event: InboxWebhookEvent;
      duplicate: boolean;
      /** True when a new providerEventId row was appended (even if message coalesced). */
      eventRecorded: boolean;
      state: InboxState;
    }
  | { ok: false; code: string; reasons: string[] } {
  const prior = (input.state.webhookEvents ?? []).find(
    (e) => e.providerEventId === input.providerEventId,
  );
  if (prior) {
    const conversation =
      input.state.conversations.find(
        (c) => c.conversationId === prior.conversationId,
      ) ??
      input.state.conversations.find(
        (c) => c.providerThreadId === input.providerThreadId,
      );
    const message =
      input.state.messages.find((m) => m.messageId === prior.messageId) ??
      input.state.messages.find(
        (m) =>
          m.providerMessageId === input.providerMessageId &&
          m.conversationId === prior.conversationId,
      );
    if (conversation && message) {
      const coalesced: InboxWebhookEvent = {
        ...prior,
        coalesced: true,
        receivedAtIso: prior.receivedAtIso,
      };
      return {
        ok: true,
        conversation,
        message,
        event: coalesced,
        duplicate: true,
        eventRecorded: false,
        state: input.state,
      };
    }
  }

  const byId = input.conversationId
    ? (input.state.conversations.find(
        (c) => c.conversationId === input.conversationId,
      ) ?? null)
    : null;
  const byThread =
    input.state.conversations.find(
      (c) => c.providerThreadId === input.providerThreadId,
    ) ?? null;

  if (
    byId &&
    byThread &&
    byId.conversationId !== byThread.conversationId
  ) {
    return {
      ok: false,
      code: "CONFLICTING_CONVERSATION_IDS",
      reasons: [
        `conversationId ${byId.conversationId} != providerThread ${byThread.conversationId}`,
      ],
    };
  }

  let conversation = byId ?? byThread;
  let workingState = input.state;

  if (!conversation) {
    conversation = createConversation({
      conversationId: input.conversationId ?? `conv-${input.providerEventId}`,
      providerThreadId: input.providerThreadId,
      channel: input.channel ?? InboxChannel.FIXTURE,
      customerDisplayName: input.customerDisplayName,
      customerEmail: input.customerEmail ?? null,
      fixtureOnly: input.fixtureOnly !== false,
      nowIso: input.nowIso,
    });
    workingState = {
      ...workingState,
      conversations: [...workingState.conversations, conversation],
    };
  } else {
    // Refresh missing customer identity from later durable webhook fields.
    const nextEmail =
      conversation.customerEmail ?? input.customerEmail ?? null;
    const nextName =
      conversation.customerDisplayName.trim() !== ""
        ? conversation.customerDisplayName
        : input.customerDisplayName;
    if (
      nextEmail !== conversation.customerEmail ||
      nextName !== conversation.customerDisplayName
    ) {
      conversation = {
        ...conversation,
        customerEmail: nextEmail,
        customerDisplayName: nextName,
        updatedAtIso: input.nowIso,
      };
      workingState = {
        ...workingState,
        conversations: workingState.conversations.map((c) =>
          c.conversationId === conversation!.conversationId
            ? conversation!
            : c,
        ),
      };
    }
  }

  const ingested = ingestInboundMessage({
    state: workingState,
    conversation,
    messageId: input.messageId,
    providerMessageId: input.providerMessageId,
    body: input.body,
    fixtureOnly: input.fixtureOnly !== false,
    nowIso: input.nowIso,
  });

  const event: InboxWebhookEvent = {
    eventId: input.eventId,
    providerEventId: input.providerEventId,
    providerThreadId: input.providerThreadId,
    providerMessageId: input.providerMessageId,
    channel: input.channel ?? InboxChannel.FIXTURE,
    body: input.body,
    customerDisplayName: input.customerDisplayName,
    customerEmail: input.customerEmail ?? null,
    conversationId: ingested.conversation.conversationId,
    messageId: ingested.message.messageId,
    coalesced: ingested.duplicate,
    fixtureOnly: input.fixtureOnly !== false,
    receivedAtIso: input.nowIso,
  };

  // Even when inbound message deduped, record the new webhook event id.
  const alreadyLogged = (ingested.state.webhookEvents ?? []).some(
    (e) => e.providerEventId === input.providerEventId,
  );
  const state: InboxState = alreadyLogged
    ? ingested.state
    : {
        ...ingested.state,
        webhookEvents: [...(ingested.state.webhookEvents ?? []), event].slice(
          -2000,
        ),
        updatedAtIso: input.nowIso,
      };

  return {
    ok: true,
    conversation: ingested.conversation,
    message: ingested.message,
    event,
    duplicate: ingested.duplicate || alreadyLogged,
    eventRecorded: !alreadyLogged,
    state,
  };
}

/**
 * Mark an accepted (sent) outbound as delivered via independent fixture read-back.
 * Acceptance ≠ delivery — caller must confirm after adapter ack.
 */
export function confirmOutboundDelivery(input: {
  message: MessageRecord;
  nowIso: string;
}):
  | { ok: true; message: MessageRecord }
  | { ok: false; code: string; reasons: string[] } {
  if (input.message.direction !== MessageDirection.OUTBOUND) {
    return {
      ok: false,
      code: "NOT_OUTBOUND",
      reasons: ["Only outbound messages can be delivery-confirmed"],
    };
  }
  if (input.message.sendStatus === MessageSendStatus.DELIVERED) {
    return { ok: true, message: input.message };
  }
  if (input.message.sendStatus !== MessageSendStatus.SENT) {
    return {
      ok: false,
      code: "NOT_SENT",
      reasons: [
        `Delivery requires sent status; current=${input.message.sendStatus}`,
      ],
    };
  }
  return {
    ok: true,
    message: {
      ...input.message,
      sendStatus: MessageSendStatus.DELIVERED,
      deliveredAtIso: input.nowIso,
    },
  };
}

/** Chronological timeline rows for console / API. */
export function buildConversationTimeline(input: {
  conversation: ConversationRecord;
  messages: readonly MessageRecord[];
  drafts?: readonly ConciergeDraft[];
  leads?: readonly QualifiedLead[];
  handoffs?: readonly HandoffRecord[];
  ownershipEvents?: readonly OwnershipEvent[];
}): Array<{
  atIso: string;
  kind: string;
  id: string;
  summary: string;
  meta?: Record<string, string | number | boolean | null>;
}> {
  const rows: Array<{
    atIso: string;
    kind: string;
    id: string;
    summary: string;
    meta?: Record<string, string | number | boolean | null>;
  }> = [];

  for (const m of input.messages) {
    if (m.conversationId !== input.conversation.conversationId) continue;
    rows.push({
      atIso: m.sentAtIso ?? m.createdAtIso,
      kind: m.direction === MessageDirection.INBOUND ? "inbound" : "outbound",
      id: m.messageId,
      summary: m.body.slice(0, 160),
      meta: {
        sender: m.sender,
        sendStatus: m.sendStatus,
        preparedAtVersion: m.preparedAtVersion,
        deliveredAtIso: m.deliveredAtIso,
      },
    });
  }
  for (const d of input.drafts ?? []) {
    if (d.conversationId !== input.conversation.conversationId) continue;
    rows.push({
      atIso: d.invalidatedAtIso ?? d.createdAtIso,
      kind: d.invalidatedAtIso ? "draft_invalidated" : "draft",
      id: d.draftId,
      summary: d.body.slice(0, 160),
      meta: {
        preparedAtVersion: d.preparedAtVersion,
        invalidated: d.invalidatedAtIso !== null,
      },
    });
  }
  for (const l of input.leads ?? []) {
    if (l.conversationId !== input.conversation.conversationId) continue;
    rows.push({
      atIso: l.createdAtIso,
      kind: "lead",
      id: l.leadId,
      summary: `Qualified lead ${l.email} (synthetic=${l.synthetic})`,
      meta: {
        crmRecordId: l.crmRecordId,
        sourceInboundMessageId: l.sourceInboundMessageId,
        providerEventId: l.providerEventId,
      },
    });
  }
  for (const h of input.handoffs ?? []) {
    if (h.conversationId !== input.conversation.conversationId) continue;
    rows.push({
      atIso: h.acknowledgedAtIso ?? h.createdAtIso,
      kind: h.acknowledged ? "handoff_acked" : "handoff",
      id: h.handoffId,
      summary: h.reason,
      meta: { nextOwner: h.nextOwner, acknowledged: h.acknowledged },
    });
  }
  for (const o of input.ownershipEvents ?? []) {
    if (o.conversationId !== input.conversation.conversationId) continue;
    rows.push({
      atIso: o.atIso,
      kind: `ownership_${o.kind}`,
      id: o.eventId,
      summary: o.detail,
      meta: {
        fromVersion: o.fromVersion,
        toVersion: o.toVersion,
        actorUserId: o.actorUserId,
      },
    });
  }

  return rows.sort((a, b) => a.atIso.localeCompare(b.atIso));
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

export function countSentAgentMessages(
  messages: readonly MessageRecord[],
  conversationId: string,
): number {
  return messages.filter(
    (m) =>
      m.conversationId === conversationId &&
      m.direction === MessageDirection.OUTBOUND &&
      m.sender === "agent" &&
      (m.sendStatus === MessageSendStatus.SENT ||
        m.sendStatus === MessageSendStatus.DELIVERED),
  ).length;
}

/** @deprecated Prefer countSentAgentMessages for send-limit checks. */
export function countAgentMessages(
  messages: readonly MessageRecord[],
  conversationId: string,
): number {
  return countSentAgentMessages(messages, conversationId);
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
      m.sendStatus !== MessageSendStatus.DELIVERED &&
      m.sendStatus !== MessageSendStatus.QUEUED
    ) {
      return false;
    }
    // Prefer delivery/send time so long-queued then-delivered replies stay
    // inside the suppression window after confirmDelivery.
    const stamp =
      m.sendStatus === MessageSendStatus.QUEUED
        ? m.createdAtIso
        : (m.deliveredAtIso ?? m.sentAtIso ?? m.createdAtIso);
    const ts = Date.parse(stamp);
    if (Number.isNaN(ts)) return false;
    return nowMs - ts <= input.windowSec * 1000;
  });
}

export const INBOX_RELATED_CASE_IDS = [
  "T-F22", // after-hours messages and takeover
  "T-I01", // conversation version + queued-send cancellation
  "T-I02", // fixture lead logging + Zoho path
  "T-I03", // no reservation without booking evidence
  "T-US-043", // after-hours + takeover (M7)
  "T-US-044", // duplicate inbound coalesce (M7)
] as const;

// Re-export OutcomeEvidenceSource for callers that build inbox outcomes.
export { OutcomeEvidenceSource };
