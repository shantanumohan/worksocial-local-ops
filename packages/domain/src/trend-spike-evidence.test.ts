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

  it("rejects negative integer sample counts with explicit reason (M5)", () => {
    const negative = assessTrendSpikeEvidence({
      currentValue: 80,
      baselineValue: 10,
      sampleSize: -3,
    });
    expect(negative.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(negative.reason).toMatch(/negative trend sample/i);
    expect(negative.allowPublishTrigger).toBe(false);
    expect(isLowButPresentTrendSample(-3)).toBe(false);
  });

  it("rejects boxed Number sample counts as non-number (M5)", () => {
    const boxed = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: Object(15) as unknown as number,
    });
    expect(boxed.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(boxed.reason).toMatch(/non-number/i);
    expect(boxed.allowPublishTrigger).toBe(false);
  });

  it("rejects non-finite sample sizes as insufficient evidence", () => {
    for (const sampleSize of [Number.NaN, Number.POSITIVE_INFINITY]) {
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
    expect(zero.reason).toMatch(/zero trend sample|missing observations/i);
  });

  it("rejects Symbol sample counts as non-number (M6)", () => {
    const sym = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: Symbol("15") as unknown as number,
    });
    expect(sym.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(sym.reason).toMatch(/non-number/i);
    expect(sym.allowPublishTrigger).toBe(false);
  });

  it("publish honesty on insufficient forged sample never implies publish (M6)", () => {
    const insufficient = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: "15" as unknown as number,
    });
    const h = evaluateTrendSpikePublishHonesty(insufficient);
    expect(h.allowPublishTrigger).toBe(false);
    expect(h.measuredSpikeImpliesPublish).toBe(false);
    expect(h.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
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

  it("rejects BigInt forged sample counts (M4)", () => {
    const forged = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: 12n as unknown as number,
    });
    expect(forged.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(forged.reason).toMatch(/bigint/i);
    expect(forged.allowPublishTrigger).toBe(false);
  });

  it("rejects boolean forged sample counts (M3)", () => {
    const forged = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: true as unknown as number,
    });
    expect(forged.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(forged.reason).toMatch(/non-number/i);
    expect(forged.allowPublishTrigger).toBe(false);
  });

  it("rejects forged string sample counts (M2)", () => {
    const forged = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: "15" as unknown as number,
    });
    expect(forged.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(forged.researchTaskOnly).toBe(true);
    expect(forged.allowPublishTrigger).toBe(false);
    expect(forged.reason).toMatch(/non-number/i);
  });

  it("rejects adequate fractional sample counts as insufficient (M1)", () => {
    const fractional = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: 10.5,
    });
    expect(fractional.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(fractional.researchTaskOnly).toBe(true);
    expect(fractional.allowPublishTrigger).toBe(false);
    expect(fractional.reason).toMatch(/non-integer|fractional/i);
    expect(isLowButPresentTrendSample(10.5)).toBe(false);
  });

  it("rejects array and plain-object forged sample counts (M7)", () => {
    for (const sampleSize of [[15], { value: 15 }] as const) {
      const forged = assessTrendSpikeEvidence({
        currentValue: 40,
        baselineValue: 10,
        sampleSize: sampleSize as unknown as number,
      });
      expect(forged.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
      expect(forged.reason).toMatch(/non-number/i);
      expect(forged.allowPublishTrigger).toBe(false);
    }
  });

  it("classifies lift exactly at spikeRatio as MEASURED_SPIKE (M7 boundary)", () => {
    const exact = assessTrendSpikeEvidence({
      currentValue: 10 * DEFAULT_SPIKE_RATIO,
      baselineValue: 10,
      sampleSize: DEFAULT_MIN_TREND_SAMPLE,
      spikeRatio: DEFAULT_SPIKE_RATIO,
    });
    expect(exact.code).toBe(TrendSpikeDecisionCode.MEASURED_SPIKE);
    expect(exact.liftRatio).toBe(DEFAULT_SPIKE_RATIO);
    expect(exact.allowPublishTrigger).toBe(false);
  });

  it("publish honesty: NO_SPIKE never implies publish (M7)", () => {
    const flat = assessTrendSpikeEvidence({
      currentValue: 15,
      baselineValue: 10,
      sampleSize: 20,
    });
    expect(flat.code).toBe(TrendSpikeDecisionCode.NO_SPIKE);
    const h = evaluateTrendSpikePublishHonesty(flat);
    expect(h.allowPublishTrigger).toBe(false);
    expect(h.measuredSpikeImpliesPublish).toBe(false);
    expect(h.code).toBe(TrendSpikeDecisionCode.NO_SPIKE);
  });

  it("honors custom minSample above default (M8)", () => {
    const belowCustomMin = assessTrendSpikeEvidence({
      currentValue: 100,
      baselineValue: 10,
      sampleSize: 20,
      minSample: 21,
    });
    expect(belowCustomMin.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(belowCustomMin.reason).toMatch(/below minimum/i);
    expect(belowCustomMin.allowPublishTrigger).toBe(false);
    expect(isLowButPresentTrendSample(20, 21)).toBe(true);
  });

  it("honors custom spikeRatio above apparent lift (M8)", () => {
    const belowRatio = assessTrendSpikeEvidence({
      currentValue: 25,
      baselineValue: 10,
      sampleSize: 30,
      spikeRatio: 3,
    });
    expect(belowRatio.code).toBe(TrendSpikeDecisionCode.NO_SPIKE);
    expect(belowRatio.liftRatio).toBe(2.5);
    expect(belowRatio.allowPublishTrigger).toBe(false);
  });

  it("publish honesty: low-sample apparent spike never implies publish (M8)", () => {
    const low = assessTrendSpikeEvidence({
      currentValue: 80,
      baselineValue: 10,
      sampleSize: 4,
    });
    expect(low.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    const h = evaluateTrendSpikePublishHonesty(low);
    expect(h.allowPublishTrigger).toBe(false);
    expect(h.measuredSpikeImpliesPublish).toBe(false);
    expect(h.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
  });

  it("classifies lift just below default spikeRatio as NO_SPIKE (M9)", () => {
    const justBelow = assessTrendSpikeEvidence({
      currentValue: 19.9,
      baselineValue: 10,
      sampleSize: 25,
    });
    expect(justBelow.code).toBe(TrendSpikeDecisionCode.NO_SPIKE);
    expect(justBelow.liftRatio).toBeCloseTo(1.99);
    expect(justBelow.measuredSpike).toBe(false);
    expect(justBelow.allowPublishTrigger).toBe(false);
  });

  it("rejects non-finite currentValue with adequate sample (M9)", () => {
    const badCurrent = assessTrendSpikeEvidence({
      currentValue: Number.POSITIVE_INFINITY,
      baselineValue: 10,
      sampleSize: 25,
    });
    expect(badCurrent.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(badCurrent.liftRatio).toBeNull();
    expect(badCurrent.researchTaskOnly).toBe(true);
  });

  it("rejects Function forged sample counts (M9)", () => {
    const fn = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: (() => 15) as unknown as number,
    });
    expect(fn.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(fn.reason).toMatch(/non-number/i);
    expect(fn.allowPublishTrigger).toBe(false);
  });

  it("rejects non-finite baseline with adequate sample (M10)", () => {
    const badBaseline = assessTrendSpikeEvidence({
      currentValue: 50,
      baselineValue: Number.NaN,
      sampleSize: 25,
    });
    expect(badBaseline.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(badBaseline.liftRatio).toBeNull();
    expect(badBaseline.researchTaskOnly).toBe(true);
    expect(badBaseline.liveProviderSuccessClaimed).toBe(false);
  });

  it("rejects Date forged sample counts (M10)", () => {
    const dt = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: new Date() as unknown as number,
    });
    expect(dt.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(dt.reason).toMatch(/non-number/i);
    expect(dt.allowPublishTrigger).toBe(false);
  });

  it("MEASURED_SPIKE keeps researchTaskOnly false and never claims live success (M10)", () => {
    const measured = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: 25,
    });
    expect(measured.code).toBe(TrendSpikeDecisionCode.MEASURED_SPIKE);
    expect(measured.researchTaskOnly).toBe(false);
    expect(measured.measuredSpike).toBe(true);
    expect(measured.liveProviderSuccessClaimed).toBe(false);
    expect(measured.liveTrendProviderWiring).toBe("NOT_WIRED");
  });

  it("classifies lift just above default spikeRatio as MEASURED_SPIKE (M11)", () => {
    const justAbove = assessTrendSpikeEvidence({
      currentValue: 20.01,
      baselineValue: 10,
      sampleSize: 25,
    });
    expect(justAbove.code).toBe(TrendSpikeDecisionCode.MEASURED_SPIKE);
    expect(justAbove.liftRatio).toBeGreaterThan(DEFAULT_SPIKE_RATIO);
    expect(justAbove.allowPublishTrigger).toBe(false);
  });

  it("rejects RegExp forged sample counts (M11)", () => {
    const re = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: /15/ as unknown as number,
    });
    expect(re.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(re.reason).toMatch(/non-number/i);
    expect(re.allowPublishTrigger).toBe(false);
  });

  it("every decision code keeps externalEffects NONE and no publish (M11)", () => {
    const cases = [
      assessTrendSpikeEvidence({ currentValue: 80, baselineValue: 10, sampleSize: 2 }),
      assessTrendSpikeEvidence({ currentValue: 40, baselineValue: 10, sampleSize: 25 }),
      assessTrendSpikeEvidence({ currentValue: 15, baselineValue: 10, sampleSize: 25 }),
    ];
    for (const result of cases) {
      expect(result.externalEffects).toBe("NONE");
      expect(result.allowPublishTrigger).toBe(false);
      expect(result.liveTrendProviderWiring).toBe("NOT_WIRED");
      expect(evaluateTrendSpikePublishHonesty(result).measuredSpikeImpliesPublish).toBe(
        false,
      );
    }
  });

  it("rejects Map forged sample counts (M12)", () => {
    const map = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: new Map([["n", 15]]) as unknown as number,
    });
    expect(map.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(map.reason).toMatch(/non-number/i);
    expect(map.allowPublishTrigger).toBe(false);
  });

  it("rejects non-positive infinite baseline with adequate sample (M12)", () => {
    const infBaseline = assessTrendSpikeEvidence({
      currentValue: 50,
      baselineValue: Number.POSITIVE_INFINITY,
      sampleSize: 25,
    });
    expect(infBaseline.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(infBaseline.liftRatio).toBeNull();
    expect(infBaseline.researchTaskOnly).toBe(true);
  });

  it("custom minSample=1 allows single observation at spike threshold (M12)", () => {
    const tinyMin = assessTrendSpikeEvidence({
      currentValue: 20,
      baselineValue: 10,
      sampleSize: 1,
      minSample: 1,
    });
    expect(tinyMin.code).toBe(TrendSpikeDecisionCode.MEASURED_SPIKE);
    expect(tinyMin.allowPublishTrigger).toBe(false);
    expect(isLowButPresentTrendSample(1, 1)).toBe(false);
  });

  it("rejects Set forged sample counts (M13)", () => {
    const set = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: new Set([15]) as unknown as number,
    });
    expect(set.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(set.reason).toMatch(/non-number/i);
    expect(set.allowPublishTrigger).toBe(false);
  });

  it("rejects NaN currentValue with adequate sample (M13)", () => {
    const nanCurrent = assessTrendSpikeEvidence({
      currentValue: Number.NaN,
      baselineValue: 10,
      sampleSize: 25,
    });
    expect(nanCurrent.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(nanCurrent.liftRatio).toBeNull();
    expect(nanCurrent.reason).toMatch(/insufficient evidence|lift ratio/i);
  });

  it("isLowButPresentTrendSample is false for non-number and at-min boundaries (M13)", () => {
    expect(isLowButPresentTrendSample(Number.NaN)).toBe(false);
    expect(isLowButPresentTrendSample(9)).toBe(true);
    expect(isLowButPresentTrendSample(10)).toBe(false);
    expect(isLowButPresentTrendSample(10, 10)).toBe(false);
  });

  it("rejects WeakMap forged sample counts (M14)", () => {
    const weak = assessTrendSpikeEvidence({
      currentValue: 40,
      baselineValue: 10,
      sampleSize: new WeakMap() as unknown as number,
    });
    expect(weak.code).toBe(TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE);
    expect(weak.reason).toMatch(/non-number/i);
    expect(weak.allowPublishTrigger).toBe(false);
  });

  it("flat trend with zero lift still NO_SPIKE when sample adequate (M14)", () => {
    const flat = assessTrendSpikeEvidence({
      currentValue: 10,
      baselineValue: 10,
      sampleSize: 25,
    });
    expect(flat.code).toBe(TrendSpikeDecisionCode.NO_SPIKE);
    expect(flat.liftRatio).toBe(1);
    expect(flat.measuredSpike).toBe(false);
    expect(flat.researchTaskOnly).toBe(false);
    expect(flat.allowPublishTrigger).toBe(false);
  });
});
