import { describe, expect, it } from "vitest";
import {
  BookingCapability,
  CRM_FORMS_BOOKING_MAP_RELATED_CASE_IDS,
  CrmMapEnvironment,
  evaluateCrmFormsBookingMap,
  runCrmFormsBookingFailureRecovery,
} from "./crm-forms-booking-map.js";

function happyInput(
  overrides: Partial<Parameters<typeof evaluateCrmFormsBookingMap>[0]> = {},
) {
  return {
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
    failureRecoveryScenarioPassed: true,
    failureRecoveryScenarioId: "fr-crm-write-retry-1",
    requestLiveZohoWiring: false,
    countSyntheticInCommerce: false,
    ...overrides,
  };
}

describe("crm-forms-booking-map (T-US-019)", () => {
  it("relates T-US-019 and T-F10 only", () => {
    expect([...CRM_FORMS_BOOKING_MAP_RELATED_CASE_IDS]).toEqual([
      "T-US-019",
      "T-F10",
    ]);
  });

  it("accepts complete fixture map with failure/recovery passed", () => {
    const decision = evaluateCrmFormsBookingMap(happyInput());
    expect(decision.allowed).toBe(true);
    if (!decision.allowed) return;
    expect(decision.code).toBe("MAP_CRM_FORMS_BOOKING_READY");
    expect(decision.liveZohoWiring).toBe("NOT_WIRED");
    expect(decision.externalEffects).toBe("NONE");
    expect(decision.commercialExcluded).toBe(true);
    expect(decision.evidence.failureRecoveryScenarioId).toBe(
      "fr-crm-write-retry-1",
    );
  });

  it("refuses live Zoho wiring and commerce pollution", () => {
    const live = evaluateCrmFormsBookingMap(
      happyInput({ requestLiveZohoWiring: true }),
    );
    expect(live.allowed).toBe(false);
    expect(live.code).toBe("LIVE_ZOHO_WIRING_NOT_WIRED");

    const commerce = evaluateCrmFormsBookingMap(
      happyInput({ countSyntheticInCommerce: true }),
    );
    expect(commerce.allowed).toBe(false);
    expect(commerce.code).toBe("COMMERCE_POLLUTION_REFUSED");
  });

  it("refuses production environment and live booking mutate", () => {
    const prod = evaluateCrmFormsBookingMap(
      happyInput({ environment: CrmMapEnvironment.PRODUCTION }),
    );
    expect(prod.allowed).toBe(false);
    expect(prod.code).toBe("PRODUCTION_ENVIRONMENT_REFUSED");

    const mutate = evaluateCrmFormsBookingMap(
      happyInput({
        bookingCapabilities: [
          BookingCapability.READ_INVENTORY,
          BookingCapability.MUTATE_LIVE,
        ],
      }),
    );
    expect(mutate.allowed).toBe(false);
    expect(mutate.code).toBe("BOOKING_LIVE_MUTATE_REFUSED");
  });

  it("requires each evidence pillar before ready", () => {
    expect(
      evaluateCrmFormsBookingMap(happyInput({ organizationId: null })).code,
    ).toBe("ENVIRONMENT_BINDING_MISSING");
    expect(
      evaluateCrmFormsBookingMap(
        happyInput({ formCrmContractPresent: false }),
      ).code,
    ).toBe("FORM_CRM_CONTRACT_INCOMPLETE");
    expect(
      evaluateCrmFormsBookingMap(happyInput({ canaryGrantPresent: false }))
        .code,
    ).toBe("CANARY_GRANT_OR_RETENTION_MISSING");
    expect(
      evaluateCrmFormsBookingMap(
        happyInput({ bookingCapabilityMatrixPresent: false }),
      ).code,
    ).toBe("BOOKING_CAPABILITY_MATRIX_MISSING");
    expect(
      evaluateCrmFormsBookingMap(
        happyInput({ correlatedJourneyEvidencePresent: false }),
      ).code,
    ).toBe("CORRELATED_JOURNEY_EVIDENCE_MISSING");
    expect(
      evaluateCrmFormsBookingMap(
        happyInput({ failureRecoveryScenarioPassed: false }),
      ).code,
    ).toBe("FAILURE_RECOVERY_SCENARIO_NOT_PASSED");
  });

  it("runs fixture failure/recovery without live effects", () => {
    const recovered = runCrmFormsBookingFailureRecovery({
      scenarioId: "fr-crm-write-retry-1",
      injectedFailureStage: "CRM_WRITE",
      retrySucceeded: true,
    });
    expect(recovered.recovered).toBe(true);
    expect(recovered.liveZohoWiring).toBe("NOT_WIRED");
    expect(recovered.externalEffects).toBe("NONE");
    expect(recovered.commercialExcluded).toBe(true);

    const failed = runCrmFormsBookingFailureRecovery({
      scenarioId: "fr-booking-receipt-1",
      injectedFailureStage: "BOOKING_RECEIPT",
      retrySucceeded: false,
    });
    expect(failed.recovered).toBe(false);
  });
});
