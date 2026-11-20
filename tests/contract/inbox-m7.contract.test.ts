/**
 * Contract: M7 / NEXT-18 — duplicate webhook coalesce (no dup replies/leads);
 * takeover race cancels every unsent agent response including queued;
 * sent ≠ delivered.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MessageSendStatus,
  OperatingMode,
  SupportLabel,
} from "@worksocial/domain";
import {
  createDemoInboxGrants,
  createFileInboxStore,
} from "@worksocial/persistence";
import { createActionGateway } from "@worksocial/action-gateway";
import {
  INBOX_SUPPORTED_FACT_ID,
  createInboxService,
} from "@worksocial/inbox";

const dirs: string[] = [];
const now = "2026-11-20T03:00:00.000Z";
const labels = new Map([[INBOX_SUPPORTED_FACT_ID, SupportLabel.SUPPORTED]]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

function service() {
  const dir = mkdtempSync(join(tmpdir(), "ws-inbox-m7-"));
  dirs.push(dir);
  return createInboxService(createFileInboxStore(dir), {
    gateway: createActionGateway(),
  });
}

describe("contract: M7 duplicate inbound coalesce", () => {
  it("coalesces duplicate webhooks into one message, one reply attempt, one lead", () => {
    const svc = service();
    const payload = {
      providerEventId: "wh-m7-dup-1",
      providerThreadId: "thr-m7-dup",
      providerMessageId: "pm-m7-dup-1",
      body: "Training room Friday for 12?",
      customerDisplayName: "Jordan Lee",
      customerEmail: "jordan.lee@example.com",
      nowIso: now,
    };

    const first = svc.ingestFixtureWebhook(payload);
    expect(first.duplicate).toBe(false);
    const second = svc.ingestFixtureWebhook(payload);
    expect(second.duplicate).toBe(true);
    expect(second.message.messageId).toBe(first.message.messageId);
    expect(svc.listMessages(first.conversation.conversationId)).toHaveLength(1);
    expect(svc.listWebhookEvents()).toHaveLength(1);

    const drafted = svc.draftReply({
      conversationId: first.conversation.conversationId,
      citedFactIds: [INBOX_SUPPORTED_FACT_ID],
      factLabels: labels,
      nowIso: now,
    });
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;

    const queued = svc.queueReply({
      conversationId: first.conversation.conversationId,
      draftId: drafted.draft.draftId,
      nowIso: now,
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    // Second draft/queue of the same body is suppressed — no duplicate reply.
    const drafted2 = svc.draftReply({
      conversationId: first.conversation.conversationId,
      citedFactIds: [INBOX_SUPPORTED_FACT_ID],
      factLabels: labels,
      nowIso: now,
    });
    expect(drafted2.ok).toBe(true);
    if (!drafted2.ok) return;
    const queued2 = svc.queueReply({
      conversationId: first.conversation.conversationId,
      draftId: drafted2.draft.draftId,
      nowIso: now,
    });
    expect(queued2.ok).toBe(false);
    if (!queued2.ok) expect(queued2.code).toBe("DUPLICATE_SUPPRESSED");

    const { mapping } = svc.seedAndProveInboxMapping(now);
    const grants = createDemoInboxGrants(now);
    const lead1 = svc.logLead({
      conversationId: first.conversation.conversationId,
      sourceInboundMessageId: first.message.messageId,
      providerEventId: payload.providerEventId,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [grants.leadPolicy],
        grants: [grants.leadGrant],
      },
      productionMapping: mapping,
      nowIso: now,
    });
    expect(lead1.coalesced).toBe(false);
    expect(lead1.lead?.crmRecordId).toBeTruthy();

    const lead2 = svc.logLead({
      conversationId: first.conversation.conversationId,
      sourceInboundMessageId: first.message.messageId,
      providerEventId: payload.providerEventId,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [grants.leadPolicy],
        grants: [grants.leadGrant],
      },
      productionMapping: mapping,
      nowIso: now,
    });
    expect(lead2.coalesced).toBe(true);
    expect(lead2.lead?.leadId).toBe(lead1.lead?.leadId);
    expect(svc.listLeads()).toHaveLength(1);
  });
});

describe("contract: M7 takeover race cancels every unsent response", () => {
  it("cancels queued + invalidates draft immediately before send", () => {
    const svc = service();
    const ingested = svc.ingestFixtureWebhook({
      providerEventId: "wh-m7-takeover",
      providerThreadId: "thr-m7-takeover",
      providerMessageId: "pm-m7-takeover",
      body: "Need availability Friday",
      customerDisplayName: "Alex",
      customerEmail: "alex@example.com",
      nowIso: now,
    });

    const drafted = svc.draftReply({
      conversationId: ingested.conversation.conversationId,
      citedFactIds: [INBOX_SUPPORTED_FACT_ID],
      factLabels: labels,
      nowIso: now,
    });
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;

    const queued = svc.queueReply({
      conversationId: ingested.conversation.conversationId,
      draftId: drafted.draft.draftId,
      nowIso: now,
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    // Second draft left unqueued — takeover must invalidate it too.
    const unqueued = svc.draftReply({
      conversationId: ingested.conversation.conversationId,
      citedFactIds: [INBOX_SUPPORTED_FACT_ID],
      factLabels: labels,
      nowIso: now,
    });
    expect(unqueued.ok).toBe(true);
    if (!unqueued.ok) return;

    const { mapping } = svc.seedAndProveInboxMapping(now);
    const grants = createDemoInboxGrants(now);

    const takeover = svc.takeOver({
      conversationId: ingested.conversation.conversationId,
      nowIso: now,
    });
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) return;
    expect(takeover.conversation.version).toBe(2);
    expect(takeover.cancelledMessageIds).toContain(queued.message.messageId);
    expect(takeover.invalidatedDraftIds).toContain(unqueued.draft.draftId);
    expect(svc.listOwnershipEvents(ingested.conversation.conversationId)).toHaveLength(
      1,
    );

    const sent = svc.sendQueuedReply({
      messageId: queued.message.messageId,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [grants.replyPolicy],
        grants: [grants.replyGrant],
      },
      productionMapping: mapping,
      nowIso: now,
    });
    expect(sent.message?.sendStatus).toBe(MessageSendStatus.BLOCKED_TAKEOVER);

    const queueAgain = svc.queueReply({
      conversationId: ingested.conversation.conversationId,
      draftId: unqueued.draft.draftId,
      nowIso: now,
    });
    expect(queueAgain.ok).toBe(false);
    if (!queueAgain.ok) expect(queueAgain.code).toBe("DRAFT_INVALIDATED");
  });

  it("records sent then delivered as separate states", () => {
    const svc = service();
    svc.seedFixtures(now);
    const drafted = svc.draftReply({
      conversationId: "golden-conv-after-hours",
      citedFactIds: [INBOX_SUPPORTED_FACT_ID],
      factLabels: labels,
      nowIso: now,
    });
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;
    const queued = svc.queueReply({
      conversationId: "golden-conv-after-hours",
      draftId: drafted.draft.draftId,
      nowIso: now,
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    const { mapping } = svc.seedAndProveInboxMapping(now);
    const grants = createDemoInboxGrants(now);
    const sent = svc.sendQueuedReply({
      messageId: queued.message.messageId,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [grants.replyPolicy],
        grants: [grants.replyGrant],
      },
      productionMapping: mapping,
      nowIso: now,
    });
    expect(sent.message?.sendStatus).toBe(MessageSendStatus.SENT);
    expect(sent.message?.deliveredAtIso).toBeNull();
    expect(sent.outcome?.label).toBe("UNKNOWN");

    const delivered = svc.confirmDelivery({
      messageId: queued.message.messageId,
      nowIso: now,
    });
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    expect(delivered.message.sendStatus).toBe(MessageSendStatus.DELIVERED);
    expect(delivered.message.deliveredAtIso).toBe(now);
    expect(delivered.outcome.label).toBe("SUCCESS");
  });
});
