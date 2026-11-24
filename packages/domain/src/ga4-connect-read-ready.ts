/**
 * T-US-007 — Connect GA4 (F04/SC-18): ready-read status and next sync.
 *
 * Saves a fixture GA4 connection as read-only: property bind, site map,
 * versioned event dictionary with explicit gaps, bounded sample report,
 * READ_READY + nextSyncAtIso. Write stays unauthorized. Live transport
 * remains NOT_WIRED. Pure domain — no network I/O.
 * Fixture ACCEPTED ≠ sandbox/prod VERIFIED. External effects: NONE.
 */

import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  interpretGa4DebugValidation,
  validateGa4PropertyBinding,
  type AnalyticsEnvironmentValue,
  type Ga4PropertyBinding,
} from "./analytics.js";
import {
  ConnectionState,
  VerificationState,
  WriteReadiness,
  buildProviderStatusView,
  type ProviderStatusView,
} from "./connection-status.js";

/** Default fixture GA4 read sync cadence (daily). */
export const DEFAULT_GA4_READ_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

export const Ga4ConnectSaveMode = {
  READ_ONLY: "READ_ONLY",
  WRITE: "WRITE",
} as const;

export type Ga4ConnectSaveModeValue =
  (typeof Ga4ConnectSaveMode)[keyof typeof Ga4ConnectSaveMode];

export type Ga4ConnectSummaryEventEntry = {
  eventName: string;
  businessOutcome: string;
  mapped: boolean;
  gapReason: string | null;
};

export type Ga4ConnectSummarySampleRow = {
  dimension: string;
  metric: string;
  value: number;
  coverageNote: string;
};

export type Ga4ConnectReadReadyInput = {
  nowIso: string;
  connectionId: string;
  identitySubject: string;
  /** OAuth / grant scopes (redacted evidence — names only). */
  grantScopes: readonly string[];
  property: Ga4PropertyBinding;
  /** Site / page the GA4 property is bound to. */
  siteBindingId: string;
  webStreamId: string;
  eventDictionary: readonly Ga4ConnectSummaryEventEntry[];
  eventDictionaryOwner: string;
  eventDictionaryVersion: string;
  sampleReport: {
    requestId: string;
    rows: readonly Ga4ConnectSummarySampleRow[];
  };
  /**
   * Three distinct measurement test outcomes (shape / debug / receipt).
   * Debug success must never claim delivered conversion.
   */
  measurementTests: {
    debugEndpointAccepted: boolean;
    measuredReceiptObserved: boolean;
    mappingGapExplicit: boolean;
  };
  saveMode: Ga4ConnectSaveModeValue;
  /** Interval until next scheduled read sync. */
  syncIntervalMs?: number;
};

/** Accepted read-only GA4 OAuth scope tokens (full URI or short alias). */
export const GA4_READ_ONLY_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "analytics.readonly",
] as const;

const GA4_WRITE_SCOPE_MARKERS = [
  "analytics.edit",
  "analytics.manage.users",
  "analytics.manage.users.readonly",
  "analytics",
] as const;

export type Ga4ConnectReadReadyResult =
  | {
      ok: true;
      connectionId: string;
      propertyId: string;
      siteBindingId: string;
      webStreamId: string;
      connectionState: typeof ConnectionState.READ_READY;
      writeReadiness: typeof WriteReadiness.NOT_AUTHORIZED;
      status: ProviderStatusView;
      nextSyncAtIso: string;
      eventDictionaryVersion: string;
      eventDictionaryOwner: string;
      mappedEventCount: number;
      unmappedEventCount: number;
      eventGaps: string[];
      sampleReportRequestId: string;
      sampleRowCount: number;
      sampleRows: Ga4ConnectSummarySampleRow[];
      measurementOutcomes: {
        debugOk: boolean;
        deliveredConversionClaimed: false;
        measuredReceiptObserved: boolean;
        mappingGapExplicit: boolean;
      };
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
        | "LIVE_CLAIM_REFUSED"
        | "WRITE_SAVE_REFUSED"
        | "LIVE_TRANSPORT_NOT_WIRED"
        | "ENVIRONMENT_NOT_READY"
        | "MISSING_SITE_BINDING"
        | "MISSING_IDENTITY"
        | "WRITE_SCOPE_REFUSED"
        | "SAMPLE_REPORT_EMPTY"
        | "EVENT_DICTIONARY_OWNER_REQUIRED"
        | "EVENT_GAP_REASON_REQUIRED"
        | "INVALID_SYNC_INTERVAL";
      reasons: string[];
      externalEffects: "NONE";
    };

