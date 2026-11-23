import { describe, expect, it } from "vitest";
import {
  CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_RELATED_CASE_IDS,
  GscPropertyKind,
  REQUIRED_GSC_GRANT_SCOPES,
  evaluateConnectSearchConsoleOrganicVisibility,
  type ConnectSearchConsoleOrganicVisibilityInput,
} from "./connect-search-console-organic-visibility.js";

function baseInput(
  overrides: Partial<ConnectSearchConsoleOrganicVisibilityInput> = {},
): ConnectSearchConsoleOrganicVisibilityInput {
  return {
    packageId: "pkg-f05-1",
    connectionIdentity: {
      subject: "owner@example.worksocial.test",
      grantScopes: [...REQUIRED_GSC_GRANT_SCOPES],
      apiEnabled: true,
    },
    propertyBinding: {
      kind: GscPropertyKind.DOMAIN,
      propertyId: "sc-domain:example.worksocial.test",
      siteBindingId: "site-bind-f05-1",
      displayName: "Fixture GSC domain property",
    },
    comparableQuery: {
      country: "usa",
      device: "DESKTOP",
      searchType: "web",
      comparisonWindowDays: 28,
    },
    observationBatch: {
      providerRequestId: "req-gsc-obs-f05-1",
      sitemapStatus: "submitted_ok",
      rows: [
        {
          queryOrPage: "coworking near me",
          clicks: 12,
          impressions: 90,
          coverageNote: "fixture sample window; not live metrics",
          omitted: false,
        },
        {
          queryOrPage: "omitted-query-fixture",
          clicks: null,
          impressions: null,
          coverageNote: "row omitted — UNKNOWN demand, not zero",
          omitted: true,
        },
      ],
    },
    intentToPageMappings: [
      {
        intent: "book_tour",
        pagePath: "/tour",
        highValue: true,
      },
      {
        intent: "hours",
        pagePath: "/hours",
        highValue: false,
      },
    ],
    dailyReadSchedule: {
      cadence: "daily",
      nextReadAtIso: "2026-11-24T06:00:00.000Z",
      sourceWatermark: "gsc-wm-f05-fixture-1",
      writeAuthorized: false,
    },
    attemptWriteSave: false,
    inventZeroFromOmittedRows: false,
    claimLiveVerifiedGsc: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateConnectSearchConsoleOrganicVisibility (T-F05)", () => {
  it("records complete F05 evidence package", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.propertyKind).toBe("domain");
    expect(decision.evidence.apiEnabled).toBe(true);
    expect(decision.evidence.omittedRowCount).toBe(1);
    expect(decision.evidence.highValueIntentCount).toBe(1);
    expect(decision.evidence.scheduleCadence).toBe("daily");
    expect(decision.evidence.writeAuthorized).toBe(false);
    expect(decision.evidence.gscVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F05_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_RELATED_CASE_IDS).toEqual([
      "T-F05",
    ]);
  });

  it("accepts URL-prefix property kind", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({
        propertyBinding: {
          kind: GscPropertyKind.URL_PREFIX,
          propertyId: "https://example.worksocial.test/",
          siteBindingId: "site-bind-f05-url",
          displayName: "Fixture GSC URL-prefix",
        },
      }),
    );
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.evidence.propertyKind).toBe("url_prefix");
  });

  it("refuses missing connection identity / scopes / API readiness", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({
        connectionIdentity: {
          subject: "",
          grantScopes: [],
          apiEnabled: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CONNECTION_IDENTITY_REQUIRED");
  });

  it("refuses incomplete property binding", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({
        propertyBinding: {
          ...baseInput().propertyBinding,
          propertyId: "",
          siteBindingId: "",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROPERTY_BINDING_REQUIRED");
  });

  it("refuses incomplete comparable-query config", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({
        comparableQuery: {
          country: "",
          device: "",
          searchType: "",
          comparisonWindowDays: 0,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("COMPARABLE_QUERY_CONFIG_REQUIRED");
  });

  it("refuses empty observation batch", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({
        observationBatch: {
          providerRequestId: "",
          sitemapStatus: "",
          rows: [],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OBSERVATION_BATCH_REQUIRED");
  });

  it("refuses omitted rows carrying invented zeros", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({
        observationBatch: {
          providerRequestId: "req-bad",
          sitemapStatus: "submitted_ok",
          rows: [
            {
              queryOrPage: "omitted-but-zeroed",
              clicks: 0,
              impressions: 0,
              coverageNote: "bad invented zero",
              omitted: true,
            },
          ],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OBSERVATION_BATCH_REQUIRED");
  });

  it("refuses empty intent mappings", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({ intentToPageMappings: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INTENT_TO_PAGE_MAPPING_REQUIRED");
  });

  it("refuses incomplete daily schedule", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({
        dailyReadSchedule: {
          cadence: "daily",
          nextReadAtIso: "",
          sourceWatermark: "",
          writeAuthorized: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DAILY_READ_SCHEDULE_REQUIRED");
  });

  it("refuses write save", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({ attemptWriteSave: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WRITE_SAVE_REFUSED");
  });

  it("refuses inventing zero from omitted rows", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({ inventZeroFromOmittedRows: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("OMITTED_ZERO_DEMAND_CLAIM_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({ claimLiveVerifiedGsc: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_GSC_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateConnectSearchConsoleOrganicVisibility(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });
});
