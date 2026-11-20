/**
 * Train/update loop over verified outcomes → versioned proposals under review.
 */

import type {
  RoleRunOutcomeEvidence,
  WritePathOutcomeEvidence,
} from "@worksocial/domain";
import {
  assertLearningWorkerIsolation,
  type LearningIsolationContext,
} from "./authority-guard.js";
import { extractLearningExamples, type LearningExample } from "./features.js";
import {
  evaluateWeights,
  trainModel,
  type TrainedModelWeights,
} from "./models.js";
import {
  createLearningProposal,
  type LearningProposal,
  type LearningRunMetrics,
  type LearningTrainingRun,
  LearningProposalKind,
} from "./proposals.js";
import { listPinnedModels } from "./registry.js";

export type TrainLoopInput = {
  writePathOutcomes: readonly WritePathOutcomeEvidence[];
  roleOutcomes: readonly RoleRunOutcomeEvidence[];
  nowIso: string;
  runId: string;
  /** Default false — exclude fixtureOnly / fixture execution. */
  includeFixture?: boolean;
  isolation: LearningIsolationContext;
  /** Count of fixture rows skipped (for metrics honesty). */
  fixtureExcludedCount?: number;
};

export type TrainLoopResult = {
  run: LearningTrainingRun;
  proposals: LearningProposal[];
  examples: LearningExample[];
};

/** Minimum examples required before a true train/holdout split is claimed. */
export const MIN_HOLDOUT_SPLIT_SAMPLES = 4;

export type HoldoutSplit = {
  train: LearningExample[];
  holdout: LearningExample[];
  /** True when holdout is not an independent slice (must not score as holdout). */
  insufficientData: boolean;
  reason: string | null;
};

/**
 * Split train/holdout. When samples are too small, do NOT silently reuse
 * train as holdout for accuracy claims — label INSUFFICIENT_DATA instead.
 */
export function splitHoldout(examples: LearningExample[]): HoldoutSplit {
  if (examples.length < MIN_HOLDOUT_SPLIT_SAMPLES) {
    return {
      train: [...examples],
      holdout: [],
      insufficientData: true,
      reason: `Only ${examples.length} verified examples (< ${MIN_HOLDOUT_SPLIT_SAMPLES}); holdout metrics are INSUFFICIENT_DATA — train was not reused as holdout`,
    };
  }
  const holdoutCount = Math.max(1, Math.floor(examples.length / 4));
  return {
    train: examples.slice(0, examples.length - holdoutCount),
    holdout: examples.slice(examples.length - holdoutCount),
    insufficientData: false,
    reason: null,
  };
}

function buildMetrics(
  examples: LearningExample[],
  split: HoldoutSplit,
  weights: readonly TrainedModelWeights[],
  fixtureExcludedCount: number,
): LearningRunMetrics {
  const primary = weights[0];
  if (split.insufficientData) {
    return {
      sampleCount: examples.length,
      heldOutCount: 0,
      accuracy: null,
      successRate: null,
      meanScore: null,
      fixtureExcludedCount,
      modelIds: weights.map((w) => w.modelId),
      dataAdequacy: "INSUFFICIENT_DATA",
      dataAdequacyReason: split.reason,
    };
  }

  const scored = primary
    ? evaluateWeights(primary, split.holdout)
    : {
        sampleCount: split.holdout.length,
        accuracy: null,
        successRate: null,
        meanScore: null,
      };
  return {
    sampleCount: examples.length,
    heldOutCount: split.holdout.length,
    accuracy: scored.accuracy,
    successRate: scored.successRate,
    meanScore: scored.meanScore,
    fixtureExcludedCount,
    modelIds: weights.map((w) => w.modelId),
    dataAdequacy: "OK",
    dataAdequacyReason: null,
  };
}

