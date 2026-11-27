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
      liveProviderSuccessClaimed: false;
      liveGa4Transport: "NOT_WIRED";
      externalEffects: "NONE";
    }
  | {
      ok: false;
      code:
        | "WRONG_PROPERTY_KIND"
        | "MISSING_PROPERTY"
        | "LIVE_CLAIM_REFUSED";
      reasons: string[];
      liveProviderSuccessClaimed: false;
      liveGa4Transport: "NOT_WIRED";
      externalEffects: "NONE";
    };

const GA4_BIND_HONESTY = {
  liveProviderSuccessClaimed: false as const,
  liveGa4Transport: "NOT_WIRED" as const,
  externalEffects: "NONE" as const,
};

/**
 * Reject Universal Analytics / measurement-id-only / unknown kinds as GA4
 * properties (T-X031). Fixture and sandbox remain distinguishable from live.
 * Live transport stays NOT_WIRED; ACCEPTED≠VERIFIED; never invent live metrics.
 */
export function validateGa4PropertyBinding(
  binding: Ga4PropertyBinding,
  opts?: {
    claimLiveVerified?: boolean;
    requestLiveGa4Transport?: boolean;
  },
): Ga4PropertyValidation {
  if (!binding.propertyId.trim()) {
    return {
      ok: false,
      code: "MISSING_PROPERTY",
      reasons: ["GA4 property id is required"],
      ...GA4_BIND_HONESTY,
    };
  }
  // I13: claim/transport on padded or wrong-kind ids refuse LIVE_CLAIM first —
  // never invent a live bind success path past ACCEPTED≠VERIFIED.
  if (opts?.claimLiveVerified === true || opts?.requestLiveGa4Transport === true) {
    return {
      ok: false,
      code: "LIVE_CLAIM_REFUSED",
      reasons: [
        "Live VERIFIED / live GA4 transport claim refused — fixture ACCEPTED≠VERIFIED; liveGa4Transport=NOT_WIRED",
      ],
      ...GA4_BIND_HONESTY,
    };
  }
  // Whitespace-padded ids refused (T-X031 deepen I10) — no silent trim invent.
  if (binding.propertyId !== binding.propertyId.trim()) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        "Whitespace-padded GA4 property id refused (T-X031); ACCEPTED≠VERIFIED",
      ],
      ...GA4_BIND_HONESTY,
    };
  }
  if (binding.kind !== Ga4PropertyKind.GA4_PROPERTY) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        `Property kind ${binding.kind} is not a GA4 property — refuse bind (T-X031); ACCEPTED≠VERIFIED`,
      ],
      ...GA4_BIND_HONESTY,
    };
  }
  // UA id shape labeled as ga4_property is still wrong kind (T-X031 deepen I8).
  if (/^UA-\d+/i.test(binding.propertyId.trim())) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        "UA-shaped property id labeled as ga4_property refused (T-X031); ACCEPTED≠VERIFIED",
      ],
      ...GA4_BIND_HONESTY,
    };
  }
  // Measurement-id shape (G-…) labeled as ga4_property refused (T-X031 deepen I10).
  if (/^G-[A-Z0-9]+$/i.test(binding.propertyId.trim())) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        "Measurement-id-shaped property id labeled as ga4_property refused (T-X031); ACCEPTED≠VERIFIED",
      ],
      ...GA4_BIND_HONESTY,
    };
  }
  if (
    binding.environment === AnalyticsEnvironment.LIVE ||
    binding.environment === AnalyticsEnvironment.NOT_WIRED ||
    binding.environment === AnalyticsEnvironment.UNAVAILABLE
  ) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        "Live/unavailable GA4 bind refused — live query transport remains NOT_WIRED (T-X031); ACCEPTED≠VERIFIED",
      ],
      ...GA4_BIND_HONESTY,
    };
  }
  return {
    ok: true,
    binding,
    reasons: [
      `GA4 property ${binding.propertyId} accepted as ${binding.environment} (not live metrics; ACCEPTED≠VERIFIED)`,
    ],
    ...GA4_BIND_HONESTY,
  };
}

