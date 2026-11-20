/**
 * Inbox service: after-hours concierge, gateway-gated send, takeover,
 * fixture Zoho lead logging, and morning handoff.
 * Live inbox providers remain NOT_WIRED.
 */

import { randomUUID } from "node:crypto";
import {
  ActionClass,
  BookingClaimKind,
  InboxAdapterStatus,
  InboxOutcomeDecision,
  INBOX_RELATED_CASE_IDS,
  MessageSendStatus,
  OutcomeEvidenceSource,
  acknowledgeHandoff,
  applyConversationTakeover,
  countAgentMessages,
  createConversation,
  createHandoff,
  createQualifiedLead,
  defaultResponsePolicy,
  detectDuplicateOutbound,
  evaluateBookingClaim,
  evaluateOutboundSendGate,
  ingestInboundMessage,
  listInboxOutcomesForLearning,
  prepareConciergeReply,
  queueOutboundReply,
  buildInboxSendOutcome,
  type BookingClaimKindValue,
  type BookingEvidence,
  type CapabilityGrant,
  type ConciergeDraft,
  type ConversationRecord,
  type FactSupportLookup,
  type HandoffRecord,
  type MessageRecord,
  type OperatingModeValue,
  type ProductionMappingState,
  type QualifiedLead,
  type ResponsePolicy,
  type StandingPolicy,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type { InboxStore } from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayAuthoritySnapshot,
  type GatewayDecisionRecord,
} from "@worksocial/action-gateway";
import {
  INBOX_CRM_LEAD_WRITE_PATH_ID,
  INBOX_PILOT_CONV_ASSET_ID,
  INBOX_PILOT_LEAD_ASSET_ID,
  INBOX_REPLY_WRITE_PATH_ID,
  buildGoldenInbound,
  createFixtureInboxPilotMapping,
  invokeCrmLeadAdapter,
  invokeInboxSendAdapter,
  proveFixtureInboxWritePaths,
} from "./fixtures.js";

export type InboxServiceOptions = {
  gateway?: ActionGateway;
};

export type InboxAuthorityInput = {
  outboundStopped: boolean;
  operatingMode: OperatingModeValue;
  policies: StandingPolicy[];
  grants: CapabilityGrant[];
};

