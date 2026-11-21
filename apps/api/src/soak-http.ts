/**
 * M9 / NEXT-20 HTTP routes — soak / recovery + acceptance evidence report.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { SoakService } from "@worksocial/soak";

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

export async function handleSoakRequest(input: {
  soak: SoakService;
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
    soak,
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

  const csrfOpts = {
    requireCsrf: true as const,
    csrfHeader:
      typeof req.headers["x-csrf-token"] === "string"
        ? req.headers["x-csrf-token"]
        : undefined,
  };

  if (method === "GET" && url.pathname === "/soak/status") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        ...soak.status(),
        note: "Fixture soak harness. 72h pilot gate separate from short CI proofs. Not R1-complete.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/soak/report") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, soak.ownerReport(), cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/soak/cases") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        cases: soak.listCases(),
        note: "ACCEPTED = fixture evidence only. NOT_RUN until evidence. Never silently VERIFIED for live.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/soak/run") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = raw.trim() ? parseJsonObjectBody(raw) : { ok: true as const, value: {} };
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    const opts: { startedAtIso?: string; endedAtIso?: string } = {};
    if (typeof parsed.value.startedAtIso === "string") {
      opts.startedAtIso = parsed.value.startedAtIso;
    }
    if (typeof parsed.value.endedAtIso === "string") {
      opts.endedAtIso = parsed.value.endedAtIso;
    }
    const result = await soak.runFixtureSoak(opts);
    json(
      res,
      result.ok ? 200 : 500,
      {
        ...result,
        note: result.note,
      },
      cors,
    );
    return true;
  }

  return false;
}
