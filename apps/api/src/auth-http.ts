/**
 * Local identity HTTP helpers for R1-02 (session cookie + CSRF + origin checks).
 */

import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  LocalRole,
  OperatingMode,
  findActiveUser,
  roleMayPerform,
  validateSession,
  type LocalRoleValue,
  type SessionRecord,
} from "@worksocial/domain";
import {
  createFileAuthorityStore,
  ensureBootstrapOwner,
  verifyPassword,
  type AuthorityStore,
  type PolicyDecisionRecord,
} from "@worksocial/persistence";
import {
  createActionGateway,
  type ActionGateway,
  type GatewayIntent,
} from "@worksocial/action-gateway";
import { createCredentialBroker, type CredentialBroker } from "@worksocial/credential-broker";

export type ApiRuntime = {
  store: AuthorityStore;
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
  const ownerPassword =
    options.ownerPassword ?? process.env.WORKSOCIAL_OWNER_PASSWORD;
  ensureBootstrapOwner(
    store,
    ownerPassword !== undefined ? { password: ownerPassword } : {},
  );
  return {
    store,
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
        identity: "R1-02 local session auth",
        message: "API identity/authority surface (no live providers).",
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
          "connected ≠ authorized ≠ verified. No live providers are connected in R1-02.",
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
    const submitted = runtime.gateway.submitIntent(intent, {
      outboundStopped: state.ownerControls.outboundStopped,
      operatingMode: state.ownerControls.operatingMode,
      policies: state.standingPolicies,
      grants: state.capabilityGrants,
      nowIso: new Date().toISOString(),
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
    json(
      res,
      submitted.decision.allowed ? 200 : 403,
      {
        decision: submitted.decision,
        note: "Acceptance is not verification. Live providers are not connected.",
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

  json(res, 404, { error: "NOT_FOUND" }, cors);
}

export function describeDefaultOwner(): {
  username: string;
  role: LocalRoleValue;
} {
  return { username: "owner", role: LocalRole.ADMINISTRATOR };
}
