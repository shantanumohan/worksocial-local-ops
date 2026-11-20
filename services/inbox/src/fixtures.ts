/**
 * Fixture golden conversation + inbox/CRM adapters for R1-09.
 * Offline only — no live inbox providers or Zoho mutations.
 */

import {
  AdapterWiring,
  BindingKind,
  ConnectionState,
  DEFAULT_PILOT_EVIDENCE_KINDS,
  InboxChannel,
  MessageDirection,
  MessageSendStatus,
  ResourceOwnerSystem,
  SupportLabel,
  VerificationState,
  WriteReadiness,
  createConversation,
  defaultResponsePolicy,
  proveFixturePilotWritePath,
  type ConversationRecord,
  type MessageRecord,
  type ProductionMappingState,
  type ResponsePolicy,
  type SourceBinding,
  type PilotWritePath,
  type CrmOwnership,
  type JourneyRegistryEntry,
} from "@worksocial/domain";

export const INBOX_PILOT_CONV_ASSET_ID = "golden-conv-after-hours" as const;
export const INBOX_PILOT_LEAD_ASSET_ID = "lead-fixture-after-hours" as const;
export const INBOX_REPLY_WRITE_PATH_ID = "wp-inbox-reply-send" as const;
export const INBOX_CRM_LEAD_WRITE_PATH_ID = "wp-inbox-crm-lead" as const;
export const INBOX_PILOT_BINDING_ID = "bind-inbox-fixture" as const;
export const INBOX_CRM_OWNERSHIP_ID = "crm-inbox-fixture" as const;
export const INBOX_PILOT_CONVERSATION_ID = "golden-conv-after-hours" as const;
export const INBOX_PILOT_INBOUND_ID = "golden-msg-inbound-1" as const;
export const INBOX_SUPPORTED_FACT_ID = "fixture-fact-hours" as const;
export const INBOX_SITE_ID = "worksocial-pilot" as const;
export const INBOX_FIXTURE_BOOKING_URL =
  "https://fixture.worksocial.local/book/training-rooms" as const;

export type InboxAdapterResult =
  | {
      wiring: "FIXTURE";
      accepted: true;
      remoteId: string;
      summary: string;
    }
  | {
      wiring: "NOT_WIRED";
      accepted: false;
      remoteId: null;
      summary: string;
      code: "NOT_WIRED";
    };

export function fixtureInboxSend(input: {
  messageId: string;
  conversationId: string;
}): InboxAdapterResult {
  return {
    wiring: "FIXTURE",
    accepted: true,
    remoteId: `fixture-out-${input.messageId}`,
    summary: `Fixture inbox accepted outbound for ${input.conversationId}`,
  };
}

export function liveInboxSendStub(provider: string): InboxAdapterResult {
  return {
    wiring: "NOT_WIRED",
    accepted: false,
    remoteId: null,
    summary: `Live ${provider} inbox send is NOT_WIRED without owner credentials`,
    code: "NOT_WIRED",
  };
}

export function fixtureCrmLeadLog(input: {
  leadId: string;
  correlationId: string;
}): InboxAdapterResult {
  return {
    wiring: "FIXTURE",
    accepted: true,
    remoteId: `zoho-fixture-lead-${input.leadId}`,
    summary: `Fixture Zoho accepted qualified lead ${input.correlationId}`,
  };
}

export function liveCrmLeadLogStub(): InboxAdapterResult {
  return {
    wiring: "NOT_WIRED",
    accepted: false,
    remoteId: null,
    summary:
      "Live Zoho qualified-lead write is NOT_WIRED without owner credentials and org validation",
    code: "NOT_WIRED",
  };
}

export function invokeInboxSendAdapter(input: {
  preferLive: boolean;
  provider?: string;
  messageId: string;
  conversationId: string;
}): InboxAdapterResult {
  if (input.preferLive) {
    return liveInboxSendStub(input.provider ?? "email");
  }
  return fixtureInboxSend({
    messageId: input.messageId,
    conversationId: input.conversationId,
  });
}

export function invokeCrmLeadAdapter(input: {
  preferLive: boolean;
  leadId: string;
  correlationId: string;
}): InboxAdapterResult {
  if (input.preferLive) {
    return liveCrmLeadLogStub();
  }
  return fixtureCrmLeadLog({
    leadId: input.leadId,
    correlationId: input.correlationId,
  });
}

export function buildGoldenInbound(nowIso: string): {
  conversation: ConversationRecord;
  inbound: MessageRecord;
  policy: ResponsePolicy;
  citedFactIds: string[];
  factLabels: Map<string, (typeof SupportLabel)[keyof typeof SupportLabel]>;
} {
  const conversation = createConversation({
    conversationId: INBOX_PILOT_CONVERSATION_ID,
    providerThreadId: "fixture-thread-after-hours",
    channel: InboxChannel.FIXTURE,
    customerDisplayName: "Jordan Lee",
    customerEmail: "jordan.lee@example.com",
    fixtureOnly: true,
    nowIso,
  });
  const inbound: MessageRecord = {
    messageId: INBOX_PILOT_INBOUND_ID,
    conversationId: conversation.conversationId,
    providerMessageId: "fixture-in-1",
    direction: MessageDirection.INBOUND,
    body: "Hi — do you have a training room this Friday for about 12 people in Jersey City? Please send a booking link.",
    sender: "customer",
    preparedAtVersion: null,
    sendStatus: MessageSendStatus.SENT,
    citedFactIds: [],
    gatewayOperationId: null,
    bookingClaim: null,
    fixtureOnly: true,
    createdAtIso: nowIso,
    sentAtIso: nowIso,
  };
  return {
    conversation,
    inbound,
    policy: defaultResponsePolicy(nowIso),
    citedFactIds: [INBOX_SUPPORTED_FACT_ID],
    factLabels: new Map([[INBOX_SUPPORTED_FACT_ID, SupportLabel.SUPPORTED]]),
  };
}

