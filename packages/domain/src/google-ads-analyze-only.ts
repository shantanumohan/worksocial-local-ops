/**
 * T-US-011 — Connect Google Ads analyze-only (F06/SC-18): write disabled.
 *
 * Behavior-acceptance save/reload summary (distinct from T-F06 complete F06
 * evidence package): persist an analyze-only binding with deny-write, inventory
 * + mapping honesty, read receipt + source watermark, then reload it from an
 * in-memory fixture store. Spending / mutate authority stays disabled. Live
 * Ads transport remains NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import {
  AnalyticsEnvironment,
  type AnalyticsEnvironmentValue,
} from "./analytics.js";
import {
  ConnectionState,
  VerificationState,
  WriteReadiness,
  buildProviderStatusView,
  type ProviderStatusView,
} from "./connection-status.js";
import {
  GoogleAdsCapability,
  REQUIRED_GOOGLE_ADS_GRANT_SCOPES,
  type GoogleAdsCampaignSnapshot,
  type GoogleAdsCapabilityValue,
  type GoogleAdsConversionAction,
  type GoogleAdsEventMapping,
} from "./connect-google-ads-controlled-analysis.js";
import {
  GoogleAdsAccessTier,
  type GoogleAdsAccessTierValue,
} from "./google-ads-test-production-access.js";
import { PaidMediaWiring, type PaidMediaWiringValue } from "./paid-media.js";

export type GoogleAdsAnalyzeOnlyInput = {
  nowIso: string;
  connectionId: string;
  identitySubject: string;
  /** OAuth / grant scopes (redacted evidence — names only). */
  grantScopes: readonly string[];
  clientCustomerId: string;
  managerCustomerId: string | null;
  accountTier: GoogleAdsAccessTierValue;
  environment: AnalyticsEnvironmentValue;
  campaigns: readonly GoogleAdsCampaignSnapshot[];
  conversionActions: readonly GoogleAdsConversionAction[];
  eventMappings: readonly GoogleAdsEventMapping[];
  /** Initial capability — must be ANALYZE_ONLY for a successful save. */
  capability: GoogleAdsCapabilityValue;
  /** Application-level deny-write consent recorded. */
  denyWriteConsent: boolean;
  /**
   * Source revision watermark for the supplied Ads inventory (F06 evidence).
   * Required for a successful analyze-only bind.
   */
  sourceWatermark: string;
};

export type GoogleAdsAnalyzeOnlyBinding = {
  connectionId: string;
  clientCustomerId: string;
  managerCustomerId: string | null;
  accountTier: GoogleAdsAccessTierValue;
  accountTierBadge: string;
  capability: typeof GoogleAdsCapability.ANALYZE_ONLY;
  connectionState: typeof ConnectionState.READ_READY;
  writeReadiness: typeof WriteReadiness.NOT_AUTHORIZED;
  writeDisabled: true;
  spendingAuthorityEnabled: false;
  status: ProviderStatusView;
  campaignCount: number;
  conversionActionCount: number;
  mappedConversionCount: number;
  discrepancyTasks: string[];
  wiring: PaidMediaWiringValue;
  liveMutationWiring: "NOT_WIRED";
  environment: AnalyticsEnvironmentValue;
  /** When the fixture inventory read was accepted into the binding. */
  readReceiptAtIso: string;
  sourceWatermark: string;
  externalEffects: "NONE";
  reasons: string[];
};

export type GoogleAdsAnalyzeOnlyResult =
  | ({ ok: true } & GoogleAdsAnalyzeOnlyBinding)
  | {
      ok: false;
      code:
        | "WRITE_CAPABILITY_REFUSED"
        | "LIVE_TRANSPORT_NOT_WIRED"
        | "ENVIRONMENT_UNAVAILABLE"
        | "MISSING_IDENTITY"
        | "MISSING_ADS_SCOPE"
        | "MISSING_CUSTOMER"
        | "DENY_WRITE_CONSENT_REQUIRED"
        | "INVENTORY_EMPTY"
        | "INVENTORY_INVALID"
        | "MAPPING_INCOMPLETE"
        | "MISSING_SOURCE_WATERMARK"
        | "PRODUCTION_TIER_ON_FIXTURE_REFUSED";
      reasons: string[];
      externalEffects: "NONE";
      writeDisabled: true;
      spendingAuthorityEnabled: false;
    };

