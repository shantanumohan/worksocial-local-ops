/**
 * M8 / NEXT-19 — analytics read-path honesty (GSC / GA4) and ChatGPT Ads gate.
 *
 * Fixture ≠ sandbox ≠ live. Live adapters stay NOT_WIRED without verified
 * transport. Missing / omitted rows are UNKNOWN — never false zeros.
 * GA4 Measurement Protocol debug validation is not a delivered conversion.
 * ChatGPT Ads remains access-blocked without local transport + entitlement.
 */

import { classifyMetric, type MetricClassification } from "./metric-missingness.js";

/** Distinct environments — never collapse these labels. */
export const AnalyticsEnvironment = {
  FIXTURE: "FIXTURE",
  SANDBOX: "SANDBOX",
  LIVE: "LIVE",
  NOT_WIRED: "NOT_WIRED",
  UNAVAILABLE: "UNAVAILABLE",
} as const;

export type AnalyticsEnvironmentValue =
  (typeof AnalyticsEnvironment)[keyof typeof AnalyticsEnvironment];

export const Ga4PropertyKind = {
  GA4_PROPERTY: "ga4_property",
  UA_PROPERTY: "ua_property",
  MEASUREMENT_ID_ONLY: "measurement_id_only",
  UNKNOWN: "unknown",
} as const;

export type Ga4PropertyKindValue =
  (typeof Ga4PropertyKind)[keyof typeof Ga4PropertyKind];

export const Ga4ValidationKind = {
  /** Measurement Protocol debug endpoint — payload shape only. */
  DEBUG_VALIDATION: "debug_validation",
  /** Reporting / measured receipt in GA4. */
  MEASURED_RECEIPT: "measured_receipt",
} as const;

export type Ga4ValidationKindValue =
  (typeof Ga4ValidationKind)[keyof typeof Ga4ValidationKind];

export type Ga4PropertyBinding = {
  propertyId: string;
  kind: Ga4PropertyKindValue;
  measurementId: string | null;
  displayName: string;
  environment: AnalyticsEnvironmentValue;
};

export type Ga4PropertyValidation =
  | {
      ok: true;
      binding: Ga4PropertyBinding;
      reasons: string[];
    }
  | {
      ok: false;
      code: "WRONG_PROPERTY_KIND" | "MISSING_PROPERTY";
      reasons: string[];
    };

/**
 * Reject Universal Analytics / measurement-id-only bindings as GA4 properties
 * (T-X031). Fixture and sandbox remain distinguishable from live.
 */
export function validateGa4PropertyBinding(
  binding: Ga4PropertyBinding,
): Ga4PropertyValidation {
  if (!binding.propertyId.trim()) {
    return {
      ok: false,
      code: "MISSING_PROPERTY",
      reasons: ["GA4 property id is required"],
    };
  }
  if (binding.kind !== Ga4PropertyKind.GA4_PROPERTY) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        `Property kind ${binding.kind} is not a GA4 property — refuse bind (T-X031)`,
      ],
    };
  }
  if (binding.environment === AnalyticsEnvironment.LIVE) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        "Live GA4 bind refused — live query transport remains NOT_WIRED in M8",
      ],
    };
  }
  return {
    ok: true,
    binding,
    reasons: [
      `GA4 property ${binding.propertyId} accepted as ${binding.environment} (not live metrics)`,
    ],
  };
}

export type Ga4DebugValidationResult = {
  kind: Ga4ValidationKindValue;
  debugOk: boolean;
  /** Never true from debug validation alone (T-US-008 / T-X032). */
  deliveredConversionClaimed: boolean;
  reasons: string[];
};

/** Debug validation success must not claim a delivered conversion. */
export function interpretGa4DebugValidation(input: {
  debugEndpointAccepted: boolean;
}): Ga4DebugValidationResult {
  if (!input.debugEndpointAccepted) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: false,
      deliveredConversionClaimed: false,
      reasons: ["GA4 debug validation rejected payload"],
    };
  }
  return {
    kind: Ga4ValidationKind.DEBUG_VALIDATION,
    debugOk: true,
    deliveredConversionClaimed: false,
    reasons: [
      "GA4 debug validation succeeded — payload shape only; not a measured receipt or delivered conversion (T-US-008 / T-X032)",
    ],
  };
}

export type GscRowObservation = {
  query: string;
  /** null when the provider omitted the row — never invent 0. */
  clicks: number | null;
  impressions: number | null;
  omitted: boolean;
  environment: AnalyticsEnvironmentValue;
};

export type GscDemandClassification = {
  query: string;
  clicks: MetricClassification;
  impressions: MetricClassification;
  /** Honest demand label when rows are omitted. */
  demandLabel: "measured" | "unknown" | "unavailable" | "fixture";
  reasons: string[];
};

/**
 * Omitted GSC rows are UNKNOWN demand — never zero (T-US-010 / T-X033).
 */
