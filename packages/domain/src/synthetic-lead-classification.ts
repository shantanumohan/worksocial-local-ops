/**
 * T-US-020 — Synthetic leads classified; no commerce pollution.
 *
 * Offline fixture gate: a canary/synthetic lead must be explicitly classified
 * (`synthetic=true` + `ws_synthetic=true` + correlation) and must never enter
 * commerce denominators. Unclassified leads and synthetic+countedInCommerce
 * are refused. Live Zoho stays NOT_WIRED. Distinct from T-X052 (conversion
 * contamination) and T-X050 (public flag requires server grant).
 * Pure domain — no network I/O. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 * External effects: NONE.
 */

export type SyntheticLeadClassificationInput = {
  /** Domain synthetic flag on the lead/canary intent. */
  synthetic: boolean;
  /** Observed CRM/form field value for ws_synthetic (must be "true"). */
  wsSyntheticField: string | null;
  /** Journey / canary correlation id (non-empty). */
  correlationId: string;
  /** Observed CRM field value for ws_correlation_id. */
  wsCorrelationIdField: string | null;
  /** Attempt to count this lead into commerce denominators. */
  countInCommerce: boolean;
  /** Request live Zoho write/read — must stay NOT_WIRED offline. */
  requestLiveZohoWiring: boolean;
};

export type SyntheticLeadClassificationDecision =
  | {
      allowed: true;
      code: "SYNTHETIC_LEAD_CLASSIFIED_COMMERCIAL_EXCLUDED";
      classified: true;
      commercialExcluded: true;
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "NOT_CLASSIFIED_AS_SYNTHETIC"
        | "CORRELATION_MISMATCH"
        | "COMMERCE_POLLUTION_REFUSED"
        | "LIVE_ZOHO_WIRING_NOT_WIRED";
      classified: boolean;
      commercialExcluded: true;
      liveZohoWiring: "NOT_WIRED";
      externalEffects: "NONE";
      reasons: string[];
    };

export const SYNTHETIC_LEAD_CLASSIFICATION_RELATED_CASE_IDS = [
  "T-US-020",
  "T-F20",
] as const;

/**
 * Classify a synthetic/canary lead and refuse commerce pollution.
 * Happy path requires synthetic + ws_synthetic=true + matching correlation
 * and countInCommerce=false. Live Zoho remains NOT_WIRED.
 */
export function evaluateSyntheticLeadClassification(
  input: SyntheticLeadClassificationInput,
): SyntheticLeadClassificationDecision {
  const base = {
    commercialExcluded: true as const,
    liveZohoWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
  };

  if (input.requestLiveZohoWiring) {
    return {
      allowed: false,
      code: "LIVE_ZOHO_WIRING_NOT_WIRED",
      classified: false,
      ...base,
      reasons: [
        "Live Zoho CRM write/read remains NOT_WIRED — refuse live wiring (T-US-020)",
      ],
    };
  }

  if (!input.correlationId.trim()) {
    return {
      allowed: false,
      code: "NOT_CLASSIFIED_AS_SYNTHETIC",
      classified: false,
      ...base,
      reasons: ["Synthetic lead requires a non-empty correlationId (T-US-020)"],
    };
  }

  const wsSyntheticOk = input.wsSyntheticField === "true";
  const classified = input.synthetic === true && wsSyntheticOk;

  if (!classified) {
    return {
      allowed: false,
      code: "NOT_CLASSIFIED_AS_SYNTHETIC",
      classified: false,
      ...base,
      reasons: [
        "Lead is not classified as synthetic (synthetic=true and ws_synthetic=true required) (T-US-020)",
      ],
    };
  }

  if (input.wsCorrelationIdField !== input.correlationId) {
    return {
      allowed: false,
      code: "CORRELATION_MISMATCH",
      classified: true,
      ...base,
      reasons: [
        "ws_correlation_id must match journey correlationId for classified synthetic leads (T-US-020)",
      ],
    };
  }

  if (input.countInCommerce) {
    return {
      allowed: false,
      code: "COMMERCE_POLLUTION_REFUSED",
      classified: true,
      ...base,
      reasons: [
        "Synthetic/canary leads must not be countedInCommerce — commerce pollution refused (T-US-020)",
      ],
    };
  }

  return {
    allowed: true,
    code: "SYNTHETIC_LEAD_CLASSIFIED_COMMERCIAL_EXCLUDED",
    classified: true,
    ...base,
    reasons: [
      "Synthetic lead classified (synthetic + ws_synthetic); commercialExcluded; live NOT_WIRED (T-US-020)",
    ],
  };
}
