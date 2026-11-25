import { describe, expect, it } from "vitest";
import {
  METRIC_LIVE_WIRING,
  classifyMetric,
  evaluateMetricForHonestDenominator,
  summarizeHonestMetricDenominator,
} from "./metric-missingness.js";

describe("metric missingness (T-X039 / T-US-058)", () => {
  it("does not treat provider errors as zero", () => {
    expect(
      classifyMetric({
        metricId: "leads",
        value: 0,
        sampleSize: 10,
        sourceStatus: "provider_error",
      }),
    ).toEqual({ kind: "unavailable", reason: "provider_error" });
  });

  it("excludes synthetic observations from commercial totals", () => {
    expect(
      classifyMetric({
        metricId: "bookings",
        value: 3,
        sampleSize: 3,
        sourceStatus: "synthetic",
      }),
    ).toEqual({ kind: "excluded", reason: "synthetic" });
  });

  it("classifies measured values when sample is sufficient", () => {
    expect(
      classifyMetric({
        metricId: "visits",
        value: 42,
        sampleSize: 42,
        sourceStatus: "ok",
      }),
    ).toEqual({ kind: "measured", value: 42, sampleSize: 42 });
  });

  it("honest denominator marks provider_error unavailable and out of denom", () => {
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "pass-rate",
        value: 0,
        sampleSize: 10,
        sourceStatus: "provider_error",
      },
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("UNAVAILABLE_PROVIDER_ERROR");
    expect(d.countsInDenominator).toBe(false);
    expect(d.liveMetricsWiring).toBe(METRIC_LIVE_WIRING);
    expect(d.externalEffects).toBe("NONE");
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("refuses treating unavailable as measured zero", () => {
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "pass-rate",
        value: 0,
        sampleSize: 10,
        sourceStatus: "provider_error",
      },
      treatUnavailableAsZero: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("UNAVAILABLE_AS_ZERO_REFUSED");
    expect(d.countsInDenominator).toBe(false);
  });

  it("refuses claimLiveVerified and requestLiveMetricsWire", () => {
    const verified = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "pass-rate",
        value: 0.9,
        sampleSize: 10,
        sourceStatus: "ok",
      },
      claimLiveVerified: true,
    });
    expect(verified.allowed).toBe(false);
    expect(verified.code).toBe("LIVE_METRICS_CLAIM_REFUSED");
    expect(verified.liveMetricsWiring).toBe("NOT_WIRED");

    const wire = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "pass-rate",
        value: 0.9,
        sampleSize: 10,
        sourceStatus: "ok",
      },
      requestLiveMetricsWire: true,
    });
    expect(wire.allowed).toBe(false);
    expect(wire.code).toBe("LIVE_METRICS_CLAIM_REFUSED");
    expect(wire.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
  });

  it("summarizes honest pass-rate denominator as measured sampleSize sum", () => {
    const summary = summarizeHonestMetricDenominator([
      {
        metricId: "a",
        value: 1,
        sampleSize: 100,
        sourceStatus: "ok",
      },
      {
        metricId: "b",
        value: 0,
        sampleSize: 1,
        sourceStatus: "ok",
      },
      {
        metricId: "c",
        value: 0,
        sampleSize: 10,
        sourceStatus: "provider_error",
      },
      {
        metricId: "d",
        value: 1,
        sampleSize: 1,
        sourceStatus: "synthetic",
      },
    ]);
    expect(summary.measuredCount).toBe(2);
    expect(summary.unavailableCount).toBe(1);
    expect(summary.excludedCount).toBe(1);
    expect(summary.denominator).toBe(101);
    expect(summary.liveMetricsWiring).toBe("NOT_WIRED");
    expect(summary.externalEffects).toBe("NONE");
  });

  it("rejects non-finite value or sampleSize before measured", () => {
    expect(
      classifyMetric({
        metricId: "nan",
        value: Number.NaN,
        sampleSize: 10,
        sourceStatus: "ok",
      }),
    ).toEqual({ kind: "missing", reason: "non_finite" });
    expect(
      classifyMetric({
        metricId: "inf",
        value: 1,
        sampleSize: Number.POSITIVE_INFINITY,
        sourceStatus: "ok",
      }),
    ).toEqual({ kind: "missing", reason: "non_finite" });

    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "nan",
        value: Number.NaN,
        sampleSize: 10,
        sourceStatus: "ok",
      },
    });
    expect(d.code).toBe("MISSING");
    expect(d.countsInDenominator).toBe(false);
  });
});