export function classifyGscDemand(
  row: GscRowObservation,
): GscDemandClassification {
  if (row.environment === AnalyticsEnvironment.NOT_WIRED) {
    return {
      query: row.query,
      clicks: { kind: "unavailable", reason: "unsupported" },
      impressions: { kind: "unavailable", reason: "unsupported" },
      demandLabel: "unavailable",
      reasons: ["GSC live adapter NOT_WIRED — no demand claim"],
    };
  }
  if (row.omitted || row.clicks === null || row.impressions === null) {
    const clicks = classifyMetric({
      metricId: `gsc-clicks:${row.query}`,
      value: null,
      sampleSize: null,
      sourceStatus: "missing",
    });
    const impressions = classifyMetric({
      metricId: `gsc-impressions:${row.query}`,
      value: null,
      sampleSize: null,
      sourceStatus: "missing",
    });
    return {
      query: row.query,
      clicks,
      impressions,
      demandLabel: "unknown",
      reasons: [
        "GSC row omitted or incomplete — UNKNOWN demand, not zero (T-US-010 / T-X033)",
      ],
    };
  }
  const clicks = classifyMetric({
    metricId: `gsc-clicks:${row.query}`,
    value: row.clicks,
    sampleSize: row.impressions,
    sourceStatus: "ok",
  });
  const impressions = classifyMetric({
    metricId: `gsc-impressions:${row.query}`,
    value: row.impressions,
    sampleSize: row.impressions,
    sourceStatus: "ok",
  });
  return {
    query: row.query,
    clicks,
    impressions,
    demandLabel:
      row.environment === AnalyticsEnvironment.FIXTURE ? "fixture" : "measured",
    reasons: [
      row.environment === AnalyticsEnvironment.FIXTURE
        ? "FIXTURE GSC sample — not live property data"
        : "Measured GSC row",
    ],
  };
}

export type ChatGptAdsAccessInput = {
  localTransportVerified: boolean;
  entitlementVerified: boolean;
  authVerified: boolean;
  /** Test-only Ads project must not bind production (T-X034). */
  projectEnvironment: AnalyticsEnvironmentValue;
  requestedEnvironment: AnalyticsEnvironmentValue;
};

export type ChatGptAdsAccessDecision = {
  allowed: boolean;
  code:
    | "ADS_ACCESS_BLOCKED"
    | "ADS_TRANSPORT_UNVERIFIED"
    | "ADS_ENTITLEMENT_UNVERIFIED"
    | "ADS_AUTH_UNVERIFIED"
    | "ADS_TEST_PROJECT_MISMATCH"
    | "ADS_LIVE_NOT_WIRED"
    | "ADS_ACCESS_GRANTED_FIXTURE";
  reasons: string[];
  environment: AnalyticsEnvironmentValue;
};

/**
 * ChatGPT Ads stays access-blocked without verified local transport +
 * entitlement. Live remains NOT_WIRED in M8.
 */
export function evaluateChatGptAdsAccess(
  input: ChatGptAdsAccessInput,
): ChatGptAdsAccessDecision {
  if (
    input.projectEnvironment === AnalyticsEnvironment.SANDBOX &&
    input.requestedEnvironment === AnalyticsEnvironment.LIVE
  ) {
    return {
      allowed: false,
      code: "ADS_TEST_PROJECT_MISMATCH",
      reasons: ["Test-only Ads project cannot bind production (T-X034)"],
      environment: AnalyticsEnvironment.NOT_WIRED,
    };
  }
  if (input.requestedEnvironment === AnalyticsEnvironment.LIVE) {
    return {
      allowed: false,
      code: "ADS_LIVE_NOT_WIRED",
      reasons: [
        "ChatGPT Ads live adapter is NOT_WIRED — no spend or mutations (M8)",
      ],
      environment: AnalyticsEnvironment.NOT_WIRED,
    };
  }
  if (!input.localTransportVerified) {
    return {
      allowed: false,
      code: "ADS_TRANSPORT_UNVERIFIED",
      reasons: [
        "ChatGPT Ads access blocked — local transport not verified",
      ],
      environment: AnalyticsEnvironment.NOT_WIRED,
    };
  }
  if (!input.entitlementVerified) {
    return {
      allowed: false,
      code: "ADS_ENTITLEMENT_UNVERIFIED",
      reasons: [
        "ChatGPT Ads access blocked — entitlement not verified",
      ],
      environment: AnalyticsEnvironment.NOT_WIRED,
    };
  }
  if (!input.authVerified) {
    return {
      allowed: false,
      code: "ADS_AUTH_UNVERIFIED",
      reasons: ["ChatGPT Ads access blocked — auth not verified"],
      environment: AnalyticsEnvironment.NOT_WIRED,
    };
  }
  // Even with gates, M8 only permits labeled FIXTURE analysis — never live.
  if (input.requestedEnvironment === AnalyticsEnvironment.FIXTURE) {
    return {
      allowed: false,
      code: "ADS_ACCESS_BLOCKED",
      reasons: [
        "Transport/entitlement would be required for any Ads path; ChatGPT Ads remains access-blocked in M8 without a verified local Ads transport implementation",
      ],
      environment: AnalyticsEnvironment.NOT_WIRED,
    };
  }
  return {
    allowed: false,
    code: "ADS_ACCESS_BLOCKED",
    reasons: ["ChatGPT Ads access blocked until verified local transport"],
    environment: AnalyticsEnvironment.NOT_WIRED,
  };
}

export type AnalyticsReadSnapshot = {
  snapshotId: string;
  source: "gsc" | "ga4";
  environment: AnalyticsEnvironmentValue;
  rows: Array<{ label: string; value: string; omitted?: boolean }>;
  liveWiring: "NOT_WIRED" | "FIXTURE";
  note: string;
  capturedAtIso: string;
};

/** Catalog case ids related to analytics / Ads (do not mark VERIFIED without evidence). */
export const ANALYTICS_RELATED_CASE_IDS = [
  "T-F04",
  "T-F05",
  "T-F06",
  "T-F07",
  "T-US-007",
  "T-US-008",
  "T-US-009",
  "T-US-010",
  "T-US-011",
  "T-US-012",
  "T-US-013",
  "T-US-014",
  "T-X031",
  "T-X032",
  "T-X033",
  "T-X034",
  "T-X035",
  "T-X036",
] as const;
