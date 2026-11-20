/**
 * File-backed inbox / after-hours store (R1-09).
 * Schema companion: database/migrations/011_inbox.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyInboxState,
  type BookingEvidence,
  type ConciergeDraft,
  type ConversationRecord,
  type HandoffRecord,
  type InboxState,
  type MessageRecord,
  type QualifiedLead,
  type ResponsePolicy,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";

export type InboxStore = {
  readonly stateDir: string;
  read(): InboxState;
  write(state: InboxState): void;
  update(mutator: (current: InboxState) => InboxState): InboxState;
  setResponsePolicy(policy: ResponsePolicy): InboxState;
  upsertConversation(conversation: ConversationRecord): InboxState;
  addMessage(message: MessageRecord): InboxState;
  upsertMessage(message: MessageRecord): InboxState;
  addDraft(draft: ConciergeDraft): InboxState;
  addLead(lead: QualifiedLead): InboxState;
  upsertLead(lead: QualifiedLead): InboxState;
  addHandoff(handoff: HandoffRecord): InboxState;
  upsertHandoff(handoff: HandoffRecord): InboxState;
  addBookingEvidence(evidence: BookingEvidence): InboxState;
  addSendOutcome(outcome: WritePathOutcomeEvidence): InboxState;
  listConversations(limit?: number): ConversationRecord[];
  listMessages(conversationId?: string, limit?: number): MessageRecord[];
  listLeads(limit?: number): QualifiedLead[];
  listHandoffs(limit?: number): HandoffRecord[];
  status(): {
    conversationCount: number;
    messageCount: number;
    queuedCount: number;
    leadCount: number;
    handoffCount: number;
    sendOutcomeCount: number;
    liveInboxWiring: InboxState["liveInboxWiring"];
    liveCrmLeadWiring: InboxState["liveCrmLeadWiring"];
    repliesPaused: boolean;
    honestNote: string;
  };
};

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function defaultInboxStateDir(baseDir: string): string {
  return join(baseDir, "inbox");
}

export function createFileInboxStore(stateDir: string): InboxStore {
  const inboxDir = join(stateDir, "inbox");
  const statePath = join(inboxDir, "inbox-state.json");

  const read = (): InboxState => {
    const existing = readJsonFile<InboxState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyInboxState(new Date().toISOString());
    }
    return {
      ...existing,
      responsePolicy: existing.responsePolicy ?? null,
      conversations: existing.conversations ?? [],
      messages: existing.messages ?? [],
      drafts: existing.drafts ?? [],
      leads: existing.leads ?? [],
      handoffs: existing.handoffs ?? [],
      bookingEvidence: existing.bookingEvidence ?? [],
      sendOutcomes: existing.sendOutcomes ?? [],
      liveInboxWiring: "NOT_WIRED",
      liveCrmLeadWiring: "NOT_WIRED",
    };
  };

  const write = (state: InboxState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: InboxState) => InboxState,
  ): InboxState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: inboxDir,
    read,
    write,
    update,
    setResponsePolicy: (policy) =>
      update((state) => ({
        ...state,
        responsePolicy: policy,
        updatedAtIso: policy.updatedAtIso,
      })),
    upsertConversation: (conversation) =>
      update((state) => {
        const others = state.conversations.filter(
          (c) => c.conversationId !== conversation.conversationId,
        );
        return {
          ...state,
          conversations: [...others, conversation].slice(-500),
          updatedAtIso: conversation.updatedAtIso,
        };
      }),
    addMessage: (message) =>
      update((state) => ({
        ...state,
        messages: [...state.messages, message].slice(-2000),
        updatedAtIso: message.createdAtIso,
      })),
    upsertMessage: (message) =>
      update((state) => {
        const others = state.messages.filter(
          (m) => m.messageId !== message.messageId,
        );
        return {
          ...state,
          messages: [...others, message].slice(-2000),
          updatedAtIso: message.sentAtIso ?? message.createdAtIso,
        };
      }),
    addDraft: (draft) =>
      update((state) => ({
        ...state,
        drafts: [...state.drafts, draft].slice(-500),
        updatedAtIso: draft.createdAtIso,
      })),
    addLead: (lead) =>
      update((state) => ({
        ...state,
        leads: [...state.leads, lead].slice(-500),
        updatedAtIso: lead.createdAtIso,
      })),
    upsertLead: (lead) =>
      update((state) => {
        const others = state.leads.filter((l) => l.leadId !== lead.leadId);
        return {
          ...state,
          leads: [...others, lead].slice(-500),
          updatedAtIso: lead.createdAtIso,
        };
      }),
    addHandoff: (handoff) =>
      update((state) => ({
        ...state,
        handoffs: [...state.handoffs, handoff].slice(-500),
        updatedAtIso: handoff.createdAtIso,
      })),
    upsertHandoff: (handoff) =>
      update((state) => {
        const others = state.handoffs.filter(
          (h) => h.handoffId !== handoff.handoffId,
        );
        return {
          ...state,
          handoffs: [...others, handoff].slice(-500),
          updatedAtIso: handoff.acknowledgedAtIso ?? handoff.createdAtIso,
        };
      }),
    addBookingEvidence: (evidence) =>
      update((state) => ({
        ...state,
        bookingEvidence: [...state.bookingEvidence, evidence].slice(-500),
        updatedAtIso: evidence.observedAtIso,
      })),
    addSendOutcome: (outcome) =>
      update((state) => ({
        ...state,
        sendOutcomes: [...state.sendOutcomes, outcome].slice(-500),
        updatedAtIso: outcome.recordedAtIso,
      })),
    listConversations: (limit = 100) => {
      const rows = read().conversations;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listMessages: (conversationId, limit = 200) => {
      const rows = conversationId
        ? read().messages.filter((m) => m.conversationId === conversationId)
        : read().messages;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listLeads: (limit = 100) => {
      const rows = read().leads;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listHandoffs: (limit = 100) => {
      const rows = read().handoffs;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: () => {
      const state = read();
      return {
        conversationCount: state.conversations.length,
        messageCount: state.messages.length,
        queuedCount: state.messages.filter((m) => m.sendStatus === "queued")
          .length,
        leadCount: state.leads.length,
        handoffCount: state.handoffs.length,
        sendOutcomeCount: state.sendOutcomes.length,
        liveInboxWiring: state.liveInboxWiring,
        liveCrmLeadWiring: state.liveCrmLeadWiring,
        repliesPaused: state.responsePolicy?.repliesPaused ?? false,
        honestNote:
          "After-hours inbox, concierge drafts, takeover, handoff, and fixture Zoho lead logging. Live inbox providers and live Zoho remain NOT_WIRED. Takeover increments conversation version and cancels queued agent sends. No reservation without booking evidence.",
      };
    },
  };
}
