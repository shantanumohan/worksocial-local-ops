/**
 * T-F04 — Connect Google Analytics 4 (complete F04 evidence set).
 *
 * Offline fixture gate (full-stack flow family): assemble the F04 evidence
 * package — grant scopes + connection identity, confirmed property-to-site
 * binding (GA4 property + account + web stream), versioned event dictionary
 * with owner and explicit mapping gaps, bounded sample report (provider
 * request ID, dimensions, rows, coverage), three distinct measurement test
 * outcomes, and READ_READY + next sync with write unauthorized. Incomplete
 * packages, wrong property kinds, write saves, debug→delivered conversion
 * claims, and false live-verified claims are refused. Live provider wiring
 * stays NOT_WIRED. Pure domain — no network I/O. Fixture ACCEPTED ≠
 * sandbox/prod VERIFIED. External effects: NONE.
 *
 * Distinct from open T-US-007 behavior acceptance
 * (`CONNECT_GA4_READ_READY_NEXT_SYNC`) — this records the complete F04
 * flow evidence package, not the ready-read/next-sync summary alone.
 */

import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
  type Ga4PropertyKindValue,
  validateGa4PropertyBinding,
} from "./analytics.js";

export const REQUIRED_GA4_GRANT_SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
] as const;

export type Ga4ConnectionIdentity = {
  subject: string;
  grantScopes: readonly string[];
};

export type Ga4PropertyToSiteBinding = {
  propertyId: string;
  accountId: string;
  webStreamId: string;
  siteBindingId: string;
  kind: Ga4PropertyKindValue;
  measurementId: string | null;
  displayName: string;
};

export type Ga4EventDictionaryEntry = {
  eventName: string;
  businessOutcome: string;
  mapped: boolean;
  /** Required when mapped=false — gaps must stay explicit. */
  gapReason: string | null;
};

export type Ga4EventDictionary = {
  version: string;
  owner: string;
  entries: readonly Ga4EventDictionaryEntry[];
};

export type Ga4SampleReportRow = {
  dimension: string;
  metric: string;
  value: number;
  coverageNote: string;
};

export type Ga4SampleReport = {
  providerRequestId: string;
  dimensions: readonly string[];
  rows: readonly Ga4SampleReportRow[];
};

/** Three distinct measurement outcomes required by the catalog. */
export type Ga4MeasurementTests = {
  debugEndpointAccepted: boolean;
  measuredReceiptObserved: boolean;
  mappingGapExplicit: boolean;
};

export type Ga4ReadReadyStatus = {
  status: "READ_READY";
  nextSyncAtIso: string;
  writeAuthorized: false;
};

export type ConnectGoogleAnalytics4Input = {
  packageId: string;
  connectionIdentity: Ga4ConnectionIdentity;
  propertyToSiteBinding: Ga4PropertyToSiteBinding;
  eventDictionary: Ga4EventDictionary;
  sampleReport: Ga4SampleReport;
  measurementTests: Ga4MeasurementTests;
  readReady: Ga4ReadReadyStatus;
  /** Attempt a write-capable save — must refuse (read-only). */
  attemptWriteSave: boolean;
  /** Claim delivered conversion from debug validation alone — must refuse. */
  claimDeliveredConversionFromDebug: boolean;
  /** Claim the F04 path is live-verified — must refuse offline. */
  claimLiveVerifiedGa4: boolean;
  /** Request live provider wiring — must stay NOT_WIRED offline. */
  requestLiveProviderWiring: boolean;
};

