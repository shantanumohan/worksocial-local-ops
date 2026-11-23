import { describe, expect, it } from "vitest";
import { GoogleAdsAccessTier } from "./google-ads-test-production-access.js";
import {
  CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_RELATED_CASE_IDS,
  GoogleAdsCapability,
  REQUIRED_GOOGLE_ADS_GRANT_SCOPES,
  evaluateConnectGoogleAdsControlledAnalysis,
  type ConnectGoogleAdsControlledAnalysisInput,
} from "./connect-google-ads-controlled-analysis.js";

function baseInput(
  overrides: Partial<ConnectGoogleAdsControlledAnalysisInput> = {},
): ConnectGoogleAdsControlledAnalysisInput {
  return {
    packageId: "pkg-f06-1",
    projectAccess: {
      projectId: "fixture-gcp-ads-project",
      accessTier: GoogleAdsAccessTier.TEST,
      accessRequirementsReviewed: true,
    },
    connectionIdentity: {
      subject: "owner@example.worksocial.test",
      grantScopes: [...REQUIRED_GOOGLE_ADS_GRANT_SCOPES],
    },
    denyWriteConsent: true,
    accountBinding: {
      clientCustomerId: "111-222-3333",
      managerCustomerId: "999-888-7777",
      accountTier: GoogleAdsAccessTier.TEST,
      displayName: "Fixture Ads client",
    },
    campaigns: [
      {
        campaignId: "camp-1",
        name: "Brand search",
        status: "ENABLED",
      },
      {
        campaignId: "camp-2",
        name: "Remarketing",
        status: "PAUSED",
      },
    ],
    conversionActions: [
      {
        conversionActionId: "conv-lead",
        name: "Generate lead",
        category: "SUBMIT_LEAD_FORM",
      },
      {
        conversionActionId: "conv-book",
        name: "Book tour",
        category: "BOOK_APPOINTMENT",
      },
    ],
    eventMappings: [
      {
        conversionActionId: "conv-lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        discrepancyReason: null,
      },
      {
        conversionActionId: "conv-book",
        businessOutcome: "tour_booked",
        mapped: false,
        discrepancyReason: "booking provider conversion lag not wired in fixture",
      },
    ],
    readReceipt: {
      providerRequestId: "req-ads-read-f06-1",
      readAtIso: "2026-11-23T02:00:00.000Z",
      sourceWatermark: "ads-wm-f06-fixture-1",
    },
    readReady: {
      status: "READ_READY",
      capability: GoogleAdsCapability.ANALYZE_ONLY,
      writeAuthorized: false,
      spendingAuthorityEnabled: false,
    },
    attemptWriteSave: false,
    claimLiveVerifiedAds: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

describe("evaluateConnectGoogleAdsControlledAnalysis (T-F06)", () => {
  it("records complete F06 evidence package", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_EVIDENCE_RECORDED",
    );
    expect(decision.liveProviderWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.accessTier).toBe("TEST");
    expect(decision.evidence.accountTierBadge).toMatch(/TEST/i);
    expect(decision.evidence.denyWriteConsent).toBe(true);
    expect(decision.evidence.campaignCount).toBe(2);
    expect(decision.evidence.conversionActionCount).toBe(2);
    expect(decision.evidence.mappedConversionCount).toBe(1);
    expect(decision.evidence.discrepancyTaskCount).toBe(1);
    expect(decision.evidence.capability).toBe("ANALYZE_ONLY");
    expect(decision.evidence.writeAuthorized).toBe(false);
    expect(decision.evidence.spendingAuthorityEnabled).toBe(false);
    expect(decision.evidence.adsVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F06_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(CONNECT_GOOGLE_ADS_CONTROLLED_ANALYSIS_RELATED_CASE_IDS).toEqual([
      "T-F06",
    ]);
  });

  it("refuses empty project access", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({
        projectAccess: {
          projectId: "",
          accessTier: GoogleAdsAccessTier.TEST,
          accessRequirementsReviewed: false,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PROJECT_ACCESS_REQUIRED");
  });

  it("refuses missing Ads scopes", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({
        connectionIdentity: {
          subject: "owner@example.worksocial.test",
          grantScopes: [],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CONNECTION_IDENTITY_REQUIRED");
  });

  it("refuses missing deny-write consent", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({ denyWriteConsent: false }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("DENY_WRITE_CONSENT_REQUIRED");
  });

  it("refuses PRODUCTION tier on fixture", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({
        projectAccess: {
          projectId: "fixture-gcp-ads-project",
          accessTier: GoogleAdsAccessTier.PRODUCTION,
          accessRequirementsReviewed: true,
        },
        accountBinding: {
          ...baseInput().accountBinding,
          accountTier: GoogleAdsAccessTier.PRODUCTION,
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PRODUCTION_TIER_ON_FIXTURE_REFUSED");
  });

  it("refuses empty inventory", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({ campaigns: [], conversionActions: [] }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("INVENTORY_REQUIRED");
  });

  it("refuses unmapped conversion without discrepancyReason", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({
        eventMappings: [
          {
            conversionActionId: "conv-book",
            businessOutcome: "tour_booked",
            mapped: false,
            discrepancyReason: null,
          },
        ],
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("EVENT_MAPPING_REQUIRED");
  });

  it("refuses missing read receipt watermark", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({
        readReceipt: {
          providerRequestId: "req-1",
          readAtIso: "2026-11-23T02:00:00.000Z",
          sourceWatermark: "",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("READ_RECEIPT_REQUIRED");
  });

  it("refuses write/spend save", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({ attemptWriteSave: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("WRITE_SAVE_REFUSED");
  });

  it("refuses false live-verified claim", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({ claimLiveVerifiedAds: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_ADS_REFUSED");
  });

  it("refuses live provider wiring", () => {
    const decision = evaluateConnectGoogleAdsControlledAnalysis(
      baseInput({ requestLiveProviderWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_PROVIDER_WIRING_NOT_WIRED");
    expect(decision.evidence).toBeNull();
  });
});
