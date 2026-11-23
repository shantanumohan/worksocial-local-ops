import { describe, expect, it } from "vitest";
import { LeadCaptureStage } from "./lead-capture.js";
import {
  FormCrmContinuousSlotOutcome,
  createFormCrmContinuousVerifyState,
  deriveFormCrmMissedCadenceSlots,
  markFormCrmCadenceCoverageGaps,
  recordFormCrmCanaryHeartbeat,
} from "./form-crm-continuous-verify.js";
import type { CanaryIntent, CanaryRemoteReceipt } from "./monitoring.js";

const HOUR = 3_600_000;

function intent(correlationId: string, atIso: string): CanaryIntent {
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

function receipt(
  correlationId: string,
  atIso: string,
  source: "fixture_crm" | "live_zoho" = "fixture_crm",
): CanaryRemoteReceipt {
  return {
    receiptId: `rcpt-${correlationId}`,
    correlationId,
    moduleId: "Leads",
    recordId: `lead-${correlationId}`,
    synthetic: true,
    observedAtIso: atIso,
    source,
    fieldSnapshot: {
      Email: `canary+${correlationId}@worksocial.test.local`,
      Last_Name: `Canary ${correlationId}`,
      ws_correlation_id: correlationId,
      ws_synthetic: "true",
    },
  };
}

describe("form-crm continuous verify (T-US-039)", () => {
  it("records MATCHED SUCCESS heartbeats and advances lastVerified", () => {
    const t0 = "2026-11-22T12:00:00.000Z";
    let state = createFormCrmContinuousVerifyState({
      journeyId: "j-form-crm",
      writePathId: "wp-form-to-crm",
      intervalMs: HOUR,
    });
    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
      intent: intent("c1", t0),
      receipts: [receipt("c1", t0)],
      expectedModuleId: "Leads",
    });
    expect(state.heartbeats[0]?.outcome).toBe(
      FormCrmContinuousSlotOutcome.SUCCESS,
    );
    expect(state.lastVerifiedSuccessAtIso).toBe(t0);
    expect(state.lastVerifiedSuccessScheduledAtIso).toBe(t0);
    expect(state.canaryApplyCount).toBe(1);
    expect(state.externalEffects).toBe("NONE");
    expect(state.liveZohoWiring).toBe("NOT_WIRED");
  });

  it("anchors cadence to scheduled SUCCESS despite execution jitter", () => {
    const scheduled = "2026-11-22T12:00:00.000Z";
    const executedLate = "2026-11-22T12:00:05.000Z";
    const nextScheduled = "2026-11-22T13:00:00.000Z";
    let state = createFormCrmContinuousVerifyState({
      journeyId: "j-form-crm",
      writePathId: "wp-form-to-crm",
      intervalMs: HOUR,
    });
    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: scheduled,
      executedAtIso: executedLate,
      intent: intent("c-jitter", scheduled),
      receipts: [receipt("c-jitter", executedLate)],
      expectedModuleId: "Leads",
    });
    expect(state.lastVerifiedSuccessAtIso).toBe(executedLate);
    expect(state.lastVerifiedSuccessScheduledAtIso).toBe(scheduled);

    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: nextScheduled,
      executedAtIso: nextScheduled,
      intent: intent("c-next", nextScheduled),
      receipts: [receipt("c-next", nextScheduled)],
      expectedModuleId: "Leads",
    });
    expect(state.canaryApplyCount).toBe(2);
    expect(state.lastVerifiedSuccessScheduledAtIso).toBe(nextScheduled);
  });

  it("names CRM_WRITE STAGE_FAILURE when receipts are missing", () => {
    const t0 = "2026-11-22T12:00:00.000Z";
    let state = createFormCrmContinuousVerifyState({
      journeyId: "j-form-crm",
      writePathId: "wp-form-to-crm",
      intervalMs: HOUR,
    });
    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
      intent: intent("c-miss", t0),
      receipts: [],
      expectedModuleId: "Leads",
      failureStage: LeadCaptureStage.CRM_WRITE,
    });
    expect(state.heartbeats[0]?.outcome).toBe(
      FormCrmContinuousSlotOutcome.STAGE_FAILURE,
    );
    expect(state.heartbeats[0]?.failedStage).toBe(LeadCaptureStage.CRM_WRITE);
    expect(state.lastVerifiedSuccessAtIso).toBeNull();
    expect(state.canaryApplyCount).toBe(1);
  });

  it("marks honest COVERAGE_GAP for missed cadence without inventing SUCCESS", () => {
    const t0 = "2026-11-22T12:00:00.000Z";
    const wake = "2026-11-22T15:30:00.000Z";
    let state = createFormCrmContinuousVerifyState({
      journeyId: "j-form-crm",
      writePathId: "wp-form-to-crm",
      intervalMs: HOUR,
    });
    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
      intent: intent("c0", t0),
      receipts: [receipt("c0", t0)],
      expectedModuleId: "Leads",
    });
    const missed = deriveFormCrmMissedCadenceSlots({
      lastSuccessAtIso: state.lastVerifiedSuccessScheduledAtIso!,
      wakeAtIso: wake,
      intervalMs: HOUR,
    });
    expect(missed).toHaveLength(3);
    state = markFormCrmCadenceCoverageGaps(state, missed);
    const gaps = state.heartbeats.filter(
      (h) => h.outcome === FormCrmContinuousSlotOutcome.COVERAGE_GAP,
    );
    expect(gaps).toHaveLength(3);
    expect(gaps.every((g) => g.executedAtIso === null)).toBe(true);
    expect(state.lastVerifiedSuccessAtIso).toBe(t0);
    expect(state.canaryApplyCount).toBe(1);
  });

  it("skips already-executed STAGE_FAILURE slots when marking gaps", () => {
    const t0 = "2026-11-22T12:00:00.000Z";
    const tFail = "2026-11-22T13:00:00.000Z";
    const wake = "2026-11-22T15:30:00.000Z";
    let state = createFormCrmContinuousVerifyState({
      journeyId: "j-form-crm",
      writePathId: "wp-form-to-crm",
      intervalMs: HOUR,
    });
    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
      intent: intent("c-ok", t0),
      receipts: [receipt("c-ok", t0)],
      expectedModuleId: "Leads",
    });
    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: tFail,
      executedAtIso: tFail,
      intent: intent("c-fail", tFail),
      receipts: [],
      expectedModuleId: "Leads",
      failureStage: LeadCaptureStage.CRM_WRITE,
    });
    const missed = deriveFormCrmMissedCadenceSlots({
      lastSuccessAtIso: state.lastVerifiedSuccessScheduledAtIso!,
      wakeAtIso: wake,
      intervalMs: HOUR,
    });
    // Includes tFail (already executed) plus later gaps.
    expect(missed).toContain(tFail);
    state = markFormCrmCadenceCoverageGaps(state, missed);
    const gaps = state.heartbeats.filter(
      (h) => h.outcome === FormCrmContinuousSlotOutcome.COVERAGE_GAP,
    );
    expect(gaps.every((g) => g.scheduledAtIso !== tFail)).toBe(true);
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    expect(
      state.heartbeats.some(
        (h) =>
          h.scheduledAtIso === tFail &&
          h.outcome === FormCrmContinuousSlotOutcome.STAGE_FAILURE,
      ),
    ).toBe(true);
  });

  it("rejects replayed correlation/operation across cadence slots", () => {
    const t0 = "2026-11-22T12:00:00.000Z";
    const t1 = "2026-11-22T13:00:00.000Z";
    let state = createFormCrmContinuousVerifyState({
      journeyId: "j-form-crm",
      writePathId: "wp-form-to-crm",
      intervalMs: HOUR,
    });
    const reused = intent("c-reuse", t0);
    state = recordFormCrmCanaryHeartbeat(state, {
      scheduledAtIso: t0,
      executedAtIso: t0,
      intent: reused,
      receipts: [receipt("c-reuse", t0)],
      expectedModuleId: "Leads",
    });
    expect(() =>
      recordFormCrmCanaryHeartbeat(state, {
        scheduledAtIso: t1,
        executedAtIso: t1,
        intent: { ...reused, submittedAtIso: t1 },
        receipts: [receipt("c-reuse", t1)],
        expectedModuleId: "Leads",
      }),
    ).toThrow(/Replayed canary identity/);
  });

  it("rejects live_zoho receipts in fixture-only state", () => {
    const t0 = "2026-11-22T12:00:00.000Z";
    const state = createFormCrmContinuousVerifyState({
      journeyId: "j-form-crm",
      writePathId: "wp-form-to-crm",
      intervalMs: HOUR,
    });
    expect(() =>
      recordFormCrmCanaryHeartbeat(state, {
        scheduledAtIso: t0,
        executedAtIso: t0,
        intent: intent("c-live", t0),
        receipts: [receipt("c-live", t0, "live_zoho")],
        expectedModuleId: "Leads",
      }),
    ).toThrow(/refused live receipt/);
  });
});
