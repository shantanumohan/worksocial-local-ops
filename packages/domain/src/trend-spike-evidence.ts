/**
 * T-X040 — Low-sample trend spike → insufficient evidence.
 *
 * An apparent keyword/trend spike with too-small a sample must stay
 * research-only: never a publish trigger and never "measured" demand.
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE. Live trend provider: NOT_WIRED.
 */

/** Default minimum sample for treating a trend delta as measured. */
export const DEFAULT_MIN_TREND_SAMPLE = 10;

/** Default relative lift (current vs baseline) that counts as a spike. */
export const DEFAULT_SPIKE_RATIO = 2;

export const TrendSpikeDecisionCode = {
  /** Sample too small / missing / invalid, or lift uncomputable — research only. */
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
  /** Sample adequate and lift meets spike ratio — measured spike (still not auto-publish). */
  MEASURED_SPIKE: "MEASURED_SPIKE",
  /** Sample adequate, ratio computable, but lift below spike ratio. */
  NO_SPIKE: "NO_SPIKE",
} as const;

export type TrendSpikeDecisionCodeValue =
  (typeof TrendSpikeDecisionCode)[keyof typeof TrendSpikeDecisionCode];

export type AssessTrendSpikeEvidenceInput = {
  /** Current period raw/normalized trend value. */
  currentValue: number;
  /** Comparable prior/baseline value in the same index family. */
  baselineValue: number;
  /** Observation sample size; null/undefined = unknown. */
  sampleSize: number | null | undefined;
  /** Minimum sample required before a spike can be measured. */
  minSample?: number;
  /** Relative lift threshold (current / baseline) for MEASURED_SPIKE. */
  spikeRatio?: number;
};

export type AssessTrendSpikeEvidenceResult = {
  code: TrendSpikeDecisionCodeValue;
  /** Apparent lift; null when baseline is zero/non-positive or values non-finite. */
  liftRatio: number | null;
  /** True only for MEASURED_SPIKE — still never auto-authorizes publish. */
  measuredSpike: boolean;
  /** Always false for this gate alone — never auto-authorizes publish. */
  allowPublishTrigger: false;
  /** Research task (not publish) when evidence is insufficient. */
  researchTaskOnly: boolean;
  reason: string;
  liveTrendProviderWiring: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

function isUsableSampleCount(sample: number, minSample: number): boolean {
  return (
    Number.isFinite(sample) &&
    Number.isInteger(sample) &&
    sample >= minSample
  );
}

function honestyFields(): Pick<
  AssessTrendSpikeEvidenceResult,
  "liveTrendProviderWiring" | "liveProviderSuccessClaimed" | "externalEffects" | "allowPublishTrigger"
> {
  return {
    allowPublishTrigger: false,
    liveTrendProviderWiring: "NOT_WIRED",
    liveProviderSuccessClaimed: false,
    externalEffects: "NONE",
  };
}

/**
 * Classify a trend observation that appears to spike.
 * Low/missing/invalid sample or uncomputable lift → INSUFFICIENT_EVIDENCE
 * (research task, not publish). This gate never sets allowPublishTrigger.
 */
export function assessTrendSpikeEvidence(
  input: AssessTrendSpikeEvidenceInput,
): AssessTrendSpikeEvidenceResult {
  const minSample = input.minSample ?? DEFAULT_MIN_TREND_SAMPLE;
  const spikeRatio = input.spikeRatio ?? DEFAULT_SPIKE_RATIO;
  const sample = input.sampleSize;
  const honesty = honestyFields();
  const liftRatio =
    Number.isFinite(input.baselineValue) &&
    input.baselineValue > 0 &&
    Number.isFinite(input.currentValue)
      ? input.currentValue / input.baselineValue
      : null;

  if (sample === null || sample === undefined) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Missing trend sample — insufficient evidence; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (typeof sample === "bigint") {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "BigInt trend sample count — insufficient evidence; plain integer counts only; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (typeof sample !== "number") {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Non-number trend sample type — insufficient evidence; integer counts only; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (!Number.isFinite(sample)) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Non-finite trend sample — insufficient evidence; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (!Number.isInteger(sample)) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Non-integer (fractional) trend sample count — insufficient evidence; integer counts only; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (sample < 0) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Negative trend sample count — insufficient evidence; non-negative integer counts only; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (sample === 0) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Zero trend sample count — missing observations; insufficient evidence; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (!isUsableSampleCount(sample, minSample)) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Low-sample trend count below minimum — insufficient evidence; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (liftRatio === null || !Number.isFinite(liftRatio)) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio: null,
      measuredSpike: false,
      researchTaskOnly: true,
      reason:
        "Baseline/current cannot yield a finite lift ratio — insufficient evidence; research task only, not a publish trigger",
      ...honesty,
    };
  }

  if (liftRatio >= spikeRatio) {
    return {
      code: TrendSpikeDecisionCode.MEASURED_SPIKE,
      liftRatio,
      measuredSpike: true,
      researchTaskOnly: false,
      reason:
        "Sample sufficient and lift meets spike ratio — measured spike; still not an auto publish trigger",
      ...honesty,
    };
  }

  return {
    code: TrendSpikeDecisionCode.NO_SPIKE,
    liftRatio,
    measuredSpike: false,
    researchTaskOnly: false,
    reason: "Sample sufficient but lift below spike ratio — no measured spike",
    ...honesty,
  };
}

/**
 * Honesty wrapper: this gate alone never authorizes publish, regardless of code.
 */
export function evaluateTrendSpikePublishHonesty(
  result: AssessTrendSpikeEvidenceResult,
): {
  allowPublishTrigger: false;
  measuredSpikeImpliesPublish: false;
  liveTrendProviderWiring: "NOT_WIRED";
  externalEffects: "NONE";
  code: TrendSpikeDecisionCodeValue;
} {
  return {
    allowPublishTrigger: false,
    measuredSpikeImpliesPublish: false,
    liveTrendProviderWiring: "NOT_WIRED",
    externalEffects: "NONE",
    code: result.code,
  };
}

/**
 * True when sample is a positive count strictly below minSample
 * (finite but inadequate). Zero observations are missing, not present —
 * distinct from null/undefined/non-finite as well.
 */
export function isLowButPresentTrendSample(
  sampleSize: number | null | undefined,
  minSample: number = DEFAULT_MIN_TREND_SAMPLE,
): boolean {
  return (
    typeof sampleSize === "number" &&
    Number.isFinite(sampleSize) &&
    Number.isInteger(sampleSize) &&
    sampleSize > 0 &&
    sampleSize < minSample
  );
}

export const TREND_SPIKE_RELATED_CASE_IDS = ["T-X040"] as const;
