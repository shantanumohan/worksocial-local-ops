import { describe, expect, it } from "vitest";
import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  assertGa4WrongPropertyKindHonest,
  assertGa4WrongPropertyKindReclaimIdempotent,
  attemptGuardedChatGptAdsProductionBind,
  classifyGscDemand,
  evaluateChatGptAdsAccess,
  interpretGa4DebugValidation,
  reclaimGa4WrongPropertyKindDecision,
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
    expect(result.liveProviderSuccessClaimed).toBe(false);
    expect(result.liveGa4Transport).toBe("NOT_WIRED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("rejects measurement-id-only and unknown kinds (T-X031 hillclimb)", () => {
    const mid = validateGa4PropertyBinding({
      propertyId: "G-ONLY",
      kind: Ga4PropertyKind.MEASUREMENT_ID_ONLY,
      measurementId: "G-ONLY",
      displayName: "Mid only",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(mid.ok).toBe(false);
    if (!mid.ok) expect(mid.code).toBe("WRONG_PROPERTY_KIND");

    const unknown = validateGa4PropertyBinding({
      propertyId: "999",
      kind: Ga4PropertyKind.UNKNOWN,
      measurementId: null,
      displayName: "Unknown",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("WRONG_PROPERTY_KIND");
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
    expect(result.liveProviderSuccessClaimed).toBe(false);
    expect(assertGa4WrongPropertyKindHonest(result).ok).toBe(true);
  });

  it("refuses live GA4 bind and live VERIFIED claims while transport NOT_WIRED", () => {
    const result = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-LIVE",
      displayName: "Live attempt",
      environment: AnalyticsEnvironment.LIVE,
    });
    expect(result.ok).toBe(false);
    expect(result.liveGa4Transport).toBe("NOT_WIRED");

    const unavailable = validateGa4PropertyBinding({
      propertyId: "100000001",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-UNAV",
      displayName: "Unavailable",
      environment: AnalyticsEnvironment.UNAVAILABLE,
    });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) expect(unavailable.code).toBe("WRONG_PROPERTY_KIND");

    const uaShaped = validateGa4PropertyBinding({
      propertyId: "UA-999999",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: null,
      displayName: "UA mislabeled as GA4",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(uaShaped.ok).toBe(false);
    if (!uaShaped.ok) expect(uaShaped.code).toBe("WRONG_PROPERTY_KIND");

    const claimed = validateGa4PropertyBinding(
      {
        propertyId: "100000001",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "Fixture claim live",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { claimLiveVerified: true },
    );
    expect(claimed.ok).toBe(false);
    if (!claimed.ok) expect(claimed.code).toBe("LIVE_CLAIM_REFUSED");

    const transport = validateGa4PropertyBinding(
      {
        propertyId: "100000001",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "Request live transport",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { requestLiveGa4Transport: true },
    );
    expect(transport.ok).toBe(false);
    if (!transport.ok) expect(transport.code).toBe("LIVE_CLAIM_REFUSED");
  });

  it("idempotent reclaim of wrong-kind refuse (T-X031 I8)", () => {
    const binding = {
      propertyId: "UA-123",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy",
      environment: AnalyticsEnvironment.FIXTURE,
    };
    const r1 = reclaimGa4WrongPropertyKindDecision(binding);
    const r2 = reclaimGa4WrongPropertyKindDecision(binding);
    const idem = assertGa4WrongPropertyKindReclaimIdempotent({
      first: r1,
      second: r2,
    });
    expect(idem.ok).toBe(true);
    expect(idem.code).toBe("GA4_KIND_RECLAIM_IDEMPOTENT");
    expect(r1.decision.ok).toBe(false);
    expect(r1.priorBindInvented).toBe(false);

    const afterClaim = reclaimGa4WrongPropertyKindDecision(
      {
        propertyId: "100000001",
        kind: Ga4PropertyKind.GA4_PROPERTY,
        measurementId: "G-FIXTURE",
        displayName: "After claim",
        environment: AnalyticsEnvironment.FIXTURE,
      },
      { claimLiveVerified: true },
    );
    expect(afterClaim.decision.ok).toBe(false);
    const reclaimClean = reclaimGa4WrongPropertyKindDecision({
      propertyId: "UA-123",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy reclaim",
      environment: AnalyticsEnvironment.FIXTURE,
    });
    expect(reclaimClean.decision.ok).toBe(false);
    if (!reclaimClean.decision.ok) {
      expect(reclaimClean.decision.code).toBe("WRONG_PROPERTY_KIND");
    }
  });
});

describe("analytics — GA4 debug ≠ receipt", () => {
  it("never claims delivered conversion from debug validation (T-US-008 / T-X032)", () => {
    const ok = interpretGa4DebugValidation({ debugEndpointAccepted: true });
    expect(ok.debugOk).toBe(true);
    expect(ok.deliveredConversionClaimed).toBe(false);
    expect(ok.measuredReceiptClaimed).toBe(false);
    expect(ok.liveProviderWiring).toBe("NOT_WIRED");
    expect(ok.externalEffects).toBe("NONE");
    expect(ok.fixtureOnly).toBe(true);
    expect(ok.code).toBeNull();
  });

  it("refuses claimDeliveredConversion even when debug accepted", () => {
    const claimed = interpretGa4DebugValidation({
      debugEndpointAccepted: true,
      claimDeliveredConversion: true,
    });
    expect(claimed.debugOk).toBe(true);
    expect(claimed.deliveredConversionClaimed).toBe(false);
    expect(claimed.code).toBe("DELIVERED_CONVERSION_CLAIM_REFUSED");
  });

  it("refuses LIVE debug wiring as NOT_WIRED", () => {
    const live = interpretGa4DebugValidation({
      debugEndpointAccepted: true,
      environment: AnalyticsEnvironment.LIVE,
    });
    expect(live.debugOk).toBe(false);
    expect(live.deliveredConversionClaimed).toBe(false);
    expect(live.code).toBe("LIVE_DEBUG_WIRING_NOT_WIRED");
    expect(live.liveProviderWiring).toBe("NOT_WIRED");
    expect(live.environment).toBe(AnalyticsEnvironment.LIVE);
    expect(live.fixtureOnly).toBe(false);
  });

  it("sandbox debug is allowed but not fixtureOnly", () => {
    const sandbox = interpretGa4DebugValidation({
      debugEndpointAccepted: true,
      environment: AnalyticsEnvironment.SANDBOX,
    });
    expect(sandbox.debugOk).toBe(true);
    expect(sandbox.deliveredConversionClaimed).toBe(false);
    expect(sandbox.environment).toBe(AnalyticsEnvironment.SANDBOX);
    expect(sandbox.fixtureOnly).toBe(false);
  });

  it("rejected debug still never claims delivery", () => {
    const rejected = interpretGa4DebugValidation({
      debugEndpointAccepted: false,
    });
    expect(rejected.debugOk).toBe(false);
    expect(rejected.deliveredConversionClaimed).toBe(false);
    expect(rejected.measuredReceiptClaimed).toBe(false);
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
      projectId: "ads-test-sandbox",
      productionBind: () => {
        calls += 1;
      },
    });
    expect(result.bound).toBe(false);
    expect(result.decision.code).toBe("ADS_TEST_PROJECT_MISMATCH");
    expect(result.productionBindCallCount).toBe(0);
    expect(result.externalEffects).toBe("NONE");
    expect(calls).toBe(0);
  });
});
