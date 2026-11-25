/**
 * Metric missingness — provider/test errors are not zero data by default.
 *
 * T-X039 / T-US-058 — honest denominators: provider_error → unavailable
 * (never measured/zero pass); synthetic → excluded from business totals.
 * Live metrics wiring stays NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export type MetricObservation = {
  metricId: string;
  value: number | null;
  sampleSize: number | null;
  sourceStatus:
    | "ok"
    | "missing"
    | "provider_error"
    | "unsupported"
    | "partial"
    | "synthetic";
};

export type MetricClassification =
  | { kind: "measured"; value: number; sampleSize: number }
  | {
      kind: "missing";
      reason: "no_observation" | "insufficient_sample" | "non_finite";
    }
  | { kind: "unavailable"; reason: "provider_error" | "unsupported" | "partial" }
  | { kind: "excluded"; reason: "synthetic" };

/** Live metrics / eval-fleet wiring — always NOT_WIRED for fixture proofs. */
export const METRIC_LIVE_WIRING = "NOT_WIRED" as const;

export type MetricLiveWiring = typeof METRIC_LIVE_WIRING;

const MIN_SAMPLE = 1;

export function classifyMetric(
  observation: MetricObservation,
  minSample: number = MIN_SAMPLE,
): MetricClassification {
  if (observation.sourceStatus === "synthetic") {
    return { kind: "excluded", reason: "synthetic" };
  }
  if (observation.sourceStatus === "provider_error") {
    return { kind: "unavailable", reason: "provider_error" };
  }
  if (observation.sourceStatus === "unsupported") {
    return { kind: "unavailable", reason: "unsupported" };
  }
  if (observation.sourceStatus === "partial") {
    return { kind: "unavailable", reason: "partial" };
  }
  if (observation.sourceStatus === "missing" || observation.value === null) {
    return { kind: "missing", reason: "no_observation" };
  }
  // Malformed provider payloads must not enter measured denominators.
  if (
    !Number.isFinite(observation.value) ||
    observation.sampleSize === null ||
    !Number.isFinite(observation.sampleSize) ||
    !Number.isFinite(minSample)
  ) {
    return { kind: "missing", reason: "non_finite" };
  }
  if (observation.sampleSize < minSample) {
    return { kind: "missing", reason: "insufficient_sample" };
  }
  return {
    kind: "measured",
    value: observation.value,
    sampleSize: observation.sampleSize,
  };
}

export type MetricDenominatorCode =
  | "MEASURED"
  | "UNAVAILABLE_PROVIDER_ERROR"
  | "UNAVAILABLE_UNSUPPORTED"
  | "UNAVAILABLE_PARTIAL"
  | "MISSING"
  | "EXCLUDED_SYNTHETIC"
  | "UNAVAILABLE_AS_ZERO_REFUSED"
  | "LIVE_METRICS_CLAIM_REFUSED";