export type Ga4KindReclaimResult = {
  decision: Ga4PropertyValidation;
  /** Pure reclaim — never invents a prior successful live bind. */
  priorBindInvented: false;
  liveProviderSuccessClaimed: false;
  liveGa4Transport: "NOT_WIRED";
  externalEffects: "NONE";
};

/**
 * Idempotent reclaim of a GA4 kind bind decision (T-X031 deepen I8).
 * Re-running on the same binding must not invent a live bind after refuse.
 */
export function reclaimGa4WrongPropertyKindDecision(
  binding: Ga4PropertyBinding,
  opts?: {
    claimLiveVerified?: boolean;
    requestLiveGa4Transport?: boolean;
  },
): Ga4KindReclaimResult {
  return {
    decision: validateGa4PropertyBinding(binding, opts),
    priorBindInvented: false,
    ...GA4_BIND_HONESTY,
  };
}

/**
 * Fail-closed: two reclaim passes over the same wrong-kind bind must agree.
 */
export function assertGa4WrongPropertyKindReclaimIdempotent(input: {
  first: Ga4KindReclaimResult;
  second: Ga4KindReclaimResult;
}): {
  ok: boolean;
  code: "GA4_KIND_RECLAIM_IDEMPOTENT" | "GA4_KIND_RECLAIM_DRIFT";
  reasons: string[];
  liveGa4Transport: "NOT_WIRED";
  externalEffects: "NONE";
} {
  const reasons: string[] = [];
  const { first, second } = input;
  if (first.priorBindInvented !== false || second.priorBindInvented !== false) {
    reasons.push("priorBindInvented must be false on both reclaim passes");
  }
  if (
    first.liveProviderSuccessClaimed !== false ||
    second.liveProviderSuccessClaimed !== false
  ) {
    reasons.push("liveProviderSuccessClaimed must be false on reclaim");
  }
  if (
    first.liveGa4Transport !== "NOT_WIRED" ||
    second.liveGa4Transport !== "NOT_WIRED"
  ) {
    reasons.push("liveGa4Transport must be NOT_WIRED on reclaim");
  }
  if (first.externalEffects !== "NONE" || second.externalEffects !== "NONE") {
    reasons.push("externalEffects must be NONE on reclaim");
  }
  if (first.decision.ok !== second.decision.ok) {
    reasons.push("reclaim decision.ok drifted");
  }
  if (!first.decision.ok && !second.decision.ok) {
    if (first.decision.code !== second.decision.code) {
      reasons.push("reclaim decision.code drifted");
    }
  }
  if (first.decision.ok === true || second.decision.ok === true) {
    // Reclaim of a known wrong-kind fixture must stay refused when both inputs
    // were wrong-kind; callers pass refused bindings into this helper.
    if (
      first.decision.ok === true &&
      first.decision.binding.kind !== Ga4PropertyKind.GA4_PROPERTY
    ) {
      reasons.push("idempotent reclaim must not accept non-GA4 kind");
    }
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      code: "GA4_KIND_RECLAIM_DRIFT",
      reasons,
      liveGa4Transport: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }
  return {
    ok: true,
    code: "GA4_KIND_RECLAIM_IDEMPOTENT",
    reasons: [
      "idempotent reclaim: same refuse/accept; no invent live bind; ACCEPTED≠VERIFIED",
    ],
    liveGa4Transport: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

/**
 * Fail-closed honesty check for T-X031 bind decisions.
 */
export function assertGa4WrongPropertyKindHonest(
  decision: Ga4PropertyValidation,
): {
  ok: boolean;
  code: "GA4_KIND_HONEST" | "GA4_KIND_DISHONEST";
  reasons: string[];
  liveGa4Transport: "NOT_WIRED";
  externalEffects: "NONE";
} {
  const reasons: string[] = [];
  if (decision.liveProviderSuccessClaimed !== false) {
    reasons.push("liveProviderSuccessClaimed must be false");
  }
  if (decision.liveGa4Transport !== "NOT_WIRED") {
    reasons.push("liveGa4Transport must be NOT_WIRED");
  }
  if (decision.externalEffects !== "NONE") {
    reasons.push("externalEffects must be NONE");
  }
  if (decision.ok && decision.binding.environment === AnalyticsEnvironment.LIVE) {
    reasons.push("Must not accept LIVE environment bind");
  }
  if (
    decision.ok &&
    decision.binding.environment === AnalyticsEnvironment.NOT_WIRED
  ) {
    reasons.push("Must not accept NOT_WIRED environment bind");
  }
  if (
    decision.ok &&
    decision.binding.environment === AnalyticsEnvironment.UNAVAILABLE
  ) {
    reasons.push("Must not accept UNAVAILABLE environment bind");
  }
  if (decision.ok && decision.binding.kind !== Ga4PropertyKind.GA4_PROPERTY) {
    reasons.push("Must not accept non-GA4 property kind");
  }
  if (
    decision.ok &&
    decision.binding.propertyId !== decision.binding.propertyId.trim()
  ) {
    reasons.push("Must not accept whitespace-padded property id");
  }
  if (
    decision.ok &&
    /^UA-\d+/i.test(decision.binding.propertyId.trim())
  ) {
    reasons.push("Must not accept UA-shaped property id as GA4");
  }
  if (
    decision.ok &&
    /^G-[A-Z0-9]+$/i.test(decision.binding.propertyId.trim())
  ) {
    reasons.push("Must not accept measurement-id-shaped property id as GA4");
  }
  // I13: inventing live transport delivered / closed VERIFIED in reasons is dishonest.
  const reasonBlob = decision.reasons.join(" ");
  if (
    /\blive\s+(GA4\s+)?(transport|metrics)\s+(is\s+)?(now\s+)?(delivered|verified|wired)\b/i.test(
      reasonBlob,
    ) ||
    /\bcatalogClaim\s*=\s*VERIFIED\b/i.test(reasonBlob) ||
    /\bproperty\s+kind\s+(is\s+)?(now\s+)?(satisfied|completed|closed)\b/i.test(
      reasonBlob,
    )
  ) {
    reasons.push(
      "Must not invent live GA4 transport/metrics success or closed kind",
    );
  }
  if (reasons.length > 0) {
    return {
      ok: false,
      code: "GA4_KIND_DISHONEST",
      reasons,
      liveGa4Transport: "NOT_WIRED",
      externalEffects: "NONE",
    };
  }
  return {
    ok: true,
    code: "GA4_KIND_HONEST",
    reasons: [
      "liveProviderSuccessClaimed=false liveGa4Transport=NOT_WIRED externalEffects=NONE ACCEPTED≠VERIFIED",
    ],
    liveGa4Transport: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export type Ga4DebugValidationResult = {
  kind: Ga4ValidationKindValue;
  debugOk: boolean;
  /** Never true from debug validation alone (T-US-008 / T-X032). */
  deliveredConversionClaimed: false;
  /** Debug success is never a measured receipt either. */
  measuredReceiptClaimed: false;
  liveProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  /**
   * True only for FIXTURE (or omitted env defaulting to FIXTURE).
   * SANDBOX debug is allowed but never labeled fixture-only.
   */
  fixtureOnly: boolean;
  /** Environment used for evidence labeling (defaults to FIXTURE). */
  environment: AnalyticsEnvironmentValue;
  /** Set when a LIVE debug / delivered-conversion claim was refused. */
  code: "LIVE_DEBUG_WIRING_NOT_WIRED" | "DELIVERED_CONVERSION_CLAIM_REFUSED" | null;
  reasons: string[];
};

const ga4DebugHonestyBase = {
  deliveredConversionClaimed: false as const,
  measuredReceiptClaimed: false as const,
  liveProviderWiring: "NOT_WIRED" as const,
  externalEffects: "NONE" as const,
};

function ga4DebugEvidenceLabel(
  environment: AnalyticsEnvironmentValue | undefined,
): {
  environment: AnalyticsEnvironmentValue;
  fixtureOnly: boolean;
} {
  const resolved = environment ?? AnalyticsEnvironment.FIXTURE;
  return {
    environment: resolved,
    // SANDBOX must not collapse into fixture evidence.
    fixtureOnly: resolved === AnalyticsEnvironment.FIXTURE,
  };
}

/**
 * Debug validation success must not claim a delivered conversion (T-US-008 /
 * T-X032). LIVE debug transport stays NOT_WIRED; claimDeliveredConversion is
 * always refused. ACCEPTED ≠ VERIFIED.
 */
export function interpretGa4DebugValidation(input: {
  debugEndpointAccepted: boolean;
  /** Attempt to elevate debug success into a delivered conversion — refused. */
  claimDeliveredConversion?: boolean;
  /**
   * Canonical analytics environment. LIVE stays NOT_WIRED.
   * Omitted defaults to FIXTURE (fixtureOnly=true). SANDBOX is allowed
   * with fixtureOnly=false.
   */
  environment?: AnalyticsEnvironmentValue;
}): Ga4DebugValidationResult {
  const evidence = ga4DebugEvidenceLabel(input.environment);

  if (input.environment === AnalyticsEnvironment.LIVE) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: false,
      code: "LIVE_DEBUG_WIRING_NOT_WIRED",
      reasons: [
        "LIVE GA4 debug validation refused — liveProviderWiring=NOT_WIRED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimDeliveredConversion === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "DELIVERED_CONVERSION_CLAIM_REFUSED",
      reasons: [
        "Delivered-conversion claim from GA4 debug refused — debug≠delivered (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (!input.debugEndpointAccepted) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: false,
      code: null,
      reasons: ["GA4 debug validation rejected payload"],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }
  return {
    kind: Ga4ValidationKind.DEBUG_VALIDATION,
    debugOk: true,
    code: null,
    reasons: [
      "GA4 debug validation succeeded — payload shape only; not a measured receipt or delivered conversion (T-US-008 / T-X032)",
    ],
    ...ga4DebugHonestyBase,
    ...evidence,
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

/**
 * Fixture Ads production-bind boundary (T-X034).
 * Access is evaluated first; the production binder is invoked only when allowed.
 * Instrumented `productionBind` call counts prove a refused test project never
 * reaches a production bind/mutate adapter. External effects: NONE.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. Distinct from T-US-012 (Google Ads).
 */
export type GuardedChatGptAdsProductionBindResult = {
  bound: boolean;
  decision: ChatGptAdsAccessDecision;
  /** How many times the production binder was invoked (0 when refused). */
  productionBindCallCount: number;
  externalEffects: "NONE";
};

export function attemptGuardedChatGptAdsProductionBind(input: {
  access: ChatGptAdsAccessInput;
  projectId: string;
  /** Fake/live adapter hook — must only run when access.allowed. */
  productionBind: (projectId: string) => void;
}): GuardedChatGptAdsProductionBindResult {
  const decision = evaluateChatGptAdsAccess(input.access);
  if (!decision.allowed) {
    return {
      bound: false,
      decision,
      productionBindCallCount: 0,
      externalEffects: "NONE",
    };
  }
  input.productionBind(input.projectId);
  return {
    bound: true,
    decision,
    productionBindCallCount: 1,
    externalEffects: "NONE",
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
  "T-F07",
  "T-US-007",
  "T-US-008",
  "T-US-009",
  "T-US-010",
  "T-US-013",
  "T-US-014",
  "T-X031",
  "T-X032",
  "T-X033",
  "T-X034",
  "T-X035",
  "T-X036",
] as const;