export type InboxService = {
  status(): ReturnType<InboxStore["status"]> & {
    acceptanceCaseIds: readonly string[];
    learningHookNote: string;
  };
  listConversations(limit?: number): ConversationRecord[];
  listMessages(conversationId?: string, limit?: number): MessageRecord[];
  listLeads(limit?: number): QualifiedLead[];
  listHandoffs(limit?: number): HandoffRecord[];
  getPolicy(): ResponsePolicy | null;
  setPolicy(policy: ResponsePolicy): ResponsePolicy;
  seedFixtures(nowIso?: string): {
    conversation: ConversationRecord;
    inbound: MessageRecord;
    policy: ResponsePolicy;
  };
  seedAndProveInboxMapping(nowIso?: string): {
    mapping: ProductionMappingState;
    writePathIds: { reply: string; lead: string };
  };
  ingestInbound(input: {
    conversationId?: string;
    providerThreadId: string;
    customerDisplayName: string;
    customerEmail?: string | null;
    body: string;
    providerMessageId?: string | null;
    channel?: ConversationRecord["channel"];
    fixtureOnly?: boolean;
    nowIso?: string;
  }): {
    conversation: ConversationRecord;
    message: MessageRecord;
    duplicate: boolean;
  };
  draftReply(input: {
    conversationId: string;
    citedFactIds: string[];
    factLabels: FactSupportLookup;
    bookingClaim?: BookingClaimKindValue | null;
    inboundBody?: string;
    nowIso?: string;
  }):
    | { ok: true; draft: ConciergeDraft; reasons: string[] }
    | { ok: false; code: string; reasons: string[] };
  queueReply(input: {
    conversationId: string;
    draftId: string;
    nowIso?: string;
  }):
    | { ok: true; message: MessageRecord }
    | { ok: false; code: string; reasons: string[] };
  sendQueuedReply(input: {
    messageId: string;
    authority: InboxAuthorityInput;
    productionMapping: ProductionMappingState;
    preferLive?: boolean;
    targetAccountId?: string;
    contentRevision?: string;
    nowIso?: string;
  }): {
    message: MessageRecord | null;
    gatewayDecision: GatewayDecisionRecord | null;
    outcome: WritePathOutcomeEvidence | null;
    liveInboxWiring: "NOT_WIRED" | "FIXTURE";
    details: string[];
  };
  takeOver(input: {
    conversationId: string;
    nowIso?: string;
  }):
    | {
        ok: true;
        conversation: ConversationRecord;
        cancelledMessageIds: string[];
      }
    | { ok: false; code: string; reasons: string[] };
  logLead(input: {
    conversationId: string;
    email?: string;
    displayName?: string;
    locationNeed?: string | null;
    dateNeed?: string | null;
    sizeNeed?: string | null;
    authority: InboxAuthorityInput;
    productionMapping: ProductionMappingState;
    preferLive?: boolean;
    targetAccountId?: string;
    nowIso?: string;
  }): {
    lead: QualifiedLead | null;
    gatewayDecision: GatewayDecisionRecord | null;
    outcome: WritePathOutcomeEvidence | null;
    liveCrmLeadWiring: "NOT_WIRED" | "FIXTURE";
    details: string[];
  };
  createMorningHandoff(input: {
    conversationId: string;
    reason: string;
    nextOwner?: string;
    urgency?: HandoffRecord["urgency"];
    customerQuestions?: string[];
    verifiedAnswers?: string[];
    requestedAction?: string;
    nowIso?: string;
  }):
    | { ok: true; handoff: HandoffRecord; conversation: ConversationRecord }
    | { ok: false; code: string; reasons: string[] };
  acknowledgeMorningHandoff(input: {
    handoffId: string;
    nowIso?: string;
  }):
    | { ok: true; handoff: HandoffRecord }
    | { ok: false; code: string; reasons: string[] };
  addBookingEvidence(input: BookingEvidence): BookingEvidence;
  listOutcomesForLearning(options?: {
    includeFixture?: boolean;
  }): WritePathOutcomeEvidence[];
  pauseReplies(paused: boolean, nowIso?: string): ResponsePolicy;
};

