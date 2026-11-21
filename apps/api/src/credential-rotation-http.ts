/**
 * WP10 / F24 HTTP — credential revoke / rotate / offboard honesty.
 * Live provider revoke stays NOT_WIRED; external effects NONE; catalog NOT_RUN.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { CredentialRotationService } from "@worksocial/credential-rotation";

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

const PATHS = [
  "/credentials/status",
  "/credentials/connections",
  "/credentials/queued-work",
  "/credentials/audit",
  "/credentials/rotations",
  "/credentials/manifests",
  "/credentials/seed",
  "/credentials/lease",
  "/credentials/effect",
  "/credentials/revoke",
  "/credentials/rotate",
  "/credentials/offboard",
  "/credentials/live-revoke",
] as const;

export async function handleCredentialRotationRequest(input: {
  credentials: CredentialRotationService;
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
    credentials,
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

  if (!(PATHS as readonly string[]).includes(url.pathname)) {
    return false;
  }

  const csrfOpts = {
    requireCsrf: true as const,
    csrfHeader:
      typeof req.headers["x-csrf-token"] === "string"
        ? req.headers["x-csrf-token"]
        : undefined,
  };

  if (method === "GET" && url.pathname === "/credentials/status") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        ...(await credentials.status()),
        note: "Fixture credential revoke/rotate/offboard. Live provider revocation NOT_WIRED. External effects NONE. Catalog NOT_RUN.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/credentials/connections") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { connections: await credentials.listConnections() }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/credentials/queued-work") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const connectionId = url.searchParams.get("connectionId") ?? undefined;
    json(
      res,
      200,
      { queuedWork: await credentials.listQueuedWork(connectionId) },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/credentials/audit") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { audit: await credentials.listAudit() }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/credentials/rotations") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { rotations: await credentials.listRotations() }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/credentials/manifests") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { manifests: await credentials.listManifests() }, cors);
    return true;
  }

  async function readBodyObject(): Promise<
    | { ok: true; value: Record<string, unknown> }
    | { ok: false }
  > {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return { ok: false };
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw || "{}");
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return { ok: false };
    }
    return { ok: true, value: parsed.value };
  }

  if (method === "POST" && url.pathname === "/credentials/seed") {
    const body = await readBodyObject();
    if (!body.ok) return true;
    const seeded = await credentials.seedFixture({
      ...(typeof body.value.connectionId === "string"
        ? { connectionId: body.value.connectionId }
        : {}),
      ...(typeof body.value.providerId === "string"
        ? { providerId: body.value.providerId }
        : {}),
      ...(typeof body.value.accountLabel === "string"
        ? { accountLabel: body.value.accountLabel }
        : {}),
      withQueuedWork: body.value.withQueuedWork !== false,
    });
    json(
      res,
      200,
      {
        ...seeded,
        note: "Fixture connection seeded. Secrets never returned. Live provider revoke NOT_WIRED.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/credentials/lease") {
    const body = await readBodyObject();
    if (!body.ok) return true;
    const connectionId = body.value.connectionId;
    const scopes = body.value.requestedScopes;
    if (typeof connectionId !== "string" || !Array.isArray(scopes)) {
      json(
        res,
        400,
        {
          error: "INVALID_BODY",
          reason: "connectionId (string) and requestedScopes (array) required",
        },
        cors,
      );
      return true;
    }
    const result = await credentials.requestLease({
      connectionId,
      requestedScopes: scopes.map(String),
    });
    json(res, result.ok ? 200 : 403, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/credentials/effect") {
    const body = await readBodyObject();
    if (!body.ok) return true;
    if (typeof body.value.connectionId !== "string") {
      json(
        res,
        400,
        { error: "INVALID_BODY", reason: "connectionId required" },
        cors,
      );
      return true;
    }
    const result = await credentials.requestEffect({
      connectionId: body.value.connectionId,
    });
    json(res, result.ok ? 200 : 403, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/credentials/revoke") {
    const body = await readBodyObject();
    if (!body.ok) return true;
    if (typeof body.value.connectionId !== "string") {
      json(
        res,
        400,
        { error: "INVALID_BODY", reason: "connectionId required" },
        cors,
      );
      return true;
    }
    const result = await credentials.revoke({
      connectionId: body.value.connectionId,
      ...(typeof body.value.approvedBy === "string"
        ? { approvedBy: body.value.approvedBy }
        : {}),
    });
    json(res, result.ok ? 200 : 400, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/credentials/rotate") {
    const body = await readBodyObject();
    if (!body.ok) return true;
    if (
      typeof body.value.connectionId !== "string" ||
      typeof body.value.approvedBy !== "string" ||
      typeof body.value.secretMaterial !== "string"
    ) {
      json(
        res,
        400,
        {
          error: "INVALID_BODY",
          reason: "connectionId, approvedBy, and secretMaterial required",
        },
        cors,
      );
      return true;
    }
    const result = await credentials.rotate({
      connectionId: body.value.connectionId,
      approvedBy: body.value.approvedBy,
      secretMaterial: body.value.secretMaterial,
    });
    // Never echo secretMaterial back.
    json(res, result.ok ? 200 : 400, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/credentials/offboard") {
    const body = await readBodyObject();
    if (!body.ok) return true;
    if (typeof body.value.connectionId !== "string") {
      json(
        res,
        400,
        { error: "INVALID_BODY", reason: "connectionId required" },
        cors,
      );
      return true;
    }
    const result = await credentials.offboard({
      connectionId: body.value.connectionId,
      ...(typeof body.value.approvedBy === "string"
        ? { approvedBy: body.value.approvedBy }
        : {}),
    });
    json(res, result.ok ? 200 : 400, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/credentials/live-revoke") {
    const body = await readBodyObject();
    if (!body.ok) return true;
    if (typeof body.value.connectionId !== "string") {
      json(
        res,
        400,
        { error: "INVALID_BODY", reason: "connectionId required" },
        cors,
      );
      return true;
    }
    const result = await credentials.liveProviderRevoke({
      connectionId: body.value.connectionId,
    });
    json(res, 501, result, cors);
    return true;
  }

  json(res, 405, { error: "METHOD_NOT_ALLOWED" }, cors);
  return true;
}
