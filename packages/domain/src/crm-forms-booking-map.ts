/**
 * T-US-019 — Map CRM/forms/booking (F10/SC-16) — failure/recovery scenario.
 *
 * Offline fixture gate for mapping Zoho environment binding, form→CRM
 * contract, canary grant/retention, booking capability matrix, correlated
 * journey evidence, and a passing failure→recovery scenario.
 * Live Zoho stays NOT_WIRED. Synthetic canaries never pollute commerce.
 * Distinct from T-US-039 (continuous cadence/heartbeat) and T-US-040
 * (thank-you without CRM). Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

export const CrmMapEnvironment = {
  FIXTURE: "fixture",
  SANDBOX: "sandbox",
  PRODUCTION: "production",
} as const;

export type CrmMapEnvironmentValue =
  (typeof CrmMapEnvironment)[keyof typeof CrmMapEnvironment];

export const BookingCapability = {
  READ_INVENTORY: "READ_INVENTORY",
  READ_RECEIPT: "READ_RECEIPT",
  CREATE_HOLD: "CREATE_HOLD",
  MUTATE_LIVE: "MUTATE_LIVE",
} as const;

export type BookingCapabilityValue =
  (typeof BookingCapability)[keyof typeof BookingCapability];

/** Capabilities permitted on the offline fixture booking surface. */
export const FIXTURE_BOOKING_CAPABILITIES: readonly BookingCapabilityValue[] = [
  BookingCapability.READ_INVENTORY,
  BookingCapability.READ_RECEIPT,
] as const;

export type CrmFormsBookingMapInput = {
  /** Exact Zoho organization id (non-secret). */
  organizationId: string | null;
  /** Zoho region / data center label. */
  region: string | null;
  /** Bound CRM environment. */
  environment: CrmMapEnvironmentValue | null;
  /** Pilot form field → CRM field contract present and non-empty. */
  formCrmContractPresent: boolean;
  formFieldCount: number;
  assignmentRuleCount: number;
  /** Server canary grant + retention policy for synthetic records. */
  canaryGrantPresent: boolean;
  retentionPolicyPresent: boolean;
  retentionPolicyId: string | null;
  /** Booking inventory + receipt capability matrix. */
  bookingCapabilityMatrixPresent: boolean;
  bookingCapabilities: readonly BookingCapabilityValue[] | null;
  /** Correlated journey evidence (form → CRM → booking receipt). */
  correlatedJourneyEvidencePresent: boolean;
  correlationId: string | null;
  /**
   * Failure injection + recovery scenario already exercised and passed
   * (fixture-only; no live remote effects).
   */
  failureRecoveryScenarioPassed: boolean;
  failureRecoveryScenarioId: string | null;
  /** Request live Zoho wiring — must stay NOT_WIRED offline. */
  requestLiveZohoWiring: boolean;
  /** Attempt to count synthetic canary into commerce denominators. */
  countSyntheticInCommerce: boolean;
};

