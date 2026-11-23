/**
 * T-F10 — Map CRM, forms and booking truth (complete F10 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F10 evidence
 * package — Zoho organization/region/environment binding, form→CRM field
 * contract with assignment rules, canary grant + retention policy, booking
 * inventory/receipt capability matrix, correlated journey evidence, and a
 * passing failure→recovery scenario. Incomplete packages, live booking
 * mutate, commerce pollution, production environment, and false live-verified
 * claims are refused. Live Zoho stays NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from T-US-019 (`MAP_CRM_FORMS_BOOKING_FAILURE_RECOVERY`) — this
 * records the complete F10 flow evidence package (structured binding +
 * contract + canary + booking matrix + journey + recovery), not the
 * failure/recovery readiness summary alone. Distinct from T-US-039
 * (continuous cadence/heartbeat) and T-US-040 (thank-you ≠ CRM).
 */

import {
  BookingCapability,
  CrmMapEnvironment,
  FIXTURE_BOOKING_CAPABILITIES,
  type BookingCapabilityValue,
  type CrmMapEnvironmentValue,
} from "./crm-forms-booking-map.js";

export type CrmEnvironmentBinding = {
  organizationId: string;
  region: string;
  environment: CrmMapEnvironmentValue;
  boundAtIso: string;
};

export type FormCrmFieldMapping = {
  formFieldId: string;
  crmFieldId: string;
};

export type FormCrmContract = {
  contractId: string;
  fieldMappings: readonly FormCrmFieldMapping[];
  assignmentRules: readonly string[];
};

export type CanaryGrantRetention = {
  grantId: string;
  retentionPolicyId: string;
  syntheticOnly: true;
  commercialExcluded: true;
};

export type BookingCapabilityMatrix = {
  matrixId: string;
  inventorySourceId: string;
  receiptSourceId: string;
  capabilities: readonly BookingCapabilityValue[];
};

export type CorrelatedJourneyEvidence = {
  correlationId: string;
  formAcceptArtifactId: string;
  crmWriteArtifactId: string;
  bookingReceiptArtifactId: string;
  recordedAtIso: string;
};

export type FailureRecoveryEvidence = {
  scenarioId: string;
  injectedFailureStage: "CRM_WRITE" | "BOOKING_RECEIPT" | "FORM_ACCEPT";
  recovered: true;
  commercialExcluded: true;
};

export type MapCrmFormsBookingTruthInput = {
  packageId: string;
  environmentBinding: CrmEnvironmentBinding | null;
  formCrmContract: FormCrmContract | null;
  canaryGrantRetention: CanaryGrantRetention | null;
  bookingCapabilityMatrix: BookingCapabilityMatrix | null;
  correlatedJourney: CorrelatedJourneyEvidence | null;
  failureRecovery: FailureRecoveryEvidence | null;
  /** Attempt booking MUTATE_LIVE — must refuse on fixture. */
  attemptBookingLiveMutate: boolean;
  /** Attempt to count synthetic canary into commerce — must refuse. */
  countSyntheticInCommerce: boolean;
  /** Claim the F10 path is live-verified — must refuse offline. */
  claimLiveVerifiedMap: boolean;
  /** Request live Zoho wiring — must stay NOT_WIRED offline. */
  requestLiveZohoWiring: boolean;
};

