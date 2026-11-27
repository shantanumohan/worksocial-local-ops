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
  /** Set when a LIVE debug / conversion / receipt claim was refused. */
  code:
    | "LIVE_DEBUG_WIRING_NOT_WIRED"
    | "LIVE_CLAIM_REFUSED"
    | "SANDBOX_VERIFIED_CLAIM_REFUSED"
    | "DELIVERED_CONVERSION_CLAIM_REFUSED"
    | "MEASURED_RECEIPT_CLAIM_REFUSED"
    | "EXTERNAL_EFFECTS_CLAIM_REFUSED"
    | "FIXTURE_VERIFIED_CLAIM_REFUSED"
    | "DEBUG_VERIFIED_CLAIM_REFUSED"
    | "INTEGRATION_VERIFIED_CLAIM_REFUSED"
    | "MEASUREMENT_PROTOCOL_VERIFIED_CLAIM_REFUSED"
    | "REPORTING_ACCESS_VERIFIED_CLAIM_REFUSED"
    | "DATA_INGEST_VERIFIED_CLAIM_REFUSED"
    | "PAYLOAD_SHAPE_VERIFIED_CLAIM_REFUSED"
    | "EVENT_DELIVERY_VERIFIED_CLAIM_REFUSED"
    | "HIT_COLLECTION_VERIFIED_CLAIM_REFUSED"
    | "BATCH_EXPORT_VERIFIED_CLAIM_REFUSED"
    | "REALTIME_INGEST_VERIFIED_CLAIM_REFUSED"
    | "STREAMING_EXPORT_VERIFIED_CLAIM_REFUSED"
    | "AUDIENCE_EXPORT_VERIFIED_CLAIM_REFUSED"
    | null;
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
  /** Attempt to elevate debug success into a measured receipt — refused. */
  claimMeasuredReceipt?: boolean;
  /** Attempt to treat debug ACCEPTED as VERIFIED — refused. */
  claimDebugVerified?: boolean;
  /** Attempt to claim integration VERIFIED from debug — refused. */
  claimIntegrationVerified?: boolean;
  /**
   * Attempt to claim Measurement Protocol VERIFIED from debug ACCEPTED — refused.
   */
  claimMeasurementProtocolVerified?: boolean;
  /** Attempt to claim GA4 reporting access VERIFIED from debug — refused. */
  claimReportingAccessVerified?: boolean;
  /** Attempt to claim GA4 data-ingest VERIFIED from debug — refused. */
  claimDataIngestVerified?: boolean;
  /** Attempt to claim payload-shape VERIFIED from debug ACCEPTED — refused. */
  claimPayloadShapeVerified?: boolean;
  /** Attempt to claim event-delivery VERIFIED from debug — refused. */
  claimEventDeliveryVerified?: boolean;
  /** Attempt to claim hit-collection VERIFIED from debug — refused. */
  claimHitCollectionVerified?: boolean;
  /** Attempt to claim batch-export VERIFIED from debug — refused. */
  claimBatchExportVerified?: boolean;
  /** Attempt to claim realtime-ingest VERIFIED from debug — refused. */
  claimRealtimeIngestVerified?: boolean;
  /** Attempt to claim streaming-export VERIFIED from debug — refused. */
  claimStreamingExportVerified?: boolean;
  /** Attempt to claim audience-export VERIFIED from debug — refused. */
  claimAudienceExportVerified?: boolean;
  /** Attempt to claim live provider VERIFIED success from debug — refused. */
  claimLiveProviderSuccess?: boolean;
  /** Attempt to promote fixture ACCEPTED into sandbox VERIFIED — refused. */
  claimSandboxVerified?: boolean;
  /** Attempt to promote fixture ACCEPTED into fixture VERIFIED — refused. */
  claimFixtureVerified?: boolean;
  /** Attempt to claim non-NONE external effects from debug — refused. */
  claimExternalEffects?: boolean;
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

  if (input.claimLiveProviderSuccess === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "LIVE_CLAIM_REFUSED",
      reasons: [
        "Live provider success claim from GA4 debug refused — ACCEPTED≠VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimDebugVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "DEBUG_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Debug VERIFIED claim refused — GA4 debug ACCEPTED≠VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimIntegrationVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "INTEGRATION_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Integration VERIFIED claim from GA4 debug refused — ACCEPTED≠VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimMeasurementProtocolVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "MEASUREMENT_PROTOCOL_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Measurement Protocol VERIFIED claim from GA4 debug refused — debug ACCEPTED≠protocol VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimReportingAccessVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "REPORTING_ACCESS_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Reporting-access VERIFIED claim from GA4 debug refused — debug≠reporting VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimDataIngestVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "DATA_INGEST_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Data-ingest VERIFIED claim from GA4 debug refused — debug ACCEPTED≠ingest VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimPayloadShapeVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "PAYLOAD_SHAPE_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Payload-shape VERIFIED claim from GA4 debug refused — debug ACCEPTED≠payload VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimEventDeliveryVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "EVENT_DELIVERY_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Event-delivery VERIFIED claim from GA4 debug refused — debug≠delivered event VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimHitCollectionVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "HIT_COLLECTION_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Hit-collection VERIFIED claim from GA4 debug refused — debug ACCEPTED≠collection VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimBatchExportVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "BATCH_EXPORT_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Batch-export VERIFIED claim from GA4 debug refused — debug≠export VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimRealtimeIngestVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "REALTIME_INGEST_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Realtime-ingest VERIFIED claim from GA4 debug refused — debug ACCEPTED≠realtime VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimStreamingExportVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "STREAMING_EXPORT_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Streaming-export VERIFIED claim from GA4 debug refused — debug ACCEPTED≠streaming export VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimAudienceExportVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "AUDIENCE_EXPORT_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Audience-export VERIFIED claim from GA4 debug refused — debug ACCEPTED≠audience export VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimSandboxVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "SANDBOX_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Sandbox VERIFIED claim from GA4 debug refused — fixture ACCEPTED≠sandbox VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimFixtureVerified === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "FIXTURE_VERIFIED_CLAIM_REFUSED",
      reasons: [
        "Fixture VERIFIED claim from GA4 debug refused — ACCEPTED≠VERIFIED (T-US-008 / T-X032)",
      ],
      ...ga4DebugHonestyBase,
      ...evidence,
    };
  }

  if (input.claimExternalEffects === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "EXTERNAL_EFFECTS_CLAIM_REFUSED",
      reasons: [
        "External-effects mutation claim from GA4 debug refused — externalEffects=NONE (T-US-008 / T-X032)",
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

  if (input.claimMeasuredReceipt === true) {
    return {
      kind: Ga4ValidationKind.DEBUG_VALIDATION,
      debugOk: input.debugEndpointAccepted,
      code: "MEASURED_RECEIPT_CLAIM_REFUSED",
      reasons: [
        "Measured-receipt claim from GA4 debug refused — debug≠measured receipt (T-US-008 / T-X032)",
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
  /**
   * Optional durable wait-manifest schema. When present and not
   * `gsc-row-v1`, demand stays UNKNOWN — never invent measured zeros.
   * Absent schema is allowed for legacy fixture callers (implicit OK).
   */
  schema?: string;
};

/** Live GSC query transport — always NOT_WIRED for fixture proofs (T-X033). */
export const GSC_LIVE_WIRING = "NOT_WIRED" as const;

export type GscLiveWiring = typeof GSC_LIVE_WIRING;

/**
 * Durable GSC row wait-manifest schema id. Wrong/missing schema → UNKNOWN
 * demand — never invent measured zeros (T-X033 deepen).
 */
export const GSC_ROW_MANIFEST_SCHEMA = "gsc-row-v1" as const;

export const GscRowManifestIntegrity = {
  OK: "OK",
  CORRUPT_JSON: "CORRUPT_JSON",
  TRUNCATED: "TRUNCATED",
  MISSING_REQUIRED_FIELDS: "MISSING_REQUIRED_FIELDS",
  WRONG_SCHEMA: "WRONG_SCHEMA",
} as const;

export type GscRowManifestIntegrityValue =
  (typeof GscRowManifestIntegrity)[keyof typeof GscRowManifestIntegrity];

export type GscDemandClassification = {
  query: string;
  clicks: MetricClassification;
  impressions: MetricClassification;
  /** Honest demand label when rows are omitted. */
  demandLabel: "measured" | "unknown" | "unavailable" | "fixture";
  reasons: string[];
  liveGscWiring: GscLiveWiring;
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

function gscHonesty(): Pick<
  GscDemandClassification,
  | "liveGscWiring"
  | "liveProviderSuccessClaimed"
  | "externalEffects"
  | "chatgptAdsAccess"
> {
  return {
    liveGscWiring: GSC_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
    chatgptAdsAccess: "ACCESS_BLOCKED",
  };
}

function missingGscMetrics(query: string): {
  clicks: MetricClassification;
  impressions: MetricClassification;
} {
  return {
    clicks: classifyMetric({
      metricId: `gsc-clicks:${query}`,
      value: null,
      sampleSize: null,
      sourceStatus: "missing",
    }),
    impressions: classifyMetric({
      metricId: `gsc-impressions:${query}`,
      value: null,
      sampleSize: null,
      sourceStatus: "missing",
    }),
  };
}

/**
 * Inspect raw durable GSC row wait-manifest bytes. Truncated / unparseable /
 * incomplete / wrong-schema payloads are not measured demand — UNKNOWN.
 */
export function inspectGscRowManifest(input: {
  raw: string | null | undefined;
}): {
  integrity: GscRowManifestIntegrityValue;
  row: GscRowObservation | null;
  reasons: string[];
} {
  const raw = input.raw;
  if (raw === null || raw === undefined || !String(raw).trim()) {
    return {
      integrity:
        raw === null || raw === undefined
          ? GscRowManifestIntegrity.MISSING_REQUIRED_FIELDS
          : GscRowManifestIntegrity.TRUNCATED,
      row: null,
      reasons: ["GSC row wait-manifest missing/empty"],
    };
  }
  const trimmed = String(raw);
  const openBraces = (trimmed.match(/\{/g) ?? []).length;
  const closeBraces = (trimmed.match(/\}/g) ?? []).length;
  const unbalanced = openBraces !== closeBraces;

  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(trimmed) as unknown;
  } catch {
    if (unbalanced || !trimmed.trimEnd().endsWith("}")) {
      return {
        integrity: GscRowManifestIntegrity.TRUNCATED,
        row: null,
        reasons: ["GSC row wait-manifest truncated/incomplete JSON"],
      };
    }
    return {
      integrity: GscRowManifestIntegrity.CORRUPT_JSON,
      row: null,
      reasons: ["GSC row wait-manifest JSON.parse failed"],
    };
  }

  if (
    parsedUnknown === null ||
    typeof parsedUnknown !== "object" ||
    Array.isArray(parsedUnknown)
  ) {
    return {
      integrity: GscRowManifestIntegrity.CORRUPT_JSON,
      row: null,
      reasons: ["GSC row wait-manifest root must be a JSON object"],
    };
  }

  const obj = parsedUnknown as Record<string, unknown>;
  if (obj.schema !== GSC_ROW_MANIFEST_SCHEMA) {
    return {
      integrity: GscRowManifestIntegrity.WRONG_SCHEMA,
      row: null,
      reasons: [
        `GSC row wait-manifest schema must be ${GSC_ROW_MANIFEST_SCHEMA}; got ${String(obj.schema)}`,
      ],
    };
  }

  const query = String(obj.query ?? "").trim();
  const environment = obj.environment;
  const omitted = obj.omitted === true;
  const clicks =
    obj.clicks === null
      ? null
      : typeof obj.clicks === "number"
        ? obj.clicks
        : undefined;
  const impressions =
    obj.impressions === null
      ? null
      : typeof obj.impressions === "number"
        ? obj.impressions
        : undefined;

  if (
    !query ||
    clicks === undefined ||
    impressions === undefined ||
    (environment !== AnalyticsEnvironment.FIXTURE &&
      environment !== AnalyticsEnvironment.SANDBOX &&
      environment !== AnalyticsEnvironment.LIVE &&
      environment !== AnalyticsEnvironment.NOT_WIRED &&
      environment !== AnalyticsEnvironment.UNAVAILABLE)
  ) {
    return {
      integrity: GscRowManifestIntegrity.MISSING_REQUIRED_FIELDS,
      row: null,
      reasons: [
        "GSC row wait-manifest missing required fields (query/clicks/impressions/environment)",
      ],
    };
  }

  return {
    integrity: GscRowManifestIntegrity.OK,
    row: {
      query,
      clicks,
      impressions,
      omitted,
      environment: environment as AnalyticsEnvironmentValue,
      schema: GSC_ROW_MANIFEST_SCHEMA,
    },
    reasons: ["GSC row wait-manifest integrity OK"],
  };
}

/**
 * Omitted GSC rows are UNKNOWN demand — never zero (T-US-010 / T-X033).
 * Non-finite clicks/impressions and invented zeros on omitted rows stay
 * UNKNOWN. Wrong wait-manifest schema stays UNKNOWN. Live GSC wiring
 * remains NOT_WIRED.
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
      ...gscHonesty(),
    };
  }

  // Blank / whitespace query cannot become measured demand.
  const queryTrimmed = String(row.query ?? "").trim();
  if (!queryTrimmed) {
    const missing = missingGscMetrics(row.query || "(blank)");
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        "Blank/whitespace GSC query — UNKNOWN demand, inventing measured zeros refused (T-X033)",
      ],
      ...gscHonesty(),
    };
  }

  // Invisible-only query (ZWSP/ZWNJ/ZWJ/BOM/word-joiner) after trim — UNKNOWN.
  // String.trim does not strip these; they must not invent measured demand.
  if (isInvisibleOnlyGscQuery(queryTrimmed)) {
    const missing = missingGscMetrics(row.query || "(invisible)");
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        "Invisible-only GSC query (zero-width/BOM/soft-hyphen) — UNKNOWN demand, inventing measured zeros refused (T-X033)",
      ],
      ...gscHonesty(),
    };
  }

  // Wrong wait-manifest schema → UNKNOWN (never invent measured zeros).
  if (
    row.schema !== undefined &&
    row.schema !== GSC_ROW_MANIFEST_SCHEMA
  ) {
    const missing = missingGscMetrics(row.query);
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        `GSC row wait-manifest schema=${row.schema} ≠ ${GSC_ROW_MANIFEST_SCHEMA} — UNKNOWN demand, inventing zero refused (T-X033)`,
      ],
      ...gscHonesty(),
    };
  }

  // Omitted row carrying invented zeros still UNKNOWN — never treat as measured 0.
  if (
    row.omitted &&
    row.clicks !== null &&
    row.impressions !== null &&
    row.clicks === 0 &&
    row.impressions === 0
  ) {
    const missing = missingGscMetrics(row.query);
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        "Omitted GSC row carried invented zeros — UNKNOWN demand, inventing zero refused (T-US-010 / T-X033)",
      ],
      ...gscHonesty(),
    };
  }

  if (row.omitted || row.clicks === null || row.impressions === null) {
    const missing = missingGscMetrics(row.query);
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        "GSC row omitted or incomplete — UNKNOWN demand, not zero (T-US-010 / T-X033)",
      ],
      ...gscHonesty(),
    };
  }

  // Malformed numeric payloads must not invent measured zero / negative demand.
  // Signed −0 is also refused — it is not an honest measured zero.
  if (
    !Number.isFinite(row.clicks) ||
    !Number.isFinite(row.impressions) ||
    row.clicks < 0 ||
    row.impressions < 0 ||
    Object.is(row.clicks, -0) ||
    Object.is(row.impressions, -0)
  ) {
    const missing = missingGscMetrics(row.query);
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        "GSC clicks/impressions non-finite, negative, or signed −0 — UNKNOWN demand, not invented zero (T-X033)",
      ],
      ...gscHonesty(),
    };
  }

  // Non-integer counts must not invent measured demand (no float CTR invent).
  if (!Number.isInteger(row.clicks) || !Number.isInteger(row.impressions)) {
    const missing = missingGscMetrics(row.query);
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        `GSC clicks/impressions non-integer (${row.clicks}/${row.impressions}) — UNKNOWN demand, inventing measured refused (T-X033)`,
      ],
      ...gscHonesty(),
    };
  }

  // Unsafe integers (beyond Number.MAX_SAFE_INTEGER) must not invent measured demand.
  if (
    !Number.isSafeInteger(row.clicks) ||
    !Number.isSafeInteger(row.impressions)
  ) {
    const missing = missingGscMetrics(row.query);
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        `GSC clicks/impressions not safe integers (${row.clicks}/${row.impressions}) — UNKNOWN demand, inventing measured refused (T-X033)`,
      ],
      ...gscHonesty(),
    };
  }

  // Impossible counts: clicks cannot exceed impressions — stay UNKNOWN.
  if (row.clicks > row.impressions) {
    const missing = missingGscMetrics(row.query);
    return {
      query: row.query,
      ...missing,
      demandLabel: "unknown",
      reasons: [
        `GSC clicks (${row.clicks}) > impressions (${row.impressions}) — impossible; UNKNOWN demand, inventing CTR refused (T-X033)`,
      ],
      ...gscHonesty(),
    };
  }

  // LIVE rows cannot become measured while live GSC wiring stays NOT_WIRED.
  if (row.environment === AnalyticsEnvironment.LIVE) {
    return {
      query: row.query,
      clicks: { kind: "unavailable", reason: "unsupported" },
      impressions: { kind: "unavailable", reason: "unsupported" },
      demandLabel: "unavailable",
      reasons: [
        "LIVE GSC row refused — liveGscWiring=NOT_WIRED; no measured demand (T-X033)",
      ],
      ...gscHonesty(),
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

  // If metric classification failed (insufficient sample / non-finite), stay UNKNOWN.
  if (clicks.kind !== "measured" || impressions.kind !== "measured") {
    return {
      query: row.query,
      clicks,
      impressions,
      demandLabel: "unknown",
      reasons: [
        "GSC metrics not measured — UNKNOWN demand, not invented zero (T-X033)",
      ],
      ...gscHonesty(),
    };
  }

  // SANDBOX ≠ LIVE measured — keep sandbox samples on the fixture side of honesty.
  if (row.environment === AnalyticsEnvironment.SANDBOX) {
    return {
      query: row.query,
      clicks,
      impressions,
      demandLabel: "fixture",
      reasons: [
        "SANDBOX GSC sample — not live property data; inventing live measured refused (T-X033)",
      ],
      ...gscHonesty(),
    };
  }

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
    ...gscHonesty(),
  };
}

/**
 * True when query is only invisible / format-control Unicode
 * (ZWSP/ZWNJ/ZWJ/BOM/word-joiner/soft-hyphen/invisible math operators).
 */
export function isInvisibleOnlyGscQuery(query: string): boolean {
  const stripped = String(query).replace(
    /[\u00AD\u200B-\u200D\uFEFF\u2060-\u2064]/g,
    "",
  );
  return stripped.length === 0;
}

export type GscDemandHonestyCode =
  | "MEASURED"
  | "FIXTURE"
  | "UNKNOWN_OMITTED"
  | "UNAVAILABLE_NOT_WIRED"
  | "OMITTED_AS_ZERO_REFUSED"
  | "WRONG_GSC_ROW_SCHEMA"
  | "INVALID_GSC_QUERY"
  | "INVALID_GSC_COUNTS"
  | "NON_INTEGER_GSC_COUNTS"
  | "UNSAFE_GSC_COUNTS"
  | "IMPOSSIBLE_GSC_COUNTS"
  | "INVENT_CTR_REFUSED"
  | "INVENT_POSITION_REFUSED"
  | "INVENT_MEASURED_DESPITE_UNKNOWN"
  | "INVENT_AGGREGATE_FROM_UNKNOWN"
  | "INVENT_MEASURED_FROM_FIXTURE"
  | "INVENT_MEASURED_FROM_SANDBOX"
  | "INVENT_FROM_CORRUPT_MANIFEST"
  | "INVENT_CTR_FROM_ZERO_IMPRESSIONS"
  | "LIVE_GSC_CLAIM_REFUSED";

export type GscDemandHonestyDecision = {
  allowed: boolean;
  code: GscDemandHonestyCode;
  classification: GscDemandClassification | null;
  /** True only when demand may enter measured demand totals. */
  countsAsMeasuredDemand: boolean;
  reasons: string[];
  liveGscWiring: GscLiveWiring;
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

/**
 * Evaluate one GSC row for honest demand (T-US-010 / T-X033).
 * Refuses live VERIFIED / live GSC wire claims and refuses treating
 * omitted/unknown/wrong-schema rows as measured zero demand.
 */
export function evaluateGscDemandHonesty(input: {
  row: GscRowObservation;
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — live GSC transport stays NOT_WIRED. */
  requestLiveGscWire?: boolean;
  /** Forbidden — treat omitted/unknown as measured zero demand. */
  treatOmittedAsZero?: boolean;
  /** Forbidden — invent measured demand from wrong wait-manifest schema. */
  inventMeasuredFromWrongSchema?: boolean;
  /** Forbidden — invent CTR/rate from omitted/unknown/impossible rows. */
  inventCtrFromOmitted?: boolean;
  /** Forbidden — promote unknown/unavailable to measured despite honesty. */
  inventMeasuredDespiteUnknown?: boolean;
  /** Forbidden — fold unknown/unavailable rows into measured demand aggregates. */
  inventAggregateFromUnknown?: boolean;
  /** Forbidden — invent avg position / rank from unknown/unavailable rows. */
  inventPositionFromUnknown?: boolean;
  /** Forbidden — promote fixture ACCEPTED rows as live measured demand. */
  inventMeasuredFromFixture?: boolean;
  /** Forbidden — promote SANDBOX rows as live measured demand. */
  inventMeasuredFromSandbox?: boolean;
  /** Forbidden — invent measured demand from corrupt/missing wait-manifest. */
  inventMeasuredFromCorruptManifest?: boolean;
  /** Integrity from inspectGscRowManifest when inventMeasuredFromCorruptManifest. */
  corruptManifestIntegrity?: GscRowManifestIntegrityValue;
  /** Forbidden — invent CTR/rate when impressions are zero (division-by-zero invent). */
  inventCtrFromZeroImpressions?: boolean;
}): GscDemandHonestyDecision {
  const honesty = gscHonesty();
  if (
    input.claimLiveVerified === true ||
    input.requestLiveGscWire === true ||
    input.row.environment === AnalyticsEnvironment.LIVE
  ) {
    const classification =
      input.row.environment === AnalyticsEnvironment.LIVE
        ? classifyGscDemand(input.row)
        : null;
    return {
      allowed: false,
      code: "LIVE_GSC_CLAIM_REFUSED",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        input.row.environment === AnalyticsEnvironment.LIVE
          ? "LIVE GSC environment refused — liveGscWiring=NOT_WIRED; no measured demand (T-X033)"
          : input.claimLiveVerified === true
            ? "Live VERIFIED GSC claims are forbidden — fixture ACCEPTED only (T-X033)"
            : "Live GSC wiring remains NOT_WIRED — refuse live GSC wire (T-X033)",
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED chatgptAdsAccess=ACCESS_BLOCKED",
      ],
      ...honesty,
    };
  }

  const classification = classifyGscDemand(input.row);

  const schemaMismatch =
    input.row.schema !== undefined &&
    input.row.schema !== GSC_ROW_MANIFEST_SCHEMA;

  if (
    schemaMismatch &&
    (input.inventMeasuredFromWrongSchema === true ||
      input.treatOmittedAsZero === true)
  ) {
    return {
      allowed: false,
      code: "WRONG_GSC_ROW_SCHEMA",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `Refuse inventing measured/zero demand from wrong GSC row wait-manifest schema=${input.row.schema} (T-X033)`,
        `required=${GSC_ROW_MANIFEST_SCHEMA}`,
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (schemaMismatch) {
    return {
      allowed: false,
      code: "WRONG_GSC_ROW_SCHEMA",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `GSC row wait-manifest schema mismatch — UNKNOWN, not measured (T-X033)`,
        ...classification.reasons,
      ],
      ...honesty,
    };
  }

  const queryTrimmedForHonesty = String(input.row.query ?? "").trim();
  if (
    !queryTrimmedForHonesty ||
    isInvisibleOnlyGscQuery(queryTrimmedForHonesty)
  ) {
    return {
      allowed: false,
      code: "INVALID_GSC_QUERY",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        !queryTrimmedForHonesty
          ? "Blank/whitespace GSC query refused — UNKNOWN, not measured (T-X033)"
          : "Invisible-only GSC query (zero-width/BOM/soft-hyphen) refused — UNKNOWN, not measured (T-X033)",
        ...classification.reasons,
      ],
      ...honesty,
    };
  }

  if (
    input.inventMeasuredFromCorruptManifest === true &&
    input.corruptManifestIntegrity !== undefined &&
    input.corruptManifestIntegrity !== GscRowManifestIntegrity.OK
  ) {
    return {
      allowed: false,
      code: "INVENT_FROM_CORRUPT_MANIFEST",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `Refuse inventing measured demand from corrupt/missing GSC wait-manifest integrity=${input.corruptManifestIntegrity} (T-X033)`,
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (
    input.row.clicks !== null &&
    input.row.impressions !== null &&
    (!Number.isFinite(input.row.clicks) ||
      !Number.isFinite(input.row.impressions) ||
      input.row.clicks < 0 ||
      input.row.impressions < 0 ||
      Object.is(input.row.clicks, -0) ||
      Object.is(input.row.impressions, -0))
  ) {
    return {
      allowed: false,
      code: "INVALID_GSC_COUNTS",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        "Non-finite, negative, or signed −0 GSC clicks/impressions refused — UNKNOWN, not measured (T-X033)",
        ...classification.reasons,
      ],
      ...honesty,
    };
  }

  if (
    input.row.clicks !== null &&
    input.row.impressions !== null &&
    Number.isFinite(input.row.clicks) &&
    Number.isFinite(input.row.impressions) &&
    (!Number.isInteger(input.row.clicks) ||
      !Number.isInteger(input.row.impressions))
  ) {
    return {
      allowed: false,
      code: "NON_INTEGER_GSC_COUNTS",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        "Non-integer GSC clicks/impressions refused — UNKNOWN, inventing measured refused (T-X033)",
        ...classification.reasons,
      ],
      ...honesty,
    };
  }

  if (
    input.row.clicks !== null &&
    input.row.impressions !== null &&
    Number.isInteger(input.row.clicks) &&
    Number.isInteger(input.row.impressions) &&
    (!Number.isSafeInteger(input.row.clicks) ||
      !Number.isSafeInteger(input.row.impressions))
  ) {
    return {
      allowed: false,
      code: "UNSAFE_GSC_COUNTS",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        "Unsafe (non-safe-integer) GSC clicks/impressions refused — UNKNOWN, inventing measured refused (T-X033)",
        ...classification.reasons,
      ],
      ...honesty,
    };
  }

  if (
    input.row.clicks !== null &&
    input.row.impressions !== null &&
    Number.isFinite(input.row.clicks) &&
    Number.isFinite(input.row.impressions) &&
    input.row.clicks > input.row.impressions
  ) {
    return {
      allowed: false,
      code: "IMPOSSIBLE_GSC_COUNTS",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        "Impossible GSC clicks>impressions — UNKNOWN; inventing CTR refused (T-X033)",
        ...classification.reasons,
      ],
      ...honesty,
    };
  }

  if (
    input.treatOmittedAsZero === true &&
    (classification.demandLabel === "unknown" ||
      classification.demandLabel === "unavailable")
  ) {
    return {
      allowed: false,
      code: "OMITTED_AS_ZERO_REFUSED",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `Refuse treating ${classification.demandLabel} GSC demand as measured zero (T-US-010 / T-X033)`,
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (
    input.inventCtrFromOmitted === true &&
    (classification.demandLabel === "unknown" ||
      classification.demandLabel === "unavailable")
  ) {
    return {
      allowed: false,
      code: "INVENT_CTR_REFUSED",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `Refuse inventing CTR/rate from ${classification.demandLabel} GSC row (T-X033)`,
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (
    input.inventCtrFromZeroImpressions === true &&
    input.row.impressions !== null &&
    Number.isFinite(input.row.impressions) &&
    input.row.impressions === 0
  ) {
    return {
      allowed: false,
      code: "INVENT_CTR_FROM_ZERO_IMPRESSIONS",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        "Refuse inventing CTR/rate from zero-impression GSC row (division-by-zero invent) (T-X033)",
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (
    input.inventMeasuredDespiteUnknown === true &&
    (classification.demandLabel === "unknown" ||
      classification.demandLabel === "unavailable")
  ) {
    return {
      allowed: false,
      code: "INVENT_MEASURED_DESPITE_UNKNOWN",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `Refuse inventing measured demand despite ${classification.demandLabel} GSC honesty (T-X033)`,
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (
    input.inventAggregateFromUnknown === true &&
    (classification.demandLabel === "unknown" ||
      classification.demandLabel === "unavailable")
  ) {
    return {
      allowed: false,
      code: "INVENT_AGGREGATE_FROM_UNKNOWN",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `Refuse folding ${classification.demandLabel} GSC rows into measured demand aggregates (T-X033)`,
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (
    input.inventPositionFromUnknown === true &&
    (classification.demandLabel === "unknown" ||
      classification.demandLabel === "unavailable")
  ) {
    return {
      allowed: false,
      code: "INVENT_POSITION_REFUSED",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        `Refuse inventing avg position/rank from ${classification.demandLabel} GSC row (T-X033)`,
        "liveGscWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty,
    };
  }

  if (
    input.inventMeasuredFromFixture === true &&
    classification.demandLabel === "fixture" &&
    input.row.environment === AnalyticsEnvironment.FIXTURE
  ) {
    return {
      allowed: false,
      code: "INVENT_MEASURED_FROM_FIXTURE",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        "Refuse promoting fixture ACCEPTED GSC rows as live measured demand (T-X033)",
        "ACCEPTED≠VERIFIED liveGscWiring=NOT_WIRED",
      ],
      ...honesty,
    };
  }

  if (
    input.inventMeasuredFromSandbox === true &&
    input.row.environment === AnalyticsEnvironment.SANDBOX
  ) {
    return {
      allowed: false,
      code: "INVENT_MEASURED_FROM_SANDBOX",
      classification,
      countsAsMeasuredDemand: false,
      reasons: [
        "Refuse promoting SANDBOX GSC rows as live measured demand (T-X033)",
        "SANDBOX≠LIVE ACCEPTED≠VERIFIED liveGscWiring=NOT_WIRED",
      ],
      ...honesty,
    };
  }

  if (classification.demandLabel === "unavailable") {
    return {
      allowed: true,
      code: "UNAVAILABLE_NOT_WIRED",
      classification,
      countsAsMeasuredDemand: false,
      reasons: classification.reasons,
      ...honesty,
    };
  }

  if (classification.demandLabel === "unknown") {
    return {
      allowed: true,
      code: "UNKNOWN_OMITTED",
      classification,
      countsAsMeasuredDemand: false,
      reasons: classification.reasons,
      ...honesty,
    };
  }

  if (classification.demandLabel === "fixture") {
    return {
      allowed: true,
      code: "FIXTURE",
      classification,
      countsAsMeasuredDemand: true,
      reasons: classification.reasons,
      ...honesty,
    };
  }

  return {
    allowed: true,
    code: "MEASURED",
    classification,
    countsAsMeasuredDemand: true,
    reasons: classification.reasons,
    ...honesty,
  };
}

export type HonestGscDemandSummary = {
  measuredOrFixtureCount: number;
  unknownCount: number;
  unavailableCount: number;
  /** Measured demand clicks sum — never includes omitted/unknown as zero. */
  measuredClicksSum: number;
  liveGscWiring: GscLiveWiring;
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

/**
 * Aggregate GSC rows into honest demand totals.
 * Omitted/unknown/unavailable never contribute invented zeros to measuredClicksSum.
 */
export function summarizeHonestGscDemand(
  rows: readonly GscRowObservation[],
): HonestGscDemandSummary {
  let measuredOrFixtureCount = 0;
  let unknownCount = 0;
  let unavailableCount = 0;
  let measuredClicksSum = 0;
  for (const row of rows) {
    const c = classifyGscDemand(row);
    if (c.demandLabel === "unknown") unknownCount += 1;
    else if (c.demandLabel === "unavailable") unavailableCount += 1;
    else {
      measuredOrFixtureCount += 1;
      if (c.clicks.kind === "measured") measuredClicksSum += c.clicks.value;
    }
  }
  return {
    measuredOrFixtureCount,
    unknownCount,
    unavailableCount,
    measuredClicksSum,
    ...gscHonesty(),
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
