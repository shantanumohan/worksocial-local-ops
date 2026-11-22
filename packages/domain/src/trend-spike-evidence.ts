/**
 * T-X040 — Low-sample trend spike → insufficient evidence.
 *
 * An apparent keyword/trend spike with too-small a sample must stay
 * research-only: never a publish trigger and never "measured" demand.
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
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
  /** Always false for INSUFFICIENT_EVIDENCE; never true from this gate alone. */
  allowPublishTrigger: boolean;
  /** Research task (not publish) when evidence is insufficient. */
  researchTaskOnly: boolean;
  reason: string;
};

function isUsableSampleCount(sample: number, minSample: number): boolean {
  return Number.isFinite(sample) && sample >= minSample;
}

/**
 * Classify a trend observation that appears to spike.
 * Low/missing/invalid sample or uncomputable lift → INSUFFICIENT_EVIDENCE
 * (research task, not publish).
 */
export function assessTrendSpikeEvidence(
  input: AssessTrendSpikeEvidenceInput,
): AssessTrendSpikeEvidenceResult {
  const minSample = input.minSample ?? DEFAULT_MIN_TREND_SAMPLE;
  const spikeRatio = input.spikeRatio ?? DEFAULT_SPIKE_RATIO;
  const sample = input.sampleSize;
  const liftRatio =
    Number.isFinite(input.baselineValue) &&
    input.baselineValue > 0 &&
    Number.isFinite(input.currentValue)
      ? input.currentValue / input.baselineValue
      : null;

  if (
    sample === null ||
    sample === undefined ||
    !isUsableSampleCount(sample, minSample)
  ) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio,
      measuredSpike: false,
      allowPublishTrigger: false,
      researchTaskOnly: true,
      reason:
        "Low-sample, missing, or non-finite trend sample — insufficient evidence; research task only, not a publish trigger",
    };
  }

  if (liftRatio === null || !Number.isFinite(liftRatio)) {
    return {
      code: TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE,
      liftRatio: null,
      measuredSpike: false,
      allowPublishTrigger: false,
      researchTaskOnly: true,
      reason:
        "Baseline/current cannot yield a finite lift ratio — insufficient evidence; research task only, not a publish trigger",
    };
  }

  if (liftRatio >= spikeRatio) {
    return {
      code: TrendSpikeDecisionCode.MEASURED_SPIKE,
      liftRatio,
      measuredSpike: true,
      allowPublishTrigger: false,
      researchTaskOnly: false,
      reason:
        "Sample sufficient and lift meets spike ratio — measured spike; still not an auto publish trigger",
    };
  }

  return {
    code: TrendSpikeDecisionCode.NO_SPIKE,
    liftRatio,
    measuredSpike: false,
    allowPublishTrigger: false,
    researchTaskOnly: false,
    reason: "Sample sufficient but lift below spike ratio — no measured spike",
  };
}
