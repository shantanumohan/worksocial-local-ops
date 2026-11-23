/**
 * T-US-009 — Connect Search Console (F05/SC-18): schedule and watermark summary.
 *
 * Behavior-acceptance summary distinct from T-F05's complete organic-visibility
 * evidence package (`CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY`). Saves a
 * fixture GSC connection as read-only with daily read schedule and source
 * watermark (plus comparable-query + intent map + observation coverage notes
 * as supporting context). Write stays unauthorized. Live transport remains
 * NOT_WIRED. Pure domain — no network I/O.
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
  GscPropertyKind,
  type GscPropertyKindValue,
} from "./connect-search-console-organic-visibility.js";

/** Default fixture GSC daily read schedule cadence. */
export const DEFAULT_GSC_DAILY_READ_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const GscConnectSaveMode = {
  READ_ONLY: "READ_ONLY",
  WRITE: "WRITE",
} as const;

export type GscConnectSaveModeValue =
  (typeof GscConnectSaveMode)[keyof typeof GscConnectSaveMode];

/** T-US-009 property binding (includes environment; distinct from T-F05 shape). */
export type GscScheduleWatermarkPropertyBinding = {
  propertyId: string;
  kind: GscPropertyKindValue;
  displayName: string;
  environment: AnalyticsEnvironmentValue;
};

export type GscScheduleWatermarkComparableQuery = {
  country: string;
  device: string;
  searchType: string;
  comparisonWindowStartIso: string;
  comparisonWindowEndIso: string;
};

export type GscScheduleWatermarkIntentMapping = {
  intent: string;
  pagePath: string;
  confidence: "high" | "medium" | "low";
};

export type GscScheduleWatermarkObservationRow = {
  query: string;
  pagePath: string;
  clicks: number | null;
  impressions: number | null;
  omitted: boolean;
  coverageNote: string;
};

export type GscConnectScheduleWatermarkInput = {
  nowIso: string;
  connectionId: string;
  identitySubject: string;
  grantScopes: readonly string[];
  property: GscScheduleWatermarkPropertyBinding;
  comparableQuery: GscScheduleWatermarkComparableQuery;
  intentPageMappings: readonly GscScheduleWatermarkIntentMapping[];
  observationBatch: {
    batchId: string;
    rows: readonly GscScheduleWatermarkObservationRow[];
  };
  /**
   * Source watermark — last successfully ingested observation frontier.
   * Must be ≤ nowIso; never invent a future watermark.
   */
  sourceWatermarkIso: string;
  saveMode: GscConnectSaveModeValue;
  dailyReadIntervalMs?: number;
};

export type GscConnectScheduleWatermarkResult =
  | {
      ok: true;
      connectionId: string;
      propertyId: string;
      propertyKind: GscPropertyKindValue;
      connectionState: typeof ConnectionState.READ_READY;
      writeReadiness: typeof WriteReadiness.NOT_AUTHORIZED;
      status: ProviderStatusView;
      dailyReadScheduleAtIso: string;
      sourceWatermarkIso: string;
      comparableQuery: GscScheduleWatermarkComparableQuery;
      intentMappingCount: number;
      observationBatchId: string;
      observationRowCount: number;
      coverageNotes: string[];
      liveWiring: "NOT_WIRED" | "FIXTURE";
      environment: AnalyticsEnvironmentValue;
      externalEffects: "NONE";
      reasons: string[];
    }
  | {
      ok: false;
      code:
        | "WRONG_PROPERTY_KIND"
        | "MISSING_PROPERTY"
        | "WRITE_SAVE_REFUSED"
        | "LIVE_TRANSPORT_NOT_WIRED"
        | "MISSING_IDENTITY"
        | "MISSING_COMPARABLE_QUERY"
        | "INVALID_COMPARISON_WINDOW"
        | "OBSERVATION_BATCH_EMPTY"
        | "INVALID_SOURCE_WATERMARK"
        | "MISSING_INTENT_MAPPING";
      reasons: string[];
      externalEffects: "NONE";
    };

