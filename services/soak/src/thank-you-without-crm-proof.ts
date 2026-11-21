/**
 * Fixture proof for T-US-040 / T-X049 — thank-you / browser success without a
 * CRM record fails at delivery (not invent CRM success). External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  LeadCaptureStage,
  ProbeVerdict,
  ReconciliationStatus,
  SoakProofKind,
  createLeadCaptureJourney,
  createSyntheticLead,
  evaluateDomJourneyFixture,
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
  if (
    dom.verdict === ProbeVerdict.SUCCESS &&
    dom.passedStepIds.length === 2
  ) {
    details.push("DOM thank-you fixture → SUCCESS (independent of CRM)");
  } else {
    passed = false;
    details.push(`DOM thank-you unexpectedly ${JSON.stringify(dom)}`);
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

  details.push("liveZohoWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE");

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