export function createInboxService(
  store: InboxStore,
  options: InboxServiceOptions = {},
): InboxService {
  const gateway = options.gateway ?? createActionGateway();

  return {
    status() {
      return {
        ...store.status(),
        acceptanceCaseIds: INBOX_RELATED_CASE_IDS,
        learningHookNote:
          "SUCCESS/FAILURE send and lead outcomes recorded as fixtureOnly write-path evidence. Proposals only — no authority auto-apply.",
      };
    },

    listConversations(limit) {
      return store.listConversations(limit);
    },

    listMessages(conversationId, limit) {
      return store.listMessages(conversationId, limit);
    },

    listLeads(limit) {
      return store.listLeads(limit);
    },

    listHandoffs(limit) {
      return store.listHandoffs(limit);
    },

    getPolicy() {
      return store.read().responsePolicy;
    },

    setPolicy(policy) {
      store.setResponsePolicy(policy);
      return policy;
    },

    seedFixtures(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const golden = buildGoldenInbound(ts);
      store.setResponsePolicy(golden.policy);
      store.upsertConversation(golden.conversation);
      // Avoid double-add on re-seed
      const existing = store
        .read()
        .messages.find((m) => m.messageId === golden.inbound.messageId);
      if (!existing) {
        store.addMessage(golden.inbound);
      }
      return {
        conversation: golden.conversation,
        inbound: golden.inbound,
        policy: golden.policy,
      };
    },

    seedAndProveInboxMapping(nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const { state, writePathIds } = createFixtureInboxPilotMapping(ts);
      const proven = proveFixtureInboxWritePaths(state, ts);
      return { mapping: proven, writePathIds };
    },

    ingestInbound(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      let conversation =
        state.conversations.find(
          (c) =>
            c.conversationId === input.conversationId ||
            c.providerThreadId === input.providerThreadId,
        ) ?? null;

      if (!conversation) {
        conversation = createConversation({
          conversationId: input.conversationId ?? `conv-${randomUUID()}`,
          providerThreadId: input.providerThreadId,
          channel: input.channel ?? "fixture",
          customerDisplayName: input.customerDisplayName,
          customerEmail: input.customerEmail ?? null,
          fixtureOnly: input.fixtureOnly !== false,
          nowIso,
        });
        store.upsertConversation(conversation);
      }

      const result = ingestInboundMessage({
        state: store.read(),
        conversation,
        messageId: `msg-${randomUUID()}`,
        providerMessageId: input.providerMessageId ?? null,
        body: input.body,
        fixtureOnly: input.fixtureOnly !== false,
        nowIso,
      });

      if (!result.duplicate) {
        store.write(result.state);
      }
      return {
        conversation: result.conversation,
        message: result.message,
        duplicate: result.duplicate,
      };
    },

    draftReply(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const conversation =
        state.conversations.find(
          (c) => c.conversationId === input.conversationId,
        ) ?? null;
      if (!conversation) {
        return {
          ok: false,
          code: "CONVERSATION_NOT_FOUND",
          reasons: [`Unknown conversation ${input.conversationId}`],
        };
      }
      const policy = state.responsePolicy ?? defaultResponsePolicy(nowIso);
      if (!state.responsePolicy) {
        store.setResponsePolicy(policy);
      }

      const inbound =
        input.inboundBody ??
        [...state.messages]
          .reverse()
          .find(
            (m) =>
              m.conversationId === input.conversationId &&
              m.direction === "inbound",
          )?.body ??
        "";

      const prepared = prepareConciergeReply({
        draftId: `draft-${randomUUID()}`,
        conversation,
        inboundBody: inbound,
        citedFactIds: input.citedFactIds,
        factLabels: input.factLabels,
        policy,
        bookingEvidence: state.bookingEvidence,
        bookingClaim: input.bookingClaim ?? BookingClaimKind.AVAILABILITY_LINK,
        nowIso,
      });
      if (!prepared.ok) return prepared;
      store.addDraft(prepared.draft);
      return prepared;
    },

    queueReply(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const conversation =
        state.conversations.find(
          (c) => c.conversationId === input.conversationId,
        ) ?? null;
      if (!conversation) {
        return {
          ok: false,
          code: "CONVERSATION_NOT_FOUND",
          reasons: [`Unknown conversation ${input.conversationId}`],
        };
      }
      const draft =
        state.drafts.find((d) => d.draftId === input.draftId) ?? null;
      if (!draft) {
        return {
          ok: false,
          code: "DRAFT_NOT_FOUND",
          reasons: [`Unknown draft ${input.draftId}`],
        };
      }
      const policy = state.responsePolicy ?? defaultResponsePolicy(nowIso);
      if (
        detectDuplicateOutbound({
          messages: state.messages,
          conversationId: conversation.conversationId,
          body: draft.body,
          nowIso,
          windowSec: policy.duplicateSuppressionWindowSec,
        })
      ) {
        return {
          ok: false,
          code: "DUPLICATE_SUPPRESSED",
          reasons: ["Duplicate outbound suppressed within policy window"],
        };
      }
      const queued = queueOutboundReply({
        messageId: `out-${randomUUID()}`,
        conversation,
        draft,
        nowIso,
      });
      if (!queued.ok) return queued;
      store.addMessage(queued.message);
      return queued;
    },

    sendQueuedReply(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const message =
        state.messages.find((m) => m.messageId === input.messageId) ?? null;
      if (!message) {
        return {
          message: null,
          gatewayDecision: null,
          outcome: null,
          liveInboxWiring: "NOT_WIRED",
          details: [`Unknown message ${input.messageId}`],
        };
      }
      const conversation =
        state.conversations.find(
          (c) => c.conversationId === message.conversationId,
        ) ?? null;
      if (!conversation) {
        return {
          message,
          gatewayDecision: null,
          outcome: null,
          liveInboxWiring: "NOT_WIRED",
          details: ["Conversation missing for message"],
        };
      }

      details.push(
        "Live inbox providers are NOT_WIRED — fixture send only unless preferLive",
      );

      if (message.sendStatus === MessageSendStatus.BLOCKED_TAKEOVER) {
        details.push("Message already cancelled by conversation takeover");
        const outcome = buildInboxSendOutcome({
          outcomeId: `out-${randomUUID()}`,
          conversationId: message.conversationId,
          messageId: message.messageId,
          writePathId: INBOX_REPLY_WRITE_PATH_ID,
          operationId: `inbox-blocked-${randomUUID()}`,
          decision: InboxOutcomeDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: message.fixtureOnly,
          summary: "Send refused — message cancelled by human takeover",
          recordedAtIso: nowIso,
          featureHints: { code: "CONVERSATION_TAKEOVER" },
        });
        store.addSendOutcome(outcome);
        return {
          message,
          gatewayDecision: null,
          outcome,
          liveInboxWiring: "NOT_WIRED",
          details,
        };
      }

      if (input.preferLive === true) {
        const live = invokeInboxSendAdapter({
          preferLive: true,
          messageId: message.messageId,
          conversationId: conversation.conversationId,
        });
        details.push(live.summary);
        const failed: MessageRecord = {
          ...message,
          sendStatus: MessageSendStatus.FAILED,
        };
        store.upsertMessage(failed);
        return {
          message: failed,
          gatewayDecision: null,
          outcome: null,
          liveInboxWiring: "NOT_WIRED",
          details,
        };
      }

      const policy = state.responsePolicy ?? defaultResponsePolicy(nowIso);
      const agentCount = countAgentMessages(
        state.messages,
        conversation.conversationId,
      );
      const sendGate = evaluateOutboundSendGate({
        conversation,
        message,
        policy,
        agentMessageCount: agentCount,
      });
      if (!sendGate.allowed) {
        details.push(...sendGate.reasons);
        const blocked: MessageRecord = {
          ...message,
          sendStatus:
            sendGate.code === "CONVERSATION_TAKEOVER"
              ? MessageSendStatus.BLOCKED_TAKEOVER
              : MessageSendStatus.FAILED,
        };
        store.upsertMessage(blocked);
        const outcome = buildInboxSendOutcome({
          outcomeId: `out-${randomUUID()}`,
          conversationId: conversation.conversationId,
          messageId: message.messageId,
          writePathId: INBOX_REPLY_WRITE_PATH_ID,
          operationId: `inbox-deny-${randomUUID()}`,
          decision: InboxOutcomeDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: message.fixtureOnly,
          summary: `Send blocked: ${sendGate.code}`,
          recordedAtIso: nowIso,
          featureHints: { code: sendGate.code },
        });
        store.addSendOutcome(outcome);
        return {
          message: blocked,
          gatewayDecision: null,
          outcome,
          liveInboxWiring: "NOT_WIRED",
          details,
        };
      }

      // Re-check booking claim if somehow queued with reservation
      if (message.bookingClaim === BookingClaimKind.RESERVATION) {
        const booking = evaluateBookingClaim({
          claim: BookingClaimKind.RESERVATION,
          conversationId: conversation.conversationId,
          bookingEvidence: state.bookingEvidence,
        });
        if (!booking.allowed) {
          details.push(...booking.reasons);
          return {
            message,
            gatewayDecision: null,
            outcome: null,
            liveInboxWiring: "NOT_WIRED",
            details,
          };
        }
      }

      const operationId = `inbox-reply-${randomUUID()}`;
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: input.productionMapping,
      };

      const submitted = gateway.submitIntent(
        {
          operationId,
          actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
          channelId: "inbox",
          targetAccountId: input.targetAccountId ?? "acct-demo",
          operation: "send_customer_reply",
          assetId: INBOX_PILOT_CONV_ASSET_ID,
          contentRevision: input.contentRevision ?? "rev-inbox-demo",
          writePathId: INBOX_REPLY_WRITE_PATH_ID,
          payload: {
            conversationId: conversation.conversationId,
            messageId: message.messageId,
            preparedAtVersion: message.preparedAtVersion,
            conversationVersion: conversation.version,
            fixtureOnly: message.fixtureOnly,
            liveInbox: false,
          },
        },
        snapshot,
      );

      details.push(submitted.decision.reason);
      details.push(
        `Gateway outcome=${submitted.decision.outcome} (acceptance ≠ verified delivery)`,
      );

      if (!submitted.decision.allowed) {
        const failed: MessageRecord = {
          ...message,
          sendStatus: MessageSendStatus.FAILED,
          gatewayOperationId: operationId,
        };
        store.upsertMessage(failed);
        const outcome = buildInboxSendOutcome({
          outcomeId: `out-${randomUUID()}`,
          conversationId: conversation.conversationId,
          messageId: message.messageId,
          writePathId: INBOX_REPLY_WRITE_PATH_ID,
          operationId,
          decision: InboxOutcomeDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: message.fixtureOnly,
          summary: `Gateway denied reply: ${submitted.decision.code ?? submitted.decision.reason}`,
          recordedAtIso: nowIso,
        });
        store.addSendOutcome(outcome);
        return {
          message: failed,
          gatewayDecision: submitted.decision,
          outcome,
          liveInboxWiring: "NOT_WIRED",
          details,
        };
      }

      // Version check again immediately before adapter send (takeover race).
      const fresh = store.read();
      const freshConv =
        fresh.conversations.find(
          (c) => c.conversationId === conversation.conversationId,
        ) ?? conversation;
      const recheck = evaluateOutboundSendGate({
        conversation: freshConv,
        message,
        policy,
        agentMessageCount: countAgentMessages(
          fresh.messages,
          conversation.conversationId,
        ),
      });
      if (!recheck.allowed) {
        details.push("Pre-send recheck failed after gateway authorize");
        details.push(...recheck.reasons);
        const blocked: MessageRecord = {
          ...message,
          sendStatus: MessageSendStatus.BLOCKED_TAKEOVER,
          gatewayOperationId: operationId,
        };
        store.upsertMessage(blocked);
        const outcome = buildInboxSendOutcome({
          outcomeId: `out-${randomUUID()}`,
          conversationId: conversation.conversationId,
          messageId: message.messageId,
          writePathId: INBOX_REPLY_WRITE_PATH_ID,
          operationId,
          decision: InboxOutcomeDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: message.fixtureOnly,
          summary: `Takeover blocked send after authorize: ${recheck.code}`,
          recordedAtIso: nowIso,
          featureHints: { code: recheck.code },
        });
        store.addSendOutcome(outcome);
        return {
          message: blocked,
          gatewayDecision: submitted.decision,
          outcome,
          liveInboxWiring: "NOT_WIRED",
          details,
        };
      }

      const adapter = invokeInboxSendAdapter({
        preferLive: false,
        messageId: message.messageId,
        conversationId: conversation.conversationId,
      });
      details.push(adapter.summary);

      const sent: MessageRecord = {
        ...message,
        sendStatus: MessageSendStatus.SENT,
        gatewayOperationId: operationId,
        providerMessageId: adapter.remoteId,
        sentAtIso: nowIso,
      };
      store.upsertMessage(sent);

      const outcome = buildInboxSendOutcome({
        outcomeId: `out-${randomUUID()}`,
        conversationId: conversation.conversationId,
        messageId: message.messageId,
        writePathId: INBOX_REPLY_WRITE_PATH_ID,
        operationId,
        decision: InboxOutcomeDecision.SUCCESS,
        source: OutcomeEvidenceSource.FIXTURE,
        fixtureOnly: true,
        summary: adapter.summary,
        recordedAtIso: nowIso,
        featureHints: { remoteId: adapter.remoteId },
      });
      store.addSendOutcome(outcome);

      return {
        message: sent,
        gatewayDecision: submitted.decision,
        outcome,
        liveInboxWiring: InboxAdapterStatus.NOT_WIRED,
        details,
      };
    },

    takeOver(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const result = applyConversationTakeover({
        state: store.read(),
        conversationId: input.conversationId,
        nowIso,
      });
      if (!result.ok) return result;
      store.write(result.state);
      return {
        ok: true,
        conversation: result.conversation,
        cancelledMessageIds: result.cancelledMessageIds,
      };
    },

    logLead(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const details: string[] = [];
      const state = store.read();
      const conversation =
        state.conversations.find(
          (c) => c.conversationId === input.conversationId,
        ) ?? null;
      if (!conversation) {
        return {
          lead: null,
          gatewayDecision: null,
          outcome: null,
          liveCrmLeadWiring: "NOT_WIRED",
          details: [`Unknown conversation ${input.conversationId}`],
        };
      }

      details.push(
        "Live Zoho lead write is NOT_WIRED — fixture CRM path only unless preferLive",
      );

      if (input.preferLive === true) {
        const live = invokeCrmLeadAdapter({
          preferLive: true,
          leadId: "none",
          correlationId: "none",
        });
        details.push(live.summary);
        return {
          lead: null,
          gatewayDecision: null,
          outcome: null,
          liveCrmLeadWiring: "NOT_WIRED",
          details,
        };
      }

      const email =
        input.email ?? conversation.customerEmail ?? "unknown@example.com";
      const displayName =
        input.displayName ?? conversation.customerDisplayName;
      const lead = createQualifiedLead({
        leadId: `lead-${randomUUID()}`,
        conversation,
        correlationId: `corr-${randomUUID()}`,
        email,
        displayName,
        locationNeed: input.locationNeed ?? null,
        dateNeed: input.dateNeed ?? null,
        sizeNeed: input.sizeNeed ?? null,
        synthetic: true,
        fixtureOnly: true,
        nowIso,
      });

      const operationId = `inbox-lead-${randomUUID()}`;
      const snapshot: GatewayAuthoritySnapshot = {
        outboundStopped: input.authority.outboundStopped,
        operatingMode: input.authority.operatingMode,
        policies: input.authority.policies,
        grants: input.authority.grants,
        nowIso,
        productionMapping: input.productionMapping,
      };

      const submitted = gateway.submitIntent(
        {
          operationId,
          actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
          channelId: "crm",
          targetAccountId: input.targetAccountId ?? "acct-demo",
          operation: "log_qualified_lead",
          assetId: INBOX_PILOT_LEAD_ASSET_ID,
          contentRevision: null,
          writePathId: INBOX_CRM_LEAD_WRITE_PATH_ID,
          payload: {
            leadId: lead.leadId,
            correlationId: lead.correlationId,
            email: lead.email,
            synthetic: true,
            fixtureOnly: true,
            liveZoho: false,
          },
        },
        snapshot,
      );

      details.push(submitted.decision.reason);

      if (!submitted.decision.allowed) {
        const outcome = buildInboxSendOutcome({
          outcomeId: `out-${randomUUID()}`,
          conversationId: conversation.conversationId,
          messageId: lead.leadId,
          writePathId: INBOX_CRM_LEAD_WRITE_PATH_ID,
          operationId,
          decision: InboxOutcomeDecision.FAILURE,
          source: OutcomeEvidenceSource.GATEWAY_RECEIPT,
          fixtureOnly: true,
          summary: `Gateway denied lead log: ${submitted.decision.code ?? submitted.decision.reason}`,
          recordedAtIso: nowIso,
        });
        store.addSendOutcome(outcome);
        store.addLead({ ...lead, gatewayOperationId: operationId });
        return {
          lead,
          gatewayDecision: submitted.decision,
          outcome,
          liveCrmLeadWiring: "NOT_WIRED",
          details,
        };
      }

      const adapter = invokeCrmLeadAdapter({
        preferLive: false,
        leadId: lead.leadId,
        correlationId: lead.correlationId,
      });
      details.push(adapter.summary);
      details.push("Synthetic leads excluded from commercial totals");

      const logged: QualifiedLead = {
        ...lead,
        crmRecordId: adapter.remoteId,
        gatewayOperationId: operationId,
        writePathId: INBOX_CRM_LEAD_WRITE_PATH_ID,
      };
      store.addLead(logged);

      const outcome = buildInboxSendOutcome({
        outcomeId: `out-${randomUUID()}`,
        conversationId: conversation.conversationId,
        messageId: lead.leadId,
        writePathId: INBOX_CRM_LEAD_WRITE_PATH_ID,
        operationId,
        decision: InboxOutcomeDecision.SUCCESS,
        source: OutcomeEvidenceSource.FIXTURE,
        fixtureOnly: true,
        summary: adapter.summary,
        recordedAtIso: nowIso,
        featureHints: { crmRecordId: adapter.remoteId, synthetic: true },
      });
      store.addSendOutcome(outcome);

      return {
        lead: logged,
        gatewayDecision: submitted.decision,
        outcome,
        liveCrmLeadWiring: InboxAdapterStatus.NOT_WIRED,
        details,
      };
    },

    createMorningHandoff(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const conversation =
        state.conversations.find(
          (c) => c.conversationId === input.conversationId,
        ) ?? null;
      if (!conversation) {
        return {
          ok: false,
          code: "CONVERSATION_NOT_FOUND",
          reasons: [`Unknown conversation ${input.conversationId}`],
        };
      }
      const policy = state.responsePolicy ?? defaultResponsePolicy(nowIso);
      const { handoff, conversation: handed } = createHandoff({
        handoffId: `ho-${randomUUID()}`,
        conversation,
        reason: input.reason,
        ...(input.urgency !== undefined ? { urgency: input.urgency } : {}),
        nextOwner: input.nextOwner ?? policy.escalationOwner,
        customerQuestions: input.customerQuestions ?? [],
        verifiedAnswers: input.verifiedAnswers ?? [],
        requestedAction: input.requestedAction ?? "Morning follow-up",
        nowIso,
      });
      // Increment version on handoff so any stale agent send is blocked.
      const takeover = applyConversationTakeover({
        state: {
          ...state,
          conversations: state.conversations.map((c) =>
            c.conversationId === conversation.conversationId ? handed : c,
          ),
        },
        conversationId: conversation.conversationId,
        nowIso,
      });
      if (takeover.ok) {
        store.write(takeover.state);
        store.addHandoff(handoff);
        return {
          ok: true,
          handoff,
          conversation: takeover.conversation,
        };
      }
      store.upsertConversation(handed);
      store.addHandoff(handoff);
      return { ok: true, handoff, conversation: handed };
    },

    acknowledgeMorningHandoff(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const state = store.read();
      const handoff =
        state.handoffs.find((h) => h.handoffId === input.handoffId) ?? null;
      if (!handoff) {
        return {
          ok: false,
          code: "HANDOFF_NOT_FOUND",
          reasons: [`Unknown handoff ${input.handoffId}`],
        };
      }
      const next = acknowledgeHandoff({ handoff, nowIso });
      store.upsertHandoff(next);
      return { ok: true, handoff: next };
    },

    addBookingEvidence(evidence) {
      store.addBookingEvidence(evidence);
      return evidence;
    },

    listOutcomesForLearning(options) {
      return listInboxOutcomesForLearning(store.read(), options);
    },

    pauseReplies(paused, nowIso) {
      const ts = nowIso ?? new Date().toISOString();
      const current = store.read().responsePolicy ?? defaultResponsePolicy(ts);
      const next: ResponsePolicy = {
        ...current,
        repliesPaused: paused,
        updatedAtIso: ts,
      };
      store.setResponsePolicy(next);
      return next;
    },
  };
}
