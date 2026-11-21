/**
 * M9 / NEXT-20 HTTP routes — soak / recovery + acceptance evidence report.
 * Pilot gate timestamps are server-recorded only; client claim dates are ignored.
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
        note: "Fixture soak harness. 72h pilot gate uses server-recorded observations only. Client claim dates ignored. Not R1-complete.",
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
        note: "ACCEPTED = fixture evidence only with complete proof set. T-X066 fixture ACCEPTED via backup/omit-receipt. Never silently VERIFIED for live.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/soak/pilot/observations") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        observations: soak.listPilotObservations(),
        note: "Server-recorded start/heartbeat/end only. Client startedAtIso/endedAtIso claim dates are never accepted.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/soak/pilot/start") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    // Drain body if present; ignore any client claim dates.
    await readBody(req);
    const result = soak.recordPilotObservation("start");
    json(
      res,
      200,
      {
        ...result,
        note: "Pilot window started with server clock. Client claim dates ignored.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/soak/pilot/heartbeat") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    await readBody(req);
    const result = soak.recordPilotObservation("heartbeat");
    json(
      res,
      200,
      {
        ...result,
        note: "Pilot heartbeat recorded with server clock.",
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
    const parsed = raw.trim()
      ? parseJsonObjectBody(raw)
      : { ok: true as const, value: {} };
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    // Explicitly reject client duration claim dates for the pilot gate.
    if (
      "startedAtIso" in parsed.value ||
      "endedAtIso" in parsed.value
    ) {
      json(
        res,
        400,
        {
          error: "CLIENT_DURATION_CLAIMS_REJECTED",
          reason:
            "startedAtIso/endedAtIso claim dates are not accepted. Use POST /soak/pilot/start and /soak/pilot/heartbeat; gate duration is derived from server-recorded observations only.",
        },
        cors,
      );
      return true;
    }
    const result = await soak.runFixtureSoak({});
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
