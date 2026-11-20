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
  ConversationStatus,
  acknowledgeHandoff,
  acquireConversationLease,
  applyConversationTakeover,
  countSentAgentMessages,
  createConversation,
  createHandoff,
  createQualifiedLead,
  defaultResponsePolicy,
  detectDuplicateOutbound,
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
  INBOX_FIXTURE_BOOKING_URL,
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
    actorUserId?: string | null;
    nowIso?: string;
  }):
    | {
        ok: true;
        conversation: ConversationRecord;
        cancelledMessageIds: string[];
        actorUserId: string | null;
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
      const prior = store.read();
      const priorConv =
        prior.conversations.find(
          (c) => c.conversationId === golden.conversation.conversationId,
        ) ?? null;
      const priorPolicy = prior.responsePolicy;

      // Preserve takeover / pause safety across reseed.
      const policy = {
        ...golden.policy,
        repliesPaused: priorPolicy?.repliesPaused ?? golden.policy.repliesPaused,
        updatedAtIso: ts,
      };
      store.setResponsePolicy(policy);

      let conversation = golden.conversation;
      if (priorConv) {
        conversation = {
          ...golden.conversation,
          version: priorConv.version,
          humanOwned: priorConv.humanOwned,
          agentSendAllowed: priorConv.agentSendAllowed,
          status: priorConv.status,
          leaseOwner: priorConv.leaseOwner,
          leaseExpiresAtIso: priorConv.leaseExpiresAtIso,
          updatedAtIso: ts,
        };
      }
      store.upsertConversation(conversation);

      const existing = store
        .read()
        .messages.find((m) => m.messageId === golden.inbound.messageId);
      if (!existing) {
        store.addMessage(golden.inbound);
      }
      return {
        conversation,
        inbound: golden.inbound,
        policy,
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
      const byId = input.conversationId
        ? (state.conversations.find(
            (c) => c.conversationId === input.conversationId,
          ) ?? null)
        : null;
      const byThread =
        state.conversations.find(
          (c) => c.providerThreadId === input.providerThreadId,
        ) ?? null;

      if (
        byId &&
        byThread &&
        byId.conversationId !== byThread.conversationId
      ) {
        throw new Error(
          `CONFLICTING_CONVERSATION_IDS: conversationId ${byId.conversationId} != providerThread ${byThread.conversationId}`,
        );
      }

      let conversation = byId ?? byThread;

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

      const leaseOwner = `inbox-worker-${process.pid}`;
      const leaseExpiresAtIso = new Date(
        Date.parse(nowIso) + 5 * 60 * 1000,
      ).toISOString();
      const leased = acquireConversationLease({
        conversation,
        leaseOwner,
        leaseExpiresAtIso,
        nowIso,
      });
      if (!leased.ok) {
        throw new Error(`${leased.code}: ${leased.reason}`);
      }
      conversation = leased.conversation;
      store.upsertConversation(conversation);

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

      const bookingClaim =
        input.bookingClaim ?? BookingClaimKind.AVAILABILITY_LINK;
      const prepared = prepareConciergeReply({
        draftId: `draft-${randomUUID()}`,
        conversation,
        inboundBody: inbound,
        citedFactIds: input.citedFactIds,
        factLabels: input.factLabels,
        policy,
        bookingEvidence: state.bookingEvidence,
        bookingClaim,
        ...(bookingClaim === BookingClaimKind.AVAILABILITY_LINK
          ? { bookingLinkUrl: INBOX_FIXTURE_BOOKING_URL }
          : {}),
        nowIso,
      });
      if (!prepared.ok) {
        if (prepared.code === "HUMAN_REQUESTED") {
          const takeover = applyConversationTakeover({
            state: store.read(),
            conversationId: conversation.conversationId,
            nowIso,
          });
          if (takeover.ok) {
            store.write(takeover.state);
          }
        }
        return prepared;
      }
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
        details.push(
          "Queued message left unchanged so a later fixture send can retry",
        );
        return {
          message,
          gatewayDecision: null,
          outcome: null,
          liveInboxWiring: "NOT_WIRED",
          details,
        };
      }

      const policy = state.responsePolicy ?? defaultResponsePolicy(nowIso);
      const sentCount = countSentAgentMessages(
        state.messages,
        conversation.conversationId,
      );
      const sendGate = evaluateOutboundSendGate({
        conversation,
        message,
        policy,
        sentAgentMessageCount: sentCount,
        bookingEvidence: state.bookingEvidence,
        nowIso,
      });
      if (!sendGate.allowed) {
        details.push(...sendGate.reasons);
        const terminal =
          sendGate.code === "CONVERSATION_TAKEOVER" ||
          sendGate.code === "MESSAGE_LIMIT";
        const blocked: MessageRecord = {
          ...message,
          sendStatus:
            sendGate.code === "CONVERSATION_TAKEOVER"
              ? MessageSendStatus.BLOCKED_TAKEOVER
              : terminal
                ? MessageSendStatus.FAILED
                : message.sendStatus,
        };
        if (blocked.sendStatus !== message.sendStatus) {
          store.upsertMessage(blocked);
        }
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
          assetId: conversation.conversationId,
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
        sentAgentMessageCount: countSentAgentMessages(
          fresh.messages,
          conversation.conversationId,
        ),
        bookingEvidence: fresh.bookingEvidence,
        nowIso,
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
        actorUserId: input.actorUserId ?? null,
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

      const email = (input.email ?? conversation.customerEmail ?? "").trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return {
          lead: null,
          gatewayDecision: null,
          outcome: null,
          liveCrmLeadWiring: "NOT_WIRED",
          details: [
            "CONTACT_EMAIL_REQUIRED: qualified lead logging needs a real customer email",
          ],
        };
      }
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
      // Increment version so stale agent sends are blocked, but keep handed_off.
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
        const preserved: ConversationRecord = {
          ...takeover.conversation,
          status: ConversationStatus.HANDED_OFF,
        };
        store.write({
          ...takeover.state,
          conversations: takeover.state.conversations.map((c) =>
            c.conversationId === preserved.conversationId ? preserved : c,
          ),
        });
        store.addHandoff(handoff);
        return {
          ok: true,
          handoff,
          conversation: preserved,
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
