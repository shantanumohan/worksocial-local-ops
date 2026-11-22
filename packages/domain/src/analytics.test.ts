import { describe, expect, it } from "vitest";
import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  attemptGuardedChatGptAdsProductionBind,
  classifyGscDemand,
  evaluateChatGptAdsAccess,
  interpretGa4DebugValidation,
  validateGa4PropertyBinding,
} from "./analytics.js";

describe("analytics — GA4 property kind", () => {
  it("rejects Universal Analytics / wrong kinds (T-X031)", () => {
    const result = validateGa4PropertyBinding({
      propertyId: "UA-123",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("WRONG_PROPERTY_KIND");
  });

  it("accepts fixture GA4 property without claiming live", () => {
    const result = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-FIXTURE",
      displayName: "WorkSocial fixture",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(result.ok).toBe(true);
  });

  it("refuses live GA4 bind while transport is NOT_WIRED", () => {
    const result = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-LIVE",
      displayName: "Live attempt",
      environment: AnalyticsEnvironment.LIVE,
    });
    expect(result.ok).toBe(false);
  });
});

describe("analytics — GA4 debug ≠ receipt", () => {
  it("never claims delivered conversion from debug validation (T-US-008 / T-X032)", () => {
    const ok = interpretGa4DebugValidation({ debugEndpointAccepted: true });
    expect(ok.debugOk).toBe(true);
    expect(ok.deliveredConversionClaimed).toBe(false);
  });
});

describe("analytics — GSC omitted rows", () => {
  it("treats omitted rows as UNKNOWN demand, not zero (T-US-010 / T-X033)", () => {
    const classified = classifyGscDemand({
      query: "quiet desks jersey city",
      clicks: null,
      impressions: null,
      omitted: true,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(classified.demandLabel).toBe("unknown");
    expect(classified.clicks.kind).toBe("missing");
    expect(classified.reasons.join(" ")).toMatch(/UNKNOWN|not zero/i);
  });

  it("keeps fixture ≠ sandbox ≠ live labels distinct", () => {
    const fixture = classifyGscDemand({
      query: "day pass",
      clicks: 42,
      impressions: 910,
      omitted: false,
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(fixture.demandLabel).toBe("fixture");
    const notWired = classifyGscDemand({
      query: "day pass",
      clicks: 0,
      impressions: 0,
      omitted: false,
      environment: AnalyticsEnvironment.NOT_WIRED,
    });
    expect(notWired.demandLabel).toBe("unavailable");
  });
});

describe("analytics — ChatGPT Ads gate", () => {
  it("blocks Ads without verified transport/entitlement", () => {
    const decision = evaluateChatGptAdsAccess({
      localTransportVerified: false,
      entitlementVerified: false,
      authVerified: false,
      projectEnvironment: AnalyticsEnvironment.FIXTURE,
      requestedEnvironment: AnalyticsEnvironment.LIVE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.environment).toBe(AnalyticsEnvironment.NOT_WIRED);
  });

  it("blocks test-only Ads project binding production (T-X034)", () => {
    const decision = evaluateChatGptAdsAccess({
      localTransportVerified: true,
      entitlementVerified: true,
      authVerified: true,
      projectEnvironment: AnalyticsEnvironment.SANDBOX,
      requestedEnvironment: AnalyticsEnvironment.LIVE,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("ADS_TEST_PROJECT_MISMATCH");
    expect(decision.environment).toBe(AnalyticsEnvironment.NOT_WIRED);
    expect(decision.reasons.some((r) => /T-X034/.test(r))).toBe(true);
  });

  it("guarded production bind never invokes binder on T-X034 mismatch", () => {
    let calls = 0;
    const result = attemptGuardedChatGptAdsProductionBind({
      access: {
        localTransportVerified: true,
        entitlementVerified: true,
        authVerified: true,
        projectEnvironment: AnalyticsEnvironment.SANDBOX,
        requestedEnvironment: AnalyticsEnvironment.LIVE,
      },
      projectId: "sandbox-ads",
      productionBind: () => {
        calls += 1;
      },
    });
    expect(result.bound).toBe(false);
    expect(result.decision.code).toBe("ADS_TEST_PROJECT_MISMATCH");
    expect(result.productionBindCallCount).toBe(0);
    expect(calls).toBe(0);
    expect(result.externalEffects).toBe("NONE");
  });
});
