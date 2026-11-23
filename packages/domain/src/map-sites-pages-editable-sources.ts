/**
 * T-F03 — Map sites, pages and editable sources (complete F03 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F03 evidence
 * package — domain + URL boundary inventory with source counts/exclusions,
 * timestamped HTML + screenshot snapshot for the pilot page, CMS/repo source
 * binding + deployment target, journey graph (booking/form/CRM) with owners,
 * scope grant draft (editable subset + exclusions), and baseline ID with
 * passing/failing checks. Each pilot page must have a proven editable source
 * and release path. Incomplete packages, 100% coverage claims when discovery
 * is incomplete, wrong-environment publish, redirects outside allowed domain,
 * unbound page writes, and false live-verified claims are refused. Live
 * provider wiring stays NOT_WIRED. Pure domain — no network I/O. Fixture
 * ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from open T-US-005 behavior acceptance
 * (`SITE_PAGE_EDITABLE_SOURCES_BASELINE`) — this records the complete F03
 * flow evidence package, not the baseline-ID happy-path summary alone.
 */

export const SourceBindingKind = {
  CMS_ITEM: "cms_item",
  REPOSITORY_PATH: "repository_path",
} as const;

export type SourceBindingKindValue =
  (typeof SourceBindingKind)[keyof typeof SourceBindingKind];

export const JourneyDestinationKind = {
  BOOKING: "booking",
  FORM: "form",
  CRM: "crm",
} as const;

export type JourneyDestinationKindValue =
  (typeof JourneyDestinationKind)[keyof typeof JourneyDestinationKind];

export const REQUIRED_JOURNEY_DESTINATION_KINDS = [
  JourneyDestinationKind.BOOKING,
  JourneyDestinationKind.FORM,
  JourneyDestinationKind.CRM,
] as const;

export type DomainBoundaryRecord = {
  domain: string;
  allowedUrlPrefixes: readonly string[];
};

export type SiteInventoryRecord = {
  inventoryId: string;
  discoveredSourceCount: number;
  excludedSourceCount: number;
  /** True when discovery could not cover the full authorized surface. */
  discoveryIncomplete: boolean;
};

export type PilotPageSnapshot = {
  pageId: string;
  pageUrl: string;
  canonicalUrl: string;
  capturedAtIso: string;
  htmlArtifactRef: string;
  screenshotArtifactRef: string;
};

export type SourceBindingRecord = {
  pageId: string;
  bindingKind: SourceBindingKindValue;
  sourceRef: string;
  currentRevision: string;
  deploymentTarget: string;
  ownershipVerified: boolean;
};

export type JourneyGraphNode = {
  nodeId: string;
  kind: JourneyDestinationKindValue;
  destinationRef: string;
  owner: string;
  accessible: boolean;
};

export type ScopeGrantDraft = {
  grantId: string;
  editablePageIds: readonly string[];
  excludedPageIds: readonly string[];
  unboundPagesRemainReadOnly: boolean;
};

export type BaselineCheckResult = {
  checkId: string;
  category: "technical" | "factual" | "performance" | "conversion";
  passed: boolean;
  detail: string;
};

export type BaselineEvidenceRecord = {
  baselineId: string;
  recordedAtIso: string;
  checks: readonly BaselineCheckResult[];
};