export type ConnectGoogleAnalytics4Decision =
  | {
      allowed: true;
      code: "CONNECT_GOOGLE_ANALYTICS_4_EVIDENCE_RECORDED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string;
        connectionSubject: string;
        grantScopeCount: number;
        propertyId: string;
        accountId: string;
        webStreamId: string;
        siteBindingId: string;
        propertyKind: "ga4_property";
        eventDictionaryVersion: string;
        eventDictionaryOwner: string;
        eventEntryCount: number;
        mappedEventCount: number;
        explicitGapCount: number;
        sampleProviderRequestId: string;
        sampleDimensionCount: number;
        sampleRowCount: number;
        measurementDebugAccepted: boolean;
        measurementReceiptObserved: boolean;
        measurementMappingGapExplicit: true;
        readReadyStatus: "READ_READY";
        nextSyncAtIso: string;
        writeAuthorized: false;
        ga4VerifiedLive: false;
        productionWrites: false;
        blockingDecision: "F04_EVIDENCE_PACKAGE_COMPLETE";
        currentState: "GA4_CONNECTION_RECORDED_READ_READY";
        recoveryPath: "KEEP_READ_ONLY_EXPOSE_EVENT_MAPPING_GAPS";
        preservedInputCount: number;
      };
      reasons: string[];
    }
  | {
      allowed: false;
      code:
        | "CONNECTION_IDENTITY_REQUIRED"
        | "PROPERTY_TO_SITE_BINDING_REQUIRED"
        | "WRONG_PROPERTY_KIND_REFUSED"
        | "EVENT_DICTIONARY_REQUIRED"
        | "SAMPLE_REPORT_REQUIRED"
        | "MEASUREMENT_TESTS_REQUIRED"
        | "READ_READY_REQUIRED"
        | "WRITE_SAVE_REFUSED"
        | "DEBUG_DELIVERED_CONVERSION_CLAIM_REFUSED"
        | "FALSE_LIVE_VERIFIED_GA4_REFUSED"
        | "LIVE_PROVIDER_WIRING_NOT_WIRED";
      liveProviderWiring: "NOT_WIRED";
      externalEffects: "NONE";
      fixtureOnly: true;
      productionWrites: false;
      evidence: {
        packageId: string | null;
        connectionSubject: string | null;
        grantScopeCount: number;
        propertyId: string | null;
        accountId: string | null;
        webStreamId: string | null;
        siteBindingId: string | null;
        propertyKind: string | null;
        eventDictionaryVersion: string | null;
        eventDictionaryOwner: string | null;
        eventEntryCount: number;
        mappedEventCount: number;
        explicitGapCount: number;
        sampleProviderRequestId: string | null;
        sampleDimensionCount: number;
        sampleRowCount: number;
        measurementDebugAccepted: boolean;
        measurementReceiptObserved: boolean;
        measurementMappingGapExplicit: boolean;
        readReadyStatus: string | null;
        nextSyncAtIso: string | null;
        writeAuthorized: false;
        ga4VerifiedLive: false;
        productionWrites: false;
        blockingDecision: string;
        currentState:
          | "BLOCKED"
          | "AWAITING_CONNECTION_IDENTITY"
          | "AWAITING_PROPERTY_BINDING"
          | "AWAITING_EVENT_DICTIONARY"
          | "AWAITING_SAMPLE_REPORT"
          | "AWAITING_MEASUREMENT_TESTS"
          | "AWAITING_READ_READY";
        recoveryPath:
          | "RECORD_SCOPES_AND_CONNECTION_IDENTITY"
          | "BIND_GA4_PROPERTY_ACCOUNT_STREAM_TO_SITE"
          | "VERSION_EVENT_DICTIONARY_WITH_OWNER_AND_GAPS"
          | "RUN_BOUNDED_SAMPLE_REPORT"
          | "RECORD_THREE_DISTINCT_MEASUREMENT_OUTCOMES"
          | "SAVE_READ_ONLY_WITH_NEXT_SYNC"
          | "KEEP_READ_ONLY_EXPOSE_EVENT_MAPPING_GAPS";
        preservedInputCount: number;
      } | null;
      reasons: string[];
    };

export const CONNECT_GOOGLE_ANALYTICS_4_RELATED_CASE_IDS = ["T-F04"] as const;

function preservedInputCount(input: ConnectGoogleAnalytics4Input): number {
  return (
    (input.packageId.trim() ? 1 : 0) +
    (input.connectionIdentity.subject.trim() ? 1 : 0) +
    (input.propertyToSiteBinding.propertyId.trim() ? 1 : 0) +
    (input.eventDictionary.version.trim() ? 1 : 0) +
    (input.sampleReport.providerRequestId.trim() ? 1 : 0) +
    (input.readReady.nextSyncAtIso.trim() ? 1 : 0)
  );
}

function connectionIdentityOk(id: Ga4ConnectionIdentity): boolean {
  return (
    id.subject.trim().length > 0 &&
    id.grantScopes.length > 0 &&
    id.grantScopes.every((s) => s.trim().length > 0) &&
    REQUIRED_GA4_GRANT_SCOPES.every((required) =>
      id.grantScopes.includes(required),
    )
  );
}