export function runTrainLoop(input: TrainLoopInput): TrainLoopResult {
  assertLearningWorkerIsolation(input.isolation);

  const includeFixture = input.includeFixture ?? false;
  const fixtureExcludedCount =
    input.fixtureExcludedCount ??
    input.writePathOutcomes.filter((o) => o.fixtureOnly).length +
      input.roleOutcomes.filter((o) => o.executionMode === "fixture").length;

  const examples = extractLearningExamples({
    writePathOutcomes: input.writePathOutcomes,
    roleOutcomes: input.roleOutcomes,
    includeFixture,
  });

  const split = splitHoldout(examples);
  const models = listPinnedModels();
  const weights: TrainedModelWeights[] = models.map((m) =>
    trainModel(m.modelId, split.train, input.nowIso),
  );

  const metrics = buildMetrics(
    examples,
    split,
    weights,
    fixtureExcludedCount,
  );

  const runtimeMode =
    examples.length === 0 || weights.every((w) => w.runtimeMode === "offline_fixture")
      ? "offline_fixture"
      : "local_trained";

  const nb = weights.find((w) => w.algorithm === "BernoulliNB");
  const logreg = weights.find((w) => w.algorithm === "LogisticRegression-L2");

  const proposals: LearningProposal[] = [];

  if (nb) {
    proposals.push(
      createLearningProposal({
        proposalId: `${input.runId}-playbook`,
        kind: LearningProposalKind.PLAYBOOK,
        modelIds: [nb.modelId],
        trainingRunId: input.runId,
        summary:
          metrics.dataAdequacy === "INSUFFICIENT_DATA"
            ? "Proposed playbook hints under INSUFFICIENT_DATA — holdout metrics withheld (review required)."
            : "Proposed playbook hint weights from BernoulliNB over verified outcomes (review required).",
        metrics,
        payload: {
          artifactType: "playbook_hints",
          modelId: nb.modelId,
          sampleCount: nb.sampleCount,
          runtimeMode: nb.runtimeMode,
          advisoryOnly: true,
          dataAdequacy: metrics.dataAdequacy,
        },
        createdAtIso: input.nowIso,
      }),
    );
  }

  if (logreg) {
    proposals.push(
      createLearningProposal({
        proposalId: `${input.runId}-ranking`,
        kind: LearningProposalKind.RANKING,
        modelIds: [logreg.modelId],
        trainingRunId: input.runId,
        summary:
          "Proposed ranking scores from L2 logistic regression (review required; no authority change).",
        metrics,
        payload: {
          artifactType: "ranking_scores",
          modelId: logreg.modelId,
          intercept: logreg.params.intercept,
          dim: logreg.dim,
          advisoryOnly: true,
          dataAdequacy: metrics.dataAdequacy,
        },
        createdAtIso: input.nowIso,
      }),
    );
    proposals.push(
      createLearningProposal({
        proposalId: `${input.runId}-risk`,
        kind: LearningProposalKind.RISK,
        modelIds: [logreg.modelId],
        trainingRunId: input.runId,
        summary:
          "Proposed failure-risk scores for review. Cannot expand spend/CRM/publish grants.",
        metrics,
        payload: {
          artifactType: "risk_scores",
          modelId: logreg.modelId,
          meanScore: metrics.meanScore,
          advisoryOnly: true,
          dataAdequacy: metrics.dataAdequacy,
        },
        createdAtIso: input.nowIso,
      }),
    );
  }

  const run: LearningTrainingRun = {
    runId: input.runId,
    startedAtIso: input.nowIso,
    finishedAtIso: input.nowIso,
    runtimeMode,
    metrics,
    modelWeights: weights,
    proposalIds: proposals.map((p) => p.proposalId),
    note:
      examples.length === 0
        ? "No non-fixture verified outcomes available; emitted offline fixture baseline proposals only. Not production-canary-verified."
        : metrics.dataAdequacy === "INSUFFICIENT_DATA"
          ? `INSUFFICIENT_DATA: ${metrics.dataAdequacyReason}. Proposals await review; no authority expansion.`
          : "Offline metrics from verified SUCCESS/FAILURE outcomes. Proposals await review; no authority expansion.",
  };

  return { run, proposals, examples };
}
