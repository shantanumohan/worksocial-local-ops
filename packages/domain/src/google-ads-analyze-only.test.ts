import { describe, expect, it } from "vitest";
import { AnalyticsEnvironment } from "./analytics.js";
import { ConnectionState, WriteReadiness } from "./connection-status.js";
import { GoogleAdsCapability } from "./connect-google-ads-controlled-analysis.js";
import { GoogleAdsAccessTier } from "./google-ads-test-production-access.js";
import { PaidMediaWiring } from "./paid-media.js";
import {
  createGoogleAdsAnalyzeOnlyFixtureStore,
  fixtureGoogleAdsAnalyzeOnlyInput,
  loadGoogleAdsAnalyzeOnlyBinding,
  persistGoogleAdsAnalyzeOnlyBinding,
  saveGoogleAdsAnalyzeOnlyConnection,
} from "./google-ads-analyze-only.js";

describe("google-ads-analyze-only — T-US-011", () => {
  it("saves analyze-only connection as READ_READY with write disabled + receipt", () => {
    const nowIso = "2026-11-22T20:00:00.000Z";
    const saved = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({ nowIso }),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    expect(saved.connectionState).toBe(ConnectionState.READ_READY);
    expect(saved.writeReadiness).toBe(WriteReadiness.NOT_AUTHORIZED);
    expect(saved.writeDisabled).toBe(true);
    expect(saved.spendingAuthorityEnabled).toBe(false);
    expect(saved.capability).toBe(GoogleAdsCapability.ANALYZE_ONLY);
    expect(saved.status.connected).toBe(true);
    expect(saved.status.authorized).toBe(false);
    expect(saved.status.verified).toBe(false);
    expect(saved.campaignCount).toBe(2);
    expect(saved.conversionActionCount).toBe(2);
    expect(saved.mappedConversionCount).toBe(1);
    expect(saved.discrepancyTasks).toHaveLength(1);
    expect(saved.accountTier).toBe(GoogleAdsAccessTier.TEST);
    expect(saved.wiring).toBe(PaidMediaWiring.FIXTURE);
    expect(saved.liveMutationWiring).toBe("NOT_WIRED");
    expect(saved.readReceiptAtIso).toBe(nowIso);
    expect(saved.sourceWatermark).toBe("fixture-ads-inventory-wm-011");
    expect(saved.externalEffects).toBe("NONE");
  });

  it("persists and reloads the binding from the fixture store", () => {
    const saved = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({ connectionId: "gads-persist-1" }),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const store = createGoogleAdsAnalyzeOnlyFixtureStore();
    persistGoogleAdsAnalyzeOnlyBinding(store, saved);
    const loaded = loadGoogleAdsAnalyzeOnlyBinding(store, "gads-persist-1");
    expect(loaded).not.toBeNull();
    expect(loaded?.connectionId).toBe(saved.connectionId);
    expect(loaded?.clientCustomerId).toBe(saved.clientCustomerId);
    expect(loaded?.readReceiptAtIso).toBe(saved.readReceiptAtIso);
    expect(loaded?.sourceWatermark).toBe(saved.sourceWatermark);
    expect(loaded?.writeDisabled).toBe(true);
    expect(loadGoogleAdsAnalyzeOnlyBinding(store, "missing")).toBeNull();
  });

  it("refuses WRITE capability", () => {
    const refused = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({
        capability: GoogleAdsCapability.WRITE,
      }),
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("WRITE_CAPABILITY_REFUSED");
    expect(refused.writeDisabled).toBe(true);
    expect(refused.spendingAuthorityEnabled).toBe(false);
    expect(refused.externalEffects).toBe("NONE");
  });

  it("refuses live transport and unavailable environments", () => {
    const liveRefuse = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({
        environment: AnalyticsEnvironment.LIVE,
        accountTier: GoogleAdsAccessTier.TEST,
      }),
    );
    expect(liveRefuse.ok).toBe(false);
    if (!liveRefuse.ok) {
      expect(liveRefuse.code).toBe("LIVE_TRANSPORT_NOT_WIRED");
    }

    const notWired = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({
        environment: AnalyticsEnvironment.NOT_WIRED,
      }),
    );
    expect(notWired.ok).toBe(false);
    if (!notWired.ok) {
      expect(notWired.code).toBe("ENVIRONMENT_UNAVAILABLE");
    }

    const unavailable = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({
        environment: AnalyticsEnvironment.UNAVAILABLE,
      }),
    );
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.code).toBe("ENVIRONMENT_UNAVAILABLE");
    }
  });

  it("requires deny-write consent, Ads scope, and source watermark", () => {
    const consent = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({ denyWriteConsent: false }),
    );
    expect(consent.ok).toBe(false);
    if (!consent.ok) expect(consent.code).toBe("DENY_WRITE_CONSENT_REQUIRED");

    const scope = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({ grantScopes: ["openid"] }),
    );
    expect(scope.ok).toBe(false);
    if (!scope.ok) expect(scope.code).toBe("MISSING_ADS_SCOPE");

    const watermark = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({ sourceWatermark: "  " }),
    );
    expect(watermark.ok).toBe(false);
    if (!watermark.ok) expect(watermark.code).toBe("MISSING_SOURCE_WATERMARK");
  });

  it("rejects blank/duplicate inventory ids and incomplete mappings", () => {
    const blankId = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({
        campaigns: [
          { campaignId: "  ", name: "bad", status: "ENABLED" },
          { campaignId: "camp-ok", name: "ok", status: "PAUSED" },
        ],
      }),
    );
    expect(blankId.ok).toBe(false);
    if (!blankId.ok) expect(blankId.code).toBe("INVENTORY_INVALID");

    const incomplete = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({
        eventMappings: [
          {
            conversionActionId: "conv-lead-011",
            businessOutcome: "qualified_lead",
            mapped: true,
            discrepancyReason: null,
          },
        ],
      }),
    );
    expect(incomplete.ok).toBe(false);
    if (!incomplete.ok) expect(incomplete.code).toBe("MAPPING_INCOMPLETE");
  });

  it("refuses PRODUCTION tier on fixture environment", () => {
    const refused = saveGoogleAdsAnalyzeOnlyConnection(
      fixtureGoogleAdsAnalyzeOnlyInput({
        accountTier: GoogleAdsAccessTier.PRODUCTION,
        environment: AnalyticsEnvironment.FIXTURE,
      }),
    );
    expect(refused.ok).toBe(false);
    if (refused.ok) return;
    expect(refused.code).toBe("PRODUCTION_TIER_ON_FIXTURE_REFUSED");
  });
});