export const CONNECT_GSC_SCHEDULE_WATERMARK_RELATED_CASE_IDS = [
  "T-US-009",
  "T-F05",
] as const;

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

export type GscScheduleWatermarkPropertyValidation =
  | {
      ok: true;
      binding: GscScheduleWatermarkPropertyBinding;
      reasons: string[];
    }
  | {
      ok: false;
      code: "WRONG_PROPERTY_KIND" | "MISSING_PROPERTY";
      reasons: string[];
    };

/**
 * Accept domain / URL-prefix GSC properties in FIXTURE/SANDBOX only.
 * Live bind remains NOT_WIRED.
 */
export function validateGscScheduleWatermarkProperty(
  binding: GscScheduleWatermarkPropertyBinding,
): GscScheduleWatermarkPropertyValidation {
  if (!binding.propertyId.trim()) {
    return {
      ok: false,
      code: "MISSING_PROPERTY",
      reasons: ["GSC property id is required"],
    };
  }
  if (
    binding.kind !== GscPropertyKind.DOMAIN &&
    binding.kind !== GscPropertyKind.URL_PREFIX
  ) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        `Property kind ${binding.kind} is not a Search Console domain/URL-prefix property — refuse bind (T-US-009)`,
      ],
    };
  }
  if (binding.environment === AnalyticsEnvironment.LIVE) {
    return {
      ok: false,
      code: "WRONG_PROPERTY_KIND",
      reasons: [
        "Live GSC bind refused — live query transport remains NOT_WIRED",
      ],
    };
  }
  return {
    ok: true,
    binding,
    reasons: [
      `GSC property ${binding.propertyId} accepted as ${binding.environment} (not live metrics)`,
    ],
  };
}

/**
 * Save a fixture Search Console connection with daily read schedule and
 * source watermark (T-US-009 summary). Never authorizes writes or live transport.
 */