export type MapSitesPagesEditableSourcesInput = {
  packageId: string;
  domainBoundary: DomainBoundaryRecord;
  inventory: SiteInventoryRecord;
  pilotSnapshot: PilotPageSnapshot;
  sourceBinding: SourceBindingRecord;
  journeyGraph: readonly JourneyGraphNode[];
  scopeGrant: ScopeGrantDraft;
  baseline: BaselineEvidenceRecord;
  /** Claim 100% coverage despite incomplete discovery — must refuse. */
  claimFullCoverageDespiteIncompleteDiscovery: boolean;
  /** Attempt publish into a non-authorized environment — must refuse. */
  attemptPublishWrongEnvironment: boolean;
  /** Redirect target outside allowed domain — must refuse. */
  redirectOutsideAllowedDomain: boolean;
  /** Attempt write on an unbound/read-only page — must refuse. */
  attemptWriteUnboundPage: boolean;
  /** Claim the F03 path is live-verified — must refuse offline. */
  claimLiveVerifiedSiteMap: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type MapSitesPagesEditableSourcesDecision =
  | {
      allowed: true;
      code: "MAP_SITES_PAGES_EDITABLE_SOURCES_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        inventoryId: string;
        discoveredSourceCount: number;
        excludedSourceCount: number;
        discoveryIncomplete: boolean;
        pilotPageId: string;
        snapshotCapturedAtIso: string;
        htmlArtifactRef: string;
        screenshotArtifactRef: string;
        sourceBindingRef: string;
        deploymentTarget: string;
        journeyNodeCount: number;
        everyJourneyKindHasOwner: true;
        scopeGrantId: string;
        editablePageCount: number;
        excludedPageCount: number;
        unboundPagesRemainReadOnly: true;
        baselineId: string;
        baselineCheckCount: number;
        baselinePassingCount: number;
        baselineFailingCount: number;
        provenEditableSourceAndReleasePath: true;
        siteMapVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F03_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "SITES_PAGES_EDITABLE_SOURCES_RECORDED";
        recoveryPath: "KEEP_UNBOUND_READ_ONLY_EXPOSE_DISCOVERY_GAPS";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "DOMAIN_BOUNDARY_REQUIRED"
        | "INVENTORY_REQUIRED"
        | "PILOT_SNAPSHOT_REQUIRED"
        | "SOURCE_BINDING_REQUIRED"
        | "JOURNEY_GRAPH_REQUIRED"
        | "SCOPE_GRANT_REQUIRED"
        | "BASELINE_EVIDENCE_REQUIRED"
        | "FULL_COVERAGE_DESPITE_INCOMPLETE_DISCOVERY_REFUSED"
        | "WRONG_ENVIRONMENT_PUBLISH_REFUSED"
        | "REDIRECT_OUTSIDE_ALLOWED_DOMAIN_REFUSED"
        | "UNBOUND_PAGE_WRITE_REFUSED"
        | "FALSE_LIVE_VERIFIED_SITE_MAP_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        inventoryId: string | null;
        discoveredSourceCount: number;
        excludedSourceCount: number;
        discoveryIncomplete: boolean;
        pilotPageId: string | null;
        snapshotCapturedAtIso: string | null;
        htmlArtifactRef: string | null;
        screenshotArtifactRef: string | null;
        sourceBindingRef: string | null;
        deploymentTarget: string | null;
        journeyNodeCount: number;
        everyJourneyKindHasOwner: boolean;
        scopeGrantId: string | null;
        editablePageCount: number;
        excludedPageCount: number;
        unboundPagesRemainReadOnly: boolean;
        baselineId: string | null;
        baselineCheckCount: number;
        baselinePassingCount: number;
        baselineFailingCount: number;
        provenEditableSourceAndReleasePath: boolean;
        siteMapVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_DOMAIN_BOUNDARY"
          | "AWAITING_INVENTORY"
          | "AWAITING_PILOT_SNAPSHOT"
          | "AWAITING_SOURCE_BINDING"
          | "AWAITING_JOURNEY_GRAPH"
          | "AWAITING_SCOPE_GRANT"
          | "AWAITING_BASELINE_EVIDENCE";
        recoveryPath:
          | "AUTHORIZE_DOMAIN_AND_URL_BOUNDARIES"
          | "RECORD_INVENTORY_WITH_EXCLUSIONS"
          | "CAPTURE_TIMESTAMPED_PILOT_SNAPSHOT"
          | "BIND_CMS_OR_REPO_WITH_DEPLOY_TARGET"
          | "MAP_JOURNEY_DESTINATIONS_WITH_OWNERS"
          | "DRAFT_SCOPE_GRANT_KEEP_UNBOUND_READ_ONLY"
          | "RUN_BASELINE_CHECKS_RECORD_ID"
          | "KEEP_UNBOUND_READ_ONLY_EXPOSE_DISCOVERY_GAPS";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const MAP_SITES_PAGES_EDITABLE_SOURCES_RELATED_CASE_IDS = [
  "T-F03",
] as const;

function preservedInputCount(
  input: MapSitesPagesEditableSourcesInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.domainBoundary.domain.trim() ? 1 : 0) +
    (input.inventory.inventoryId.trim() ? 1 : 0) +
    (input.pilotSnapshot.pageId.trim() ? 1 : 0) +
    (input.sourceBinding.sourceRef.trim() ? 1 : 0) +
    (input.journeyGraph.length > 0 ? 1 : 0) +
    (input.scopeGrant.grantId.trim() ? 1 : 0) +
    (input.baseline.baselineId.trim() ? 1 : 0)
  );
}

function domainBoundaryOk(b: DomainBoundaryRecord): boolean {
  return (
    b.domain.trim().length > 0 &&
    b.allowedUrlPrefixes.length > 0 &&
    b.allowedUrlPrefixes.every((p) => p.trim().length > 0)
  );
}

