/**
 * Fixture proof for T-US-040 / T-X049 — thank-you / browser success without a
 * CRM record fails at delivery (not invent CRM success). External effects: NONE.
 *
 * Hillclimb: evaluateThankYouWithoutCrmDelivery honesty + CRM delivery stage
 * edges (BROWSER not delivery; CRM_WRITE/VERIFY/CLEANUP are).
 */

import { randomUUID } from "node:crypto";
import {
  LeadCaptureStage,
  ProbeVerdict,
  ReconciliationStatus,
  SoakProofKind,
  createLeadCaptureJourney,
  createSyntheticLead,
  evaluateCrmDeliveryFailureHonesty,
  evaluateDomJourneyFixture,
  evaluateThankYouWithoutCrmDelivery,
  isBrowserStageNotCrmDelivery,
  isCrmDeliveryFailure,
  markJourneyFailure,
  reconcileCanaryIntent,
  type CanaryIntent,
  type CanaryRemoteReceipt,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-040 + T-X049 fixture ACCEPTED.
 */
export function proofThankYouWithoutCrmFailsDelivery(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const correlationId = `corr-${randomUUID().slice(0, 8)}`;

  // 1. DOM thank-you can succeed independently of CRM.
  const thankYouHtml =
    '<main><div id="thank-you">Thank you — we received your request</div></main>';
  const dom = evaluateDomJourneyFixture({
    html: thankYouHtml,
    steps: [
      {
        stepId: "ty-visible",
        target: 'id="thank-you"',
        action: "assert_visible",
        expected: null,
      },
      {
        stepId: "ty-text",
        target: "thank-you",
        action: "assert_text",
        expected: "Thank you",
      },
    ],
  });
  const domOk =
    dom.verdict === ProbeVerdict.SUCCESS && dom.passedStepIds.length === 2;
  if (domOk) {
    details.push("DOM thank-you fixture → SUCCESS (independent of CRM)");
  } else {
    passed = false;
    details.push(`DOM thank-you unexpectedly ${JSON.stringify(dom)}`);
  }

  // 1b. Honesty: DOM alone → DOM_ONLY_NOT_DELIVERY (never deliverySucceeded).
  const domOnly = evaluateThankYouWithoutCrmDelivery({
    domThankYouSucceeded: domOk,
    crmReconcile: null,
  });
  if (
    domOnly.code === "DOM_ONLY_NOT_DELIVERY" &&
    domOnly.deliverySucceeded === false &&
    domOnly.liveZohoWiring === "NOT_WIRED" &&
    domOnly.externalEffects === "NONE" &&
    domOnly.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "evaluateThankYouWithoutCrmDelivery DOM-only → not deliverySucceeded (NOT_WIRED/NONE)",
    );
  } else {
    passed = false;
    details.push(`DOM-only honesty unexpectedly ${JSON.stringify(domOnly)}`);
  }

  const intent: CanaryIntent = {
    operationId: `op-${randomUUID().slice(0, 8)}`,
    writePathId: "wp-form-to-crm",
    formId: "form-contact",
    correlationId,
    payloadDigest: "fixture-digest",
    synthetic: true,
    submittedAtIso: nowIso,
  };
  const lead = createSyntheticLead({ correlationId });

  // 2. Thank-you without CRM receipt → MISSING_REMOTE / FAILURE.
  const missing = reconcileCanaryIntent({
    intent,
    receipts: [],
    expectedModuleId: "Leads",
  });
  if (
    missing.status === ReconciliationStatus.MISSING_REMOTE &&
    missing.verdict === ProbeVerdict.FAILURE &&
    missing.blocksRetry === true
  ) {
    details.push(
      "Empty CRM receipts → MISSING_REMOTE FAILURE (thank-you ≠ CRM success)",
    );
  } else {
    passed = false;
    details.push(`Missing reconcile unexpectedly ${JSON.stringify(missing)}`);
  }

  // 2b. Honesty wrapper: DOM + MISSING_REMOTE fails delivery.
  const missingEval = evaluateThankYouWithoutCrmDelivery({
    domThankYouSucceeded: true,
    crmReconcile: missing,
  });
  if (
    missingEval.code === "CRM_MISSING_FAILS_DELIVERY" &&
    missingEval.deliverySucceeded === false &&
    missingEval.externalEffects === "NONE"
  ) {
    details.push(
      "evaluateThankYouWithoutCrmDelivery DOM+MISSING_REMOTE → fail at delivery",
    );
  } else {
    passed = false;
    details.push(
      `MISSING_REMOTE honesty unexpectedly ${JSON.stringify(missingEval)}`,
    );
  }

  // 3. Journey with submission + CRM_WRITE failure → isCrmDeliveryFailure.
  let journey = createLeadCaptureJourney({
    journeyId: `j-${randomUUID().slice(0, 8)}`,
    correlationId,
    createdAtIso: nowIso,
  });
  journey = { ...journey, submission: intent };
  journey = markJourneyFailure(journey, {
    stage: LeadCaptureStage.CRM_WRITE,
    verdict: "FAILURE",
    details: ["MISSING_REMOTE"],
    atIso: nowIso,
  });
  if (isCrmDeliveryFailure(journey) === true) {
    details.push("CRM_WRITE failure with submission → isCrmDeliveryFailure");
  } else {
    passed = false;
    details.push("Expected isCrmDeliveryFailure=true for CRM_WRITE failure");
  }

  // 3b. Stage edges: BROWSER not CRM delivery; VERIFY/CLEANUP are.
  let browserFail = createLeadCaptureJourney({
    journeyId: `j-br-${randomUUID().slice(0, 8)}`,
    correlationId: `br-${correlationId}`,
    createdAtIso: nowIso,
  });
  browserFail = { ...browserFail, submission: intent };
  browserFail = markJourneyFailure(browserFail, {
    stage: LeadCaptureStage.BROWSER,
    verdict: "FAILURE",
    details: ["DOM"],
    atIso: nowIso,
  });
  const browserHonesty = evaluateCrmDeliveryFailureHonesty(browserFail);
  if (
    isBrowserStageNotCrmDelivery(LeadCaptureStage.BROWSER) &&
    isBrowserStageNotCrmDelivery(LeadCaptureStage.FORM_ACCEPT) &&
    !isBrowserStageNotCrmDelivery(LeadCaptureStage.INCIDENT) &&
    !isBrowserStageNotCrmDelivery(LeadCaptureStage.REPAIR) &&
    !isBrowserStageNotCrmDelivery(LeadCaptureStage.REVERIFY) &&
    browserHonesty.isCrmDeliveryFailure === false
  ) {
    details.push(
      "BROWSER/FORM_ACCEPT pre-submit only; INCIDENT/REPAIR/REVERIFY not browser; BROWSER failure ≠ CRM delivery",
    );
  } else {
    passed = false;
    details.push("Expected BROWSER failure not to be CRM delivery failure");
  }

  // 3c. Non-missing reconcile outcomes stay distinct from MISSING_REMOTE.
  const duplicateEval = evaluateThankYouWithoutCrmDelivery({
    domThankYouSucceeded: true,
    crmReconcile: {
      status: ReconciliationStatus.DUPLICATE_REMOTE,
      verdict: ProbeVerdict.FAILURE,
      intentOperationId: intent.operationId,
      correlationId,
      matchedReceiptIds: ["a", "b"],
      details: ["duplicate"],
      blocksRetry: true,
    },
  });
  if (
    duplicateEval.code === "CRM_RECONCILE_NOT_DELIVERY" &&
    duplicateEval.deliverySucceeded === false
  ) {
    details.push(
      "DUPLICATE_REMOTE → CRM_RECONCILE_NOT_DELIVERY (distinct from MISSING_REMOTE)",
    );
  } else {
    passed = false;
    details.push(
      `Non-missing reconcile unexpectedly ${JSON.stringify(duplicateEval)}`,
    );
  }

  for (const stage of [
    LeadCaptureStage.VERIFY,
    LeadCaptureStage.CLEANUP,
  ] as const) {
    let j = createLeadCaptureJourney({
      journeyId: `j-${stage}-${randomUUID().slice(0, 8)}`,
      correlationId: `${stage}-${correlationId}`,
      createdAtIso: nowIso,
    });
    j = { ...j, submission: intent };
    j = markJourneyFailure(j, {
      stage,
      verdict: "FAILURE",
      details: ["MISSING_REMOTE"],
      atIso: nowIso,
    });
    if (isCrmDeliveryFailure(j) !== true) {
      passed = false;
      details.push(`Expected isCrmDeliveryFailure for stage=${stage}`);
    }
  }
  if (passed) {
    details.push(
      "VERIFY/CLEANUP stage failures → isCrmDeliveryFailure (with submission)",
    );
  }

  // 4. Positive control: matched synthetic receipt → SUCCESS; no CRM failure → false.
  const receipt: CanaryRemoteReceipt = {
    receiptId: `rcpt-${randomUUID().slice(0, 8)}`,
    correlationId,
    moduleId: "Leads",
    recordId: "fixture-lead-1",
    synthetic: true,
    observedAtIso: nowIso,
    source: "fixture_crm",
    fieldSnapshot: {
      Email: lead.email,
      Last_Name: lead.displayName,
      ws_correlation_id: correlationId,
      ws_synthetic: "true",
    },
  };
  const matched = reconcileCanaryIntent({
    intent,
    receipts: [receipt],
    expectedModuleId: "Leads",
  });
  if (
    matched.status === ReconciliationStatus.MATCHED &&
    matched.verdict === ProbeVerdict.SUCCESS
  ) {
    details.push("Matched synthetic CRM receipt → MATCHED SUCCESS");
  } else {
    passed = false;
    details.push(`Matched reconcile unexpectedly ${JSON.stringify(matched)}`);
  }

  const matchedEval = evaluateThankYouWithoutCrmDelivery({
    domThankYouSucceeded: true,
    crmReconcile: matched,
  });
  if (
    matchedEval.code === "CRM_MATCHED_DELIVERY_OK" &&
    matchedEval.deliverySucceeded === true &&
    matchedEval.liveProviderSuccessClaimed === false
  ) {
    details.push(
      "evaluateThankYouWithoutCrmDelivery MATCHED → deliverySucceeded (liveProviderSuccessClaimed=false)",
    );
  } else {
    passed = false;
    details.push(`MATCHED honesty unexpectedly ${JSON.stringify(matchedEval)}`);
  }

  const okJourney = createLeadCaptureJourney({
    journeyId: `j-ok-${randomUUID().slice(0, 8)}`,
    correlationId: `ok-${correlationId}`,
    createdAtIso: nowIso,
  });
  if (isCrmDeliveryFailure(okJourney) === false) {
    details.push("Journey without CRM failure → isCrmDeliveryFailure=false");
  } else {
    passed = false;
    details.push("Expected isCrmDeliveryFailure=false without failure");
  }

  details.push(
    "liveZohoWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
  );

  return {
    proofId: `proof-thank-you-crm-${randomUUID()}`,
    kind: SoakProofKind.THANK_YOU_WITHOUT_CRM_FAILS_DELIVERY,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-thank-you-crm-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
