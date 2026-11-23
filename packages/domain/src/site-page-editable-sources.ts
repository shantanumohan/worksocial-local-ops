/**
 * T-US-005 / T-F03 — Map sites, pages and editable sources: baseline ID and checks.
 *
 * Offline fixture helper: domain + URL boundaries, pilot page → source binding,
 * form/booking/CRM destinations, editable subset/exclusions, deterministic baseline
 * checks. Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import { createHash } from "node:crypto";
import {
  createPageSnapshot,
  MeasurementMode,
  type DeterministicCheck,
  type PageSnapshotRecord,
} from "./owner-staging.js";
import {
  AdapterWiring,
  BindingKind,
  createFixturePilotMapping,
  proveFixturePilotWritePath,
  resolvePilotWriteGates,
  type BindingKindValue,
  type ProductionMappingState,
} from "./production-mapping.js";
import { ActionClass } from "./standing-authority.js";

export const SitePageMapDecisionCode = {
  OK: "OK",
  EMPTY_DOMAIN: "EMPTY_DOMAIN",
  NO_URL_BOUNDARIES: "NO_URL_BOUNDARIES",
  URL_OUTSIDE_BOUNDARY: "URL_OUTSIDE_BOUNDARY",
  DOMAIN_HOST_MISMATCH: "DOMAIN_HOST_MISMATCH",
  PILOT_PATH_MISMATCH: "PILOT_PATH_MISMATCH",
  NO_SOURCE_BINDING: "NO_SOURCE_BINDING",
  PILOT_NOT_EDITABLE: "PILOT_NOT_EDITABLE",
  PILOT_EXCLUDED: "PILOT_EXCLUDED",
  MISSING_RELEASE_DESTINATIONS: "MISSING_RELEASE_DESTINATIONS",
  BASELINE_CHECKS_FAILED: "BASELINE_CHECKS_FAILED",
  CANONICAL_MISMATCH: "CANONICAL_MISMATCH",
  RELEASE_PATH_UNPROVEN: "RELEASE_PATH_UNPROVEN",
} as const;

export type SitePageMapDecisionCodeValue =
  (typeof SitePageMapDecisionCode)[keyof typeof SitePageMapDecisionCode];

export type SitePageEditableSourcesInput = {
  nowIso: string;
  /** Authorized apex / brand domain label (non-secret). */
  domainHostname: string;
  /** Allowed URL prefixes (must cover pilot page absolute URL). */
  allowedUrlPrefixes: string[];
  /** Absolute pilot page URL. */
  pilotPageUrl: string;
  /** Relative path used for editable subset matching (e.g. /contact). */
  pilotPagePath: string;
  bindingKind: BindingKindValue;
  /** CMS item id, repo path/ref, or canonical URL — never a secret. */
  resourceRef: string;
  editablePaths: string[];
  excludedPaths: string[];
  /** Fixture HTML for timestamped snapshot + deterministic checks. */
  fixtureHtml: string;
  /** When false, form mapping is omitted → release path incomplete. */
  includeFormMapping?: boolean;
  /** When false, CRM ownership is omitted → release path incomplete. */
  includeCrmMapping?: boolean;
  /** When false, booking ownership is omitted (allowed; booking optional). */
  includeBookingMapping?: boolean;
  /**
   * When true, skip proveFixturePilotWritePath ownership evidence —
   * release path stays unproven (fail closed).
   */
  skipOwnershipProof?: boolean;
};

export type SitePageInventorySummary = {
  siteCount: number;
  bindingCount: number;
  formCount: number;
  bookingCount: number;
  crmCount: number;
  journeyCount: number;
  editableCount: number;
  exclusionCount: number;
  sourceKind: BindingKindValue | null;
};

export type SitePageEditableSourcesDecision = {
  ok: boolean;
  code: SitePageMapDecisionCodeValue;
  details: string[];
  baselineId: string | null;
  inventory: SitePageInventorySummary;
  checks: DeterministicCheck[];
  snapshot: PageSnapshotRecord | null;
  journeyStages: string[];
  releasePathId: string | null;
  releasePathProven: boolean;
  mapping: ProductionMappingState | null;
  fixtureOnly: true;
  /** Always NONE for this offline evaluator — no live adapters. */
  externalEffects: "NONE";
  /** Never claim live VERIFIED from fixture mapping. */
  liveVerifiedClaimed: false;
};

