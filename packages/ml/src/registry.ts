/**
 * Pinned open-source model registry for local multi-model learning.
 * Algorithms are sklearn-compatible (BSD-3-Clause reference); weights train
 * locally from verified outcomes or load fixture baselines when offline.
 */

export const ModelFamily = {
  CLASSIFIER: "classifier",
  RANKER: "ranker",
  RISK: "risk",
} as const;

export type ModelFamilyValue = (typeof ModelFamily)[keyof typeof ModelFamily];

export const ModelRuntimeMode = {
  /** Trains/predicts from in-memory or fixture baseline weights — no network. */
  OFFLINE_FIXTURE: "offline_fixture",
  /** Trains from durable outcome ledgers on the owner host. */
  LOCAL_TRAINED: "local_trained",
} as const;

export type ModelRuntimeModeValue =
  (typeof ModelRuntimeMode)[keyof typeof ModelRuntimeMode];

export type PinnedOpenSourceModel = {
  modelId: string;
  displayName: string;
  family: ModelFamilyValue;
  /** Algorithm pin — not a proprietary cloud learner. */
  algorithm: string;
  /** Semver pin for feature schema + hyper-parameters. */
  version: string;
  /** SPDX license of the algorithm reference implementation. */
  license: "BSD-3-Clause";
  /** Upstream OSS reference (sklearn docs / paper). */
  sourceUrl: string;
  /** Whether external weight files are required. Always false in this slice. */
  requiresDownloadedWeights: false;
  defaultRuntimeMode: ModelRuntimeModeValue;
  notes: string;
};

/**
 * Registry of ≥2 pinned local-friendly OSS models.
 * Pins are algorithm+version+license; CI uses offline fixture weights.
 */
export const PINNED_OPEN_SOURCE_MODELS: readonly PinnedOpenSourceModel[] = [
  {
    modelId: "outcome-nb-bernoulli@1.0.0",
    displayName: "Outcome Bernoulli Naive Bayes",
    family: ModelFamily.CLASSIFIER,
    algorithm: "BernoulliNB",
    version: "1.0.0",
    license: "BSD-3-Clause",
    sourceUrl:
      "https://scikit-learn.org/stable/modules/naive_bayes.html#bernoulli-naive-bayes",
    requiresDownloadedWeights: false,
    defaultRuntimeMode: ModelRuntimeMode.OFFLINE_FIXTURE,
    notes:
      "Hashed categorical features → SUCCESS/FAILURE classifier. Pure-TS sklearn-compatible BernoulliNB; no HF/ONNX download.",
  },
  {
    modelId: "outcome-logreg-l2@1.0.0",
    displayName: "Outcome L2 Logistic Risk/Ranker",
    family: ModelFamily.RISK,
    algorithm: "LogisticRegression-L2",
    version: "1.0.0",
    license: "BSD-3-Clause",
    sourceUrl:
      "https://scikit-learn.org/stable/modules/linear_model.html#logistic-regression",
    requiresDownloadedWeights: false,
    defaultRuntimeMode: ModelRuntimeMode.OFFLINE_FIXTURE,
    notes:
      "L2-regularized logistic regression for failure risk / ranking scores. Pure-TS; fixture baseline weights for CI.",
  },
] as const;

export function listPinnedModels(): readonly PinnedOpenSourceModel[] {
  return PINNED_OPEN_SOURCE_MODELS;
}

export function getPinnedModel(modelId: string): PinnedOpenSourceModel | undefined {
  return PINNED_OPEN_SOURCE_MODELS.find((m) => m.modelId === modelId);
}

export function assertMultiModelRegistry(): void {
  if (PINNED_OPEN_SOURCE_MODELS.length < 2) {
    throw new Error("Model registry must pin at least two open-source models");
  }
  const ids = new Set(PINNED_OPEN_SOURCE_MODELS.map((m) => m.modelId));
  if (ids.size !== PINNED_OPEN_SOURCE_MODELS.length) {
    throw new Error("Model registry modelIds must be unique");
  }
  for (const model of PINNED_OPEN_SOURCE_MODELS) {
    if (model.license !== "BSD-3-Clause") {
      throw new Error(`Model ${model.modelId} must declare an OSS license pin`);
    }
    if (model.requiresDownloadedWeights !== false) {
      throw new Error(
        `Model ${model.modelId} must support offline/fixture mode without downloaded weights`,
      );
    }
  }
}