export function saveGscReadOnlyConnection(
  input: GscConnectScheduleWatermarkInput,
): GscConnectScheduleWatermarkResult {
  if (input.saveMode === GscConnectSaveMode.WRITE) {
    return {
      ok: false,
      code: "WRITE_SAVE_REFUSED",
      reasons: [
        "Search Console connection must be saved read-only — property edits require a separate grant (T-US-009)",
      ],
      externalEffects: "NONE",
    };
  }

  if (!input.identitySubject.trim() || input.grantScopes.length === 0) {
    return {
      ok: false,
      code: "MISSING_IDENTITY",
      reasons: ["Grant scopes and connection identity are required"],
      externalEffects: "NONE",
    };
  }

  const cq = input.comparableQuery;
  if (
    !cq.country.trim() ||
    !cq.device.trim() ||
    !cq.searchType.trim() ||
    !cq.comparisonWindowStartIso.trim() ||
    !cq.comparisonWindowEndIso.trim()
  ) {
    return {
      ok: false,
      code: "MISSING_COMPARABLE_QUERY",
      reasons: [
        "Comparable-query config requires country, device, search type, and comparison window",
      ],
      externalEffects: "NONE",
    };
  }

  const windowStart = Date.parse(cq.comparisonWindowStartIso);
  const windowEnd = Date.parse(cq.comparisonWindowEndIso);
  if (
    Number.isNaN(windowStart) ||
    Number.isNaN(windowEnd) ||
    windowEnd <= windowStart
  ) {
    return {
      ok: false,
      code: "INVALID_COMPARISON_WINDOW",
      reasons: [
        "Comparison window end must be a valid ISO instant after window start",
      ],
      externalEffects: "NONE",
    };
  }

  if (input.intentPageMappings.length === 0) {
    return {
      ok: false,
      code: "MISSING_INTENT_MAPPING",
      reasons: ["At least one high-value intent→page mapping is required"],
      externalEffects: "NONE",
    };
  }

  if (input.property.environment === AnalyticsEnvironment.LIVE) {
    return {
      ok: false,
      code: "LIVE_TRANSPORT_NOT_WIRED",
      reasons: [
        "Live Search Console connect refused — live query transport remains NOT_WIRED",
      ],
      externalEffects: "NONE",
    };
  }

  const propertyValidation = validateGscScheduleWatermarkProperty(input.property);
  if (!propertyValidation.ok) {
    return {
      ok: false,
      code: propertyValidation.code,
      reasons: propertyValidation.reasons,
      externalEffects: "NONE",
    };
  }

  if (input.observationBatch.rows.length === 0) {
    return {
      ok: false,
      code: "OBSERVATION_BATCH_EMPTY",
      reasons: [
        "Observation batch must include at least one fixture row (empty ≠ connection failed — use coverage notes)",
      ],
      externalEffects: "NONE",
    };
  }

  const watermarkMs = Date.parse(input.sourceWatermarkIso);
  const nowMs = Date.parse(input.nowIso);
  if (
    Number.isNaN(watermarkMs) ||
    Number.isNaN(nowMs) ||
    watermarkMs > nowMs
  ) {
    return {
      ok: false,
      code: "INVALID_SOURCE_WATERMARK",
      reasons: [
        "Source watermark must be a valid ISO instant at or before now (never invent a future watermark)",
      ],
      externalEffects: "NONE",
    };
  }

  const interval =
    input.dailyReadIntervalMs === undefined
      ? DEFAULT_GSC_DAILY_READ_INTERVAL_MS
      : Math.max(0, input.dailyReadIntervalMs);
  const dailyReadScheduleAtIso = addMs(input.nowIso, interval);

  const coverageNotes = [
    ...new Set(
      input.observationBatch.rows
        .map((r) => r.coverageNote.trim())
        .filter((n) => n.length > 0),
    ),
  ];

  const status = buildProviderStatusView({
    providerId: "search_console",
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    verificationState: VerificationState.ACCEPTED_PENDING,
  });

  const liveWiring: "NOT_WIRED" | "FIXTURE" =
    input.property.environment === AnalyticsEnvironment.FIXTURE
      ? "FIXTURE"
      : "NOT_WIRED";

  return {
    ok: true,
    connectionId: input.connectionId,
    propertyId: input.property.propertyId,
    propertyKind: input.property.kind,
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    status,
    dailyReadScheduleAtIso,
    sourceWatermarkIso: input.sourceWatermarkIso,
    comparableQuery: { ...cq },
    intentMappingCount: input.intentPageMappings.length,
    observationBatchId: input.observationBatch.batchId,
    observationRowCount: input.observationBatch.rows.length,
    coverageNotes,
    liveWiring,
    environment: input.property.environment,
    externalEffects: "NONE",
    reasons: [
      `GSC property ${input.property.propertyId} (${input.property.kind}) saved as READ_READY`,
      `Daily read schedule at ${dailyReadScheduleAtIso}`,
      `Source watermark ${input.sourceWatermarkIso}`,
      `Comparable query ${cq.country}/${cq.device}/${cq.searchType} window=${cq.comparisonWindowStartIso}→${cq.comparisonWindowEndIso}`,
      `Intent→page mappings=${input.intentPageMappings.length}; observation batch ${input.observationBatch.batchId} rows=${input.observationBatch.rows.length}`,
      "Write unauthorized — separate grant required for property edits",
      "Acceptance pending — not live VERIFIED; externalEffects=NONE",
      ...propertyValidation.reasons,
    ],
  };
}

/** Convenience fixture domain property binding (never LIVE). */
export function fixtureGscPropertyBinding(overrides?: {
  propertyId?: string;
  kind?: GscPropertyKindValue;
  displayName?: string;
}): GscScheduleWatermarkPropertyBinding {
  return {
    propertyId: overrides?.propertyId ?? "sc-domain:worksocial.test",
    kind: overrides?.kind ?? GscPropertyKind.DOMAIN,
    displayName: overrides?.displayName ?? "WorkSocial fixture Search Console",
    environment: AnalyticsEnvironment.FIXTURE,
  };
}

// Re-export kind enum for callers that only import this module.
export { GscPropertyKind };
export type { GscPropertyKindValue };
