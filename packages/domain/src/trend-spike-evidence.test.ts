import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_TREND_SAMPLE,
  DEFAULT_SPIKE_RATIO,
  TREND_SPIKE_RELATED_CASE_IDS,
  TrendSpikeDecisionCode,
  assessTrendSpikeEvidence,
  evaluateTrendSpikePublishHonesty,
  isLowButPresentTrendSample,
} from "./trend-spike-evidence.js";

describe("assessTrendSpikeEvidence (T-X040)", () => {
  it("marks low-sample apparent spike as insufficient evidence (not publish)", () => {
    const result = assessTrendSpikeEvidence({
      currentValue: 80,
      baselineValue: 10,
      sampleSize: 3,
    });
    expect(result.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(result.measuredSpike).toBe(false);
    expect(result.allowPublishTrigger).toBe(false);
    expect(result.researchTaskOnly).toBe(true);
    expect(result.liftRatio).toBe(8);
    expect(result.liveTrendProviderWiring).toBe("NOT_WIRED");
    expect(result.liveProviderSuccessClaimed).toBe(false);
    expect(result.externalEffects).toBe("NONE");
    expect(result.reason).toMatch(/insufficient evidence/i);
  });

  it("treats null/undefined sample as insufficient evidence", () => {
    expect(
      assessTrendSpikeEvidence({
        currentValue: 50,
        baselineValue: 5,
        sampleSize: null,
      }).code,
    ).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(
      assessTrendSpikeEvidence({
        currentValue: 50,
        baselineValue: 5,
        sampleSize: undefined,
      }).code,
    ).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
  });

  it("classifies adequate-sample lift as measured spike (still no auto publish)", () => {
    const result = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: DEFAULT_MIN_TREND_SAMPLE,
    });
    expect(result.code).toBe(TrendSpikeDecisionCode.MEASURED_SPIKE);
    expect(result.measuredSpike).toBe(true);
    expect(result.allowPublishTrigger).toBe(false);
    expect(result.researchTaskOnly).toBe(false);
    expect(result.liftRatio).toBe(4);
    expect(result.externalEffects).toBe("NONE");
    expect(result.liveTrendProviderWiring).toBe("NOT_WIRED");
  });

  it("classifies adequate-sample flat trend as no spike", () => {
    const result = assessTrendSpikeEvidence({
      currentValue: 12,
      baselineValue: 10,
      sampleSize: 20,
    });
    expect(result.code).toBe(TrendSpikeDecisionCode.NO_SPIKE);
    expect(result.measuredSpike).toBe(false);
    expect(result.allowPublishTrigger).toBe(false);
    expect(result.liveProviderSuccessClaimed).toBe(false);
  });

  it("rejects non-finite sample sizes as insufficient evidence", () => {
    for (const sampleSize of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = assessTrendSpikeEvidence({
        currentValue: 80,
        baselineValue: 10,
        sampleSize,
      });
      expect(result.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
      expect(result.measuredSpike).toBe(false);
      expect(result.researchTaskOnly).toBe(true);
      expect(result.allowPublishTrigger).toBe(false);
    }
  });

  it("preserves uncertainty when baseline cannot yield a ratio", () => {
    const result = assessTrendSpikeEvidence({
      currentValue: 50,
      baselineValue: 0,
      sampleSize: 25,
    });
    expect(result.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(result.liftRatio).toBeNull();
    expect(result.measuredSpike).toBe(false);
    expect(result.researchTaskOnly).toBe(true);
    expect(result.allowPublishTrigger).toBe(false);
  });

  it("boundary: minSample-1 stays insufficient; exact minSample can measure", () => {
    const justBelow = assessTrendSpikeEvidence({
      currentValue: 100,
      baselineValue: 10,
      sampleSize: DEFAULT_MIN_TREND_SAMPLE - 1,
    });
    expect(justBelow.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(justBelow.researchTaskOnly).toBe(true);
    expect(isLowButPresentTrendSample(DEFAULT_MIN_TREND_SAMPLE - 1)).toBe(true);

    const atMin = assessTrendSpikeEvidence({
      currentValue: 10 * DEFAULT_SPIKE_RATIO,
      baselineValue: 10,
      sampleSize: DEFAULT_MIN_TREND_SAMPLE,
    });
    expect(atMin.code).toBe(TrendSpikeDecisionCode.MEASURED_SPIKE);
    expect(atMin.allowPublishTrigger).toBe(false);
    expect(isLowButPresentTrendSample(DEFAULT_MIN_TREND_SAMPLE)).toBe(false);
  });

  it("treats sampleSize=0 as missing (not low-but-present)", () => {
    expect(isLowButPresentTrendSample(0)).toBe(false);
    expect(isLowButPresentTrendSample(null)).toBe(false);
    const zero = assessTrendSpikeEvidence({
      currentValue: 90,
      baselineValue: 10,
      sampleSize: 0,
    });
    expect(zero.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(zero.researchTaskOnly).toBe(true);
    expect(zero.allowPublishTrigger).toBe(false);
  });

  it("negative baseline and non-finite current → insufficient (uncomputable lift)", () => {
    expect(
      assessTrendSpikeEvidence({
        currentValue: 40,
        baselineValue: -5,
        sampleSize: 25,
      }).code,
    ).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(
      assessTrendSpikeEvidence({
        currentValue: Number.NaN,
        baselineValue: 10,
        sampleSize: 25,
      }).liftRatio,
    ).toBeNull();
  });

  it("publish honesty: MEASURED_SPIKE never implies publish", () => {
    const measured = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: 25,
    });
    const h = evaluateTrendSpikePublishHonesty(measured);
    expect(h.allowPublishTrigger).toBe(false);
    expect(h.measuredSpikeImpliesPublish).toBe(false);
    expect(h.code).toBe(TrendSpikeDecisionCode.MEASURED_SPIKE);
    expect(h.liveTrendProviderWiring).toBe("NOT_WIRED");
    expect(h.externalEffects).toBe("NONE");
  });

  it("maps only T-X040", () => {
    expect([...TREND_SPIKE_RELATED_CASE_IDS]).toEqual(["T-X040"]);
  });
});
