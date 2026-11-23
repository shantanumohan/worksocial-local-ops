/**
 * T-F05 — Connect Search Console and organic visibility (complete F05 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F05 evidence
 * package — identity + scopes + API readiness, exact domain or URL-prefix
 * property binding, comparable-query configuration (country, device, search
 * type, comparison window), observation batch with coverage notes + sitemap
 * status, high-value intent→page mapping, and daily read schedule with source
 * watermark. Incomplete packages, write saves, invented zero demand from
 * omitted rows, and false live-verified claims are refused. Live provider
 * wiring stays NOT_WIRED. Pure domain — no network I/O. Fixture ACCEPTED ≠
 * sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from open T-US-009 behavior acceptance
 * (`CONNECT_GSC_SCHEDULE_WATERMARK`) — this records the complete F05 flow
 * evidence package, not the schedule/watermark summary alone.
 */

export const REQUIRED_GSC_GRANT_SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
] as const;

export const GscPropertyKind = {
  DOMAIN: "domain",
  URL_PREFIX: "url_prefix",
} as const;

export type GscPropertyKindValue =
  (typeof GscPropertyKind)[keyof typeof GscPropertyKind];

export type GscConnectionIdentity = {
  subject: string;
  grantScopes: readonly string[];
  /** API readiness flag — must be true for a complete package. */
  apiEnabled: boolean;
};

export type GscPropertyBinding = {
  kind: GscPropertyKindValue;
  /** Domain property (e.g. sc-domain:example.com) or URL-prefix URL. */
  propertyId: string;
  siteBindingId: string;
  displayName: string;
};

export type GscComparableQueryConfig = {
  country: string;
  device: string;
  searchType: string;
  comparisonWindowDays: number;
};

export type GscObservationRow = {
  queryOrPage: string;
  clicks: number | null;
  impressions: number | null;
  coverageNote: string;
  /** When true, demand must stay UNKNOWN — never invent zero. */
  omitted: boolean;
};

export type GscObservationBatch = {
  providerRequestId: string;
  sitemapStatus: string;
  rows: readonly GscObservationRow[];
};

export type GscIntentToPageMapping = {
  intent: string;
  pagePath: string;
  highValue: boolean;
};

export type GscDailyReadSchedule = {
  cadence: "daily";
  nextReadAtIso: string;
  sourceWatermark: string;
  writeAuthorized: false;
};

