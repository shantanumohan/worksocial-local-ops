/**
 * Fixture proof for T-F10 — Map CRM, forms and booking truth.
 * Complete F10 evidence package: environment binding, form→CRM contract,
 * canary grant/retention, booking capability matrix, correlated journey,
 * passing failure/recovery; unsafe claims refused; live Zoho NOT_WIRED.
 * Distinct from T-US-019 failure/recovery readiness summary, T-US-039
 * continuous cadence, and T-US-040 thank-you ≠ CRM.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  BookingCapability,
  CrmMapEnvironment,
  SoakProofKind,
  evaluateMapCrmFormsBookingTruth,
  type MapCrmFormsBookingTruthInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<MapCrmFormsBookingTruthInput> = {},
): MapCrmFormsBookingTruthInput {
  return {
    packageId: "pkg-f10-soak",
    environmentBinding: {
      organizationId: "zoho-org-fixture-soak",
      region: "us",
      environment: CrmMapEnvironment.FIXTURE,
      boundAtIso: "2026-11-23T03:20:00.000Z",
    },
    formCrmContract: {
      contractId: "form-crm-contract-f10-soak",
      fieldMappings: [
        { formFieldId: "email", crmFieldId: "Email" },
        { formFieldId: "name", crmFieldId: "Last_Name" },
      ],
      assignmentRules: ["assign-pilot-owner", "tag-synthetic-canary"],
    },
    canaryGrantRetention: {
      grantId: "canary-grant-f10-soak",
      retentionPolicyId: "retention-synthetic-30d",
      syntheticOnly: true,
      commercialExcluded: true,
    },
    bookingCapabilityMatrix: {
      matrixId: "booking-matrix-f10-soak",
      inventorySourceId: "inv-fixture-soak",
      receiptSourceId: "receipt-fixture-soak",
      capabilities: [
        BookingCapability.READ_INVENTORY,
        BookingCapability.READ_RECEIPT,
      ],
    },
    correlatedJourney: {
      correlationId: "corr-f10-journey-soak",
      formAcceptArtifactId: "art-form-accept-f10-soak",
      crmWriteArtifactId: "art-crm-write-f10-soak",
      bookingReceiptArtifactId: "art-booking-receipt-f10-soak",
      recordedAtIso: "2026-11-23T03:21:00.000Z",
    },
    failureRecovery: {
      scenarioId: "fr-f10-crm-write-retry-soak",
      injectedFailureStage: "CRM_WRITE",
      recovered: true,
      commercialExcluded: true,
    },
    attemptBookingLiveMutate: false,
    countSyntheticInCommerce: false,
    claimLiveVerifiedMap: false,
    requestLiveZohoWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F10 fixture ACCEPTED.
 */