export const SITE_PAGE_EDITABLE_SOURCES_RELATED_CASE_IDS = [
  "T-US-005",
  "T-F03",
] as const;

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, "");
}

/** Exact host or subdomain of the authorized domain — never a sibling prefix. */
function hostBelongsToDomain(host: string, authorizedDomain: string): boolean {
  const h = normalizeHostname(host);
  const d = normalizeHostname(authorizedDomain);
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Segment-safe boundary match: equality or path-segment prefix only.
 * Rejects `…/admin` matching `…/administrator`.
 */
function urlWithinBoundaries(
  pageUrl: string,
  prefixes: readonly string[],
): boolean {
  let href: string;
  try {
    href = new URL(pageUrl).href;
  } catch {
    return false;
  }
  return prefixes.some((prefix) => {
    try {
      const bound = new URL(prefix).href;
      if (href === bound) return true;
      const segmentBound = bound.endsWith("/") ? bound : `${bound}/`;
      return href.startsWith(segmentBound);
    } catch {
      return false;
    }
  });
}

function digestBaseline(parts: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(parts))
    .digest("hex")
    .slice(0, 32);
}

function emptyInventory(
  editableCount: number,
  exclusionCount: number,
  sourceKind: BindingKindValue | null,
): SitePageInventorySummary {
  return {
    siteCount: 0,
    bindingCount: 0,
    formCount: 0,
    bookingCount: 0,
    crmCount: 0,
    journeyCount: 0,
    editableCount,
    exclusionCount,
    sourceKind,
  };
}

