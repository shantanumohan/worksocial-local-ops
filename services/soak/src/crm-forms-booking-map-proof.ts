/**
 * Fixture proof for T-US-019 — Map CRM/forms/booking failure/recovery.
 * Environment binding, form→CRM contract, canary grant/retention, booking
 * capability matrix, correlated journey, passing failure→recovery.
 * Live Zoho NOT_WIRED; commercialExcluded; externalEffects NONE.
 * Distinct from T-US-039 (cadence) and T-US-040 (thank-you ≠ CRM).
 */

import { randomUUID } from "node:crypto";
import {
  BookingCapability,
  CrmMapEnvironment,
  SoakProofKind,
  evaluateCrmFormsBookingMap,
  runCrmFormsBookingFailureRecovery,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-019 fixture ACCEPTED.
 */
export function proofMapCrmFormsBookingFailureRecovery(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const recovery = runCrmFormsBookingFailureRecovery({
    scenarioId: "fr-crm-write-retry-1",
    injectedFailureStage: "CRM_WRITE",
    retrySucceeded: true,
  });
  if (
    recovery.recovered &&
    recovery.liveZohoWiring === "NOT_WIRED" &&
    recovery.externalEffects === "NONE" &&
    recovery.commercialExcluded === true
  ) {
    details.push(
      "Failure→recovery scenario passed (CRM_WRITE inject + retry); live NOT_WIRED; commercialExcluded",
    );
  } else {
    passed = false;
    details.push(`Failure/recovery unexpectedly ${JSON.stringify(recovery)}`);
  }

  const happy = evaluateCrmFormsBookingMap({
    organizationId: "zoho-org-fixture",
    region: "us",
    environment: CrmMapEnvironment.FIXTURE,
    formCrmContractPresent: true,
    formFieldCount: 2,
    assignmentRuleCount: 1,
    canaryGrantPresent: true,
    retentionPolicyPresent: true,
    retentionPolicyId: "retain-synthetic-7d",
    bookingCapabilityMatrixPresent: true,
    bookingCapabilities: [
      BookingCapability.READ_INVENTORY,
      BookingCapability.READ_RECEIPT,
    ],
    correlatedJourneyEvidencePresent: true,
    correlationId: "corr-form-crm-booking-1",
    failureRecoveryScenarioPassed: recovery.recovered,
    failureRecoveryScenarioId: recovery.scenarioId,
    requestLiveZohoWiring: false,
    countSyntheticInCommerce: false,
  });
  if (
    happy.allowed &&
    happy.code === "MAP_CRM_FORMS_BOOKING_READY" &&
    happy.environmentBound &&
    happy.formCrmContractReady &&
    happy.canaryGrantReady &&
    happy.bookingMatrixReady &&
    happy.journeyEvidenceReady &&
    happy.failureRecoveryPassed &&
    happy.liveZohoWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE" &&
    happy.commercialExcluded === true &&
    happy.evidence !== null
  ) {
    details.push(
      "CRM/forms/booking map → MAP_CRM_FORMS_BOOKING_READY; failure/recovery passed; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy map unexpectedly ${JSON.stringify(happy)}`);
  }

  const live = evaluateCrmFormsBookingMap({
    organizationId: "zoho-org-fixture",
    region: "us",
    environment: CrmMapEnvironment.FIXTURE,
    formCrmContractPresent: true,
    formFieldCount: 2,
    assignmentRuleCount: 1,
    canaryGrantPresent: true,
    retentionPolicyPresent: true,
    retentionPolicyId: "retain-synthetic-7d",
    bookingCapabilityMatrixPresent: true,
    bookingCapabilities: [BookingCapability.READ_INVENTORY],
    correlatedJourneyEvidencePresent: true,
    correlationId: "corr-form-crm-booking-1",
    failureRecoveryScenarioPassed: true,
    failureRecoveryScenarioId: "fr-crm-write-retry-1",
    requestLiveZohoWiring: true,
    countSyntheticInCommerce: false,
  });
  if (!live.allowed && live.code === "LIVE_ZOHO_WIRING_NOT_WIRED") {
    details.push("Live Zoho wiring request → LIVE_ZOHO_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(live)}`);
  }

  const missingRecovery = evaluateCrmFormsBookingMap({
    organizationId: "zoho-org-fixture",
    region: "us",
    environment: CrmMapEnvironment.FIXTURE,
    formCrmContractPresent: true,
    formFieldCount: 2,
    assignmentRuleCount: 1,
    canaryGrantPresent: true,
    retentionPolicyPresent: true,
    retentionPolicyId: "retain-synthetic-7d",
    bookingCapabilityMatrixPresent: true,
    bookingCapabilities: [
      BookingCapability.READ_INVENTORY,
      BookingCapability.READ_RECEIPT,
    ],
    correlatedJourneyEvidencePresent: true,
    correlationId: "corr-form-crm-booking-1",
    failureRecoveryScenarioPassed: false,
    failureRecoveryScenarioId: null,
    requestLiveZohoWiring: false,
    countSyntheticInCommerce: false,
  });
  if (
    !missingRecovery.allowed &&
    missingRecovery.code === "FAILURE_RECOVERY_SCENARIO_NOT_PASSED"
  ) {
    details.push(
      "Missing failure/recovery → FAILURE_RECOVERY_SCENARIO_NOT_PASSED",
    );
  } else {
    passed = false;
    details.push(
      `Missing recovery unexpectedly ${JSON.stringify(missingRecovery)}`,
    );
  }

  const commerce = evaluateCrmFormsBookingMap({
    organizationId: "zoho-org-fixture",
    region: "us",
    environment: CrmMapEnvironment.FIXTURE,
    formCrmContractPresent: true,
    formFieldCount: 2,
    assignmentRuleCount: 1,
    canaryGrantPresent: true,
    retentionPolicyPresent: true,
    retentionPolicyId: "retain-synthetic-7d",
    bookingCapabilityMatrixPresent: true,
    bookingCapabilities: [BookingCapability.READ_RECEIPT],
    correlatedJourneyEvidencePresent: true,
    correlationId: "corr-form-crm-booking-1",
    failureRecoveryScenarioPassed: true,
    failureRecoveryScenarioId: "fr-crm-write-retry-1",
    requestLiveZohoWiring: false,
    countSyntheticInCommerce: true,
  });
  if (!commerce.allowed && commerce.code === "COMMERCE_POLLUTION_REFUSED") {
    details.push("Synthetic commerce count → COMMERCE_POLLUTION_REFUSED");
  } else {
    passed = false;
    details.push(`Commerce pollution unexpectedly ${JSON.stringify(commerce)}`);
  }

  details.push(
    "ACCEPTED ≠ VERIFIED; externalEffects NONE; distinct from T-US-039/T-US-040",
  );

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY,
    passed,
    details,
    applyAttemptCount: 0,
    operationId: `t-us-019-crm-forms-booking-${nowIso}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
