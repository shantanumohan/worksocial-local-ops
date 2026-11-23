/**
 * Fixture proof for T-US-039 — Form→CRM continuous verify / cadence/heartbeat.
 *
 * Recurring fixture canary heartbeats; MATCHED SUCCESS advances lastVerified;
 * missing CRM receipt → STAGE_FAILURE naming CRM_WRITE; missed cadence →
 * COVERAGE_GAP (not SUCCESS). External effects: NONE. Distinct from T-X001
 * and T-US-040. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  FormCrmContinuousSlotOutcome,
  LeadCaptureStage,
  SoakProofKind,
  createFormCrmContinuousVerifyState,
  createSyntheticLead,
  deriveFormCrmMissedCadenceSlots,
  markFormCrmCadenceCoverageGaps,
  recordFormCrmCanaryHeartbeat,
  type CanaryIntent,
  type CanaryRemoteReceipt,
  type SoakProofRecord,
} from "@worksocial/domain";

const MINUTE_MS = 60_000;

function fixtureIntent(
  correlationId: string,
  atIso: string,
): CanaryIntent {
  return {
    operationId: `op-${correlationId}`,
    writePathId: "wp-form-to-crm",
    formId: "form-contact",
    correlationId,
    payloadDigest: "fixture-digest",
    synthetic: true,
    submittedAtIso: atIso,
  };
}

function fixtureReceipt(
  correlationId: string,
  atIso: string,
  lead: { email: string; displayName: string },
): CanaryRemoteReceipt {
  return {
    receiptId: `rcpt-${correlationId}`,
    correlationId,
    moduleId: "Leads",
    recordId: `lead-${correlationId}`,
    synthetic: true,
    observedAtIso: atIso,
    source: "fixture_crm",
    fieldSnapshot: {
      Email: lead.email,
      Last_Name: lead.displayName,
      ws_correlation_id: correlationId,
      ws_synthetic: "true",
    },
  };
}

/**
 * Complete expected proof set for T-US-039 fixture ACCEPTED.
 */
