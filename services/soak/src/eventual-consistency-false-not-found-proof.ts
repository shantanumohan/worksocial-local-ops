/**
 * Fixture proof for T-X023 — eventual consistency false not-found.
 *
 * Instrumented Zoho CRM fixture: write with visibility lag → getByCorrelation
 * empty (false not-found) → BOUND_WAIT createLead=false; writeAttemptCount
 * stays 1; after lag clears, reconcile MATCHED. External effects: NONE.
 * Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  CrmEmptyReadAction,
  DEFAULT_CRM_CONSISTENCY_WINDOW_MS,
  ProbeVerdict,
  ReconciliationStatus,
  SoakProofKind,
  counterfactualUnsafeCreateOnEmptyRead,
  decideCrmLeadRetryAfterEmptyRead,
  reconcileAfterConsistencyVisibility,
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
    crm.listAll().length === 1
  ) {
    details.push(
      "Fixture CRM write → ledger size 1; writeAttemptCount=1; lag reads scheduled",
    );
  } else {
    passed = false;
    details.push(
      `Local write unexpectedly receipt=${JSON.stringify(writeReceipt)} attempts=${crm.writeAttemptCount()} ledger=${crm.listAll().length}`,
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
    emptyDecision.createLead === false
  ) {
    details.push(
      "getByCorrelation empty under lag → BOUND_WAIT createLead=false (false not-found)",
    );
  } else {
    passed = false;
    details.push(
      `Empty-read path unexpectedly emptyRead=${JSON.stringify(emptyRead)} decision=${JSON.stringify(emptyDecision)}`,
    );
  }

  // 3. Counterfactual empty→create forbidden; do not issue a second write.
  const counterfactual = counterfactualUnsafeCreateOnEmptyRead({
    remoteReadEmpty: true,
    localWriteReceiptPresent: true,
  });
  if (
    counterfactual.wouldCreateLead === true &&
    counterfactual.forbidden === true &&
    emptyDecision.createLead === false
  ) {
    details.push("Counterfactual empty→create documented as forbidden");
  } else {
    passed = false;
    details.push(`Counterfactual unexpectedly ${JSON.stringify(counterfactual)}`);
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
  // Lag was 2: step 2 consumed 1; consume the second empty, then read visible.
  const secondEmpty = crm.getByCorrelation(correlationId);
  const visibleEntry = crm.getByCorrelation(correlationId);
  if (secondEmpty !== null || !visibleEntry?.receipt?.recordId) {
    passed = false;
    details.push(
      `Expected lag drain then visible receipt; secondEmpty=${JSON.stringify(secondEmpty)} visible=${JSON.stringify(visibleEntry)}`,
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
      visibleDecision.createLead === false &&
      after.matched === true &&
      after.createLead === false &&
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

  // 5. Window exceeded still empty → escalate missing, never create.
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
    escalate.createLead === false
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
