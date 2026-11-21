/**
 * M8 / NEXT-19 HTTP routes — isolated EVAL_ONLY worker, analytics read honesty,
 * ChatGPT Ads access gate.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  SearchJudgmentLabel,
  classifyGscDemand,
  interpretGa4DebugValidation,
  validateGa4PropertyBinding,
  type EvalProviderValue,
  type SearchJudgmentLabelValue,
  type SupportLabelValue,
} from "@worksocial/domain";
import { readAnalyticsFixtureBundle } from "@worksocial/provider-adapters";
import type { EvaluationService } from "@worksocial/evaluation-worker";
import type { KnowledgeService } from "@worksocial/knowledge";
import type { SeoService } from "@worksocial/seo";

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

function factLabelsFromKnowledge(
  knowledge: KnowledgeService,
): Map<string, SupportLabelValue> {
  const labels = new Map<string, SupportLabelValue>();
  for (const fact of knowledge.listFacts(500)) {
    labels.set(fact.factId, fact.supportLabel);
  }
  return labels;
}

export async function handleEvaluationAndAnalyticsRequest(input: {
  evaluation: EvaluationService;
  seo: SeoService;
  knowledge: KnowledgeService;
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
    evaluation,
    seo,
    knowledge,
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

  if (method === "GET" && url.pathname === "/eval/status") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, evaluation.status(), cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/eval/connections") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { connections: evaluation.listConnections(50) }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/eval/suites") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { suites: evaluation.listSuites(50) }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/eval/runs") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, { runs: evaluation.listRuns(50) }, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/eval/chatgpt-ads") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        ...evaluation.chatgptAdsStatus(),
        note: "ChatGPT Ads remains access-blocked without verified local transport and entitlement. Live NOT_WIRED.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/eval/seed-fixtures") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const seed = evaluation.seedFixtures();
    json(
      res,
      200,
      {
        ...seed,
        note: "Seeded EVAL_ONLY Claude/Gemini connections + grounded golden suite. Live fleet NOT_WIRED. Ads blocked.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/eval/connect") {
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
    const provider = String(parsed.value.provider ?? "claude") as EvalProviderValue;
    if (provider !== "claude" && provider !== "gemini") {
      json(res, 400, { error: "INVALID_PROVIDER" }, cors);
      return true;
    }
    const connection = evaluation.connectProvider({
      provider,
      ...(typeof parsed.value.displayName === "string"
        ? { displayName: parsed.value.displayName }
        : {}),
    });
    json(
      res,
      200,
      {
        connection,
        note: "EVAL_ONLY connection saved — no publish/CRM/customer-message authority.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/eval/run-suite") {
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
    knowledge.seedFixtures();
    const labels = factLabelsFromKnowledge(knowledge);
    const provider =
      parsed.value.provider === "gemini" ? "gemini" : "claude";
    const result = evaluation.runSuite({
      ...(typeof parsed.value.suiteId === "string"
        ? { suiteId: parsed.value.suiteId }
        : {}),
      provider,
      factLabels: labels,
    });
    json(res, result.ok ? 200 : 400, result, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/eval/attempt-tool") {
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
    const tool = typeof parsed.value.tool === "string" ? parsed.value.tool : "";
    const gate = evaluation.attemptTool(tool);
    json(res, gate.allowed ? 200 : 403, gate, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/analysis/status") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const bundle = readAnalyticsFixtureBundle({
      nowIso: new Date().toISOString(),
    });
    json(
      res,
      200,
      {
        liveWiring: bundle.liveWiring,
        chatgptAds: evaluation.chatgptAdsStatus(),
        temporalWiring: "NOT_WIRED",
        environmentNotes: bundle.environmentNotes,
        note: "Analysis surface — fixture metrics only. No fake live KPIs. Catalog cases NOT_RUN.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/analysis/read") {
    const session = requireSession(req, csrfOpts);
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const nowIso = new Date().toISOString();
    const bundle = readAnalyticsFixtureBundle({ nowIso });
    const omitted = bundle.gscOmittedRow
      ? classifyGscDemand(bundle.gscOmittedRow)
      : null;
    const debug = interpretGa4DebugValidation({ debugEndpointAccepted: true });
    const property = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-FIXTURE",
      displayName: "WorkSocial fixture GA4",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    const wrongKind = validateGa4PropertyBinding({
      propertyId: "UA-1",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy UA",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    json(
      res,
      200,
      {
        gsc: bundle.gsc,
        ga4: bundle.ga4,
        omittedGscDemand: omitted,
        ga4DebugValidation: debug,
        ga4PropertyValidation: property,
        ga4WrongKindRejected: wrongKind,
        liveWiring: bundle.liveWiring,
        chatgptAds: evaluation.chatgptAdsStatus(),
        note: "FIXTURE ≠ SANDBOX ≠ LIVE. Live adapters NOT_WIRED. Debug ≠ measured receipt. Omitted GSC ≠ zero.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/seo/judge-search") {
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
    const queryId =
      typeof parsed.value.queryId === "string" ? parsed.value.queryId : "";
    const labelRaw =
      typeof parsed.value.label === "string" ? parsed.value.label : "";
    const allowed = Object.values(SearchJudgmentLabel) as string[];
    if (!queryId || !allowed.includes(labelRaw)) {
      json(res, 400, { error: "INVALID_JUDGMENT" }, cors);
      return true;
    }
    const judged = seo.judgeSearchResult({
      queryId,
      label: labelRaw as SearchJudgmentLabelValue,
      note: typeof parsed.value.note === "string" ? parsed.value.note : "",
      createRemediation: parsed.value.createRemediation === true,
      ...(typeof parsed.value.remediationSummary === "string"
        ? { remediationSummary: parsed.value.remediationSummary }
        : {}),
    });
    json(res, 200, judged, cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/seo/judgments") {
    const session = requireSession(req, { requireCsrf: false });
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        judgments: seo.listSearchJudgments(100),
        remediations: seo.listSearchRemediations(100),
      },
      cors,
    );
    return true;
  }

  return false;
}