export function proofFormCrmContinuousVerifyCadenceHeartbeat(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const journeyId = `j-form-crm-${randomUUID().slice(0, 8)}`;
  const intervalMs = MINUTE_MS;
  const t0 = nowIso;
  const wakeAt = new Date(Date.parse(t0) + 3.5 * MINUTE_MS).toISOString();
  const exercisedOperationIds: string[] = [];

  let state = createFormCrmContinuousVerifyState({
    journeyId,
    writePathId: "wp-form-to-crm",
    intervalMs,
  });

  // 1. On-cadence MATCHED SUCCESS heartbeat (with mild execution jitter).
  const corrOk = `corr-ok-${randomUUID().slice(0, 8)}`;
  const leadOk = createSyntheticLead({ correlationId: corrOk });
  const intentOk = fixtureIntent(corrOk, t0);
  const executedOk = new Date(Date.parse(t0) + 5_000).toISOString();
  exercisedOperationIds.push(intentOk.operationId);
  state = recordFormCrmCanaryHeartbeat(state, {
    scheduledAtIso: t0,
    executedAtIso: executedOk,
    intent: intentOk,
    receipts: [fixtureReceipt(corrOk, executedOk, leadOk)],
    expectedModuleId: "Leads",
  });
  if (
    state.heartbeats[0]?.outcome === FormCrmContinuousSlotOutcome.SUCCESS &&
    state.lastVerifiedSuccessAtIso === executedOk &&
    state.lastVerifiedSuccessScheduledAtIso === t0 &&
    state.canaryApplyCount === 1 &&
    state.heartbeats[0]?.failedStage === null
  ) {
    details.push(
      `Cadence heartbeat SUCCESS scheduled=${t0} executed=${executedOk}; cadence anchored to schedule; applyCount=1`,
    );
  } else {
    passed = false;
    details.push(`Initial SUCCESS unexpectedly ${JSON.stringify(state.heartbeats[0])}`);
  }

  // 2. STAGE_FAILURE names CRM_WRITE when receipts missing (does not invent success).
  const tFail = new Date(Date.parse(t0) + intervalMs).toISOString();
  const corrFail = `corr-fail-${randomUUID().slice(0, 8)}`;
  const intentFail = fixtureIntent(corrFail, tFail);
  exercisedOperationIds.push(intentFail.operationId);
  state = recordFormCrmCanaryHeartbeat(state, {
    scheduledAtIso: tFail,
    executedAtIso: tFail,
    intent: intentFail,
    receipts: [],
    expectedModuleId: "Leads",
    failureStage: LeadCaptureStage.CRM_WRITE,
  });
  const failHb = state.heartbeats[state.heartbeats.length - 1];
  if (
    failHb?.outcome === FormCrmContinuousSlotOutcome.STAGE_FAILURE &&
    failHb.failedStage === LeadCaptureStage.CRM_WRITE &&
    state.lastVerifiedSuccessScheduledAtIso === t0 &&
    state.canaryApplyCount === 2
  ) {
    details.push(
      "Missing CRM receipt → STAGE_FAILURE naming CRM_WRITE; lastVerified unchanged",
    );
  } else {
    passed = false;
    details.push(`STAGE_FAILURE unexpectedly ${JSON.stringify(failHb)}`);
  }

  // 2b. Gaps after SUCCESS+FAILURE skip the already-executed failure slot.
  const missedAfterFail = deriveFormCrmMissedCadenceSlots({
    lastSuccessAtIso: state.lastVerifiedSuccessScheduledAtIso!,
    wakeAtIso: wakeAt,
    intervalMs,
  });
  state = markFormCrmCadenceCoverageGaps(state, missedAfterFail);
  const gapsAfterFail = state.heartbeats.filter(
    (h) => h.outcome === FormCrmContinuousSlotOutcome.COVERAGE_GAP,
  );
  if (
    gapsAfterFail.every((g) => g.scheduledAtIso !== tFail) &&
    gapsAfterFail.length >= 1
  ) {
    details.push(
      `Coverage gaps skip executed STAGE_FAILURE slot; recorded ${gapsAfterFail.length} later COVERAGE_GAP(s)`,
    );
  } else {
    passed = false;
    details.push(
      `Gap-skip after failure unexpected gaps=${JSON.stringify(gapsAfterFail.map((g) => g.scheduledAtIso))}`,
    );
  }

  // 3. Fresh journey: SUCCESS then pure COVERAGE_GAP cadence history.
  let gapState = createFormCrmContinuousVerifyState({
    journeyId: `${journeyId}-gap`,
    writePathId: "wp-form-to-crm",
    intervalMs,
  });
  const corrGap = `corr-gap-${randomUUID().slice(0, 8)}`;
  const leadGap = createSyntheticLead({ correlationId: corrGap });
  const intentGap = fixtureIntent(corrGap, t0);
  exercisedOperationIds.push(intentGap.operationId);
  gapState = recordFormCrmCanaryHeartbeat(gapState, {
    scheduledAtIso: t0,
    executedAtIso: t0,
    intent: intentGap,
    receipts: [fixtureReceipt(corrGap, t0, leadGap)],
    expectedModuleId: "Leads",
  });
  const missed = deriveFormCrmMissedCadenceSlots({
    lastSuccessAtIso: gapState.lastVerifiedSuccessScheduledAtIso!,
    wakeAtIso: wakeAt,
    intervalMs,
  });
  if (missed.length === 3) {
    details.push(
      `Derived ${missed.length} missed form→CRM cadence slots (interval=${intervalMs}ms)`,
    );
  } else {
    passed = false;
    details.push(`Expected 3 missed slots, got ${missed.length}`);
  }
  gapState = markFormCrmCadenceCoverageGaps(gapState, missed);
  const gaps = gapState.heartbeats.filter(
    (h) => h.outcome === FormCrmContinuousSlotOutcome.COVERAGE_GAP,
  );
  if (
    gaps.length === 3 &&
    gaps.every((g) => g.executedAtIso === null) &&
    gapState.lastVerifiedSuccessScheduledAtIso === t0 &&
    gapState.canaryApplyCount === 1
  ) {
    details.push(
      `Missed cadence → ${gaps.length} COVERAGE_GAP heartbeats; not SUCCESS; applyCount unchanged`,
    );
  } else {
    passed = false;
    details.push(
      `Coverage gaps dishonest: gaps=${gaps.length} lastVerified=${gapState.lastVerifiedSuccessAtIso} applies=${gapState.canaryApplyCount}`,
    );
  }

  // 4. Positive control: recovered MATCHED SUCCESS after gaps.
  const recoverAt = new Date(Date.parse(t0) + 4 * intervalMs).toISOString();
  const corrRecover = `corr-rec-${randomUUID().slice(0, 8)}`;
  const leadRecover = createSyntheticLead({ correlationId: corrRecover });
  const intentRecover = fixtureIntent(corrRecover, recoverAt);
  exercisedOperationIds.push(intentRecover.operationId);
  gapState = recordFormCrmCanaryHeartbeat(gapState, {
    scheduledAtIso: recoverAt,
    executedAtIso: recoverAt,
    intent: intentRecover,
    receipts: [fixtureReceipt(corrRecover, recoverAt, leadRecover)],
    expectedModuleId: "Leads",
  });
  if (
    gapState.lastVerifiedSuccessAtIso === recoverAt &&
    gapState.lastVerifiedSuccessScheduledAtIso === recoverAt &&
    gapState.canaryApplyCount === 2 &&
    gapState.heartbeats.some(
      (h) =>
        h.outcome === FormCrmContinuousSlotOutcome.SUCCESS &&
        h.scheduledAtIso === recoverAt,
    )
  ) {
    details.push(
      `Post-gap on-cadence MATCHED SUCCESS at ${recoverAt}; heartbeat history retained`,
    );
  } else {
    passed = false;
    details.push(
      `Post-gap SUCCESS unexpected lastVerified=${gapState.lastVerifiedSuccessAtIso} applies=${gapState.canaryApplyCount}`,
    );
  }

  // 5. Honesty invariants.
  if (
    state.externalEffects === "NONE" &&
    state.liveZohoWiring === "NOT_WIRED" &&
    state.fixtureOnly === true &&
    gapState.externalEffects === "NONE"
  ) {
    details.push(
      "liveZohoWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
    );
  } else {
    passed = false;
    details.push("Honesty invariants violated");
  }

  details.push(
    `Exercised canary operations (${exercisedOperationIds.length}): ${exercisedOperationIds.join(",")}; canaryApplyCount=${state.canaryApplyCount + gapState.canaryApplyCount}`,
  );

  return {
    proofId: `proof-form-crm-continuous-${randomUUID()}`,
    kind: SoakProofKind.FORM_CRM_CONTINUOUS_VERIFY_CADENCE_HEARTBEAT,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: intentRecover.operationId,
    createdAtIso: recoverAt,
    fixtureOnly: true,
  };
}