export const CONNECT_GA4_READ_READY_RELATED_CASE_IDS = [
  "T-US-007",
  "T-F04",
] as const;

function addMs(iso: string, ms: number): string {
  return new Date(Date.parse(iso) + ms).toISOString();
}

function normalizeScope(scope: string): string {
  return scope.trim().toLowerCase();
}

function isReadOnlyScope(scope: string): boolean {
  const n = normalizeScope(scope);
  return (GA4_READ_ONLY_SCOPES as readonly string[]).some(
    (allowed) => allowed.toLowerCase() === n,
  );
}

function isWriteCapableScope(scope: string): boolean {
  const n = normalizeScope(scope);
  if (isReadOnlyScope(scope)) return false;
  // Exact "analytics" (without .readonly) is write-capable Data API scope.
  if (n === "https://www.googleapis.com/auth/analytics" || n === "analytics") {
    return true;
  }
  return GA4_WRITE_SCOPE_MARKERS.some(
    (marker) =>
      n === marker ||
      n.endsWith(`/${marker}`) ||
      n.includes(`analytics.${marker.replace(/^analytics\./, "")}`),
  );
}

/**
 * Save a fixture GA4 connection as read-only with ready-read status and
 * next sync time. Never authorizes writes or live transport.
 */
export function saveGa4ReadOnlyConnection(
  input: Ga4ConnectReadReadyInput,
): Ga4ConnectReadReadyResult {
  if (input.saveMode === Ga4ConnectSaveMode.WRITE) {
    return {
      ok: false,
      code: "WRITE_SAVE_REFUSED",
      reasons: [
        "GA4 connection must be saved read-only — write/tag/property edits require a separate grant (T-US-007)",
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

  const trimmedScopes = input.grantScopes.map((s) => s.trim()).filter(Boolean);
  if (trimmedScopes.length === 0) {
    return {
      ok: false,
      code: "MISSING_IDENTITY",
      reasons: ["Grant scopes must be non-blank"],
      externalEffects: "NONE",
    };
  }
  if (trimmedScopes.some((s) => isWriteCapableScope(s))) {
    return {
      ok: false,
      code: "WRITE_SCOPE_REFUSED",
      reasons: [
        "Write-capable GA4 scopes refused — read-only connection requires analytics.readonly only",
      ],
      externalEffects: "NONE",
    };
  }
  if (!trimmedScopes.every((s) => isReadOnlyScope(s))) {
    return {
      ok: false,
      code: "WRITE_SCOPE_REFUSED",
      reasons: [
        "Unrecognized GA4 scope — require analytics.readonly for READ_READY save",
      ],
      externalEffects: "NONE",
    };
  }

  if (!input.siteBindingId.trim() || !input.webStreamId.trim()) {
    return {
      ok: false,
      code: "MISSING_SITE_BINDING",
      reasons: ["Confirmed property-to-site binding and web stream are required"],
      externalEffects: "NONE",
    };
  }

  if (!input.eventDictionaryOwner.trim() || !input.eventDictionaryVersion.trim()) {
    return {
      ok: false,
      code: "EVENT_DICTIONARY_OWNER_REQUIRED",
      reasons: ["Versioned event dictionary requires owner and version"],
      externalEffects: "NONE",
    };
  }

  if (input.property.environment === AnalyticsEnvironment.LIVE) {
    return {
      ok: false,
      code: "LIVE_TRANSPORT_NOT_WIRED",
      reasons: [
        "Live GA4 connect refused — live query transport remains NOT_WIRED",
      ],
      externalEffects: "NONE",
    };
  }

  if (
    input.property.environment === AnalyticsEnvironment.NOT_WIRED ||
    input.property.environment === AnalyticsEnvironment.UNAVAILABLE
  ) {
    return {
      ok: false,
      code: "ENVIRONMENT_NOT_READY",
      reasons: [
        `GA4 environment ${input.property.environment} cannot supply a sample — refuse READ_READY`,
      ],
      externalEffects: "NONE",
    };
  }

  const propertyValidation = validateGa4PropertyBinding(input.property);
  if (!propertyValidation.ok) {
    return {
      ok: false,
      code: propertyValidation.code,
      reasons: propertyValidation.reasons,
      externalEffects: "NONE",
    };
  }

  if (input.sampleReport.rows.length === 0) {
    return {
      ok: false,
      code: "SAMPLE_REPORT_EMPTY",
      reasons: ["Bounded sample report must include at least one fixture row"],
      externalEffects: "NONE",
    };
  }

  const mapped = input.eventDictionary.filter((e) => e.mapped);
  const unmapped = input.eventDictionary.filter((e) => !e.mapped);
  const eventGaps = unmapped.map(
    (e) =>
      `${e.eventName}/${e.businessOutcome}: ${e.gapReason ?? "unmapped"}`,
  );

  if (input.measurementTests.mappingGapExplicit) {
    if (unmapped.length === 0) {
      return {
        ok: false,
        code: "EVENT_GAP_REASON_REQUIRED",
        reasons: [
          "mappingGapExplicit requires at least one unmapped event dictionary entry",
        ],
        externalEffects: "NONE",
      };
    }
    const blankGap = unmapped.find(
      (e) => e.gapReason === null || !e.gapReason.trim(),
    );
    if (blankGap) {
      return {
        ok: false,
        code: "EVENT_GAP_REASON_REQUIRED",
        reasons: [
          `Unmapped event ${blankGap.eventName} requires an explicit gapReason`,
        ],
        externalEffects: "NONE",
      };
    }
  }

  const debug = interpretGa4DebugValidation({
    debugEndpointAccepted: input.measurementTests.debugEndpointAccepted,
  });

  let interval: number;
  if (input.syncIntervalMs === undefined) {
    interval = DEFAULT_GA4_READ_SYNC_INTERVAL_MS;
  } else if (
    !Number.isFinite(input.syncIntervalMs) ||
    input.syncIntervalMs <= 0
  ) {
    return {
      ok: false,
      code: "INVALID_SYNC_INTERVAL",
      reasons: [
        "syncIntervalMs must be a positive finite number for a future nextSyncAtIso",
      ],
      externalEffects: "NONE",
    };
  } else {
    interval = input.syncIntervalMs;
  }
  const nextSyncAtIso = addMs(input.nowIso, interval);

  const status = buildProviderStatusView({
    providerId: "ga4",
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
    siteBindingId: input.siteBindingId,
    webStreamId: input.webStreamId,
    connectionState: ConnectionState.READ_READY,
    writeReadiness: WriteReadiness.NOT_AUTHORIZED,
    status,
    nextSyncAtIso,
    eventDictionaryVersion: input.eventDictionaryVersion,
    eventDictionaryOwner: input.eventDictionaryOwner,
    mappedEventCount: mapped.length,
    unmappedEventCount: unmapped.length,
    eventGaps,
    sampleReportRequestId: input.sampleReport.requestId,
    sampleRowCount: input.sampleReport.rows.length,
    sampleRows: input.sampleReport.rows.map((r) => ({ ...r })),
    measurementOutcomes: {
      debugOk: debug.debugOk,
      deliveredConversionClaimed: false,
      measuredReceiptObserved: input.measurementTests.measuredReceiptObserved,
      mappingGapExplicit: input.measurementTests.mappingGapExplicit,
    },
    liveWiring,
    environment: input.property.environment,
    externalEffects: "NONE",
    reasons: [
      `GA4 property ${input.property.propertyId} bound to site ${input.siteBindingId} as READ_READY`,
      `Next sync scheduled at ${nextSyncAtIso}`,
      `Event dictionary ${input.eventDictionaryVersion} owner=${input.eventDictionaryOwner}; gaps=${unmapped.length}`,
      `Sample report ${input.sampleReport.requestId} rows=${input.sampleReport.rows.length} (fixture)`,
      "Write unauthorized — separate grant required for event/tag edits",
      "Acceptance pending — not live VERIFIED; externalEffects=NONE",
      ...propertyValidation.reasons,
      ...debug.reasons,
    ],
  };
}

/** Convenience fixture property binding (never LIVE). */
export function fixtureGa4PropertyBinding(overrides?: {
  propertyId?: string;
  measurementId?: string;
  displayName?: string;
}): Ga4PropertyBinding {
  return {
    propertyId: overrides?.propertyId ?? "100000007",
    kind: Ga4PropertyKind.GA4_PROPERTY,
    measurementId: overrides?.measurementId ?? "G-FIXTURE007",
    displayName: overrides?.displayName ?? "WorkSocial fixture GA4",
    environment: AnalyticsEnvironment.FIXTURE,
  };
}