export function createFixtureInboxPilotMapping(nowIso: string): {
  state: ProductionMappingState;
  writePathIds: { reply: string; lead: string };
} {
  const siteId = INBOX_SITE_ID;
  const binding: SourceBinding = {
    bindingId: INBOX_PILOT_BINDING_ID,
    siteId,
    kind: BindingKind.WEBSITE,
    resourceRef: "fixture://inbox/after-hours",
    displayName: "Fixture after-hours inbox",
    identityLabel: null,
    connectionState: ConnectionState.NOT_CONFIGURED,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.NOT_VERIFIED,
    ownershipProven: false,
    observedRevision: null,
    adapterWiring: AdapterWiring.FIXTURE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const crm: CrmOwnership = {
    crmOwnershipId: INBOX_CRM_OWNERSHIP_ID,
    organizationId: "zoho-org-fixture-inbox",
    environment: "fixture",
    moduleId: "Leads",
    fieldOwnership: [
      { fieldName: "Email", ownerSystem: ResourceOwnerSystem.CRM },
      { fieldName: "Last_Name", ownerSystem: ResourceOwnerSystem.CRM },
    ],
    testDataPolicy: "fixture-only; exclude from revenue reporting",
    ownershipProven: false,
    adapterWiring: AdapterWiring.FIXTURE,
    createdAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  const replyPath: PilotWritePath = {
    writePathId: INBOX_REPLY_WRITE_PATH_ID,
    channelId: "inbox",
    assetId: INBOX_PILOT_CONV_ASSET_ID,
    operation: "send_customer_reply",
    siteId,
    bindingId: INBOX_PILOT_BINDING_ID,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: null,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  const leadPath: PilotWritePath = {
    writePathId: INBOX_CRM_LEAD_WRITE_PATH_ID,
    channelId: "crm",
    assetId: INBOX_PILOT_LEAD_ASSET_ID,
    operation: "log_qualified_lead",
    siteId,
    bindingId: INBOX_PILOT_BINDING_ID,
    formId: null,
    bookingOwnershipId: null,
    crmOwnershipId: INBOX_CRM_OWNERSHIP_ID,
    requiredEvidenceKinds: [...DEFAULT_PILOT_EVIDENCE_KINDS],
    createdAtIso: nowIso,
  };

  const journey: JourneyRegistryEntry = {
    journeyId: "journey-after-hours-inbox",
    siteId,
    displayName: "After-hours inquiry to lead + handoff",
    stages: ["ingest", "concierge", "reply", "crm_lead", "handoff"],
    writePathIds: [INBOX_REPLY_WRITE_PATH_ID, INBOX_CRM_LEAD_WRITE_PATH_ID],
    createdAtIso: nowIso,
  };

  return {
    writePathIds: {
      reply: INBOX_REPLY_WRITE_PATH_ID,
      lead: INBOX_CRM_LEAD_WRITE_PATH_ID,
    },
    state: {
      version: 1,
      sites: [siteId],
      bindings: [binding],
      forms: [],
      bookingOwnership: [],
      crmOwnership: [crm],
      writePaths: [replyPath, leadPath],
      journeys: [journey],
      readEvidence: [],
      writePathOutcomes: [],
      updatedAt: nowIso,
    },
  };
}

export function proveFixtureInboxWritePaths(
  state: ProductionMappingState,
  nowIso: string,
): ProductionMappingState {
  let next = proveFixturePilotWritePath(
    state,
    INBOX_REPLY_WRITE_PATH_ID,
    nowIso,
  );
  next = proveFixturePilotWritePath(next, INBOX_CRM_LEAD_WRITE_PATH_ID, nowIso);
  return next;
}

export function upsertFixtureInboxMapping(
  current: ProductionMappingState,
  nowIso: string,
): {
  state: ProductionMappingState;
  writePathIds: { reply: string; lead: string };
  created: boolean;
} {
  const { state: fixture, writePathIds } =
    createFixtureInboxPilotMapping(nowIso);
  const hasReply = current.writePaths.some(
    (p) => p.writePathId === writePathIds.reply,
  );
  const hasLead = current.writePaths.some(
    (p) => p.writePathId === writePathIds.lead,
  );
  const hasCrm = current.crmOwnership.some(
    (c) => c.crmOwnershipId === INBOX_CRM_OWNERSHIP_ID,
  );
  if (hasReply && hasLead && hasCrm) {
    return { state: current, writePathIds, created: false };
  }

  const missingPaths = fixture.writePaths.filter(
    (fp) => !current.writePaths.some((p) => p.writePathId === fp.writePathId),
  );
  const missingCrm = fixture.crmOwnership.filter(
    (fc) =>
      !current.crmOwnership.some((c) => c.crmOwnershipId === fc.crmOwnershipId),
  );
  const missingBindings = fixture.bindings.filter(
    (fb) => !current.bindings.some((b) => b.bindingId === fb.bindingId),
  );
  const missingJourneys = fixture.journeys.filter(
    (fj) => !current.journeys.some((j) => j.journeyId === fj.journeyId),
  );

  return {
    writePathIds,
    created: true,
    state: {
      ...current,
      sites: [...new Set([...current.sites, ...fixture.sites])],
      bindings: [...current.bindings, ...missingBindings],
      crmOwnership: [...current.crmOwnership, ...missingCrm],
      writePaths: [...current.writePaths, ...missingPaths],
      journeys: [...current.journeys, ...missingJourneys],
      updatedAt: nowIso,
    },
  };
}
