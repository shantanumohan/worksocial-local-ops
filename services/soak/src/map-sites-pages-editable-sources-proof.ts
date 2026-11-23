/**
 * Fixture proof for T-F03 — Map sites, pages and editable sources.
 * Complete F03 evidence package: domain/URL inventory + exclusions,
 * timestamped HTML/screenshot, source binding + deploy target, journey
 * graph with owners, scope grant, baseline ID + checks; unsafe claims
 * refused; live NOT_WIRED. Distinct from open T-US-005 baseline-ID
 * happy-path summary. External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  JourneyDestinationKind,
  SoakProofKind,
  SourceBindingKind,
  evaluateMapSitesPagesEditableSources,
  type MapSitesPagesEditableSourcesInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<MapSitesPagesEditableSourcesInput> = {},
): MapSitesPagesEditableSourcesInput {
  return {
    packageId: "pkg-f03-soak",
    domainBoundary: {
      domain: "example.worksocial.test",
      allowedUrlPrefixes: [
        "https://example.worksocial.test/",
        "https://staging.example.worksocial.test/",
      ],
    },
    inventory: {
      inventoryId: "inv-f03-soak",
      discoveredSourceCount: 12,
      excludedSourceCount: 3,
      discoveryIncomplete: true,
    },
    pilotSnapshot: {
      pageId: "page-home",
      pageUrl: "https://example.worksocial.test/",
      canonicalUrl: "https://example.worksocial.test/",
      capturedAtIso: "2026-11-23T02:00:00.000Z",
      htmlArtifactRef: "artifact://html/page-home",
      screenshotArtifactRef: "artifact://screenshot/page-home",
    },
    sourceBinding: {
      pageId: "page-home",
      bindingKind: SourceBindingKind.CMS_ITEM,
      sourceRef: "cms://pages/home",
      currentRevision: "rev-abc123",
      deploymentTarget: "staging://example.worksocial.test",
      ownershipVerified: true,
    },
    journeyGraph: [
      {
        nodeId: "j-booking",
        kind: JourneyDestinationKind.BOOKING,
        destinationRef: "https://example.worksocial.test/book",
        owner: "owner-ops",
        accessible: true,
      },
      {
        nodeId: "j-form",
        kind: JourneyDestinationKind.FORM,
        destinationRef: "https://example.worksocial.test/contact",
        owner: "owner-ops",
        accessible: true,
      },
      {
        nodeId: "j-crm",
        kind: JourneyDestinationKind.CRM,
        destinationRef: "zoho://leads/test",
        owner: "owner-crm",
        accessible: false,
      },
    ],
    scopeGrant: {
      grantId: "grant-f03-soak",
      editablePageIds: ["page-home"],
      excludedPageIds: ["page-legal"],
      unboundPagesRemainReadOnly: true,
    },
    baseline: {
      baselineId: "baseline-f03-soak",
      recordedAtIso: "2026-11-23T02:05:00.000Z",
      checks: [
        {
          checkId: "chk-tech",
          category: "technical",
          passed: true,
          detail: "canonical + sitemap ok",
        },
        {
          checkId: "chk-fact",
          category: "factual",
          passed: true,
          detail: "pilot claims match sources",
        },
        {
          checkId: "chk-perf",
          category: "performance",
          passed: false,
          detail: "LCP soft fail retained",
        },
        {
          checkId: "chk-conv",
          category: "conversion",
          passed: true,
          detail: "CTA present",
        },
      ],
    },
    claimFullCoverageDespiteIncompleteDiscovery: false,
    attemptPublishWrongEnvironment: false,
    redirectOutsideAllowedDomain: false,
    attemptWriteUnboundPage: false,
    claimLiveVerifiedSiteMap: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F03 fixture ACCEPTED.
 */
