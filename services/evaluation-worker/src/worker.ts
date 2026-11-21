/**
 * AA-20 / AA-21 isolated evaluation worker.
 * Library worker (API-hosted) — no supervised fleet process slot.
 * EVAL_ONLY fixture adjudication; live fleet NOT_WIRED; learning cannot expand effects.
 */

import {
  EVALUATION_WORKER_PRINCIPAL,
  FIXED_EVALUATION_ISOLATION,
  assertEvaluationWorkerIsolation,
  type EvaluationIsolationContext,
} from "@worksocial/domain";
import type { EvaluationStore } from "@worksocial/persistence";
import {
  createEvaluationService,
  type EvaluationService,
} from "./service.js";

export { EVALUATION_WORKER_PRINCIPAL };

export type EvaluationWorker = EvaluationService & {
  readonly principal: typeof EVALUATION_WORKER_PRINCIPAL;
  readonly hasActionGatewayWritePrincipal: false;
  readonly hasProductionEffectCredentials: false;
  readonly learningCannotExpandEffects: true;
  readonly isolation: EvaluationIsolationContext;
};

export function createEvaluationWorker(
  store: EvaluationStore,
): EvaluationWorker {
  const isolation: EvaluationIsolationContext = {
    ...FIXED_EVALUATION_ISOLATION,
  };
  assertEvaluationWorkerIsolation(isolation);

  const service = createEvaluationService(store);

  return {
    principal: EVALUATION_WORKER_PRINCIPAL,
    hasActionGatewayWritePrincipal: false,
    hasProductionEffectCredentials: false,
    learningCannotExpandEffects: true,
    isolation,
    async status() {
      assertEvaluationWorkerIsolation(isolation);
      const status = await service.status();
      return {
        ...status,
        isolation,
        principal: EVALUATION_WORKER_PRINCIPAL,
      };
    },
    listConnections: (limit) => service.listConnections(limit),
    listSuites: (limit) => service.listSuites(limit),
    listRuns: (limit) => service.listRuns(limit),
    seedFixtures: async (nowIso) => {
      assertEvaluationWorkerIsolation(isolation);
      return service.seedFixtures(nowIso);
    },
    connectProvider: async (input) => {
      assertEvaluationWorkerIsolation(isolation);
      return service.connectProvider(input);
    },
    runSuite: async (input) => {
      assertEvaluationWorkerIsolation(isolation);
      return service.runSuite(input);
    },
    attemptTool: (tool) => service.attemptTool(tool),
    chatgptAdsStatus: () => service.chatgptAdsStatus(),
  };
}
