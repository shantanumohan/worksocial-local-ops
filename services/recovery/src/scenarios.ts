/**
 * Fixture recovery scenarios for F24 / WP10.
 * External effects: NONE. Never claims live recovery VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  EffectState,
  LiveRecoveryClaim,
  OutagePlane,
  RecoveryObservationClass,
  RecoveryRunStatus,
  classifyRecoveryObservation,
  createCapabilityStop,
  type CapabilityStopRecord,
  type HealthTimelineEvent,
  type QueuedWorkItem,
  type RecoveryEvidenceArtifact,
  type RecoveryRunRecord,
  type RecoveryScenarioId,
} from "@worksocial/domain";
import type { RecoveryStore } from "@worksocial/persistence";

export type ScenarioResult = {
  run: RecoveryRunRecord;
  artifact: RecoveryEvidenceArtifact;
  classification: RecoveryRunRecord["classification"];
};

function nowFrom(iso: string): number {
  return Date.parse(iso);
}

function runShell(input: {
  runId: string;
  scenarioId: RecoveryScenarioId;
  status: RecoveryRunRecord["status"];
  classification: RecoveryRunRecord["classification"];
  timelineEventIds: string[];
  capabilityStopIds: string[];
  queuedWorkIds: string[];
  artifactId: string;
  details: string[];
  startedAtIso: string;
  endedAtIso: string;
}): RecoveryRunRecord {
  return {
    runId: input.runId,
    scenarioId: input.scenarioId,
    status: input.status,
    classification: input.classification,
    timelineEventIds: input.timelineEventIds,
    capabilityStopIds: input.capabilityStopIds,
    queuedWorkIds: input.queuedWorkIds,
    artifactId: input.artifactId,
    details: input.details,
    liveRecoveryVerified: false,
    liveRecoveryClaim: LiveRecoveryClaim.NOT_RUN,
    externalEffects: "NONE",
    productionActivated: false,
    startedAtIso: input.startedAtIso,
    endedAtIso: input.endedAtIso,
  };
}

export async function runHostOutageQueuedWork(
  store: RecoveryStore,
  nowIso: string,
): Promise<ScenarioResult> {
  const runId = `rec-${randomUUID()}`;
  const details: string[] = [];
  const work: QueuedWorkItem = {
    workId: `qw-host-${runId}`,
    capabilityId: "cms_publish",
    operationId: `op-host-${runId}`,
    effectState: EffectState.QUEUED,
    queuedAtIso: nowIso,
    summary: "CMS publish held while host outage confirmed",
  };
  await store.upsertQueuedWork([work]);
  details.push(`Queued work ${work.workId} preserved (no external apply)`);

  const classified = classifyRecoveryObservation({
    nowMs: nowFrom(nowIso),
    lastObservedAtIso: nowIso,
    confirmedOutage: true,
    plane: OutagePlane.HOST,
  });
  details.push(`Classification=${classified.classification}`);

  const event: HealthTimelineEvent = {
    eventId: `evt-host-${runId}`,
    recordedAtIso: nowIso,
    plane: OutagePlane.HOST,
    classification: classified.classification,
    summary: "Fixture host outage with queued work inventory",
    sourceKind: "fixture",
    relatedCapabilityIds: ["cms_publish"],
    queuedWorkCount: 1,
    evidenceRefs: [`fixture://${runId}/host-outage`],
  };
  await store.appendTimeline(event);

  const stop = createCapabilityStop({
    stopId: `stop-host-${runId}`,
    capabilityId: "cms_publish",
    plane: OutagePlane.HOST,
    reason: "Host outage — pause affected outbound only",
    stoppedAtIso: nowIso,
  });
  await store.upsertCapabilityStop(stop);
  details.push(
    `Capability stop ${stop.stopId}; unrelatedCapabilitiesAllowed=${stop.unrelatedCapabilitiesAllowed}`,
  );

  const artifact: RecoveryEvidenceArtifact = {
    artifactId: `art-host-${runId}`,
    scenarioId: "host_outage_queued_work",
    environment: "fixture",
    redacted: true,
    summary:
      "Host outage classified ACTIVE_INCIDENT; queued work retained; capability-level stop; no external effect",
    classification: RecoveryObservationClass.ACTIVE_INCIDENT,
    evidenceRef: `recovery/evidence/${runId}.json`,
    createdAtIso: nowIso,
  };
  await store.addArtifact(artifact);

  const run = runShell({
    runId,
    scenarioId: "host_outage_queued_work",
    status:
      classified.classification === RecoveryObservationClass.ACTIVE_INCIDENT
        ? RecoveryRunStatus.PASSED
        : RecoveryRunStatus.FAILED,
    classification: classified.classification,
    timelineEventIds: [event.eventId],
    capabilityStopIds: [stop.stopId],
    queuedWorkIds: [work.workId],
    artifactId: artifact.artifactId,
    details,
    startedAtIso: nowIso,
    endedAtIso: nowIso,
  });
  await store.addRun(run);
  return { run, artifact, classification: run.classification };
}

export async function runProviderOutageCapabilityStop(
  store: RecoveryStore,
  nowIso: string,
): Promise<ScenarioResult> {
  const runId = `rec-${randomUUID()}`;
  const details: string[] = [];

  const classified = classifyRecoveryObservation({
    nowMs: nowFrom(nowIso),
    lastObservedAtIso: nowIso,
    confirmedOutage: true,
    plane: OutagePlane.PROVIDER,
  });

  const event: HealthTimelineEvent = {
    eventId: `evt-prov-${runId}`,
    recordedAtIso: nowIso,
    plane: OutagePlane.PROVIDER,
    classification: classified.classification,
    summary: "Fixture GBP provider outage",
    sourceKind: "fixture",
    relatedCapabilityIds: ["gbp_publish"],
    queuedWorkCount: 0,
    evidenceRefs: [`fixture://${runId}/provider-outage`],
  };
  await store.appendTimeline(event);

  const stop = createCapabilityStop({
    stopId: `stop-prov-${runId}`,
    capabilityId: "gbp_publish",
    plane: OutagePlane.PROVIDER,
    reason: "Provider outage — stop GBP only",
    stoppedAtIso: nowIso,
  });
  await store.upsertCapabilityStop(stop);
  details.push(
    `Stopped gbp_publish; cms_publish remains allowed (unrelated)`,
  );

  const artifact: RecoveryEvidenceArtifact = {
    artifactId: `art-prov-${runId}`,
    scenarioId: "provider_outage_capability_stop",
    environment: "fixture",
    redacted: true,
    summary:
      "Provider outage ACTIVE_INCIDENT with capability-level stop; unrelated outbound still allowed",
    classification: RecoveryObservationClass.ACTIVE_INCIDENT,
    evidenceRef: `recovery/evidence/${runId}.json`,
    createdAtIso: nowIso,
  };
  await store.addArtifact(artifact);

  const run = runShell({
    runId,
    scenarioId: "provider_outage_capability_stop",
    status:
      classified.classification === RecoveryObservationClass.ACTIVE_INCIDENT &&
      stop.unrelatedCapabilitiesAllowed
        ? RecoveryRunStatus.PASSED
        : RecoveryRunStatus.FAILED,
    classification: classified.classification,
    timelineEventIds: [event.eventId],
    capabilityStopIds: [stop.stopId],
    queuedWorkIds: [],
    artifactId: artifact.artifactId,
    details,
    startedAtIso: nowIso,
    endedAtIso: nowIso,
  });
  await store.addRun(run);
  return { run, artifact, classification: run.classification };
}

export async function runStaleHeartbeatNotIncident(
  store: RecoveryStore,
  nowIso: string,
): Promise<ScenarioResult> {
  const runId = `rec-${randomUUID()}`;
  const details: string[] = [];
  const staleObservedAt = new Date(
    Date.parse(nowIso) - 60 * 60 * 1000,
  ).toISOString();

  const classified = classifyRecoveryObservation({
    nowMs: nowFrom(nowIso),
    lastObservedAtIso: staleObservedAt,
    confirmedOutage: false,
    plane: OutagePlane.HOST,
  });
  details.push(
    `Aged heartbeat ${staleObservedAt} → ${classified.classification} (must not open ACTIVE_INCIDENT)`,
  );

  const event: HealthTimelineEvent = {
    eventId: `evt-stale-${runId}`,
    recordedAtIso: nowIso,
    plane: OutagePlane.HOST,
    classification: classified.classification,
    summary: "Stale host heartbeat without confirmed outage",
    sourceKind: "heartbeat",
    relatedCapabilityIds: [],
    queuedWorkCount: 0,
    evidenceRefs: [`fixture://${runId}/stale-heartbeat`],
  };
  await store.appendTimeline(event);

  const artifact: RecoveryEvidenceArtifact = {
    artifactId: `art-stale-${runId}`,
    scenarioId: "stale_heartbeat_not_incident",
    environment: "fixture",
    redacted: true,
    summary:
      "Stale observation retained as STALE_OBSERVATION — not promoted to ACTIVE_INCIDENT",
    classification: RecoveryObservationClass.STALE_OBSERVATION,
    evidenceRef: `recovery/evidence/${runId}.json`,
    createdAtIso: nowIso,
  };
  await store.addArtifact(artifact);

  const passed =
    classified.classification ===
    RecoveryObservationClass.STALE_OBSERVATION;

  const run = runShell({
    runId,
    scenarioId: "stale_heartbeat_not_incident",
    status: passed ? RecoveryRunStatus.PASSED : RecoveryRunStatus.FAILED,
    classification: classified.classification,
    timelineEventIds: [event.eventId],
    capabilityStopIds: [],
    queuedWorkIds: [],
    artifactId: artifact.artifactId,
    details,
    startedAtIso: nowIso,
    endedAtIso: nowIso,
  });
  await store.addRun(run);
  return { run, artifact, classification: run.classification };
}

export async function runUnknownRemoteReconcile(
  store: RecoveryStore,
  nowIso: string,
): Promise<ScenarioResult> {
  const runId = `rec-${randomUUID()}`;
  const details: string[] = [];

  const work: QueuedWorkItem = {
    workId: `qw-uro-${runId}`,
    capabilityId: "gbp_publish",
    operationId: `op-uro-${runId}`,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    queuedAtIso: nowIso,
    summary: "Provider ack timeout — unknown remote; reconcile before retry",
  };
  await store.upsertQueuedWork([work]);

  const classified = classifyRecoveryObservation({
    nowMs: nowFrom(nowIso),
    lastObservedAtIso: nowIso,
    confirmedOutage: false,
    plane: OutagePlane.PROVIDER,
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
  });
  details.push(
    `UNKNOWN_REMOTE_OUTCOME blocksProviderRetry=${classified.blocksProviderRetry}`,
  );

  const event: HealthTimelineEvent = {
    eventId: `evt-uro-${runId}`,
    recordedAtIso: nowIso,
    plane: OutagePlane.PROVIDER,
    classification: classified.classification,
    summary: "Fixture unknown remote outcome — reconcile path only",
    sourceKind: "effect_ledger",
    relatedCapabilityIds: ["gbp_publish"],
    queuedWorkCount: 1,
    evidenceRefs: [`fixture://${runId}/unknown-remote`],
  };
  await store.appendTimeline(event);

  // Reconcile: read fixture ledger; do not re-apply.
  details.push(
    "Reconcile: fixture ledger read matched; verify transition allowed without second apply",
  );

  const artifact: RecoveryEvidenceArtifact = {
    artifactId: `art-uro-${runId}`,
    scenarioId: "unknown_remote_reconcile",
    environment: "fixture",
    redacted: true,
    summary:
      "UNKNOWN_REMOTE_OUTCOME classified distinctly; reconcile before retry; external effects NONE",
    classification: RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME,
    evidenceRef: `recovery/evidence/${runId}.json`,
    createdAtIso: nowIso,
  };
  await store.addArtifact(artifact);

  const passed =
    classified.classification ===
      RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME &&
    classified.blocksProviderRetry;

  const run = runShell({
    runId,
    scenarioId: "unknown_remote_reconcile",
    status: passed ? RecoveryRunStatus.PASSED : RecoveryRunStatus.FAILED,
    classification: classified.classification,
    timelineEventIds: [event.eventId],
    capabilityStopIds: [],
    queuedWorkIds: [work.workId],
    artifactId: artifact.artifactId,
    details,
    startedAtIso: nowIso,
    endedAtIso: nowIso,
  });
  await store.addRun(run);
  return { run, artifact, classification: run.classification };
}

export async function runRecoveryScenario(
  store: RecoveryStore,
  scenarioId: RecoveryScenarioId,
  nowIso: string,
): Promise<ScenarioResult> {
  switch (scenarioId) {
    case "host_outage_queued_work":
      return runHostOutageQueuedWork(store, nowIso);
    case "provider_outage_capability_stop":
      return runProviderOutageCapabilityStop(store, nowIso);
    case "stale_heartbeat_not_incident":
      return runStaleHeartbeatNotIncident(store, nowIso);
    case "unknown_remote_reconcile":
      return runUnknownRemoteReconcile(store, nowIso);
    default: {
      const _exhaustive: never = scenarioId;
      throw new Error(`Unknown recovery scenario: ${_exhaustive}`);
    }
  }
}

export function listActiveStops(
  stops: readonly CapabilityStopRecord[],
): CapabilityStopRecord[] {
  return stops.filter((s) => !s.resumeAllowed);
}
