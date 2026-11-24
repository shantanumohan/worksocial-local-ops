import { describe, expect, it } from "vitest";
import {
  LeadCaptureStage,
  createLeadCaptureJourney,
  isCrmDeliveryFailure,
  markJourneyFailure,
} from "./lead-capture.js";
import {
  ProbeVerdict,
  ReconciliationStatus,
  type ReconciliationResult,
} from "./monitoring.js";
import {
  THANK_YOU_WITHOUT_CRM_RELATED_CASE_IDS,
  evaluateCrmDeliveryFailureHonesty,
  evaluateThankYouWithoutCrmDelivery,
  isBrowserStageNotCrmDelivery,
} from "./thank-you-without-crm.js";

const now = "2026-11-24T20:00:00.000Z";

function missingRemote(): ReconciliationResult {
  return {
    status: ReconciliationStatus.MISSING_REMOTE,
    verdict: ProbeVerdict.FAILURE,
    intentOperationId: "op-1",
    correlationId: "corr-1",
    matchedReceiptIds: [],
    details: ["No remote/fixture receipt"],
    blocksRetry: true,
  };
}

function matchedSuccess(): ReconciliationResult {
  return {
    status: ReconciliationStatus.MATCHED,
    verdict: ProbeVerdict.SUCCESS,
    intentOperationId: "op-1",
    correlationId: "corr-1",
    matchedReceiptIds: ["rcpt-1"],
    details: ["Matched"],
    blocksRetry: false,
  };
}

describe("thank-you without CRM (T-US-040 / T-X049)", () => {
  it("DOM thank-you alone is not delivery success", () => {
    const d = evaluateThankYouWithoutCrmDelivery({
      domThankYouSucceeded: true,
      crmReconcile: null,
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("DOM_ONLY_NOT_DELIVERY");
    expect(d.deliverySucceeded).toBe(false);
    expect(d.domThankYouSucceeded).toBe(true);
    expect(d.liveZohoWiring).toBe("NOT_WIRED");
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.externalEffects).toBe("NONE");
  });

  it("DOM SUCCESS + MISSING_REMOTE fails delivery", () => {
    const d = evaluateThankYouWithoutCrmDelivery({
      domThankYouSucceeded: true,
      crmReconcile: missingRemote(),
    });
    expect(d.allowed).toBe(true);
    expect(d.code).toBe("CRM_MISSING_FAILS_DELIVERY");
    expect(d.deliverySucceeded).toBe(false);
    expect(d.crmStatus).toBe(ReconciliationStatus.MISSING_REMOTE);
    expect(d.crmVerdict).toBe(ProbeVerdict.FAILURE);
    expect(d.externalEffects).toBe("NONE");
  });

  it("MATCHED CRM is positive control deliverySucceeded", () => {
    const d = evaluateThankYouWithoutCrmDelivery({
      domThankYouSucceeded: true,
      crmReconcile: matchedSuccess(),
    });
    expect(d.code).toBe("CRM_MATCHED_DELIVERY_OK");
    expect(d.deliverySucceeded).toBe(true);
    expect(d.liveProviderSuccessClaimed).toBe(false);
    expect(d.liveZohoWiring).toBe("NOT_WIRED");
  });

  it("non-missing reconcile outcomes use CRM_RECONCILE_NOT_DELIVERY", () => {
    for (const status of [
      ReconciliationStatus.DUPLICATE_REMOTE,
      ReconciliationStatus.FIELD_MISMATCH,
      ReconciliationStatus.AMBIGUOUS,
      ReconciliationStatus.NOT_WIRED,
    ] as const) {
      const d = evaluateThankYouWithoutCrmDelivery({
        domThankYouSucceeded: true,
        crmReconcile: {
          status,
          verdict: ProbeVerdict.FAILURE,
          intentOperationId: "op-1",
          correlationId: "corr-1",
          matchedReceiptIds: status === ReconciliationStatus.DUPLICATE_REMOTE ? ["a", "b"] : [],
          details: [status],
          blocksRetry: true,
        },
      });
      expect(d.code).toBe("CRM_RECONCILE_NOT_DELIVERY");
      expect(d.deliverySucceeded).toBe(false);
      expect(d.crmStatus).toBe(status);
    }
  });

  it("BROWSER/FORM_ACCEPT only; recovery stages are not browser", () => {
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.BROWSER)).toBe(true);
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.FORM_ACCEPT)).toBe(true);
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.CRM_WRITE)).toBe(false);
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.VERIFY)).toBe(false);
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.CLEANUP)).toBe(false);
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.INCIDENT)).toBe(false);
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.REPAIR)).toBe(false);
    expect(isBrowserStageNotCrmDelivery(LeadCaptureStage.REVERIFY)).toBe(false);

    const intent = {
      operationId: "op-x",
      writePathId: "wp-form-to-crm",
      formId: "form-contact",
      correlationId: "c-x",
      payloadDigest: "digest",
      synthetic: true,
      submittedAtIso: now,
    };

    let browserFail = createLeadCaptureJourney({
      journeyId: "j-browser",
      correlationId: "c-browser",
      createdAtIso: now,
    });
    browserFail = { ...browserFail, submission: intent };
    browserFail = markJourneyFailure(browserFail, {
      stage: LeadCaptureStage.BROWSER,
      verdict: "FAILURE",
      details: ["DOM_ONLY"],
      atIso: now,
    });
    expect(isCrmDeliveryFailure(browserFail)).toBe(false);
    expect(evaluateCrmDeliveryFailureHonesty(browserFail).isCrmDeliveryFailure).toBe(
      false,
    );

    for (const stage of [
      LeadCaptureStage.CRM_WRITE,
      LeadCaptureStage.VERIFY,
      LeadCaptureStage.CLEANUP,
    ] as const) {
      let j = createLeadCaptureJourney({
        journeyId: `j-${stage}`,
        correlationId: `c-${stage}`,
        createdAtIso: now,
      });
      j = { ...j, submission: intent };
      j = markJourneyFailure(j, {
        stage,
        verdict: "FAILURE",
        details: ["MISSING_REMOTE"],
        atIso: now,
      });
      expect(isCrmDeliveryFailure(j)).toBe(true);
      const h = evaluateCrmDeliveryFailureHonesty(j);
      expect(h.isCrmDeliveryFailure).toBe(true);
      expect(h.liveZohoWiring).toBe("NOT_WIRED");
      expect(h.externalEffects).toBe("NONE");
    }

    const noSub = markJourneyFailure(
      createLeadCaptureJourney({
        journeyId: "j-nosub",
        correlationId: "c-nosub",
        createdAtIso: now,
      }),
      {
        stage: LeadCaptureStage.CRM_WRITE,
        verdict: "FAILURE",
        details: ["MISSING_REMOTE"],
        atIso: now,
      },
    );
    expect(isCrmDeliveryFailure(noSub)).toBe(false);
  });

  it("maps only T-US-040 and T-X049", () => {
    expect([...THANK_YOU_WITHOUT_CRM_RELATED_CASE_IDS]).toEqual([
      "T-US-040",
      "T-X049",
    ]);
  });
});
