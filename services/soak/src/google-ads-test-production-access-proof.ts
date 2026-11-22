/**
 * Fixture proof for T-US-012 — Google Ads test vs production access separated.
 * Cross-tier credential→customer access refused; same-tier fixture analyze
 * allowed with mutateAuthorized=false; LIVE stays NOT_WIRED.
 * External effects: NONE. Distinct from T-X034 / T-US-011.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  GoogleAdsAccessOperation,
  GoogleAdsAccessTier,
  SoakProofKind,
  evaluateGoogleAdsTestProductionAccess,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-012 fixture ACCEPTED.
 */
export function proofGoogleAdsTestProductionAccessSeparated(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. TEST credential must not reach PRODUCTION customer.
  const testToProd = evaluateGoogleAdsTestProductionAccess({
    credentialTier: GoogleAdsAccessTier.TEST,
    targetCustomerTier: GoogleAdsAccessTier.PRODUCTION,
    environment: AnalyticsEnvironment.FIXTURE,
    operation: GoogleAdsAccessOperation.ANALYZE,
  });
  if (
    !testToProd.allowed &&
    testToProd.code === "TEST_CREDENTIAL_PRODUCTION_TARGET_REFUSED" &&
    testToProd.separated === true &&
    testToProd.mutateAuthorized === false &&
    testToProd.externalEffects === "NONE"
  ) {
    details.push(
      "TEST→PRODUCTION ANALYZE → TEST_CREDENTIAL_PRODUCTION_TARGET_REFUSED; separated; mutateAuthorized=false",
    );
  } else {
    passed = false;
    details.push(`TEST→PRODUCTION unexpectedly ${JSON.stringify(testToProd)}`);
  }

  // 2. PRODUCTION credential must not target TEST customer.
  const prodToTest = evaluateGoogleAdsTestProductionAccess({
    credentialTier: GoogleAdsAccessTier.PRODUCTION,
    targetCustomerTier: GoogleAdsAccessTier.TEST,
    environment: AnalyticsEnvironment.SANDBOX,
    operation: GoogleAdsAccessOperation.ANALYZE,
  });
  if (
    !prodToTest.allowed &&
    prodToTest.code === "PRODUCTION_CREDENTIAL_TEST_TARGET_REFUSED"
  ) {
    details.push(
      "PRODUCTION→TEST ANALYZE → PRODUCTION_CREDENTIAL_TEST_TARGET_REFUSED",
    );
  } else {
    passed = false;
    details.push(`PRODUCTION→TEST unexpectedly ${JSON.stringify(prodToTest)}`);
  }

  // 3. Same-tier TEST fixture analyze allowed; still no mutate authority.
  const sameTier = evaluateGoogleAdsTestProductionAccess({
    credentialTier: GoogleAdsAccessTier.TEST,
    targetCustomerTier: GoogleAdsAccessTier.TEST,
    environment: AnalyticsEnvironment.FIXTURE,
    operation: GoogleAdsAccessOperation.ANALYZE,
  });
  if (
    sameTier.allowed &&
    sameTier.code === "SAME_TIER_FIXTURE_ANALYZE_ALLOWED" &&
    sameTier.mutateAuthorized === false &&
    sameTier.liveTransportWiring === "NOT_WIRED"
  ) {
    details.push(
      "Same-tier TEST FIXTURE ANALYZE allowed; mutateAuthorized=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Same-tier analyze unexpectedly ${JSON.stringify(sameTier)}`);
  }

  // 4. Same-tier MUTATE refused (gate does not authorize spend).
  const mutateRefuse = evaluateGoogleAdsTestProductionAccess({
    credentialTier: GoogleAdsAccessTier.TEST,
    targetCustomerTier: GoogleAdsAccessTier.TEST,
    environment: AnalyticsEnvironment.FIXTURE,
    operation: GoogleAdsAccessOperation.MUTATE,
  });
  if (
    !mutateRefuse.allowed &&
    mutateRefuse.code === "MUTATE_AUTHORITY_REFUSED" &&
    mutateRefuse.mutateAuthorized === false
  ) {
    details.push("Same-tier MUTATE → MUTATE_AUTHORITY_REFUSED");
  } else {
    passed = false;
    details.push(`Mutate refuse unexpectedly ${JSON.stringify(mutateRefuse)}`);
  }

  // 5. LIVE always NOT_WIRED (even matched PRODUCTION tiers).
  const liveRefuse = evaluateGoogleAdsTestProductionAccess({
    credentialTier: GoogleAdsAccessTier.PRODUCTION,
    targetCustomerTier: GoogleAdsAccessTier.PRODUCTION,
    environment: AnalyticsEnvironment.LIVE,
    operation: GoogleAdsAccessOperation.ANALYZE,
  });
  if (!liveRefuse.allowed && liveRefuse.code === "LIVE_TRANSPORT_NOT_WIRED") {
    details.push("LIVE PRODUCTION→PRODUCTION → LIVE_TRANSPORT_NOT_WIRED");
  } else {
    passed = false;
    details.push(`LIVE refuse unexpectedly ${JSON.stringify(liveRefuse)}`);
  }

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");
  details.push(
    "Distinct from T-X034 (ChatGPT Ads SANDBOX→LIVE) and T-US-011 (analyze-only connect)",
  );

  return {
    proofId: `proof-gads-test-prod-${randomUUID()}`,
    kind: SoakProofKind.GOOGLE_ADS_TEST_PRODUCTION_ACCESS_SEPARATED,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `op-us012-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
