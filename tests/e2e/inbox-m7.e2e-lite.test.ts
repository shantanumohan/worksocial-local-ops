/**
 * E2E-lite (offline): fixture webhook → coalesce → grounded draft/queue →
 * takeover OR send/deliver → lead once → handoff. Not live messaging acceptance.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
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
const now = "2026-11-20T03:15:00.000Z";
const labels = new Map([[INBOX_SUPPORTED_FACT_ID, SupportLabel.SUPPORTED]]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("e2e-lite: M7 after-hours journey", () => {
  it("proves coalesce, delivery states, takeover cancel, and single lead", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-m7-e2e-"));
    dirs.push(dir);
    const svc = createInboxService(createFileInboxStore(dir), {
      gateway: createActionGateway(),
    });

    const webhook = {
      providerEventId: "wh-e2e-m7",
      providerThreadId: "thr-e2e-m7",
      providerMessageId: "pm-e2e-m7",
      body: "Do you have a training room Friday for 12 in Jersey City?",
      customerDisplayName: "Jordan Lee",
      customerEmail: "jordan.lee@example.com",
      nowIso: now,
    };

    const first = svc.ingestFixtureWebhook(webhook);
    const replay = svc.ingestFixtureWebhook(webhook);
    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(svc.listMessages()).toHaveLength(1);

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
    expect(queued.message.sendStatus).toBe(MessageSendStatus.QUEUED);

    // Takeover race: cancel before send.
    const takeover = svc.takeOver({
      conversationId: first.conversation.conversationId,
      actorUserId: "owner-1",
      nowIso: now,
    });
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) return;
    expect(takeover.cancelledMessageIds).toEqual([queued.message.messageId]);

    const { mapping } = svc.seedAndProveInboxMapping(now);
    const grants = createDemoInboxGrants(now);
    const blocked = svc.sendQueuedReply({
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
    expect(blocked.message?.sendStatus).toBe(MessageSendStatus.BLOCKED_TAKEOVER);

    const lead1 = svc.logLead({
      conversationId: first.conversation.conversationId,
      sourceInboundMessageId: first.message.messageId,
      providerEventId: webhook.providerEventId,
      locationNeed: "Jersey City",
      sizeNeed: "12",
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
    expect(lead1.lead?.synthetic).toBe(true);

    const lead2 = svc.logLead({
      conversationId: first.conversation.conversationId,
      sourceInboundMessageId: first.message.messageId,
      providerEventId: webhook.providerEventId,
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
    expect(svc.listLeads()).toHaveLength(1);

    const handoff = svc.createMorningHandoff({
      conversationId: first.conversation.conversationId,
      reason: "Morning follow-up",
      customerQuestions: ["Training room Friday"],
      verifiedAnswers: ["Logged qualified lead — not a reservation"],
      requestedAction: "Call back",
      nowIso: now,
    });
    expect(handoff.ok).toBe(true);
    if (!handoff.ok) return;
    const ack = svc.acknowledgeMorningHandoff({
      handoffId: handoff.handoff.handoffId,
      nowIso: now,
    });
    expect(ack.ok).toBe(true);

    const timeline = svc.getTimeline(first.conversation.conversationId);
    expect(timeline.ok).toBe(true);
    if (!timeline.ok) return;
    expect(timeline.timeline.some((r) => r.kind === "inbound")).toBe(true);
    expect(timeline.timeline.some((r) => r.kind.startsWith("ownership_"))).toBe(
      true,
    );
    expect(timeline.timeline.some((r) => r.kind === "lead")).toBe(true);
  });
});