export type MapCrmFormsBookingTruthDecision =
  | {
      allowed: true;
      code: "MAP_CRM_FORMS_BOOKING_TRUTH_EVIDENCE_RECORDED";
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      commercialExcluded: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        organizationId: string;
        region: string;
        environment: "fixture" | "sandbox";
        boundAtIso: string;
        formCrmContractId: string;
        formFieldMappingCount: number;
        assignmentRuleCount: number;
        canaryGrantId: string;
        retentionPolicyId: string;
        bookingMatrixId: string;
        inventorySourceId: string;
        receiptSourceId: string;
        bookingCapabilities: readonly BookingCapabilityValue[];
        correlationId: string;
        formAcceptArtifactId: string;
        crmWriteArtifactId: string;
        bookingReceiptArtifactId: string;
        failureRecoveryScenarioId: string;
        injectedFailureStage: FailureRecoveryEvidence["injectedFailureStage"];
        failureRecoveryPassed: true;
        crmMapVerifiedLive: false;
        commercialExcluded: true;
        productionWrites: false;
        blockingDecision: "F10_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "CRM_FORMS_BOOKING_TRUTH_RECORDED";
        recoveryPath: "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "ENVIRONMENT_BINDING_REQUIRED"
        | "PRODUCTION_ENVIRONMENT_REFUSED"
        | "FORM_CRM_CONTRACT_REQUIRED"
        | "CANARY_GRANT_RETENTION_REQUIRED"
        | "BOOKING_CAPABILITY_MATRIX_REQUIRED"
        | "BOOKING_LIVE_MUTATE_REFUSED"
        | "CORRELATED_JOURNEY_REQUIRED"
        | "FAILURE_RECOVERY_REQUIRED"
        | "COMMERCE_POLLUTION_REFUSED"
        | "FALSE_LIVE_VERIFIED_MAP_REFUSED"
        | "LIVE_ZOHO_WIRING_NOT_WIRED";
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      commercialExcluded: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        organizationId: string | null;
        region: string | null;
        environment: string | null;
        boundAtIso: string | null;
        formCrmContractId: string | null;
        formFieldMappingCount: number;
        assignmentRuleCount: number;
        canaryGrantId: string | null;
        retentionPolicyId: string | null;
        bookingMatrixId: string | null;
        inventorySourceId: string | null;
        receiptSourceId: string | null;
        bookingCapabilities: readonly BookingCapabilityValue[];
        correlationId: string | null;
        formAcceptArtifactId: string | null;
        crmWriteArtifactId: string | null;
        bookingReceiptArtifactId: string | null;
        failureRecoveryScenarioId: string | null;
        injectedFailureStage: string | null;
        failureRecoveryPassed: boolean;
        crmMapVerifiedLive: false;
        commercialExcluded: true;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_ENVIRONMENT_BINDING"
          | "AWAITING_FORM_CRM_CONTRACT"
          | "AWAITING_CANARY_GRANT_RETENTION"
          | "AWAITING_BOOKING_CAPABILITY_MATRIX"
          | "AWAITING_CORRELATED_JOURNEY"
          | "AWAITING_FAILURE_RECOVERY";
        recoveryPath:
          | "BIND_ZOHO_ORG_REGION_FIXTURE_OR_SANDBOX"
          | "MAP_FORM_FIELDS_AND_ASSIGNMENT_RULES"
          | "SET_CANARY_GRANT_AND_RETENTION"
          | "DECLARE_FIXTURE_BOOKING_CAPABILITIES"
          | "RECORD_CORRELATED_PILOT_JOURNEY"
          | "PASS_FAILURE_RECOVERY_SCENARIO"
          | "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const MAP_CRM_FORMS_BOOKING_TRUTH_RELATED_CASE_IDS = ["T-F10"] as const;

function preservedInputCount(input: MapCrmFormsBookingTruthInput): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.environmentBinding?.organizationId.trim() ? 1 : 0) +
    (input.formCrmContract?.contractId.trim() ? 1 : 0) +
    (input.canaryGrantRetention?.grantId.trim() ? 1 : 0) +
    (input.bookingCapabilityMatrix?.matrixId.trim() ? 1 : 0) +
    (input.correlatedJourney?.correlationId.trim() ? 1 : 0) +
    (input.failureRecovery?.scenarioId.trim() ? 1 : 0)
  );
}

function environmentBindingOk(
  b: CrmEnvironmentBinding | null,
): b is CrmEnvironmentBinding {
  if (!b) return false;
  if (
    !b.organizationId.trim() ||
    !b.region.trim() ||
    !b.boundAtIso.trim()
  ) {
    return false;
  }
  return (
    b.environment === CrmMapEnvironment.FIXTURE ||
    b.environment === CrmMapEnvironment.SANDBOX
  );
}

