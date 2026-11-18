import { describe, expect, it } from "vitest";
import { classifyMetric } from "./metric-missingness.js";

describe("metric missingness", () => {
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
});
