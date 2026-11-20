/**
 * M5 / NEXT-16 HTTP routes for lead capture + bounded repair recovery.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import {
  OperatingMode,
  proveFixturePilotWritePath,
  roleMayPerform,
  isLocalRole,
  upsertFixturePilotMapping,
  type LocalRoleValue,
} from "@worksocial/domain";
import {
  createDemoCanaryGrant,
  type AuthorityStore,
  type ProductionMappingStore,
} from "@worksocial/persistence";
import type { LeadCaptureService } from "@worksocial/lead-capture";

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

function ensureFixtureCanaryAuthority(
  authorityStore: AuthorityStore,
  mappingStore: ProductionMappingStore,
  nowIso: string,
): void {
  let mapping = mappingStore.read();
  const upserted = upsertFixturePilotMapping(mapping, nowIso);
  mapping = upserted.state;
  if (
    upserted.writePathId &&
    !mapping.readEvidence.some((e) => e.writePathId === upserted.writePathId)
  ) {
    try {
      mapping = proveFixturePilotWritePath(
        mapping,
        upserted.writePathId,
        nowIso,
      );
    } catch {
      // leave as-is; journey will fail closed
    }
  }
  mappingStore.write(mapping);

  const auth = authorityStore.read();
  if (
    !auth.capabilityGrants.some((g) => g.grantId === "grant-demo-form-canary")
  ) {
    const { policy, grant } = createDemoCanaryGrant(nowIso);
    authorityStore.update((state) => ({
      ...state,
      standingPolicies: [
        ...state.standingPolicies.filter((p) => p.policyId !== policy.policyId),
        policy,
      ],
      capabilityGrants: [
        ...state.capabilityGrants.filter((g) => g.grantId !== grant.grantId),
        grant,
      ],
      updatedAt: nowIso,
    }));
  }
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

export async function handleLeadCaptureRequest(input: {
  leadCapture: LeadCaptureService;
  authorityStore: AuthorityStore;
  mappingStore: ProductionMappingStore;
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
    leadCapture,
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

  if (!url.pathname.startsWith("/lead-capture/")) {
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

  if (method === "GET" && url.pathname === "/lead-capture/status") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    json(res, 200, leadCapture.status(), cors);
    return true;
  }

  if (method === "GET" && url.pathname === "/lead-capture/journeys") {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 50;
    json(
      res,
      200,
      {
        journeys: leadCapture.listJourneys(
          Number.isFinite(limit) ? limit : 50,
        ),
        note: "Fixture journeys only. Live Zoho NOT_WIRED. Correlated submission↔CRM included on each journey.",
      },
      cors,
    );
    return true;
  }

  if (method === "GET" && url.pathname.startsWith("/lead-capture/journeys/")) {
    const session = sessionGet();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const journeyId = url.pathname.slice("/lead-capture/journeys/".length);
    const journey = leadCapture.getJourney(journeyId);
    if (!journey) {
      json(res, 404, { error: "NOT_FOUND" }, cors);
      return true;
    }
    json(res, 200, { journey }, cors);
    return true;
  }

  if (method === "POST" && url.pathname === "/lead-capture/run-journey") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    if (
      !isLocalRole(session.session.role) ||
      !roleMayPerform(
        session.session.role as LocalRoleValue,
        "manage_standing_policies",
      )
    ) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Lead capture journey requires administrator manage_standing_policies",
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
    const body = parsed.value;
    const nowIso =
      typeof body.nowIso === "string" ? body.nowIso : new Date().toISOString();
    ensureFixtureCanaryAuthority(authorityStore, mappingStore, nowIso);

    const result = await leadCapture.runJourney({
      authority: buildAuthority(
        authorityStore,
        mappingStore,
        session.session.role,
      ),
      nowIso,
      failDelivery: body.failDelivery === true,
      preferLiveBrowser: body.preferLiveBrowser === true,
      skipCleanup: body.skipCleanup === true,
      targetAccountId:
        typeof body.targetAccountId === "string"
          ? body.targetAccountId
          : "acct-fixture-canary",
    });

    json(
      res,
      200,
      {
        journey: result.journey,
        details: result.details,
        note: "Fixture journey. Live Zoho NOT_WIRED. Synthetic excluded from commerce. Temporal NOT_WIRED. Not R1-complete.",
      },
      cors,
    );
    return true;
  }

  if (method === "POST" && url.pathname === "/lead-capture/cleanup") {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const correlationId =
      typeof parsed.value.correlationId === "string"
        ? parsed.value.correlationId
        : "";
    if (!correlationId) {
      json(res, 400, { error: "correlationId required" }, cors);
      return true;
    }
    const cleanupInput: { correlationId: string; nowIso?: string } = {
      correlationId,
    };
    if (typeof parsed.value.nowIso === "string") {
      cleanupInput.nowIso = parsed.value.nowIso;
    }
    const result = leadCapture.cleanup(cleanupInput);
    json(res, 200, result, cors);
    return true;
  }

  if (
    method === "POST" &&
    url.pathname === "/lead-capture/open-incident-from-failure"
  ) {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    const raw = await readBody(req);
    const parsed = parseJsonObjectBody(raw);
    if (!parsed.ok) {
      json(res, 400, { error: parsed.error }, cors);
      return true;
    }
    const journeyId =
      typeof parsed.value.journeyId === "string" ? parsed.value.journeyId : "";
    if (!journeyId) {
      json(res, 400, { error: "journeyId required" }, cors);
      return true;
    }
    const incidentInput: { journeyId: string; nowIso?: string } = { journeyId };
    if (typeof parsed.value.nowIso === "string") {
      incidentInput.nowIso = parsed.value.nowIso;
    }
    const result = leadCapture.openIncidentFromFailure(incidentInput);
    json(res, result.ok ? 200 : 400, result, cors);
    return true;
  }

  if (
    method === "POST" &&
    url.pathname === "/lead-capture/run-bounded-repair"
  ) {
    const session = sessionMutate();
    if (!session.ok) {
      json(res, 401, { error: session.code, reason: session.reason }, cors);
      return true;
    }
    if (
      !isLocalRole(session.session.role) ||
      !roleMayPerform(
        session.session.role as LocalRoleValue,
        "manage_standing_policies",
      )
    ) {
      json(
        res,
        403,
        {
          error: "FORBIDDEN",
          reason:
            "Bounded repair recovery requires administrator manage_standing_policies",
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
    const journeyId =
      typeof parsed.value.journeyId === "string" ? parsed.value.journeyId : "";
    if (!journeyId) {
      json(res, 400, { error: "journeyId required" }, cors);
      return true;
    }
    const nowIso =
      typeof parsed.value.nowIso === "string"
        ? parsed.value.nowIso
        : new Date().toISOString();
    ensureFixtureCanaryAuthority(authorityStore, mappingStore, nowIso);
    const result = await leadCapture.runBoundedRepairRecovery({
      journeyId,
      authority: buildAuthority(
        authorityStore,
        mappingStore,
        session.session.role,
      ),
      nowIso,
      attemptWeakenTest: parsed.value.attemptWeakenTest !== false,
    });
    json(
      res,
      200,
      {
        ...result,
        note: "Bounded repair recovery. Weaken-test proposals fail closed. Live CMS/Zoho NOT_WIRED. Not R1-complete.",
      },
      cors,
    );
    return true;
  }

  json(res, 404, { error: "NOT_FOUND", path: url.pathname }, cors);
  return true;
}
