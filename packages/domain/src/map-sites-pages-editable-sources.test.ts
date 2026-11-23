import { describe, expect, it } from "vitest";
import {
  JourneyDestinationKind,
  MAP_SITES_PAGES_EDITABLE_SOURCES_RELATED_CASE_IDS,
  SourceBindingKind,
  evaluateMapSitesPagesEditableSources,
  type MapSitesPagesEditableSourcesInput,
} from "./map-sites-pages-editable-sources.js";

function baseInput(
  overrides: Partial<MapSitesPagesEditableSourcesInput> = {},
): MapSitesPagesEditableSourcesInput {
  return {
    packageId: "pkg-f03-1",
    domainBoundary: {
      domain: "example.worksocial.test",
      allowedUrlPrefixes: [
        "https://example.worksocial.test/",
        "https://staging.example.worksocial.test/",
      ],
    },
    inventory: {
      inventoryId: "inv-f03-1",
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
      grantId: "grant-f03-1",
      editablePageIds: ["page-home"],
      excludedPageIds: ["page-legal"],
      unboundPagesRemainReadOnly: true,
    },
    baseline: {
      baselineId: "baseline-f03-deadbeef",
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

describe("evaluateMapSitesPagesEditableSources (T-F03)", () => {
  it("records complete F03 evidence package", () => {
    const decision = evaluateMapSitesPagesEditableSources(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "MAP_SITES_PAGES_EDITABLE_SOURCES_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.evidence.provenEditableSourceAndReleasePath).toBe(true);
    expect(decision.evidence.siteMapVerifiedLive).toBe(false);
    expect(decision.evidence.everyJourneyKindHasOwner).toBe(true);
    expect(decision.evidence.baselineFailingCount).toBe(1);
    expect(decision.evidence.unboundPagesRemainReadOnly).toBe(true);
  });

  it("requires domain boundary", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({
        domainBoundary: { domain: "", allowedUrlPrefixes: [] },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DOMAIN_BOUNDARY_REQUIRED");
  });

  it("requires inventory", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({
        inventory: {
          inventoryId: "",
          discoveredSourceCount: 0,
          excludedSourceCount: 0,
          discoveryIncomplete: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INVENTORY_REQUIRED");
  });

  it("requires pilot snapshot", () => {
    const decision = evaluateMapSitesPagesEditableSources(
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
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PILOT_SNAPSHOT_REQUIRED");
  });

  it("requires source binding with ownership", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({
        sourceBinding: {
          pageId: "page-home",
          bindingKind: SourceBindingKind.REPOSITORY_PATH,
          sourceRef: "repo://site/home.md",
          currentRevision: "sha-1",
          deploymentTarget: "staging://x",
          ownershipVerified: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SOURCE_BINDING_REQUIRED");
  });

  it("requires journey graph with owners", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({ journeyGraph: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("JOURNEY_GRAPH_REQUIRED");
  });

  it("requires scope grant keeping unbound read-only", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({
        scopeGrant: {
          grantId: "grant-x",
          editablePageIds: ["page-home"],
          excludedPageIds: [],
          unboundPagesRemainReadOnly: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SCOPE_GRANT_REQUIRED");
  });

  it("requires baseline evidence across check categories", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({
        baseline: {
          baselineId: "b1",
          recordedAtIso: "2026-11-23T02:05:00.000Z",
          checks: [
            {
              checkId: "chk-tech",
              category: "technical",
              passed: true,
              detail: "ok",
            },
          ],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BASELINE_EVIDENCE_REQUIRED");
  });

  it("refuses 100% coverage claim when discovery is incomplete", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({ claimFullCoverageDespiteIncompleteDiscovery: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe(
      "FULL_COVERAGE_DESPITE_INCOMPLETE_DISCOVERY_REFUSED",
    );
  });

  it("refuses wrong-environment publish", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({ attemptPublishWrongEnvironment: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WRONG_ENVIRONMENT_PUBLISH_REFUSED");
  });

  it("refuses redirect outside allowed domain", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({ redirectOutsideAllowedDomain: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("REDIRECT_OUTSIDE_ALLOWED_DOMAIN_REFUSED");
  });

  it("refuses unbound page write", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({ attemptWriteUnboundPage: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("UNBOUND_PAGE_WRITE_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({ claimLiveVerifiedSiteMap: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_SITE_MAP_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateMapSitesPagesEditableSources(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("related case ids are T-F03 only", () => {
    expect([...MAP_SITES_PAGES_EDITABLE_SOURCES_RELATED_CASE_IDS]).toEqual([
      "T-F03",
    ]);
  });
});