function propertyBindingFieldsOk(b: Ga4PropertyToSiteBinding): boolean {
  return (
    b.propertyId.trim().length > 0 &&
    b.accountId.trim().length > 0 &&
    b.webStreamId.trim().length > 0 &&
    b.siteBindingId.trim().length > 0 &&
    b.displayName.trim().length > 0
  );
}

function eventDictionaryOk(dict: Ga4EventDictionary): boolean {
  if (!dict.version.trim() || !dict.owner.trim()) return false;
  if (dict.entries.length === 0) return false;
  return dict.entries.every((e) => {
    if (!e.eventName.trim() || !e.businessOutcome.trim()) return false;
    if (!e.mapped) {
      return e.gapReason !== null && e.gapReason.trim().length > 0;
    }
    return true;
  });
}

function sampleReportOk(report: Ga4SampleReport): boolean {
  return (
    report.providerRequestId.trim().length > 0 &&
    report.dimensions.length > 0 &&
    report.dimensions.every((d) => d.trim().length > 0) &&
    report.rows.length > 0 &&
    report.rows.every(
      (r) =>
        r.dimension.trim().length > 0 &&
        r.metric.trim().length > 0 &&
        Number.isFinite(r.value) &&
        r.coverageNote.trim().length > 0,
    )
  );
}

function measurementTestsOk(t: Ga4MeasurementTests): boolean {
  // Three distinct outcomes must be present as booleans; mapping gap must
  // be explicit for honesty (catalog: three distinct test outcomes).
  return (
    typeof t.debugEndpointAccepted === "boolean" &&
    typeof t.measuredReceiptObserved === "boolean" &&
    t.mappingGapExplicit === true
  );
}

function readReadyOk(r: Ga4ReadReadyStatus): boolean {
  return (
    r.status === "READ_READY" &&
    r.nextSyncAtIso.trim().length > 0 &&
    r.writeAuthorized === false
  );
}

/**
 * Evaluate the T-F04 connect-google-analytics-4 path offline.
 * Complete F04 evidence package → CONNECT_GOOGLE_ANALYTICS_4_EVIDENCE_RECORDED;
 * live stays NOT_WIRED; incomplete packages and unsafe claims refused.
 */
