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

  it("treats missing observation as missing not measured zero", () => {
    expect(
      classifyMetric({
        metricId: "clicks",
        value: null,
        sampleSize: 0,
        sourceStatus: "missing",
      }),
    ).toEqual({ kind: "missing", reason: "no_observation" });
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "clicks",
        value: null,
        sampleSize: 0,
        sourceStatus: "missing",
      },
    });
    expect(d.code).toBe("MISSING");
    expect(d.countsInDenominator).toBe(false);
    expect(d.allowed).toBe(true);
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

  it("treats unsupported and partial as unavailable not denominator", () => {
    expect(
      classifyMetric({
        metricId: "unsupported-metric",
        value: 1,
        sampleSize: 10,
        sourceStatus: "unsupported",
      }),
    ).toEqual({ kind: "unavailable", reason: "unsupported" });
    const unsupported = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "unsupported-metric",
        value: 1,
        sampleSize: 10,
        sourceStatus: "unsupported",
      },
    });
    expect(unsupported.code).toBe("UNAVAILABLE_UNSUPPORTED");
    expect(unsupported.countsInDenominator).toBe(false);

    expect(
      classifyMetric({
        metricId: "partial-metric",
        value: 0.4,
        sampleSize: 5,
        sourceStatus: "partial",
      }),
    ).toEqual({ kind: "unavailable", reason: "partial" });
    const partial = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "partial-metric",
        value: 0.4,
        sampleSize: 5,
        sourceStatus: "partial",
      },
    });
    expect(partial.code).toBe("UNAVAILABLE_PARTIAL");
    expect(partial.countsInDenominator).toBe(false);
  });

  it("treats insufficient sample as missing not measured zero", () => {
    expect(
      classifyMetric(
        {
          metricId: "thin-batch",
          value: 0.5,
          sampleSize: 0,
          sourceStatus: "ok",
        },
        1,
      ),
    ).toEqual({ kind: "missing", reason: "insufficient_sample" });
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "thin-batch",
        value: 0.5,
        sampleSize: 0,
        sourceStatus: "ok",
      },
    });
    expect(d.code).toBe("MISSING");
    expect(d.countsInDenominator).toBe(false);
    expect(d.allowed).toBe(true);
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

  it("treats null sampleSize on ok as non_finite missing", () => {
    expect(
      classifyMetric({
        metricId: "null-sample",
        value: 0.5,
        sampleSize: null,
        sourceStatus: "ok",
      }),
    ).toEqual({ kind: "missing", reason: "non_finite" });
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "null-sample",
        value: 0.5,
        sampleSize: null,
        sourceStatus: "ok",
      },
    });
    expect(d.code).toBe("MISSING");
    expect(d.countsInDenominator).toBe(false);
  });

  it("marks measured ok in denominator and synthetic excluded", () => {
    const measured = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "pass-rate",
        value: 0.75,
        sampleSize: 20,
        sourceStatus: "ok",
      },
    });
    expect(measured.code).toBe("MEASURED");
    expect(measured.countsInDenominator).toBe(true);
    expect(measured.allowed).toBe(true);

    const synthetic = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "fixture-rate",
        value: 1,
        sampleSize: 5,
        sourceStatus: "synthetic",
      },
    });
    expect(synthetic.code).toBe("EXCLUDED_SYNTHETIC");
    expect(synthetic.countsInDenominator).toBe(false);
    expect(synthetic.allowed).toBe(true);
  });

  it("refuses unavailable-as-zero for unsupported and partial", () => {
    for (const sourceStatus of ["unsupported", "partial"] as const) {
      const d = evaluateMetricForHonestDenominator({
        observation: {
          metricId: "pass-rate",
          value: 0,
          sampleSize: 10,
          sourceStatus,
        },
        treatUnavailableAsZero: true,
      });
      expect(d.allowed).toBe(false);
      expect(d.code).toBe("UNAVAILABLE_AS_ZERO_REFUSED");
      expect(d.countsInDenominator).toBe(false);
    }
  });

  it("summarizeHonestMetricDenominator tracks missingCount separately", () => {
    const summary = summarizeHonestMetricDenominator([
      {
        metricId: "a",
        value: 1,
        sampleSize: 50,
        sourceStatus: "ok",
      },
      {
        metricId: "b",
        value: null,
        sampleSize: 0,
        sourceStatus: "missing",
      },
      {
        metricId: "c",
        value: 0.5,
        sampleSize: 0,
        sourceStatus: "ok",
      },
    ]);
    expect(summary.measuredCount).toBe(1);
    expect(summary.missingCount).toBe(2);
    expect(summary.denominator).toBe(50);
  });

  it("honest denominator honors custom minSample threshold", () => {
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "thin-canary",
        value: 0.4,
        sampleSize: 3,
        sourceStatus: "ok",
      },
      minSample: 5,
    });
    expect(d.code).toBe("MISSING");
    expect(d.classification).toEqual({
      kind: "missing",
      reason: "insufficient_sample",
    });
    expect(d.countsInDenominator).toBe(false);

    const ok = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "thick-canary",
        value: 0.4,
        sampleSize: 5,
        sourceStatus: "ok",
      },
      minSample: 5,
    });
    expect(ok.code).toBe("MEASURED");
    expect(ok.countsInDenominator).toBe(true);
  });

  it("summarizeHonestMetricDenominator applies minSample across batches", () => {
    const summary = summarizeHonestMetricDenominator(
      [
        { metricId: "a", value: 1, sampleSize: 10, sourceStatus: "ok" },
        { metricId: "b", value: 1, sampleSize: 4, sourceStatus: "ok" },
      ],
      5,
    );
    expect(summary.measuredCount).toBe(1);
    expect(summary.missingCount).toBe(1);
    expect(summary.denominator).toBe(10);
  });

  it("rejects non-finite minSample before measured", () => {
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "x",
        value: 0.9,
        sampleSize: 10,
        sourceStatus: "ok",
      },
      minSample: Number.NaN,
    });
    expect(d.code).toBe("MISSING");
    expect(d.countsInDenominator).toBe(false);
    expect(d.classification).toEqual({
      kind: "missing",
      reason: "non_finite",
    });
  });

  it("summarizeHonestMetricDenominator tracks unavailableCount", () => {
    const summary = summarizeHonestMetricDenominator([
      { metricId: "ok", value: 1, sampleSize: 5, sourceStatus: "ok" },
      {
        metricId: "err",
        value: 0,
        sampleSize: 10,
        sourceStatus: "provider_error",
      },
      {
        metricId: "bad",
        value: 0,
        sampleSize: 1,
        sourceStatus: "unsupported",
      },
    ]);
    expect(summary.measuredCount).toBe(1);
    expect(summary.unavailableCount).toBe(2);
    expect(summary.denominator).toBe(5);
  });

  it("summarizeHonestMetricDenominator tracks excludedCount for synthetics", () => {
    const summary = summarizeHonestMetricDenominator([
      { metricId: "ok", value: 2, sampleSize: 20, sourceStatus: "ok" },
      {
        metricId: "syn-a",
        value: 1,
        sampleSize: 1,
        sourceStatus: "synthetic",
      },
      {
        metricId: "syn-b",
        value: 5,
        sampleSize: 5,
        sourceStatus: "synthetic",
      },
    ]);
    expect(summary.measuredCount).toBe(1);
    expect(summary.excludedCount).toBe(2);
    expect(summary.denominator).toBe(20);
    expect(summary.liveMetricsWiring).toBe("NOT_WIRED");
  });

  it("classifies positive and negative infinity as non_finite missing", () => {
    for (const value of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        classifyMetric({
          metricId: "inf-metric",
          value,
          sampleSize: 10,
          sourceStatus: "ok",
        }),
      ).toEqual({ kind: "missing", reason: "non_finite" });
      const d = evaluateMetricForHonestDenominator({
        observation: {
          metricId: "inf-metric",
          value,
          sampleSize: 10,
          sourceStatus: "ok",
        },
      });
      expect(d.code).toBe("MISSING");
      expect(d.countsInDenominator).toBe(false);
    }
  });

  it("T11 empty observation batch yields zero honest denominator", () => {
    const summary = summarizeHonestMetricDenominator([]);
    expect(summary.measuredCount).toBe(0);
    expect(summary.unavailableCount).toBe(0);
    expect(summary.excludedCount).toBe(0);
    expect(summary.missingCount).toBe(0);
    expect(summary.denominator).toBe(0);
    expect(summary.liveMetricsWiring).toBe("NOT_WIRED");
    expect(summary.externalEffects).toBe("NONE");
  });

  it("T15 unsupported-only batch ignores large sampleSize; denominator=0", () => {
    const summary = summarizeHonestMetricDenominator([
      {
        metricId: "unsup-a",
        value: 0.9,
        sampleSize: 10_000,
        sourceStatus: "unsupported",
      },
      {
        metricId: "unsup-b",
        value: 0.1,
        sampleSize: 50_000,
        sourceStatus: "unsupported",
      },
    ]);
    expect(summary).toEqual({
      measuredCount: 0,
      unavailableCount: 2,
      excludedCount: 0,
      missingCount: 0,
      denominator: 0,
      externalEffects: "NONE",
      liveMetricsWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      chatgptAdsAccess: "ACCESS_BLOCKED",
    });
  });

  it("T17 provider_error-only batch ignores large sampleSize; denominator=0", () => {
    const summary = summarizeHonestMetricDenominator([
      {
        metricId: "err-a",
        value: 0,
        sampleSize: 88_888,
        sourceStatus: "provider_error",
      },
      {
        metricId: "err-b",
        value: 0.9,
        sampleSize: 12_345,
        sourceStatus: "provider_error",
      },
    ]);
    expect(summary).toEqual({
      measuredCount: 0,
      unavailableCount: 2,
      excludedCount: 0,
      missingCount: 0,
      denominator: 0,
      externalEffects: "NONE",
      liveMetricsWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      chatgptAdsAccess: "ACCESS_BLOCKED",
    });
  });

  it("T16 partial-only batch ignores large sampleSize; denominator=0", () => {
    const summary = summarizeHonestMetricDenominator([
      {
        metricId: "part-a",
        value: 0.8,
        sampleSize: 25_000,
        sourceStatus: "partial",
      },
      {
        metricId: "part-b",
        value: 0.2,
        sampleSize: 9_999,
        sourceStatus: "partial",
      },
    ]);
    expect(summary).toEqual({
      measuredCount: 0,
      unavailableCount: 2,
      excludedCount: 0,
      missingCount: 0,
      denominator: 0,
      externalEffects: "NONE",
      liveMetricsWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      chatgptAdsAccess: "ACCESS_BLOCKED",
    });
  });

  it("T16 refuses treatUnavailableAsZero on partial", () => {
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "part-zero",
        value: 0.5,
        sampleSize: 12,
        sourceStatus: "partial",
      },
      treatUnavailableAsZero: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("UNAVAILABLE_AS_ZERO_REFUSED");
    expect(d.countsInDenominator).toBe(false);
  });

  it("T15 refuses treatUnavailableAsZero on provider_error", () => {
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "err-zero",
        value: 0,
        sampleSize: 20,
        sourceStatus: "provider_error",
      },
      treatUnavailableAsZero: true,
    });
    expect(d.allowed).toBe(false);
    expect(d.code).toBe("UNAVAILABLE_AS_ZERO_REFUSED");
    expect(d.countsInDenominator).toBe(false);
  });

  it("T14 summarize with zero measured observations keeps denominator=0", () => {
    const summary = summarizeHonestMetricDenominator([
      {
        metricId: "miss",
        value: null,
        sampleSize: 0,
        sourceStatus: "missing",
      },
      {
        metricId: "err",
        value: 0,
        sampleSize: 10,
        sourceStatus: "provider_error",
      },
      {
        metricId: "syn",
        value: 1,
        sampleSize: 1,
        sourceStatus: "synthetic",
      },
      {
        metricId: "part",
        value: 0.3,
        sampleSize: 4,
        sourceStatus: "partial",
      },
    ]);
    expect(summary.measuredCount).toBe(0);
    expect(summary.missingCount).toBe(1);
    expect(summary.unavailableCount).toBe(2);
    expect(summary.excludedCount).toBe(1);
    expect(summary.denominator).toBe(0);
    expect(summary.liveMetricsWiring).toBe("NOT_WIRED");
  });

  it("T13 minSample zero allows measured sampleSize=0 without inflating denominator", () => {
    const c = classifyMetric(
      {
        metricId: "zero-n",
        value: 0.5,
        sampleSize: 0,
        sourceStatus: "ok",
      },
      0,
    );
    expect(c).toEqual({ kind: "measured", value: 0.5, sampleSize: 0 });
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "zero-n",
        value: 0.5,
        sampleSize: 0,
        sourceStatus: "ok",
      },
      minSample: 0,
    });
    expect(d.code).toBe("MEASURED");
    expect(d.countsInDenominator).toBe(true);
    const summary = summarizeHonestMetricDenominator(
      [
        { metricId: "a", value: 1, sampleSize: 8, sourceStatus: "ok" },
        { metricId: "b", value: 0.5, sampleSize: 0, sourceStatus: "ok" },
      ],
      0,
    );
    expect(summary.measuredCount).toBe(2);
    expect(summary.denominator).toBe(8);
  });

  it("T12 treats NaN sampleSize as non_finite missing", () => {
    expect(
      classifyMetric({
        metricId: "nan-n",
        value: 0.7,
        sampleSize: Number.NaN,
        sourceStatus: "ok",
      }),
    ).toEqual({ kind: "missing", reason: "non_finite" });
    const summary = summarizeHonestMetricDenominator([
      { metricId: "ok", value: 1, sampleSize: 6, sourceStatus: "ok" },
      {
        metricId: "bad-n",
        value: 0.2,
        sampleSize: Number.NaN,
        sourceStatus: "ok",
      },
    ]);
    expect(summary.measuredCount).toBe(1);
    expect(summary.missingCount).toBe(1);
    expect(summary.denominator).toBe(6);
  });

  it("T11 rejects negative sampleSize as insufficient_sample missing", () => {
    const c = classifyMetric({
      metricId: "neg-n",
      value: 0.5,
      sampleSize: -3,
      sourceStatus: "ok",
    });
    expect(c).toEqual({ kind: "missing", reason: "insufficient_sample" });
    const d = evaluateMetricForHonestDenominator({
      observation: {
        metricId: "neg-n",
        value: 0.5,
        sampleSize: -3,
        sourceStatus: "ok",
      },
    });
    expect(d.code).toBe("MISSING");
    expect(d.countsInDenominator).toBe(false);
  });

  it("summarizeHonestMetricDenominator T10 all-bucket batch edge", () => {
    const summary = summarizeHonestMetricDenominator([
      { metricId: "m", value: 0.9, sampleSize: 7, sourceStatus: "ok" },
      { metricId: "p", value: 0.5, sampleSize: 4, sourceStatus: "partial" },
      { metricId: "thin", value: 0.1, sampleSize: 0, sourceStatus: "ok" },
      { metricId: "syn", value: 1, sampleSize: 1, sourceStatus: "synthetic" },
      {
        metricId: "err",
        value: 0,
        sampleSize: 12,
        sourceStatus: "provider_error",
      },
    ]);
    expect(summary).toEqual({
      measuredCount: 1,
      unavailableCount: 2,
      excludedCount: 1,
      missingCount: 1,
      denominator: 7,
      externalEffects: "NONE",
      liveMetricsWiring: "NOT_WIRED",
      liveProviderSuccessClaimed: false,
      chatgptAdsAccess: "ACCESS_BLOCKED",
    });
  });
});
