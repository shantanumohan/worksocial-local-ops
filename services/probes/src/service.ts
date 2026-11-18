/**
 * Probe service — orchestrates HTTP/DOM probes and form-to-CRM canaries.
 * Persists evidence; wires SUCCESS/FAILURE into production-mapping learning ledgers.
 */

import { randomBytes } from "node:crypto";
import {
  MONITORING_RELATED_CASE_IDS,
  ProbeKind,
  ProbeMode,
  ProbeVerdict,
  ReconciliationStatus,
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
  /**
   * True when the latest form canary for this write path has an unresolved
   * blocksRetry reconciliation (ambiguous / missing remote).
   */
  hasUnresolvedCanaryBlock(writePathId: string): boolean;
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
    /** Explicit clearance of a prior ambiguous/missing remote block. */
    clearUnresolvedBlock?: boolean;
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

function latestCanaryForPath(
  runs: readonly ProbeRunRecord[],
  writePathId: string,
): ProbeRunRecord | null {
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i]!;
    if (
      run.kind === ProbeKind.FORM_TO_CRM_CANARY &&
      run.writePathId === writePathId
    ) {
      return run;
    }
  }
  return null;
}

function blockedResult(
  writePathId: string,
  nowIso: string,
  prior: ProbeRunRecord,
): FormCanaryResult {
  const run: ProbeRunRecord = {
    runId: newRunId("canary-blocked"),
    kind: ProbeKind.FORM_TO_CRM_CANARY,
    mode: ProbeMode.FIXTURE,
    targetId: writePathId,
    verdict: ProbeVerdict.FAILURE,
    startedAtIso: nowIso,
    finishedAtIso: nowIso,
    evidence: {
      evidenceId: newRunId("ev"),
      kind: ProbeKind.FORM_TO_CRM_CANARY,
      mode: ProbeMode.FIXTURE,
      summary:
        "Blocked: prior canary has unresolved ambiguous/missing remote outcome",
      facts: {
        priorRunId: prior.runId,
        priorStatus: prior.reconciliation?.status ?? null,
      },
      recordedAtIso: nowIso,
    },
    reconciliation: {
      status: ReconciliationStatus.AMBIGUOUS,
      verdict: ProbeVerdict.UNKNOWN,
      intentOperationId: prior.operationId ?? prior.runId,
      correlationId: prior.reconciliation?.correlationId ?? "unknown",
      matchedReceiptIds: [],
      details: [
        `Fail closed: prior run ${prior.runId} blocksRetry until explicit clearance`,
      ],
      blocksRetry: true,
    },
    outcomeId: null,
    writePathId,
    operationId: null,
    gatewayDecisionId: null,
    acceptanceCaseIds: [...MONITORING_RELATED_CASE_IDS],
  };
  return {
    run,
    intent: null,
    receipt: null,
    outcome: null,
    gatewayAllowed: false,
    gatewayDecisionId: null,
    gatewayCode: "BLOCKS_RETRY",
    gatewayDecision: null,
    details: run.reconciliation!.details,
  };
}

export function createProbeService(options: {
  store: ProbeStore;
  mappingStore?: ProductionMappingStore;
}): ProbeService {
  const { store, mappingStore } = options;

  const hasUnresolvedCanaryBlock = (writePathId: string): boolean => {
    const prior = latestCanaryForPath(store.listRuns(500), writePathId);
    return prior?.reconciliation?.blocksRetry === true;
  };

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
    hasUnresolvedCanaryBlock,
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
      const finishedAtIso = new Date().toISOString();
      const run: ProbeRunRecord = {
        runId: newRunId("http"),
        kind: ProbeKind.HTTP,
        mode: result.mode,
        targetId: result.targetId,
        verdict: result.verdict,
        startedAtIso: nowIso,
        finishedAtIso,
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
      const finishedAtIso = new Date().toISOString();
      const run: ProbeRunRecord = {
        runId: newRunId("dom"),
        kind: ProbeKind.DOM_JOURNEY,
        mode: result.mode,
        targetId: result.targetId,
        verdict: result.verdict,
        startedAtIso: nowIso,
        finishedAtIso,
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
      const mapping = input.authority.productionMapping;
      const writePathId =
        input.writePathId ??
        mapping.writePaths.find((p) => p.operation === "submit_form_canary")
          ?.writePathId ??
        null;

      if (writePathId && hasUnresolvedCanaryBlock(writePathId)) {
        if (!input.clearUnresolvedBlock) {
          const prior = latestCanaryForPath(store.listRuns(500), writePathId)!;
          const blocked = blockedResult(writePathId, nowIso, prior);
          store.recordRun(blocked.run);
          return blocked;
        }
        // Explicit clearance — record a non-write clearance before proceeding.
        const clearance: ProbeRunRecord = {
          runId: newRunId("canary-clear"),
          kind: ProbeKind.FORM_TO_CRM_CANARY,
          mode: ProbeMode.FIXTURE,
          targetId: writePathId,
          verdict: ProbeVerdict.SUCCESS,
          startedAtIso: nowIso,
          finishedAtIso: nowIso,
          evidence: {
            evidenceId: newRunId("ev"),
            kind: ProbeKind.FORM_TO_CRM_CANARY,
            mode: ProbeMode.FIXTURE,
            summary: "Owner cleared unresolved canary block before retry",
            facts: { cleared: true, writePathId },
            recordedAtIso: nowIso,
          },
          reconciliation: {
            status: ReconciliationStatus.MATCHED,
            verdict: ProbeVerdict.SUCCESS,
            intentOperationId: "clearance",
            correlationId: "clearance",
            matchedReceiptIds: [],
            details: ["Explicit clearance of prior blocksRetry canary"],
            blocksRetry: false,
          },
          outcomeId: null,
          writePathId,
          operationId: null,
          gatewayDecisionId: null,
          acceptanceCaseIds: [...MONITORING_RELATED_CASE_IDS],
        };
        store.recordRun(clearance);
      }

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