export type CrmFormsBookingMapDecision =
  | {
      allowed: true;
      code: "MAP_CRM_FORMS_BOOKING_READY";
      environmentBound: true;
      formCrmContractReady: true;
      canaryGrantReady: true;
      bookingMatrixReady: true;
      journeyEvidenceReady: true;
      failureRecoveryPassed: true;
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      commercialExcluded: true;
      fixtureOnly: true;
      evidence: {
        environmentBindingId: string;
        formCrmContractId: string;
        canaryGrantRetentionId: string;
        bookingCapabilityMatrixId: string;
        correlatedJourneyId: string;
        failureRecoveryScenarioId: string;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "ENVIRONMENT_BINDING_MISSING"
        | "FORM_CRM_CONTRACT_INCOMPLETE"
        | "CANARY_GRANT_OR_RETENTION_MISSING"
        | "BOOKING_CAPABILITY_MATRIX_MISSING"
        | "BOOKING_LIVE_MUTATE_REFUSED"
        | "CORRELATED_JOURNEY_EVIDENCE_MISSING"
        | "FAILURE_RECOVERY_SCENARIO_NOT_PASSED"
        | "LIVE_ZOHO_WIRING_NOT_WIRED"
        | "COMMERCE_POLLUTION_REFUSED"
        | "PRODUCTION_ENVIRONMENT_REFUSED";
      environmentBound: boolean;
      formCrmContractReady: boolean;
      canaryGrantReady: boolean;
      bookingMatrixReady: boolean;
      journeyEvidenceReady: boolean;
      failureRecoveryPassed: boolean;
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      commercialExcluded: true;
      fixtureOnly: true;
      evidence: null;
      reasons: string[];
    };

export const CRM_FORMS_BOOKING_MAP_RELATED_CASE_IDS = [
  "T-US-019",
  "T-F10",
] as const;

export type FailureRecoveryScenarioResult = {
  scenarioId: string;
  injectedFailureStage: "CRM_WRITE" | "BOOKING_RECEIPT" | "FORM_ACCEPT";
  recovered: boolean;
  commercialExcluded: true;
  liveZohoWiring: "NOT_WIRED";
  externalEffects: "NONE";
  fixtureOnly: true;
  details: string[];
};

/**
 * Run a fixture-only failure→recovery scenario for the mapped pilot journey.
 * Never contacts live Zoho; synthetics stay commercially excluded.
 */
export function runCrmFormsBookingFailureRecovery(input: {
  scenarioId: string;
  injectedFailureStage: FailureRecoveryScenarioResult["injectedFailureStage"];
  retrySucceeded: boolean;
}): FailureRecoveryScenarioResult {
  const scenarioId = input.scenarioId.trim();
  if (!scenarioId) {
    throw new Error("failure/recovery scenarioId required");
  }
  return {
    scenarioId,
    injectedFailureStage: input.injectedFailureStage,
    recovered: input.retrySucceeded,
    commercialExcluded: true,
    liveZohoWiring: "NOT_WIRED",
    externalEffects: "NONE",
    fixtureOnly: true,
    details: [
      `Injected ${input.injectedFailureStage} failure on fixture canary`,
      input.retrySucceeded
        ? "Retry/recovery passed without live Zoho effects"
        : "Retry/recovery did not pass",
      "commercialExcluded=true externalEffects=NONE",
    ],
  };
}

function envBound(input: CrmFormsBookingMapInput): boolean {
  return (
    !!input.organizationId &&
    input.organizationId.trim() !== "" &&
    !!input.region &&
    input.region.trim() !== "" &&
    (input.environment === CrmMapEnvironment.FIXTURE ||
      input.environment === CrmMapEnvironment.SANDBOX)
  );
}

function formReady(input: CrmFormsBookingMapInput): boolean {
  return (
    input.formCrmContractPresent &&
    Number.isFinite(input.formFieldCount) &&
    input.formFieldCount > 0 &&
    Number.isFinite(input.assignmentRuleCount) &&
    input.assignmentRuleCount > 0
  );
}

function canaryReady(input: CrmFormsBookingMapInput): boolean {
  return (
    input.canaryGrantPresent &&
    input.retentionPolicyPresent &&
    !!input.retentionPolicyId &&
    input.retentionPolicyId.trim() !== ""
  );
}

function bookingReady(input: CrmFormsBookingMapInput): boolean {
  if (
    !input.bookingCapabilityMatrixPresent ||
    !input.bookingCapabilities ||
    input.bookingCapabilities.length === 0
  ) {
    return false;
  }
  const allowed = new Set<string>(FIXTURE_BOOKING_CAPABILITIES);
  return input.bookingCapabilities.every((c) => allowed.has(c));
}

function journeyReady(input: CrmFormsBookingMapInput): boolean {
  return (
    input.correlatedJourneyEvidencePresent &&
    !!input.correlationId &&
    input.correlationId.trim() !== ""
  );
}

function recoveryReady(input: CrmFormsBookingMapInput): boolean {
  return (
    input.failureRecoveryScenarioPassed &&
    !!input.failureRecoveryScenarioId &&
    input.failureRecoveryScenarioId.trim() !== ""
  );
}

/**
 * Evaluate CRM / forms / booking map readiness with a passing
 * failure→recovery scenario. Live Zoho and commerce pollution refused.
 */
export function evaluateCrmFormsBookingMap(
  input: CrmFormsBookingMapInput,
): CrmFormsBookingMapDecision {
  const base = {
    liveZohoWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    commercialExcluded: true as const,
    fixtureOnly: true as const,
    evidence: null as null,
  };

  const environmentBound = envBound(input);
  const formCrmContractReady = formReady(input);
  const canaryGrantReady = canaryReady(input);
  const bookingMatrixReady = bookingReady(input);
  const journeyEvidenceReady = journeyReady(input);
  const failureRecoveryPassed = recoveryReady(input);

  if (input.requestLiveZohoWiring) {
    return {
      allowed: false,
      code: "LIVE_ZOHO_WIRING_NOT_WIRED",
      environmentBound,
      formCrmContractReady,
      canaryGrantReady,
      bookingMatrixReady,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Live Zoho wiring remains NOT_WIRED — refuse live CRM map (T-US-019)",
      ],
    };
  }

  if (input.countSyntheticInCommerce) {
    return {
      allowed: false,
      code: "COMMERCE_POLLUTION_REFUSED",
      environmentBound,
      formCrmContractReady,
      canaryGrantReady,
      bookingMatrixReady,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Synthetic canary records must not enter commerce denominators (T-US-019)",
      ],
    };
  }

  if (input.environment === CrmMapEnvironment.PRODUCTION) {
    return {
      allowed: false,
      code: "PRODUCTION_ENVIRONMENT_REFUSED",
      environmentBound: false,
      formCrmContractReady,
      canaryGrantReady,
      bookingMatrixReady,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Production Zoho environment refused for offline fixture map (T-US-019)",
      ],
    };
  }

  if (
    input.bookingCapabilities?.includes(BookingCapability.MUTATE_LIVE) === true
  ) {
    return {
      allowed: false,
      code: "BOOKING_LIVE_MUTATE_REFUSED",
      environmentBound,
      formCrmContractReady,
      canaryGrantReady,
      bookingMatrixReady: false,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Booking MUTATE_LIVE capability refused on fixture map surface (T-US-019)",
      ],
    };
  }

  if (!environmentBound) {
    return {
      allowed: false,
      code: "ENVIRONMENT_BINDING_MISSING",
      environmentBound: false,
      formCrmContractReady,
      canaryGrantReady,
      bookingMatrixReady,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Exact Zoho organization, region, and fixture/sandbox environment required (T-US-019 / T-F10)",
      ],
    };
  }

  if (!formCrmContractReady) {
    return {
      allowed: false,
      code: "FORM_CRM_CONTRACT_INCOMPLETE",
      environmentBound: true,
      formCrmContractReady: false,
      canaryGrantReady,
      bookingMatrixReady,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Form→CRM field map and assignment rules required (T-US-019 / T-F10)",
      ],
    };
  }

  if (!canaryGrantReady) {
    return {
      allowed: false,
      code: "CANARY_GRANT_OR_RETENTION_MISSING",
      environmentBound: true,
      formCrmContractReady: true,
      canaryGrantReady: false,
      bookingMatrixReady,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Server canary grant and synthetic retention policy required (T-US-019 / T-F10)",
      ],
    };
  }

  if (!bookingMatrixReady) {
    return {
      allowed: false,
      code: "BOOKING_CAPABILITY_MATRIX_MISSING",
      environmentBound: true,
      formCrmContractReady: true,
      canaryGrantReady: true,
      bookingMatrixReady: false,
      journeyEvidenceReady,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Booking inventory/receipt capability matrix required (fixture capabilities only) (T-US-019 / T-F10)",
      ],
    };
  }

  if (!journeyEvidenceReady) {
    return {
      allowed: false,
      code: "CORRELATED_JOURNEY_EVIDENCE_MISSING",
      environmentBound: true,
      formCrmContractReady: true,
      canaryGrantReady: true,
      bookingMatrixReady: true,
      journeyEvidenceReady: false,
      failureRecoveryPassed,
      ...base,
      reasons: [
        "Correlated form→CRM→booking journey evidence required (T-US-019 / T-F10)",
      ],
    };
  }

  if (!failureRecoveryPassed) {
    return {
      allowed: false,
      code: "FAILURE_RECOVERY_SCENARIO_NOT_PASSED",
      environmentBound: true,
      formCrmContractReady: true,
      canaryGrantReady: true,
      bookingMatrixReady: true,
      journeyEvidenceReady: true,
      failureRecoveryPassed: false,
      ...base,
      reasons: [
        "Passing failure/recovery scenario required before map ACCEPTED (T-US-019 / T-F10)",
      ],
    };
  }

  return {
    allowed: true,
    code: "MAP_CRM_FORMS_BOOKING_READY",
    environmentBound: true,
    formCrmContractReady: true,
    canaryGrantReady: true,
    bookingMatrixReady: true,
    journeyEvidenceReady: true,
    failureRecoveryPassed: true,
    liveZohoWiring: "NOT_WIRED",
    externalEffects: "NONE",
    commercialExcluded: true,
    fixtureOnly: true,
    evidence: {
      environmentBindingId: `env-${input.organizationId}-${input.region}-${input.environment}`,
      formCrmContractId: `form-crm-fields-${input.formFieldCount}-rules-${input.assignmentRuleCount}`,
      canaryGrantRetentionId: input.retentionPolicyId!,
      bookingCapabilityMatrixId: `booking-caps-${(input.bookingCapabilities ?? []).join("+")}`,
      correlatedJourneyId: input.correlationId!,
      failureRecoveryScenarioId: input.failureRecoveryScenarioId!,
    },
    reasons: [
      "CRM/forms/booking map ready with passing failure/recovery scenario",
      `organization=${input.organizationId} region=${input.region} environment=${input.environment}`,
      `formFields=${input.formFieldCount} assignmentRules=${input.assignmentRuleCount}`,
      `canaryGrant=true retention=${input.retentionPolicyId}`,
      `bookingCapabilities=${(input.bookingCapabilities ?? []).join(",")}`,
      `correlationId=${input.correlationId}`,
      `failureRecoveryScenarioId=${input.failureRecoveryScenarioId}`,
      "liveZohoWiring=NOT_WIRED commercialExcluded=true externalEffects=NONE",
    ],
  };
}
