import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BookingClaimKind,
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
  INBOX_PILOT_CONVERSATION_ID,
  INBOX_SUPPORTED_FACT_ID,
  createInboxService,
  liveInboxSendStub,
  liveCrmLeadLogStub,
} from "./index.js";

const dirs: string[] = [];
const now = "2026-11-20T02:00:00.000Z";
const labels = new Map([[INBOX_SUPPORTED_FACT_ID, SupportLabel.SUPPORTED]]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("inbox service", () => {
  it("runs after-hours fixture exchange with lead + handoff", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-inbox-svc-"));
    dirs.push(dir);
    const store = createFileInboxStore(dir);
    const gateway = createActionGateway();
    const service = createInboxService(store, { gateway });
    service.seedFixtures(now);

    const drafted = service.draftReply({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      citedFactIds: [INBOX_SUPPORTED_FACT_ID],
      factLabels: labels,
      bookingClaim: BookingClaimKind.AVAILABILITY_LINK,
      nowIso: now,
    });
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;

    const queued = service.queueReply({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      draftId: drafted.draft.draftId,
      nowIso: now,
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    const { mapping } = service.seedAndProveInboxMapping(now);
    const grants = createDemoInboxGrants(now);
    const authority = {
      outboundStopped: false,
      operatingMode: OperatingMode.OPERATE,
      policies: [grants.replyPolicy, grants.leadPolicy],
      grants: [grants.replyGrant, grants.leadGrant],
    };

    const sent = service.sendQueuedReply({
      messageId: queued.message.messageId,
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(sent.message?.sendStatus).toBe(MessageSendStatus.SENT);
    expect(sent.gatewayDecision?.allowed).toBe(true);
    expect(sent.liveInboxWiring).toBe("NOT_WIRED");

    const lead = service.logLead({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      locationNeed: "Jersey City",
      sizeNeed: "12",
      authority,
      productionMapping: mapping,
      nowIso: now,
    });
    expect(lead.lead?.crmRecordId).toMatch(/^zoho-fixture-lead-/);
    expect(lead.lead?.synthetic).toBe(true);

    const handoff = service.createMorningHandoff({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      reason: "Customer may want a tour callback",
      customerQuestions: ["Training room Friday for 12"],
      verifiedAnswers: ["Shared booking link; not a reservation"],
      nowIso: now,
    });
    expect(handoff.ok).toBe(true);
    if (handoff.ok) {
      expect(handoff.conversation.humanOwned).toBe(true);
      expect(handoff.conversation.agentSendAllowed).toBe(false);
    }
  });

  it("takeover cancels queued reply before send", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-inbox-takeover-"));
    dirs.push(dir);
    const store = createFileInboxStore(dir);
    const service = createInboxService(store, {
      gateway: createActionGateway(),
    });
    service.seedFixtures(now);

    const drafted = service.draftReply({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      citedFactIds: [INBOX_SUPPORTED_FACT_ID],
      factLabels: labels,
      nowIso: now,
    });
    expect(drafted.ok).toBe(true);
    if (!drafted.ok) return;

    const queued = service.queueReply({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      draftId: drafted.draft.draftId,
      nowIso: now,
    });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;

    const takeover = service.takeOver({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      nowIso: now,
    });
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) return;
    expect(takeover.cancelledMessageIds).toContain(queued.message.messageId);
    expect(takeover.conversation.version).toBe(2);

    const { mapping } = service.seedAndProveInboxMapping(now);
    const grants = createDemoInboxGrants(now);
    const sent = service.sendQueuedReply({
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
  });

  it("honestly reports live adapters as NOT_WIRED", () => {
    expect(liveInboxSendStub("email").code).toBe("NOT_WIRED");
    expect(liveCrmLeadLogStub().code).toBe("NOT_WIRED");
  });
});
