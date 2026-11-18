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

function splitHoldout(examples: LearningExample[]): {
  train: LearningExample[];
  holdout: LearningExample[];
} {
  if (examples.length < 4) {
    return { train: [...examples], holdout: [...examples] };
  }
  const holdoutCount = Math.max(1, Math.floor(examples.length / 4));
  return {
    train: examples.slice(0, examples.length - holdoutCount),
    holdout: examples.slice(examples.length - holdoutCount),
  };
}

function buildMetrics(
  examples: LearningExample[],
  holdout: LearningExample[],
  weights: readonly TrainedModelWeights[],
  fixtureExcludedCount: number,
): LearningRunMetrics {
  const primary = weights[0];
  const evalOn = holdout.length > 0 ? holdout : examples;
  const scored = primary
    ? evaluateWeights(primary, evalOn)
    : {
        sampleCount: evalOn.length,
        accuracy: null,
        successRate: null,
        meanScore: null,
      };
  return {
    sampleCount: examples.length,
    heldOutCount: holdout.length,
    accuracy: scored.accuracy,
    successRate: scored.successRate,
    meanScore: scored.meanScore,
    fixtureExcludedCount,
    modelIds: weights.map((w) => w.modelId),
  };
}

export function runTrainLoop(input: TrainLoopInput): TrainLoopResult {
  assertLearningWorkerIsolation(input.isolation);

  const includeFixture = input.includeFixture ?? false;
  const allCandidates = [
    ...input.writePathOutcomes,
    // role outcomes counted separately for fixture exclusion metric
  ];
  const fixtureExcludedCount =
    input.fixtureExcludedCount ??
    input.writePathOutcomes.filter((o) => o.fixtureOnly).length +
      input.roleOutcomes.filter((o) => o.executionMode === "fixture").length;

  void allCandidates;

  const examples = extractLearningExamples({
    writePathOutcomes: input.writePathOutcomes,
    roleOutcomes: input.roleOutcomes,
    includeFixture,
  });

  const { train, holdout } = splitHoldout(examples);
  const models = listPinnedModels();
  const weights: TrainedModelWeights[] = models.map((m) =>
    trainModel(m.modelId, train, input.nowIso),
  );

  const metrics = buildMetrics(
    examples,
    holdout,
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
          "Proposed playbook hint weights from BernoulliNB over verified outcomes (review required).",
        metrics,
        payload: {
          artifactType: "playbook_hints",
          modelId: nb.modelId,
          sampleCount: nb.sampleCount,
          runtimeMode: nb.runtimeMode,
          // Ranking of failure-prone feature tokens is advisory only.
          advisoryOnly: true,
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
        : "Offline metrics from verified SUCCESS/FAILURE outcomes. Proposals await review; no authority expansion.",
  };

  return { run, proposals, examples };
}
