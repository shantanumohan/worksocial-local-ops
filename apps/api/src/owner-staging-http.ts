/**
 * M4 / NEXT-13–15 HTTP routes for owner staging workflow.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  ActivationStepId,
  ReviewDecision,
  isLocalRole,
  roleMayPerform,
  type ActivationStepIdValue,
  type LocalRoleValue,
  type ReviewDecisionValue,
} from "@worksocial/domain";
import type { OwnerStagingService } from "@worksocial/owner-staging";

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
  | { ok: true; session: { role: string } }
  | { ok: false; code: string; reason: string };

type RequireSessionFn = (
  req: IncomingMessage,
  opts: { requireCsrf: boolean; csrfHeader?: string | undefined },
) => SessionResult;

const ACTIVATION_STEP_IDS = new Set<string>(Object.values(ActivationStepId));
const REVIEW_DECISIONS = new Set<string>(Object.values(ReviewDecision));

export async function handleOwnerStagingRequest(input: {
  ownerStaging: OwnerStagingService;
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
    ownerStaging: staging,
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

  if (!url.pathname.startsWith("/owner/")) {
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

  if (method === "GET" && url.pathname === "/owner/status") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(res, 200, staging.status(), cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/owner/activation") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(res, 200, staging.getActivation(), cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/activation/start") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    json(
      res,
      200,
      staging.startActivation(
        typeof parsed.value.timezone === "string"
          ? { timezone: parsed.value.timezone }
          : {},
      ),
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/activation/step") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const stepId = parsed.value.stepId;
    if (typeof stepId !== "string" || !ACTIVATION_STEP_IDS.has(stepId)) {
      json(res, 400, { error: "INVALID_STEP" }, cors);
      return true;
    }
    json(
      res,
      200,
      staging.completeActivationStep({
        stepId: stepId as ActivationStepIdValue,
        ...(typeof parsed.value.note === "string"
          ? { note: parsed.value.note }
          : {}),
      }),
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/owner/connections") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(res, 200, { connections: staging.listConnections() }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/connections/ensure-fixture") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        connections: staging.ensureFixtureConnections(),
        note: "Fixture/simulator connections. LIVE only when credentials exist.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/owner/sites") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(res, 200, { sites: staging.listSites() }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/sites") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const site = staging.registerSite({
      ...(typeof parsed.value.displayName === "string"
        ? { displayName: parsed.value.displayName }
        : {}),
      ...(typeof parsed.value.domain === "string"
        ? { domain: parsed.value.domain }
        : {}),
      ...(typeof parsed.value.pilotPagePath === "string"
        ? { pilotPagePath: parsed.value.pilotPagePath }
        : {}),
      ...(typeof parsed.value.pilotPageTitle === "string"
        ? { pilotPageTitle: parsed.value.pilotPageTitle }
        : {}),
    });
    json(res, 200, { site }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/collectors/capture") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const siteId = parsed.value.siteId;
    if (typeof siteId !== "string" || !siteId.trim()) {
      json(res, 400, { error: "MISSING_SITE_ID" }, cors);
      return true;
    }
    try {
      const captured = await staging.captureEvidence({
        siteId,
        preferLive: parsed.value.preferLive === true,
        ...(typeof parsed.value.liveUrl === "string"
          ? { liveUrl: parsed.value.liveUrl }
          : {}),
      });
      json(res, 200, captured, cors);
    } catch (err) {
      json(
        res,
        400,
        {
          error: "CAPTURE_FAILED",
          reason: err instanceof Error ? err.message : String(err),
        },
        cors,
      );
    }
    return true;
  }

  if (method === "GET" && url.pathname === "/owner/missions") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(res, 200, { missions: staging.listMissions() }, cors);
    return true;
  }

  if (method === "GET" && url.pathname.startsWith("/owner/missions/")) {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const missionId = url.pathname.slice("/owner/missions/".length);
    if (!missionId || missionId.includes("/")) {
      json(res, 404, { error: "NOT_FOUND" }, cors);
      return true;
    }
    const detail = staging.getMission(missionId);
    if (!detail) {
      json(res, 404, { error: "NOT_FOUND" }, cors);
      return true;
    }
    json(res, 200, detail, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/missions") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const siteId = parsed.value.siteId;
    if (typeof siteId !== "string" || !siteId.trim()) {
      json(res, 400, { error: "MISSING_SITE_ID" }, cors);
      return true;
    }
    try {
      const created = await staging.createPilotMission({
        siteId,
        ...(typeof parsed.value.displayTitle === "string"
          ? { displayTitle: parsed.value.displayTitle }
          : {}),
        ...(typeof parsed.value.summary === "string"
          ? { summary: parsed.value.summary }
          : {}),
      });
      json(res, 200, created, cors);
    } catch (err) {
      json(
        res,
        400,
        {
          error: "MISSION_FAILED",
          reason: err instanceof Error ? err.message : String(err),
        },
        cors,
      );
    }
    return true;
  }

  if (method === "GET" && url.pathname === "/owner/review") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(res, 200, { queue: staging.listReviewQueue() }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/review") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const missionId = parsed.value.missionId;
    const decision = parsed.value.decision;
    if (typeof missionId !== "string" || typeof decision !== "string") {
      json(res, 400, { error: "MISSING_FIELDS" }, cors);
      return true;
    }
    if (!REVIEW_DECISIONS.has(decision)) {
      json(res, 400, { error: "INVALID_DECISION" }, cors);
      return true;
    }
    const reviewed = staging.reviewMission({
      missionId,
      decision: decision as ReviewDecisionValue,
      ...(typeof parsed.value.note === "string"
        ? { note: parsed.value.note }
        : {}),
    });
    json(res, reviewed.ok ? 200 : 400, reviewed, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/staging/apply") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const applyRole: LocalRoleValue | null = isLocalRole(result.session.role)
      ? result.session.role
      : null;
    if (!applyRole || !roleMayPerform(applyRole, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Staging apply requires administrator",
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
    const missionId = parsed.value.missionId;
    if (typeof missionId !== "string") {
      json(res, 400, { error: "MISSING_MISSION_ID" }, cors);
      return true;
    }
    const applied = staging.applyStaging({
      missionId,
      forceUnknownRemote: parsed.value.forceUnknownRemote === true,
    });
    json(res, applied.ok ? 200 : 400, applied, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/staging/verify") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const verifyRole: LocalRoleValue | null = isLocalRole(result.session.role)
      ? result.session.role
      : null;
    if (!verifyRole || !roleMayPerform(verifyRole, "manage_standing_policies")) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Staging verify requires administrator",
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
    const missionId = parsed.value.missionId;
    if (typeof missionId !== "string") {
      json(res, 400, { error: "MISSING_MISSION_ID" }, cors);
      return true;
    }
    if (parsed.value.observedFields !== undefined) {
      json(
        res,
        400,
        {
          error: "VERIFY_CHEAT_REFUSED",
          reason:
            "Do not supply observedFields. Verification uses independent staging CMS read-back.",
        },
        cors,
      );
      return true;
    }
    const verified = staging.verifyStaging({ missionId });
    json(res, verified.ok ? 200 : 400, verified, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/staging/recover") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const missionId = parsed.value.missionId;
    if (typeof missionId !== "string") {
      json(res, 400, { error: "MISSING_MISSION_ID" }, cors);
      return true;
    }
    const recovered = staging.recoverStaging({ missionId });
    json(res, recovered.ok ? 200 : 400, recovered, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/owner/evidence") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(res, 200, { evidence: staging.listEvidence() }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/owner/seed-demo") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    const seeded = await staging.seedDemo();
    json(
      res,
      200,
      {
        site: seeded.site,
        connections: seeded.connections,
        notes: seeded.notes,
        missionSummary: {
          missionId: seeded.mission.missionId,
          title: seeded.mission.displayTitle,
          status: seeded.mission.status,
          summary: seeded.mission.summary,
        },
      },
      cors,
    );
    return true;
  }

  json(res, 404, { error: "NOT_FOUND" }, cors);
  return true;
}