export const CONNECT_GOOGLE_ADS_ANALYZE_ONLY_RELATED_CASE_IDS = [
  "T-US-011",
  "T-F06",
] as const;

/** In-memory fixture repository — proves binding survives save→reload. */
export type GoogleAdsAnalyzeOnlyFixtureStore = {
  byConnectionId: Map<string, GoogleAdsAnalyzeOnlyBinding>;
};

export function createGoogleAdsAnalyzeOnlyFixtureStore(): GoogleAdsAnalyzeOnlyFixtureStore {
  return { byConnectionId: new Map() };
}

export function persistGoogleAdsAnalyzeOnlyBinding(
  store: GoogleAdsAnalyzeOnlyFixtureStore,
  binding: GoogleAdsAnalyzeOnlyBinding,
): GoogleAdsAnalyzeOnlyBinding {
  const copy: GoogleAdsAnalyzeOnlyBinding = {
    ...binding,
    discrepancyTasks: [...binding.discrepancyTasks],
    reasons: [...binding.reasons],
    status: { ...binding.status, labels: { ...binding.status.labels } },
  };
  store.byConnectionId.set(copy.connectionId, copy);
  return copy;
}

export function loadGoogleAdsAnalyzeOnlyBinding(
  store: GoogleAdsAnalyzeOnlyFixtureStore,
  connectionId: string,
): GoogleAdsAnalyzeOnlyBinding | null {
  const found = store.byConnectionId.get(connectionId);
  if (!found) return null;
  return {
    ...found,
    discrepancyTasks: [...found.discrepancyTasks],
    reasons: [...found.reasons],
    status: { ...found.status, labels: { ...found.status.labels } },
  };
}

function hasGoogleAdsScope(scopes: readonly string[]): boolean {
  const normalized = scopes.map((s) => s.trim()).filter(Boolean);
  return normalized.some((s) =>
    (REQUIRED_GOOGLE_ADS_GRANT_SCOPES as readonly string[]).includes(s),
  );
}

function uniqueNonblankIds(ids: readonly string[]): boolean {
  const trimmed = ids.map((id) => id.trim());
  if (trimmed.some((id) => !id)) return false;
  return new Set(trimmed).size === trimmed.length;
}

/**
 * Save a fixture Google Ads connection as analyze-only with write disabled.
 * Never authorizes spend mutations or live transport.
 */