function formCrmContractOk(
  c: FormCrmContract | null,
): c is FormCrmContract {
  if (!c) return false;
  if (!c.contractId.trim() || c.fieldMappings.length === 0) return false;
  if (c.assignmentRules.length === 0) return false;
  if (!c.assignmentRules.every((r) => r.trim().length > 0)) return false;
  const formIds = c.fieldMappings.map((m) => m.formFieldId.trim());
  const crmIds = c.fieldMappings.map((m) => m.crmFieldId.trim());
  if (formIds.some((id) => !id) || crmIds.some((id) => !id)) return false;
  if (new Set(formIds).size !== formIds.length) return false;
  return true;
}

function canaryGrantRetentionOk(
  g: CanaryGrantRetention | null,
): g is CanaryGrantRetention {
  if (!g) return false;
  return (
    g.grantId.trim().length > 0 &&
    g.retentionPolicyId.trim().length > 0 &&
    g.syntheticOnly === true &&
    g.commercialExcluded === true
  );
}

function bookingCapabilityMatrixOk(
  m: BookingCapabilityMatrix | null,
): m is BookingCapabilityMatrix {
  if (!m) return false;
  if (
    !m.matrixId.trim() ||
    !m.inventorySourceId.trim() ||
    !m.receiptSourceId.trim() ||
    m.capabilities.length === 0
  ) {
    return false;
  }
  if (m.capabilities.includes(BookingCapability.MUTATE_LIVE)) return false;
  const allowed = new Set<string>(FIXTURE_BOOKING_CAPABILITIES);
  return m.capabilities.every((c) => allowed.has(c));
}

function correlatedJourneyOk(
  j: CorrelatedJourneyEvidence | null,
): j is CorrelatedJourneyEvidence {
  if (!j) return false;
  return (
    j.correlationId.trim().length > 0 &&
    j.formAcceptArtifactId.trim().length > 0 &&
    j.crmWriteArtifactId.trim().length > 0 &&
    j.bookingReceiptArtifactId.trim().length > 0 &&
    j.recordedAtIso.trim().length > 0
  );
}

function failureRecoveryOk(
  r: FailureRecoveryEvidence | null,
): r is FailureRecoveryEvidence {
  if (!r) return false;
  return (
    r.scenarioId.trim().length > 0 &&
    r.recovered === true &&
    r.commercialExcluded === true &&
    (r.injectedFailureStage === "CRM_WRITE" ||
      r.injectedFailureStage === "BOOKING_RECEIPT" ||
      r.injectedFailureStage === "FORM_ACCEPT")
  );
}

