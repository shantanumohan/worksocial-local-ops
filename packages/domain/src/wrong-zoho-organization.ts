/**
 * T-X051 — Wrong Zoho organization: identity mismatch blocks.
 *
 * Bound CRM organization identity must match the observed Zoho organization
 * before any CRM write/bind. Mismatch fails closed with IDENTITY_MISMATCH —
 * no silent cross-org write. Live Zoho remains NOT_WIRED.
 *
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE. Live provider wiring: NOT_WIRED.
 */

export const WRONG_ZOHO_ORGANIZATION_RELATED_CASE_IDS = ["T-X051"] as const;

export const ZohoOrganizationEnvironment = {
  FIXTURE: "fixture",
  SANDBOX: "sandbox",
  PRODUCTION: "production",
} as const;

export type ZohoOrganizationEnvironmentValue =
  (typeof ZohoOrganizationEnvironment)[keyof typeof ZohoOrganizationEnvironment];

export const ZohoOrganizationDecisionCode = {
  /** Expected and observed org ids match in fixture — bind allowed (not live). */
  MATCHED_FIXTURE: "MATCHED_FIXTURE",
  /** Observed org differs from expected — block. */
  IDENTITY_MISMATCH: "IDENTITY_MISMATCH",
  /** Expected org id missing/blank — block. */
  MISSING_EXPECTED_ORG: "MISSING_EXPECTED_ORG",
  /** Observed org id missing/blank — block. */
  MISSING_OBSERVED_ORG: "MISSING_OBSERVED_ORG",
  /** Matching ids but non-fixture / claimed live wiring — block write. */
  LIVE_TRANSPORT_NOT_WIRED: "LIVE_TRANSPORT_NOT_WIRED",
} as const;

export type ZohoOrganizationDecisionCodeValue =
  (typeof ZohoOrganizationDecisionCode)[keyof typeof ZohoOrganizationDecisionCode];

export type ValidateZohoOrganizationBindingInput = {
  /** Pilot/workspace expected Zoho organization id. */
  expectedOrganizationId: string;
  /** Organization id observed from connected session/token. */
  observedOrganizationId: string;
  environment: ZohoOrganizationEnvironmentValue | string;
  /** Live Zoho transport wiring — fixture proofs keep NOT_WIRED. */
  liveZohoWiring: "NOT_WIRED" | "WIRED";
  operation: "bind" | "crm_write" | "read_identity";
};

type Honesty = {
  externalEffects: "NONE";
  liveProviderWiring: "NOT_WIRED";
};

export type ValidateZohoOrganizationBindingResult =
  | ({
      ok: true;
      code: typeof ZohoOrganizationDecisionCode.MATCHED_FIXTURE;
      allowCrmWrite: true;
      reason: string;
    } & Honesty)
  | ({
      ok: false;
      code: Exclude<
        ZohoOrganizationDecisionCodeValue,
        typeof ZohoOrganizationDecisionCode.MATCHED_FIXTURE
      >;
      allowCrmWrite: false;
      reason: string;
    } & Honesty);

function normalizeOrgId(raw: string): string {
  return raw.trim();
}

function honesty(): Honesty {
  return {
    externalEffects: "NONE",
    liveProviderWiring: "NOT_WIRED",
  };
}

/**
 * Validate that the observed Zoho organization matches the expected binding.
 * Wrong organization → IDENTITY_MISMATCH; CRM write blocked.
 * Live / WIRED / non-fixture paths never invent success.
 */
export function validateZohoOrganizationBinding(
  input: ValidateZohoOrganizationBindingInput,
): ValidateZohoOrganizationBindingResult {
  const expected = normalizeOrgId(input.expectedOrganizationId);
  const observed = normalizeOrgId(input.observedOrganizationId);

  if (!expected) {
    return {
      ok: false,
      code: ZohoOrganizationDecisionCode.MISSING_EXPECTED_ORG,
      allowCrmWrite: false,
      reason: "Expected Zoho organization id is required — refuse bind/write",
      ...honesty(),
    };
  }

  if (!observed) {
    return {
      ok: false,
      code: ZohoOrganizationDecisionCode.MISSING_OBSERVED_ORG,
      allowCrmWrite: false,
      reason:
        "Observed Zoho organization id is missing — identity mismatch blocks",
      ...honesty(),
    };
  }

  if (expected !== observed) {
    return {
      ok: false,
      code: ZohoOrganizationDecisionCode.IDENTITY_MISMATCH,
      allowCrmWrite: false,
      reason: `Wrong Zoho organization: expected=${expected} observed=${observed} — identity mismatch blocks ${input.operation}`,
      ...honesty(),
    };
  }

  const env = String(input.environment).trim().toLowerCase();
  const isFixture = env === ZohoOrganizationEnvironment.FIXTURE;

  // Fixture path still refuses claimed live wiring — never invent VERIFIED.
  if (!isFixture || input.liveZohoWiring !== "NOT_WIRED") {
    return {
      ok: false,
      code: ZohoOrganizationDecisionCode.LIVE_TRANSPORT_NOT_WIRED,
      allowCrmWrite: false,
      reason:
        input.liveZohoWiring === "WIRED"
          ? "Zoho CRM write refused while liveZohoWiring=WIRED — live transport NOT_WIRED; no invented live success (T-X051)"
          : "Zoho CRM write refused outside fixture NOT_WIRED path — no invented live success",
      ...honesty(),
    };
  }

  return {
    ok: true,
    code: ZohoOrganizationDecisionCode.MATCHED_FIXTURE,
    allowCrmWrite: true,
    reason:
      "Fixture Zoho organization identity matched — CRM write allowed in fixture only (not live VERIFIED); liveProviderWiring=NOT_WIRED",
    ...honesty(),
  };
}
