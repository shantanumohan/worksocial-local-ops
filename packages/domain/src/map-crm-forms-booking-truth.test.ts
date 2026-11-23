import { describe, expect, it } from "vitest";
import {
  BookingCapability,
  CrmMapEnvironment,
} from "./crm-forms-booking-map.js";
import {
  MAP_CRM_FORMS_BOOKING_TRUTH_RELATED_CASE_IDS,
  evaluateMapCrmFormsBookingTruth,
  type MapCrmFormsBookingTruthInput,
} from "./map-crm-forms-booking-truth.js";

function baseInput(
  overrides: Partial<MapCrmFormsBookingTruthInput> = {},
): MapCrmFormsBookingTruthInput {
  return {
    packageId: "pkg-f10-1",
    environmentBinding: {
      organizationId: "zoho-org-fixture-1",
      region: "us",
      environment: CrmMapEnvironment.FIXTURE,
      boundAtIso: "2026-11-23T03:20:00.000Z",
    },
    formCrmContract: {
      contractId: "form-crm-contract-f10-1",
      fieldMappings: [
        { formFieldId: "email", crmFieldId: "Email" },
        { formFieldId: "name", crmFieldId: "Last_Name" },
      ],
      assignmentRules: ["assign-pilot-owner", "tag-synthetic-canary"],
    },
    canaryGrantRetention: {
      grantId: "canary-grant-f10-1",
      retentionPolicyId: "retention-synthetic-30d",
      syntheticOnly: true,
      commercialExcluded: true,
    },
    bookingCapabilityMatrix: {
      matrixId: "booking-matrix-f10-1",
      inventorySourceId: "inv-fixture-1",
      receiptSourceId: "receipt-fixture-1",
      capabilities: [
        BookingCapability.READ_INVENTORY,
        BookingCapability.READ_RECEIPT,
      ],
    },
    correlatedJourney: {
      correlationId: "corr-f10-journey-1",
      formAcceptArtifactId: "art-form-accept-f10-1",
      crmWriteArtifactId: "art-crm-write-f10-1",
      bookingReceiptArtifactId: "art-booking-receipt-f10-1",
      recordedAtIso: "2026-11-23T03:21:00.000Z",
    },
    failureRecovery: {
      scenarioId: "fr-f10-crm-write-retry-1",
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

describe("evaluateMapCrmFormsBookingTruth (T-F10)", () => {
  it("records complete F10 evidence package", () => {
    const decision = evaluateMapCrmFormsBookingTruth(baseInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe(
      "MAP_CRM_FORMS_BOOKING_TRUTH_EVIDENCE_RECORDED",
    );
    expect(decision.liveZohoWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.fixtureOnly).toBe(true);
    expect(decision.commercialExcluded).toBe(true);
    expect(decision.productionWrites).toBe(false);
    expect(decision.evidence.organizationId).toBe("zoho-org-fixture-1");
    expect(decision.evidence.formFieldMappingCount).toBe(2);
    expect(decision.evidence.assignmentRuleCount).toBe(2);
    expect(decision.evidence.canaryGrantId).toBe("canary-grant-f10-1");
    expect(decision.evidence.bookingCapabilities).toEqual([
      "READ_INVENTORY",
      "READ_RECEIPT",
    ]);
    expect(decision.evidence.correlationId).toBe("corr-f10-journey-1");
    expect(decision.evidence.failureRecoveryPassed).toBe(true);
    expect(decision.evidence.crmMapVerifiedLive).toBe(false);
    expect(decision.evidence.blockingDecision).toBe(
      "F10_EVIDENCE_PACKAGE_COMPLETE",
    );
    expect(MAP_CRM_FORMS_BOOKING_TRUTH_RELATED_CASE_IDS).toEqual(["T-F10"]);
  });

  it("refuses missing environment binding", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ environmentBinding: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("ENVIRONMENT_BINDING_REQUIRED");
  });

  it("refuses production environment", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({
        environmentBinding: {
          organizationId: "zoho-org-prod",
          region: "us",
          environment: CrmMapEnvironment.PRODUCTION,
          boundAtIso: "2026-11-23T03:20:00.000Z",
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("PRODUCTION_ENVIRONMENT_REFUSED");
  });

  it("refuses missing form→CRM contract", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ formCrmContract: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FORM_CRM_CONTRACT_REQUIRED");
  });

  it("refuses missing canary grant/retention", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ canaryGrantRetention: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CANARY_GRANT_RETENTION_REQUIRED");
  });

  it("refuses booking matrix with MUTATE_LIVE", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({
        bookingCapabilityMatrix: {
          matrixId: "booking-matrix-bad",
          inventorySourceId: "inv-1",
          receiptSourceId: "receipt-1",
          capabilities: [BookingCapability.MUTATE_LIVE],
        },
      }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BOOKING_CAPABILITY_MATRIX_REQUIRED");
  });

  it("refuses attemptBookingLiveMutate", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ attemptBookingLiveMutate: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("BOOKING_LIVE_MUTATE_REFUSED");
  });

  it("refuses missing correlated journey", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ correlatedJourney: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("CORRELATED_JOURNEY_REQUIRED");
  });

  it("refuses missing failure/recovery", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ failureRecovery: null }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FAILURE_RECOVERY_REQUIRED");
  });

  it("refuses commerce pollution", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ countSyntheticInCommerce: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("COMMERCE_POLLUTION_REFUSED");
  });

  it("refuses false live-verified map claim", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ claimLiveVerifiedMap: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("FALSE_LIVE_VERIFIED_MAP_REFUSED");
  });

  it("refuses live Zoho wiring", () => {
    const decision = evaluateMapCrmFormsBookingTruth(
      baseInput({ requestLiveZohoWiring: true }),
    );
    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.code).toBe("LIVE_ZOHO_WIRING_NOT_WIRED");
  });
});