/**
 * Evaluate the T-F10 map-crm-forms-booking-truth path offline.
 * Complete F10 evidence package → MAP_CRM_FORMS_BOOKING_TRUTH_EVIDENCE_RECORDED;
 * live Zoho stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateMapCrmFormsBookingTruth(
  input: MapCrmFormsBookingTruthInput,
): MapCrmFormsBookingTruthDecision {
  const base = {
    liveZohoWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    commercialExcluded: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_ENVIRONMENT_BINDING"
      | "AWAITING_FORM_CRM_CONTRACT"
      | "AWAITING_CANARY_GRANT_RETENTION"
      | "AWAITING_BOOKING_CAPABILITY_MATRIX"
      | "AWAITING_CORRELATED_JOURNEY"
      | "AWAITING_FAILURE_RECOVERY",
    recoveryPath:
      | "BIND_ZOHO_ORG_REGION_FIXTURE_OR_SANDBOX"
      | "MAP_FORM_FIELDS_AND_ASSIGNMENT_RULES"
      | "SET_CANARY_GRANT_AND_RETENTION"
      | "DECLARE_FIXTURE_BOOKING_CAPABILITIES"
      | "RECORD_CORRELATED_PILOT_JOURNEY"
      | "PASS_FAILURE_RECOVERY_SCENARIO"
      | "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO",
  ): NonNullable<
    Extract<MapCrmFormsBookingTruthDecision, { allowed: false }>["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    organizationId:
      input.environmentBinding?.organizationId.trim() || null,
    region: input.environmentBinding?.region.trim() || null,
    environment: input.environmentBinding?.environment ?? null,
    boundAtIso: input.environmentBinding?.boundAtIso.trim() || null,
    formCrmContractId: input.formCrmContract?.contractId.trim() || null,
    formFieldMappingCount: input.formCrmContract?.fieldMappings.length ?? 0,
    assignmentRuleCount: input.formCrmContract?.assignmentRules.length ?? 0,
    canaryGrantId: input.canaryGrantRetention?.grantId.trim() || null,
    retentionPolicyId:
      input.canaryGrantRetention?.retentionPolicyId.trim() || null,
    bookingMatrixId: input.bookingCapabilityMatrix?.matrixId.trim() || null,
    inventorySourceId:
      input.bookingCapabilityMatrix?.inventorySourceId.trim() || null,
    receiptSourceId:
      input.bookingCapabilityMatrix?.receiptSourceId.trim() || null,
    bookingCapabilities: input.bookingCapabilityMatrix?.capabilities ?? [],
    correlationId: input.correlatedJourney?.correlationId.trim() || null,
    formAcceptArtifactId:
      input.correlatedJourney?.formAcceptArtifactId.trim() || null,
    crmWriteArtifactId:
      input.correlatedJourney?.crmWriteArtifactId.trim() || null,
    bookingReceiptArtifactId:
      input.correlatedJourney?.bookingReceiptArtifactId.trim() || null,
    failureRecoveryScenarioId:
      input.failureRecovery?.scenarioId.trim() || null,
    injectedFailureStage: input.failureRecovery?.injectedFailureStage ?? null,
    failureRecoveryPassed: input.failureRecovery?.recovered === true,
    crmMapVerifiedLive: false,
    commercialExcluded: true,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveZohoWiring) {
    return {
      allowed: false,
      code: "LIVE_ZOHO_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live Zoho wiring remains NOT_WIRED — refuse live CRM/forms/booking map (T-F10)",
      ],
    };
  }

  if (input.claimLiveVerifiedMap) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_MAP_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified CRM/forms/booking map claim offline (T-F10) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.countSyntheticInCommerce) {
    return {
      allowed: false,
      code: "COMMERCE_POLLUTION_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "COMMERCE_POLLUTION_REFUSED",
        "BLOCKED",
        "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO",
      ),
      reasons: [
        "Synthetic canary records must not enter commerce denominators (T-F10)",
      ],
    };
  }

  if (input.attemptBookingLiveMutate) {
    return {
      allowed: false,
      code: "BOOKING_LIVE_MUTATE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "BOOKING_LIVE_MUTATE_REFUSED",
        "BLOCKED",
        "DECLARE_FIXTURE_BOOKING_CAPABILITIES",
      ),
      reasons: [
        "Booking MUTATE_LIVE refused on F10 fixture surface — inventory/receipt only (T-F10)",
      ],
    };
  }

  if (
    input.environmentBinding?.environment === CrmMapEnvironment.PRODUCTION
  ) {
    return {
      allowed: false,
      code: "PRODUCTION_ENVIRONMENT_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "PRODUCTION_ENVIRONMENT_REFUSED",
        "BLOCKED",
        "BIND_ZOHO_ORG_REGION_FIXTURE_OR_SANDBOX",
      ),
      reasons: [
        "Production Zoho environment refused for offline F10 evidence package (T-F10)",
      ],
    };
  }

  if (!input.packageId.trim() || !environmentBindingOk(input.environmentBinding)) {
    return {
      allowed: false,
      code: "ENVIRONMENT_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "ENVIRONMENT_BINDING_INCOMPLETE",
        "AWAITING_ENVIRONMENT_BINDING",
        "BIND_ZOHO_ORG_REGION_FIXTURE_OR_SANDBOX",
      ),
      reasons: [
        "F10 requires exact Zoho organization, region, and fixture/sandbox environment binding (T-F10)",
      ],
    };
  }

  if (!formCrmContractOk(input.formCrmContract)) {
    return {
      allowed: false,
      code: "FORM_CRM_CONTRACT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "FORM_CRM_CONTRACT_INCOMPLETE",
        "AWAITING_FORM_CRM_CONTRACT",
        "MAP_FORM_FIELDS_AND_ASSIGNMENT_RULES",
      ),
      reasons: [
        "F10 requires form→CRM field contract with assignment rules (T-F10)",
      ],
    };
  }

  if (!canaryGrantRetentionOk(input.canaryGrantRetention)) {
    return {
      allowed: false,
      code: "CANARY_GRANT_RETENTION_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CANARY_GRANT_RETENTION_INCOMPLETE",
        "AWAITING_CANARY_GRANT_RETENTION",
        "SET_CANARY_GRANT_AND_RETENTION",
      ),
      reasons: [
        "F10 requires canary grant and synthetic retention policy (commercialExcluded) (T-F10)",
      ],
    };
  }

  if (!bookingCapabilityMatrixOk(input.bookingCapabilityMatrix)) {
    return {
      allowed: false,
      code: "BOOKING_CAPABILITY_MATRIX_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "BOOKING_CAPABILITY_MATRIX_INCOMPLETE",
        "AWAITING_BOOKING_CAPABILITY_MATRIX",
        "DECLARE_FIXTURE_BOOKING_CAPABILITIES",
      ),
      reasons: [
        "F10 requires booking inventory/receipt capability matrix (fixture capabilities only) (T-F10)",
      ],
    };
  }

  if (!correlatedJourneyOk(input.correlatedJourney)) {
    return {
      allowed: false,
      code: "CORRELATED_JOURNEY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CORRELATED_JOURNEY_INCOMPLETE",
        "AWAITING_CORRELATED_JOURNEY",
        "RECORD_CORRELATED_PILOT_JOURNEY",
      ),
      reasons: [
        "F10 requires correlated form→CRM→booking journey evidence (T-F10)",
      ],
    };
  }

  if (!failureRecoveryOk(input.failureRecovery)) {
    return {
      allowed: false,
      code: "FAILURE_RECOVERY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "FAILURE_RECOVERY_INCOMPLETE",
        "AWAITING_FAILURE_RECOVERY",
        "PASS_FAILURE_RECOVERY_SCENARIO",
      ),
      reasons: [
        "F10 requires passing failure/recovery scenario before evidence ACCEPTED (T-F10)",
      ],
    };
  }

  const binding = input.environmentBinding;
  const contract = input.formCrmContract;
  const canary = input.canaryGrantRetention;
  const booking = input.bookingCapabilityMatrix;
  const journey = input.correlatedJourney;
  const recovery = input.failureRecovery;

  return {
    allowed: true,
    code: "MAP_CRM_FORMS_BOOKING_TRUTH_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      organizationId: binding.organizationId.trim(),
      region: binding.region.trim(),
      environment: binding.environment as "fixture" | "sandbox",
      boundAtIso: binding.boundAtIso.trim(),
      formCrmContractId: contract.contractId.trim(),
      formFieldMappingCount: contract.fieldMappings.length,
      assignmentRuleCount: contract.assignmentRules.length,
      canaryGrantId: canary.grantId.trim(),
      retentionPolicyId: canary.retentionPolicyId.trim(),
      bookingMatrixId: booking.matrixId.trim(),
      inventorySourceId: booking.inventorySourceId.trim(),
      receiptSourceId: booking.receiptSourceId.trim(),
      bookingCapabilities: booking.capabilities,
      correlationId: journey.correlationId.trim(),
      formAcceptArtifactId: journey.formAcceptArtifactId.trim(),
      crmWriteArtifactId: journey.crmWriteArtifactId.trim(),
      bookingReceiptArtifactId: journey.bookingReceiptArtifactId.trim(),
      failureRecoveryScenarioId: recovery.scenarioId.trim(),
      injectedFailureStage: recovery.injectedFailureStage,
      failureRecoveryPassed: true,
      crmMapVerifiedLive: false,
      commercialExcluded: true,
      productionWrites: false,
      blockingDecision: "F10_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "CRM_FORMS_BOOKING_TRUTH_RECORDED",
      recoveryPath: "KEEP_FIXTURE_CANARY_NO_LIVE_ZOHO",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F10 evidence package recorded (environment binding, form→CRM contract, canary grant/retention, booking capability matrix, correlated journey, passing failure/recovery); commercialExcluded; live Zoho NOT_WIRED; externalEffects NONE",
    ],
  };
}
