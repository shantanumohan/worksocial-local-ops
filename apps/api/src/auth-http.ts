/**
 * Local identity HTTP helpers for R1-02 (session cookie + CSRF + origin checks).
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  LocalRole,
  OperatingMode,
  OutcomeEvidenceSource,
  OutcomeLabel,
  AdapterWiring,
  BindingKind,
  ConnectionState,
  EvidenceKind,
  ResourceOwnerSystem,
  VerificationState,
  WriteReadiness,
  applyBindingReadEvidence,
  bindingStatusView,
  assertNonEmptyEvidenceKinds,
  createReadEvidence,
  findActiveUser,
  isAgentRoleId,
  isOutcomeEvidenceSource,
  listAgentRoleContracts,
  listWritePathOutcomesForLearning,
  ProbeMode,
  ProbeVerdict,
  proveFixturePilotWritePath,
  recordWritePathOutcome,
  roleMayPerform,
  upsertFixturePilotMapping,
  validateSession,
  writePathIsFixtureOnly,
  isCollectionMethod,
  isSupportLabel,
  DemandSignalKind,
  FactVerificationDecision,
  SupportLabel,
  SeoChangeKind,
  ArticleStatus,
  VariantStatus,
  type BookingOwnership,
  type CollectionMethodValue,
  type CrmOwnership,
  type DemandSignalKindValue,
  type FormMapping,
  type JourneyRegistryEntry,
  type LocalRoleValue,
  type PilotWritePath,
  type SeoChangeKindValue,
  type SessionRecord,
  type SourceBinding,
  type SupportLabelValue,
} from "@worksocial/domain";
import {
  createDemoCanaryGrant,
  createDemoContentDistributionGrants,
  createDemoPublishGrant,
  createDemoRepairGrant,
  createDurableExecutionService,
  createFileAuthorityStore,
  createFileContentStore,
  createFileDurableStores,
  createFileInboxStore,
  createFileLearningStore,
  createFileKnowledgeStore,
  createFileOwnerStagingStore,
  createFileLeadCaptureStore,
  createFileProbeStore,
  createFileProductionMappingStore,
  createFileRepairStore,
  createFileRoleRuntimeStore,
  createFileSeoStore,
  defaultDurableStateDir,
  ensureBootstrapOwner,
  verifyPassword,
  type AuthorityStore,
  type KnowledgeStore,
  type LearningStore,
  type OwnerStagingStore,
  type LeadCaptureStore,
  type PolicyDecisionRecord,
  type ContentStore,
  type InboxStore,
  type ProbeStore,
  type ProductionMappingStore,
  type RepairStore,
  type RoleRuntimeStore,
  type SeoStore,
} from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayIntent,
} from "@worksocial/action-gateway";
import { createCredentialBroker, type CredentialBroker } from "@worksocial/credential-broker";
import {
  createStagingCmsSimulator,
  listAdapters,
} from "@worksocial/provider-adapters";
import {
  createClaudeRunner,
  type ClaudeRunner,
} from "@worksocial/claude-runner";
import {
  createMissionEnqueueService,
  type MissionEnqueueService,
} from "@worksocial/workflow-worker";
import {
  createLearningWorker,
  type LearningWorker,
} from "@worksocial/learning-worker";
import {
  createProbeService,
  type ProbeService,
} from "@worksocial/probes";
import {
  createKnowledgeService,
  type KnowledgeService,
} from "@worksocial/knowledge";
import {
  createSeoService,
  proveFixtureSeoWritePath,
  upsertFixtureSeoMapping,
  type SeoService,
} from "@worksocial/seo";
import {
  createContentService,
  proveFixtureContentWritePaths,
  upsertFixtureContentMapping,
  type ContentService,
} from "@worksocial/content";
import {
  createInboxService,
  type InboxService,
} from "@worksocial/inbox";
import {
  createRepairService,
  proveFixtureRepairWritePath,
  upsertFixtureRepairMapping,
  REPAIR_PROPOSAL_ID,
  type RepairService,
} from "@worksocial/repair";
import {
  createOwnerStagingService,
  type OwnerStagingService,
} from "@worksocial/owner-staging";
import {
  createLeadCaptureService,
  type LeadCaptureService,
} from "@worksocial/lead-capture";
import { listPinnedModels } from "@worksocial/ml";
import { handleOwnerStagingRequest } from "./owner-staging-http.js";
import { handleLeadCaptureRequest } from "./lead-capture-http.js";
import { handleInboxRequest } from "./inbox-http.js";
import { handleCanonicalPublishRequest } from "./content-http.js";

function factLabelsFromKnowledge(
  knowledge: KnowledgeService,
): Map<string, SupportLabelValue> {
  const labels = new Map<string, SupportLabelValue>();
  for (const fact of knowledge.listFacts(500)) {
    labels.set(fact.factId, fact.supportLabel);
  }
  return labels;
}

function parseSchemaNodes(
  raw: unknown,
):
  | { ok: true; nodes: import("@worksocial/domain").SchemaOrgNode[] }
  | { ok: false; reasons: string[] } {
  if (!Array.isArray(raw)) {
    return { ok: false, reasons: ["nodes must be an array"] };
  }
  const nodes: import("@worksocial/domain").SchemaOrgNode[] = [];
  const reasons: string[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = raw[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      reasons.push(`nodes[${i}] must be an object`);
      continue;
    }
    const rec = row as Record<string, unknown>;
    const nodeId = typeof rec.nodeId === "string" ? rec.nodeId : "";
    const schemaType = typeof rec.schemaType === "string" ? rec.schemaType : "";
    if (!nodeId.trim()) reasons.push(`nodes[${i}].nodeId is required`);
    if (!schemaType.trim()) reasons.push(`nodes[${i}].schemaType is required`);
    if (
      rec.properties === undefined ||
      typeof rec.properties !== "object" ||
      rec.properties === null ||
      Array.isArray(rec.properties)
    ) {
      reasons.push(`nodes[${i}].properties must be an object`);
      continue;
    }
    if (!Array.isArray(rec.citedFactIds)) {
      reasons.push(`nodes[${i}].citedFactIds must be an array`);
      continue;
    }
    const citedFactIds = rec.citedFactIds.filter(
      (id): id is string => typeof id === "string",
    );
    if (citedFactIds.length !== rec.citedFactIds.length) {
      reasons.push(`nodes[${i}].citedFactIds must be string[]`);
    }
    const properties: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(
      rec.properties as Record<string, unknown>,
    )) {
      if (
        v === null ||
        typeof v === "string" ||
        typeof v === "number" ||
        typeof v === "boolean"
      ) {
        properties[k] = v;
      } else {
        reasons.push(`nodes[${i}].properties.${k} has unsupported type`);
      }
    }
    if (nodeId.trim() && schemaType.trim()) {
      nodes.push({ nodeId, schemaType, properties, citedFactIds });
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, nodes };
}

export type ApiRuntime = {
  store: AuthorityStore;
  mappingStore: ProductionMappingStore;
  roleRuntimeStore: RoleRuntimeStore;
  learningStore: LearningStore;
  learningWorker: LearningWorker;
  probeStore: ProbeStore;
  probes: ProbeService;
  knowledgeStore: KnowledgeStore;
  knowledge: KnowledgeService;
  seoStore: SeoStore;
  seo: SeoService;
  contentStore: ContentStore;
  content: ContentService;
  inboxStore: InboxStore;
  inbox: InboxService;
  repairStore: RepairStore;
  repair: RepairService;
  ownerStagingStore: OwnerStagingStore;
  ownerStaging: OwnerStagingService;
  leadCaptureStore: LeadCaptureStore;
  leadCapture: LeadCaptureService;
  runner: ClaudeRunner;
  missions: MissionEnqueueService;
  gateway: ActionGateway;
  broker: CredentialBroker;
  apiOrigin: string;
  consoleOrigin: string;
  sessionTtlMs: number;
};

/** Upsert by decisionId so verify/rehydrate updates do not duplicate rows. */
function upsertPolicyDecision(
  store: AuthorityStore,
  decision: PolicyDecisionRecord,
): void {
  store.update((s) => ({
    ...s,
    policyDecisions: [
      ...s.policyDecisions.filter((d) => d.decisionId !== decision.decisionId),
      decision,
    ],
    updatedAt: decision.decidedAtIso,
  }));
}

