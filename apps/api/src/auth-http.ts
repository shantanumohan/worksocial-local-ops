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
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  recordWritePathOutcome,
  roleMayPerform,
  upsertFixturePilotMapping,
  validateSession,
  writePathIsFixtureOnly,
  type BookingOwnership,
  type CrmOwnership,
  type FormMapping,
  type JourneyRegistryEntry,
  type LocalRoleValue,
  type PilotWritePath,
  type SessionRecord,
  type SourceBinding,
} from "@worksocial/domain";
import {
  createDemoCanaryGrant,
  createFileAuthorityStore,
  createFileLearningStore,
  createFileProbeStore,
  createFileProductionMappingStore,
  createFileRoleRuntimeStore,
  ensureBootstrapOwner,
  verifyPassword,
  type AuthorityStore,
  type LearningStore,
  type PolicyDecisionRecord,
  type ProbeStore,
  type ProductionMappingStore,
  type RoleRuntimeStore,
} from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayIntent,
} from "@worksocial/action-gateway";
import { createCredentialBroker, type CredentialBroker } from "@worksocial/credential-broker";
import { listAdapters } from "@worksocial/provider-adapters";
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
import { listPinnedModels } from "@worksocial/ml";

export type ApiRuntime = {
  store: AuthorityStore;
  mappingStore: ProductionMappingStore;
  roleRuntimeStore: RoleRuntimeStore;
  learningStore: LearningStore;
  learningWorker: LearningWorker;
  probeStore: ProbeStore;
  probes: ProbeService;
  runner: ClaudeRunner;
  missions: MissionEnqueueService;
  gateway: ActionGateway;
  broker: CredentialBroker;
  apiOrigin: string;
  consoleOrigin: string;
  sessionTtlMs: number;
};

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
    runner,
    missions,
    gateway: createActionGateway(),
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
          "R1-02–R1-05 auth + mapping + roles + learning + probes/canaries",
        message:
          "API surface includes monitoring probes. No live Zoho mutations. Fixture canaries + Claude fixture mode default.",
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
    const submitted = runtime.gateway.submitIntent(intent, {
      outboundStopped: state.ownerControls.outboundStopped,
      operatingMode: state.ownerControls.operatingMode,
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
    } = {};
    try {
      body = raw ? (JSON.parse(raw) as typeof body) : {};
    } catch {
      json(res, 400, { error: "INVALID_JSON" }, cors);
      return;
    }

    const nowIso = new Date().toISOString();
    // Ensure fixture pilot + canary grant exist for offline demos.
    if (body.ensureFixturePilot !== false) {
      let mapping = runtime.mappingStore.read();
      if (mapping.writePaths.length === 0) {
        const seeded = createFixturePilotMapping(nowIso);
        mapping = proveFixturePilotWritePath(
          seeded.state,
          seeded.writePathId,
          nowIso,
        );
        runtime.mappingStore.write(mapping);
      } else {
        const pathId = body.writePathId ?? mapping.writePaths[0]?.writePathId;
        if (
          pathId &&
          !mapping.readEvidence.some((e) => e.writePathId === pathId)
        ) {
          try {
            mapping = proveFixturePilotWritePath(mapping, pathId, nowIso);
            runtime.mappingStore.write(mapping);
          } catch {
            // leave mapping as-is; canary will fail closed
          }
        }
      }

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
        policies: authState.standingPolicies,
        grants: authState.capabilityGrants,
        productionMapping: mapping,
      },
      ...(body.writePathId !== undefined
        ? { writePathId: body.writePathId }
        : {}),
      ...(body.liveZoho === true ? { liveZoho: true } : {}),
      gateway: runtime.gateway,
      nowIso,
      targetAccountId: "acct-fixture-canary",
    });

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
        note:
          body.liveZoho === true
            ? "Live Zoho is NOT_WIRED without owner credentials."
            : "Fixture canary with correlated receipt. Synthetic leads excluded from commercial totals. Outcome labeled fixtureOnly for learning.",
      },
      cors,
    );
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
