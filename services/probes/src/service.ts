/**
 * Probe service — orchestrates HTTP/DOM probes and form-to-CRM canaries.
 * Persists evidence; wires SUCCESS/FAILURE into production-mapping learning ledgers.
 */

import { randomBytes } from "node:crypto";
import {
  MONITORING_RELATED_CASE_IDS,
  ProbeKind,
  ProbeMode,
  type ProbeModeValue,
  type ProbeRunRecord,
  type ProductionMappingState,
  type WritePathOutcomeEvidence,
} from "@worksocial/domain";
import type {
  ProbeStore,
  ProductionMappingStore,
} from "@worksocial/persistence";
import type { ActionGateway } from "@worksocial/action-gateway";
import { runHttpProbe } from "./http-probe.js";
import { runDomJourneyProbe } from "./dom-journey.js";
import {
  runFormToCrmCanary,
  type FormCanaryAuthority,
  type FormCanaryResult,
} from "./form-canary.js";

export type ProbeService = {
  status(): ReturnType<ProbeStore["status"]> & {
    acceptanceCaseIds: readonly string[];
  };
  listRuns(limit?: number): ProbeRunRecord[];
  lastEvidence(): ProbeRunRecord | null;
  runHttp(input?: {
    targetId?: string;
    mode?: ProbeModeValue;
    liveUrl?: string;
    nowIso?: string;
  }): Promise<ProbeRunRecord>;
  runDom(input?: {
    targetId?: string;
    mode?: ProbeModeValue;
    nowIso?: string;
  }): Promise<ProbeRunRecord>;
  runFormCanary(input: {
    authority: FormCanaryAuthority;
    writePathId?: string;
    mode?: ProbeModeValue;
    nowIso?: string;
    liveZoho?: boolean;
    gateway?: ActionGateway;
    skipFixtureReceipt?: boolean;
    ambiguousReceipt?: boolean;
    targetAccountId?: string;
  }): FormCanaryResult;
};

function newRunId(kind: string): string {
  return `${kind}-${randomBytes(6).toString("hex")}`;
}

function appendOutcome(
  mappingStore: ProductionMappingStore | undefined,
  outcome: WritePathOutcomeEvidence | null,
): void {
  if (!mappingStore || !outcome) {
    return;
  }
  mappingStore.addWritePathOutcome(outcome);
}

export function createProbeService(options: {
  store: ProbeStore;
  mappingStore?: ProductionMappingStore;
}): ProbeService {
  const { store, mappingStore } = options;

  return {
    status() {
      return {
        ...store.status(),
        acceptanceCaseIds: MONITORING_RELATED_CASE_IDS,
      };
    },
    listRuns(limit) {
      return store.listRuns(limit);
    },
    lastEvidence() {
      return store.lastRun();
    },
    async runHttp(input = {}) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const mode = input.mode ?? ProbeMode.FIXTURE;
      const targetId = input.targetId ?? "fixture-contact";
      const result = await runHttpProbe({
        targetId,
        mode,
        nowIso,
        ...(input.liveUrl !== undefined ? { liveUrl: input.liveUrl } : {}),
      });
      const run: ProbeRunRecord = {
        runId: newRunId("http"),
        kind: ProbeKind.HTTP,
        mode: result.mode,
        targetId: result.targetId,
        verdict: result.verdict,
        startedAtIso: nowIso,
        finishedAtIso: nowIso,
        evidence: result.evidence,
        reconciliation: null,
        outcomeId: null,
        writePathId: null,
        operationId: null,
        gatewayDecisionId: null,
        acceptanceCaseIds: [...MONITORING_RELATED_CASE_IDS],
      };
      store.recordRun(run);
      return run;
    },
    async runDom(input = {}) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const mode = input.mode ?? ProbeMode.FIXTURE;
      const targetId = input.targetId ?? "fixture-contact";
      const result = await runDomJourneyProbe({
        targetId,
        mode,
        nowIso,
      });
      const run: ProbeRunRecord = {
        runId: newRunId("dom"),
        kind: ProbeKind.DOM_JOURNEY,
        mode: result.mode,
        targetId: result.targetId,
        verdict: result.verdict,
        startedAtIso: nowIso,
        finishedAtIso: nowIso,
        evidence: result.evidence,
        reconciliation: null,
        outcomeId: null,
        writePathId: null,
        operationId: null,
        gatewayDecisionId: null,
        acceptanceCaseIds: [...MONITORING_RELATED_CASE_IDS],
      };
      store.recordRun(run);
      return run;
    },
    runFormCanary(input) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const result = runFormToCrmCanary({
        mode: input.mode ?? ProbeMode.FIXTURE,
        nowIso,
        authority: input.authority,
        ...(input.writePathId !== undefined
          ? { writePathId: input.writePathId }
          : {}),
        ...(input.gateway !== undefined ? { gateway: input.gateway } : {}),
        ...(input.liveZoho !== undefined ? { liveZoho: input.liveZoho } : {}),
        ...(input.skipFixtureReceipt !== undefined
          ? { skipFixtureReceipt: input.skipFixtureReceipt }
          : {}),
        ...(input.ambiguousReceipt !== undefined
          ? { ambiguousReceipt: input.ambiguousReceipt }
          : {}),
        ...(input.targetAccountId !== undefined
          ? { targetAccountId: input.targetAccountId }
          : {}),
      });
      if (result.receipt) {
        store.addFixtureReceipt(result.receipt);
      }
      store.recordRun(result.run);
      appendOutcome(mappingStore, result.outcome);
      return result;
    },
  };
}

export type { FormCanaryAuthority, FormCanaryResult, ProductionMappingState };