export type ConnectSearchConsoleOrganicVisibilityInput = {
  packageId: string;
  connectionIdentity: GscConnectionIdentity;
  propertyBinding: GscPropertyBinding;
  comparableQuery: GscComparableQueryConfig;
  observationBatch: GscObservationBatch;
  intentToPageMappings: readonly GscIntentToPageMapping[];
  dailyReadSchedule: GscDailyReadSchedule;
  /** Attempt a write-capable save — must refuse (read-only). */
  attemptWriteSave: boolean;
  /** Invent zero demand from omitted observation rows — must refuse. */
  inventZeroFromOmittedRows: boolean;
  /** Claim the F05 path is live-verified — must refuse offline. */
  claimLiveVerifiedGsc: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type ConnectSearchConsoleOrganicVisibilityDecision =
  | {
      allowed: true;
      code: "CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        connectionSubject: string;
        grantScopeCount: number;
        apiEnabled: true;
        propertyKind: GscPropertyKindValue;
        propertyId: string;
        siteBindingId: string;
        comparableCountry: string;
        comparableDevice: string;
        comparableSearchType: string;
        comparisonWindowDays: number;
        observationProviderRequestId: string;
        observationRowCount: number;
        omittedRowCount: number;
        sitemapStatus: string;
        intentMappingCount: number;
        highValueIntentCount: number;
        scheduleCadence: "daily";
        nextReadAtIso: string;
        sourceWatermark: string;
        writeAuthorized: false;
        gscVerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F05_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "GSC_CONNECTION_RECORDED_READ_READY";
        recoveryPath: "KEEP_READ_ONLY_EXPOSE_OMITTED_AS_UNKNOWN";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "CONNECTION_IDENTITY_REQUIRED"
        | "PROPERTY_BINDING_REQUIRED"
        | "COMPARABLE_QUERY_CONFIG_REQUIRED"
        | "OBSERVATION_BATCH_REQUIRED"
        | "INTENT_TO_PAGE_MAPPING_REQUIRED"
        | "DAILY_READ_SCHEDULE_REQUIRED"
        | "WRITE_SAVE_REFUSED"
        | "OMITTED_ZERO_DEMAND_CLAIM_REFUSED"
        | "FALSE_LIVE_VERIFIED_GSC_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        connectionSubject: string | null;
        grantScopeCount: number;
        apiEnabled: boolean;
        propertyKind: string | null;
        propertyId: string | null;
        siteBindingId: string | null;
        comparableCountry: string | null;
        comparableDevice: string | null;
        comparableSearchType: string | null;
        comparisonWindowDays: number | null;
        observationProviderRequestId: string | null;
        observationRowCount: number;
        omittedRowCount: number;
        sitemapStatus: string | null;
        intentMappingCount: number;
        highValueIntentCount: number;
        scheduleCadence: string | null;
        nextReadAtIso: string | null;
        sourceWatermark: string | null;
        writeAuthorized: false;
        gscVerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_CONNECTION_IDENTITY"
          | "AWAITING_PROPERTY_BINDING"
          | "AWAITING_COMPARABLE_QUERY"
          | "AWAITING_OBSERVATION_BATCH"
          | "AWAITING_INTENT_MAPPING"
          | "AWAITING_DAILY_SCHEDULE";
        recoveryPath:
          | "RECORD_SCOPES_IDENTITY_AND_API_READINESS"
          | "BIND_DOMAIN_OR_URL_PREFIX_PROPERTY"
          | "SET_COMPARABLE_QUERY_DIMENSIONS"
          | "LOAD_OBSERVATION_BATCH_WITH_COVERAGE"
          | "MAP_HIGH_VALUE_INTENTS_TO_PAGES"
          | "SAVE_DAILY_READ_SCHEDULE_WITH_WATERMARK"
          | "KEEP_READ_ONLY_EXPOSE_OMITTED_AS_UNKNOWN";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_RELATED_CASE_IDS = [
  "T-F05",
] as const;

function preservedInputCount(
  input: ConnectSearchConsoleOrganicVisibilityInput,
): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.connectionIdentity.subject.trim() ? 1 : 0) +
    (input.propertyBinding.propertyId.trim() ? 1 : 0) +
    (input.comparableQuery.country.trim() ? 1 : 0) +
    (input.observationBatch.providerRequestId.trim() ? 1 : 0) +
    (input.dailyReadSchedule.nextReadAtIso.trim() ? 1 : 0)
  );
}

function connectionIdentityOk(id: GscConnectionIdentity): boolean {
  return (
    id.subject.trim().length > 0 &&
    id.apiEnabled === true &&
    id.grantScopes.length > 0 &&
    id.grantScopes.every((s) => s.trim().length > 0) &&
    REQUIRED_GSC_GRANT_SCOPES.every((required) =>
      id.grantScopes.includes(required),
    )
  );
}

function propertyBindingOk(b: GscPropertyBinding): boolean {
  const kindOk =
    b.kind === GscPropertyKind.DOMAIN || b.kind === GscPropertyKind.URL_PREFIX;
  return (
    kindOk &&
    b.propertyId.trim().length > 0 &&
    b.siteBindingId.trim().length > 0 &&
    b.displayName.trim().length > 0
  );
}

function comparableQueryOk(c: GscComparableQueryConfig): boolean {
  return (
    c.country.trim().length > 0 &&
    c.device.trim().length > 0 &&
    c.searchType.trim().length > 0 &&
    Number.isFinite(c.comparisonWindowDays) &&
    c.comparisonWindowDays > 0
  );
}

function observationBatchOk(batch: GscObservationBatch): boolean {
  if (!batch.providerRequestId.trim() || !batch.sitemapStatus.trim()) {
    return false;
  }
  if (batch.rows.length === 0) return false;
  return batch.rows.every((r) => {
    if (!r.queryOrPage.trim() || !r.coverageNote.trim()) return false;
    if (r.omitted) {
      // Omitted rows must not carry invented zeros as measured demand.
      return r.clicks === null && r.impressions === null;
    }
    return (
      r.clicks !== null &&
      r.impressions !== null &&
      Number.isFinite(r.clicks) &&
      Number.isFinite(r.impressions)
    );
  });
}

function intentMappingsOk(
  mappings: readonly GscIntentToPageMapping[],
): boolean {
  if (mappings.length === 0) return false;
  return mappings.every(
    (m) => m.intent.trim().length > 0 && m.pagePath.trim().length > 0,
  );
}

function dailyScheduleOk(s: GscDailyReadSchedule): boolean {
  return (
    s.cadence === "daily" &&
    s.nextReadAtIso.trim().length > 0 &&
    s.sourceWatermark.trim().length > 0 &&
    s.writeAuthorized === false
  );
}

