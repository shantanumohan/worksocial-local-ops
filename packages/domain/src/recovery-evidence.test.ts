import { describe, expect, it } from "vitest";
import { EffectState } from "./effect-state-machine.js";
import {
  DEFAULT_OBSERVATION_STALE_MS,
  FORBIDDEN_LIVE_RECOVERY_STATUS,
  OutagePlane,
  RecoveryObservationClass,
  classifyRecoveryObservation,
  createCapabilityStop,
  isCapabilityOutboundStopped,
  summarizeRecoveryClasses,
  validateLiveRecoveryClaim,
  type HealthTimelineEvent,
} from "./recovery-evidence.js";

describe("classifyRecoveryObservation", () => {
  const nowMs = Date.parse("2026-11-21T21:00:00.000Z");

  it("classifies confirmed host outage as ACTIVE_INCIDENT", () => {
    const result = classifyRecoveryObservation({
      nowMs,
      lastObservedAtIso: "2026-11-21T20:59:00.000Z",
      confirmedOutage: true,
      plane: OutagePlane.HOST,
    });
    expect(result.classification).toBe(
      RecoveryObservationClass.ACTIVE_INCIDENT,
    );
    expect(result.blocksOutboundResume).toBe(true);
    expect(result.blocksProviderRetry).toBe(false);
  });

  it("classifies confirmed provider outage as ACTIVE_INCIDENT with retry block", () => {
    const result = classifyRecoveryObservation({
      nowMs,
      lastObservedAtIso: "2026-11-21T20:59:30.000Z",
      confirmedOutage: true,
      plane: OutagePlane.PROVIDER,
    });
    expect(result.classification).toBe(
      RecoveryObservationClass.ACTIVE_INCIDENT,
    );
    expect(result.blocksProviderRetry).toBe(true);
  });

  it("does not promote aged heartbeat to ACTIVE_INCIDENT without confirmation", () => {
    const result = classifyRecoveryObservation({
      nowMs,
      lastObservedAtIso: "2026-11-21T20:00:00.000Z",
      confirmedOutage: false,
      plane: OutagePlane.HOST,
      staleAfterMs: DEFAULT_OBSERVATION_STALE_MS,
    });
    expect(result.classification).toBe(
      RecoveryObservationClass.STALE_OBSERVATION,
    );
    expect(result.blocksOutboundResume).toBe(false);
    expect(result.observationAgeMs).toBe(60 * 60 * 1000);
  });

  it("prefers UNKNOWN_REMOTE_OUTCOME over outage/stale labels", () => {
    const result = classifyRecoveryObservation({
      nowMs,
      lastObservedAtIso: "2026-11-21T20:59:50.000Z",
      confirmedOutage: true,
      plane: OutagePlane.PROVIDER,
      effectState: EffectState.UNKNOWN_REMOTE_OUTCOME,
    });
    expect(result.classification).toBe(
      RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME,
    );
    expect(result.blocksOutboundResume).toBe(true);
    expect(result.blocksProviderRetry).toBe(true);
  });

  it("treats missing observation as STALE_OBSERVATION", () => {
    const result = classifyRecoveryObservation({
      nowMs,
      lastObservedAtIso: null,
      confirmedOutage: false,
      plane: OutagePlane.NONE,
    });
    expect(result.classification).toBe(
      RecoveryObservationClass.STALE_OBSERVATION,
    );
  });
});

describe("capability-level stop", () => {
  it("stops only the named capability", () => {
    const stop = createCapabilityStop({
      stopId: "stop-1",
      capabilityId: "gbp_publish",
      plane: OutagePlane.PROVIDER,
      reason: "GBP provider timeout",
      stoppedAtIso: "2026-11-21T21:00:00.000Z",
    });
    expect(stop.unrelatedCapabilitiesAllowed).toBe(true);
    expect(isCapabilityOutboundStopped([stop], "gbp_publish")).toBe(true);
    expect(isCapabilityOutboundStopped([stop], "cms_publish")).toBe(false);
  });

  it("rejects NONE plane for capability stop", () => {
    expect(() =>
      createCapabilityStop({
        stopId: "stop-x",
        capabilityId: "cms_publish",
        plane: OutagePlane.NONE,
        reason: "bad",
        stoppedAtIso: "2026-11-21T21:00:00.000Z",
      }),
    ).toThrow(/host or provider/);
  });
});

describe("live recovery honesty", () => {
  it("rejects silent VERIFIED", () => {
    const check = validateLiveRecoveryClaim(FORBIDDEN_LIVE_RECOVERY_STATUS);
    expect(check.ok).toBe(false);
  });

  it("summarizes classes without inventing incidents", () => {
    const events: HealthTimelineEvent[] = [
      {
        eventId: "e1",
        recordedAtIso: "2026-11-21T21:00:00.000Z",
        plane: OutagePlane.HOST,
        classification: RecoveryObservationClass.STALE_OBSERVATION,
        summary: "stale",
        sourceKind: "fixture",
        relatedCapabilityIds: [],
        queuedWorkCount: 0,
        evidenceRefs: [],
      },
      {
        eventId: "e2",
        recordedAtIso: "2026-11-21T21:01:00.000Z",
        plane: OutagePlane.PROVIDER,
        classification: RecoveryObservationClass.UNKNOWN_REMOTE_OUTCOME,
        summary: "unknown",
        sourceKind: "effect_ledger",
        relatedCapabilityIds: ["gbp_publish"],
        queuedWorkCount: 1,
        evidenceRefs: ["fx-1"],
      },
    ];
    expect(summarizeRecoveryClasses(events)).toEqual({
      STALE_OBSERVATION: 1,
      ACTIVE_INCIDENT: 0,
      UNKNOWN_REMOTE_OUTCOME: 1,
    });
  });
});
