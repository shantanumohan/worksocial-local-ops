/**
 * Fixture proof for T-X040 — low-sample trend spike → insufficient evidence.
 * Domain gate only: apparent spike with tiny/missing sample stays research-only
 * (not a publish trigger). External effects: NONE. Live trend provider NOT_WIRED.
 * Never invents live VERIFIED.
 *
 * Hillclimb: honesty fields, publish-gate wrapper, boundary sample edges.
 */

import { randomUUID } from "node:crypto";
import {
  DEFAULT_MIN_TREND_SAMPLE,
  DEFAULT_SPIKE_RATIO,
  SoakProofKind,
  TrendSpikeDecisionCode,
  assessTrendSpikeEvidence,
  evaluateTrendSpikePublishHonesty,
  isLowButPresentTrendSample,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-X040 fixture ACCEPTED.
 */
export function proofLowSampleTrendSpikeInsufficientEvidence(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const lowSample = assessTrendSpikeEvidence({
    currentValue: 90,
    baselineValue: 10,
    sampleSize: 2,
  });
  if (
    lowSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    lowSample.allowPublishTrigger === false &&
    lowSample.researchTaskOnly === true &&
    lowSample.measuredSpike === false &&
    lowSample.liftRatio === 9 &&
    lowSample.liveTrendProviderWiring === "NOT_WIRED" &&
    lowSample.externalEffects === "NONE" &&
    lowSample.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "Apparent 9× spike with sampleSize=2 → INSUFFICIENT_EVIDENCE; researchTaskOnly; allowPublishTrigger=false; NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(`Low-sample unexpectedly ${JSON.stringify(lowSample)}`);
  }

  const missingSample = assessTrendSpikeEvidence({
    currentValue: 50,
    baselineValue: 5,
    sampleSize: null,
  });
  if (
    missingSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    missingSample.allowPublishTrigger === false
  ) {
    details.push("Null sampleSize → INSUFFICIENT_EVIDENCE (not invent measured)");
  } else {
    passed = false;
    details.push(`Missing sample unexpectedly ${JSON.stringify(missingSample)}`);
  }

  const measured = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: 25,
  });
  if (
    measured.code === TrendSpikeDecisionCode.MEASURED_SPIKE &&
    measured.measuredSpike === true &&
    measured.allowPublishTrigger === false
  ) {
    details.push(
      "Adequate sample + 4× lift → MEASURED_SPIKE; still allowPublishTrigger=false",
    );
  } else {
    passed = false;
    details.push(`Measured spike unexpectedly ${JSON.stringify(measured)}`);
  }

  const publishHonesty = evaluateTrendSpikePublishHonesty(measured);
  if (
    publishHonesty.allowPublishTrigger === false &&
    publishHonesty.measuredSpikeImpliesPublish === false &&
    publishHonesty.code === TrendSpikeDecisionCode.MEASURED_SPIKE &&
    publishHonesty.liveTrendProviderWiring === "NOT_WIRED" &&
    publishHonesty.externalEffects === "NONE"
  ) {
    details.push(
      "evaluateTrendSpikePublishHonesty(MEASURED_SPIKE) → never publish; NOT_WIRED/NONE",
    );
  } else {
    passed = false;
    details.push(
      `Publish honesty unexpectedly ${JSON.stringify(publishHonesty)}`,
    );
  }

  const flat = assessTrendSpikeEvidence({
    currentValue: 11,
    baselineValue: 10,
    sampleSize: 30,
  });
  if (
    flat.code === TrendSpikeDecisionCode.NO_SPIKE &&
    flat.allowPublishTrigger === false
  ) {
    details.push("Adequate sample + flat lift → NO_SPIKE");
  } else {
    passed = false;
    details.push(`No-spike unexpectedly ${JSON.stringify(flat)}`);
  }

  const nonFiniteSample = assessTrendSpikeEvidence({
    currentValue: 80,
    baselineValue: 10,
    sampleSize: Number.NaN,
  });
  if (
    nonFiniteSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    nonFiniteSample.allowPublishTrigger === false
  ) {
    details.push("Non-finite sampleSize → INSUFFICIENT_EVIDENCE");
  } else {
    passed = false;
    details.push(
      `Non-finite sample unexpectedly ${JSON.stringify(nonFiniteSample)}`,
    );
  }

  const zeroBaseline = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 0,
    sampleSize: 25,
  });
  if (
    zeroBaseline.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    zeroBaseline.liftRatio === null &&
    zeroBaseline.researchTaskOnly === true
  ) {
    details.push(
      "Zero baseline (uncomputable lift) → INSUFFICIENT_EVIDENCE; researchTaskOnly",
    );
  } else {
    passed = false;
    details.push(
      `Zero baseline unexpectedly ${JSON.stringify(zeroBaseline)}`,
    );
  }

  // Boundary: minSample-1 vs exact minSample
  const justBelow = assessTrendSpikeEvidence({
    currentValue: 100,
    baselineValue: 10,
    sampleSize: DEFAULT_MIN_TREND_SAMPLE - 1,
  });
  const atMin = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: DEFAULT_MIN_TREND_SAMPLE,
  });
  if (
    justBelow.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    isLowButPresentTrendSample(DEFAULT_MIN_TREND_SAMPLE - 1) &&
    atMin.code === TrendSpikeDecisionCode.MEASURED_SPIKE &&
    atMin.allowPublishTrigger === false &&
    !isLowButPresentTrendSample(DEFAULT_MIN_TREND_SAMPLE)
  ) {
    details.push(
      `Boundary sampleSize=${DEFAULT_MIN_TREND_SAMPLE - 1} insufficient; sampleSize=${DEFAULT_MIN_TREND_SAMPLE} measured (still no publish)`,
    );
  } else {
    passed = false;
    details.push(
      `Boundary unexpectedly below=${JSON.stringify(justBelow)} atMin=${JSON.stringify(atMin)}`,
    );
  }

  const forgedBigIntSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: 20n as unknown as number,
  });
  if (
    forgedBigIntSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    forgedBigIntSample.allowPublishTrigger === false &&
    /bigint/i.test(forgedBigIntSample.reason)
  ) {
    details.push(
      "Forged BigInt sampleSize=20n → INSUFFICIENT_EVIDENCE; plain integer counts only",
    );
  } else {
    passed = false;
    details.push(
      `Forged BigInt sample unexpectedly ${JSON.stringify(forgedBigIntSample)}`,
    );
  }

  const forgedBooleanSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: true as unknown as number,
  });
  if (
    forgedBooleanSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    forgedBooleanSample.allowPublishTrigger === false &&
    /non-number/i.test(forgedBooleanSample.reason)
  ) {
    details.push(
      "Forged boolean sampleSize=true → INSUFFICIENT_EVIDENCE; non-number type refused",
    );
  } else {
    passed = false;
    details.push(
      `Forged boolean sample unexpectedly ${JSON.stringify(forgedBooleanSample)}`,
    );
  }

  const forgedStringSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: "25" as unknown as number,
  });
  if (
    forgedStringSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    forgedStringSample.allowPublishTrigger === false &&
    /non-number/i.test(forgedStringSample.reason)
  ) {
    details.push(
      'Forged string sampleSize="25" → INSUFFICIENT_EVIDENCE; non-number type refused',
    );
  } else {
    passed = false;
    details.push(
      `Forged string sample unexpectedly ${JSON.stringify(forgedStringSample)}`,
    );
  }

  const negativeIntegerSample = assessTrendSpikeEvidence({
    currentValue: 80,
    baselineValue: 10,
    sampleSize: -4,
  });
  if (
    negativeIntegerSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    negativeIntegerSample.allowPublishTrigger === false &&
    negativeIntegerSample.researchTaskOnly === true &&
    /negative trend sample/i.test(negativeIntegerSample.reason) &&
    isLowButPresentTrendSample(-4) === false
  ) {
    details.push(
      "Negative integer sampleSize=-4 → INSUFFICIENT_EVIDENCE; not low-but-present",
    );
  } else {
    passed = false;
    details.push(
      `Negative sample unexpectedly ${JSON.stringify(negativeIntegerSample)}`,
    );
  }

  const boxedNumberSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: Object(20) as unknown as number,
  });
  if (
    boxedNumberSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    boxedNumberSample.allowPublishTrigger === false &&
    /non-number/i.test(boxedNumberSample.reason)
  ) {
    details.push(
      "Boxed Number sampleSize=Object(20) → INSUFFICIENT_EVIDENCE; primitive integer only",
    );
  } else {
    passed = false;
    details.push(
      `Boxed Number sample unexpectedly ${JSON.stringify(boxedNumberSample)}`,
    );
  }

  const fractionalSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: 10.5,
  });
  if (
    fractionalSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    fractionalSample.allowPublishTrigger === false &&
    fractionalSample.researchTaskOnly === true &&
    /fractional|non-integer/i.test(fractionalSample.reason)
  ) {
    details.push(
      "Fractional sampleSize=10.5 (otherwise ≥min) → INSUFFICIENT_EVIDENCE; integer counts only",
    );
  } else {
    passed = false;
    details.push(
      `Fractional sample unexpectedly ${JSON.stringify(fractionalSample)}`,
    );
  }

  // Zero observations are missing, not low-but-present.
  const zeroSample = assessTrendSpikeEvidence({
    currentValue: 90,
    baselineValue: 10,
    sampleSize: 0,
  });
  if (
    isLowButPresentTrendSample(0) === false &&
    zeroSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    zeroSample.researchTaskOnly === true &&
    /zero trend sample|missing observations/i.test(zeroSample.reason)
  ) {
    details.push(
      "sampleSize=0 → explicit missing observations; not low-but-present",
    );
  } else {
    passed = false;
    details.push(
      `Expected sampleSize=0 missing observations; got ${JSON.stringify(zeroSample)}`,
    );
  }

  const symbolSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: Symbol("n") as unknown as number,
  });
  if (
    symbolSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    symbolSample.allowPublishTrigger === false &&
    /non-number/i.test(symbolSample.reason)
  ) {
    details.push("Symbol sampleSize → INSUFFICIENT_EVIDENCE; non-number refused");
  } else {
    passed = false;
    details.push(`Symbol sample unexpectedly ${JSON.stringify(symbolSample)}`);
  }

  const arraySample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: [20] as unknown as number,
  });
  if (
    arraySample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    arraySample.allowPublishTrigger === false &&
    /non-number/i.test(arraySample.reason)
  ) {
    details.push("Array sampleSize [20] → INSUFFICIENT_EVIDENCE; non-number refused");
  } else {
    passed = false;
    details.push(`Array sample unexpectedly ${JSON.stringify(arraySample)}`);
  }

  const exactSpike = assessTrendSpikeEvidence({
    currentValue: 10 * DEFAULT_SPIKE_RATIO,
    baselineValue: 10,
    sampleSize: DEFAULT_MIN_TREND_SAMPLE,
    spikeRatio: DEFAULT_SPIKE_RATIO,
  });
  if (
    exactSpike.code === TrendSpikeDecisionCode.MEASURED_SPIKE &&
    exactSpike.liftRatio === DEFAULT_SPIKE_RATIO &&
    exactSpike.allowPublishTrigger === false
  ) {
    details.push(
      `Lift exactly ${DEFAULT_SPIKE_RATIO}× at min sample → MEASURED_SPIKE; still no publish`,
    );
  } else {
    passed = false;
    details.push(`Exact spike boundary unexpectedly ${JSON.stringify(exactSpike)}`);
  }

  const noSpikeHonesty = evaluateTrendSpikePublishHonesty(
    assessTrendSpikeEvidence({
      currentValue: 15,
      baselineValue: 10,
      sampleSize: 30,
    }),
  );
  if (
    noSpikeHonesty.code === TrendSpikeDecisionCode.NO_SPIKE &&
    noSpikeHonesty.allowPublishTrigger === false &&
    noSpikeHonesty.measuredSpikeImpliesPublish === false
  ) {
    details.push("evaluateTrendSpikePublishHonesty(NO_SPIKE) → never publish");
  } else {
    passed = false;
    details.push(`NO_SPIKE honesty unexpectedly ${JSON.stringify(noSpikeHonesty)}`);
  }

  const customMin = assessTrendSpikeEvidence({
    currentValue: 90,
    baselineValue: 10,
    sampleSize: 20,
    minSample: 21,
  });
  if (
    customMin.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    customMin.allowPublishTrigger === false &&
    isLowButPresentTrendSample(20, 21)
  ) {
    details.push("Custom minSample=21 with sampleSize=20 → insufficient (low-but-present)");
  } else {
    passed = false;
    details.push(`Custom minSample unexpectedly ${JSON.stringify(customMin)}`);
  }

  const customSpikeRatio = assessTrendSpikeEvidence({
    currentValue: 25,
    baselineValue: 10,
    sampleSize: 30,
    spikeRatio: 3,
  });
  if (
    customSpikeRatio.code === TrendSpikeDecisionCode.NO_SPIKE &&
    customSpikeRatio.liftRatio === 2.5 &&
    customSpikeRatio.allowPublishTrigger === false
  ) {
    details.push("Custom spikeRatio=3 with 2.5× lift → NO_SPIKE");
  } else {
    passed = false;
    details.push(
      `Custom spikeRatio unexpectedly ${JSON.stringify(customSpikeRatio)}`,
    );
  }

  const lowSampleHonesty = evaluateTrendSpikePublishHonesty(
    assessTrendSpikeEvidence({
      currentValue: 80,
      baselineValue: 10,
      sampleSize: 3,
    }),
  );
  if (
    lowSampleHonesty.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    lowSampleHonesty.allowPublishTrigger === false &&
    lowSampleHonesty.measuredSpikeImpliesPublish === false
  ) {
    details.push(
      "evaluateTrendSpikePublishHonesty(INSUFFICIENT low-sample) → never publish",
    );
  } else {
    passed = false;
    details.push(
      `Low-sample honesty unexpectedly ${JSON.stringify(lowSampleHonesty)}`,
    );
  }

  const justBelowSpike = assessTrendSpikeEvidence({
    currentValue: 19.9,
    baselineValue: 10,
    sampleSize: 25,
  });
  if (
    justBelowSpike.code === TrendSpikeDecisionCode.NO_SPIKE &&
    justBelowSpike.allowPublishTrigger === false &&
    justBelowSpike.liftRatio !== null &&
    justBelowSpike.liftRatio < DEFAULT_SPIKE_RATIO
  ) {
    details.push("Lift 1.99× at adequate sample → NO_SPIKE (below default 2×)");
  } else {
    passed = false;
    details.push(
      `Just-below spike unexpectedly ${JSON.stringify(justBelowSpike)}`,
    );
  }

  const infiniteCurrent = assessTrendSpikeEvidence({
    currentValue: Number.POSITIVE_INFINITY,
    baselineValue: 10,
    sampleSize: 25,
  });
  if (
    infiniteCurrent.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    infiniteCurrent.liftRatio === null &&
    infiniteCurrent.researchTaskOnly === true
  ) {
    details.push("Non-finite currentValue + adequate sample → uncomputable lift");
  } else {
    passed = false;
    details.push(
      `Infinite current unexpectedly ${JSON.stringify(infiniteCurrent)}`,
    );
  }

  const nanBaseline = assessTrendSpikeEvidence({
    currentValue: 50,
    baselineValue: Number.NaN,
    sampleSize: 25,
  });
  if (
    nanBaseline.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    nanBaseline.liftRatio === null &&
    nanBaseline.liveProviderSuccessClaimed === false
  ) {
    details.push("NaN baseline + adequate sample → insufficient; no live success claim");
  } else {
    passed = false;
    details.push(`NaN baseline unexpectedly ${JSON.stringify(nanBaseline)}`);
  }

  const dateSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: new Date() as unknown as number,
  });
  if (
    dateSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    dateSample.allowPublishTrigger === false &&
    /non-number/i.test(dateSample.reason)
  ) {
    details.push("Date sampleSize → INSUFFICIENT_EVIDENCE; non-number refused");
  } else {
    passed = false;
    details.push(`Date sample unexpectedly ${JSON.stringify(dateSample)}`);
  }

  const justAboveSpike = assessTrendSpikeEvidence({
    currentValue: 20.01,
    baselineValue: 10,
    sampleSize: 25,
  });
  if (
    justAboveSpike.code === TrendSpikeDecisionCode.MEASURED_SPIKE &&
    justAboveSpike.liftRatio !== null &&
    justAboveSpike.liftRatio > DEFAULT_SPIKE_RATIO &&
    justAboveSpike.allowPublishTrigger === false
  ) {
    details.push("Lift 2.001× → MEASURED_SPIKE; still no publish trigger");
  } else {
    passed = false;
    details.push(
      `Just-above spike unexpectedly ${JSON.stringify(justAboveSpike)}`,
    );
  }

  const regexpSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: /n/ as unknown as number,
  });
  if (
    regexpSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    regexpSample.allowPublishTrigger === false &&
    /non-number/i.test(regexpSample.reason)
  ) {
    details.push("RegExp sampleSize → INSUFFICIENT_EVIDENCE; non-number refused");
  } else {
    passed = false;
    details.push(`RegExp sample unexpectedly ${JSON.stringify(regexpSample)}`);
  }

  const mapSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: new Map() as unknown as number,
  });
  if (
    mapSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    mapSample.allowPublishTrigger === false &&
    /non-number/i.test(mapSample.reason)
  ) {
    details.push("Map sampleSize → INSUFFICIENT_EVIDENCE; non-number refused");
  } else {
    passed = false;
    details.push(`Map sample unexpectedly ${JSON.stringify(mapSample)}`);
  }

  const infiniteBaseline = assessTrendSpikeEvidence({
    currentValue: 50,
    baselineValue: Number.POSITIVE_INFINITY,
    sampleSize: 25,
  });
  if (
    infiniteBaseline.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    infiniteBaseline.liftRatio === null &&
    infiniteBaseline.allowPublishTrigger === false
  ) {
    details.push("+Infinity baseline → insufficient; uncomputable lift");
  } else {
    passed = false;
    details.push(
      `Infinite baseline unexpectedly ${JSON.stringify(infiniteBaseline)}`,
    );
  }

  const setSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: new Set([20]) as unknown as number,
  });
  if (
    setSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    setSample.allowPublishTrigger === false &&
    /non-number/i.test(setSample.reason)
  ) {
    details.push("Set sampleSize → INSUFFICIENT_EVIDENCE; non-number refused");
  } else {
    passed = false;
    details.push(`Set sample unexpectedly ${JSON.stringify(setSample)}`);
  }

  const nanCurrentSample = assessTrendSpikeEvidence({
    currentValue: Number.NaN,
    baselineValue: 10,
    sampleSize: 25,
  });
  if (
    nanCurrentSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    nanCurrentSample.liftRatio === null &&
    nanCurrentSample.researchTaskOnly === true
  ) {
    details.push("NaN currentValue + adequate sample → insufficient");
  } else {
    passed = false;
    details.push(
      `NaN current unexpectedly ${JSON.stringify(nanCurrentSample)}`,
    );
  }

  if (
    isLowButPresentTrendSample(9) === true &&
    isLowButPresentTrendSample(10) === false &&
    isLowButPresentTrendSample(Number.NaN) === false
  ) {
    details.push(
      "isLowButPresentTrendSample: 9 low-but-present; 10 at min not; NaN false",
    );
  } else {
    passed = false;
    details.push("isLowButPresentTrendSample boundary check failed");
  }

  const weakMapSample = assessTrendSpikeEvidence({
    currentValue: 40,
    baselineValue: 10,
    sampleSize: new WeakMap() as unknown as number,
  });
  if (
    weakMapSample.code === TrendSpikeDecisionCode.INSUFFICIENT_EVIDENCE &&
    weakMapSample.allowPublishTrigger === false &&
    /non-number/i.test(weakMapSample.reason)
  ) {
    details.push("WeakMap sampleSize → INSUFFICIENT_EVIDENCE; non-number refused");
  } else {
    passed = false;
    details.push(`WeakMap sample unexpectedly ${JSON.stringify(weakMapSample)}`);
  }

  const flatLift = assessTrendSpikeEvidence({
    currentValue: 10,
    baselineValue: 10,
    sampleSize: 25,
  });
  if (
    flatLift.code === TrendSpikeDecisionCode.NO_SPIKE &&
    flatLift.liftRatio === 1 &&
    flatLift.allowPublishTrigger === false &&
    flatLift.researchTaskOnly === false
  ) {
    details.push("1× lift at adequate sample → NO_SPIKE; not research-only");
  } else {
    passed = false;
    details.push(`Flat lift unexpectedly ${JSON.stringify(flatLift)}`);
  }

  details.push(
    "liveTrendProviderWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
  );

  return {
    proofId: `proof-low-sample-trend-${randomUUID()}`,
    kind: SoakProofKind.LOW_SAMPLE_TREND_SPIKE_INSUFFICIENT_EVIDENCE,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-low-sample-trend-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