export function proofMapCrmFormsBookingTruth(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateMapCrmFormsBookingTruth(baseInput());
  if (
    happy.allowed &&
    happy.code === "MAP_CRM_FORMS_BOOKING_TRUTH_EVIDENCE_RECORDED" &&
    happy.evidence.formFieldMappingCount === 2 &&
    happy.evidence.assignmentRuleCount === 2 &&
    happy.evidence.failureRecoveryPassed === true &&
    happy.evidence.crmMapVerifiedLive === false &&
    happy.evidence.commercialExcluded === true &&
    happy.liveZohoWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F10 evidence package → MAP_CRM_FORMS_BOOKING_TRUTH_EVIDENCE_RECORDED; environment binding; form→CRM contract; canary grant/retention; booking capability matrix; correlated journey; failure/recovery passed; crmMapVerifiedLive=false; live Zoho NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noEnv = evaluateMapCrmFormsBookingTruth(
    baseInput({ environmentBinding: null }),
  );
  if (!noEnv.allowed && noEnv.code === "ENVIRONMENT_BINDING_REQUIRED") {
    details.push("environmentBinding=null → ENVIRONMENT_BINDING_REQUIRED");
  } else {
    passed = false;
    details.push(`Environment binding unexpectedly ${JSON.stringify(noEnv)}`);
  }

  const noContract = evaluateMapCrmFormsBookingTruth(
    baseInput({ formCrmContract: null }),
  );
  if (!noContract.allowed && noContract.code === "FORM_CRM_CONTRACT_REQUIRED") {
    details.push("formCrmContract=null → FORM_CRM_CONTRACT_REQUIRED");
  } else {
    passed = false;
    details.push(`Form CRM contract unexpectedly ${JSON.stringify(noContract)}`);
  }

  const noCanary = evaluateMapCrmFormsBookingTruth(
    baseInput({ canaryGrantRetention: null }),
  );
  if (
    !noCanary.allowed &&
    noCanary.code === "CANARY_GRANT_RETENTION_REQUIRED"
  ) {
    details.push(
      "canaryGrantRetention=null → CANARY_GRANT_RETENTION_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Canary grant unexpectedly ${JSON.stringify(noCanary)}`);
  }

  const noBooking = evaluateMapCrmFormsBookingTruth(
    baseInput({ bookingCapabilityMatrix: null }),
  );
  if (
    !noBooking.allowed &&
    noBooking.code === "BOOKING_CAPABILITY_MATRIX_REQUIRED"
  ) {
    details.push(
      "bookingCapabilityMatrix=null → BOOKING_CAPABILITY_MATRIX_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Booking matrix unexpectedly ${JSON.stringify(noBooking)}`);
  }

  const noJourney = evaluateMapCrmFormsBookingTruth(
    baseInput({ correlatedJourney: null }),
  );
  if (!noJourney.allowed && noJourney.code === "CORRELATED_JOURNEY_REQUIRED") {
    details.push("correlatedJourney=null → CORRELATED_JOURNEY_REQUIRED");
  } else {
    passed = false;
    details.push(`Correlated journey unexpectedly ${JSON.stringify(noJourney)}`);
  }

  const noRecovery = evaluateMapCrmFormsBookingTruth(
    baseInput({ failureRecovery: null }),
  );
  if (!noRecovery.allowed && noRecovery.code === "FAILURE_RECOVERY_REQUIRED") {
    details.push("failureRecovery=null → FAILURE_RECOVERY_REQUIRED");
  } else {
    passed = false;
    details.push(
      `Failure recovery unexpectedly ${JSON.stringify(noRecovery)}`,
    );
  }

  const liveMutate = evaluateMapCrmFormsBookingTruth(
    baseInput({ attemptBookingLiveMutate: true }),
  );
  if (
    !liveMutate.allowed &&
    liveMutate.code === "BOOKING_LIVE_MUTATE_REFUSED"
  ) {
    details.push("attemptBookingLiveMutate → BOOKING_LIVE_MUTATE_REFUSED");
  } else {
    passed = false;
    details.push(`Live mutate unexpectedly ${JSON.stringify(liveMutate)}`);
  }

  const commerce = evaluateMapCrmFormsBookingTruth(
    baseInput({ countSyntheticInCommerce: true }),
  );
  if (!commerce.allowed && commerce.code === "COMMERCE_POLLUTION_REFUSED") {
    details.push("countSyntheticInCommerce → COMMERCE_POLLUTION_REFUSED");
  } else {
    passed = false;
    details.push(`Commerce pollution unexpectedly ${JSON.stringify(commerce)}`);
  }

  const liveClaim = evaluateMapCrmFormsBookingTruth(
    baseInput({ claimLiveVerifiedMap: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_MAP_REFUSED"
  ) {
    details.push("claimLiveVerifiedMap → FALSE_LIVE_VERIFIED_MAP_REFUSED");
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateMapCrmFormsBookingTruth(
    baseInput({ requestLiveZohoWiring: true }),
  );
  if (!liveWire.allowed && liveWire.code === "LIVE_ZOHO_WIRING_NOT_WIRED") {
    details.push("requestLiveZohoWiring → LIVE_ZOHO_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveZohoWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-019 (failure/recovery readiness summary), T-US-039 (continuous cadence), and T-US-040 (thank-you ≠ CRM) — complete F10 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.MAP_CRM_FORMS_BOOKING_TRUTH,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-map-crm-forms-booking-truth-f10",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
