/**
 * File-backed learning state (training runs, proposals, model registry snapshot).
 * Schema companion: database/migrations/006_learning.sql.
 * Proposals only — never applies grants/spend/CRM/publish authority.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  LearningProposal,
  LearningTrainingRun,
  PinnedOpenSourceModel,
  TrainedModelWeights,
} from "@worksocial/ml";
import { listPinnedModels, listProposalsAwaitingReview } from "@worksocial/ml";

export type LearningState = {
  version: 1;
  updatedAtIso: string;
  models: PinnedOpenSourceModel[];
  runs: LearningTrainingRun[];
  proposals: LearningProposal[];
  latestWeights: TrainedModelWeights[];
  isolation: {
    principal: "learning-worker";
    hasActionGatewayWritePrincipal: false;
    hasProductionEffectCredentials: false;
  };
};

export type LearningStore = {
  readonly stateDir: string;
  read(): LearningState;
  write(state: LearningState): void;
  update(mutator: (current: LearningState) => LearningState): LearningState;
  recordTraining(
    run: LearningTrainingRun,
    proposals: LearningProposal[],
    weights: TrainedModelWeights[],
  ): LearningState;
  status(): {
    modelCount: number;
    lastRun: LearningTrainingRun | null;
    awaitingReview: LearningProposal[];
    isolation: LearningState["isolation"];
    honestNote: string;
  };
};

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function emptyLearningState(nowIso: string): LearningState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    models: [...listPinnedModels()],
    runs: [],
    proposals: [],
    latestWeights: [],
    isolation: {
      principal: "learning-worker",
      hasActionGatewayWritePrincipal: false,
      hasProductionEffectCredentials: false,
    },
  };
}

export function createFileLearningStore(stateDir: string): LearningStore {
  const learningDir = join(stateDir, "learning");
  const statePath = join(learningDir, "learning-state.json");

  const read = (): LearningState => {
    const existing = readJsonFile<LearningState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyLearningState(new Date().toISOString());
    }
    return {
      ...existing,
      models: existing.models?.length ? existing.models : [...listPinnedModels()],
      runs: existing.runs ?? [],
      proposals: existing.proposals ?? [],
      latestWeights: existing.latestWeights ?? [],
      isolation: {
        principal: "learning-worker",
        hasActionGatewayWritePrincipal: false,
        hasProductionEffectCredentials: false,
      },
    };
  };

  const write = (state: LearningState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: LearningState) => LearningState,
  ): LearningState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: learningDir,
    read,
    write,
    update,
    recordTraining(run, proposals, weights) {
      return update((current) => ({
        ...current,
        updatedAtIso: run.finishedAtIso,
        runs: [run, ...current.runs].slice(0, 100),
        proposals: [...proposals, ...current.proposals].slice(0, 200),
        latestWeights: weights,
        models: [...listPinnedModels()],
        isolation: {
          principal: "learning-worker",
          hasActionGatewayWritePrincipal: false,
          hasProductionEffectCredentials: false,
        },
      }));
    },
    status() {
      const state = read();
      return {
        modelCount: state.models.length,
        lastRun: state.runs[0] ?? null,
        awaitingReview: listProposalsAwaitingReview(state.proposals),
        isolation: state.isolation,
        honestNote:
          "Local multi-model learning from verified outcomes. Offline/fixture metrics ≠ production-canary-verified. Proposals await review and cannot expand grants/spend/CRM/publish authority.",
      };
    },
  };
}

export function defaultLearningStateDir(baseDir: string): string {
  return join(baseDir, "learning");
}
