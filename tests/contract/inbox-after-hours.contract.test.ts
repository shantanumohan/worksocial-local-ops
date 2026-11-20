/**
 * Contract: R1-09 after-hours — takeover cancels queued sends via conversation
 * version; fixture Zoho lead path; no reservation without booking evidence;
 * live inbox providers honestly NOT_WIRED.
 */
import { describe, expect, it, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BookingClaimKind,
  MessageSendStatus,
  OperatingMode,
  SupportLabel,
  evaluateBookingClaim,
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
} from "@worksocial/inbox";

const dirs: string[] = [];
const now = "2026-11-20T03:00:00.000Z";
const labels = new Map([[INBOX_SUPPORTED_FACT_ID, SupportLabel.SUPPORTED]]);

afterEach(() => {
  for (const d of dirs.splice(0)) {
    rmSync(d, { recursive: true, force: true });
  }
});

describe("contract: booking evidence", () => {
  it("rejects reservation without verified booking evidence", () => {
    const denied = evaluateBookingClaim({
      claim: BookingClaimKind.RESERVATION,
      conversationId: "c1",
      bookingEvidence: [],
    });
    expect(denied.allowed).toBe(false);
    if (!denied.allowed) {
      expect(denied.code).toBe("BOOKING_EVIDENCE_REQUIRED");
    }
  });
});

describe("contract: takeover invalidates unsent replies", () => {
  it("increments version and blocks gateway send of queued agent reply", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-inbox-contract-"));
    dirs.push(dir);
    const store = createFileInboxStore(dir);
    const gateway = createActionGateway();
    const service = createInboxService(store, { gateway });
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
    expect(queued.message.preparedAtVersion).toBe(1);

    const takeover = service.takeOver({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      nowIso: now,
    });
    expect(takeover.ok).toBe(true);
    if (!takeover.ok) return;
    expect(takeover.conversation.version).toBe(2);
    expect(takeover.cancelledMessageIds).toEqual([queued.message.messageId]);

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
    expect(sent.outcome?.label).toBe("FAILURE");
  });
});

describe("contract: fixture lead + live NOT_WIRED", () => {
  it("logs fixture Zoho lead and refuses live inbox", () => {
    const dir = mkdtempSync(join(tmpdir(), "ws-inbox-lead-"));
    dirs.push(dir);
    const service = createInboxService(createFileInboxStore(dir), {
      gateway: createActionGateway(),
    });
    service.seedFixtures(now);
    const { mapping } = service.seedAndProveInboxMapping(now);
    const grants = createDemoInboxGrants(now);

    const lead = service.logLead({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [grants.leadPolicy],
        grants: [grants.leadGrant],
      },
      productionMapping: mapping,
      nowIso: now,
    });
    expect(lead.gatewayDecision?.allowed).toBe(true);
    expect(lead.lead?.crmRecordId).toBeTruthy();
    expect(lead.liveCrmLeadWiring).toBe("NOT_WIRED");

    const liveLead = service.logLead({
      conversationId: INBOX_PILOT_CONVERSATION_ID,
      authority: {
        outboundStopped: false,
        operatingMode: OperatingMode.OPERATE,
        policies: [grants.leadPolicy],
        grants: [grants.leadGrant],
      },
      productionMapping: mapping,
      preferLive: true,
      nowIso: now,
    });
    expect(liveLead.lead).toBeNull();
    expect(liveLead.details.join(" ")).toMatch(/NOT_WIRED/);

    expect(liveInboxSendStub("email").accepted).toBe(false);
  });
});
