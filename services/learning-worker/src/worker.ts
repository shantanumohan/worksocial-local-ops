/**
 * Learning worker — train/update loop over durable outcome ledgers.
 * Isolated: no action-gateway write principal, no production effect credentials.
 */

import { randomBytes } from "node:crypto";
import {
  listRoleOutcomesForLearning,
  listWritePathOutcomesForLearning,
  type ProductionMappingState,
  type RoleRunOutcomeEvidence,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import {
  assertLearningWorkerIsolation,
  listPinnedModels,
  runTrainLoop,
  type TrainLoopResult,
} from "@worksocial/ml";
import type { LearningStore } from "@worksocial/persistence";

export const LEARNING_WORKER_PRINCIPAL = "learning-worker" as const;

export type LearningWorker = {
  readonly principal: typeof LEARNING_WORKER_PRINCIPAL;
  readonly hasActionGatewayWritePrincipal: false;
  readonly hasProductionEffectCredentials: false;
  status(): ReturnType<LearningStore["status"]> & {
    models: ReturnType<typeof listPinnedModels>;
  };
  trainFromLedgers(input: {
    mapping: ProductionMappingState;
    roleOutcomes: readonly RoleRunOutcomeEvidence[];
    /** Extra write-path outcomes (e.g. content distribution SUCCESS/FAILURE). */
    extraWritePathOutcomes?: readonly WritePathOutcomeEvidence[];
    nowIso?: string;
    includeFixture?: boolean;
  }): TrainLoopResult;
};

function newRunId(): string {
  return `learn-${randomBytes(6).toString("hex")}`;
}

export function createLearningWorker(store: LearningStore): LearningWorker {
  const isolation = {
    principal: LEARNING_WORKER_PRINCIPAL,
    hasActionGatewayWritePrincipal: false as const,
    hasProductionEffectCredentials: false as const,
  };

  assertLearningWorkerIsolation(isolation);

  return {
    principal: LEARNING_WORKER_PRINCIPAL,
    hasActionGatewayWritePrincipal: false,
    hasProductionEffectCredentials: false,
    status() {
      const status = store.status();
      return {
        ...status,
        models: listPinnedModels(),
      };
    },
    trainFromLedgers(input) {
      assertLearningWorkerIsolation(isolation);
      const includeFixture = input.includeFixture ?? false;
      const mappingOutcomes = listWritePathOutcomesForLearning(input.mapping, {
        includeFixture,
      });
      const extra = (input.extraWritePathOutcomes ?? []).filter((o) => {
        if (o.fixtureOnly && !includeFixture) return false;
        return true;
      });
      const writePathOutcomes = [...mappingOutcomes, ...extra];
      // listWritePathOutcomesForLearning already filtered; recount fixtures from raw ledger.
      const fixtureExcludedCount =
        input.mapping.writePathOutcomes.filter((o) => o.fixtureOnly).length +
        (input.extraWritePathOutcomes ?? []).filter((o) => o.fixtureOnly)
          .length +
        input.roleOutcomes.filter((o) => o.executionMode === "fixture").length;

      const roleOutcomes = includeFixture
        ? listRoleOutcomesForLearning(input.roleOutcomes)
        : listRoleOutcomesForLearning(input.roleOutcomes).filter(
            (o) => o.executionMode !== "fixture",
          );

      const nowIso = input.nowIso ?? new Date().toISOString();
      const result = runTrainLoop({
        writePathOutcomes,
        roleOutcomes,
        nowIso,
        runId: newRunId(),
        includeFixture,
        isolation,
        fixtureExcludedCount,
      });

      store.recordTraining(result.run, result.proposals, [
        ...result.run.modelWeights,
      ]);
      return result;
    },
  };
}
