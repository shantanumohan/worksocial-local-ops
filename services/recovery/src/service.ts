/**
 * WP10 recovery evidence service — fixture outage / queued-work / URO paths.
 * External effects: NONE. Live recovery remains NOT_RUN.
 */

import {
  RECOVERY_FIXTURE_SCENARIO_IDS,
  RECOVERY_RELATED_CASE_IDS,
  summarizeRecoveryClasses,
  type RecoveryScenarioId,
} from "@worksocial/domain";
import type { RecoveryStore } from "@worksocial/persistence";
import { listActiveStops, runRecoveryScenario } from "./scenarios.js";

export type RecoveryService = {
  status(): Promise<
    Awaited<ReturnType<RecoveryStore["status"]>> & {
      relatedCaseIds: readonly string[];
      scenarioIds: readonly RecoveryScenarioId[];
      principal: "recovery";
    }
  >;
  listTimeline(
    limit?: number,
  ): Promise<Awaited<ReturnType<RecoveryStore["listTimeline"]>>>;
  listQueuedWork(): Promise<
    Awaited<ReturnType<RecoveryStore["listQueuedWork"]>>
  >;
  listCapabilityStops(): Promise<
    Awaited<ReturnType<RecoveryStore["listCapabilityStops"]>>
  >;
  listRuns(
    limit?: number,
  ): Promise<Awaited<ReturnType<RecoveryStore["listRuns"]>>>;
  listArtifacts(
    limit?: number,
  ): Promise<Awaited<ReturnType<RecoveryStore["listArtifacts"]>>>;
  /**
   * Run one or all fixture recovery scenarios.
   * Never claims live VERIFIED; externalEffects always NONE.
   */
  runFixtureRecovery(input?: {
    scenarioId?: RecoveryScenarioId;
    nowIso?: string;
  }): Promise<{
    ok: boolean;
    results: Awaited<ReturnType<typeof runRecoveryScenario>>[];
    classCounts: ReturnType<typeof summarizeRecoveryClasses>;
    note: string;
  }>;
  inspection(): Promise<{
    timeline: Awaited<ReturnType<RecoveryStore["listTimeline"]>>;
    queuedWork: Awaited<ReturnType<RecoveryStore["listQueuedWork"]>>;
    activeStops: ReturnType<typeof listActiveStops>;
    classCounts: ReturnType<typeof summarizeRecoveryClasses>;
    liveRecoveryClaim: "NOT_RUN";
    externalEffects: "NONE";
    note: string;
  }>;
};

export function createRecoveryService(store: RecoveryStore): RecoveryService {
  return {
    async status() {
      return {
        ...(await store.status()),
        relatedCaseIds: RECOVERY_RELATED_CASE_IDS,
        scenarioIds: RECOVERY_FIXTURE_SCENARIO_IDS,
        principal: "recovery",
      };
    },

    listTimeline(limit) {
      return store.listTimeline(limit);
    },

    listQueuedWork() {
      return store.listQueuedWork();
    },

    listCapabilityStops() {
      return store.listCapabilityStops();
    },

    listRuns(limit) {
      return store.listRuns(limit);
    },

    listArtifacts(limit) {
      return store.listArtifacts(limit);
    },

    async runFixtureRecovery(input = {}) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const scenarios: RecoveryScenarioId[] = input.scenarioId
        ? [input.scenarioId]
        : [...RECOVERY_FIXTURE_SCENARIO_IDS];

      const results = [];
      for (const id of scenarios) {
        results.push(await runRecoveryScenario(store, id, nowIso));
      }
      const ok = results.every((r) => r.run.status === "PASSED");
      const classCounts = summarizeRecoveryClasses(await store.listTimeline());

      return {
        ok,
        results,
        classCounts,
        note: ok
          ? "Fixture recovery scenarios passed. Distinguishes STALE_OBSERVATION / ACTIVE_INCIDENT / UNKNOWN_REMOTE_OUTCOME. Live recovery NOT_RUN; external effects NONE. Local credential revoke/rotate/offboard are fixture (/credentials); live provider revocation NOT_WIRED. Not R1-complete."
          : "One or more fixture recovery scenarios failed. Live recovery still NOT_RUN; no external effects attempted.",
      };
    },

    async inspection() {
      const timeline = await store.listTimeline();
      return {
        timeline,
        queuedWork: await store.listQueuedWork(),
        activeStops: listActiveStops(await store.listCapabilityStops()),
        classCounts: summarizeRecoveryClasses(timeline),
        liveRecoveryClaim: "NOT_RUN" as const,
        externalEffects: "NONE" as const,
        note: "Inspect host/provider outage and queued work. Stale observations are not active incidents. UNKNOWN_REMOTE_OUTCOME requires reconcile before retry.",
      };
    },
  };
}
