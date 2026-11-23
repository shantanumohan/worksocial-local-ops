import { describe, expect, it } from "vitest";
import { Ga4PropertyKind } from "./analytics.js";
import {
  CONNECT_GOOGLE_ANALYTICS_4_RELATED_CASE_IDS,
  REQUIRED_GA4_GRANT_SCOPES,
  evaluateConnectGoogleAnalytics4,
  type ConnectGoogleAnalytics4Input,
} from "./connect-google-analytics-4.js";

function baseInput(
  overrides: Partial<ConnectGoogleAnalytics4Input> = {},
): ConnectGoogleAnalytics4Input {
  return {
    packageId: "pkg-f04-1",
    connectionIdentity: {
      subject: "owner@example.worksocial.test",
      grantScopes: [...REQUIRED_GA4_GRANT_SCOPES],
    },
    propertyToSiteBinding: {
      propertyId: "properties/123456789",
      accountId: "accounts/111",
      webStreamId: "streams/222",
      siteBindingId: "site-bind-f04-1",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-TESTFIXTURE",
      displayName: "Fixture GA4 property",
    },
    eventDictionary: {
      version: "evt-dict-v1",
      owner: "owner-analytics",
      entries: [
        {
          eventName: "generate_lead",
          businessOutcome: "qualified_lead",
          mapped: true,
          gapReason: null,
        },
        {
          eventName: "purchase",
          businessOutcome: "booking_completed",
          mapped: false,
          gapReason: "booking provider not wired in fixture",
        },
      ],
    },
    sampleReport: {
      providerRequestId: "req-ga4-sample-f04-1",
      dimensions: ["date", "sessionDefaultChannelGroup"],
      rows: [
        {
          dimension: "2026-11-22|Organic Search",
          metric: "sessions",
          value: 42,
          coverageNote: "fixture sample window; not live metrics",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: true,
      measuredReceiptObserved: false,
      mappingGapExplicit: true,
    },
    readReady: {
      status: "READ_READY",
      nextSyncAtIso: "2026-11-23T06:00:00.000Z",
      writeAuthorized: false,
    },
    attemptWriteSave: false,
    claimDeliveredConversionFromDebug: false,
    claimLiveVerifiedGa4: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateConnectGoogleAnalytics4 (T-F04)", () => {
  it("records complete F04 evidence package", () => {
    const decision = evaluateConnectGoogleAnalytics4(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe("CONNECT_GOOGLE_ANALYTICS_4_EVIDENCE_RECORDED");
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.propertyKind).toBe("ga4_property");
    expect(decision.evidence.measurementMappingGapExplicit).toBe(true);
    expect(decision.evidence.readReadyStatus).toBe("READ_READY");
    expect(decision.evidence.writeAuthorized).toBe(false);
    expect(decision.evidence.ga4VerifiedLive).toBe(false);
    expect(decision.evidence.explicitGapCount).toBe(1);
    expect(decision.evidence.mappedEventCount).toBe(1);
    expect(decision.evidence.blockingDecision).toBe(
      "F04_EVIDENCE_PACKAGE_COMPLETE",
    );
  });

  it("refuses missing connection identity / scopes", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({
        connectionIdentity: { subject: "", grantScopes: [] },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CONNECTION_IDENTITY_REQUIRED");
  });

  it("refuses incomplete property-to-site binding", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({
        propertyToSiteBinding: {
          ...baseInput().propertyToSiteBinding,
          propertyId: "",
          webStreamId: "",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROPERTY_TO_SITE_BINDING_REQUIRED");
  });

  it("refuses wrong property kind (UA)", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({
        propertyToSiteBinding: {
          ...baseInput().propertyToSiteBinding,
          kind: Ga4PropertyKind.UA_PROPERTY,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WRONG_PROPERTY_KIND_REFUSED");
  });

  it("refuses event dictionary without explicit gapReason on unmapped", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({
        eventDictionary: {
          version: "evt-dict-v1",
          owner: "owner-analytics",
          entries: [
            {
              eventName: "purchase",
              businessOutcome: "booking_completed",
              mapped: false,
              gapReason: null,
            },
          ],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("EVENT_DICTIONARY_REQUIRED");
  });

  it("refuses empty sample report", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({
        sampleReport: {
          providerRequestId: "",
          dimensions: [],
          rows: [],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("SAMPLE_REPORT_REQUIRED");
  });

  it("refuses measurement tests without explicit mapping gap", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({
        measurementTests: {
          debugEndpointAccepted: true,
          measuredReceiptObserved: true,
          mappingGapExplicit: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("MEASUREMENT_TESTS_REQUIRED");
  });

  it("refuses write-capable save", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({ attemptWriteSave: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WRITE_SAVE_REFUSED");
  });

  it("refuses debug→delivered conversion claim", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({ claimDeliveredConversionFromDebug: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DEBUG_DELIVERED_CONVERSION_CLAIM_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({ claimLiveVerifiedGa4: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_GA4_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateConnectGoogleAnalytics4(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
  });

  it("maps only to T-F04", () => {
    expect([...CONNECT_GOOGLE_ANALYTICS_4_RELATED_CASE_IDS]).toEqual([
      "T-F04",
    ]);
  });
});