function policyDecisionFromGateway(decision: {
  decisionId: string;
  operationId: string;
  payloadDigest: string;
  allowed: boolean;
  code: string | null;
  reason: string;
  grantId: string | null;
  policyId: string | null;
  decidedAtIso: string;
}): PolicyDecisionRecord {
  return {
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
}

/**
 * Survive API restarts: restore ACCEPTED_PENDING gateway decisions for any
 * content article/variant left RELEASED_PENDING with a durable operation id.
 * Reuses the persisted authority decision identity when present.
 */
function rehydratePendingContentGatewayDecisions(
  gateway: ActionGateway,
  contentStore: ContentStore,
  authorityStore: AuthorityStore,
): void {
  const state = contentStore.read();
  const persisted = authorityStore.read().policyDecisions;
  const byOp = new Map(persisted.map((d) => [d.operationId, d]));

  const restore = (
    operationId: string,
    writePathId: string | null,
    decidedAtIso: string,
    reason: string,
  ) => {
    if (gateway.getDecision(operationId)) return;
    const prior = byOp.get(operationId);
    gateway.rehydratePending({
      operationId,
      ...(prior
        ? {
            decisionId: prior.decisionId,
            payloadDigest: prior.payloadDigest,
            grantId: prior.grantId,
            policyId: prior.policyId,
            decidedAtIso: prior.decidedAtIso,
          }
        : { decidedAtIso }),
      writePathId,
      reason,
      gateDetails: prior
        ? ["rehydrated from persisted authority decision"]
        : ["rehydrated from durable ledger"],
    });
  };

  for (const article of state.articles) {
    if (
      article.status === ArticleStatus.RELEASED_PENDING &&
      article.gatewayOperationId
    ) {
      restore(
        article.gatewayOperationId,
        article.writePathId,
        article.updatedAtIso,
        "Boot rehydrate: content canonical RELEASED_PENDING",
      );
    }
  }
  for (const variant of state.variants) {
    if (
      variant.status === VariantStatus.RELEASED_PENDING &&
      variant.gatewayOperationId
    ) {
      restore(
        variant.gatewayOperationId,
        variant.writePathId,
        variant.updatedAtIso,
        "Boot rehydrate: content variant RELEASED_PENDING",
      );
    }
  }
}

/**
 * Seed demo content grants only when none of the demo grant IDs exist yet.
 * Never overwrites or restores a revoked/disabled owner-edited grant.
 */
function seedDemoContentDistributionGrantsIfAbsent(
  store: AuthorityStore,
  nowIso: string,
  options?: { assetId?: string; contentRevision?: string },
): boolean {
  const demo = createDemoContentDistributionGrants(nowIso, options);
  const auth = store.read();
  const demoGrantIds = new Set([
    demo.grant.grantId,
    demo.gbpGrant.grantId,
    demo.linkedinGrant.grantId,
    demo.facebookGrant.grantId,
  ]);
  if (auth.capabilityGrants.some((g) => demoGrantIds.has(g.grantId))) {
    return false;
  }
  store.update((state) => ({
    ...state,
    standingPolicies: [
      ...state.standingPolicies,
      demo.policy,
      demo.gbpPolicy,
      demo.linkedinPolicy,
      demo.facebookPolicy,
    ],
    capabilityGrants: [
      ...state.capabilityGrants,
      demo.grant,
      demo.gbpGrant,
      demo.linkedinGrant,
      demo.facebookGrant,
    ],
    updatedAt: nowIso,
  }));
  return true;
}

export function createApiRuntime(options: {
  stateDir: string;
  apiPort: number;
  consolePort: number;
  ownerPassword?: string;
  workspaceRoot?: string;
}): ApiRuntime {
  const store = createFileAuthorityStore(options.stateDir);
  const mappingStore = createFileProductionMappingStore(options.stateDir);
  const roleRuntimeStore = createFileRoleRuntimeStore(options.stateDir);
  const learningStore = createFileLearningStore(options.stateDir);
  const learningWorker = createLearningWorker(learningStore);
  const probeStore = createFileProbeStore(options.stateDir);
  const probes = createProbeService({
    store: probeStore,
    mappingStore,
  });
  const knowledgeStore = createFileKnowledgeStore(options.stateDir);
  const knowledge = createKnowledgeService(knowledgeStore);
  const seoStore = createFileSeoStore(options.stateDir);
  const contentStore = createFileContentStore(options.stateDir);
  const inboxStore = createFileInboxStore(options.stateDir);
  const repairStore = createFileRepairStore(options.stateDir);
  const ownerStagingStore = createFileOwnerStagingStore(options.stateDir);
  const gateway = createActionGateway();
  rehydratePendingContentGatewayDecisions(gateway, contentStore, store);
  const seo = createSeoService(seoStore, { gateway });
  const contentDurable = createDurableExecutionService(
    createFileDurableStores(defaultDurableStateDir(options.stateDir)),
  );
  const content = createContentService(contentStore, {
    gateway,
    durable: contentDurable,
  });
  const inbox = createInboxService(inboxStore, { gateway });
  const repair = createRepairService(repairStore, { gateway });
  const stagingCms = createStagingCmsSimulator();
  for (const page of ownerStagingStore.read().cmsPages) {
    stagingCms.seedPage(page);
  }
  const ownerStaging = createOwnerStagingService(ownerStagingStore, stagingCms);
  const leadCaptureStore = createFileLeadCaptureStore(options.stateDir);
  const leadCapture = createLeadCaptureService(leadCaptureStore, {
    gateway,
    repairStore,
  });
  const ownerPassword =
    options.ownerPassword ?? process.env.WORKSOCIAL_OWNER_PASSWORD;
  ensureBootstrapOwner(
    store,
    ownerPassword !== undefined ? { password: ownerPassword } : {},
  );
  const workspaceRoot = options.workspaceRoot ?? process.cwd();
  const runner = createClaudeRunner({
    workspaceRoot,
    forceFixture: process.env.WORKSOCIAL_CLAUDE_FIXTURE !== "0",
  });
  const missions = createMissionEnqueueService({ runner });
  return {
    store,
    mappingStore,
    roleRuntimeStore,
    learningStore,
    learningWorker,
    probeStore,
    probes,
    knowledgeStore,
    knowledge,
    seoStore,
    seo,
    contentStore,
    content,
    inboxStore,
    inbox,
    repairStore,
    repair,
    ownerStagingStore,
    ownerStaging,
    leadCaptureStore,
    leadCapture,
    runner,
    missions,
    gateway,
    broker: createCredentialBroker(),
    apiOrigin: `http://127.0.0.1:${options.apiPort}`,
    consoleOrigin: `http://127.0.0.1:${options.consolePort}`,
    sessionTtlMs: 8 * 60 * 60 * 1000,
  };
}

export function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Parse JSON body as a plain non-null object; reject null/array/primitives. */
export function parseJsonObjectBody(
  raw: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (!raw.trim()) {
    return { ok: true, value: {} };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { ok: false, error: "INVALID_JSON" };
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    return { ok: false, error: "INVALID_BODY" };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) {
    return out;
  }
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) {
      continue;
    }
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    out[key] = decodeURIComponent(value);
  }
  return out;
}

function allowedOrigins(runtime: ApiRuntime): string[] {
  return [
    runtime.apiOrigin,
    runtime.consoleOrigin,
    "http://127.0.0.1:8787",
    "http://127.0.0.1:8788",
    "http://localhost:8787",
    "http://localhost:8788",
  ];
}

function corsHeaders(
  runtime: ApiRuntime,
  req: IncomingMessage,
): Record<string, string> {
  const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
  if (origin && allowedOrigins(runtime).includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      "access-control-allow-headers":
        "content-type, x-csrf-token, origin",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      vary: "Origin",
    };
  }
  return {};
}

export function json(
  res: ServerResponse,
  status: number,
  body: unknown,
  extraHeaders?: Record<string, string>,
): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders,
  });
  res.end(payload);
}

function getSession(runtime: ApiRuntime, req: IncomingMessage): SessionRecord | null {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies["ws_session"];
  if (!sessionId) {
    return null;
  }
  return runtime.store.read().sessions.find((s) => s.sessionId === sessionId) ?? null;
}

function requireSession(
  runtime: ApiRuntime,
  req: IncomingMessage,
  opts: { requireCsrf: boolean; csrfHeader?: string | undefined },
) {
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : null;
  // Same-origin navigations may omit Origin; fall back to Host-derived loopback origin.
  const host = req.headers.host;
  const inferred =
    originHeader ??
    (host ? `http://${host}` : null);
  return validateSession({
    session: getSession(runtime, req),
    nowIso: new Date().toISOString(),
    requestOrigin: inferred,
    expectedHostOrigins: allowedOrigins(runtime),
    csrfToken: opts.csrfHeader ?? null,
    requireCsrf: opts.requireCsrf,
  });
}

