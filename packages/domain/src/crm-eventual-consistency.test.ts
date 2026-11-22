import { describe, expect, it } from "vitest";
import {
  CrmEmptyReadAction,
  DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
  counterfactualUnsafeCreateOnEmptyRead,
  decideCrmLeadRetryAfterEmptyRead,
  reconcileAfterConsistencyVisibility,
} from "./crm-eventual-consistency.js";
import {
  ProbeVerdict,
  ReconciliationStatus,
  type CanaryIntent,
  type CanaryRemoteReceipt,
} from "./monitoring.js";

const intent: CanaryIntent = {
  operationId: "op-ec-1",
  writePathId: "wp-form-to-crm",
  formId: "form-contact",
  correlationId: "corr-ec-1",
  payloadDigest: "digest-ec",
  synthetic: true,
  submittedAtIso: "2026-11-22T18:00:00.000Z",
};

const receipt: CanaryRemoteReceipt = {
  receiptId: "rcpt-ec-1",
  correlationId: "corr-ec-1",
  moduleId: "Leads",
  recordId: "lead-ec-1",
  synthetic: true,
  observedAtIso: "2026-11-22T18:00:05.000Z",
  source: "fixture_crm",
  fieldSnapshot: {
    Email: "canary+corr-ec-1@worksocial.test.local",
    Last_Name: "Canary corr-ec-1",
    ws_correlation_id: "corr-ec-1",
    ws_synthetic: "true",
  },
};

describe("crm eventual consistency (T-X023)", () => {
  it("bounds wait and refuses create on false not-found within window", () => {
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 5_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.BOUND_WAIT);
    expect(decision.createLead).toBe(false);
    expect(decision.withinConsistencyWindow).toBe(true);
  });

  it("escalates missing after window without authorizing create", () => {
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS + 1,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.ESCALATE_MISSING);
    expect(decision.createLead).toBe(false);
  });

  it("reconciles matched once receipt is visible and still refuses create", () => {
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 8_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [receipt],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.RECONCILE);
    expect(decision.createLead).toBe(false);

    const after = reconcileAfterConsistencyVisibility({
      intent,
      receipts: [receipt],
      expectedModuleId: "Leads",
    });
    expect(after.matched).toBe(true);
    expect(after.createLead).toBe(false);
    expect(after.reconcile.status).toBe(ReconciliationStatus.MATCHED);
    expect(after.reconcile.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(after.reconcile.blocksRetry).toBe(false);
  });

  it("documents counterfactual unsafe create as forbidden", () => {
    const cf = counterfactualUnsafeCreateOnEmptyRead({
      remoteReadEmpty: true,
      localWriteReceiptPresent: true,
    });
    expect(cf.wouldCreateLead).toBe(true);
    expect(cf.forbidden).toBe(true);
  });
});
