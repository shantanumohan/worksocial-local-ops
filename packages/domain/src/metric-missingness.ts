/**
 * Metric missingness — provider/test errors are not zero data by default.
 */

export type MetricObservation = {
  metricId: string;
  value: number | null;
  sampleSize: number | null;
  sourceStatus:
    | "ok"
    | "missing"
    | "provider_error"
    | "unsupported"
    | "partial"
    | "synthetic";
};

export type MetricClassification =
  | { kind: "measured"; value: number; sampleSize: number }
  | { kind: "missing"; reason: "no_observation" | "insufficient_sample" }
  | { kind: "unavailable"; reason: "provider_error" | "unsupported" | "partial" }
  | { kind: "excluded"; reason: "synthetic" };

const MIN_SAMPLE = 1;

export function classifyMetric(
  observation: MetricObservation,
  minSample: number = MIN_SAMPLE,
): MetricClassification {
  if (observation.sourceStatus === "synthetic") {
    return { kind: "excluded", reason: "synthetic" };
  }
  if (observation.sourceStatus === "provider_error") {
    return { kind: "unavailable", reason: "provider_error" };
  }
  if (observation.sourceStatus === "unsupported") {
    return { kind: "unavailable", reason: "unsupported" };
  }
  if (observation.sourceStatus === "partial") {
    return { kind: "unavailable", reason: "partial" };
  }
  if (observation.sourceStatus === "missing" || observation.value === null) {
    return { kind: "missing", reason: "no_observation" };
  }
  if (observation.sampleSize === null || observation.sampleSize < minSample) {
    return { kind: "missing", reason: "insufficient_sample" };
  }
  return {
    kind: "measured",
    value: observation.value,
    sampleSize: observation.sampleSize,
  };
}
