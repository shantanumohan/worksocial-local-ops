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
  createFixturePilotMapping,
  createReadEvidence,
  findActiveUser,
  listWritePathOutcomesForLearning,
  proveFixturePilotWritePath,
  recordWritePathOutcome,
  roleMayPerform,
  validateSession,
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
  createFileAuthorityStore,
  createFileProductionMappingStore,
  ensureBootstrapOwner,
  verifyPassword,
  type AuthorityStore,
  type PolicyDecisionRecord,
  type ProductionMappingStore,
} from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayIntent,
} from "@worksocial/action-gateway";
import { createCredentialBroker, type CredentialBroker } from "@worksocial/credential-broker";
import { listAdapters } from "@worksocial/provider-adapters";

export type ApiRuntime = {
  store: AuthorityStore;
  mappingStore: ProductionMappingStore;
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
}): ApiRuntime {
  const store = createFileAuthorityStore(options.stateDir);
  const mappingStore = createFileProductionMappingStore(options.stateDir);
  const ownerPassword =
    options.ownerPassword ?? process.env.WORKSOCIAL_OWNER_PASSWORD;
  ensureBootstrapOwner(
    store,
    ownerPassword !== undefined ? { password: ownerPassword } : {},
  );
  return {
    store,
    mappingStore,
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
        identity: "R1-02 local session auth + R1-03 production mapping",
        message:
          "API identity/authority/mapping surface. No live Zoho/CMS mutations.",
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
      const label = submitted.decision.allowed
        ? OutcomeLabel.UNKNOWN
        : OutcomeLabel.FAILURE;
      const source =
        submitted.decision.code === "OUTBOUND_STOPPED"
          ? OutcomeEvidenceSource.STOP_SWITCH
          : OutcomeEvidenceSource.GATEWAY_RECEIPT;
      runtime.mappingStore.addWritePathOutcome(
        recordWritePathOutcome({
          outcomeId: `out-${submitted.decision.decisionId}`,
          writePathId: submitted.decision.writePathId,
          operationId: submitted.decision.operationId,
          label,
          source,
          summary: submitted.decision.reason,
          fixtureOnly: false,
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
          note: "SUCCESS/FAILURE labels stored for a future local multi-model learning-worker; no ML training in R1-03.",
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
    const { state, writePathId } = createFixturePilotMapping(nowIso);
    runtime.mappingStore.write(state);
    json(
      res,
      200,
      {
        writePathId,
        seeded: true,
        ownershipProven: false,
        readEvidencePresent: false,
        note: "Fixture pilot mapping only. Ownership and read evidence still required before writes.",
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
      requiredEvidenceKinds: body.requiredEvidenceKinds ?? [
        EvidenceKind.IDENTITY,
        EvidenceKind.RESOURCE,
        EvidenceKind.SCOPE,
        EvidenceKind.CAPABILITY_TEST,
        EvidenceKind.READ_BACK,
      ],
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
    const nowIso = new Date().toISOString();
    try {
      const outcome = recordWritePathOutcome({
        outcomeId: body.outcomeId,
        writePathId: body.writePathId,
        operationId: body.operationId,
        label: body.label,
        source: body.source as (typeof OutcomeEvidenceSource)[keyof typeof OutcomeEvidenceSource],
        summary: body.summary,
        fixtureOnly: body.fixtureOnly ?? false,
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
          note: "Labeled outcome stored for a future learning-worker. No ML training in R1-03.",
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

  json(res, 404, { error: "NOT_FOUND" }, cors);
}

export function describeDefaultOwner(): {
  username: string;
  role: LocalRoleValue;
} {
  return { username: "owner", role: LocalRole.ADMINISTRATOR };
}
