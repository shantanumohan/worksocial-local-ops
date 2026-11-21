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
  status(): ReturnType<RecoveryStore["status"]> & {
    relatedCaseIds: readonly string[];
    scenarioIds: readonly RecoveryScenarioId[];
    principal: "recovery";
  };
  listTimeline(limit?: number): ReturnType<RecoveryStore["listTimeline"]>;
  listQueuedWork(): ReturnType<RecoveryStore["listQueuedWork"]>;
  listCapabilityStops(): ReturnType<RecoveryStore["listCapabilityStops"]>;
  listRuns(limit?: number): ReturnType<RecoveryStore["listRuns"]>;
  listArtifacts(limit?: number): ReturnType<RecoveryStore["listArtifacts"]>;
  /**
   * Run one or all fixture recovery scenarios.
   * Never claims live VERIFIED; externalEffects always NONE.
   */
  runFixtureRecovery(input?: {
    scenarioId?: RecoveryScenarioId;
    nowIso?: string;
  }): {
    ok: boolean;
    results: ReturnType<typeof runRecoveryScenario>[];
    classCounts: ReturnType<typeof summarizeRecoveryClasses>;
    note: string;
  };
  inspection(): {
    timeline: ReturnType<RecoveryStore["listTimeline"]>;
    queuedWork: ReturnType<RecoveryStore["listQueuedWork"]>;
    activeStops: ReturnType<typeof listActiveStops>;
    classCounts: ReturnType<typeof summarizeRecoveryClasses>;
    liveRecoveryClaim: "NOT_RUN";
    externalEffects: "NONE";
    note: string;
  };
};

export function createRecoveryService(store: RecoveryStore): RecoveryService {
  return {
    status() {
      return {
        ...store.status(),
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

    runFixtureRecovery(input = {}) {
      const nowIso = input.nowIso ?? new Date().toISOString();
      const scenarios: RecoveryScenarioId[] = input.scenarioId
        ? [input.scenarioId]
        : [...RECOVERY_FIXTURE_SCENARIO_IDS];

      const results = scenarios.map((id) =>
        runRecoveryScenario(store, id, nowIso),
      );
      const ok = results.every((r) => r.run.status === "PASSED");
      const classCounts = summarizeRecoveryClasses(store.listTimeline());

      return {
        ok,
        results,
        classCounts,
        note: ok
          ? "Fixture recovery scenarios passed. Distinguishes STALE_OBSERVATION / ACTIVE_INCIDENT / UNKNOWN_REMOTE_OUTCOME. Live recovery NOT_RUN; external effects NONE. Credential rotation / offboarding remain NOT_WIRED. Not R1-complete."
          : "One or more fixture recovery scenarios failed. Live recovery still NOT_RUN; no external effects attempted.",
      };
    },

    inspection() {
      const timeline = store.listTimeline();
      return {
        timeline,
        queuedWork: store.listQueuedWork(),
        activeStops: listActiveStops(store.listCapabilityStops()),
        classCounts: summarizeRecoveryClasses(timeline),
        liveRecoveryClaim: "NOT_RUN",
        externalEffects: "NONE",
        note: "Inspect host/provider outage and queued work. Stale observations are not active incidents. UNKNOWN_REMOTE_OUTCOME requires reconcile before retry.",
      };
    },
  };
}
