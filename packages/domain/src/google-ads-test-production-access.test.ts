import { describe, expect, it } from "vitest";
import { AnalyticsEnvironment } from "./analytics.js";
import {
  GoogleAdsAccessOperation,
  GoogleAdsAccessTier,
  evaluateGoogleAdsTestProductionAccess,
} from "./google-ads-test-production-access.js";

describe("evaluateGoogleAdsTestProductionAccess (T-US-012)", () => {
  it("refuses TEST credential → PRODUCTION target", () => {
    const result = evaluateGoogleAdsTestProductionAccess({
      credentialTier: GoogleAdsAccessTier.TEST,
      targetCustomerTier: GoogleAdsAccessTier.PRODUCTION,
      environment: AnalyticsEnvironment.FIXTURE,
      operation: GoogleAdsAccessOperation.ANALYZE,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("TEST_CREDENTIAL_PRODUCTION_TARGET_REFUSED");
    expect(result.separated).toBe(true);
    expect(result.mutateAuthorized).toBe(false);
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses PRODUCTION credential → TEST target", () => {
    const result = evaluateGoogleAdsTestProductionAccess({
      credentialTier: GoogleAdsAccessTier.PRODUCTION,
      targetCustomerTier: GoogleAdsAccessTier.TEST,
      environment: AnalyticsEnvironment.SANDBOX,
      operation: GoogleAdsAccessOperation.ANALYZE,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("PRODUCTION_CREDENTIAL_TEST_TARGET_REFUSED");
    expect(result.liveTransportWiring).toBe("NOT_WIRED");
  });

  it("allows same-tier TEST fixture analyze (mutate still false)", () => {
    const result = evaluateGoogleAdsTestProductionAccess({
      credentialTier: GoogleAdsAccessTier.TEST,
      targetCustomerTier: GoogleAdsAccessTier.TEST,
      environment: AnalyticsEnvironment.FIXTURE,
      operation: GoogleAdsAccessOperation.ANALYZE,
    });
    expect(result.allowed).toBe(true);
    expect(result.code).toBe("SAME_TIER_FIXTURE_ANALYZE_ALLOWED");
    expect(result.mutateAuthorized).toBe(false);
  });

  it("refuses same-tier mutate", () => {
    const result = evaluateGoogleAdsTestProductionAccess({
      credentialTier: GoogleAdsAccessTier.TEST,
      targetCustomerTier: GoogleAdsAccessTier.TEST,
      environment: AnalyticsEnvironment.FIXTURE,
      operation: GoogleAdsAccessOperation.MUTATE,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("MUTATE_AUTHORITY_REFUSED");
  });

  it("refuses LIVE environment regardless of tier match", () => {
    const result = evaluateGoogleAdsTestProductionAccess({
      credentialTier: GoogleAdsAccessTier.PRODUCTION,
      targetCustomerTier: GoogleAdsAccessTier.PRODUCTION,
      environment: AnalyticsEnvironment.LIVE,
      operation: GoogleAdsAccessOperation.ANALYZE,
    });
    expect(result.allowed).toBe(false);
    expect(result.code).toBe("LIVE_TRANSPORT_NOT_WIRED");
  });
});