export type MetricDenominatorDecision = {
  allowed: boolean;
  code: MetricDenominatorCode;
  classification: MetricClassification | null;
  /** Observations that may enter a pass-rate / commercial denominator. */
  countsInDenominator: boolean;
  reasons: string[];
  externalEffects: "NONE";
  liveMetricsWiring: MetricLiveWiring;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

function honesty(): Pick<
  MetricDenominatorDecision,
  | "externalEffects"
  | "liveMetricsWiring"
  | "liveProviderSuccessClaimed"
  | "chatgptAdsAccess"
> {
  return {
    externalEffects: "NONE",
    liveMetricsWiring: METRIC_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
  };
}

/**
 * Classify one observation for honest denominators (T-X039 / T-US-058).
 * Refuses live VERIFIED / live metrics wire claims and refuses treating
 * unavailable provider errors as measured zero.
 */
export function evaluateMetricForHonestDenominator(input: {
  observation: MetricObservation;
  minSample?: number;
  /** Forbidden — fixture proofs never claim live VERIFIED. */
  claimLiveVerified?: boolean;
  /** Forbidden — live metrics fleet stays NOT_WIRED. */
  requestLiveMetricsWire?: boolean;
  /** Forbidden — treat provider_error/unavailable as measured zero pass. */
  treatUnavailableAsZero?: boolean;
}): MetricDenominatorDecision {
  if (input.claimLiveVerified === true) {
    return {
      allowed: false,
      code: "LIVE_METRICS_CLAIM_REFUSED",
      classification: null,
      countsInDenominator: false,
      reasons: [
        "Live VERIFIED metric claims are forbidden — fixture ACCEPTED only (T-X039)",
        "liveMetricsWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty(),
    };
  }
  if (input.requestLiveMetricsWire === true) {
    return {
      allowed: false,
      code: "LIVE_METRICS_CLAIM_REFUSED",
      classification: null,
      countsInDenominator: false,
      reasons: [
        "Live metrics wiring remains NOT_WIRED — refuse live metrics wire (T-X039)",
        "chatgptAdsAccess=ACCESS_BLOCKED externalEffects=NONE",
      ],
      ...honesty(),
    };
  }

  const classification = classifyMetric(
    input.observation,
    input.minSample ?? MIN_SAMPLE,
  );

  if (
    input.treatUnavailableAsZero === true &&
    classification.kind === "unavailable"
  ) {
    return {
      allowed: false,
      code: "UNAVAILABLE_AS_ZERO_REFUSED",
      classification,
      countsInDenominator: false,
      reasons: [
        `Refuse treating ${classification.reason} as measured zero — honest denominator excludes unavailable (T-X039)`,
        "liveMetricsWiring=NOT_WIRED ACCEPTED≠VERIFIED",
      ],
      ...honesty(),
    };
  }

  if (classification.kind === "measured") {
    return {
      allowed: true,
      code: "MEASURED",
      classification,
      countsInDenominator: true,
      reasons: [
        "ok observation → measured; may enter honest denominator",
        "liveMetricsWiring=NOT_WIRED",
        "ACCEPTED≠VERIFIED",
      ],
      ...honesty(),
    };
  }

  if (classification.kind === "excluded") {
    return {
      allowed: true,
      code: "EXCLUDED_SYNTHETIC",
      classification,
      countsInDenominator: false,
      reasons: [
        "synthetic metric → excluded from business denominators (T-US-058)",
        "liveMetricsWiring=NOT_WIRED",
      ],
      ...honesty(),
    };
  }

  if (classification.kind === "missing") {
    return {
      allowed: true,
      code: "MISSING",
      classification,
      countsInDenominator: false,
      reasons: [
        `missing (${classification.reason}) — not measured; not zero pass`,
        "liveMetricsWiring=NOT_WIRED",
      ],
      ...honesty(),
    };
  }

  // unavailable
  const code: MetricDenominatorCode =
    classification.reason === "provider_error"
      ? "UNAVAILABLE_PROVIDER_ERROR"
      : classification.reason === "unsupported"
        ? "UNAVAILABLE_UNSUPPORTED"
        : "UNAVAILABLE_PARTIAL";
  return {
    allowed: true,
    code,
    classification,
    countsInDenominator: false,
    reasons: [
      `${classification.reason} → unavailable (not measured/zero pass) (T-X039)`,
      "liveMetricsWiring=NOT_WIRED chatgptAdsAccess=ACCESS_BLOCKED",
      "ACCEPTED≠VERIFIED",
    ],
    ...honesty(),
  };
}

export type HonestPassRateSummary = {
  /** Number of measured observation batches. */
  measuredCount: number;
  unavailableCount: number;
  excludedCount: number;
  missingCount: number;
  /**
   * Pass-rate denominator = sum of measured sampleSize values (batch-weighted).
   * Never includes unavailable / synthetic / missing / non-finite.
   */
  denominator: number;
  externalEffects: "NONE";
  liveMetricsWiring: MetricLiveWiring;
  liveProviderSuccessClaimed: false;
  chatgptAdsAccess: "ACCESS_BLOCKED";
};

/**
 * Aggregate observations into an honest pass-rate denominator.
 * Only `measured` sample sizes sum into the denominator; provider_error /
 * synthetic / non-finite never inflate or zero-fill it.
 */
export function summarizeHonestMetricDenominator(
  observations: readonly MetricObservation[],
  minSample: number = MIN_SAMPLE,
): HonestPassRateSummary {
  let measuredCount = 0;
  let unavailableCount = 0;
  let excludedCount = 0;
  let missingCount = 0;
  let denominator = 0;
  for (const obs of observations) {
    const c = classifyMetric(obs, minSample);
    if (c.kind === "measured") {
      measuredCount += 1;
      denominator += c.sampleSize;
    } else if (c.kind === "unavailable") unavailableCount += 1;
    else if (c.kind === "excluded") excludedCount += 1;
    else missingCount += 1;
  }
  return {
    measuredCount,
    unavailableCount,
    excludedCount,
    missingCount,
    denominator,
    externalEffects: "NONE",
    liveMetricsWiring: METRIC_LIVE_WIRING,
    liveProviderSuccessClaimed: false,
    chatgptAdsAccess: "ACCESS_BLOCKED",
  };
}