export async function handleApiRequest(
  runtime: ApiRuntime,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = new URL(req.url ?? "/", runtime.apiOrigin);
  const method = req.method ?? "GET";
  const cors = corsHeaders(runtime, req);

  if (method === "OPTIONS") {
    res.writeHead(204, cors);
    res.end();
    return;
  }

  if (method === "GET" && (url.pathname === "/health" || url.pathname === "/")) {
    json(
      res,
      200,
      {
        serviceId: "api",
        status: "running",
        productionActivated: false,
        identity:
          "M6 canonical publish + M5 lead-capture + R1-02–R1-10 auth + mapping + roles + learning + probes + knowledge + SEO/search + content/distribution + inbox/after-hours + bounded-repair",
        message:
          "API surface includes bounded repair, after-hours inbox/takeover, content pipeline, SEO/search. Live CMS/GBP/social/inbox/Zoho NOT_WIRED. No live SERP/Trends.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/auth/login") {
    const raw = await readBody(req);
    let body: { username?: string; password?: string };
    try {
      body = JSON.parse(raw) as { username?: string; password?: string };
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const username = body.username ?? "";
    const password = body.password ?? "";
    const user = findActiveUser(runtime.store.read().users, username);
    if (!user || !verifyPassword(password, user.passwordVerifier)) {
      json(res, 401, { error: "INVALID_CREDENTIALS", message: "Login failed" }, cors);
      return;
    }
    const now = Date.now();
    const origin =
      typeof req.headers.origin === "string"
        ? req.headers.origin
        : runtime.consoleOrigin;
    const session: SessionRecord = {
      sessionId: `sess-${randomBytes(12).toString("hex")}`,
      userId: user.userId,
      username: user.username,
      role: user.role,
      csrfToken: randomBytes(16).toString("hex"),
      createdAtIso: new Date(now).toISOString(),
      expiresAtIso: new Date(now + runtime.sessionTtlMs).toISOString(),
      origin,
    };
    runtime.store.update((state) => ({
      ...state,
      sessions: [
        ...state.sessions.filter((s) => s.userId !== user.userId),
        session,
      ],
      auditEvents: [
        ...state.auditEvents,
        {
          eventId: `evt-${randomBytes(6).toString("hex")}`,
          actorUserId: user.userId,
          eventType: "login",
          detail: `User ${user.username} signed in`,
          createdAtIso: session.createdAtIso,
        },
      ],
      updatedAt: session.createdAtIso,
    }));
    json(
      res,
      200,
      {
        username: user.username,
        role: user.role,
        csrfToken: session.csrfToken,
        expiresAt: session.expiresAtIso,
      },
      {
        ...cors,
        "set-cookie": `ws_session=${encodeURIComponent(session.sessionId)}; Path=/; HttpOnly; SameSite=Lax`,
      },
    );
    return;
  }

  if (method === "POST" && url.pathname === "/auth/logout") {
    const cookies = parseCookies(req.headers.cookie);
    const sessionId = cookies["ws_session"];
    if (sessionId) {
      runtime.store.update((state) => ({
        ...state,
        sessions: state.sessions.filter((s) => s.sessionId !== sessionId),
        updatedAt: new Date().toISOString(),
      }));
    }
    json(
      res,
      200,
      { ok: true },
      {
        ...cors,
        "set-cookie":
          "ws_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
      },
    );
    return;
  }

  if (method === "GET" && url.pathname === "/auth/session") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { authenticated: false, error: result.code }, cors);
      return;
    }
    json(
      res,
      200,
      {
        authenticated: true,
        username: result.session.username,
        role: result.session.role,
        csrfToken: result.session.csrfToken,
        expiresAt: result.session.expiresAtIso,
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/authority/state") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const state = runtime.store.read();
    json(
      res,
      200,
      {
        operatingMode: state.ownerControls.operatingMode,
        outboundStopped: state.ownerControls.outboundStopped,
        role: result.session.role,
        standingPolicies: state.standingPolicies,
        capabilityGrants: state.capabilityGrants.map((g) => ({
          ...g,
        })),
        providerStatuses: state.providerStatuses,
        recentDecisions: state.policyDecisions.slice(-20),
        honestLabelsNote:
          "connected ≠ authorized ≠ verified. Provider adapters remain NOT_WIRED/FIXTURE in R1-03.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/authority/stop-switch") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "toggle_stop_switch")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Operator role cannot toggle the stop switch",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: { outboundStopped?: boolean };
    try {
      body = JSON.parse(raw) as { outboundStopped?: boolean };
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const outboundStopped = Boolean(body.outboundStopped);
    const nowIso = new Date().toISOString();
    runtime.store.update((state) => ({
      ...state,
      ownerControls: {
        outboundStopped,
        operatingMode: state.ownerControls.operatingMode,
        updatedAtIso: nowIso,
        updatedByUserId: result.session.userId,
      },
      auditEvents: [
        ...state.auditEvents,
        {
          eventId: `evt-${randomBytes(6).toString("hex")}`,
          actorUserId: result.session.userId,
          eventType: "stop_switch",
          detail: outboundStopped
            ? "Outbound writes stopped"
            : "Outbound writes resumed",
          createdAtIso: nowIso,
        },
      ],
      updatedAt: nowIso,
    }));
    json(res, 200, { outboundStopped }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/authority/operating-mode") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { operatingMode?: string };
    try {
      body = JSON.parse(raw) as { operatingMode?: string };
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const mode = body.operatingMode;
    if (
      mode !== OperatingMode.OBSERVE &&
      mode !== OperatingMode.OPERATE &&
      mode !== OperatingMode.MAINTENANCE
    ) {
      json(res, 400, { error: "INVALID_MODE" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    runtime.store.update((state) => ({
      ...state,
      ownerControls: {
        ...state.ownerControls,
        operatingMode: mode,
        updatedAtIso: nowIso,
        updatedByUserId: result.session.userId,
      },
      updatedAt: nowIso,
    }));
    json(res, 200, { operatingMode: mode }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/gateway/intents") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let intent: GatewayIntent;
    try {
      intent = JSON.parse(raw) as GatewayIntent;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const state = runtime.store.read();
    const mapping = runtime.mappingStore.read();
    // Actor role comes only from the authenticated session — never from intent body.
    const submitted = runtime.gateway.submitIntent(intent, {
      outboundStopped: state.ownerControls.outboundStopped,
      operatingMode: state.ownerControls.operatingMode,
      actorRole: result.session.role,
      policies: state.standingPolicies,
      grants: state.capabilityGrants,
      nowIso: new Date().toISOString(),
      productionMapping: mapping,
    });
    const decision: PolicyDecisionRecord = {
      decisionId: submitted.decision.decisionId,
      operationId: submitted.decision.operationId,
      payloadDigest: submitted.decision.payloadDigest,
      allowed: submitted.decision.allowed,
      code: submitted.decision.code,
      reason: submitted.decision.reason,
      grantId: submitted.decision.grantId,
      policyId: submitted.decision.policyId,
      decidedAtIso: submitted.decision.decidedAtIso,
    };
    runtime.store.update((s) => ({
      ...s,
      policyDecisions: [...s.policyDecisions, decision],
      updatedAt: decision.decidedAtIso,
    }));

    // Durable labeled outcome hook for a later learning-worker (no ML here).
    if (submitted.decision.writePathId) {
      const matchedPath = mapping.writePaths.find(
        (p) => p.writePathId === submitted.decision.writePathId,
      );
      const fixtureOnly = matchedPath
        ? writePathIsFixtureOnly(mapping, matchedPath)
        : true;
      const label = submitted.decision.allowed
        ? OutcomeLabel.UNKNOWN
        : OutcomeLabel.FAILURE;
      const source =
        submitted.decision.code === "OUTBOUND_STOPPED"
          ? OutcomeEvidenceSource.STOP_SWITCH
          : fixtureOnly
            ? OutcomeEvidenceSource.FIXTURE
            : OutcomeEvidenceSource.GATEWAY_RECEIPT;
      runtime.mappingStore.addWritePathOutcome(
        recordWritePathOutcome({
          outcomeId: `out-${submitted.decision.decisionId}`,
          writePathId: submitted.decision.writePathId,
          operationId: submitted.decision.operationId,
          label,
          source,
          summary: submitted.decision.reason,
          fixtureOnly,
          recordedAtIso: submitted.decision.decidedAtIso,
          featureHints: {
            allowed: submitted.decision.allowed,
            code: submitted.decision.code,
            outcome: submitted.decision.outcome,
          },
        }),
      );
    }

    json(
      res,
      submitted.decision.allowed ? 200 : 403,
      {
        decision: submitted.decision,
        note: "Acceptance is not verification. Live Zoho/CMS mutations are not performed in R1-03.",
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/broker/references") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code }, cors);
      return;
    }
    json(
      res,
      200,
      {
        references: runtime.broker.listReferences(),
        note: "Opaque references only; Claude runner cannot mint or reveal secrets.",
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/mapping/state") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const mapping = runtime.mappingStore.read();
    json(
      res,
      200,
      {
        mapping,
        bindingStatuses: mapping.bindings.map(bindingStatusView),
        adapters: listAdapters(),
        learningHook: {
          labeledOutcomes: listWritePathOutcomesForLearning(mapping, {
            includeFixture: true,
          }).length,
          note: "SUCCESS/FAILURE labels feed services/learning-worker (proposals under review).",
        },
        honestLabelsNote:
          "connected ≠ authorized ≠ verified. Fixture/NOT_WIRED ≠ live.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/seed-fixture-pilot") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    const upserted = upsertFixturePilotMapping(
      runtime.mappingStore.read(),
      nowIso,
    );
    runtime.mappingStore.write(upserted.state);
    json(
      res,
      200,
      {
        writePathId: upserted.writePathId,
        seeded: upserted.created,
        ownershipProven: false,
        readEvidencePresent: false,
        note: upserted.created
          ? "Fixture pilot upserted without wiping existing mappings. Ownership and read evidence still required before writes."
          : "Fixture pilot already present; existing mappings preserved.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/prove-fixture-pilot") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { writePathId?: string };
    try {
      body = JSON.parse(raw) as { writePathId?: string };
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const writePathId = body.writePathId;
    if (!writePathId) {
      json(res, 400, { error: "WRITE_PATH_REQUIRED" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    try {
      const proven = proveFixturePilotWritePath(
        runtime.mappingStore.read(),
        writePathId,
        nowIso,
      );
      runtime.mappingStore.write(proven);
      json(
        res,
        200,
        {
          writePathId,
          ownershipProven: true,
          readEvidenceCount: proven.readEvidence.filter(
            (e) => e.writePathId === writePathId,
          ).length,
          note: "Fixture read evidence recorded. Still not a live Zoho/CMS mutation.",
        },
        cors,
      );
    } catch (err) {
      json(
        res,
        400,
        {
          error: "PROVE_FAILED",
          message: err instanceof Error ? err.message : String(err),
        },
        cors,
      );
    }
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/bindings") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: Partial<SourceBinding>;
    try {
      body = JSON.parse(raw) as Partial<SourceBinding>;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.bindingId || !body.siteId || !body.kind || !body.resourceRef) {
      json(res, 400, { error: "BINDING_FIELDS_REQUIRED" }, cors);
      return;
    }
    if (body.adapterWiring === AdapterWiring.LIVE) {
      json(
        res,
        400,
        { error: "LIVE_REFUSED", message: "R1-03 refuses LIVE adapter wiring" },
        cors,
      );
      return;
    }
    const nowIso = new Date().toISOString();
    const binding: SourceBinding = {
      bindingId: body.bindingId,
      siteId: body.siteId,
      kind: body.kind,
      resourceRef: body.resourceRef,
      displayName: body.displayName ?? body.bindingId,
      identityLabel: body.identityLabel ?? null,
      connectionState: body.connectionState ?? ConnectionState.NOT_CONFIGURED,
      writeReadiness: body.writeReadiness ?? WriteReadiness.NOT_AUTHORIZED,
      verificationState: body.verificationState ?? VerificationState.NOT_VERIFIED,
      ownershipProven: false,
      observedRevision: body.observedRevision ?? null,
      adapterWiring: body.adapterWiring ?? AdapterWiring.NOT_WIRED,
      createdAtIso: body.createdAtIso ?? nowIso,
      updatedAtIso: nowIso,
    };
    // Validate kind enum without importing unused BindingKind if invalid
    if (
      binding.kind !== BindingKind.WEBSITE &&
      binding.kind !== BindingKind.CMS &&
      binding.kind !== BindingKind.REPO
    ) {
      json(res, 400, { error: "INVALID_BINDING_KIND" }, cors);
      return;
    }
    runtime.mappingStore.upsertBinding(binding);
    json(
      res,
      200,
      {
        binding,
        status: bindingStatusView(binding),
        note: "Registered binding only — not connected/authorized/verified.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/forms") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: Partial<FormMapping>;
    try {
      body = JSON.parse(raw) as Partial<FormMapping>;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (
      !body.formId ||
      !body.siteId ||
      !body.pageAssetId ||
      !body.bindingId ||
      !body.handlerEndpoint
    ) {
      json(res, 400, { error: "FORM_FIELDS_REQUIRED" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    const form: FormMapping = {
      formId: body.formId,
      siteId: body.siteId,
      pageAssetId: body.pageAssetId,
      bindingId: body.bindingId,
      handlerEndpoint: body.handlerEndpoint,
      crmModuleId: body.crmModuleId ?? null,
      fieldMap: body.fieldMap ?? {},
      ownershipOwner: body.ownershipOwner ?? ResourceOwnerSystem.WEBSITE,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    runtime.mappingStore.upsertForm(form);
    json(res, 200, { form }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/booking-ownership") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: Partial<BookingOwnership>;
    try {
      body = JSON.parse(raw) as Partial<BookingOwnership>;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (
      !body.bookingOwnershipId ||
      !body.siteId ||
      !body.providerId ||
      !body.resourceId
    ) {
      json(res, 400, { error: "BOOKING_FIELDS_REQUIRED" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    const record: BookingOwnership = {
      bookingOwnershipId: body.bookingOwnershipId,
      siteId: body.siteId,
      providerId: body.providerId,
      resourceId: body.resourceId,
      environment: body.environment ?? "fixture",
      ownerSystem: body.ownerSystem ?? ResourceOwnerSystem.BOOKING,
      ownershipProven: false,
      adapterWiring: body.adapterWiring ?? AdapterWiring.NOT_WIRED,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    runtime.mappingStore.upsertBookingOwnership(record);
    json(res, 200, { bookingOwnership: record }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/crm-ownership") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: Partial<CrmOwnership>;
    try {
      body = JSON.parse(raw) as Partial<CrmOwnership>;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.crmOwnershipId || !body.organizationId || !body.moduleId) {
      json(res, 400, { error: "CRM_FIELDS_REQUIRED" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    const record: CrmOwnership = {
      crmOwnershipId: body.crmOwnershipId,
      organizationId: body.organizationId,
      environment: body.environment ?? "fixture",
      moduleId: body.moduleId,
      fieldOwnership: body.fieldOwnership ?? [],
      testDataPolicy:
        body.testDataPolicy ?? "fixture-only; exclude from revenue reporting",
      ownershipProven: false,
      adapterWiring: body.adapterWiring ?? AdapterWiring.FIXTURE,
      createdAtIso: nowIso,
      updatedAtIso: nowIso,
    };
    runtime.mappingStore.upsertCrmOwnership(record);
    json(res, 200, { crmOwnership: record }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/write-paths") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: Partial<PilotWritePath>;
    try {
      body = JSON.parse(raw) as Partial<PilotWritePath>;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (
      !body.writePathId ||
      !body.channelId ||
      !body.assetId ||
      !body.operation ||
      !body.siteId
    ) {
      json(res, 400, { error: "WRITE_PATH_FIELDS_REQUIRED" }, cors);
      return;
    }
    let requiredEvidenceKinds;
    try {
      requiredEvidenceKinds = assertNonEmptyEvidenceKinds(
        body.requiredEvidenceKinds ?? [
          EvidenceKind.IDENTITY,
          EvidenceKind.RESOURCE,
          EvidenceKind.SCOPE,
          EvidenceKind.CAPABILITY_TEST,
          EvidenceKind.READ_BACK,
        ],
      );
    } catch (err) {
      json(
        res,
        400,
        {
          error: "EMPTY_EVIDENCE_KINDS",
          message: err instanceof Error ? err.message : String(err),
        },
        cors,
      );
      return;
    }
    const nowIso = new Date().toISOString();
    const path: PilotWritePath = {
      writePathId: body.writePathId,
      channelId: body.channelId,
      assetId: body.assetId,
      operation: body.operation,
      siteId: body.siteId,
      bindingId: body.bindingId ?? null,
      formId: body.formId ?? null,
      bookingOwnershipId: body.bookingOwnershipId ?? null,
      crmOwnershipId: body.crmOwnershipId ?? null,
      requiredEvidenceKinds,
      createdAtIso: nowIso,
    };
    runtime.mappingStore.upsertWritePath(path);
    json(res, 200, { writePath: path }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/journeys") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: Partial<JourneyRegistryEntry>;
    try {
      body = JSON.parse(raw) as Partial<JourneyRegistryEntry>;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.journeyId || !body.siteId || !body.displayName) {
      json(res, 400, { error: "JOURNEY_FIELDS_REQUIRED" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    const journey: JourneyRegistryEntry = {
      journeyId: body.journeyId,
      siteId: body.siteId,
      displayName: body.displayName,
      stages: body.stages ?? [],
      writePathIds: body.writePathIds ?? [],
      createdAtIso: nowIso,
    };
    runtime.mappingStore.upsertJourney(journey);
    json(res, 200, { journey }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/read-evidence") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      evidenceId?: string;
      writePathId?: string;
      evidenceKind?: string;
      resourceType?: "binding" | "form" | "booking" | "crm" | "journey";
      resourceId?: string;
      operation?: string;
      summary?: string;
      proveBindingOwnership?: boolean;
      identityLabel?: string;
      observedRevision?: string | null;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (
      !body.evidenceId ||
      !body.writePathId ||
      !body.evidenceKind ||
      !body.resourceType ||
      !body.resourceId ||
      !body.operation ||
      !body.summary
    ) {
      json(res, 400, { error: "EVIDENCE_FIELDS_REQUIRED" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    try {
      const evidence = createReadEvidence({
        evidenceId: body.evidenceId,
        writePathId: body.writePathId,
        evidenceKind: body.evidenceKind as (typeof EvidenceKind)[keyof typeof EvidenceKind],
        resourceType: body.resourceType,
        resourceId: body.resourceId,
        operation: body.operation,
        summary: body.summary,
        fixtureOnly: true,
        observedAtIso: nowIso,
        adapterWiring: AdapterWiring.FIXTURE,
      });
      runtime.mappingStore.addReadEvidence(evidence);
      if (
        body.proveBindingOwnership &&
        body.resourceType === "binding" &&
        body.identityLabel
      ) {
        const current = runtime.mappingStore.read();
        const binding = current.bindings.find(
          (b) => b.bindingId === body.resourceId,
        );
        if (binding) {
          runtime.mappingStore.upsertBinding(
            applyBindingReadEvidence(binding, {
              identityLabel: body.identityLabel,
              observedRevision: body.observedRevision ?? null,
              ownershipProven: true,
              nowIso,
            }),
          );
        }
      }
      json(
        res,
        200,
        {
          evidence,
          note: "Fixture read evidence only — does not authorize live provider writes by itself.",
        },
        cors,
      );
    } catch (err) {
      json(
        res,
        400,
        {
          error: "EVIDENCE_REJECTED",
          message: err instanceof Error ? err.message : String(err),
        },
        cors,
      );
    }
    return;
  }

  if (method === "GET" && url.pathname === "/roles/state") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const state = runtime.roleRuntimeStore.read();
    const cli = await runtime.runner.detectCli();
    json(
      res,
      200,
      {
        contracts: listAgentRoleContracts().map((c) => ({
          roleId: c.roleId,
          name: c.name,
          group: c.group,
          version: c.version,
          evaluationSuiteId: c.evaluationSuiteId,
          mayIssueReviewVerdicts: c.mayIssueReviewVerdicts,
          independentReviewerRoleId: c.independentReviewerRoleId,
        })),
        roles: state.roles,
        recentRuns: state.runs.slice(0, 20),
        learningOutcomes: state.outcomes.slice(0, 20),
        temporalWiring: state.temporalWiring,
        cli,
        budget: runtime.runner.getBudgetAccount(),
        honestLabelsNote:
          "Fixture / NOT_WIRED ≠ live Claude fleet. permissionBypassUsed is always false. Outcome labels feed learning-worker proposals under review.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/roles/evaluate-fixture") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const results = await runtime.runner.evaluateAllRolesFixture();
    for (const run of results) {
      runtime.roleRuntimeStore.recordRun(
        {
          runId: run.runId,
          jobId: run.jobId,
          roleId: run.roleId,
          workflowId: `fixture-wf-${run.roleId}`,
          status: run.status,
          executionMode: run.executionMode,
          summary: run.summary,
          artifactIds: run.output?.artifactIds ?? [],
          cliVersion: run.cliDetection.version,
          modelId: run.modelId,
          permissionBypassUsed: false,
          startedAtIso: run.startedAtIso,
          finishedAtIso: run.finishedAtIso,
          costMinor: run.costMinor,
          costKind: run.costKind,
          budgetReservationId: run.budgetReservationId,
        },
        run.outcome,
      );
    }
    json(
      res,
      200,
      {
        evaluated: results.length,
        temporalStatus: "NOT_WIRED",
        results: results.map((r) => ({
          roleId: r.roleId,
          status: r.status,
          executionMode: r.executionMode,
          summary: r.summary,
          outcomeLabel: r.outcome.label,
          costMinor: r.costMinor,
          costKind: r.costKind,
        })),
        note: "Offline fixture evaluation for all 30 roles. Temporal remains NOT_WIRED.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/roles/run") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      roleId?: string;
      trigger?: string;
      assetId?: string;
      attemptSelfApproval?: boolean;
      attemptUnauthorizedEffect?: boolean;
      attemptUncontrolledRecursion?: boolean;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.roleId || !isAgentRoleId(body.roleId)) {
      json(res, 400, { error: "INVALID_ROLE_ID" }, cors);
      return;
    }
    const jobId = `job-${randomBytes(8).toString("hex")}`;
    // JobEnvelope requires UUID — mint one.
    const uuid = (() => {
      const bytes = randomBytes(16);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = bytes.toString("hex");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    })();
    const mission = await runtime.missions.enqueue({
      envelope: {
        jobId: uuid,
        roleId: body.roleId,
        workflowId: `api-${jobId}`,
        siteId: "worksocial",
        assetId: body.assetId ?? `asset-${body.roleId}`,
        trigger: body.trigger ?? "api_manual_run",
        policyVersion: "r1-04",
        inputArtifactIds: [],
        capabilityGrantId: "api-fixture-grant",
        sourceRevision: "api",
        maxAttempts: 1,
        deadlineSeconds: 120,
        idempotencyKey: `api/${body.roleId}/${uuid}`,
        expectedOutcome: "typed-result",
      },
    });
    // Optional denial probes (contract/demo only) — re-run through runner when requested.
    let run = mission.run;
    if (
      run &&
      (body.attemptSelfApproval ||
        body.attemptUnauthorizedEffect ||
        body.attemptUncontrolledRecursion)
    ) {
      const probeEnvelope = {
        jobId: uuid,
        roleId: body.roleId,
        workflowId: `api-${jobId}`,
        siteId: "worksocial",
        assetId: body.assetId ?? `asset-${body.roleId}`,
        trigger: body.trigger ?? "api_manual_run",
        policyVersion: "r1-04",
        inputArtifactIds: [] as string[],
        capabilityGrantId: "api-fixture-grant",
        sourceRevision: "api",
        maxAttempts: 1,
        deadlineSeconds: 120,
        idempotencyKey: `api/${body.roleId}/${uuid}-probe`,
        expectedOutcome: "typed-result",
      };
      run = await runtime.runner.enqueue({
        envelope: probeEnvelope,
        ...(body.attemptSelfApproval !== undefined
          ? { attemptSelfApproval: body.attemptSelfApproval }
          : {}),
        ...(body.attemptUnauthorizedEffect !== undefined
          ? { attemptUnauthorizedEffect: body.attemptUnauthorizedEffect }
          : {}),
        ...(body.attemptUncontrolledRecursion !== undefined
          ? {
              attemptUncontrolledRecursion: body.attemptUncontrolledRecursion,
            }
          : {}),
      });
    }
    if (run) {
      runtime.roleRuntimeStore.recordRun(
        {
          runId: run.runId,
          jobId: run.jobId,
          roleId: run.roleId,
          workflowId: mission.workflowId,
          status: run.status,
          executionMode: run.executionMode,
          summary: run.summary,
          artifactIds: run.output?.artifactIds ?? [],
          cliVersion: run.cliDetection.version,
          modelId: run.modelId,
          permissionBypassUsed: false,
          startedAtIso: run.startedAtIso,
          finishedAtIso: run.finishedAtIso,
          costMinor: run.costMinor,
          costKind: run.costKind,
          budgetReservationId: run.budgetReservationId,
        },
        run.outcome,
      );
    }
    json(
      res,
      200,
      {
        mission: {
          accepted: mission.accepted,
          temporalStatus: mission.temporalStatus,
          detail: mission.detail,
          workflowId: mission.workflowId,
        },
        run: run
          ? {
              runId: run.runId,
              roleId: run.roleId,
              status: run.status,
              executionMode: run.executionMode,
              summary: run.summary,
              deniedEffects: run.deniedEffects,
              deniedDelegations: run.deniedDelegations,
              outcomeLabel: run.outcome.label,
              permissionBypassUsed: run.permissionBypassUsed,
            }
          : null,
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/mapping/outcomes") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(res, 403, { error: "FORBIDDEN" }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      outcomeId?: string;
      writePathId?: string;
      operationId?: string;
      label?: string;
      source?: string;
      summary?: string;
      fixtureOnly?: boolean;
      featureHints?: Record<string, string | number | boolean | null>;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (
      !body.outcomeId ||
      !body.writePathId ||
      !body.operationId ||
      !body.label ||
      !body.source ||
      !body.summary
    ) {
      json(res, 400, { error: "OUTCOME_FIELDS_REQUIRED" }, cors);
      return;
    }
    if (
      body.label !== OutcomeLabel.SUCCESS &&
      body.label !== OutcomeLabel.FAILURE &&
      body.label !== OutcomeLabel.UNKNOWN
    ) {
      json(res, 400, { error: "INVALID_OUTCOME_LABEL" }, cors);
      return;
    }
    if (!isOutcomeEvidenceSource(body.source)) {
      json(res, 400, { error: "INVALID_OUTCOME_SOURCE" }, cors);
      return;
    }
    const mapping = runtime.mappingStore.read();
    const path = mapping.writePaths.find((p) => p.writePathId === body.writePathId);
    if (!path) {
      json(res, 400, { error: "UNKNOWN_WRITE_PATH" }, cors);
      return;
    }
    const knownOperation =
      runtime.gateway.getDecision(body.operationId) !== undefined ||
      runtime.store
        .read()
        .policyDecisions.some((d) => d.operationId === body.operationId);
    // Owner/fixture labels may introduce a synthetic operation id; others need a ledger hit.
    if (
      !knownOperation &&
      body.source !== OutcomeEvidenceSource.OWNER_DECISION &&
      body.source !== OutcomeEvidenceSource.FIXTURE
    ) {
      json(res, 400, { error: "UNKNOWN_OPERATION" }, cors);
      return;
    }
    const nowIso = new Date().toISOString();
    try {
      const outcome = recordWritePathOutcome({
        outcomeId: body.outcomeId,
        writePathId: body.writePathId,
        operationId: body.operationId,
        label: body.label,
        source: body.source,
        summary: body.summary,
        fixtureOnly:
          body.fixtureOnly ?? writePathIsFixtureOnly(mapping, path),
        recordedAtIso: nowIso,
        ...(body.featureHints !== undefined
          ? { featureHints: body.featureHints }
          : {}),
      });
      runtime.mappingStore.addWritePathOutcome(outcome);
      json(
        res,
        200,
        {
          outcome,
          note: "Labeled outcome stored for learning-worker consumption. Training is proposals-only under review.",
        },
        cors,
      );
    } catch (err) {
      json(
        res,
        400,
        {
          error: "OUTCOME_REJECTED",
          message: err instanceof Error ? err.message : String(err),
        },
        cors,
      );
    }
    return;
  }

  if (method === "GET" && url.pathname === "/learning/status") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const status = runtime.learningWorker.status();
    json(
      res,
      200,
      {
        ...status,
        principal: runtime.learningWorker.principal,
        hasActionGatewayWritePrincipal:
          runtime.learningWorker.hasActionGatewayWritePrincipal,
        hasProductionEffectCredentials:
          runtime.learningWorker.hasProductionEffectCredentials,
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/learning/models") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      {
        models: listPinnedModels(),
        note: "Pinned open-source local models (BSD-3-Clause sklearn-compatible). Offline fixture mode — no weight download required in CI.",
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/learning/runs") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const state = runtime.learningStore.read();
    json(
      res,
      200,
      {
        runs: state.runs.slice(0, 20).map((run) => ({
          runId: run.runId,
          startedAtIso: run.startedAtIso,
          finishedAtIso: run.finishedAtIso,
          runtimeMode: run.runtimeMode,
          metrics: run.metrics,
          proposalIds: run.proposalIds,
          note: run.note,
        })),
        lastTrainingRunMetrics: state.runs[0]?.metrics ?? null,
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/learning/proposals") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const status = runtime.learningWorker.status();
    json(
      res,
      200,
      {
        awaitingReview: status.awaitingReview,
        note: "Proposals only. Cannot expand grants/spend/CRM/publish authority.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/learning/train") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Training requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const trained = runtime.learningWorker.trainFromLedgers({
      mapping: runtime.mappingStore.read(),
      roleOutcomes: runtime.roleRuntimeStore.listOutcomesForLearning(),
      // Content/SEO outcomes wire in, but fixtures stay excluded by default.
      extraWritePathOutcomes: [
        ...runtime.seo.listLearningOutcomes(false),
        ...runtime.content.listLearningOutcomes(false),
        ...runtime.repair.listLearningOutcomes(false),
      ],
      includeFixture: false,
    });
    json(
      res,
      200,
      {
        run: {
          runId: trained.run.runId,
          runtimeMode: trained.run.runtimeMode,
          metrics: trained.run.metrics,
          note: trained.run.note,
        },
        proposals: trained.proposals.map((p) => ({
          proposalId: p.proposalId,
          artifactVersion: p.artifactVersion,
          kind: p.kind,
          status: p.status,
          authorityImpact: p.authorityImpact,
          summary: p.summary,
        })),
        exampleCount: trained.examples.length,
        honestNote:
          "Offline metrics only. Not production-canary-verified. Proposals await review.",
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/probes/status") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const status = runtime.probes.status();
    const last = runtime.probes.lastEvidence();
    json(
      res,
      200,
      {
        ...status,
        lastEvidence: last,
        note: status.honestNote,
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/probes/runs") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      {
        runs: runtime.probes.listRuns(50),
        lastEvidence: runtime.probes.lastEvidence(),
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/probes/run-http") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { targetId?: string; mode?: string; liveUrl?: string } = {};
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const mode =
      body.mode === ProbeMode.LIVE ? ProbeMode.LIVE : ProbeMode.FIXTURE;
    const run = await runtime.probes.runHttp({
      mode,
      ...(body.targetId !== undefined ? { targetId: body.targetId } : {}),
      ...(body.liveUrl !== undefined ? { liveUrl: body.liveUrl } : {}),
    });
    json(res, 200, { run, note: "Fixture HTTP by default; live needs liveUrl." }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/probes/run-dom") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { targetId?: string; mode?: string } = {};
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const mode =
      body.mode === ProbeMode.LIVE ? ProbeMode.LIVE : ProbeMode.FIXTURE;
    const run = await runtime.probes.runDom({
      mode,
      ...(body.targetId !== undefined ? { targetId: body.targetId } : {}),
    });
    json(
      res,
      200,
      {
        run,
        note: "Fixture DOM journey by default. Live Playwright remains NOT_WIRED without binding.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/probes/run-form-canary") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Form canary requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: {
      writePathId?: string;
      liveZoho?: boolean;
      ensureFixturePilot?: boolean;
      clearUnresolvedBlock?: boolean;
    } = {};
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }

    const nowIso = new Date().toISOString();
    // Ensure fixture pilot + canary grant exist for offline demos.
    // Merge via upsert — never wipe existing mapping records.
    if (body.ensureFixturePilot !== false) {
      let mapping = runtime.mappingStore.read();
      const upserted = upsertFixturePilotMapping(mapping, nowIso);
      mapping = upserted.state;
      const pathId = body.writePathId ?? upserted.writePathId;
      if (
        pathId &&
        !mapping.readEvidence.some((e) => e.writePathId === pathId)
      ) {
        try {
          mapping = proveFixturePilotWritePath(mapping, pathId, nowIso);
        } catch {
          // leave mapping as-is; canary will fail closed
        }
      }
      runtime.mappingStore.write(mapping);

      const auth = runtime.store.read();
      if (
        !auth.capabilityGrants.some(
          (g) => g.grantId === "grant-demo-form-canary",
        )
      ) {
        const { policy, grant } = createDemoCanaryGrant(nowIso);
        runtime.store.update((state) => ({
          ...state,
          standingPolicies: [
            ...state.standingPolicies.filter(
              (p) => p.policyId !== policy.policyId,
            ),
            policy,
          ],
          capabilityGrants: [
            ...state.capabilityGrants.filter(
              (g) => g.grantId !== grant.grantId,
            ),
            grant,
          ],
          updatedAt: nowIso,
        }));
      }
    }

    const authState = runtime.store.read();
    const mapping = runtime.mappingStore.read();
    const canary = runtime.probes.runFormCanary({
      authority: {
        outboundStopped: authState.ownerControls.outboundStopped,
        operatingMode: authState.ownerControls.operatingMode,
        actorRole: result.session.role,
        policies: authState.standingPolicies,
        grants: authState.capabilityGrants,
        productionMapping: mapping,
      },
      ...(body.writePathId !== undefined
        ? { writePathId: body.writePathId }
        : {}),
      ...(body.liveZoho === true ? { liveZoho: true } : {}),
      ...(body.clearUnresolvedBlock === true
        ? { clearUnresolvedBlock: true }
        : {}),
      gateway: runtime.gateway,
      nowIso,
      targetAccountId: "acct-fixture-canary",
    });

    if (canary.gatewayDecision) {
      const decision: PolicyDecisionRecord = {
        decisionId: canary.gatewayDecision.decisionId,
        operationId: canary.gatewayDecision.operationId,
        payloadDigest: canary.gatewayDecision.payloadDigest,
        allowed: canary.gatewayDecision.allowed,
        code: canary.gatewayDecision.code,
        reason: canary.gatewayDecision.reason,
        grantId: canary.gatewayDecision.grantId,
        policyId: canary.gatewayDecision.policyId,
        decidedAtIso: canary.gatewayDecision.decidedAtIso,
      };
      runtime.store.update((s) => ({
        ...s,
        policyDecisions: [...s.policyDecisions, decision],
        updatedAt: decision.decidedAtIso,
      }));
    }

    const note =
      body.liveZoho === true || canary.run.verdict === ProbeVerdict.NOT_WIRED
        ? "Live Zoho is NOT_WIRED without owner credentials."
        : canary.gatewayCode === "BLOCKS_RETRY"
          ? `Canary blocked: prior unresolved reconciliation (blocksRetry). Pass clearUnresolvedBlock=true after investigating.`
          : canary.gatewayCode === "WRITE_PATH_MISSING"
            ? `Canary ${canary.run.verdict}: write path missing or unknown.`
            : canary.receipt && canary.run.verdict === ProbeVerdict.SUCCESS
              ? "Fixture canary matched correlated receipt. Synthetic leads excluded from commercial totals. Outcome labeled fixtureOnly for learning."
              : `Canary ${canary.run.verdict}${canary.receipt ? " with receipt" : " without receipt"}. ${canary.details[0] ?? ""}`.trim();

    json(
      res,
      200,
      {
        run: canary.run,
        intent: canary.intent,
        receipt: canary.receipt,
        outcome: canary.outcome,
        gatewayAllowed: canary.gatewayAllowed,
        gatewayCode: canary.gatewayCode,
        details: canary.details,
        note,
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/knowledge/status") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const status = runtime.knowledge.status();
    json(
      res,
      200,
      {
        ...status,
        note: status.honestNote,
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/knowledge/facts") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      {
        facts: runtime.knowledge.listFacts(100),
        labels: Object.values(SupportLabel),
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/knowledge/demand") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      {
        demandSignals: runtime.knowledge.listDemandSignals(100),
        kinds: Object.values(DemandSignalKind),
        labels: Object.values(SupportLabel),
      },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/knowledge/ingestions") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      { ingestions: runtime.knowledge.listIngestions(100) },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/knowledge/seed-fixtures") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const seed = runtime.knowledge.seedFixtures();
    json(
      res,
      200,
      {
        facts: seed.facts,
        demandSignals: seed.demandSignals,
        note: "Fixture corpus only. Live SERP/Trends remain NOT_WIRED. Model claims stay HYPOTHESIS.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/knowledge/facts") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return;
    }
    const body = parsed.value;
    const statement =
      typeof body.statement === "string" ? body.statement : "";
    if (!statement.trim()) {
      json(res, 400, { error: "STATEMENT_REQUIRED" }, cors);
      return;
    }
    const collectionMethod =
      typeof body.collectionMethod === "string" ? body.collectionMethod : "";
    if (!isCollectionMethod(collectionMethod)) {
      json(res, 400, { error: "INVALID_COLLECTION_METHOD" }, cors);
      return;
    }
    let requestedLabel: SupportLabelValue | null = null;
    if (body.requestedLabel !== undefined && body.requestedLabel !== null) {
      if (
        typeof body.requestedLabel !== "string" ||
        !isSupportLabel(body.requestedLabel)
      ) {
        json(res, 400, { error: "INVALID_REQUESTED_LABEL" }, cors);
        return;
      }
      requestedLabel = body.requestedLabel;
    }
    const nowIso = new Date().toISOString();
    const rawEvidence = Array.isArray(body.evidenceLinks)
      ? body.evidenceLinks
      : [];
    const evidenceLinks: Array<{
      evidenceId: string;
      sourceRef: string;
      collectionMethod: CollectionMethodValue;
      summary: string;
      observedAtIso: string;
      fixtureOnly: boolean;
    }> = [];
    for (const entry of rawEvidence) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        json(res, 400, { error: "INVALID_EVIDENCE_LINK" }, cors);
        return;
      }
      const e = entry as Record<string, unknown>;
      const sourceRef =
        typeof e.sourceRef === "string" ? e.sourceRef.trim() : "";
      if (!sourceRef) {
        json(res, 400, { error: "EMPTY_EVIDENCE_SOURCE_REF" }, cors);
        return;
      }
      if (
        typeof e.collectionMethod !== "string" ||
        !isCollectionMethod(e.collectionMethod)
      ) {
        json(res, 400, { error: "INVALID_EVIDENCE_COLLECTION_METHOD" }, cors);
        return;
      }
      evidenceLinks.push({
        evidenceId:
          typeof e.evidenceId === "string" && e.evidenceId.trim()
            ? e.evidenceId.trim()
            : `ev-${randomBytes(4).toString("hex")}`,
        sourceRef,
        collectionMethod: e.collectionMethod,
        summary:
          typeof e.summary === "string" && e.summary.trim()
            ? e.summary.trim()
            : "Evidence link",
        observedAtIso:
          typeof e.observedAtIso === "string" ? e.observedAtIso : nowIso,
        fixtureOnly: e.fixtureOnly !== false,
      });
    }

    const registeredBy =
      result.session.role === LocalRole.OPERATOR ? "operator" : "owner";
    const sourceSystem =
      typeof body.sourceSystem === "string" && body.sourceSystem.trim()
        ? body.sourceSystem.trim()
        : result.session.username;

    const registered = runtime.knowledge.registerFact({
      statement,
      requestedLabel,
      collectionMethod,
      sourceSystem,
      modelGenerated: body.modelGenerated === true,
      evidenceLinks,
      strictSupported: body.strictSupported === true,
      registeredBy,
      nowIso,
    });
    json(
      res,
      registered.ok ? 200 : 400,
      {
        ok: registered.ok,
        fact: registered.fact,
        code: registered.code,
        downgraded: registered.downgraded,
        reasons: registered.reasons,
        note: registered.ok
          ? registered.fact?.supportLabel === SupportLabel.HYPOTHESIS
            ? "Registered as HYPOTHESIS — model/unsourced claims are never facts."
            : `Registered as ${registered.fact?.supportLabel}.`
          : "Rejected — cannot treat unsourced claim as SUPPORTED fact.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/knowledge/ingest-claim") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return;
    }
    const body = parsed.value;
    const statement =
      typeof body.statement === "string" ? body.statement : "";
    if (!statement.trim()) {
      json(res, 400, { error: "STATEMENT_REQUIRED" }, cors);
      return;
    }
    const ingested = runtime.knowledge.ingestUnsourcedClaim({
      statement,
      ...(typeof body.sourceSystem === "string"
        ? { sourceSystem: body.sourceSystem }
        : {}),
      modelGenerated: body.modelGenerated !== false,
    });
    json(
      res,
      200,
      {
        ...ingested,
        note: "Unsourced/model claims enter as HYPOTHESIS only until evidence exists.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/knowledge/ingest-instruction") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return;
    }
    const body = parsed.value;
    const sourcePath =
      typeof body.sourcePath === "string" ? body.sourcePath : "";
    if (!sourcePath.trim()) {
      json(res, 400, { error: "SOURCE_PATH_REQUIRED" }, cors);
      return;
    }
    const content =
      typeof body.content === "string" ? body.content : undefined;
    const checksum =
      typeof body.checksum === "string" ? body.checksum : undefined;
    const ingested = runtime.knowledge.ingestInstruction({
      sourcePath,
      ...(content !== undefined ? { content } : {}),
      ...(checksum !== undefined ? { checksum } : {}),
      fixtureOnly: true,
    });
    if (!ingested.ok) {
      json(
        res,
        400,
        { error: ingested.code, reasons: ingested.reasons },
        cors,
      );
      return;
    }
    json(
      res,
      200,
      {
        ingestion: ingested.record,
        note: "Incoming documents are evidence, not executable instructions. Checksum is from content or verified caller digest.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/knowledge/demand") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return;
    }
    const body = parsed.value;
    const kindValues = Object.values(DemandSignalKind) as string[];
    const kind = typeof body.kind === "string" ? body.kind : "";
    if (!kindValues.includes(kind)) {
      json(res, 400, { error: "INVALID_DEMAND_KIND" }, cors);
      return;
    }
    const queryOrTopic =
      typeof body.queryOrTopic === "string" ? body.queryOrTopic : "";
    if (!queryOrTopic.trim()) {
      json(res, 400, { error: "QUERY_REQUIRED" }, cors);
      return;
    }
    const collectionMethod =
      typeof body.collectionMethod === "string" ? body.collectionMethod : "";
    if (!isCollectionMethod(collectionMethod)) {
      json(res, 400, { error: "INVALID_COLLECTION_METHOD" }, cors);
      return;
    }
    let requestedLabel: SupportLabelValue | null = null;
    if (body.requestedLabel !== undefined && body.requestedLabel !== null) {
      if (
        typeof body.requestedLabel !== "string" ||
        !isSupportLabel(body.requestedLabel)
      ) {
        json(res, 400, { error: "INVALID_REQUESTED_LABEL" }, cors);
        return;
      }
      requestedLabel = body.requestedLabel;
    }
    const missingStates = ["complete", "partial", "omitted", "unknown"] as const;
    const missingDataState = missingStates.includes(
      body.missingDataState as (typeof missingStates)[number],
    )
      ? (body.missingDataState as (typeof missingStates)[number])
      : "unknown";

    const obs = runtime.knowledge.registerDemand({
      kind: kind as DemandSignalKindValue,
      queryOrTopic,
      collectionMethod,
      sourceSystem:
        typeof body.sourceSystem === "string" && body.sourceSystem.trim()
          ? body.sourceSystem.trim()
          : "owner",
      requestedLabel,
      sampleSize: typeof body.sampleSize === "number" ? body.sampleSize : null,
      missingDataState,
      modelGenerated: body.modelGenerated === true,
      fixtureOnly: body.fixtureOnly !== false,
    });
    json(
      res,
      200,
      {
        demandSignal: obs,
        note: `Labeled ${obs.supportLabel}. Live SERP/Trends NOT_WIRED.`,
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/knowledge/verify-fact") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Fact verification requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return;
    }
    const body = parsed.value;
    const factId = typeof body.factId === "string" ? body.factId : "";
    if (!factId.trim()) {
      json(res, 400, { error: "FACT_ID_REQUIRED" }, cors);
      return;
    }
    if (
      body.decision !== FactVerificationDecision.CONFIRMED &&
      body.decision !== FactVerificationDecision.REFUTED
    ) {
      json(res, 400, { error: "INVALID_DECISION" }, cors);
      return;
    }
    const verified = runtime.knowledge.verifyFact({
      factId,
      decision: body.decision,
      summary:
        typeof body.summary === "string" && body.summary.trim()
          ? body.summary.trim()
          : `Owner ${body.decision.toLowerCase()} fact`,
      // Owner decisions are real outcomes unless the caller opts into fixtureOnly.
      fixtureOnly: body.fixtureOnly === true,
      source: "owner_decision",
    });
    if (!verified.fact) {
      json(res, 404, { error: "FACT_NOT_FOUND", reasons: verified.reasons }, cors);
      return;
    }
    json(
      res,
      200,
      {
        fact: verified.fact,
        outcome: verified.outcome,
        reasons: verified.reasons,
        note: verified.outcome?.fixtureOnly
          ? "Learning hook recorded fixtureOnly SUCCESS/FAILURE. Does not expand grants or authority."
          : "Learning hook recorded owner SUCCESS/FAILURE (not fixtureOnly). Does not expand grants or authority.",
      },
      cors,
    );
    return;
  }

  // --- R1-07 SEO and search ---

  if (method === "GET" && url.pathname === "/seo/status") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const status = runtime.seo.status();
    json(res, 200, { ...status, note: status.honestNote }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/seo/audits") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { audits: runtime.seo.listAudits(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/seo/proposals") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { proposals: runtime.seo.listProposals(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/seo/schema-validations") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      { validations: runtime.seo.listSchemaValidations(100) },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/seo/seed-fixtures") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    // Ensure knowledge fixtures exist so fact labels are registry-backed.
    runtime.knowledge.seedFixtures();
    const seed = runtime.seo.seedFixtures();
    json(
      res,
      200,
      {
        ...seed,
        note: "Seeded golden page audits/proposals/catalog without clobbering progressed proposals. Live CMS still NOT_WIRED.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/seo/ensure-fixture-mapping") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "SEO fixture mapping requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const nowIso = new Date().toISOString();
    let mapping = runtime.mappingStore.read();
    const upserted = upsertFixtureSeoMapping(mapping, nowIso);
    mapping = upserted.state;
    const pathId = upserted.writePathId;
    if (!mapping.readEvidence.some((e) => e.writePathId === pathId)) {
      mapping = proveFixtureSeoWritePath(mapping, nowIso);
    }
    runtime.mappingStore.write(mapping);
    json(
      res,
      200,
      {
        writePathId: pathId,
        created: upserted.created,
        note: "Persisted SEO pilot write path + fixture read evidence in mappingStore.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/seo/audits") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      pageAssetId?: string;
      siteId?: string;
      pagePath?: string;
      displayName?: string;
      findings?: unknown;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.pageAssetId || !body.siteId || !body.pagePath || !body.displayName) {
      json(res, 400, { error: "MISSING_FIELDS" }, cors);
      return;
    }
    const audit = runtime.seo.createAudit({
      pageAssetId: body.pageAssetId,
      siteId: body.siteId,
      pagePath: body.pagePath,
      displayName: body.displayName,
      findings: Array.isArray(body.findings) ? (body.findings as never[]) : [],
    });
    json(res, 200, { audit }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/seo/proposals") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      pageAssetId?: string;
      pageAuditId?: string;
      changeKind?: string;
      title?: string;
      summary?: string;
      proposedFields?: Record<string, string>;
      citedFactIds?: string[];
      hypothesisFactIds?: string[];
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const kinds = Object.values(SeoChangeKind) as string[];
    if (
      !body.pageAssetId ||
      !body.title ||
      !body.summary ||
      !body.changeKind ||
      !kinds.includes(body.changeKind)
    ) {
      json(res, 400, { error: "MISSING_OR_INVALID_FIELDS" }, cors);
      return;
    }
    const proposal = runtime.seo.createProposal({
      pageAssetId: body.pageAssetId,
      pageAuditId: body.pageAuditId ?? null,
      changeKind: body.changeKind as SeoChangeKindValue,
      title: body.title,
      summary: body.summary,
      proposedFields: body.proposedFields ?? {},
      ...(body.citedFactIds !== undefined
        ? { citedFactIds: body.citedFactIds }
        : {}),
      ...(body.hypothesisFactIds !== undefined
        ? { hypothesisFactIds: body.hypothesisFactIds }
        : {}),
    });
    json(
      res,
      200,
      {
        proposal,
        note: "Client-created proposals are always draft; approval/release/verify are controlled transitions.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/seo/validate-schema") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      pageAssetId?: string;
      proposalId?: string;
      nodes?: unknown;
      visibleContent?: string;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.pageAssetId) {
      json(res, 400, { error: "MISSING_FIELDS" }, cors);
      return;
    }
    const parsed = parseSchemaNodes(body.nodes);
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_NODES", reasons: parsed.reasons }, cors);
      return;
    }
    const validated = runtime.seo.validateSchema({
      pageAssetId: body.pageAssetId,
      proposalId: body.proposalId ?? null,
      nodes: parsed.nodes,
      ...(body.visibleContent !== undefined
        ? { visibleContent: body.visibleContent }
        : {}),
      factLabels: factLabelsFromKnowledge(runtime.knowledge),
    });
    if (!validated.ok) {
      json(res, 400, validated, cors);
      return;
    }
    json(res, 200, { validation: validated.validation }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/seo/review-proposal") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { proposalId?: string; schemaValidationId?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.proposalId) {
      json(res, 400, { error: "MISSING_PROPOSAL_ID" }, cors);
      return;
    }
    const reviewed = runtime.seo.reviewProposal({
      proposalId: body.proposalId,
      factLabels: factLabelsFromKnowledge(runtime.knowledge),
      schemaValidationId: body.schemaValidationId ?? null,
    });
    json(res, 200, reviewed, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/seo/approve-proposal") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { proposalId?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.proposalId) {
      json(res, 400, { error: "MISSING_PROPOSAL_ID" }, cors);
      return;
    }
    const approved = runtime.seo.approveProposal({
      proposalId: body.proposalId,
      factLabels: factLabelsFromKnowledge(runtime.knowledge),
    });
    json(res, approved.ok ? 200 : 400, approved, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/seo/search") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { rawQuery?: string; query?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const rawQuery = (body.rawQuery ?? body.query ?? "").trim();
    if (!rawQuery) {
      json(res, 400, { error: "MISSING_QUERY" }, cors);
      return;
    }
    const search = runtime.seo.semanticSearch({ rawQuery });
    if (!search.ok) {
      json(res, 400, search, cors);
      return;
    }
    json(res, 200, search, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/seo/release-pilot") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "SEO pilot release requires administrator manage_standing_policies (and capability grant management)",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: { proposalId?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.proposalId) {
      json(res, 400, { error: "MISSING_PROPOSAL_ID" }, cors);
      return;
    }

    const nowIso = new Date().toISOString();
    const demo = createDemoPublishGrant(nowIso);
    const auth = runtime.store.read();
    if (!auth.capabilityGrants.some((g) => g.grantId === demo.grant.grantId)) {
      // Administrator already gated above — may mint fixture publish grant.
      runtime.store.update((state) => ({
        ...state,
        standingPolicies: [
          ...state.standingPolicies.filter(
            (p) => p.policyId !== demo.policy.policyId,
          ),
          demo.policy,
        ],
        capabilityGrants: [
          ...state.capabilityGrants.filter(
            (g) => g.grantId !== demo.grant.grantId,
          ),
          demo.grant,
        ],
        updatedAt: nowIso,
      }));
    }

    const authorityState = runtime.store.read();
    const productionMapping = runtime.mappingStore.read();

    const released = runtime.seo.releasePilotPage({
      proposalId: body.proposalId,
      authority: {
        outboundStopped: authorityState.ownerControls.outboundStopped,
        operatingMode: authorityState.ownerControls.operatingMode,
        actorRole: result.session.role,
        policies: authorityState.standingPolicies,
        grants: authorityState.capabilityGrants,
      },
      productionMapping,
      factLabels: factLabelsFromKnowledge(runtime.knowledge),
    });

    if (released.gatewayDecision) {
      const decision: PolicyDecisionRecord = {
        decisionId: released.gatewayDecision.decisionId,
        operationId: released.gatewayDecision.operationId,
        payloadDigest: released.gatewayDecision.payloadDigest,
        allowed: released.gatewayDecision.allowed,
        code: released.gatewayDecision.code,
        reason: released.gatewayDecision.reason,
        grantId: released.gatewayDecision.grantId,
        policyId: released.gatewayDecision.policyId,
        decidedAtIso: released.gatewayDecision.decidedAtIso,
      };
      runtime.store.update((s) => ({
        ...s,
        policyDecisions: [...s.policyDecisions, decision],
        updatedAt: decision.decidedAtIso,
      }));
    }

    json(
      res,
      200,
      {
        ...released,
        note:
          "Pilot page release via shared action gateway using persisted mappingStore evidence. ACCEPTED_PENDING ≠ VERIFIED — call /seo/verify-pilot with fixture read-back. Live CMS publish remains NOT_WIRED.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/seo/independent-read-back") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "SEO independent read requires administrator",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return;
    }
    const proposalId = parsed.value.proposalId;
    if (typeof proposalId !== "string" || !proposalId.trim()) {
      json(res, 400, { error: "MISSING_PROPOSAL_ID" }, cors);
      return;
    }
    const readBack = runtime.seo.independentReadBack({ proposalId });
    json(res, readBack.ok ? 200 : 400, readBack, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/seo/verify-pilot") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "SEO verify requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: {
      proposalId?: string;
      observedFields?: Record<string, string>;
      forceFailure?: boolean;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    // Prefer server-side independent read when client omits observedFields (F12).
    let observedFields = body.observedFields;
    if (
      body.proposalId &&
      (!observedFields || typeof observedFields !== "object")
    ) {
      const independent = runtime.seo.independentReadBack({
        proposalId: body.proposalId,
      });
      if (!independent.ok || !independent.observedFields) {
        json(
          res,
          400,
          {
            error: "MISSING_READ_BACK",
            reason: independent.reason,
          },
          cors,
        );
        return;
      }
      observedFields = independent.observedFields;
    }
    if (!body.proposalId || !observedFields || typeof observedFields !== "object") {
      json(res, 400, { error: "MISSING_READ_BACK" }, cors);
      return;
    }
    const verified = runtime.seo.verifyPilotRelease({
      proposalId: body.proposalId,
      observedFields,
      forceFailure: body.forceFailure === true,
    });

    if (verified.gatewayDecision) {
      const decision: PolicyDecisionRecord = {
        decisionId: verified.gatewayDecision.decisionId,
        operationId: verified.gatewayDecision.operationId,
        payloadDigest: verified.gatewayDecision.payloadDigest,
        allowed: verified.gatewayDecision.allowed,
        code: verified.gatewayDecision.code,
        reason: verified.gatewayDecision.reason,
        grantId: verified.gatewayDecision.grantId,
        policyId: verified.gatewayDecision.policyId,
        decidedAtIso: verified.gatewayDecision.decidedAtIso,
      };
      runtime.store.update((s) => ({
        ...s,
        policyDecisions: [...s.policyDecisions, decision],
        updatedAt: decision.decidedAtIso,
      }));
    }

    json(
      res,
      200,
      {
        ...verified,
        note: "Verification requires matching fixture read-back. Gateway acceptance alone never implies VERIFIED.",
      },
      cors,
    );
    return;
  }

  // --- R1-08 Content and distribution ---

  if (method === "GET" && url.pathname === "/content/status") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const status = runtime.content.status();
    json(res, 200, { ...status, note: status.honestNote }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/content/campaigns") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { campaigns: runtime.content.listCampaigns(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/content/articles") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { articles: runtime.content.listArticles(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/content/variants") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { variants: runtime.content.listVariants(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/content/receipts") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { receipts: runtime.content.listReceipts(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/content/destinations") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      { destinations: runtime.content.listDestinations() },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/content/seed-fixtures") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const seed = runtime.content.seedFixtures();
    // Ensure knowledge labels exist for article gates when fixtures are used.
    runtime.knowledge.seedFixtures();
    json(
      res,
      200,
      {
        ...seed,
        note: "Seeded golden campaign, article, and destination variants. Live CMS/GBP/social remain NOT_WIRED.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/content/ensure-fixture-mapping") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Content fixture mapping requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const nowIso = new Date().toISOString();
    const current = runtime.mappingStore.read();
    const upserted = upsertFixtureContentMapping(current, nowIso);
    const proven = proveFixtureContentWritePaths(upserted.state, nowIso);
    runtime.mappingStore.write(proven);
    // Seed demo grants once if absent — never restores revoked grants on release.
    const article =
      runtime.content
        .listArticles()
        .find((a) => a.articleId === "golden-art-training") ??
      runtime.content.listArticles()[0];
    const grantsSeeded = seedDemoContentDistributionGrantsIfAbsent(
      runtime.store,
      nowIso,
      article
        ? {
            assetId: article.articleId,
            contentRevision: article.contentDigest,
          }
        : undefined,
    );
    json(
      res,
      200,
      {
        writePathIds: upserted.writePathIds,
        created: upserted.created,
        addedWritePathIds: upserted.addedWritePathIds,
        grantsSeeded,
        note: "Merged/migrated content CMS/GBP/LinkedIn/Facebook write paths + per-destination bindings; fixture read evidence in mappingStore. Demo grants seeded only if absent.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/content/record-qa") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      articleId?: string;
      approved?: boolean;
      summary?: string;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.articleId || typeof body.approved !== "boolean") {
      json(
        res,
        400,
        {
          error: "MISSING_QA_FIELDS",
          reason: "articleId and approved (boolean) are required",
        },
        cors,
      );
      return;
    }
    const article = runtime.content
      .listArticles()
      .find((a) => a.articleId === body.articleId);
    if (!article) {
      json(res, 404, { error: "ARTICLE_NOT_FOUND" }, cors);
      return;
    }
    // Reviewer is the authenticated session user; author is authoritative on the article.
    if (result.session.userId === article.authorId) {
      json(
        res,
        403,
        {
          error: "QA_SELF_REVIEW_FORBIDDEN",
          reason: "Independent QA reviewer must differ from the article author",
        },
        cors,
      );
      return;
    }
    const recorded = runtime.content.recordQaVerdict({
      articleId: body.articleId,
      authorId: article.authorId,
      reviewerId: result.session.userId,
      approved: body.approved,
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
    });
    json(res, recorded.ok ? 200 : 400, recorded, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/content/record-variant-qa") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      variantId?: string;
      approved?: boolean;
      summary?: string;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.variantId || typeof body.approved !== "boolean") {
      json(
        res,
        400,
        {
          error: "MISSING_VARIANT_QA_FIELDS",
          reason: "variantId and approved (boolean) are required",
        },
        cors,
      );
      return;
    }
    const variant = runtime.content
      .listVariants()
      .find((v) => v.variantId === body.variantId);
    if (!variant) {
      json(res, 404, { error: "VARIANT_NOT_FOUND" }, cors);
      return;
    }
    const article = runtime.content
      .listArticles()
      .find((a) => a.articleId === variant.articleId);
    if (!article) {
      json(res, 404, { error: "ARTICLE_NOT_FOUND" }, cors);
      return;
    }
    if (result.session.userId === article.authorId) {
      json(
        res,
        403,
        {
          error: "VARIANT_QA_SELF_REVIEW_FORBIDDEN",
          reason: "Independent variant QA reviewer must differ from the article author",
        },
        cors,
      );
      return;
    }
    const recorded = runtime.content.recordVariantQaVerdict({
      variantId: body.variantId,
      authorId: article.authorId,
      reviewerId: result.session.userId,
      approved: body.approved,
      ...(body.summary !== undefined ? { summary: body.summary } : {}),
    });
    json(res, recorded.ok ? 200 : 400, recorded, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/content/approve-article") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { articleId?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.articleId) {
      json(res, 400, { error: "MISSING_ARTICLE_ID" }, cors);
      return;
    }
    const approved = runtime.content.approveArticle({
      articleId: body.articleId,
      factLabels: factLabelsFromKnowledge(runtime.knowledge),
    });
    json(res, approved.ok ? 200 : 400, approved, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/content/release-canonical") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Content canonical release requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: { articleId?: string; preferLive?: boolean };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.articleId) {
      json(res, 400, { error: "MISSING_ARTICLE_ID" }, cors);
      return;
    }

    // Evaluate existing grants only — do not mint/restore revoked authority.
    const authorityState = runtime.store.read();
    const productionMapping = runtime.mappingStore.read();
    const released = runtime.content.releaseCanonical({
      articleId: body.articleId,
      preferLive: body.preferLive === true,
      authority: {
        outboundStopped: authorityState.ownerControls.outboundStopped,
        operatingMode: authorityState.ownerControls.operatingMode,
        actorRole: result.session.role,
        policies: authorityState.standingPolicies,
        grants: authorityState.capabilityGrants,
      },
      productionMapping,
      factLabels: factLabelsFromKnowledge(runtime.knowledge),
    });

    if (released.gatewayDecision) {
      upsertPolicyDecision(
        runtime.store,
        policyDecisionFromGateway(released.gatewayDecision),
      );
    }

    json(
      res,
      200,
      {
        ...released,
        note: "Canonical CMS release via shared action gateway. ACCEPTED_PENDING ≠ VERIFIED — call /content/verify-canonical with fixture read-back. Live CMS remains NOT_WIRED.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/content/independent-read-back") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Content independent read requires administrator",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return;
    }
    const kind = parsed.value.kind;
    if (kind === "canonical") {
      const articleId = parsed.value.articleId;
      if (typeof articleId !== "string") {
        json(res, 400, { error: "MISSING_ARTICLE_ID" }, cors);
        return;
      }
      const readBack = runtime.content.independentCanonicalReadBack({
        articleId,
      });
      json(res, readBack.ok ? 200 : 400, readBack, cors);
      return;
    }
    if (kind === "variant") {
      const variantId = parsed.value.variantId;
      if (typeof variantId !== "string") {
        json(res, 400, { error: "MISSING_VARIANT_ID" }, cors);
        return;
      }
      const readBack = runtime.content.independentVariantReadBack({
        variantId,
      });
      json(res, readBack.ok ? 200 : 400, readBack, cors);
      return;
    }
    json(res, 400, { error: "INVALID_KIND" }, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/content/verify-canonical") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Content verify requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: {
      articleId?: string;
      observedFields?: Record<string, string>;
      forceFailure?: boolean;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (
      !body.articleId ||
      !body.observedFields ||
      typeof body.observedFields !== "object"
    ) {
      json(res, 400, { error: "MISSING_READ_BACK" }, cors);
      return;
    }
    const verified = runtime.content.verifyCanonicalRelease({
      articleId: body.articleId,
      observedFields: body.observedFields,
      forceFailure: body.forceFailure === true,
    });

    if (verified.gatewayDecision) {
      upsertPolicyDecision(
        runtime.store,
        policyDecisionFromGateway(verified.gatewayDecision),
      );
    }

    json(
      res,
      200,
      {
        ...verified,
        note: "Verification requires matching fixture read-back. Gateway acceptance alone never implies VERIFIED.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/content/release-variant") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Content variant release requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: { variantId?: string; preferLive?: boolean };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (!body.variantId) {
      json(res, 400, { error: "MISSING_VARIANT_ID" }, cors);
      return;
    }

    // Evaluate existing grants only — do not mint/restore revoked authority.
    const authorityState = runtime.store.read();
    const released = runtime.content.releaseVariant({
      variantId: body.variantId,
      preferLive: body.preferLive === true,
      authority: {
        outboundStopped: authorityState.ownerControls.outboundStopped,
        operatingMode: authorityState.ownerControls.operatingMode,
        actorRole: result.session.role,
        policies: authorityState.standingPolicies,
        grants: authorityState.capabilityGrants,
      },
      productionMapping: runtime.mappingStore.read(),
      factLabels: factLabelsFromKnowledge(runtime.knowledge),
    });

    if (released.gatewayDecision) {
      upsertPolicyDecision(
        runtime.store,
        policyDecisionFromGateway(released.gatewayDecision),
      );
    }

    json(
      res,
      200,
      {
        ...released,
        note: "Destination variant release. Dependent channels require verified canonical URL. Live GBP/social remain NOT_WIRED when preferLive=true.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/content/verify-variant") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Content variant verify requires administrator manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const raw = await readBody(req);
    let body: {
      variantId?: string;
      observedFields?: Record<string, string>;
      forceFailure?: boolean;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    if (
      !body.variantId ||
      !body.observedFields ||
      typeof body.observedFields !== "object"
    ) {
      json(res, 400, { error: "MISSING_READ_BACK" }, cors);
      return;
    }
    const verified = runtime.content.verifyVariantRelease({
      variantId: body.variantId,
      observedFields: body.observedFields,
      forceFailure: body.forceFailure === true,
    });

    if (verified.gatewayDecision) {
      upsertPolicyDecision(
        runtime.store,
        policyDecisionFromGateway(verified.gatewayDecision),
      );
    }

    json(
      res,
      200,
      {
        ...verified,
        note: "Per-destination verification requires matching fixture read-back. Partial success remains visible.",
      },
      cors,
    );
    return;
  }

  // --- M7 / NEXT-18 after-hours inbox ---
  const inboxHandled = await handleInboxRequest({
    inbox: runtime.inbox,
    knowledge: runtime.knowledge,
    authorityStore: runtime.store,
    mappingStore: runtime.mappingStore,
    req,
    res,
    url,
    method,
    cors,
    json,
    readBody,
    parseJsonObjectBody,
    requireSession: (incoming, opts) => requireSession(runtime, incoming, opts),
  });
  if (inboxHandled) {
    return;
  }

  // ── R1-10 Bounded repair ──────────────────────────────────────────────

  if (method === "GET" && url.pathname === "/repair/status") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, runtime.repair.status(), cors);
    return;
  }

  if (method === "GET" && url.pathname === "/repair/incidents") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { incidents: runtime.repair.listIncidents(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/repair/tickets") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { tickets: runtime.repair.listTickets(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/repair/proposals") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(res, 200, { proposals: runtime.repair.listProposals(100) }, cors);
    return;
  }

  if (method === "GET" && url.pathname === "/repair/attempts") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const ticketId =
      typeof url.searchParams.get("ticketId") === "string"
        ? url.searchParams.get("ticketId")!
        : undefined;
    json(
      res,
      200,
      { attempts: runtime.repair.listAttempts(ticketId, 200) },
      cors,
    );
    return;
  }

  if (method === "GET" && url.pathname === "/repair/fixture-asset") {
    const result = requireSession(runtime, req, { requireCsrf: false });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    json(
      res,
      200,
      { asset: runtime.repair.getFixtureAsset() },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/repair/seed-fixtures") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const seed = runtime.repair.seedFixtures();
    json(
      res,
      200,
      {
        ...seed,
        note: "Seeded golden CTA incident/ticket/proposal. Live CMS repair remains NOT_WIRED.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/repair/ensure-fixture-mapping") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    if (!roleMayPerform(result.session.role, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Ensure fixture mapping requires manage_standing_policies",
        },
        cors,
      );
      return;
    }
    const nowIso = new Date().toISOString();
    const current = runtime.mappingStore.read();
    const upserted = upsertFixtureRepairMapping(current, nowIso);
    const proven = proveFixtureRepairWritePath(upserted.state, nowIso);
    runtime.mappingStore.write(proven);

    const demo = createDemoRepairGrant(nowIso);
    runtime.store.update((s) => ({
      ...s,
      standingPolicies: [
        ...s.standingPolicies.filter(
          (p) => p.policyId !== demo.policy.policyId,
        ),
        demo.policy,
      ],
      capabilityGrants: [
        ...s.capabilityGrants.filter(
          (g) => g.grantId !== demo.grant.grantId,
        ),
        demo.grant,
      ],
      updatedAt: nowIso,
    }));

    json(
      res,
      200,
      {
        writePathId: upserted.writePathId,
        created: upserted.created,
        mapping: {
          writePathCount: proven.writePaths.length,
          bindingCount: proven.bindings.length,
        },
        grantId: demo.grant.grantId,
        note: "Persisted bounded-repair write path, fixture read evidence, and demo grant.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/repair/inject-defect") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const injected = runtime.repair.injectDefect();
    json(res, injected.ok ? 200 : 400, injected, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/repair/submit-review") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { proposalId?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const submitted = runtime.repair.submitForReview({
      proposalId: body.proposalId ?? REPAIR_PROPOSAL_ID,
    });
    json(res, submitted.ok ? 200 : 400, submitted, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/repair/independent-review") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: {
      proposalId?: string;
      approved?: boolean;
      reason?: string;
    };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const reviewed = runtime.repair.recordIndependentReview({
      proposalId: body.proposalId ?? REPAIR_PROPOSAL_ID,
      approved: body.approved !== false,
      reason: body.reason ?? "Independent A25 review via console",
    });
    json(res, reviewed.ok ? 200 : 400, reviewed, cors);
    return;
  }

  if (method === "POST" && url.pathname === "/repair/release") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { proposalId?: string; preferLive?: boolean };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }

    const authorityState = runtime.store.read();
    const hasGrant = authorityState.capabilityGrants.some(
      (g) => g.grantId === "grant-demo-bounded-repair",
    );
    if (!hasGrant) {
      json(
        res,
        400,
        {
          error: "GRANT_MISSING",
          reason:
            "No persisted bounded-repair grant. Call /repair/ensure-fixture-mapping first — will not mint demo authority at release time.",
        },
        cors,
      );
      return;
    }

    const released = runtime.repair.releaseRepair({
      proposalId: body.proposalId ?? REPAIR_PROPOSAL_ID,
      authority: {
        outboundStopped: authorityState.ownerControls.outboundStopped,
        operatingMode: authorityState.ownerControls.operatingMode,
        actorRole: result.session.role,
        policies: authorityState.standingPolicies,
        grants: authorityState.capabilityGrants,
      },
      productionMapping: runtime.mappingStore.read(),
      preferLive: body.preferLive === true,
    });

    if (released.gatewayDecision) {
      upsertPolicyDecision(
        runtime.store,
        policyDecisionFromGateway(released.gatewayDecision),
      );
    }

    json(
      res,
      200,
      {
        ...released,
        note: "Gateway-gated fixture bounded repair. Live CMS remains NOT_WIRED. ACCEPTED_PENDING ≠ VERIFIED — call /repair/verify.",
      },
      cors,
    );
    return;
  }

  if (method === "POST" && url.pathname === "/repair/verify") {
    const result = requireSession(runtime, req, {
      requireCsrf: true,
      csrfHeader:
        typeof req.headers["x-csrf-token"] === "string"
          ? req.headers["x-csrf-token"]
          : undefined,
    });
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return;
    }
    const raw = await readBody(req);
    let body: { proposalId?: string };
    try {
      body = JSON.parse(raw) as typeof body;
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }
    const verified = runtime.repair.verifyRepair({
      proposalId: body.proposalId ?? REPAIR_PROPOSAL_ID,
    });
    if (verified.proposal?.gatewayOperationId) {
      const decision = runtime.gateway.getDecision(
        verified.proposal.gatewayOperationId,
      );
      if (decision) {
        upsertPolicyDecision(runtime.store, policyDecisionFromGateway(decision));
      }
    }
    json(res, 200, verified, cors);
    return;
  }

  // --- M6 / NEXT-17 canonical authoring + multi-destination distribute ---
  const contentM6Handled = await handleCanonicalPublishRequest({
    content: runtime.content,
    knowledge: runtime.knowledge,
    authorityStore: runtime.store,
    mappingStore: runtime.mappingStore,
    knowledgeStore: runtime.knowledgeStore,
    req,
    res,
    url,
    method,
    cors,
    json,
    readBody,
    parseJsonObjectBody,
    requireSession: (incoming, opts) => requireSession(runtime, incoming, opts),
  });
  if (contentM6Handled) {
    return;
  }

  // --- M4 / NEXT-13–15 owner staging workflow ---
  const ownerHandled = await handleOwnerStagingRequest({
    ownerStaging: runtime.ownerStaging,
    req,
    res,
    url,
    method,
    cors,
    json,
    readBody,
    parseJsonObjectBody,
    requireSession: (incoming, opts) => requireSession(runtime, incoming, opts),
  });
  if (ownerHandled) {
    return;
  }

  // --- M5 / NEXT-16 lead capture + bounded repair ---
  const leadHandled = await handleLeadCaptureRequest({
    leadCapture: runtime.leadCapture,
    authorityStore: runtime.store,
    mappingStore: runtime.mappingStore,
    req,
    res,
    url,
    method,
    cors,
    json,
    readBody,
    parseJsonObjectBody,
    requireSession: (incoming, opts) => requireSession(runtime, incoming, opts),
  });
  if (leadHandled) {
    return;
  }

  json(res, 404, { error: "NOT_FOUND" }, cors);
}

export function describeDefaultOwner(): {
  username: string;
  role: LocalRoleValue;
} {
  return { username: "owner", role: LocalRole.ADMINISTRATOR };
}

