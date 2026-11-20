/**
 * M6 / NEXT-17 HTTP routes for canonical article authoring + multi-destination
 * distribution. Complements existing /content/* release routes in auth-http.
 * External effects: none (fixture/simulator).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  OperatingMode,
  ContentFormat,
  isLocalRole,
  roleMayPerform,
  type LocalRoleValue,
} from "@worksocial/domain";
import type {
  AuthorityStore,
  KnowledgeStore,
  PolicyDecisionRecord,
  ProductionMappingStore,
} from "@worksocial/persistence";
import type { ContentService } from "@worksocial/content";
import type { KnowledgeService } from "@worksocial/knowledge";

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
      session: { role: string; username?: string; userId: string };
    }
  | { ok: false; code: string; reason: string };

function upsertPolicyDecision(
  store: AuthorityStore,
  decision: PolicyDecisionRecord,
): void {
  store.update((s) => ({
    ...s,
    policyDecisions: [
      ...s.policyDecisions.filter((d) => d.decisionId !== decision.decisionId),
      decision,
    ],
    updatedAt: decision.decidedAtIso,
  }));
}

function policyDecisionFromGateway(decision: {
  decisionId: string;
  operationId: string;
  payloadDigest: string;
  allowed: boolean;
  code: string | null;
  reason: string;
  grantId: string | null;
  policyId: string | null;
  decidedAtIso: string;
}): PolicyDecisionRecord {
  return {
    decisionId: decision.decisionId,
    operationId: decision.operationId,
    payloadDigest: decision.payloadDigest,
    allowed: decision.allowed,
    code: decision.code,
    reason: decision.reason,
    grantId: decision.grantId,
    policyId: decision.policyId,
    decidedAtIso: decision.decidedAtIso,
  };
}

type RequireSessionFn = (
  req: IncomingMessage,
  opts: { requireCsrf: boolean; csrfHeader?: string | undefined },
) => SessionResult;

function factLabelsFromKnowledge(
  knowledge: KnowledgeService,
): Map<string, import("@worksocial/domain").SupportLabelValue> {
  const map = new Map<
    string,
    import("@worksocial/domain").SupportLabelValue
  >();
  for (const fact of knowledge.listFacts(500)) {
    map.set(fact.factId, fact.supportLabel);
  }
  return map;
}

function buildAuthority(
  authorityStore: AuthorityStore,
  mappingStore: ProductionMappingStore,
  actorRole?: string,
) {
  const authState = authorityStore.read();
  const base = {
    outboundStopped: authState.ownerControls.outboundStopped,
    operatingMode: authState.ownerControls.operatingMode ?? OperatingMode.OPERATE,
    policies: authState.standingPolicies,
    grants: authState.capabilityGrants,
    productionMapping: mappingStore.read(),
  };
  return actorRole ? { ...base, actorRole } : base;
}

export async function handleCanonicalPublishRequest(input: {
  content: ContentService;
  knowledge: KnowledgeService;
  authorityStore: AuthorityStore;
  mappingStore: ProductionMappingStore;
  knowledgeStore: KnowledgeStore;
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
    content,
    knowledge,
    authorityStore,
    mappingStore,
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

  // Only handle M6 authoring / distribute paths; leave legacy /content/* alone.
  const m6Paths = new Set([
    "/content/create-campaign",
    "/content/create-article",
    "/content/edit-article",
    "/content/prepare-variant",
    "/content/record-claim-qa",
    "/content/bind-review",
    "/content/claim-bundles",
    "/content/review-bindings",
    "/content/distribution-runs",
    "/content/distribute",
    "/content/recover-distribution",
  ]);
  if (!m6Paths.has(url.pathname)) {
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

  if (method === "GET" && url.pathname === "/content/claim-bundles") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      { claimBundles: content.canonicalPublish.listClaimBundles(100) },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/content/review-bindings") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      { reviewBindings: content.canonicalPublish.listReviewBindings(100) },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname === "/content/distribution-runs") {
    const result = sessionGet();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      { runs: content.canonicalPublish.listDistributionRuns(100) },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/content/create-campaign") {
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
    const v = parsed.value;
    if (
      typeof v.title !== "string" ||
      typeof v.topic !== "string" ||
      typeof v.audienceNeed !== "string" ||
      typeof v.practicalValue !== "string" ||
      typeof v.intendedAction !== "string"
    ) {
      json(
        res,
        400,
        {
          error: "MISSING_FIELDS",
          reason:
            "title, topic, audienceNeed, practicalValue, intendedAction required",
        },
        cors,
      );
      return true;
    }
    const campaign = content.createCampaign({
      title: v.title,
      topic: v.topic,
      audienceNeed: v.audienceNeed,
      practicalValue: v.practicalValue,
      intendedAction: v.intendedAction,
      ...(Array.isArray(v.sourceFactIds)
        ? { sourceFactIds: v.sourceFactIds.filter((x): x is string => typeof x === "string") }
        : {}),
      ...(Array.isArray(v.destinationIds)
        ? {
            destinationIds: v.destinationIds.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : { destinationIds: ["dest-cms", "dest-gbp", "dest-linkedin"] }),
      fixtureOnly: true,
    });
    json(
      res,
      200,
      {
        campaign,
        note: "Campaign created (fixtureOnly). Draft a versioned canonical article next.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/content/create-article") {
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
    const v = parsed.value;
    if (
      typeof v.campaignId !== "string" ||
      typeof v.title !== "string" ||
      typeof v.body !== "string"
    ) {
      json(
        res,
        400,
        {
          error: "MISSING_FIELDS",
          reason: "campaignId, title, body required",
        },
        cors,
      );
      return true;
    }
    // Authorship is bound to the authenticated session so independent QA
    // cannot be bypassed by spoofing authorId.
    const authorId = result.session.userId;
    const created = content.createArticle({
      campaignId: v.campaignId,
      title: v.title,
      body: v.body,
      authorId,
      ...(Array.isArray(v.citedFactIds)
        ? {
            citedFactIds: v.citedFactIds.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : {}),
      ...(Array.isArray(v.hypothesisFactIds)
        ? {
            hypothesisFactIds: v.hypothesisFactIds.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : {}),
      fixtureOnly: true,
    });
    if (!created.ok) {
      json(res, 400, { error: created.code, reasons: created.reasons }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        article: created.article,
        note: "Versioned draft created. Record claim/source QA then bind A25 review before approve/distribute.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/content/edit-article") {
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
    const v = parsed.value;
    if (typeof v.articleId !== "string") {
      json(res, 400, { error: "MISSING_ARTICLE_ID" }, cors);
      return true;
    }
    const edited = content.canonicalPublish.editArticle({
      articleId: v.articleId,
      ...(typeof v.title === "string" ? { title: v.title } : {}),
      ...(typeof v.body === "string" ? { body: v.body } : {}),
      ...(Array.isArray(v.citedFactIds)
        ? {
            citedFactIds: v.citedFactIds.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : {}),
      ...(Array.isArray(v.hypothesisFactIds)
        ? {
            hypothesisFactIds: v.hypothesisFactIds.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : {}),
    });
    if (!edited.ok) {
      json(res, 400, { error: edited.code, reasons: edited.reasons }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        article: edited.article,
        digestChanged: edited.digestChanged,
        note: edited.digestChanged
          ? "Digest changed — version bumped; prior A25 bindings invalidated; re-run claim QA + review."
          : "Article updated without digest change.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/content/prepare-variant") {
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
    const v = parsed.value;
    if (
      typeof v.campaignId !== "string" ||
      typeof v.articleId !== "string" ||
      typeof v.destinationId !== "string"
    ) {
      json(
        res,
        400,
        {
          error: "MISSING_FIELDS",
          reason: "campaignId, articleId, destinationId required",
        },
        cors,
      );
      return true;
    }
    const format =
      typeof v.format === "string" &&
      Object.values(ContentFormat).includes(
        v.format as (typeof ContentFormat)[keyof typeof ContentFormat],
      )
        ? (v.format as (typeof ContentFormat)[keyof typeof ContentFormat])
        : ContentFormat.SHORT_UPDATE;
    const prepared = content.prepareVariant({
      campaignId: v.campaignId,
      articleId: v.articleId,
      destinationId: v.destinationId,
      format,
      ...(typeof v.title === "string" ? { title: v.title } : {}),
      ...(typeof v.body === "string" ? { body: v.body } : {}),
      fixtureOnly: true,
    });
    if (!prepared.ok) {
      json(res, 400, { error: prepared.code, reasons: prepared.reasons }, cors);
      return true;
    }
    json(res, 200, { variant: prepared.variant }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/content/record-claim-qa") {
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
    const v = parsed.value;
    if (typeof v.articleId !== "string" || !Array.isArray(v.claims)) {
      json(
        res,
        400,
        { error: "MISSING_FIELDS", reason: "articleId and claims[] required" },
        cors,
      );
      return true;
    }
    knowledge.seedFixtures();
    const claims = v.claims
      .map((c) => {
        if (!c || typeof c !== "object") return null;
        const row = c as Record<string, unknown>;
        if (
          typeof row.claimId !== "string" ||
          typeof row.factId !== "string" ||
          typeof row.sourceRef !== "string" ||
          typeof row.statement !== "string"
        ) {
          return null;
        }
        return {
          claimId: row.claimId,
          factId: row.factId,
          sourceRef: row.sourceRef,
          statement: row.statement,
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    const qa = content.canonicalPublish.recordClaimSourceQa({
      articleId: v.articleId,
      claims,
      factLabels: factLabelsFromKnowledge(knowledge),
    });
    if (!qa.ok) {
      json(res, 400, { error: qa.code, reasons: qa.reasons }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        bundle: qa.bundle,
        reasons: qa.reasons,
        note: "Claim/source QA passed. Bind independent A25 review next.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/content/bind-review") {
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
    const v = parsed.value;
    if (typeof v.articleId !== "string") {
      json(res, 400, { error: "MISSING_ARTICLE_ID" }, cors);
      return true;
    }
    const bound = content.canonicalPublish.bindIndependentReview({
      articleId: v.articleId,
      ...(v.authorRoleId === "A13" ||
      v.authorRoleId === "A12" ||
      v.authorRoleId === "A14"
        ? { authorRoleId: v.authorRoleId }
        : {}),
    });
    if (!bound.ok) {
      json(res, 400, { error: bound.code, reason: bound.reason }, cors);
      return true;
    }
    json(
      res,
      200,
      {
        binding: bound.binding,
        evidencePackageDigest: bound.evidencePackageDigest,
        note: "A25 review bound to exact article revision + evidence package. Edits invalidate.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/content/distribute") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    if (
      !isLocalRole(result.session.role) ||
      !roleMayPerform(result.session.role as LocalRoleValue, "manage_standing_policies")
    ) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Distribute requires administrator manage_standing_policies",
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
    const v = parsed.value;
    if (typeof v.articleId !== "string") {
      json(res, 400, { error: "MISSING_ARTICLE_ID" }, cors);
      return true;
    }
    knowledge.seedFixtures();
    const authority = buildAuthority(
      authorityStore,
      mappingStore,
      result.session.role,
    );
    const distributed = await content.canonicalPublish.runCanonicalDistribution({
      articleId: v.articleId,
      ...(Array.isArray(v.destinationIds)
        ? {
            destinationIds: v.destinationIds.filter(
              (x): x is string => typeof x === "string",
            ),
          }
        : {}),
      authority: {
        outboundStopped: authority.outboundStopped,
        operatingMode: authority.operatingMode,
        policies: authority.policies,
        grants: authority.grants,
        actorRole: result.session.role,
      },
      productionMapping: authority.productionMapping,
      factLabels: factLabelsFromKnowledge(knowledge),
      forceGbpFailure: v.forceGbpFailure === true,
      forceGbpUnknown: v.forceGbpUnknown === true,
    });
    for (const decision of distributed.gatewayDecisions) {
      upsertPolicyDecision(
        authorityStore,
        policyDecisionFromGateway(decision),
      );
    }
    json(
      res,
      200,
      {
        ...distributed,
        note: "Per-destination fixture distribute. ACCEPTED_PENDING ≠ VERIFIED. Live adapters NOT_WIRED. Partial runs are recoverable without re-applying verified destinations.",
        externalEffects: "NONE",
        temporal: "NOT_WIRED",
        r1Complete: false,
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/content/recover-distribution") {
    const result = sessionMutate();
    if (!result.ok) {
      json(res, 401, { error: result.code, reason: result.reason }, cors);
      return true;
    }
    if (
      !isLocalRole(result.session.role) ||
      !roleMayPerform(result.session.role as LocalRoleValue, "manage_standing_policies")
    ) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason: "Recovery requires administrator manage_standing_policies",
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
    const v = parsed.value;
    if (typeof v.runId !== "string") {
      json(res, 400, { error: "MISSING_RUN_ID" }, cors);
      return true;
    }
    knowledge.seedFixtures();
    const authority = buildAuthority(
      authorityStore,
      mappingStore,
      result.session.role,
    );
    const recovered = await content.canonicalPublish.recoverDistribution({
      runId: v.runId,
      authority: {
        outboundStopped: authority.outboundStopped,
        operatingMode: authority.operatingMode,
        policies: authority.policies,
        grants: authority.grants,
        actorRole: result.session.role,
      },
      productionMapping: authority.productionMapping,
      factLabels: factLabelsFromKnowledge(knowledge),
    });
    for (const decision of recovered.gatewayDecisions) {
      upsertPolicyDecision(
        authorityStore,
        policyDecisionFromGateway(decision),
      );
    }
    json(
      res,
      200,
      {
        ...recovered,
        note: "Safe recovery — verified destinations were not re-applied.",
        externalEffects: "NONE",
      },
      cors,
    );
    return true;
  }

  json(res, 405, { error: "METHOD_NOT_ALLOWED" }, cors);
  return true;
}
