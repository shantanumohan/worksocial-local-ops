import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIN_TREND_SAMPLE,
  TrendSpikeDecisionCode,
  assessTrendSpikeEvidence,
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
});
