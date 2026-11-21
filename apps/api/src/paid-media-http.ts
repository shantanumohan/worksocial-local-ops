/**
 * AA-19 / WP13–14 HTTP — analysis hypotheses + paid-media proposals.
 * Separate from evaluation-http to avoid AA-20 conflicts.
 * External effects: NONE. ChatGPT Ads ACCESS_BLOCKED. Live mutations NOT_WIRED.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  PaidChangeKind,
  PaidMediaPlatform,
  type PaidChangeKindValue,
  type PaidMediaPlatformValue,
} from "@worksocial/domain";
import type { PaidMediaService } from "@worksocial/paid-media";

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

function isPlatform(value: unknown): value is PaidMediaPlatformValue {
  return (
    value === PaidMediaPlatform.GOOGLE_ADS ||
    value === PaidMediaPlatform.CHATGPT_ADS
  );
}

function isChangeKind(value: unknown): value is PaidChangeKindValue {
  return (Object.values(PaidChangeKind) as string[]).includes(String(value));
}

export async function handlePaidMediaRequest(input: {
  paidMedia: PaidMediaService;
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
    paidMedia,
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

  const paidPaths = [
    "/paid/status",
    "/paid/seed",
    "/paid/proposals",
    "/paid/recommend",
    "/paid/decide",
    "/paid/execute",
    "/paid/channels",
    "/analysis/hypotheses",
    "/analysis/definitions",
    "/analysis/briefs",
    "/analysis/save-hypothesis",
    "/analysis/save-brief",
    "/analysis/save-definition",
  ];
  if (!paidPaths.includes(url.pathname)) {
    return false;
  }

  if (method === "GET" && url.pathname === "/paid/status") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        ...paidMedia.status(),
        note: "AA-19 fixture analysis + paid-media proposals. ChatGPT Ads ACCESS_BLOCKED. Live mutations NOT_WIRED. External effects NONE. Catalog NOT_RUN.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/paid/channels") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, paidMedia.status().channels, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/paid/proposals") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        proposals: paidMedia.listProposals(),
        decisions: paidMedia.listDecisions(),
        externalEffects: "NONE",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/analysis/definitions") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { definitions: paidMedia.listDefinitions() }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/analysis/hypotheses") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { hypotheses: paidMedia.listHypotheses() }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/analysis/briefs") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { briefs: paidMedia.listBriefs() }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/paid/seed") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const seeded = paidMedia.seedFixtures();
    json(
      res,
      200,
      {
        ...seeded,
        note: "Fixture seed only. ChatGPT proposal remains BLOCKED. No external effects.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/analysis/save-definition") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    const v = parsed.value;
    try {
      const definition = paidMedia.saveDefinition({
        ...(typeof v.definitionId === "string"
          ? { definitionId: v.definitionId }
          : {}),
        siteId: typeof v.siteId === "string" ? v.siteId : "site-fixture",
        periodStartIso:
          typeof v.periodStartIso === "string"
            ? v.periodStartIso
            : "2026-11-01T00:00:00.000Z",
        periodEndIso:
          typeof v.periodEndIso === "string"
            ? v.periodEndIso
            : "2026-11-14T00:00:00.000Z",
        comparisonLabel:
          typeof v.comparisonLabel === "string"
            ? v.comparisonLabel
            : "prior_14d",
        reportingTimezone:
          typeof v.reportingTimezone === "string"
            ? v.reportingTimezone
            : "America/New_York",
      });
      json(res, 200, { definition }, cors);
    } catch (err) {
      json(
        res,
        400,
        {
          error: "DEFINITION_REFUSED",
          reason: err instanceof Error ? err.message : String(err),
        },
        cors,
      );
    }
    return true;
  }

  if (method === "POST" && url.pathname === "/analysis/save-hypothesis") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    const v = parsed.value;
    const result = paidMedia.saveHypothesis({
      ...(typeof v.hypothesisId === "string"
        ? { hypothesisId: v.hypothesisId }
        : {}),
      definitionId:
        typeof v.definitionId === "string" ? v.definitionId : "def-missing",
      statement: typeof v.statement === "string" ? v.statement : "",
      primaryOutcome:
        typeof v.primaryOutcome === "string" ? v.primaryOutcome : "",
      baseline: typeof v.baseline === "string" ? v.baseline : "",
      comparison: typeof v.comparison === "string" ? v.comparison : "",
      observationWindowDays:
        typeof v.observationWindowDays === "number"
          ? v.observationWindowDays
          : 0,
    });
    json(res, result.ok ? 200 : 400, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/analysis/save-brief") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    const v = parsed.value;
    const brief = paidMedia.saveBrief({
      ...(typeof v.briefId === "string" ? { briefId: v.briefId } : {}),
      definitionId:
        typeof v.definitionId === "string" ? v.definitionId : "def-missing",
      ...(typeof v.hypothesisId === "string"
        ? { hypothesisId: v.hypothesisId }
        : { hypothesisId: null }),
      title: typeof v.title === "string" ? v.title : "Untitled brief",
      summary: typeof v.summary === "string" ? v.summary : "",
      ...(Array.isArray(v.sourceCaveats)
        ? {
            sourceCaveats: v.sourceCaveats.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : {}),
      ...(Array.isArray(v.proposedActions)
        ? {
            proposedActions: v.proposedActions.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : {}),
    });
    json(res, 200, { brief }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/paid/recommend") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    const v = parsed.value;
    if (!isPlatform(v.platform) || !isChangeKind(v.changeKind)) {
      json(res, 400, { error: "INVALID_PLATFORM_OR_CHANGE" }, cors);
      return true;
    }
    const fd =
      v.financialDiff && typeof v.financialDiff === "object"
        ? (v.financialDiff as Record<string, unknown>)
        : {};
    const result = paidMedia.requestRecommendation({
      platform: v.platform,
      accountId: typeof v.accountId === "string" ? v.accountId : "acct",
      campaignId: typeof v.campaignId === "string" ? v.campaignId : "camp",
      changeKind: v.changeKind,
      hypothesis: typeof v.hypothesis === "string" ? v.hypothesis : "",
      exactChange: typeof v.exactChange === "string" ? v.exactChange : "",
      risk: typeof v.risk === "string" ? v.risk : "",
      alternative: typeof v.alternative === "string" ? v.alternative : "",
      impressions:
        typeof v.impressions === "number"
          ? v.impressions
          : v.impressions === null
            ? null
            : 0,
      clicks:
        typeof v.clicks === "number"
          ? v.clicks
          : v.clicks === null
            ? null
            : 0,
      eventsPresent: v.eventsPresent === true,
      attributionSettled: v.attributionSettled === true,
      sameDaySpendComplete: v.sameDaySpendComplete === true,
      financialDiff: {
        currency: typeof fd.currency === "string" ? fd.currency : "USD",
        dailyBudgetBeforeMinor:
          typeof fd.dailyBudgetBeforeMinor === "number"
            ? fd.dailyBudgetBeforeMinor
            : null,
        dailyBudgetAfterMinor:
          typeof fd.dailyBudgetAfterMinor === "number"
            ? fd.dailyBudgetAfterMinor
            : null,
        lifetimeImpactMinor:
          typeof fd.lifetimeImpactMinor === "number"
            ? fd.lifetimeImpactMinor
            : null,
        sharedBudgetAffected: fd.sharedBudgetAffected === true,
        sharedBudgetImpactKnown: fd.sharedBudgetImpactKnown === true,
        notes: Array.isArray(fd.notes)
          ? fd.notes.filter((x): x is string => typeof x === "string")
          : [],
      },
    });
    json(res, result.ok ? 200 : 403, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/paid/decide") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    const v = parsed.value;
    const decision =
      v.decision === "approve" || v.decision === "decline"
        ? v.decision
        : null;
    if (!decision || typeof v.proposalId !== "string") {
      json(res, 400, { error: "INVALID_DECISION" }, cors);
      return true;
    }
    const result = paidMedia.decide({
      proposalId: v.proposalId,
      decision,
      actorRole: session.session.role,
      reason: typeof v.reason === "string" ? v.reason : "",
    });
    json(res, result.ok ? 200 : 400, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/paid/execute") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: "INVALID_JSON", reason: parsed.error }, cors);
      return true;
    }
    const v = parsed.value;
    if (typeof v.proposalId !== "string") {
      json(res, 400, { error: "INVALID_PROPOSAL" }, cors);
      return true;
    }
    const result = paidMedia.execute({
      proposalId: v.proposalId,
      ...(v.preferLive === true ? { preferLive: true } : {}),
    });
    json(res, 403, result, cors);
    return true;
  }

  return false;
}
