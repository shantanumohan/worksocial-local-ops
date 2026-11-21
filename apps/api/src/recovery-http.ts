/**
 * WP10 / F24 HTTP routes — recovery evidence inspection + fixture scenarios.
 * Live recovery stays NOT_RUN; external effects NONE.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  RECOVERY_FIXTURE_SCENARIO_IDS,
  type RecoveryScenarioId,
} from "@worksocial/domain";
import type { RecoveryService } from "@worksocial/recovery";

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

function isScenarioId(value: unknown): value is RecoveryScenarioId {
  return (
    typeof value === "string" &&
    (RECOVERY_FIXTURE_SCENARIO_IDS as readonly string[]).includes(value)
  );
}

export async function handleRecoveryRequest(input: {
  recovery: RecoveryService;
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
    recovery,
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

  if (method === "GET" && url.pathname === "/recovery/status") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        ...(await recovery.status()),
        note: "Fixture recovery evidence. Live recovery NOT_RUN; never silently VERIFIED. External effects NONE.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/recovery/inspect") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, await recovery.inspection(), cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/recovery/timeline") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        timeline: await recovery.listTimeline(),
        note: "Health timeline distinguishes STALE_OBSERVATION / ACTIVE_INCIDENT / UNKNOWN_REMOTE_OUTCOME.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/recovery/queued-work") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        queuedWork: await recovery.listQueuedWork(),
        note: "Queued work preserved during outage — no duplicate external apply.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/recovery/capability-stops") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        capabilityStops: await recovery.listCapabilityStops(),
        note: "Capability-level stop only. Unrelated healthy workstreams remain allowed.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/recovery/runs") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        runs: await recovery.listRuns(),
        note: "Fixture recovery runs only. liveRecoveryVerified is always false.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/recovery/run") {
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
    if (
      "liveVerified" in parsed.value ||
      parsed.value.status === "VERIFIED"
    ) {
      json(
        res,
        400,
        {
          error: "LIVE_VERIFIED_REJECTED",
          reason:
            "Live recovery VERIFIED claims are rejected. Fixture runs keep liveRecoveryClaim=NOT_RUN.",
        },
        cors,
      );
      return true;
    }
    if ("scenarioId" in parsed.value) {
      if (!isScenarioId(parsed.value.scenarioId)) {
        json(
          res,
          400,
          {
            error: "INVALID_SCENARIO",
            reason: `scenarioId must be one of: ${RECOVERY_FIXTURE_SCENARIO_IDS.join(", ")}`,
          },
          cors,
        );
        return true;
      }
      const result = await recovery.runFixtureRecovery({
        scenarioId: parsed.value.scenarioId,
      });
      json(
        res,
        result.ok ? 200 : 500,
        {
          ...result,
          liveRecoveryVerified: false,
          externalEffects: "NONE",
        },
        cors,
      );
      return true;
    }
    const result = await recovery.runFixtureRecovery({});
    json(
      res,
      result.ok ? 200 : 500,
      {
        ...result,
        liveRecoveryVerified: false,
        externalEffects: "NONE",
      },
      cors,
    );
    return true;
  }

  return false;
}
