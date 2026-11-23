/**
 * Form→CRM continuous verify with cadence/heartbeat (T-US-039).
 *
 * Recurring canary slots record heartbeat history. Each executed slot runs
 * fixture form→CRM reconciliation; SUCCESS advances lastVerifiedSuccess;
 * STAGE_FAILURE names the failed/unverified stage; missed cadence slots are
 * COVERAGE_GAP (not SUCCESS). Synthetic leads stay commercially excluded.
 * Live Zoho stays NOT_WIRED. External effects: NONE.
 *
 * Distinct from T-X001 (host-sleep coalesce) and T-US-040 (thank-you ≠ CRM).
 */

import { LeadCaptureStage, type LeadCaptureStageValue } from "./lead-capture.js";
import {
  assertSyntheticExcludedFromCommercial,
  createSyntheticLead,
  ProbeVerdict,
  ReconciliationStatus,
  reconcileCanaryIntent,
  type CanaryIntent,
  type CanaryRemoteReceipt,
} from "./monitoring.js";
import { deriveMissedScheduledSlots } from "./host-sleep-monitoring.js";

export const FormCrmContinuousSlotOutcome = {
  SUCCESS: "SUCCESS",
  STAGE_FAILURE: "STAGE_FAILURE",
  COVERAGE_GAP: "COVERAGE_GAP",
} as const;

export type FormCrmContinuousSlotOutcomeValue =
  (typeof FormCrmContinuousSlotOutcome)[keyof typeof FormCrmContinuousSlotOutcome];

export type FormCrmHeartbeatRecord = {
  /** `${journeyId}:${scheduledAtIso}` */
  heartbeatId: string;
  scheduledAtIso: string;
  /** Wall clock when canary actually ran; null for open coverage gaps. */
  executedAtIso: string | null;
  outcome: FormCrmContinuousSlotOutcomeValue;
  correlationId: string | null;
  operationId: string | null;
  /** Named failed/unverified stage when outcome is STAGE_FAILURE. */
  failedStage: LeadCaptureStageValue | null;
  details: string[];
};

export type FormCrmContinuousVerifyState = {
  journeyId: string;
  writePathId: string;
  /** Cadence between scheduled form→CRM canary heartbeats. */
  intervalMs: number;
  /**
   * Last MATCHED SUCCESS execution wall-clock — for reporting only.
   * Never advanced by gaps or stage failures.
   */
  lastVerifiedSuccessAtIso: string | null;
  /**
   * Last MATCHED SUCCESS *scheduled* slot — cadence anchor.
   * Survives execution jitter so the next fixed slot stays on-interval.
   */
  lastVerifiedSuccessScheduledAtIso: string | null;
  heartbeats: FormCrmHeartbeatRecord[];
  /** Count of real canary executions (SUCCESS + STAGE_FAILURE). */
  canaryApplyCount: number;
  liveZohoWiring: "NOT_WIRED";
  externalEffects: "NONE";
  fixtureOnly: true;
};

export function formCrmHeartbeatId(
  journeyId: string,
  scheduledAtIso: string,
): string {
  return `${journeyId}:${scheduledAtIso}`;
}

export function createFormCrmContinuousVerifyState(input: {
  journeyId: string;
  writePathId: string;
  intervalMs: number;
}): FormCrmContinuousVerifyState {
  if (!input.journeyId.trim()) {
    throw new Error("journeyId is required");
  }
  if (!input.writePathId.trim()) {
    throw new Error("writePathId is required");
  }
  if (!Number.isFinite(input.intervalMs) || input.intervalMs <= 0) {
    throw new Error("intervalMs must be a positive finite number");
  }
  return {
    journeyId: input.journeyId,
    writePathId: input.writePathId,
    intervalMs: input.intervalMs,
    lastVerifiedSuccessAtIso: null,
    lastVerifiedSuccessScheduledAtIso: null,
    heartbeats: [],
    canaryApplyCount: 0,
    liveZohoWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
  };
}

function assertOnCadence(
  state: FormCrmContinuousVerifyState,
  scheduledAtIso: string,
): void {
  const anchor = state.lastVerifiedSuccessScheduledAtIso;
  if (!anchor) return;
  const delta = Date.parse(scheduledAtIso) - Date.parse(anchor);
  if (delta <= 0 || delta % state.intervalMs !== 0) {
    throw new Error(
      `Slot ${scheduledAtIso} is off-cadence for intervalMs=${state.intervalMs} (anchor=${anchor})`,
    );
  }
}

function assertNotDuplicateHeartbeat(
  state: FormCrmContinuousVerifyState,
  heartbeatId: string,
): void {
  if (state.heartbeats.some((h) => h.heartbeatId === heartbeatId)) {
    throw new Error(`Heartbeat already recorded: ${heartbeatId}`);
  }
}

function assertFreshCanaryIdentity(
  state: FormCrmContinuousVerifyState,
  intent: CanaryIntent,
): void {
  if (
    state.heartbeats.some(
      (h) =>
        h.correlationId === intent.correlationId ||
        h.operationId === intent.operationId,
    )
  ) {
    throw new Error(
      `Replayed canary identity refused: correlationId=${intent.correlationId} operationId=${intent.operationId}`,
    );
  }
}

function assertFixtureOnlyReceipts(
  receipts: readonly CanaryRemoteReceipt[],
): void {
  for (const r of receipts) {
    if (r.source !== "fixture_crm") {
      throw new Error(
        `Fixture-only continuous verify refused live receipt source=${r.source} receiptId=${r.receiptId}`,
      );
    }
  }
}