export function proofMapSitesPagesEditableSources(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateMapSitesPagesEditableSources(baseInput());
  if (
    happy.allowed &&
    happy.code === "MAP_SITES_PAGES_EDITABLE_SOURCES_EVIDENCE_RECORDED" &&
    happy.evidence.provenEditableSourceAndReleasePath === true &&
    happy.evidence.everyJourneyKindHasOwner === true &&
    happy.evidence.unboundPagesRemainReadOnly === true &&
    happy.evidence.siteMapVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F03 evidence package → MAP_SITES_PAGES_EDITABLE_SOURCES_EVIDENCE_RECORDED; inventory+exclusions; HTML/screenshot snapshot; source binding+deploy; journey owners; scope grant; baseline ID+checks; siteMapVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noDomain = evaluateMapSitesPagesEditableSources(
    baseInput({
      domainBoundary: { domain: "", allowedUrlPrefixes: [] },
    }),
  );
  if (!noDomain.allowed && noDomain.code === "DOMAIN_BOUNDARY_REQUIRED") {
    details.push("empty domain boundary → DOMAIN_BOUNDARY_REQUIRED");
  } else {
    passed = false;
    details.push(`Domain boundary unexpectedly ${JSON.stringify(noDomain)}`);
  }

  const noSnap = evaluateMapSitesPagesEditableSources(
    baseInput({
      pilotSnapshot: {
        pageId: "",
        pageUrl: "",
        canonicalUrl: "",
        capturedAtIso: "",
        htmlArtifactRef: "",
        screenshotArtifactRef: "",
      },
    }),
  );
  if (!noSnap.allowed && noSnap.code === "PILOT_SNAPSHOT_REQUIRED") {
    details.push("empty pilot snapshot → PILOT_SNAPSHOT_REQUIRED");
  } else {
    passed = false;
    details.push(`Pilot snapshot unexpectedly ${JSON.stringify(noSnap)}`);
  }

  const fullCoverage = evaluateMapSitesPagesEditableSources(
    baseInput({ claimFullCoverageDespiteIncompleteDiscovery: true }),
  );
  if (
    !fullCoverage.allowed &&
    fullCoverage.code === "FULL_COVERAGE_DESPITE_INCOMPLETE_DISCOVERY_REFUSED"
  ) {
    details.push(
      "claimFullCoverageDespiteIncompleteDiscovery → FULL_COVERAGE_DESPITE_INCOMPLETE_DISCOVERY_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Full coverage unexpectedly ${JSON.stringify(fullCoverage)}`);
  }

  const wrongEnv = evaluateMapSitesPagesEditableSources(
    baseInput({ attemptPublishWrongEnvironment: true }),
  );
  if (
    !wrongEnv.allowed &&
    wrongEnv.code === "WRONG_ENVIRONMENT_PUBLISH_REFUSED"
  ) {
    details.push(
      "attemptPublishWrongEnvironment → WRONG_ENVIRONMENT_PUBLISH_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Wrong environment unexpectedly ${JSON.stringify(wrongEnv)}`);
  }

  const redirect = evaluateMapSitesPagesEditableSources(
    baseInput({ redirectOutsideAllowedDomain: true }),
  );
  if (
    !redirect.allowed &&
    redirect.code === "REDIRECT_OUTSIDE_ALLOWED_DOMAIN_REFUSED"
  ) {
    details.push(
      "redirectOutsideAllowedDomain → REDIRECT_OUTSIDE_ALLOWED_DOMAIN_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Redirect unexpectedly ${JSON.stringify(redirect)}`);
  }

  const unbound = evaluateMapSitesPagesEditableSources(
    baseInput({ attemptWriteUnboundPage: true }),
  );
  if (!unbound.allowed && unbound.code === "UNBOUND_PAGE_WRITE_REFUSED") {
    details.push("attemptWriteUnboundPage → UNBOUND_PAGE_WRITE_REFUSED");
  } else {
    passed = false;
    details.push(`Unbound write unexpectedly ${JSON.stringify(unbound)}`);
  }

  const liveClaim = evaluateMapSitesPagesEditableSources(
    baseInput({ claimLiveVerifiedSiteMap: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_SITE_MAP_REFUSED"
  ) {
    details.push(
      "claimLiveVerifiedSiteMap → FALSE_LIVE_VERIFIED_SITE_MAP_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateMapSitesPagesEditableSources(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-005 (baseline-ID happy-path summary) — complete F03 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.MAP_SITES_PAGES_EDITABLE_SOURCES,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-map-sites-pages-editable-sources-f03",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
