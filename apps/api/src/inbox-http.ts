/**
 * M7 / NEXT-18 HTTP routes for after-hours inbox, fixture webhook intake,
 * takeover, CRM lead coalesce, delivery confirm, and conversation timeline.
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  BookingClaimKind,
  roleMayPerform,
  type BookingClaimKindValue,
  type SupportLabelValue,
} from "@worksocial/domain";
import {
  createDemoInboxGrants,
  type AuthorityStore,
  type PolicyDecisionRecord,
  type ProductionMappingStore,
} from "@worksocial/persistence";
import {
  INBOX_SUPPORTED_FACT_ID,
  proveFixtureInboxWritePaths,
  upsertFixtureInboxMapping,
  type InboxService,
} from "@worksocial/inbox";
import type { KnowledgeService } from "@worksocial/knowledge";

type JsonFn = (
  res: ServerResponse,
  status: number,
  body: unknown,
  cors: Record<string, string>,
) => void;

type ReadBodyFn = (req: IncomingMessage) => Promise<string>;

type ParseJsonFn = (
  raw: string,
) => { ok: true; value: Record<string, unknown> } | { ok: false; error: string };

type SessionResult =
  | {
      ok: true;
      session: { role: string; userId: string; csrfToken?: string };
    }
  | { ok: false; code: string; reason: string };

type RequireSessionFn = (
  req: IncomingMessage,
  opts: { requireCsrf: boolean; csrfHeader?: string | undefined },
) => SessionResult;

function factLabelsFromKnowledge(
  knowledge: KnowledgeService,
): Map<string, SupportLabelValue> {
  const labels = new Map<string, SupportLabelValue>();
  for (const fact of knowledge.listFacts(500)) {
    labels.set(fact.factId, fact.supportLabel);
  }
  return labels;
}

function recordGatewayDecision(
  authorityStore: AuthorityStore,
  decision: {
    decisionId: string;
    operationId: string;
    payloadDigest: string;
    allowed: boolean;
    code: string | null;
    reason: string;
    grantId: string | null;
    policyId: string | null;
    decidedAtIso: string;
  },
): void {
  const row: PolicyDecisionRecord = {
    decisionId: decision.decisionId,
    operationId: decision.operationId,
    payloadDigest: decision.payloadDigest,
    allowed: decision.allowed,
    code: decision.code,
    reason: decision.reason,
    grantId: decision.grantId,
    policyId: decision.policyId,
    decidedAtIso: decision.decidedAtIso,
  };
  authorityStore.update((s) => ({
    ...s,
    policyDecisions: [...s.policyDecisions, row],
    updatedAt: row.decidedAtIso,
  }));
}

export async function handleInboxRequest(input: {
  inbox: InboxService;
  knowledge: KnowledgeService;
  authorityStore: AuthorityStore;
  mappingStore: ProductionMappingStore;
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  method: string;
  cors: Record<string, string>;
  json: JsonFn;
  readBody: ReadBodyFn;
  parseJsonObjectBody: ParseJsonFn;
  requireSession: RequireSessionFn;
}): Promise<boolean> {
  const {
    inbox,
    knowledge,
    authorityStore,
    mappingStore,
    req,
    res,
    url,
    method,
    cors,
    json,
    readBody,
    parseJsonObjectBody,
    requireSession,
  } = input;

  if (!url.pathname.startsWith("/inbox/")) {
    return false;
  }

  const sessionGet = () => requireSession(req, { requireCsrf: false });
  const sessionMutate = () =>
    requireSession(req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });

  if (method === "GET" && url.pathname === "/inbox/status") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, inbox.status(), cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/conversations") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { conversations: inbox.listConversations(100) }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/messages") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const conversationId = url.searchParams.get("conversationId") ?? undefined;
    json(
      res,
      200,
      { messages: inbox.listMessages(conversationId, 200) },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/leads") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { leads: inbox.listLeads(100) }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/handoffs") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { handoffs: inbox.listHandoffs(100) }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/webhooks") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { events: inbox.listWebhookEvents(200) }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/ownership-events") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const conversationId = url.searchParams.get("conversationId") ?? undefined;
    json(
      res,
      200,
      { events: inbox.listOwnershipEvents(conversationId, 200) },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/timeline") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const conversationId = url.searchParams.get("conversationId");
    if (!conversationId) {
      json(res, 400, { error: "MISSING_CONVERSATION_ID" }, cors);
      return true;
    }
    const timeline = inbox.getTimeline(conversationId);
    json(res, timeline.ok ? 200 : 404, timeline, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/inbox/policy") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { policy: inbox.getPolicy() }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/seed-fixtures") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    knowledge.seedFixtures();
    const seed = inbox.seedFixtures();
    json(
      res,
      200,
      {
        ...seed,
        note: "Seeded golden after-hours conversation. Live inbox providers and live Zoho remain NOT_WIRED.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/ensure-fixture-mapping") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    if (!roleMayPerform(session.session.role as never, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Inbox fixture mapping requires administrator manage_standing_policies",
        },
        cors,
      );
      return true;
    }
    const nowIso = new Date().toISOString();
    const current = mappingStore.read();
    const upserted = upsertFixtureInboxMapping(current, nowIso);
    const proven = proveFixtureInboxWritePaths(upserted.state, nowIso);
    mappingStore.write(proven);

    const demo = createDemoInboxGrants(nowIso);
    authorityStore.update((s) => ({
      ...s,
      standingPolicies: [
        ...s.standingPolicies.filter(
          (p) =>
            p.policyId !== demo.replyPolicy.policyId &&
            p.policyId !== demo.leadPolicy.policyId,
        ),
        demo.replyPolicy,
        demo.leadPolicy,
      ],
      capabilityGrants: [
        ...s.capabilityGrants.filter(
          (g) =>
            g.grantId !== demo.replyGrant.grantId &&
            g.grantId !== demo.leadGrant.grantId,
        ),
        demo.replyGrant,
        demo.leadGrant,
      ],
      updatedAt: nowIso,
    }));

    json(
      res,
      200,
      {
        writePathIds: upserted.writePathIds,
        created: upserted.created,
        note: "Persisted inbox reply + CRM lead write paths, fixture read evidence, and demo grants.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/ingest-fixture") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    const providerEventId =
      typeof body.providerEventId === "string" ? body.providerEventId : "";
    const providerThreadId =
      typeof body.providerThreadId === "string" ? body.providerThreadId : "";
    const providerMessageId =
      typeof body.providerMessageId === "string"
        ? body.providerMessageId
        : providerEventId;
    const messageBody = typeof body.body === "string" ? body.body : "";
    const customerDisplayName =
      typeof body.customerDisplayName === "string"
        ? body.customerDisplayName
        : "Fixture Customer";
    if (!providerEventId || !providerThreadId || !messageBody) {
      json(
        res,
        400,
        {
          error: "MISSING_FIELDS",
          reason:
            "providerEventId, providerThreadId, and body are required for fixture webhook ingest",
        },
        cors,
      );
      return true;
    }
    const result = inbox.ingestFixtureWebhook({
      providerEventId,
      providerThreadId,
      providerMessageId,
      body: messageBody,
      customerDisplayName,
      customerEmail:
        typeof body.customerEmail === "string" ? body.customerEmail : null,
      ...(typeof body.conversationId === "string"
        ? { conversationId: body.conversationId }
        : {}),
      nowIso:
        typeof body.nowIso === "string"
          ? body.nowIso
          : new Date().toISOString(),
    });
    json(
      res,
      200,
      {
        ...result,
        note: result.duplicate
          ? "Duplicate webhook coalesced — no new inbound message."
          : "Fixture webhook accepted into durable inbox. Live providers remain NOT_WIRED.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/draft-reply") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (typeof body.conversationId !== "string" || !body.conversationId) {
      json(res, 400, { error: "MISSING_CONVERSATION_ID" }, cors);
      return true;
    }
    const citedFactIds =
      Array.isArray(body.citedFactIds) &&
      body.citedFactIds.every((x) => typeof x === "string") &&
      body.citedFactIds.length > 0
        ? (body.citedFactIds as string[])
        : [INBOX_SUPPORTED_FACT_ID];
    let bookingClaim: BookingClaimKindValue | null =
      BookingClaimKind.AVAILABILITY_LINK;
    if (typeof body.bookingClaim === "string") {
      const allowed = Object.values(BookingClaimKind) as string[];
      if (!allowed.includes(body.bookingClaim)) {
        json(res, 400, { error: "INVALID_BOOKING_CLAIM" }, cors);
        return true;
      }
      bookingClaim = body.bookingClaim as BookingClaimKindValue;
    }
    const drafted = inbox.draftReply({
      conversationId: body.conversationId,
      citedFactIds,
      factLabels: factLabelsFromKnowledge(knowledge),
      bookingClaim,
    });
    json(res, drafted.ok ? 200 : 400, drafted, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/queue-reply") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (
      typeof body.conversationId !== "string" ||
      typeof body.draftId !== "string"
    ) {
      json(res, 400, { error: "MISSING_FIELDS" }, cors);
      return true;
    }
    const queued = inbox.queueReply({
      conversationId: body.conversationId,
      draftId: body.draftId,
    });
    json(res, queued.ok ? 200 : 400, queued, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/send-reply") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    if (!roleMayPerform(session.session.role as never, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Inbox send requires administrator manage_standing_policies",
        },
        cors,
      );
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (typeof body.messageId !== "string" || !body.messageId) {
      json(res, 400, { error: "MISSING_MESSAGE_ID" }, cors);
      return true;
    }
    const nowIso = new Date().toISOString();
    const authorityState = authorityStore.read();
    const hasReplyGrant = authorityState.capabilityGrants.some(
      (g) =>
        !g.revoked &&
        g.allowedOperations.includes("send_customer_reply") &&
        g.grantId === "grant-demo-inbox-reply",
    );
    if (!hasReplyGrant) {
      json(
        res,
        403,
        {
          error: "GRANT_MISSING",
          reason:
            "No persisted inbox reply grant. Call /inbox/ensure-fixture-mapping first — will not mint demo authority at send time.",
        },
        cors,
      );
      return true;
    }
    const sent = inbox.sendQueuedReply({
      messageId: body.messageId,
      preferLive: body.preferLive === true,
      authority: {
        outboundStopped: authorityState.ownerControls.outboundStopped,
        operatingMode: authorityState.ownerControls.operatingMode,
        actorRole: session.session.role,
        policies: authorityState.standingPolicies,
        grants: authorityState.capabilityGrants,
      },
      productionMapping: mappingStore.read(),
      nowIso,
    });
    if (sent.gatewayDecision) {
      recordGatewayDecision(authorityStore, sent.gatewayDecision);
    }
    if (sent.outcome) {
      mappingStore.addWritePathOutcome(sent.outcome);
    }
    json(
      res,
      200,
      {
        ...sent,
        note: "Gateway-gated fixture inbox send. Live providers remain NOT_WIRED. Acceptance ≠ delivered — call /inbox/confirm-delivery.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/confirm-delivery") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (typeof body.messageId !== "string" || !body.messageId) {
      json(res, 400, { error: "MISSING_MESSAGE_ID" }, cors);
      return true;
    }
    const confirmed = inbox.confirmDelivery({ messageId: body.messageId });
    if (confirmed.ok && confirmed.outcome) {
      mappingStore.addWritePathOutcome(confirmed.outcome);
    }
    json(
      res,
      confirmed.ok ? 200 : 400,
      {
        ...confirmed,
        note: confirmed.ok
          ? "Independent fixture delivery receipt recorded (sent → delivered). Learning SUCCESS recorded only now."
          : undefined,
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/takeover") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (typeof body.conversationId !== "string" || !body.conversationId) {
      json(res, 400, { error: "MISSING_CONVERSATION_ID" }, cors);
      return true;
    }
    const nowIso = new Date().toISOString();
    const takeover = inbox.takeOver({
      conversationId: body.conversationId,
      actorUserId: session.session.userId,
      nowIso,
    });
    if (takeover.ok) {
      authorityStore.update((state) => ({
        ...state,
        auditEvents: [
          ...state.auditEvents,
          {
            eventId: `evt-${randomBytes(6).toString("hex")}`,
            actorUserId: session.session.userId,
            eventType: "conversation_takeover",
            detail: `Takeover conversation ${body.conversationId}; cancelled=${takeover.cancelledMessageIds.join(",") || "none"}; drafts=${takeover.invalidatedDraftIds.join(",") || "none"}`,
            createdAtIso: nowIso,
          },
        ],
        updatedAt: nowIso,
      }));
    }
    json(
      res,
      takeover.ok ? 200 : 400,
      {
        ...takeover,
        note: takeover.ok
          ? "Conversation version incremented; every unsent agent reply (queued/draft) cancelled."
          : undefined,
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/log-lead") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    if (!roleMayPerform(session.session.role as never, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "CRM lead logging requires administrator manage_standing_policies",
        },
        cors,
      );
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (typeof body.conversationId !== "string" || !body.conversationId) {
      json(res, 400, { error: "MISSING_CONVERSATION_ID" }, cors);
      return true;
    }
    const nowIso = new Date().toISOString();
    const authorityState = authorityStore.read();
    const hasLeadGrant = authorityState.capabilityGrants.some(
      (g) =>
        !g.revoked &&
        g.allowedOperations.includes("log_qualified_lead") &&
        g.grantId === "grant-demo-inbox-crm-lead",
    );
    if (!hasLeadGrant) {
      json(
        res,
        403,
        {
          error: "GRANT_MISSING",
          reason:
            "No persisted inbox CRM lead grant. Call /inbox/ensure-fixture-mapping first — will not mint demo authority at log time.",
        },
        cors,
      );
      return true;
    }
    const lead = inbox.logLead({
      conversationId: body.conversationId,
      ...(typeof body.locationNeed === "string"
        ? { locationNeed: body.locationNeed }
        : {}),
      ...(typeof body.dateNeed === "string" ? { dateNeed: body.dateNeed } : {}),
      ...(typeof body.sizeNeed === "string" ? { sizeNeed: body.sizeNeed } : {}),
      ...(typeof body.sourceInboundMessageId === "string"
        ? { sourceInboundMessageId: body.sourceInboundMessageId }
        : {}),
      ...(typeof body.providerEventId === "string"
        ? { providerEventId: body.providerEventId }
        : {}),
      preferLive: body.preferLive === true,
      authority: {
        outboundStopped: authorityState.ownerControls.outboundStopped,
        operatingMode: authorityState.ownerControls.operatingMode,
        actorRole: session.session.role,
        policies: authorityState.standingPolicies,
        grants: authorityState.capabilityGrants,
      },
      productionMapping: mappingStore.read(),
      nowIso,
    });
    if (lead.gatewayDecision) {
      recordGatewayDecision(authorityStore, lead.gatewayDecision);
    }
    if (lead.outcome) {
      mappingStore.addWritePathOutcome(lead.outcome);
    }
    json(
      res,
      200,
      {
        ...lead,
        note: lead.coalesced
          ? "Duplicate inbound coalesced — existing fixture lead returned."
          : "Fixture Zoho qualified-lead path. Synthetic leads excluded from commercial totals. Live Zoho remains NOT_WIRED.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/handoff") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (
      typeof body.conversationId !== "string" ||
      typeof body.reason !== "string"
    ) {
      json(res, 400, { error: "MISSING_FIELDS" }, cors);
      return true;
    }
    if (
      body.customerQuestions !== undefined &&
      (!Array.isArray(body.customerQuestions) ||
        !body.customerQuestions.every((q) => typeof q === "string"))
    ) {
      json(res, 400, { error: "INVALID_CUSTOMER_QUESTIONS" }, cors);
      return true;
    }
    if (
      body.verifiedAnswers !== undefined &&
      (!Array.isArray(body.verifiedAnswers) ||
        !body.verifiedAnswers.every((q) => typeof q === "string"))
    ) {
      json(res, 400, { error: "INVALID_VERIFIED_ANSWERS" }, cors);
      return true;
    }
    const handoff = inbox.createMorningHandoff({
      conversationId: body.conversationId,
      reason: body.reason,
      ...(typeof body.nextOwner === "string"
        ? { nextOwner: body.nextOwner }
        : {}),
      ...(Array.isArray(body.customerQuestions)
        ? { customerQuestions: body.customerQuestions as string[] }
        : {}),
      ...(Array.isArray(body.verifiedAnswers)
        ? { verifiedAnswers: body.verifiedAnswers as string[] }
        : {}),
      ...(typeof body.requestedAction === "string"
        ? { requestedAction: body.requestedAction }
        : {}),
    });
    json(res, handoff.ok ? 200 : 400, handoff, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/acknowledge-handoff") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const body = parsed.value;
    if (typeof body.handoffId !== "string" || !body.handoffId) {
      json(res, 400, { error: "MISSING_HANDOFF_ID" }, cors);
      return true;
    }
    const ack = inbox.acknowledgeMorningHandoff({
      handoffId: body.handoffId,
    });
    json(res, ack.ok ? 200 : 400, ack, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/inbox/pause-replies") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    if (!roleMayPerform(session.session.role as never, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Pause/resume replies requires administrator manage_standing_policies",
        },
        cors,
      );
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const policy = inbox.pauseReplies(parsed.value.paused === true);
    json(res, 200, { policy }, cors);
    return true;
  }

  json(res, 404, { error: "NOT_FOUND" }, cors);
  return true;
}