function pageAssetIdForPath(pilotPath: string): string {
  const slug = pilotPath.replace(/^\//, "").replace(/[/]+/g, "-") || "home";
  return `page-${slug}`;
}

/**
 * Rewrite the seeded fixture pilot mapping so form/write-path assets,
 * handler URL, and site id reflect the supplied pilot page — not a stale
 * hard-coded example when callers pass a different path/host.
 */
function mapReleasePathToPilotPage(input: {
  seeded: ProductionMappingState;
  writePathId: string;
  siteId: string;
  pilotPageUrl: string;
  pilotPath: string;
  bindingKind: BindingKindValue;
  resourceRef: string;
  includeBooking: boolean;
  nowIso: string;
}): { state: ProductionMappingState; assetId: string } {
  const assetId = pageAssetIdForPath(input.pilotPath);
  const origin = new URL(input.pilotPageUrl).origin;
  const handlerEndpoint = `${origin}/api/forms/contact`;

  let state: ProductionMappingState = {
    ...input.seeded,
    sites: [input.siteId],
    bindings: input.seeded.bindings.map((b) =>
      b.bindingId === "bind-site-home"
        ? {
            ...b,
            siteId: input.siteId,
            kind: input.bindingKind,
            resourceRef: input.resourceRef,
            displayName: `Pilot ${input.bindingKind} binding (fixture)`,
            adapterWiring: AdapterWiring.FIXTURE,
            updatedAtIso: input.nowIso,
          }
        : b,
    ),
    forms: input.seeded.forms.map((f) =>
      f.formId === "form-contact"
        ? {
            ...f,
            siteId: input.siteId,
            pageAssetId: assetId,
            handlerEndpoint,
            updatedAtIso: input.nowIso,
          }
        : f,
    ),
    bookingOwnership: input.seeded.bookingOwnership.map((b) => ({
      ...b,
      siteId: input.siteId,
      updatedAtIso: input.nowIso,
    })),
    writePaths: input.seeded.writePaths.map((p) =>
      p.writePathId === input.writePathId
        ? {
            ...p,
            siteId: input.siteId,
            assetId,
            bookingOwnershipId: input.includeBooking
              ? p.bookingOwnershipId
              : null,
          }
        : p,
    ),
    journeys: input.seeded.journeys.map((j) => ({
      ...j,
      siteId: input.siteId,
    })),
    updatedAt: input.nowIso,
  };

  if (!input.includeBooking) {
    state = { ...state, bookingOwnership: [] };
  }

  return { state, assetId };
}

/**
 * Evaluate F03 site/page/editable-source mapping and mint a fixture baseline ID.
 * Fail closed when boundaries, binding, editable subset, destinations, checks,
 * or release-path proof are incomplete. Never labels LIVE or VERIFIED.
 */
export function evaluateSitePageEditableSources(
  input: SitePageEditableSourcesInput,
): SitePageEditableSourcesDecision {
  const details: string[] = [];
  const editablePaths = input.editablePaths.map(normalizePath);
  const excludedPaths = input.excludedPaths.map(normalizePath);
  const pilotPath = normalizePath(input.pilotPagePath);
  const includeForm = input.includeFormMapping !== false;
  const includeCrm = input.includeCrmMapping !== false;
  const includeBooking = input.includeBookingMapping !== false;
  const authorizedDomain = normalizeHostname(input.domainHostname);

  const baseFail = (
    code: SitePageMapDecisionCodeValue,
    extraDetails: string[],
  ): SitePageEditableSourcesDecision => ({
    ok: false,
    code,
    details: [...details, ...extraDetails],
    baselineId: null,
    inventory: emptyInventory(
      editablePaths.length,
      excludedPaths.length,
      input.resourceRef.trim() ? input.bindingKind : null,
    ),
    checks: [],
    snapshot: null,
    journeyStages: [],
    releasePathId: null,
    releasePathProven: false,
    mapping: null,
    fixtureOnly: true,
    externalEffects: "NONE",
    liveVerifiedClaimed: false,
  });

  if (!authorizedDomain) {
    return baseFail(SitePageMapDecisionCode.EMPTY_DOMAIN, [
      "Authorized domain hostname is required",
    ]);
  }
  details.push(`Domain authorized: ${authorizedDomain}`);

  if (input.allowedUrlPrefixes.length === 0) {
    return baseFail(SitePageMapDecisionCode.NO_URL_BOUNDARIES, [
      "At least one allowed URL boundary prefix is required",
    ]);
  }

  let pilotUrl: URL;
  try {
    pilotUrl = new URL(input.pilotPageUrl);
  } catch {
    return baseFail(SitePageMapDecisionCode.URL_OUTSIDE_BOUNDARY, [
      `Pilot URL ${input.pilotPageUrl} is not a valid absolute URL`,
    ]);
  }

  if (!hostBelongsToDomain(pilotUrl.hostname, authorizedDomain)) {
    return baseFail(SitePageMapDecisionCode.DOMAIN_HOST_MISMATCH, [
      `Pilot host ${pilotUrl.hostname} is outside authorized domain ${authorizedDomain}`,
    ]);
  }

  for (const prefix of input.allowedUrlPrefixes) {
    try {
      const boundHost = new URL(prefix).hostname;
      if (!hostBelongsToDomain(boundHost, authorizedDomain)) {
        return baseFail(SitePageMapDecisionCode.DOMAIN_HOST_MISMATCH, [
          `Boundary ${prefix} host ${boundHost} is outside authorized domain ${authorizedDomain}`,
        ]);
      }
    } catch {
      return baseFail(SitePageMapDecisionCode.URL_OUTSIDE_BOUNDARY, [
        `Boundary ${prefix} is not a valid absolute URL`,
      ]);
    }
  }

  if (!urlWithinBoundaries(input.pilotPageUrl, input.allowedUrlPrefixes)) {
    return baseFail(SitePageMapDecisionCode.URL_OUTSIDE_BOUNDARY, [
      `Pilot URL ${input.pilotPageUrl} is outside allowed boundaries`,
    ]);
  }
  details.push("Pilot page URL within allowed boundaries");

  const urlPath = normalizePath(pilotUrl.pathname);
  if (urlPath !== pilotPath) {
    return baseFail(SitePageMapDecisionCode.PILOT_PATH_MISMATCH, [
      `Pilot path ${pilotPath} does not match URL pathname ${urlPath}`,
    ]);
  }
  details.push("Pilot path matches pilot URL pathname");

  if (!input.resourceRef.trim()) {
    return baseFail(SitePageMapDecisionCode.NO_SOURCE_BINDING, [
      "Pilot page requires a CMS/repo/website source binding resourceRef",
    ]);
  }

  if (excludedPaths.includes(pilotPath)) {
    return baseFail(SitePageMapDecisionCode.PILOT_EXCLUDED, [
      `Pilot path ${pilotPath} is in the exclusion set`,
    ]);
  }

  if (!editablePaths.includes(pilotPath)) {
    return baseFail(SitePageMapDecisionCode.PILOT_NOT_EDITABLE, [
      `Pilot path ${pilotPath} is not in the editable subset`,
    ]);
  }
  details.push(
    `Editable subset includes pilot (${editablePaths.length} paths; ${excludedPaths.length} exclusions)`,
  );

  if (!includeForm || !includeCrm) {
    return baseFail(SitePageMapDecisionCode.MISSING_RELEASE_DESTINATIONS, [
      "Pilot release path requires form and CRM destination mapping",
    ]);
  }

  const siteId = `site-${authorizedDomain.replace(/[^a-z0-9.-]/g, "-")}`;
  const { state: seeded, writePathId } = createFixturePilotMapping(input.nowIso);
  const mapped = mapReleasePathToPilotPage({
    seeded,
    writePathId,
    siteId,
    pilotPageUrl: input.pilotPageUrl,
    pilotPath,
    bindingKind: input.bindingKind,
    resourceRef: input.resourceRef.trim(),
    includeBooking,
    nowIso: input.nowIso,
  });
  let mapping = mapped.state;
  const assetId = mapped.assetId;

  if (input.skipOwnershipProof) {
    details.push("Ownership proof skipped — release path unproven");
    return {
      ok: false,
      code: SitePageMapDecisionCode.RELEASE_PATH_UNPROVEN,
      details,
      baselineId: null,
      inventory: {
        siteCount: mapping.sites.length,
        bindingCount: mapping.bindings.length,
        formCount: mapping.forms.length,
        bookingCount: mapping.bookingOwnership.length,
        crmCount: mapping.crmOwnership.length,
        journeyCount: mapping.journeys.length,
        editableCount: editablePaths.length,
        exclusionCount: excludedPaths.length,
        sourceKind: input.bindingKind,
      },
      checks: [],
      snapshot: null,
      journeyStages: mapping.journeys[0]?.stages ?? [],
      releasePathId: writePathId,
      releasePathProven: false,
      mapping,
      fixtureOnly: true,
      externalEffects: "NONE",
      liveVerifiedClaimed: false,
    };
  }

  mapping = proveFixturePilotWritePath(mapping, writePathId, input.nowIso);

  const gate = resolvePilotWriteGates({
    actionClass: ActionClass.ROUTINE_CUSTOMER_SERVICE,
    writePathId,
    channelId: "owned-site",
    assetId,
    operation: "submit_form_canary",
    mapping,
  });
  if (
    !gate.ownershipProven ||
    !gate.readEvidencePresent ||
    gate.prerequisiteMissing ||
    gate.matchedWritePath?.writePathId !== writePathId ||
    gate.matchedWritePath.assetId !== assetId
  ) {
    return {
      ok: false,
      code: SitePageMapDecisionCode.RELEASE_PATH_UNPROVEN,
      details: [
        ...details,
        `Release path gates failed: ${gate.details.join("; ") || "unknown"}`,
      ],
      baselineId: null,
      inventory: {
        siteCount: mapping.sites.length,
        bindingCount: mapping.bindings.length,
        formCount: mapping.forms.length,
        bookingCount: mapping.bookingOwnership.length,
        crmCount: mapping.crmOwnership.length,
        journeyCount: mapping.journeys.length,
        editableCount: editablePaths.length,
        exclusionCount: excludedPaths.length,
        sourceKind: input.bindingKind,
      },
      checks: [],
      snapshot: null,
      journeyStages: mapping.journeys[0]?.stages ?? [],
      releasePathId: writePathId,
      releasePathProven: false,
      mapping,
      fixtureOnly: true,
      externalEffects: "NONE",
      liveVerifiedClaimed: false,
    };
  }
  details.push(
    `Release path ${writePathId} proven for asset ${assetId} with fixture read evidence`,
  );

  const snapshot = createPageSnapshot({
    snapshotId: `snap-pilot-${input.nowIso}`,
    siteId,
    pagePath: pilotPath,
    html: input.fixtureHtml,
    measurementMode: MeasurementMode.FIXTURE,
    sourceLabel: "fixture-html",
    nowIso: input.nowIso,
  });
  const failing = snapshot.checks.filter((c) => !c.passed);
  if (failing.length > 0) {
    return {
      ok: false,
      code: SitePageMapDecisionCode.BASELINE_CHECKS_FAILED,
      details: [
        ...details,
        `Baseline checks failed: ${failing.map((c) => c.checkId).join(", ")}`,
      ],
      baselineId: null,
      inventory: {
        siteCount: mapping.sites.length,
        bindingCount: mapping.bindings.length,
        formCount: mapping.forms.length,
        bookingCount: mapping.bookingOwnership.length,
        crmCount: mapping.crmOwnership.length,
        journeyCount: mapping.journeys.length,
        editableCount: editablePaths.length,
        exclusionCount: excludedPaths.length,
        sourceKind: input.bindingKind,
      },
      checks: snapshot.checks,
      snapshot,
      journeyStages: mapping.journeys[0]?.stages ?? [],
      releasePathId: writePathId,
      releasePathProven: true,
      mapping,
      fixtureOnly: true,
      externalEffects: "NONE",
      liveVerifiedClaimed: false,
    };
  }

  const expectedCanonical = pilotUrl.href;
  const observedCanonical = snapshot.canonical
    ? (() => {
        try {
          return new URL(snapshot.canonical).href;
        } catch {
          return null;
        }
      })()
    : null;
  if (observedCanonical !== expectedCanonical) {
    return {
      ok: false,
      code: SitePageMapDecisionCode.CANONICAL_MISMATCH,
      details: [
        ...details,
        `Snapshot canonical ${snapshot.canonical ?? "missing"} does not match pilot URL ${expectedCanonical}`,
      ],
      baselineId: null,
      inventory: {
        siteCount: mapping.sites.length,
        bindingCount: mapping.bindings.length,
        formCount: mapping.forms.length,
        bookingCount: mapping.bookingOwnership.length,
        crmCount: mapping.crmOwnership.length,
        journeyCount: mapping.journeys.length,
        editableCount: editablePaths.length,
        exclusionCount: excludedPaths.length,
        sourceKind: input.bindingKind,
      },
      checks: snapshot.checks,
      snapshot,
      journeyStages: mapping.journeys[0]?.stages ?? [],
      releasePathId: writePathId,
      releasePathProven: true,
      mapping,
      fixtureOnly: true,
      externalEffects: "NONE",
      liveVerifiedClaimed: false,
    };
  }
  details.push(
    `Baseline checks passed (${snapshot.checks.length}/${snapshot.checks.length}); canonical matches pilot`,
  );

  const inventory: SitePageInventorySummary = {
    siteCount: mapping.sites.length,
    bindingCount: mapping.bindings.length,
    formCount: mapping.forms.length,
    bookingCount: mapping.bookingOwnership.length,
    crmCount: mapping.crmOwnership.length,
    journeyCount: mapping.journeys.length,
    editableCount: editablePaths.length,
    exclusionCount: excludedPaths.length,
    sourceKind: input.bindingKind,
  };

  const baselineId = digestBaseline({
    domain: authorizedDomain,
    pilotPageUrl: expectedCanonical,
    pilotPagePath: pilotPath,
    resourceRef: input.resourceRef.trim(),
    bindingKind: input.bindingKind,
    editablePaths,
    excludedPaths,
    contentDigest: snapshot.contentDigest,
    checkIds: snapshot.checks.map((c) => c.checkId),
    writePathId,
    assetId,
    measurementMode: MeasurementMode.FIXTURE,
  });
  details.push(`Baseline ID minted: ${baselineId}`);

  return {
    ok: true,
    code: SitePageMapDecisionCode.OK,
    details,
    baselineId,
    inventory,
    checks: snapshot.checks,
    snapshot,
    journeyStages: mapping.journeys[0]?.stages ?? [],
    releasePathId: writePathId,
    releasePathProven: true,
    mapping,
    fixtureOnly: true,
    externalEffects: "NONE",
    liveVerifiedClaimed: false,
  };
}

/** Convenience: BindingKind re-export for callers that only import this module. */
export { BindingKind };
