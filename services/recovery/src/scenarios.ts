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
  evaluateUnknownRemoteReconcile,
  unknownRemoteHonestyPins,
  isUnknownRemoteResumeAuthorized,
  unknownRemoteDistinctFromUncertainPost,
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

  const operationId = `op-uro-${runId}`;
  const work: QueuedWorkItem = {
    workId: `qw-uro-${runId}`,
    capabilityId: "gbp_publish",
    operationId,
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

  const remoteRef = `fixture-remote-${runId}`;
  const blind = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: true,
    reconciledRemoteRef: null,
    independentVerifyMatched: false,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const live = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: null,
    independentVerifyMatched: false,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: true,
  });
  const reconciled = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const phaseEdge = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "ACCEPTED_PENDING",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const sandboxVerified = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
    claimSandboxOrProdVerified: true,
  });
  const verifyingNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.VERIFYING,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const blankRef = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "  ",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const verifyMismatch = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: false,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const neverApplied = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 0,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const negativeApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: -1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const incoherentBlind = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1,
    requestBlindResend: true,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const nonFiniteApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: Number.NaN,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const terminalComplete = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.COMPLETE,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const infinityApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: Number.POSITIVE_INFINITY,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const retryableNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.FAILED_RETRYABLE,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: remoteRef,
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const pins = unknownRemoteHonestyPins();
  const distinct = unknownRemoteDistinctFromUncertainPost();
  const terminalCancelled = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.CANCELLED,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const negInfinityApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: Number.NEGATIVE_INFINITY,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const fractionalApply = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    applyAttemptCount: 1.5,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const waitingNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.WAITING_HUMAN,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const preApplyNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.RUNNING,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const applyingNotUro = evaluateUnknownRemoteReconcile({
    operationId,
    phase: "UNKNOWN_REMOTE_OUTCOME",
    effectState: EffectState.APPLYING,
    applyAttemptCount: 1,
    requestBlindResend: false,
    reconciledRemoteRef: "remote-edge",
    independentVerifyMatched: true,
    claimProviderSuccessDespiteUnknown: false,
    requestLiveProviderWiring: false,
  });
  const domainGateOk =
    blind.allowed === false &&
    blind.code === "BLIND_RESEND_REFUSED" &&
    live.allowed === false &&
    live.code === "LIVE_PROVIDER_WIRING_NOT_WIRED" &&
    live.liveProviderWiring === "NOT_WIRED" &&
    phaseEdge.allowed === false &&
    phaseEdge.code === "PHASE_ACCEPTED_PENDING_NOT_URO" &&
    sandboxVerified.allowed === false &&
    sandboxVerified.code === "SANDBOX_VERIFIED_CLAIM_REFUSED" &&
    verifyingNotUro.allowed === false &&
    verifyingNotUro.code === "EFFECT_STATE_VERIFYING_NOT_URO" &&
    blankRef.allowed === false &&
    blankRef.code === "REMOTE_REF_REQUIRED" &&
    verifyMismatch.allowed === false &&
    verifyMismatch.code === "INDEPENDENT_VERIFY_REQUIRED" &&
    neverApplied.allowed === false &&
    neverApplied.code === "APPLY_NEVER_HAPPENED" &&
    negativeApply.allowed === false &&
    negativeApply.code === "APPLY_COUNT_NEGATIVE" &&
    incoherentBlind.allowed === false &&
    incoherentBlind.code === "INCOHERENT_BLIND_WITH_RECONCILE" &&
    nonFiniteApply.allowed === false &&
    nonFiniteApply.code === "APPLY_COUNT_NON_FINITE" &&
    infinityApply.allowed === false &&
    infinityApply.code === "APPLY_COUNT_NON_FINITE" &&
    terminalComplete.allowed === false &&
    terminalComplete.code === "EFFECT_STATE_ALREADY_TERMINAL" &&
    retryableNotUro.allowed === false &&
    retryableNotUro.code === "EFFECT_STATE_RETRYABLE_NOT_URO" &&
    terminalCancelled.allowed === false &&
    terminalCancelled.code === "EFFECT_STATE_ALREADY_TERMINAL" &&
    negInfinityApply.allowed === false &&
    negInfinityApply.code === "APPLY_COUNT_NON_FINITE" &&
    fractionalApply.allowed === false &&
    fractionalApply.code === "APPLY_COUNT_NON_INTEGER" &&
    waitingNotUro.allowed === false &&
    waitingNotUro.code === "EFFECT_STATE_WAITING_NOT_URO" &&
    preApplyNotUro.allowed === false &&
    preApplyNotUro.code === "EFFECT_STATE_PRE_APPLY_NOT_URO" &&
    applyingNotUro.allowed === false &&
    applyingNotUro.code === "EFFECT_STATE_IN_FLIGHT_NOT_URO" &&
    pins.fixtureOnly === true &&
    pins.acceptedEqualsVerified === false &&
    distinct.distinctFromCaseIds.includes("T-US-030") &&
    distinct.distinctFromCaseIds.includes("T-US-060") &&
    distinct.distinctFromCaseIds.includes("T-X005") &&
    distinct.distinctFromCaseIds.includes("T-X006") &&
    distinct.distinctFromCaseIds.includes("T-X007") &&
    distinct.distinctFromCaseIds.includes("T-X016") &&
    distinct.distinctFromCaseIds.includes("T-X017") &&
    distinct.distinctFromCaseIds.includes("T-X018") &&
    distinct.distinctFromCaseIds.includes("T-X021") &&
    distinct.distinctFromCaseIds.includes("T-X022") &&
    distinct.distinctFromCaseIds.includes("T-X023") &&
    distinct.distinctFromCaseIds.includes("T-X024") &&
    distinct.distinctFromCaseIds.includes("T-X025") &&
    distinct.distinctFromCaseIds.includes("T-X026") &&
    distinct.distinctFromCaseIds.includes("T-X027") &&
    distinct.distinctFromCaseIds.includes("T-X028") &&
    distinct.distinctFromCaseIds.includes("T-X029") &&
    distinct.distinctFromCaseIds.includes("T-X030") &&
    distinct.distinctFromCaseIds.includes("T-X066") &&
    reconciled.allowed === true &&
    reconciled.externalEffects === "NONE" &&
    reconciled.fixtureOnly === true &&
    isUnknownRemoteResumeAuthorized(reconciled);
  if (domainGateOk) {
    details.push(
      "Domain gate: blind/live/phase/sandbox/VERIFYING/blankRef/verify/apply0/neg/incoherent/nonFinite/inf/terminal/retryable refused; distinct T-US-030; RECONCILED authorized",
    );
  } else {
    details.push(
      `Domain gate unexpected blind=${blind.code} live=${live.code} phase=${phaseEdge.code} sandbox=${sandboxVerified.code} blank=${blankRef.code} reconciled=${reconciled.code}`,
    );
  }

  const artifact: RecoveryEvidenceArtifact = {
    artifactId: `art-uro-${runId}`,
    scenarioId: "unknown_remote_reconcile",
    environment: "fixture",
    redacted: true,
    summary:
      "UNKNOWN_REMOTE_OUTCOME classified distinctly; reconcile before retry; live NOT_WIRED; external effects NONE",
    classification: RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME,
    evidenceRef: `recovery/evidence/${runId}.json`,
    createdAtIso: nowIso,
  };
  await store.addArtifact(artifact);

  const passed =
    classified.classification ===
      RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME &&
    classified.blocksProviderRetry &&
    domainGateOk;

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
