/**
 * Offline-capable pure-TS implementations of pinned OSS algorithms.
 * Fixture baseline weights ship in-repo so CI never needs network downloads.
 */

import {
  hashToken,
  vectorizeExample,
  type LearningExample,
} from "./features.js";
import { getPinnedModel } from "./registry.js";

export const FEATURE_DIM = 64;

export type TrainedModelWeights = {
  modelId: string;
  algorithm: string;
  version: string;
  dim: number;
  /** Class priors / intercept etc. encoded per algorithm. */
  params: Record<string, number | number[]>;
  trainedAtIso: string;
  sampleCount: number;
  runtimeMode: "offline_fixture" | "local_trained";
};

export type PredictResult = {
  modelId: string;
  score: number;
  predictedLabel: "SUCCESS" | "FAILURE";
  runtimeMode: "offline_fixture" | "local_trained";
};

/** Deterministic fixture baseline for CI when no local training corpus exists. */
export function fixtureBaselineWeights(modelId: string, nowIso: string): TrainedModelWeights {
  const pinned = getPinnedModel(modelId);
  if (!pinned) {
    throw new Error(`Unknown modelId: ${modelId}`);
  }
  const weights = new Array<number>(FEATURE_DIM).fill(0);
  // Pre-action priors only (F08) — never label=/status=/releaseDecision=/code=.
  weights[hashToken("source=stop_switch", FEATURE_DIM)] = 0.8;
  weights[hashToken("writePathId=wp-a", FEATURE_DIM)] = 0.3;
  weights[hashToken("kind=write_path", FEATURE_DIM)] = 0.1;
  weights[hashToken("hint.channelId=owned-site", FEATURE_DIM)] = 0.2;

  if (pinned.algorithm === "BernoulliNB") {
    return {
      modelId,
      algorithm: pinned.algorithm,
      version: pinned.version,
      dim: FEATURE_DIM,
      params: {
        logPriorSuccess: Math.log(0.55),
        logPriorFailure: Math.log(0.45),
        logLikSuccess: weights.map((w) => -Math.log(1 + Math.exp(-w))),
        logLikFailure: weights.map((w) => -Math.log(1 + Math.exp(w))),
      },
      trainedAtIso: nowIso,
      sampleCount: 0,
      runtimeMode: "offline_fixture",
    };
  }

  return {
    modelId,
    algorithm: pinned.algorithm,
    version: pinned.version,
    dim: FEATURE_DIM,
    params: {
      intercept: -0.1,
      coefficients: weights,
      l2: 1.0,
    },
    trainedAtIso: nowIso,
    sampleCount: 0,
    runtimeMode: "offline_fixture",
  };
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const z = Math.exp(-x);
    return 1 / (1 + z);
  }
  const z = Math.exp(x);
  return z / (1 + z);
}

export function trainBernoulliNb(
  modelId: string,
  examples: readonly LearningExample[],
  nowIso: string,
): TrainedModelWeights {
  const pinned = getPinnedModel(modelId);
  if (!pinned || pinned.algorithm !== "BernoulliNB") {
    throw new Error(`Model ${modelId} is not BernoulliNB`);
  }
  if (examples.length === 0) {
    return fixtureBaselineWeights(modelId, nowIso);
  }

  const dim = FEATURE_DIM;
  const successCounts = new Float64Array(dim);
  const failureCounts = new Float64Array(dim);
  let successN = 0;
  let failureN = 0;
  const alpha = 1.0;

  for (const example of examples) {
    const { binary, label } = vectorizeExample(example, dim);
    if (label === 1) {
      successN += 1;
      for (let i = 0; i < dim; i += 1) {
        successCounts[i] += binary[i]!;
      }
    } else {
      failureN += 1;
      for (let i = 0; i < dim; i += 1) {
        failureCounts[i] += binary[i]!;
      }
    }
  }

  const logLikSuccess = Array.from(successCounts, (c) =>
    Math.log((c + alpha) / (successN + 2 * alpha)),
  );
  const logLikFailure = Array.from(failureCounts, (c) =>
    Math.log((c + alpha) / (failureN + 2 * alpha)),
  );
  const total = successN + failureN;

  return {
    modelId,
    algorithm: pinned.algorithm,
    version: pinned.version,
    dim,
    params: {
      logPriorSuccess: Math.log((successN + alpha) / (total + 2 * alpha)),
      logPriorFailure: Math.log((failureN + alpha) / (total + 2 * alpha)),
      logLikSuccess,
      logLikFailure,
    },
    trainedAtIso: nowIso,
    sampleCount: examples.length,
    runtimeMode: "local_trained",
  };
}