/**
 * Run a fixture form→CRM canary at a scheduled cadence slot.
 * MATCHED SUCCESS advances lastVerifiedSuccess; otherwise STAGE_FAILURE names
 * the failed stage (never invents CRM success).
 */
export function recordFormCrmCanaryHeartbeat(
  state: FormCrmContinuousVerifyState,
  input: {
    scheduledAtIso: string;
    executedAtIso: string;
    intent: CanaryIntent;
    receipts: readonly CanaryRemoteReceipt[];
    expectedModuleId: string;
    /** Stage to name when reconcile is not MATCHED SUCCESS. */
    failureStage?: LeadCaptureStageValue;
  },
): FormCrmContinuousVerifyState {
  const heartbeatId = formCrmHeartbeatId(state.journeyId, input.scheduledAtIso);
  assertNotDuplicateHeartbeat(state, heartbeatId);
  assertFreshCanaryIdentity(state, input.intent);
  assertFixtureOnlyReceipts(input.receipts);
  if (state.lastVerifiedSuccessScheduledAtIso) {
    assertOnCadence(state, input.scheduledAtIso);
  }

  const lead = createSyntheticLead({ correlationId: input.intent.correlationId });
  assertSyntheticExcludedFromCommercial(lead);

  if (input.intent.writePathId !== state.writePathId) {
    throw new Error(
      `Intent writePathId ${input.intent.writePathId} does not match journey ${state.writePathId}`,
    );
  }
  if (input.intent.synthetic !== true) {
    throw new Error("Form→CRM canary intent must be synthetic=true");
  }

  const recon = reconcileCanaryIntent({
    intent: input.intent,
    receipts: input.receipts,
    expectedModuleId: input.expectedModuleId,
  });

  if (
    recon.status === ReconciliationStatus.MATCHED &&
    recon.verdict === ProbeVerdict.SUCCESS
  ) {
    const hb: FormCrmHeartbeatRecord = {
      heartbeatId,
      scheduledAtIso: input.scheduledAtIso,
      executedAtIso: input.executedAtIso,
      outcome: FormCrmContinuousSlotOutcome.SUCCESS,
      correlationId: input.intent.correlationId,
      operationId: input.intent.operationId,
      failedStage: null,
      details: [
        `Form→CRM canary MATCHED SUCCESS correlation=${input.intent.correlationId}`,
        ...recon.details,
      ],
    };
    return {
      ...state,
      lastVerifiedSuccessAtIso: input.executedAtIso,
      lastVerifiedSuccessScheduledAtIso: input.scheduledAtIso,
      canaryApplyCount: state.canaryApplyCount + 1,
      heartbeats: [...state.heartbeats, hb],
    };
  }

  const failedStage = input.failureStage ?? LeadCaptureStage.CRM_WRITE;
  const hb: FormCrmHeartbeatRecord = {
    heartbeatId,
    scheduledAtIso: input.scheduledAtIso,
    executedAtIso: input.executedAtIso,
    outcome: FormCrmContinuousSlotOutcome.STAGE_FAILURE,
    correlationId: input.intent.correlationId,
    operationId: input.intent.operationId,
    failedStage,
    details: [
      `Form→CRM canary STAGE_FAILURE at ${failedStage} status=${recon.status} verdict=${recon.verdict}`,
      ...recon.details,
    ],
  };
  return {
    ...state,
    // lastVerifiedSuccess unchanged on failure
    canaryApplyCount: state.canaryApplyCount + 1,
    heartbeats: [...state.heartbeats, hb],
  };
}

/**
 * Mark scheduled cadence slots missed while host/coverage was offline.
 * Skips slots that already have an executed heartbeat (SUCCESS/STAGE_FAILURE)
 * so a prior failure does not throw or erase later genuine gaps.
 * Does not advance lastVerifiedSuccess or canaryApplyCount.
 */
export function markFormCrmCadenceCoverageGaps(
  state: FormCrmContinuousVerifyState,
  missedScheduledAtIsos: readonly string[],
): FormCrmContinuousVerifyState {
  const added: FormCrmHeartbeatRecord[] = [];
  for (const scheduledAtIso of missedScheduledAtIsos) {
    const heartbeatId = formCrmHeartbeatId(state.journeyId, scheduledAtIso);
    if (
      state.heartbeats.some((h) => h.heartbeatId === heartbeatId) ||
      added.some((h) => h.heartbeatId === heartbeatId)
    ) {
      // Already executed (SUCCESS/STAGE_FAILURE) or already marked — skip.
      continue;
    }
    if (state.lastVerifiedSuccessScheduledAtIso) {
      assertOnCadence(state, scheduledAtIso);
    }
    added.push({
      heartbeatId,
      scheduledAtIso,
      executedAtIso: null,
      outcome: FormCrmContinuousSlotOutcome.COVERAGE_GAP,
      correlationId: null,
      operationId: null,
      failedStage: null,
      details: [
        `Missed form→CRM cadence slot ${scheduledAtIso} — COVERAGE_GAP (not SUCCESS)`,
      ],
    });
  }
  return {
    ...state,
    heartbeats: [...state.heartbeats, ...added],
  };
}

/**
 * Derive missed cadence slots between last SUCCESS *scheduled* anchor and wake.
 * Prefer passing `lastVerifiedSuccessScheduledAtIso` so execution jitter does
 * not invent off-cadence gaps.
 */
export function deriveFormCrmMissedCadenceSlots(input: {
  lastSuccessAtIso: string;
  wakeAtIso: string;
  intervalMs: number;
}): string[] {
  return deriveMissedScheduledSlots(input);
}

export const FORM_CRM_CONTINUOUS_VERIFY_RELATED_CASE_IDS = [
  "T-US-039",
] as const;
