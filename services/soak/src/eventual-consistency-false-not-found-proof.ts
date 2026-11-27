/**
 * Fixture proof for T-X023 — eventual consistency false not-found.
 *
 * Instrumented Zoho CRM fixture: write with visibility lag → getByCorrelation
 * empty (false not-found) → BOUND_WAIT createLead=false; writeAttemptCount
 * stays 1; after lag clears, reconcile MATCHED. External effects: NONE.
 * Live Zoho NOT_WIRED. ChatGPT Ads ACCESS_BLOCKED.
 * Never invents live VERIFIED (ACCEPTED ≠ VERIFIED).
 */

import { randomUUID } from "node:crypto";
import {
  CRM_CHATGPT_ADS_ACCESS,
  CRM_LIVE_ZOHO_WIRING,
  CrmEmptyReadAction,
  DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
  ProbeVerdict,
  ReconciliationStatus,
  SoakProofKind,
  counterfactualUnsafeCreateOnEmptyRead,
  decideCrmLeadRetryAfterEmptyRead,
  reconcileAfterConsistencyVisibility,
  refuseUnsafeSecondCrmCreate,
  type CanaryIntent,
  type SoakProofRecord,
} from "@worksocial/domain";
import { createZohoCrmFixtureAdapter } from "@worksocial/provider-adapters";

/**
 * Complete expected proof set for T-X023 fixture ACCEPTED.
 */