export function trainLogisticL2(
  modelId: string,
  examples: readonly LearningExample[],
  nowIso: string,
): TrainedModelWeights {
  const pinned = getPinnedModel(modelId);
  if (!pinned || pinned.algorithm !== "LogisticRegression-L2") {
    throw new Error(`Model ${modelId} is not LogisticRegression-L2`);
  }
  if (examples.length === 0) {
    return fixtureBaselineWeights(modelId, nowIso);
  }

  const dim = FEATURE_DIM;
  const coefficients = new Float64Array(dim);
  let intercept = 0;
  const l2 = 1.0;
  const lr = 0.35;
  const epochs = 40;

  const rows = examples.map((ex) => vectorizeExample(ex, dim));

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (const row of rows) {
      let z = intercept;
      for (let i = 0; i < dim; i += 1) {
        z += coefficients[i]! * row.binary[i]!;
      }
      const pred = sigmoid(z);
      const err = pred - row.label;
      intercept -= lr * err;
      for (let i = 0; i < dim; i += 1) {
        const grad = err * row.binary[i]! + (l2 / rows.length) * coefficients[i]!;
        coefficients[i]! -= lr * grad;
      }
    }
  }

  return {
    modelId,
    algorithm: pinned.algorithm,
    version: pinned.version,
    dim,
    params: {
      intercept,
      coefficients: Array.from(coefficients),
      l2,
    },
    trainedAtIso: nowIso,
    sampleCount: examples.length,
    runtimeMode: "local_trained",
  };
}

export function trainModel(
  modelId: string,
  examples: readonly LearningExample[],
  nowIso: string,
): TrainedModelWeights {
  const pinned = getPinnedModel(modelId);
  if (!pinned) {
    throw new Error(`Unknown modelId: ${modelId}`);
  }
  if (pinned.algorithm === "BernoulliNB") {
    return trainBernoulliNb(modelId, examples, nowIso);
  }
  if (pinned.algorithm === "LogisticRegression-L2") {
    return trainLogisticL2(modelId, examples, nowIso);
  }
  throw new Error(`Unsupported algorithm: ${pinned.algorithm}`);
}

export function predictWithWeights(
  weights: TrainedModelWeights,
  example: LearningExample,
): PredictResult {
  const { binary } = vectorizeExample(example, weights.dim);

  if (weights.algorithm === "BernoulliNB") {
    const logPriorSuccess = Number(weights.params.logPriorSuccess);
    const logPriorFailure = Number(weights.params.logPriorFailure);
    const logLikSuccess = weights.params.logLikSuccess as number[];
    const logLikFailure = weights.params.logLikFailure as number[];
    let logSuccess = logPriorSuccess;
    let logFailure = logPriorFailure;
    for (let i = 0; i < weights.dim; i += 1) {
      if (binary[i]! > 0) {
        logSuccess += logLikSuccess[i] ?? 0;
        logFailure += logLikFailure[i] ?? 0;
      }
    }
    // Softmax-ish success probability from log-odds.
    const score = sigmoid(logSuccess - logFailure);
    return {
      modelId: weights.modelId,
      score,
      predictedLabel: score >= 0.5 ? "SUCCESS" : "FAILURE",
      runtimeMode: weights.runtimeMode,
    };
  }

  const intercept = Number(weights.params.intercept ?? 0);
  const coefficients = (weights.params.coefficients as number[]) ?? [];
  let z = intercept;
  for (let i = 0; i < weights.dim; i += 1) {
    z += (coefficients[i] ?? 0) * binary[i]!;
  }
  const score = sigmoid(z);
  return {
    modelId: weights.modelId,
    score,
    predictedLabel: score >= 0.5 ? "SUCCESS" : "FAILURE",
    runtimeMode: weights.runtimeMode,
  };
}

export function evaluateWeights(
  weights: TrainedModelWeights,
  examples: readonly LearningExample[],
): {
  sampleCount: number;
  accuracy: number | null;
  successRate: number | null;
  meanScore: number | null;
} {
  if (examples.length === 0) {
    return {
      sampleCount: 0,
      accuracy: null,
      successRate: null,
      meanScore: null,
    };
  }
  let correct = 0;
  let success = 0;
  let scoreSum = 0;
  for (const example of examples) {
    const pred = predictWithWeights(weights, example);
    scoreSum += pred.score;
    if (example.label === "SUCCESS") {
      success += 1;
    }
    if (pred.predictedLabel === example.label) {
      correct += 1;
    }
  }
  return {
    sampleCount: examples.length,
    accuracy: correct / examples.length,
    successRate: success / examples.length,
    meanScore: scoreSum / examples.length,
  };
}