function inventoryOk(inv: SiteInventoryRecord): boolean {
  return (
    inv.inventoryId.trim().length > 0 &&
    inv.discoveredSourceCount >= 0 &&
    inv.excludedSourceCount >= 0 &&
    Number.isFinite(inv.discoveredSourceCount) &&
    Number.isFinite(inv.excludedSourceCount)
  );
}

function pilotSnapshotOk(s: PilotPageSnapshot): boolean {
  return (
    s.pageId.trim().length > 0 &&
    s.pageUrl.trim().length > 0 &&
    s.canonicalUrl.trim().length > 0 &&
    s.capturedAtIso.trim().length > 0 &&
    s.htmlArtifactRef.trim().length > 0 &&
    s.screenshotArtifactRef.trim().length > 0
  );
}

function sourceBindingOk(
  binding: SourceBindingRecord,
  pilotPageId: string,
): boolean {
  return (
    binding.pageId.trim() === pilotPageId.trim() &&
    binding.pageId.trim().length > 0 &&
    binding.sourceRef.trim().length > 0 &&
    binding.currentRevision.trim().length > 0 &&
    binding.deploymentTarget.trim().length > 0 &&
    binding.ownershipVerified
  );
}

function everyJourneyKindHasOwner(
  nodes: readonly JourneyGraphNode[],
): boolean {
  const byKind = new Map<JourneyDestinationKindValue, JourneyGraphNode>();
  for (const n of nodes) {
    if (
      !n.nodeId.trim() ||
      !n.destinationRef.trim() ||
      !n.owner.trim()
    ) {
      return false;
    }
    byKind.set(n.kind, n);
  }
  return REQUIRED_JOURNEY_DESTINATION_KINDS.every((k) => byKind.has(k));
}

function scopeGrantOk(
  grant: ScopeGrantDraft,
  pilotPageId: string,
): boolean {
  if (!grant.grantId.trim()) return false;
  if (!grant.unboundPagesRemainReadOnly) return false;
  if (!grant.editablePageIds.includes(pilotPageId)) return false;
  if (grant.excludedPageIds.includes(pilotPageId)) return false;
  const overlap = grant.editablePageIds.filter((id) =>
    grant.excludedPageIds.includes(id),
  );
  return overlap.length === 0;
}

function baselineOk(b: BaselineEvidenceRecord): boolean {
  if (!b.baselineId.trim() || !b.recordedAtIso.trim()) return false;
  if (b.checks.length === 0) return false;
  const categories = new Set(b.checks.map((c) => c.category));
  const required = ["technical", "factual", "performance", "conversion"];
  if (!required.every((c) => categories.has(c as BaselineCheckResult["category"]))) {
    return false;
  }
  return b.checks.every(
    (c) => c.checkId.trim().length > 0 && c.detail.trim().length > 0,
  );
}

