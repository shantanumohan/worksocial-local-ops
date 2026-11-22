/**
 * Fixture proof for T-X040 — low-sample trend spike → insufficient evidence.
 * Domain gate only: apparent spike with tiny/missing sample stays research-only
 * (not a publish trigger). External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  TrendSpikeDecisionCode,
  assessTrendSpikeEvidence,
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
    lowSample.liftRatio === 9
  ) {
    details.push(
      "Apparent 9× spike with sampleSize=2 → INSUFFICIENT_EVIDENCE; researchTaskOnly; allowPublishTrigger=false",
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

  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

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