export function saveGoogleAdsAnalyzeOnlyConnection(
  input: GoogleAdsAnalyzeOnlyInput,
): GoogleAdsAnalyzeOnlyResult {
  if (input.capability === GoogleAdsCapability.WRITE) {
    return {
      ok: false,
      code: "WRITE_CAPABILITY_REFUSED",
      reasons: [
        "Google Ads initial capability must be Analyze only — spending / mutate authority disabled (T-US-011)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!input.denyWriteConsent) {
    return {
      ok: false,
      code: "DENY_WRITE_CONSENT_REQUIRED",
      reasons: [
        "Consent plus application-level deny-write rule required before analyze-only bind",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!input.identitySubject.trim()) {
    return {
      ok: false,
      code: "MISSING_IDENTITY",
      reasons: ["Connection identity is required"],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!hasGoogleAdsScope(input.grantScopes)) {
    return {
      ok: false,
      code: "MISSING_ADS_SCOPE",
      reasons: [
        "A nonblank supported Google Ads grant scope is required (https://www.googleapis.com/auth/adwords)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!input.clientCustomerId.trim()) {
    return {
      ok: false,
      code: "MISSING_CUSTOMER",
      reasons: ["Client customer id is required for Ads account binding"],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (!input.sourceWatermark.trim()) {
    return {
      ok: false,
      code: "MISSING_SOURCE_WATERMARK",
      reasons: [
        "Source watermark required for Ads inventory read receipt (F06 / T-US-011)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (input.environment === AnalyticsEnvironment.LIVE) {
    return {
      ok: false,
      code: "LIVE_TRANSPORT_NOT_WIRED",
      reasons: [
        "Live Google Ads connect refused — live Ads query/mutate transport remains NOT_WIRED",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (
    input.environment === AnalyticsEnvironment.NOT_WIRED ||
    input.environment === AnalyticsEnvironment.UNAVAILABLE
  ) {
    return {
      ok: false,
      code: "ENVIRONMENT_UNAVAILABLE",
      reasons: [
        `Environment ${input.environment} cannot supply Ads inventory — refuse READ_READY`,
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (
    input.accountTier === GoogleAdsAccessTier.PRODUCTION &&
    input.environment === AnalyticsEnvironment.FIXTURE
  ) {
    return {
      ok: false,
      code: "PRODUCTION_TIER_ON_FIXTURE_REFUSED",
      reasons: [
        "Fixture environment cannot claim PRODUCTION account tier — use TEST badge (T-US-011 / T-US-012)",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  if (input.campaigns.length === 0 || input.conversionActions.length === 0) {
    return {
      ok: false,
      code: "INVENTORY_EMPTY",
      reasons: [
        "Bounded campaign and conversion-action inventory required for analyze-only readiness",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  const campaignIds = input.campaigns.map((c) => c.campaignId);
  const conversionIds = input.conversionActions.map((c) => c.conversionActionId);
  if (!uniqueNonblankIds(campaignIds) || !uniqueNonblankIds(conversionIds)) {
    return {
      ok: false,
      code: "INVENTORY_INVALID",
      reasons: [
        "Campaign and conversion-action ids must be nonblank and unique",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  const conversionIdSet = new Set(
    input.conversionActions.map((c) => c.conversionActionId.trim()),
  );
  const mappingIds = input.eventMappings.map((m) => m.conversionActionId.trim());
  if (mappingIds.some((id) => !id || !conversionIdSet.has(id))) {
    return {
      ok: false,
      code: "MAPPING_INCOMPLETE",
      reasons: [
        "Every event mapping must reference a conversion-action id present in inventory",
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }
  if (!uniqueNonblankIds(mappingIds)) {
    return {
      ok: false,
      code: "MAPPING_INCOMPLETE",
      reasons: ["Event mapping conversion-action ids must be unique"],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  const mappingById = new Map(
    input.eventMappings.map((m) => [m.conversionActionId.trim(), m] as const),
  );
  const discrepancyTasks: string[] = [];
  let mappedConversionCount = 0;
  for (const action of input.conversionActions) {
    const id = action.conversionActionId.trim();
    const mapping = mappingById.get(id);
    if (!mapping) {
      discrepancyTasks.push(
        `${id}/${action.name}: missing event-dictionary mapping`,
      );
      continue;
    }
    if (mapping.mapped) {
      mappedConversionCount += 1;
    } else {
      discrepancyTasks.push(
        `${id}/${mapping.businessOutcome}: ${mapping.discrepancyReason ?? "unmapped"}`,
      );
    }
  }
  if (discrepancyTasks.some((t) => t.includes("missing event-dictionary"))) {
    return {
      ok: false,
      code: "MAPPING_INCOMPLETE",
      reasons: [
        "Every conversion action requires an event-dictionary mapping entry (mapped or explicit discrepancy)",
        ...discrepancyTasks.filter((t) => t.includes("missing event-dictionary")),
      ],
      externalEffects: "NONE",
      writeDisabled: true,
      spendingAuthorityEnabled: false,
    };
  }

  const status = buildProviderStatusView({
    providerId: "google_ads",
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.ACCEPTED_PENDING,
  });

  const wiring: PaidMediaWiringValue = PaidMediaWiring.FIXTURE;
  const accountTierBadge =
    input.accountTier === GoogleAdsAccessTier.TEST
      ? "TEST (fixture analyze-only)"
      : "PRODUCTION";
  const sourceWatermark = input.sourceWatermark.trim();
  const readReceiptAtIso = input.nowIso;

  return {
    ok: true,
    connectionId: input.connectionId,
    clientCustomerId: input.clientCustomerId,
    managerCustomerId: input.managerCustomerId,
    accountTier: input.accountTier,
    accountTierBadge,
    capability: GoogleAdsCapability.ANALYZE_ONLY,
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    writeDisabled: true,
    spendingAuthorityEnabled: false,
    status,
    campaignCount: input.campaigns.length,
    conversionActionCount: input.conversionActions.length,
    mappedConversionCount,
    discrepancyTasks,
    wiring,
    liveMutationWiring: "NOT_WIRED",
    environment: input.environment,
    readReceiptAtIso,
    sourceWatermark,
    externalEffects: "NONE",
    reasons: [
      `Google Ads client ${input.clientCustomerId} bound as READ_READY / ANALYZE_ONLY`,
      `Account tier badge: ${accountTierBadge}`,
      `Campaigns=${input.campaigns.length}; conversionActions=${input.conversionActions.length}; mapped=${mappedConversionCount}; discrepancies=${discrepancyTasks.length}`,
      `Read receipt at ${readReceiptAtIso}; source watermark=${sourceWatermark}`,
      "Spending authority disabled — deny-write consent recorded",
      "Acceptance pending — not live VERIFIED; externalEffects=NONE",
    ],
  };
}

/** Convenience fixture Ads inventory (never LIVE). */
export function fixtureGoogleAdsAnalyzeOnlyInput(overrides?: {
  nowIso?: string;
  connectionId?: string;
  capability?: GoogleAdsCapabilityValue;
  environment?: AnalyticsEnvironmentValue;
  accountTier?: GoogleAdsAccessTierValue;
  denyWriteConsent?: boolean;
  clientCustomerId?: string;
  grantScopes?: readonly string[];
  sourceWatermark?: string;
  campaigns?: readonly GoogleAdsCampaignSnapshot[];
  conversionActions?: readonly GoogleAdsConversionAction[];
  eventMappings?: readonly GoogleAdsEventMapping[];
}): GoogleAdsAnalyzeOnlyInput {
  return {
    nowIso: overrides?.nowIso ?? "2026-11-22T20:00:00.000Z",
    connectionId: overrides?.connectionId ?? "gads-conn-fixture-011",
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes:
      overrides?.grantScopes ?? ["https://www.googleapis.com/auth/adwords"],
    clientCustomerId: overrides?.clientCustomerId ?? "111-222-3333",
    managerCustomerId: "999-888-7777",
    accountTier: overrides?.accountTier ?? GoogleAdsAccessTier.TEST,
    environment: overrides?.environment ?? AnalyticsEnvironment.FIXTURE,
    campaigns: overrides?.campaigns ?? [
      {
        campaignId: "camp-search-011",
        name: "Fixture Search — coworking",
        status: "ENABLED",
      },
      {
        campaignId: "camp-pmax-011",
        name: "Fixture PMax — tours",
        status: "PAUSED",
      },
    ],
    conversionActions: overrides?.conversionActions ?? [
      {
        conversionActionId: "conv-lead-011",
        name: "generate_lead",
        category: "SUBMIT_LEAD_FORM",
      },
      {
        conversionActionId: "conv-tour-011",
        name: "tour_request",
        category: "CONTACT",
      },
    ],
    eventMappings: overrides?.eventMappings ?? [
      {
        conversionActionId: "conv-lead-011",
        businessOutcome: "qualified_lead",
        mapped: true,
        discrepancyReason: null,
      },
      {
        conversionActionId: "conv-tour-011",
        businessOutcome: "tour_booked",
        mapped: false,
        discrepancyReason: "tour intent not mapped to CRM booking",
      },
    ],
    capability: overrides?.capability ?? GoogleAdsCapability.ANALYZE_ONLY,
    denyWriteConsent: overrides?.denyWriteConsent ?? true,
    sourceWatermark:
      overrides?.sourceWatermark ?? "fixture-ads-inventory-wm-011",
  };
}
