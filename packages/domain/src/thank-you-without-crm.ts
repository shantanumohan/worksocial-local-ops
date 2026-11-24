/**
 * T-US-040 / T-X049 — Thank-you / browser success without a CRM record
 * fails at delivery (do not invent CRM success).
 *
 * DOM thank-you SUCCESS is independent of CRM and must never be treated as
 * delivery success. Empty / MISSING_REMOTE receipts fail delivery.
 * Distinct from reply-sent CRM reconcile no-resend (T-X054).
 * External effects: NONE. Live Zoho wiring: NOT_WIRED.
 */

import {
  LeadCaptureStage,
  isCrmDeliveryFailure,
  type LeadCaptureJourney,
  type LeadCaptureStageValue,
} from "./lead-capture.js";
import {
  ProbeVerdict,
  ReconciliationStatus,
  type ProbeVerdictValue,
  type ReconciliationResult,
  type ReconciliationStatusValue,
} from "./monitoring.js";

export type ThankYouWithoutCrmCode =
  | "DOM_ONLY_NOT_DELIVERY"
  | "CRM_MISSING_FAILS_DELIVERY"
  | "CRM_RECONCILE_NOT_DELIVERY"
  | "CRM_MATCHED_DELIVERY_OK"
  | "INVALID_INPUT"
  | null;

export type ThankYouWithoutCrmDecision = {
  /** True when evaluation is honest / policy-compliant (not "CRM succeeded"). */
  allowed: boolean;
  code: ThankYouWithoutCrmCode;
  /** True only when CRM reconcile MATCHED + SUCCESS — never from DOM alone. */
  deliverySucceeded: boolean;
  /** True when DOM thank-you succeeded independently of CRM. */
  domThankYouSucceeded: boolean;
  crmStatus: ReconciliationStatusValue | null;
  crmVerdict: ProbeVerdictValue | null;
  reasons: string[];
  liveZohoWiring: "NOT_WIRED";
  liveProviderSuccessClaimed: false;
  externalEffects: "NONE";
};

/** Pre-submit browser/form stages only (not INCIDENT/REPAIR/REVERIFY recovery). */
export const PRE_SUBMIT_BROWSER_STAGES: readonly LeadCaptureStageValue[] = [
  LeadCaptureStage.BROWSER,
  LeadCaptureStage.FORM_ACCEPT,
];

/**
 * Evaluate thank-you without inventing CRM delivery success.
 *
 * - DOM SUCCESS + empty/MISSING_REMOTE → delivery failed (T-X049).
 * - DOM SUCCESS alone never sets deliverySucceeded.
 * - MATCHED + SUCCESS → deliverySucceeded (positive control).
 * - DUPLICATE_REMOTE / FIELD_MISMATCH / AMBIGUOUS / NOT_WIRED →
 *   CRM_RECONCILE_NOT_DELIVERY (distinct from missing).
 */
export function evaluateThankYouWithoutCrmDelivery(input: {
  domThankYouSucceeded: boolean;
  /** CRM reconcile result; omit/null when no CRM observation yet. */
  crmReconcile: ReconciliationResult | null;
}): ThankYouWithoutCrmDecision {
  const honesty = {
    liveZohoWiring: "NOT_WIRED" as const,
    liveProviderSuccessClaimed: false as const,
    externalEffects: "NONE" as const,
  };

  const reconcile = input.crmReconcile;

  if (!input.domThankYouSucceeded && reconcile == null) {
    return {
      allowed: false,
      code: "INVALID_INPUT",
      deliverySucceeded: false,
      domThankYouSucceeded: false,
      crmStatus: null,
      crmVerdict: null,
      reasons: [
        "Need DOM thank-you observation and/or CRM reconcile to evaluate T-X049",
      ],
      ...honesty,
    };
  }

  if (reconcile == null) {
    return {
      allowed: true,
      code: "DOM_ONLY_NOT_DELIVERY",
      deliverySucceeded: false,
      domThankYouSucceeded: input.domThankYouSucceeded,
      crmStatus: null,
      crmVerdict: null,
      reasons: [
        "DOM thank-you SUCCESS is independent of CRM — not delivery success (T-US-040/T-X049)",
        "liveZohoWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
      ],
      ...honesty,
    };
  }

  if (
    reconcile.status === ReconciliationStatus.MISSING_REMOTE &&
    reconcile.verdict === ProbeVerdict.FAILURE
  ) {
    return {
      allowed: true,
      code: "CRM_MISSING_FAILS_DELIVERY",
      deliverySucceeded: false,
      domThankYouSucceeded: input.domThankYouSucceeded,
      crmStatus: reconcile.status,
      crmVerdict: reconcile.verdict,
      reasons: [
        input.domThankYouSucceeded
          ? "DOM thank-you visible but CRM MISSING_REMOTE — fail at delivery (thank-you ≠ CRM success)"
          : "CRM MISSING_REMOTE FAILURE — fail at delivery",
        `blocksRetry=${reconcile.blocksRetry}`,
        "liveZohoWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
      ],
      ...honesty,
    };
  }

  if (
    reconcile.status === ReconciliationStatus.MATCHED &&
    reconcile.verdict === ProbeVerdict.SUCCESS
  ) {
    return {
      allowed: true,
      code: "CRM_MATCHED_DELIVERY_OK",
      deliverySucceeded: true,
      domThankYouSucceeded: input.domThankYouSucceeded,
      crmStatus: reconcile.status,
      crmVerdict: reconcile.verdict,
      reasons: [
        "Matched synthetic CRM receipt → deliverySucceeded (positive control)",
        "liveZohoWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
      ],
      ...honesty,
    };
  }

  return {
    allowed: true,
    code: "CRM_RECONCILE_NOT_DELIVERY",
    deliverySucceeded: false,
    domThankYouSucceeded: input.domThankYouSucceeded,
    crmStatus: reconcile.status,
    crmVerdict: reconcile.verdict,
    reasons: [
      `CRM reconcile status=${reconcile.status} verdict=${reconcile.verdict} — not delivery success (distinct from MISSING_REMOTE)`,
      "liveZohoWiring=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
    ],
    ...honesty,
  };
}

/**
 * True only for pre-submit browser/form stages (BROWSER, FORM_ACCEPT).
 * INCIDENT / REPAIR / REVERIFY are recovery stages — not "browser".
 * CRM_WRITE / VERIFY / CLEANUP are CRM delivery stages.
 */
export function isBrowserStageNotCrmDelivery(
  stage: LeadCaptureStageValue,
): boolean {
  return PRE_SUBMIT_BROWSER_STAGES.includes(stage);
}

/**
 * Honesty wrapper: CRM delivery failure requires submission + eligible stage.
 */
export function evaluateCrmDeliveryFailureHonesty(
  journey: Pick<LeadCaptureJourney, "currentFailure" | "submission">,
): {
  isCrmDeliveryFailure: boolean;
  liveZohoWiring: "NOT_WIRED";
  externalEffects: "NONE";
} {
  return {
    isCrmDeliveryFailure: isCrmDeliveryFailure(journey),
    liveZohoWiring: "NOT_WIRED",
    externalEffects: "NONE",
  };
}

export const THANK_YOU_WITHOUT_CRM_RELATED_CASE_IDS = [
  "T-US-040",
  "T-X049",
] as const;
