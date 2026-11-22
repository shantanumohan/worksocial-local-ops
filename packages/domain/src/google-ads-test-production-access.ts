/**
 * T-US-012 — Google Ads test vs production access separated.
 *
 * A TEST-tier Google Ads customer/credential must not reach PRODUCTION
 * customers (and PRODUCTION must not be used as a TEST mutate surface).
 * Same-tier fixture analyze is allowed; LIVE transport stays NOT_WIRED.
 * Distinct from T-X034 (ChatGPT Ads SANDBOX→LIVE project mismatch) and
 * T-US-011 (analyze-only write disabled). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import {
  AnalyticsEnvironment,
  type AnalyticsEnvironmentValue,
} from "./analytics.js";

export const GoogleAdsAccessTier = {
  TEST: "TEST",
  PRODUCTION: "PRODUCTION",
} as const;

export type GoogleAdsAccessTierValue =
  (typeof GoogleAdsAccessTier)[keyof typeof GoogleAdsAccessTier];

export const GoogleAdsAccessOperation = {
  ANALYZE: "ANALYZE",
  MUTATE: "MUTATE",
} as const;

export type GoogleAdsAccessOperationValue =
  (typeof GoogleAdsAccessOperation)[keyof typeof GoogleAdsAccessOperation];

export type GoogleAdsTestProductionAccessInput = {
  /** Credential / login customer tier badge. */
  credentialTier: GoogleAdsAccessTierValue;
  /** Target client customer tier. */
  targetCustomerTier: GoogleAdsAccessTierValue;
  /** Requested analytics environment for the operation. */
  environment: AnalyticsEnvironmentValue;
  operation: GoogleAdsAccessOperationValue;
};

export type GoogleAdsTestProductionAccessDecision =
  | {
      allowed: true;
      code: "SAME_TIER_FIXTURE_ANALYZE_ALLOWED";
      credentialTier: GoogleAdsAccessTierValue;
      targetCustomerTier: GoogleAdsAccessTierValue;
      separated: true;
      mutateAuthorized: false;
      liveTransportWiring: "NOT_WIRED";
      externalEffects: "NONE";
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "TEST_CREDENTIAL_PRODUCTION_TARGET_REFUSED"
        | "PRODUCTION_CREDENTIAL_TEST_TARGET_REFUSED"
        | "MUTATE_AUTHORITY_REFUSED"
        | "LIVE_TRANSPORT_NOT_WIRED";
      credentialTier: GoogleAdsAccessTierValue;
      targetCustomerTier: GoogleAdsAccessTierValue;
      separated: true;
      mutateAuthorized: false;
      liveTransportWiring: "NOT_WIRED";
      externalEffects: "NONE";
      reasons: string[];
    };

export const GOOGLE_ADS_TEST_PRODUCTION_RELATED_CASE_IDS = [
  "T-US-012",
  "T-F06",
] as const;

/**
 * Enforce Google Ads TEST vs PRODUCTION access separation.
 * Cross-tier access is always refused. LIVE remains NOT_WIRED.
 * Same-tier fixture ANALYZE may proceed (still mutateAuthorized=false).
 */
export function evaluateGoogleAdsTestProductionAccess(
  input: GoogleAdsTestProductionAccessInput,
): GoogleAdsTestProductionAccessDecision {
  const base = {
    credentialTier: input.credentialTier,
    targetCustomerTier: input.targetCustomerTier,
    separated: true as const,
    mutateAuthorized: false as const,
    liveTransportWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
  };

  if (input.environment === AnalyticsEnvironment.LIVE) {
    return {
      allowed: false,
      code: "LIVE_TRANSPORT_NOT_WIRED",
      ...base,
      reasons: [
        "Live Google Ads transport remains NOT_WIRED — refuse LIVE access (T-US-012)",
      ],
    };
  }

  if (
    input.credentialTier === GoogleAdsAccessTier.TEST &&
    input.targetCustomerTier === GoogleAdsAccessTier.PRODUCTION
  ) {
    return {
      allowed: false,
      code: "TEST_CREDENTIAL_PRODUCTION_TARGET_REFUSED",
      ...base,
      reasons: [
        "TEST Google Ads credential cannot access PRODUCTION customer (T-US-012)",
      ],
    };
  }

  if (
    input.credentialTier === GoogleAdsAccessTier.PRODUCTION &&
    input.targetCustomerTier === GoogleAdsAccessTier.TEST
  ) {
    return {
      allowed: false,
      code: "PRODUCTION_CREDENTIAL_TEST_TARGET_REFUSED",
      ...base,
      reasons: [
        "PRODUCTION Google Ads credential cannot target TEST customer (T-US-012)",
      ],
    };
  }

  // Same tier but MUTATE — still refuse (no spend authority from this gate).
  if (input.operation === GoogleAdsAccessOperation.MUTATE) {
    return {
      allowed: false,
      code: "MUTATE_AUTHORITY_REFUSED",
      ...base,
      reasons: [
        "Google Ads mutate refused — test/production access gate does not authorize spend mutations (T-US-012)",
      ],
    };
  }

  // Same-tier fixture/sandbox ANALYZE only.
  return {
    allowed: true,
    code: "SAME_TIER_FIXTURE_ANALYZE_ALLOWED",
    ...base,
    reasons: [
      `Same-tier ${input.credentialTier} ANALYZE allowed in ${input.environment}; mutateAuthorized=false; live NOT_WIRED`,
    ],
  };
}