export function evaluateConnectGoogleAnalytics4(
  input: ConnectGoogleAnalytics4Input,
): ConnectGoogleAnalytics4Decision {
  const base = {
    liveProviderWiring: "NOT_WIRED" as const,
    externalEffects: "NONE" as const,
    fixtureOnly: true as const,
    productionWrites: false as const,
  };
  const preserved = preservedInputCount(input);
  const mappedEventCount = input.eventDictionary.entries.filter(
    (e) => e.mapped,
  ).length;
  const explicitGapCount = input.eventDictionary.entries.filter(
    (e) => !e.mapped && e.gapReason !== null && e.gapReason.trim().length > 0,
  ).length;

  const blockedEvidence = (
    blockingDecision: string,
    currentState:
      | "BLOCKED"
      | "AWAITING_CONNECTION_IDENTITY"
      | "AWAITING_PROPERTY_BINDING"
      | "AWAITING_EVENT_DICTIONARY"
      | "AWAITING_SAMPLE_REPORT"
      | "AWAITING_MEASUREMENT_TESTS"
      | "AWAITING_READ_READY",
    recoveryPath:
      | "RECORD_SCOPES_AND_CONNECTION_IDENTITY"
      | "BIND_GA4_PROPERTY_ACCOUNT_STREAM_TO_SITE"
      | "VERSION_EVENT_DICTIONARY_WITH_OWNER_AND_GAPS"
      | "RUN_BOUNDED_SAMPLE_REPORT"
      | "RECORD_THREE_DISTINCT_MEASUREMENT_OUTCOMES"
      | "SAVE_READ_ONLY_WITH_NEXT_SYNC"
      | "KEEP_READ_ONLY_EXPOSE_EVENT_MAPPING_GAPS",
  ): NonNullable<
    Extract<ConnectGoogleAnalytics4Decision, { allowed: false }>["evidence"]
  > => ({
    packageId: input.packageId.trim() || null,
    connectionSubject: input.connectionIdentity.subject.trim() || null,
    grantScopeCount: input.connectionIdentity.grantScopes.length,
    propertyId: input.propertyToSiteBinding.propertyId.trim() || null,
    accountId: input.propertyToSiteBinding.accountId.trim() || null,
    webStreamId: input.propertyToSiteBinding.webStreamId.trim() || null,
    siteBindingId: input.propertyToSiteBinding.siteBindingId.trim() || null,
    propertyKind: input.propertyToSiteBinding.kind || null,
    eventDictionaryVersion: input.eventDictionary.version.trim() || null,
    eventDictionaryOwner: input.eventDictionary.owner.trim() || null,
    eventEntryCount: input.eventDictionary.entries.length,
    mappedEventCount,
    explicitGapCount,
    sampleProviderRequestId:
      input.sampleReport.providerRequestId.trim() || null,
    sampleDimensionCount: input.sampleReport.dimensions.length,
    sampleRowCount: input.sampleReport.rows.length,
    measurementDebugAccepted: input.measurementTests.debugEndpointAccepted,
    measurementReceiptObserved: input.measurementTests.measuredReceiptObserved,
    measurementMappingGapExplicit: input.measurementTests.mappingGapExplicit,
    readReadyStatus: input.readReady.status || null,
    nextSyncAtIso: input.readReady.nextSyncAtIso.trim() || null,
    writeAuthorized: false,
    ga4VerifiedLive: false,
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
        "Live connect-google-analytics-4 provider wiring remains NOT_WIRED — refuse live wiring (T-F04)",
      ],
    };
  }

  if (input.claimLiveVerifiedGa4) {
    return {
      allowed: false,
      code: "FALSE_LIVE_VERIFIED_GA4_REFUSED",
      ...base,
      evidence: null,
      reasons: [
        "Refused false live-verified GA4 claim offline (T-F04) — fixture ACCEPTED ≠ VERIFIED",
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
        "SAVE_READ_ONLY_WITH_NEXT_SYNC",
      ),
      reasons: [
        "GA4 connection must save as read-only — write-capable save refused (T-F04)",
      ],
    };
  }

  if (input.claimDeliveredConversionFromDebug) {
    return {
      allowed: false,
      code: "DEBUG_DELIVERED_CONVERSION_CLAIM_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "DEBUG_DELIVERED_CONVERSION_CLAIM_REFUSED",
        "BLOCKED",
        "RECORD_THREE_DISTINCT_MEASUREMENT_OUTCOMES",
      ),
      reasons: [
        "Debug validation is not a delivered conversion — claim refused (T-F04)",
      ],
    };
  }

  if (!input.packageId.trim() || !connectionIdentityOk(input.connectionIdentity)) {
    return {
      allowed: false,
      code: "CONNECTION_IDENTITY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "CONNECTION_IDENTITY_INCOMPLETE",
        "AWAITING_CONNECTION_IDENTITY",
        "RECORD_SCOPES_AND_CONNECTION_IDENTITY",
      ),
      reasons: [
        "F04 requires grant scopes and connection identity (T-F04)",
      ],
    };
  }

  if (!propertyBindingFieldsOk(input.propertyToSiteBinding)) {
    return {
      allowed: false,
      code: "PROPERTY_TO_SITE_BINDING_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "PROPERTY_BINDING_INCOMPLETE",
        "AWAITING_PROPERTY_BINDING",
        "BIND_GA4_PROPERTY_ACCOUNT_STREAM_TO_SITE",
      ),
      reasons: [
        "F04 requires confirmed property-to-site binding (account, property, web stream, site) (T-F04)",
      ],
    };
  }

  const kindValidation = validateGa4PropertyBinding({
    propertyId: input.propertyToSiteBinding.propertyId,
    kind: input.propertyToSiteBinding.kind,
    measurementId: input.propertyToSiteBinding.measurementId,
    displayName: input.propertyToSiteBinding.displayName,
    environment: AnalyticsEnvironment.FIXTURE,
  });
  if (!kindValidation.ok) {
    return {
      allowed: false,
      code: "WRONG_PROPERTY_KIND_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "WRONG_PROPERTY_KIND_REFUSED",
        "BLOCKED",
        "BIND_GA4_PROPERTY_ACCOUNT_STREAM_TO_SITE",
      ),
      reasons: [
        `Wrong property kind ${input.propertyToSiteBinding.kind} — only ga4_property accepted (T-F04)`,
      ],
    };
  }
  if (input.propertyToSiteBinding.kind !== Ga4PropertyKind.GA4_PROPERTY) {
    return {
      allowed: false,
      code: "WRONG_PROPERTY_KIND_REFUSED",
      ...base,
      evidence: blockedEvidence(
        "WRONG_PROPERTY_KIND_REFUSED",
        "BLOCKED",
        "BIND_GA4_PROPERTY_ACCOUNT_STREAM_TO_SITE",
      ),
      reasons: [
        "Property kind must be ga4_property for F04 binding (T-F04)",
      ],
    };
  }

  if (!eventDictionaryOk(input.eventDictionary)) {
    return {
      allowed: false,
      code: "EVENT_DICTIONARY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "EVENT_DICTIONARY_INCOMPLETE",
        "AWAITING_EVENT_DICTIONARY",
        "VERSION_EVENT_DICTIONARY_WITH_OWNER_AND_GAPS",
      ),
      reasons: [
        "F04 requires a versioned event dictionary with owner; unmapped events need explicit gapReason (T-F04)",
      ],
    };
  }

  if (!sampleReportOk(input.sampleReport)) {
    return {
      allowed: false,
      code: "SAMPLE_REPORT_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "SAMPLE_REPORT_INCOMPLETE",
        "AWAITING_SAMPLE_REPORT",
        "RUN_BOUNDED_SAMPLE_REPORT",
      ),
      reasons: [
        "F04 requires a bounded sample report with provider request ID, dimensions, rows, and coverage (T-F04)",
      ],
    };
  }

  if (!measurementTestsOk(input.measurementTests)) {
    return {
      allowed: false,
      code: "MEASUREMENT_TESTS_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "MEASUREMENT_TESTS_INCOMPLETE",
        "AWAITING_MEASUREMENT_TESTS",
        "RECORD_THREE_DISTINCT_MEASUREMENT_OUTCOMES",
      ),
      reasons: [
        "F04 requires three distinct measurement outcomes with mapping gaps kept explicit (T-F04)",
      ],
    };
  }

  if (!readReadyOk(input.readReady)) {
    return {
      allowed: false,
      code: "READ_READY_REQUIRED",
      ...base,
      evidence: blockedEvidence(
        "READ_READY_INCOMPLETE",
        "AWAITING_READ_READY",
        "SAVE_READ_ONLY_WITH_NEXT_SYNC",
      ),
      reasons: [
        "F04 requires READ_READY status, next sync time, and writeAuthorized=false (T-F04)",
      ],
    };
  }

  return {
    allowed: true,
    code: "CONNECT_GOOGLE_ANALYTICS_4_EVIDENCE_RECORDED",
    ...base,
    evidence: {
      packageId: input.packageId.trim(),
      connectionSubject: input.connectionIdentity.subject.trim(),
      grantScopeCount: input.connectionIdentity.grantScopes.length,
      propertyId: input.propertyToSiteBinding.propertyId.trim(),
      accountId: input.propertyToSiteBinding.accountId.trim(),
      webStreamId: input.propertyToSiteBinding.webStreamId.trim(),
      siteBindingId: input.propertyToSiteBinding.siteBindingId.trim(),
      propertyKind: "ga4_property",
      eventDictionaryVersion: input.eventDictionary.version.trim(),
      eventDictionaryOwner: input.eventDictionary.owner.trim(),
      eventEntryCount: input.eventDictionary.entries.length,
      mappedEventCount,
      explicitGapCount,
      sampleProviderRequestId: input.sampleReport.providerRequestId.trim(),
      sampleDimensionCount: input.sampleReport.dimensions.length,
      sampleRowCount: input.sampleReport.rows.length,
      measurementDebugAccepted: input.measurementTests.debugEndpointAccepted,
      measurementReceiptObserved: input.measurementTests.measuredReceiptObserved,
      measurementMappingGapExplicit: true,
      readReadyStatus: "READ_READY",
      nextSyncAtIso: input.readReady.nextSyncAtIso.trim(),
      writeAuthorized: false,
      ga4VerifiedLive: false,
      productionWrites: false,
      blockingDecision: "F04_EVIDENCE_PACKAGE_COMPLETE",
      currentState: "GA4_CONNECTION_RECORDED_READ_READY",
      recoveryPath: "KEEP_READ_ONLY_EXPOSE_EVENT_MAPPING_GAPS",
      preservedInputCount: preserved,
    },
    reasons: [
      "Complete F04 evidence package recorded (scopes+identity, property→site bind, versioned event dictionary+owner+gaps, sample report request/rows/coverage, three measurement outcomes, READ_READY+next sync); live NOT_WIRED; externalEffects NONE",
    ],
  };
}