export function proofEventualConsistencyFalseNotFound(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const correlationId = `corr-x023-${randomUUID().slice(0, 8)}`;
  const crm = createZohoCrmFixtureAdapter();

  const intent: CanaryIntent = {
    operationId: `op-x023-${randomUUID().slice(0, 8)}`,
    writePathId: "wp-form-to-crm",
    formId: "form-contact",
    correlationId,
    payloadDigest: "fixture-digest-x023",
    synthetic: true,
    submittedAtIso: nowIso,
  };

  const fieldSnapshot = {
    Email: `canary+${correlationId}@worksocial.test.local`,
    Last_Name: `Canary ${correlationId}`,
    ws_correlation_id: correlationId,
    ws_synthetic: "true",
  };

  // 1. Instrumented fixture write with EC lag on subsequent reads.
  const writeReceipt = crm.writeSyntheticLead({
    correlationId,
    nowIso,
    fieldSnapshot,
    visibilityLagReads: 2,
  });
  if (
    writeReceipt &&
    writeReceipt.correlationId === correlationId &&
    writeReceipt.recordId &&
    crm.writeAttemptCount() === 1 &&
    crm.listAll().length === 1 &&
    crm.visibilityLagRemaining(correlationId) === 2
  ) {
    details.push(
      "Fixture CRM write → ledger size 1; writeAttemptCount=1; lag reads scheduled",
    );
  } else {
    passed = false;
    details.push(
      `Local write unexpectedly receipt=${JSON.stringify(writeReceipt)} attempts=${crm.writeAttemptCount()} ledger=${crm.listAll().length} lag=${crm.visibilityLagRemaining(correlationId)}`,
    );
  }

  // 2. Lagging read → empty (false not-found) while local write exists.
  const emptyRead = crm.getByCorrelation(correlationId);
  const emptyDecision = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: writeReceipt !== null,
    remoteReadEmpty: emptyRead === null,
    elapsedMs: 2_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
  });
  if (
    emptyRead === null &&
    emptyDecision.action === CrmEmptyReadAction.BOUND_WAIT &&
    emptyDecision.situation === "local_empty_within_window" &&
    emptyDecision.createLead === false &&
    emptyDecision.liveZohoWiring === CRM_LIVE_ZOHO_WIRING &&
    emptyDecision.chatgptAdsAccess === CRM_CHATGPT_ADS_ACCESS &&
    emptyDecision.externalEffects === "NONE" &&
    emptyDecision.liveProviderSuccessClaimed === false &&
    crm.visibilityLagRemaining(correlationId) === 1
  ) {
    details.push(
      "getByCorrelation empty under lag → BOUND_WAIT createLead=false (false not-found)",
    );
  } else {
    passed = false;
    details.push(
      `Empty-read path unexpectedly emptyRead=${JSON.stringify(emptyRead)} decision=${JSON.stringify(emptyDecision)} lag=${crm.visibilityLagRemaining(correlationId)}`,
    );
  }

  // 3. Counterfactual empty→create forbidden; explicit refuse second create.
  const counterfactual = counterfactualUnsafeCreateOnEmptyRead({
    remoteReadEmpty: true,
    localWriteReceiptPresent: true,
  });
  const refuseSecond = refuseUnsafeSecondCrmCreate({
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    priorWriteAttemptCount: crm.writeAttemptCount(),
  });
  if (
    counterfactual.wouldCreateLead === true &&
    counterfactual.forbidden === true &&
    counterfactual.createLead === false &&
    counterfactual.chatgptAdsAccess === CRM_CHATGPT_ADS_ACCESS &&
    counterfactual.externalEffects === "NONE" &&
    emptyDecision.createLead === false &&
    refuseSecond.createLead === false &&
    refuseSecond.refused === true
  ) {
    details.push("Counterfactual empty→create documented as forbidden");
  } else {
    passed = false;
    details.push(
      `Counterfactual/refuse unexpectedly cf=${JSON.stringify(counterfactual)} refuse=${JSON.stringify(refuseSecond)}`,
    );
  }

  if (crm.writeAttemptCount() !== 1 || crm.listAll().length !== 1) {
    passed = false;
    details.push(
      `Unsafe retry risk: writeAttemptCount=${crm.writeAttemptCount()} ledger=${crm.listAll().length}`,
    );
  } else {
    details.push("No second writeSyntheticLead; writeAttemptCount remains 1");
  }

  // 4. Drain remaining lag, then reconcile MATCHED from fixture read-back.
  const secondEmpty = crm.getByCorrelation(correlationId);
  const lagAfterSecond = crm.visibilityLagRemaining(correlationId);
  const visibleEntry = crm.getByCorrelation(correlationId);
  if (
    secondEmpty !== null ||
    lagAfterSecond !== 0 ||
    !visibleEntry?.receipt?.recordId
  ) {
    passed = false;
    details.push(
      `Expected lag drain then visible receipt; secondEmpty=${JSON.stringify(secondEmpty)} lag=${lagAfterSecond} visible=${JSON.stringify(visibleEntry)}`,
    );
  } else {
    const visibleDecision = decideCrmLeadRetryAfterEmptyRead({
      correlationId,
      localWriteReceiptPresent: true,
      remoteReadEmpty: false,
      elapsedMs: 8_000,
      consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
      correlatedReceipts: [visibleEntry.receipt],
    });
    const after = reconcileAfterConsistencyVisibility({
      intent,
      receipts: [visibleEntry.receipt],
      expectedModuleId: "Leads",
    });
    if (
      visibleDecision.action === CrmEmptyReadAction.RECONCILE &&
      visibleDecision.situation === "visible_receipt" &&
      visibleDecision.createLead === false &&
      visibleDecision.liveZohoWiring === CRM_LIVE_ZOHO_WIRING &&
      visibleDecision.chatgptAdsAccess === CRM_CHATGPT_ADS_ACCESS &&
      visibleDecision.externalEffects === "NONE" &&
      visibleDecision.liveProviderSuccessClaimed === false &&
      after.matched === true &&
      after.createLead === false &&
      after.chatgptAdsAccess === CRM_CHATGPT_ADS_ACCESS &&
      after.externalEffects === "NONE" &&
      after.liveProviderSuccessClaimed === false &&
      after.reconcile.status === ReconciliationStatus.MATCHED &&
      after.reconcile.verdict === ProbeVerdict.SUCCESS &&
      after.reconcile.blocksRetry === false &&
      crm.writeAttemptCount() === 1
    ) {
      details.push(
        "After visibility → fixture read-back RECONCILE MATCHED; createLead=false; writeAttemptCount=1",
      );
    } else {
      passed = false;
      details.push(
        `Post-visibility unexpectedly decision=${JSON.stringify(visibleDecision)} reconcile=${JSON.stringify(after)} attempts=${crm.writeAttemptCount()}`,
      );
    }
  }

  // 5. Empty-string recordId must not count as visible (edge honesty).
  const emptyIdDecision = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-empty-id",
        correlationId,
        moduleId: "Leads",
        recordId: "",
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
  });
  if (
    emptyIdDecision.action === CrmEmptyReadAction.REFUSE_CREATE &&
    emptyIdDecision.situation === "local_nonempty_no_visible" &&
    emptyIdDecision.createLead === false &&
    emptyIdDecision.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "Empty-string recordId ignored — REFUSE_CREATE (not durable visibility)",
    );
  } else {
    passed = false;
    details.push(
      `Empty recordId unexpectedly ${JSON.stringify(emptyIdDecision)}`,
    );
  }

  // 6. Live/Ads/effects claim refuse + snapshot/source gates never RECONCILE.
  const liveClaim = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    elapsedMs: 1_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
    claimLiveVerified: true,
  });
  const adsClaim = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    elapsedMs: 1_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
    requestChatgptAdsAccess: "ACCESS_ALLOWED",
  });
  const adsBlockedOk = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    elapsedMs: 2_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
    requestChatgptAdsAccess: "ACCESS_BLOCKED",
  });
  const effectsClaim = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    elapsedMs: 1_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
    claimExternalEffects: "LIVE",
  });
  const liveSuccessClaim = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    elapsedMs: 1_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
    claimLiveProviderSuccess: true,
  });
  const sandboxClaim = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    elapsedMs: 1_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
    claimSandboxVerified: true,
  });
  const garbageObserved = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-garbage-obs",
        correlationId,
        moduleId: "Leads",
        recordId: "lead-garbage-obs",
        synthetic: true,
        observedAtIso: "not-parseable-iso",
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
  });
  const blankObserved = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-blank-obs",
        correlationId,
        moduleId: "Leads",
        recordId: "lead-blank-obs",
        synthetic: true,
        observedAtIso: "   ",
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
  });
  const badSnapshot = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-bad-snap",
        correlationId,
        moduleId: "Leads",
        recordId: "lead-bad-snap",
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot: {
          ...fieldSnapshot,
          ws_correlation_id: "other-corr",
          ws_synthetic: "false",
        },
      },
    ],
  });
  const blankReceiptId = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "   ",
        correlationId,
        moduleId: "Leads",
        recordId: "lead-blank-rcpt",
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
  });
  const fauxSyntheticFlag = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-faux-synth",
        correlationId,
        moduleId: "Leads",
        recordId: "lead-faux-synth",
        synthetic: false,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
  });
  const wrongSource = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-wrong-src",
        correlationId,
        moduleId: "Leads",
        recordId: "lead-wrong-src",
        synthetic: true,
        observedAtIso: nowIso,
        source: "live_zoho",
        fieldSnapshot,
      },
    ],
  });
  const blankModule = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-blank-mod",
        correlationId,
        moduleId: "   ",
        recordId: "lead-blank-mod",
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
  });
  const moduleTrimOk = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-mod-trim",
        correlationId,
        moduleId: "  Leads  ",
        recordId: "lead-mod-trim",
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
    expectedModuleId: "Leads",
  });
  const moduleMismatch = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: false,
    elapsedMs: 3_000,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [
      {
        receiptId: "rcpt-mod-mismatch",
        correlationId,
        moduleId: "Leads",
        recordId: "lead-mod-mismatch",
        synthetic: true,
        observedAtIso: nowIso,
        source: "fixture_crm",
        fieldSnapshot,
      },
    ],
    expectedModuleId: "Contacts",
  });
  if (
    liveClaim.action === CrmEmptyReadAction.LIVE_CLAIM_REFUSED &&
    liveClaim.createLead === false &&
    liveClaim.liveProviderSuccessClaimed === false &&
    adsClaim.action === CrmEmptyReadAction.LIVE_CLAIM_REFUSED &&
    adsClaim.chatgptAdsAccess === "ACCESS_BLOCKED" &&
    adsBlockedOk.action === CrmEmptyReadAction.BOUND_WAIT &&
    adsBlockedOk.chatgptAdsAccess === CRM_CHATGPT_ADS_ACCESS &&
    effectsClaim.action === CrmEmptyReadAction.LIVE_CLAIM_REFUSED &&
    effectsClaim.externalEffects === "NONE" &&
    liveSuccessClaim.action === CrmEmptyReadAction.LIVE_CLAIM_REFUSED &&
    liveSuccessClaim.liveProviderSuccessClaimed === false &&
    sandboxClaim.action === CrmEmptyReadAction.LIVE_CLAIM_REFUSED &&
    sandboxClaim.createLead === false &&
    garbageObserved.action === CrmEmptyReadAction.REFUSE_CREATE &&
    garbageObserved.situation === "local_nonempty_no_visible" &&
    blankObserved.action === CrmEmptyReadAction.REFUSE_CREATE &&
    blankObserved.situation === "local_nonempty_no_visible" &&
    badSnapshot.action === CrmEmptyReadAction.REFUSE_CREATE &&
    badSnapshot.situation === "local_nonempty_no_visible" &&
    blankReceiptId.action === CrmEmptyReadAction.REFUSE_CREATE &&
    blankReceiptId.situation === "local_nonempty_no_visible" &&
    fauxSyntheticFlag.action === CrmEmptyReadAction.REFUSE_CREATE &&
    fauxSyntheticFlag.situation === "local_nonempty_no_visible" &&
    wrongSource.action === CrmEmptyReadAction.REFUSE_CREATE &&
    wrongSource.situation === "local_nonempty_no_visible" &&
    blankModule.action === CrmEmptyReadAction.REFUSE_CREATE &&
    blankModule.situation === "local_nonempty_no_visible" &&
    moduleTrimOk.action === CrmEmptyReadAction.RECONCILE &&
    moduleTrimOk.situation === "visible_receipt" &&
    moduleMismatch.action === CrmEmptyReadAction.REFUSE_CREATE &&
    moduleMismatch.situation === "local_nonempty_no_visible"
  ) {
    details.push(
      "Live/Ads/effects/providerSuccess/sandbox refused; fixture_crm source+snapshot+moduleId gates",
    );
  } else {
    passed = false;
    details.push(
      `Live/Ads/effects/provider/sandbox/obs/snap/rcpt/module unexpectedly live=${JSON.stringify(liveClaim)} ads=${JSON.stringify(adsClaim)} fx=${JSON.stringify(effectsClaim)} provider=${JSON.stringify(liveSuccessClaim)} sandbox=${JSON.stringify(sandboxClaim)} garbageObs=${JSON.stringify(garbageObserved)} obs=${JSON.stringify(blankObserved)} snap=${JSON.stringify(badSnapshot)} rcpt=${JSON.stringify(blankReceiptId)} wrongSrc=${JSON.stringify(wrongSource)} blankMod=${JSON.stringify(blankModule)} mod=${JSON.stringify(moduleMismatch)}`,
    );
  }

  // 7. Window exceeded still empty → escalate missing, never create.
  const escalate = decideCrmLeadRetryAfterEmptyRead({
    correlationId,
    localWriteReceiptPresent: true,
    remoteReadEmpty: true,
    elapsedMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS + 1,
    consistencyWindowMs: DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
    correlatedReceipts: [],
  });
  if (
    escalate.action === CrmEmptyReadAction.ESCALATE_MISSING &&
    escalate.situation === "local_empty_after_window" &&
    escalate.createLead === false &&
    escalate.chatgptAdsAccess === CRM_CHATGPT_ADS_ACCESS &&
    escalate.externalEffects === "NONE"
  ) {
    details.push("Window exceeded empty → ESCALATE_MISSING createLead=false");
  } else {
    passed = false;
    details.push(`Escalate unexpectedly ${JSON.stringify(escalate)}`);
  }

  if (crm.liveZohoWiring !== "NOT_WIRED" || crm.mode !== "FIXTURE") {
    passed = false;
    details.push("Expected fixture CRM with liveZohoWiring=NOT_WIRED");
  } else {
    details.push("Fixture CRM only — live Zoho NOT_WIRED; externalEffects NONE");
  }

  details.push(
    "ACCEPTED≠VERIFIED — fixture eventual-consistency proof only; live Zoho NOT_WIRED; chatgptAdsAccess=ACCESS_BLOCKED; liveProviderSuccessClaimed=false; externalEffects=NONE",
  );

  return {
    proofId: `proof-x023-${randomUUID().slice(0, 8)}`,
    kind: SoakProofKind.EVENTUAL_CONSISTENCY_FALSE_NOT_FOUND,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: intent.operationId,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