/**
 * Evaluate the T-F03 map-sites-pages-editable-sources path offline.
 * Complete F03 evidence package → MAP_SITES_PAGES_EDITABLE_SOURCES_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateMapSitesPagesEditableSources(
  input: MapSitesPagesEditableSourcesInput,
): MapSitesPagesEditableSourcesDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const journeyOwnerOk = everyJourneyKindHasOwner(input.journeyGraph);
  const passing = input.baseline.checks.filter((c) => c.passed).length;
  const failing = input.baseline.checks.filter((c) => !c.passed).length;
  const proven =
    sourceBindingOk(input.sourceBinding, input.pilotSnapshot.pageId) &&
    scopeGrantOk(input.scopeGrant, input.pilotSnapshot.pageId) &&
    baselineOk(input.baseline);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_DOMAIN_BOUNDARY"
      | "AWAITING_INVENTORY"
      | "AWAITING_PILOT_SNAPSHOT"
      | "AWAITING_SOURCE_BINDING"
      | "AWAITING_JOURNEY_GRAPH"
      | "AWAITING_SCOPE_GRANT"
      | "AWAITING_BASELINE_EVIDENCE",
    recoveryPath:
      | "AUTHORIZE_DOMAIN_AND_URL_BOUNDARIES"
      | "RECORD_INVENTORY_WITH_EXCLUSIONS"
      | "CAPTURE_TIMESTAMPED_PILOT_SNAPSHOT"
      | "BIND_CMS_OR_REPO_WITH_DEPLOY_TARGET"
      | "MAP_JOURNEY_DESTINATIONS_WITH_OWNERS"
      | "DRAFT_SCOPE_GRANT_KEEP_UNBOUND_READ_ONLY"
      | "RUN_BASELINE_CHECKS_RECORD_ID"
      | "KEEP_UNBOUND_READ_ONLY_EXPOSE_DISCOVERY_GAPS",
  ): NonNullable<
    Extract<
      MapSitesPagesEditableSourcesDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    inventoryId: input.inventory.inventoryId.trim() || null,
    discoveredSourceCount: input.inventory.discoveredSourceCount,
    excludedSourceCount: input.inventory.excludedSourceCount,
    discoveryIncomplete: input.inventory.discoveryIncomplete,
    pilotPageId: input.pilotSnapshot.pageId.trim() || null,
    snapshotCapturedAtIso: input.pilotSnapshot.capturedAtIso.trim() || null,
    htmlArtifactRef: input.pilotSnapshot.htmlArtifactRef.trim() || null,
    screenshotArtifactRef:
      input.pilotSnapshot.screenshotArtifactRef.trim() || null,
    sourceBindingRef: input.sourceBinding.sourceRef.trim() || null,
    deploymentTarget: input.sourceBinding.deploymentTarget.trim() || null,
    journeyNodeCount: input.journeyGraph.length,
    everyJourneyKindHasOwner: journeyOwnerOk,
    scopeGrantId: input.scopeGrant.grantId.trim() || null,
    editablePageCount: input.scopeGrant.editablePageIds.length,
    excludedPageCount: input.scopeGrant.excludedPageIds.length,
    unboundPagesRemainReadOnly: input.scopeGrant.unboundPagesRemainReadOnly,
    baselineId: input.baseline.baselineId.trim() || null,
    baselineCheckCount: input.baseline.checks.length,
    baselinePassingCount: passing,
    baselineFailingCount: failing,
    provenEditableSourceAndReleasePath: proven,
    siteMapVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live map-sites-pages-editable-sources provider wiring remains NOT_WIRED — refuse live wiring (T-F03)",
      ],
    };
  }

  if (input.claimLiveVerifiedSiteMap) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_SITE_MAP_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified site-map claim offline (T-F03) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptPublishWrongEnvironment) {
    return {
      allowed: false,
      code: "WRONG_ENVIRONMENT_PUBLISH_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "WRONG_ENVIRONMENT_PUBLISH_REFUSED",
        "BLOCKED",
        "KEEP_UNBOUND_READ_ONLY_EXPOSE_DISCOVERY_GAPS",
      ),
      reasons: [
        "Wrong environment: block publication until the authorized deploy target is confirmed (T-F03)",
      ],
    };
  }

  if (input.redirectOutsideAllowedDomain) {
    return {
      allowed: false,
      code: "REDIRECT_OUTSIDE_ALLOWED_DOMAIN_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "REDIRECT_OUTSIDE_ALLOWED_DOMAIN_REFUSED",
        "BLOCKED",
        "AUTHORIZE_DOMAIN_AND_URL_BOUNDARIES",
      ),
      reasons: [
        "Redirect outside allowed domain must stop and request a binding (T-F03)",
      ],
    };
  }

  if (input.attemptWriteUnboundPage) {
    return {
      allowed: false,
      code: "UNBOUND_PAGE_WRITE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "UNBOUND_PAGE_WRITE_REFUSED",
        "BLOCKED",
        "DRAFT_SCOPE_GRANT_KEEP_UNBOUND_READ_ONLY",
      ),
      reasons: [
        "Unbound pages remain read-only — write attempts refused (T-F03)",
      ],
    };
  }

  if (
    input.claimFullCoverageDespiteIncompleteDiscovery &&
    input.inventory.discoveryIncomplete
  ) {
    return {
      allowed: false,
      code: "FULL_COVERAGE_DESPITE_INCOMPLETE_DISCOVERY_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "FULL_COVERAGE_DESPITE_INCOMPLETE_DISCOVERY_REFUSED",
        "BLOCKED",
        "KEEP_UNBOUND_READ_ONLY_EXPOSE_DISCOVERY_GAPS",
      ),
      reasons: [
        "Incomplete discovery must expose denominator and gaps — never claim 100% coverage (T-F03)",
      ],
    };
  }

  if (!input.packageId.trim() || !domainBoundaryOk(input.domainBoundary)) {
    return {
      allowed: false,
      code: "DOMAIN_BOUNDARY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DOMAIN_BOUNDARY_INCOMPLETE",
        "AWAITING_DOMAIN_BOUNDARY",
        "AUTHORIZE_DOMAIN_AND_URL_BOUNDARIES",
      ),
      reasons: [
        "F03 requires an authorized domain and allowed URL boundaries (T-F03)",
      ],
    };
  }

  if (!inventoryOk(input.inventory)) {
    return {
      allowed: false,
      code: "INVENTORY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INVENTORY_INCOMPLETE",
        "AWAITING_INVENTORY",
        "RECORD_INVENTORY_WITH_EXCLUSIONS",
      ),
      reasons: [
        "F03 requires inventory with source counts and exclusions (T-F03)",
      ],
    };
  }

  if (!pilotSnapshotOk(input.pilotSnapshot)) {
    return {
      allowed: false,
      code: "PILOT_SNAPSHOT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PILOT_SNAPSHOT_INCOMPLETE",
        "AWAITING_PILOT_SNAPSHOT",
        "CAPTURE_TIMESTAMPED_PILOT_SNAPSHOT",
      ),
      reasons: [
        "F03 requires a timestamped HTML and screenshot snapshot for the pilot page (T-F03)",
      ],
    };
  }

  if (!sourceBindingOk(input.sourceBinding, input.pilotSnapshot.pageId)) {
    return {
      allowed: false,
      code: "SOURCE_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SOURCE_BINDING_INCOMPLETE",
        "AWAITING_SOURCE_BINDING",
        "BIND_CMS_OR_REPO_WITH_DEPLOY_TARGET",
      ),
      reasons: [
        "F03 requires CMS/repo source binding with ownership and deployment target (T-F03)",
      ],
    };
  }

  if (input.journeyGraph.length === 0 || !journeyOwnerOk) {
    return {
      allowed: false,
      code: "JOURNEY_GRAPH_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "JOURNEY_GRAPH_INCOMPLETE",
        "AWAITING_JOURNEY_GRAPH",
        "MAP_JOURNEY_DESTINATIONS_WITH_OWNERS",
      ),
      reasons: [
        "F03 requires a journey graph covering booking/form/CRM destinations with owners (T-F03)",
      ],
    };
  }

  if (!scopeGrantOk(input.scopeGrant, input.pilotSnapshot.pageId)) {
    return {
      allowed: false,
      code: "SCOPE_GRANT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SCOPE_GRANT_INCOMPLETE",
        "AWAITING_SCOPE_GRANT",
        "DRAFT_SCOPE_GRANT_KEEP_UNBOUND_READ_ONLY",
      ),
      reasons: [
        "F03 requires a scope grant draft with editable subset, exclusions, and unbound read-only (T-F03)",
      ],
    };
  }

  if (!baselineOk(input.baseline)) {
    return {
      allowed: false,
      code: "BASELINE_EVIDENCE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BASELINE_EVIDENCE_INCOMPLETE",
        "AWAITING_BASELINE_EVIDENCE",
        "RUN_BASELINE_CHECKS_RECORD_ID",
      ),
      reasons: [
        "F03 requires a baseline ID with technical/factual/performance/conversion checks (T-F03)",
      ],
    };
  }

  return {
    allowed: true,
    code: "MAP_SITES_PAGES_EDITABLE_SOURCES_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      inventoryId: input.inventory.inventoryId.trim(),
      discoveredSourceCount: input.inventory.discoveredSourceCount,
      excludedSourceCount: input.inventory.excludedSourceCount,
      discoveryIncomplete: input.inventory.discoveryIncomplete,
      pilotPageId: input.pilotSnapshot.pageId.trim(),
      snapshotCapturedAtIso: input.pilotSnapshot.capturedAtIso.trim(),
      htmlArtifactRef: input.pilotSnapshot.htmlArtifactRef.trim(),
      screenshotArtifactRef: input.pilotSnapshot.screenshotArtifactRef.trim(),
      sourceBindingRef: input.sourceBinding.sourceRef.trim(),
      deploymentTarget: input.sourceBinding.deploymentTarget.trim(),
      journeyNodeCount: input.journeyGraph.length,
      everyJourneyKindHasOwner: true,
      scopeGrantId: input.scopeGrant.grantId.trim(),
      editablePageCount: input.scopeGrant.editablePageIds.length,
      excludedPageCount: input.scopeGrant.excludedPageIds.length,
      unboundPagesRemainReadOnly: true,
      baselineId: input.baseline.baselineId.trim(),
      baselineCheckCount: input.baseline.checks.length,
      baselinePassingCount: passing,
      baselineFailingCount: failing,
      provenEditableSourceAndReleasePath: true,
      siteMapVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F03_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "SITES_PAGES_EDITABLE_SOURCES_RECORDED",
      recoveryPath: "KEEP_UNBOUND_READ_ONLY_EXPOSE_DISCOVERY_GAPS",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F03 evidence package recorded (domain/URL inventory + exclusions, timestamped HTML/screenshot, source binding + deploy target, journey graph with owners, scope grant, baseline ID + checks); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