/**
 * Evaluate the T-F05 connect-search-console-organic-visibility path offline.
 * Complete F05 evidence package → CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateConnectSearchConsoleOrganicVisibility(
  input: ConnectSearchConsoleOrganicVisibilityInput,
): ConnectSearchConsoleOrganicVisibilityDecision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const omittedRowCount = input.observationBatch.rows.filter(
    (r) => r.omitted,
  ).length;
  const highValueIntentCount = input.intentToPageMappings.filter(
    (m) => m.highValue,
  ).length;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_CONNECTION_IDENTITY"
      | "AWAITING_PROPERTY_BINDING"
      | "AWAITING_COMPARABLE_QUERY"
      | "AWAITING_OBSERVATION_BATCH"
      | "AWAITING_INTENT_MAPPING"
      | "AWAITING_DAILY_SCHEDULE",
    recoveryPath:
      | "RECORD_SCOPES_IDENTITY_AND_API_READINESS"
      | "BIND_DOMAIN_OR_URL_PREFIX_PROPERTY"
      | "SET_COMPARABLE_QUERY_DIMENSIONS"
      | "LOAD_OBSERVATION_BATCH_WITH_COVERAGE"
      | "MAP_HIGH_VALUE_INTENTS_TO_PAGES"
      | "SAVE_DAILY_READ_SCHEDULE_WITH_WATERMARK"
      | "KEEP_READ_ONLY_EXPOSE_OMITTED_AS_UNKNOWN",
  ): NonNullable<
    Extract<
      ConnectSearchConsoleOrganicVisibilityDecision,
      { allowed: false }
    >["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    connectionSubject: input.connectionIdentity.subject.trim() || null,
    grantScopeCount: input.connectionIdentity.grantScopes.length,
    apiEnabled: input.connectionIdentity.apiEnabled,
    propertyKind: input.propertyBinding.kind || null,
    propertyId: input.propertyBinding.propertyId.trim() || null,
    siteBindingId: input.propertyBinding.siteBindingId.trim() || null,
    comparableCountry: input.comparableQuery.country.trim() || null,
    comparableDevice: input.comparableQuery.device.trim() || null,
    comparableSearchType: input.comparableQuery.searchType.trim() || null,
    comparisonWindowDays: Number.isFinite(input.comparableQuery.comparisonWindowDays)
      ? input.comparableQuery.comparisonWindowDays
      : null,
    observationProviderRequestId:
      input.observationBatch.providerRequestId.trim() || null,
    observationRowCount: input.observationBatch.rows.length,
    omittedRowCount,
    sitemapStatus: input.observationBatch.sitemapStatus.trim() || null,
    intentMappingCount: input.intentToPageMappings.length,
    highValueIntentCount,
    scheduleCadence: input.dailyReadSchedule.cadence || null,
    nextReadAtIso: input.dailyReadSchedule.nextReadAtIso.trim() || null,
    sourceWatermark: input.dailyReadSchedule.sourceWatermark.trim() || null,
    writeAuthorized: false,
    gscVerifiedLive: false,
    productionWrites: false,
    blockingDecision,
    currentState,
    recoveryPath,
    preservedInputCount: preserved,
  });

  if (input.requestLiveProviderWiring) {
    return {
      allowed: false,
      code: "LIVE_PROVIDER_WIRING_NOT_WIRED",
      ...base,
      evidence: null,
      reasons: [
        "Live connect-search-console provider wiring remains NOT_WIRED — refuse live wiring (T-F05)",
      ],
    };
  }

  if (input.claimLiveVerifiedGsc) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_GSC_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified GSC claim offline (T-F05) — fixture ACCEPTED ≠ VERIFIED",
      ],
    };
  }

  if (input.attemptWriteSave) {
    return {
      allowed: false,
      code: "WRITE_SAVE_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "WRITE_SAVE_REFUSED",
        "BLOCKED",
        "SAVE_DAILY_READ_SCHEDULE_WITH_WATERMARK",
      ),
      reasons: [
        "GSC connection must save as read-only — write-capable save refused (T-F05)",
      ],
    };
  }

  if (input.inventZeroFromOmittedRows) {
    return {
      allowed: false,
      code: "OMITTED_ZERO_DEMAND_CLAIM_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "OMITTED_ZERO_DEMAND_CLAIM_REFUSED",
        "BLOCKED",
        "KEEP_READ_ONLY_EXPOSE_OMITTED_AS_UNKNOWN",
      ),
      reasons: [
        "Omitted GSC rows are UNKNOWN demand — inventing zero refused (T-F05)",
      ],
    };
  }

  if (
    !input.packageId.trim() ||
    !connectionIdentityOk(input.connectionIdentity)
  ) {
    return {
      allowed: false,
      code: "CONNECTION_IDENTITY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CONNECTION_IDENTITY_INCOMPLETE",
        "AWAITING_CONNECTION_IDENTITY",
        "RECORD_SCOPES_IDENTITY_AND_API_READINESS",
      ),
      reasons: [
        "F05 requires identity, scopes, and API readiness (T-F05)",
      ],
    };
  }

  if (!propertyBindingOk(input.propertyBinding)) {
    return {
      allowed: false,
      code: "PROPERTY_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PROPERTY_BINDING_INCOMPLETE",
        "AWAITING_PROPERTY_BINDING",
        "BIND_DOMAIN_OR_URL_PREFIX_PROPERTY",
      ),
      reasons: [
        "F05 requires exact domain or URL-prefix property binding (T-F05)",
      ],
    };
  }

  if (!comparableQueryOk(input.comparableQuery)) {
    return {
      allowed: false,
      code: "COMPARABLE_QUERY_CONFIG_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "COMPARABLE_QUERY_INCOMPLETE",
        "AWAITING_COMPARABLE_QUERY",
        "SET_COMPARABLE_QUERY_DIMENSIONS",
      ),
      reasons: [
        "F05 requires country, device, search type, and comparison window (T-F05)",
      ],
    };
  }

  if (!observationBatchOk(input.observationBatch)) {
    return {
      allowed: false,
      code: "OBSERVATION_BATCH_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "OBSERVATION_BATCH_INCOMPLETE",
        "AWAITING_OBSERVATION_BATCH",
        "LOAD_OBSERVATION_BATCH_WITH_COVERAGE",
      ),
      reasons: [
        "F05 requires observation batch with coverage notes and sitemap status; omitted rows must stay null (T-F05)",
      ],
    };
  }

  if (!intentMappingsOk(input.intentToPageMappings)) {
    return {
      allowed: false,
      code: "INTENT_TO_PAGE_MAPPING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "INTENT_MAPPING_INCOMPLETE",
        "AWAITING_INTENT_MAPPING",
        "MAP_HIGH_VALUE_INTENTS_TO_PAGES",
      ),
      reasons: [
        "F05 requires high-value intent-to-page mapping (T-F05)",
      ],
    };
  }

  if (!dailyScheduleOk(input.dailyReadSchedule)) {
    return {
      allowed: false,
      code: "DAILY_READ_SCHEDULE_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "DAILY_SCHEDULE_INCOMPLETE",
        "AWAITING_DAILY_SCHEDULE",
        "SAVE_DAILY_READ_SCHEDULE_WITH_WATERMARK",
      ),
      reasons: [
        "F05 requires daily read schedule with source watermark and writeAuthorized=false (T-F05)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      connectionSubject: input.connectionIdentity.subject.trim(),
      grantScopeCount: input.connectionIdentity.grantScopes.length,
      apiEnabled: true,
      propertyKind: input.propertyBinding.kind,
      propertyId: input.propertyBinding.propertyId.trim(),
      siteBindingId: input.propertyBinding.siteBindingId.trim(),
      comparableCountry: input.comparableQuery.country.trim(),
      comparableDevice: input.comparableQuery.device.trim(),
      comparableSearchType: input.comparableQuery.searchType.trim(),
      comparisonWindowDays: input.comparableQuery.comparisonWindowDays,
      observationProviderRequestId:
        input.observationBatch.providerRequestId.trim(),
      observationRowCount: input.observationBatch.rows.length,
      omittedRowCount,
      sitemapStatus: input.observationBatch.sitemapStatus.trim(),
      intentMappingCount: input.intentToPageMappings.length,
      highValueIntentCount,
      scheduleCadence: "daily",
      nextReadAtIso: input.dailyReadSchedule.nextReadAtIso.trim(),
      sourceWatermark: input.dailyReadSchedule.sourceWatermark.trim(),
      writeAuthorized: false,
      gscVerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F05_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "GSC_CONNECTION_RECORDED_READ_READY",
      recoveryPath: "KEEP_READ_ONLY_EXPOSE_OMITTED_AS_UNKNOWN",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F05 evidence package recorded (identity+scopes+API readiness, property bind, comparable-query config, observation batch+coverage+sitemap, intent→page map, daily schedule+watermark); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
