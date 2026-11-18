import { describe, expect, it } from "vitest";
import {
  assertMultiModelRegistry,
  listPinnedModels,
  PINNED_OPEN_SOURCE_MODELS,
} from "./registry.js";

describe("multi-model registry", () => {
  it("pins at least two distinct open-source models with licenses", () => {
    expect(PINNED_OPEN_SOURCE_MODELS.length).toBeGreaterThanOrEqual(2);
    assertMultiModelRegistry();
    const models = listPinnedModels();
    expect(new Set(models.map((m) => m.modelId)).size).toBe(models.length);
    expect(models.every((m) => m.license === "BSD-3-Clause")).toBe(true);
    expect(models.every((m) => m.requiresDownloadedWeights === false)).toBe(true);
    expect(models.some((m) => m.algorithm === "BernoulliNB")).toBe(true);
    expect(models.some((m) => m.algorithm === "LogisticRegression-L2")).toBe(true);
  });
});
