import { describe, expect, it } from "vitest";
import {
  CRM_CHATGPT_ADS_ACCESS,
  CRM_EVENTUAL_CONSISTENCY_RELATED_CASE_IDS,
  CRM_EXTERNAL_EFFECTS,
  CRM_FIXTURE_RECEIPT_SOURCE,
  CRM_LIVE_ZOHO_WIRING,
  CrmEmptyReadAction,
  DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
  classifyCrmEmptyReadSituation,
  counterfactualUnsafeCreateOnEmptyRead,
  crmReceiptVisibleForCorrelation,
  decideCrmLeadRetryAfterEmptyRead,
  isDurableCrmRecordId,
  isDurableCrmObservedAtIso,
  isDurableCrmModuleId,
  isFixtureCrmReceiptSource,
  isWithinCrmConsistencyWindow,
  reconcileAfterConsistencyVisibility,
  refuseUnsafeSecondCrmCreate,
  sanitizeCrmConsistencyTiming,
  sanitizeCrmWriteAttemptCount,
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

function expectHonesty(result: {
  createLead: false;
  liveZohoWiring: string;
  chatgptAdsAccess: string;
  externalEffects: string;
  liveProviderSuccessClaimed: boolean;
}): void {
  expect(result.createLead).toBe(false);
  expect(result.liveZohoWiring).toBe(CRM_LIVE_ZOHO_WIRING);
  expect(result.chatgptAdsAccess).toBe(CRM_CHATGPT_ADS_ACCESS);
  expect(result.externalEffects).toBe("NONE");
  expect(result.liveProviderSuccessClaimed).toBe(false);
}

describe("crm eventual consistency (T-X023)", () => {
  it("pins related case id and honesty constants", () => {
    expect(CRM_EVENTUAL_CONSISTENCY_RELATED_CASE_IDS).toEqual(["T-X023"]);
    expect(CRM_LIVE_ZOHO_WIRING).toBe("NOT_WIRED");
    expect(CRM_CHATGPT_ADS_ACCESS).toBe("ACCESS_BLOCKED");
    expect(CRM_EXTERNAL_EFFECTS).toBe("NONE");
    expect(CRM_FIXTURE_RECEIPT_SOURCE).toBe("fixture_crm");
    expect(isFixtureCrmReceiptSource(CRM_FIXTURE_RECEIPT_SOURCE)).toBe(true);
  });

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
    expect(decision.situation).toBe("local_empty_within_window");
    expect(decision.withinConsistencyWindow).toBe(true);
    expectHonesty(decision);
  });

  it("treats exact window edge as still within (inclusive)", () => {
    expect(
      isWithinCrmConsistencyWindow(
        DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
        DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      ),
    ).toBe(true);
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.BOUND_WAIT);
    expect(decision.situation).toBe("local_empty_within_window");
    expectHonesty(decision);
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
    expect(decision.situation).toBe("local_empty_after_window");
    expectHonesty(decision);
  });

  it("REFUSE_CREATE when local write present, remote not empty, no visible receipt", () => {
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 4_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);
  });

  it("classifies situations independently of decide", () => {
    expect(
      classifyCrmEmptyReadSituation({
        correlationId: "corr-ec-1",
        localWriteReceiptPresent: true,
        remoteReadEmpty: true,
        elapsedMs: 1,
        consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
        correlatedReceipts: [receipt],
      }),
    ).toBe("visible_receipt");
    expect(
      classifyCrmEmptyReadSituation({
        correlationId: "corr-ec-1",
        localWriteReceiptPresent: false,
        remoteReadEmpty: false,
        elapsedMs: 1,
        consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
        correlatedReceipts: [],
      }),
    ).toBe("no_local_nonempty");
  });

  it("ignores mismatched-correlation and null-recordId receipts", () => {
    const mismatched: CanaryRemoteReceipt = {
      ...receipt,
      receiptId: "rcpt-other",
      correlationId: "corr-other",
      recordId: "lead-other",
    };
    const nullId: CanaryRemoteReceipt = {
      ...receipt,
      receiptId: "rcpt-null",
      recordId: null,
    };
    expect(
      crmReceiptVisibleForCorrelation("corr-ec-1", [mismatched, nullId]),
    ).toBe(false);
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [mismatched, nullId],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.BOUND_WAIT);
    expectHonesty(decision);
  });

  it("no-local-write empty remote: BOUND_WAIT within, ESCALATE after", () => {
    const within = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: false,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
    });
    expect(within.action).toBe(CrmEmptyReadAction.BOUND_WAIT);
    expect(within.situation).toBe("no_local_empty_within_window");
    expectHonesty(within);

    const after = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: false,
      remoteReadEmpty: true,
      elapsedMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS + 5,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
    });
    expect(after.action).toBe(CrmEmptyReadAction.ESCALATE_MISSING);
    expect(after.situation).toBe("no_local_empty_after_window");
    expectHonesty(after);
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
    expect(decision.situation).toBe("visible_receipt");
    expectHonesty(decision);

    const after = reconcileAfterConsistencyVisibility({
      intent,
      receipts: [receipt],
      expectedModuleId: "Leads",
    });
    expect(after.matched).toBe(true);
    expectHonesty(after);
    expect(after.reconcile.status).toBe(ReconciliationStatus.MATCHED);
    expect(after.reconcile.verdict).toBe(ProbeVerdict.SUCCESS);
    expect(after.reconcile.blocksRetry).toBe(false);
  });

  it("documents counterfactual unsafe create as forbidden with honesty fields", () => {
    const cf = counterfactualUnsafeCreateOnEmptyRead({
      remoteReadEmpty: true,
      localWriteReceiptPresent: true,
    });
    expect(cf.wouldCreateLead).toBe(true);
    expect(cf.forbidden).toBe(true);
    expectHonesty(cf);
  });

  it("refuseUnsafeSecondCrmCreate never authorizes create", () => {
    const refused = refuseUnsafeSecondCrmCreate({
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      priorWriteAttemptCount: 1,
    });
    expect(refused.refused).toBe(true);
    expect(refused.writeAttemptCountUnchanged).toBe(true);
    expect(refused.priorWriteAttemptCount).toBe(1);
    expectHonesty(refused);
  });

  it("blank/whitespace correlationId never yields visible receipt or MATCHED", () => {
    expect(crmReceiptVisibleForCorrelation("   ", [receipt])).toBe(false);
    expect(crmReceiptVisibleForCorrelation("", [receipt])).toBe(false);
    const blankReceipt: CanaryRemoteReceipt = {
      ...receipt,
      correlationId: "  ",
      recordId: "lead-blank",
    };
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "   ",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [blankReceipt, receipt],
    });
    // Blank request corr never matches; still BOUND_WAIT with local write.
    expect(decision.action).toBe(CrmEmptyReadAction.BOUND_WAIT);
    expectHonesty(decision);

    const blankIntent: CanaryIntent = { ...intent, correlationId: "  " };
    const after = reconcileAfterConsistencyVisibility({
      intent: blankIntent,
      receipts: [receipt],
      expectedModuleId: "Leads",
    });
    expect(after.matched).toBe(false);
    expectHonesty(after);
  });

  it("empty/whitespace recordId is not durable and never RECONCILE", () => {
    expect(isDurableCrmRecordId(null)).toBe(false);
    expect(isDurableCrmRecordId(undefined)).toBe(false);
    expect(isDurableCrmRecordId("")).toBe(false);
    expect(isDurableCrmRecordId("   ")).toBe(false);
    expect(isDurableCrmRecordId("lead-ec-1")).toBe(true);

    const emptyId: CanaryRemoteReceipt = { ...receipt, recordId: "" };
    const wsId: CanaryRemoteReceipt = { ...receipt, recordId: "  " };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [emptyId, wsId])).toBe(
      false,
    );
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [emptyId, wsId],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);
  });

  it("non-finite elapsed/window sanitize to 0 (no silent within-window PASS)", () => {
    expect(
      sanitizeCrmConsistencyTiming({
        elapsedMs: Number.NaN,
        consistencyWindowMs: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({ elapsedMs: 0, consistencyWindowMs: 0 });
    expect(isWithinCrmConsistencyWindow(Number.NaN, 30_000)).toBe(true); // 0 <= 30000
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: Number.POSITIVE_INFINITY,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
    });
    // Infinity sanitizes to 0 → still within window → BOUND_WAIT (not invent create)
    expect(decision.action).toBe(CrmEmptyReadAction.BOUND_WAIT);
    expect(decision.createLead).toBe(false);
    expectHonesty(decision);
  });

  it("refuses live VERIFIED / live Zoho wire claims (LIVE_CLAIM_REFUSED)", () => {
    const verified = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
      claimLiveVerified: true,
    });
    expect(verified.action).toBe(CrmEmptyReadAction.LIVE_CLAIM_REFUSED);
    expectHonesty(verified);

    const wire = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [receipt],
      requestLiveZohoWire: true,
    });
    expect(wire.action).toBe(CrmEmptyReadAction.LIVE_CLAIM_REFUSED);
    expect(wire.createLead).toBe(false);
    expectHonesty(wire);
  });

  it("fixture_crm source with synthetic=false never visible (honesty gate)", () => {
    const fauxFixture: CanaryRemoteReceipt = {
      ...receipt,
      synthetic: false,
      source: "fixture_crm",
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [fauxFixture])).toBe(
      false,
    );
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [fauxFixture],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);
  });

  it("moduleId trim-matches expectedModuleId for visibility", () => {
    const paddedModule: CanaryRemoteReceipt = {
      ...receipt,
      moduleId: "  Leads  ",
    };
    expect(
      crmReceiptVisibleForCorrelation("corr-ec-1", [paddedModule], "Leads"),
    ).toBe(true);
    expect(
      crmReceiptVisibleForCorrelation(
        "corr-ec-1",
        [paddedModule],
        "  Leads  ",
      ),
    ).toBe(true);
  });

  it("requestChatgptAdsAccess ACCESS_BLOCKED stays soft-skip (not LIVE_CLAIM_REFUSED)", () => {
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 5_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
      requestChatgptAdsAccess: "ACCESS_BLOCKED",
    });
    expect(decision.action).toBe(CrmEmptyReadAction.BOUND_WAIT);
    expect(decision.chatgptAdsAccess).toBe(CRM_CHATGPT_ADS_ACCESS);
    expect(decision.action).not.toBe(CrmEmptyReadAction.LIVE_CLAIM_REFUSED);
    expectHonesty(decision);
  });

  it("non-synthetic receipt never counts as visible for fixture RECONCILE", () => {
    const liveLooking: CanaryRemoteReceipt = {
      ...receipt,
      synthetic: false,
      source: "live_zoho",
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [liveLooking])).toBe(
      false,
    );
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [liveLooking],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);
  });

  it("synthetic live_zoho source never counts as fixture visibility", () => {
    const liveSource: CanaryRemoteReceipt = {
      ...receipt,
      synthetic: true,
      source: "live_zoho",
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [liveSource])).toBe(
      false,
    );
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [liveSource],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);
  });

  it("module mismatch never authorizes RECONCILE", () => {
    expect(
      crmReceiptVisibleForCorrelation("corr-ec-1", [receipt], "Contacts"),
    ).toBe(false);
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [receipt],
      expectedModuleId: "Contacts",
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);

    const matched = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [receipt],
      expectedModuleId: "Leads",
    });
    expect(matched.action).toBe(CrmEmptyReadAction.RECONCILE);
    expectHonesty(matched);
  });

  it("refuses ChatGPT Ads ACCESS_ALLOWED (soft-skip trio)", () => {
    const ads = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
      requestChatgptAdsAccess: "ACCESS_ALLOWED",
    });
    expect(ads.action).toBe(CrmEmptyReadAction.LIVE_CLAIM_REFUSED);
    expect(ads.chatgptAdsAccess).toBe("ACCESS_BLOCKED");
    expectHonesty(ads);
  });

  it("refuses claimExternalEffects other than NONE", () => {
    const liveFx = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
      claimExternalEffects: "LIVE",
    });
    expect(liveFx.action).toBe(CrmEmptyReadAction.LIVE_CLAIM_REFUSED);
    expect(liveFx.externalEffects).toBe("NONE");
    expectHonesty(liveFx);
  });

  it("mismatched or missing ws_correlation_id / ws_synthetic never visible", () => {
    const badCorr: CanaryRemoteReceipt = {
      ...receipt,
      fieldSnapshot: {
        ...receipt.fieldSnapshot,
        ws_correlation_id: "other-corr",
      },
    };
    const badSynth: CanaryRemoteReceipt = {
      ...receipt,
      fieldSnapshot: {
        ...receipt.fieldSnapshot,
        ws_synthetic: "false",
      },
    };
    const missing: CanaryRemoteReceipt = {
      ...receipt,
      fieldSnapshot: {
        Email: receipt.fieldSnapshot.Email,
        Last_Name: receipt.fieldSnapshot.Last_Name,
      },
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [badCorr])).toBe(false);
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [badSynth])).toBe(
      false,
    );
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [missing])).toBe(
      false,
    );
    for (const r of [badCorr, badSynth, missing]) {
      const decision = decideCrmLeadRetryAfterEmptyRead({
        correlationId: "corr-ec-1",
        localWriteReceiptPresent: true,
        remoteReadEmpty: false,
        elapsedMs: 2_000,
        consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
        correlatedReceipts: [r],
      });
      expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
      expect(decision.situation).toBe("local_nonempty_no_visible");
      expectHonesty(decision);
    }
  });

  it("padded ws_correlation_id still matches after trim", () => {
    const padded: CanaryRemoteReceipt = {
      ...receipt,
      correlationId: "  corr-ec-1  ",
      fieldSnapshot: {
        ...receipt.fieldSnapshot,
        ws_correlation_id: "  corr-ec-1  ",
      },
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [padded])).toBe(true);
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "  corr-ec-1  ",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [padded],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.RECONCILE);
    expectHonesty(decision);
  });

  it("case-differing correlation never matches; ws_synthetic TRUE refused", () => {
    const caseFold: CanaryRemoteReceipt = {
      ...receipt,
      correlationId: "CORR-EC-1",
      fieldSnapshot: {
        ...receipt.fieldSnapshot,
        ws_correlation_id: "CORR-EC-1",
      },
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [caseFold])).toBe(
      false,
    );
    const upperSynth: CanaryRemoteReceipt = {
      ...receipt,
      fieldSnapshot: {
        ...receipt.fieldSnapshot,
        ws_synthetic: "TRUE",
      },
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [upperSynth])).toBe(
      false,
    );
  });

  it("refuses claimLiveProviderSuccess", () => {
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
      claimLiveProviderSuccess: true,
    });
    expect(decision.action).toBe(CrmEmptyReadAction.LIVE_CLAIM_REFUSED);
    expect(decision.liveProviderSuccessClaimed).toBe(false);
    expectHonesty(decision);
  });

  it("blank receiptId never counts as visible; write-attempt count sanitized", () => {
    const blankReceiptId: CanaryRemoteReceipt = {
      ...receipt,
      receiptId: "   ",
    };
    expect(
      crmReceiptVisibleForCorrelation("corr-ec-1", [blankReceiptId]),
    ).toBe(false);
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [blankReceiptId],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);

    expect(sanitizeCrmWriteAttemptCount(Number.NaN)).toBe(0);
    expect(sanitizeCrmWriteAttemptCount(Number.POSITIVE_INFINITY)).toBe(0);
    expect(sanitizeCrmWriteAttemptCount(-3.7)).toBe(0);
    expect(sanitizeCrmWriteAttemptCount(2.9)).toBe(2);
    const refused = refuseUnsafeSecondCrmCreate({
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      priorWriteAttemptCount: Number.NaN,
    });
    expect(refused.createLead).toBe(false);
    expect(refused.priorWriteAttemptCount).toBe(0);
    expectHonesty(refused);
  });

  it("non-fixture source and missing snapshot never visible", () => {
    expect(isFixtureCrmReceiptSource("  fixture_crm  ")).toBe(true);
    expect(isFixtureCrmReceiptSource("FIXTURE_CRM")).toBe(false);
    expect(isFixtureCrmReceiptSource("live_zoho")).toBe(false);
    const wrongSource: CanaryRemoteReceipt = {
      ...receipt,
      source: "live_zoho",
    };
    expect(
      crmReceiptVisibleForCorrelation("corr-ec-1", [wrongSource]),
    ).toBe(false);
    const noSnapshot = {
      ...receipt,
      fieldSnapshot: undefined as unknown as typeof receipt.fieldSnapshot,
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [noSnapshot])).toBe(
      false,
    );
    const paddedOk: CanaryRemoteReceipt = {
      ...receipt,
      source: "  fixture_crm  ",
    };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [paddedOk])).toBe(true);
  });

  it("blank moduleId never durable or visible", () => {
    expect(isDurableCrmModuleId("   ")).toBe(false);
    expect(isDurableCrmModuleId("Leads")).toBe(true);
    const blankModule: CanaryRemoteReceipt = { ...receipt, moduleId: "  " };
    expect(crmReceiptVisibleForCorrelation("corr-ec-1", [blankModule])).toBe(
      false,
    );
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [blankModule],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);
  });

  it("garbage observedAtIso never durable or visible", () => {
    expect(isDurableCrmObservedAtIso("  ")).toBe(false);
    expect(isDurableCrmObservedAtIso("not-an-iso-timestamp")).toBe(false);
    expect(isDurableCrmObservedAtIso(receipt.observedAtIso)).toBe(true);
    const garbageObserved: CanaryRemoteReceipt = {
      ...receipt,
      observedAtIso: "not-an-iso-timestamp",
    };
    expect(
      crmReceiptVisibleForCorrelation("corr-ec-1", [garbageObserved]),
    ).toBe(false);
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [garbageObserved],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);
  });

  it("blank observedAtIso never visible; claimSandboxVerified refused", () => {
    const blankObserved: CanaryRemoteReceipt = {
      ...receipt,
      observedAtIso: "  ",
    };
    expect(
      crmReceiptVisibleForCorrelation("corr-ec-1", [blankObserved]),
    ).toBe(false);
    const decision = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 2_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [blankObserved],
    });
    expect(decision.action).toBe(CrmEmptyReadAction.REFUSE_CREATE);
    expect(decision.situation).toBe("local_nonempty_no_visible");
    expectHonesty(decision);

    const sandbox = decideCrmLeadRetryAfterEmptyRead({
      correlationId: "corr-ec-1",
      localWriteReceiptPresent: true,
      remoteReadEmpty: true,
      elapsedMs: 1_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [],
      claimSandboxVerified: true,
    });
    expect(sandbox.action).toBe(CrmEmptyReadAction.LIVE_CLAIM_REFUSED);
    expect(sandbox.externalEffects).toBe(CRM_EXTERNAL_EFFECTS);
    expectHonesty(sandbox);
  });

  it("reconcileAfterConsistencyVisibility drops non-fixture-visible receipts", () => {
    const liveNoise: CanaryRemoteReceipt = {
      ...receipt,
      receiptId: "rcpt-live-noise",
      synthetic: true,
      source: "live_zoho",
    };
    const result = reconcileAfterConsistencyVisibility({
      intent,
      receipts: [liveNoise, receipt],
      expectedModuleId: "Leads",
    });
    expect(result.matched).toBe(true);
    expect(result.createLead).toBe(false);
    expectHonesty(result);

    const onlyNoise = reconcileAfterConsistencyVisibility({
      intent,
      receipts: [liveNoise],
      expectedModuleId: "Leads",
    });
    expect(onlyNoise.matched).toBe(false);
    expect(onlyNoise.createLead).toBe(false);
    expectHonesty(onlyNoise);
  });
});
