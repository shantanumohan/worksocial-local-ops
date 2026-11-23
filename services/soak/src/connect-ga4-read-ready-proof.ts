/**
 * Fixture proof for T-US-007 — Connect GA4 ready-read and next sync.
 *
 * Saves fixture GA4 as read-only: property→site bind, versioned event
 * dictionary with explicit gaps, bounded sample report, READ_READY +
 * nextSyncAtIso. Write refused; live NOT_WIRED. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  ConnectionState,
  Ga4ConnectSaveMode,
  Ga4PropertyKind,
  SoakProofKind,
  WriteReadiness,
  fixtureGa4PropertyBinding,
  saveGa4ReadOnlyConnection,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-007 fixture ACCEPTED.
 */
export function proofConnectGa4ReadReadyNextSync(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const connectionId = `ga4-conn-${randomUUID().slice(0, 8)}`;

  // 1. Happy path — read-only save → READ_READY + next sync.
  const saved = saveGa4ReadOnlyConnection({
    nowIso,
    connectionId,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["https://www.googleapis.com/auth/analytics.readonly"],
    property: fixtureGa4PropertyBinding({ propertyId: "100000007" }),
    siteBindingId: "site-fixture-main",
    webStreamId: "stream-web-007",
    eventDictionary: [
      {
        eventName: "generate_lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        gapReason: null,
      },
      {
        eventName: "purchase",
        businessOutcome: "booking",
        mapped: false,
        gapReason: "booking stream not mapped",
      },
      {
        eventName: "tour_request",
        businessOutcome: "tour_booked",
        mapped: false,
        gapReason: "tour intent unmapped",
      },
    ],
    eventDictionaryOwner: "owner-fixture",
    eventDictionaryVersion: "edict-tus007-v1",
    sampleReport: {
      requestId: `req-sample-${randomUUID().slice(0, 8)}`,
      rows: [
        {
          dimension: "sessionDefaultChannelGroup",
          metric: "sessions",
          value: 7,
          coverageNote: "fixture sample — not live metrics",
        },
        {
          dimension: "pagePathPlusQueryString",
          metric: "screenPageViews",
          value: 21,
          coverageNote: "fixture sample — not live metrics",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: true,
      measuredReceiptObserved: false,
      mappingGapExplicit: true,
    },
    saveMode: Ga4ConnectSaveMode.READ_ONLY,
  });

  if (
    saved.ok &&
    saved.connectionState === ConnectionState.READ_READY &&
    saved.writeReadiness === WriteReadiness.NOT_AUTHORIZED &&
    saved.status.connected === true &&
    saved.status.authorized === false &&
    saved.status.verified === false &&
    saved.nextSyncAtIso > nowIso &&
    saved.mappedEventCount === 1 &&
    saved.unmappedEventCount === 2 &&
    saved.eventGaps.length === 2 &&
    saved.sampleRowCount === 2 &&
    saved.sampleRows.length === 2 &&
    saved.measurementOutcomes.deliveredConversionClaimed === false &&
    saved.measurementOutcomes.debugOk === true &&
    saved.measurementOutcomes.mappingGapExplicit === true &&
    saved.liveWiring === "FIXTURE" &&
    saved.externalEffects === "NONE"
  ) {
    details.push(
      `READ_READY nextSync=${saved.nextSyncAtIso}; property=${saved.propertyId} site=${saved.siteBindingId}`,
    );
    details.push(
      `Event dictionary ${saved.eventDictionaryVersion} mapped=${saved.mappedEventCount} gaps=${saved.unmappedEventCount}`,
    );
    details.push(
      `Event gaps explicit: ${saved.eventGaps.join("; ")}`,
    );
    details.push(
      `Sample report ${saved.sampleReportRequestId} rows=${saved.sampleRowCount}; debug≠deliveredConversion`,
    );
    for (const row of saved.sampleRows) {
      details.push(
        `Sample row dim=${row.dimension} metric=${row.metric} value=${row.value} coverage=${row.coverageNote}`,
      );
    }
  } else {
    passed = false;
    details.push(`Happy-path save unexpectedly ${JSON.stringify(saved)}`);
  }

  // 2. Three distinct measurement outcomes remain separable.
  if (
    saved.ok &&
    saved.measurementOutcomes.debugOk &&
    !saved.measurementOutcomes.measuredReceiptObserved &&
    saved.measurementOutcomes.mappingGapExplicit &&
    saved.measurementOutcomes.deliveredConversionClaimed === false
  ) {
    details.push(
      "Three measurement outcomes distinct: debugOk / no measured receipt / explicit mapping gaps",
    );
  } else {
    passed = false;
    details.push("Measurement outcome separation failed");
  }

  // 3. WRITE save refused.
  const writeRefuse = saveGa4ReadOnlyConnection({
    nowIso,
    connectionId: `ga4-write-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["analytics.readonly"],
    property: fixtureGa4PropertyBinding(),
    siteBindingId: "site-fixture-main",
    webStreamId: "stream-web-007",
    eventDictionary: [
      {
        eventName: "generate_lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        gapReason: null,
      },
    ],
    eventDictionaryOwner: "owner-fixture",
    eventDictionaryVersion: "edict-write-refuse",
    sampleReport: {
      requestId: "req-write-refuse",
      rows: [
        {
          dimension: "date",
          metric: "sessions",
          value: 1,
          coverageNote: "fixture",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: false,
      measuredReceiptObserved: false,
      mappingGapExplicit: false,
    },
    saveMode: Ga4ConnectSaveMode.WRITE,
  });
  if (!writeRefuse.ok && writeRefuse.code === "WRITE_SAVE_REFUSED") {
    details.push("WRITE save mode → WRITE_SAVE_REFUSED (read-only only)");
  } else {
    passed = false;
    details.push(`WRITE refuse unexpectedly ${JSON.stringify(writeRefuse)}`);
  }

  // 4. Live transport refused.
  const liveRefuse = saveGa4ReadOnlyConnection({
    nowIso,
    connectionId: `ga4-live-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["analytics.readonly"],
    property: {
      propertyId: "100000007",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-LIVE",
      displayName: "Live attempt",
      environment: AnalyticsEnvironment.LIVE,
    },
    siteBindingId: "site-fixture-main",
    webStreamId: "stream-web-007",
    eventDictionary: [
      {
        eventName: "generate_lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        gapReason: null,
      },
    ],
    eventDictionaryOwner: "owner-fixture",
    eventDictionaryVersion: "edict-live-refuse",
    sampleReport: {
      requestId: "req-live-refuse",
      rows: [
        {
          dimension: "date",
          metric: "sessions",
          value: 1,
          coverageNote: "fixture",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: false,
      measuredReceiptObserved: false,
      mappingGapExplicit: false,
    },
    saveMode: Ga4ConnectSaveMode.READ_ONLY,
  });
  if (!liveRefuse.ok && liveRefuse.code === "LIVE_TRANSPORT_NOT_WIRED") {
    details.push("LIVE property → LIVE_TRANSPORT_NOT_WIRED");
  } else {
    passed = false;
    details.push(`LIVE refuse unexpectedly ${JSON.stringify(liveRefuse)}`);
  }

  // 5. Wrong property kind still refused (positive control vs T-X031 gate).
  const uaRefuse = saveGa4ReadOnlyConnection({
    nowIso,
    connectionId: `ga4-ua-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["analytics.readonly"],
    property: {
      propertyId: "UA-999",
      kind: Ga4PropertyKind.UA_PROPERTY,
      measurementId: null,
      displayName: "Legacy UA",
      environment: AnalyticsEnvironment.FIXTURE,
    },
    siteBindingId: "site-fixture-main",
    webStreamId: "stream-web-007",
    eventDictionary: [
      {
        eventName: "generate_lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        gapReason: null,
      },
    ],
    eventDictionaryOwner: "owner-fixture",
    eventDictionaryVersion: "edict-ua-refuse",
    sampleReport: {
      requestId: "req-ua-refuse",
      rows: [
        {
          dimension: "date",
          metric: "sessions",
          value: 1,
          coverageNote: "fixture",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: false,
      measuredReceiptObserved: false,
      mappingGapExplicit: false,
    },
    saveMode: Ga4ConnectSaveMode.READ_ONLY,
  });
  if (!uaRefuse.ok && uaRefuse.code === "WRONG_PROPERTY_KIND") {
    details.push("UA property kind → WRONG_PROPERTY_KIND refuse");
  } else {
    passed = false;
    details.push(`UA refuse unexpectedly ${JSON.stringify(uaRefuse)}`);
  }

  // 6. NOT_WIRED environment cannot be READ_READY.
  const notWired = saveGa4ReadOnlyConnection({
    nowIso,
    connectionId: `ga4-nw-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["analytics.readonly"],
    property: {
      ...fixtureGa4PropertyBinding(),
      environment: AnalyticsEnvironment.NOT_WIRED,
    },
    siteBindingId: "site-fixture-main",
    webStreamId: "stream-web-007",
    eventDictionary: [
      {
        eventName: "generate_lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        gapReason: null,
      },
    ],
    eventDictionaryOwner: "owner-fixture",
    eventDictionaryVersion: "edict-nw-refuse",
    sampleReport: {
      requestId: "req-nw-refuse",
      rows: [
        {
          dimension: "date",
          metric: "sessions",
          value: 1,
          coverageNote: "fixture",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: false,
      measuredReceiptObserved: false,
      mappingGapExplicit: false,
    },
    saveMode: Ga4ConnectSaveMode.READ_ONLY,
  });
  if (!notWired.ok && notWired.code === "ENVIRONMENT_NOT_READY") {
    details.push("NOT_WIRED environment → ENVIRONMENT_NOT_READY");
  } else {
    passed = false;
    details.push(`NOT_WIRED refuse unexpectedly ${JSON.stringify(notWired)}`);
  }

  // 7. Write-capable scope refused.
  const writeScope = saveGa4ReadOnlyConnection({
    nowIso,
    connectionId: `ga4-ws-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["https://www.googleapis.com/auth/analytics"],
    property: fixtureGa4PropertyBinding(),
    siteBindingId: "site-fixture-main",
    webStreamId: "stream-web-007",
    eventDictionary: [
      {
        eventName: "generate_lead",
        businessOutcome: "qualified_lead",
        mapped: true,
        gapReason: null,
      },
    ],
    eventDictionaryOwner: "owner-fixture",
    eventDictionaryVersion: "edict-ws-refuse",
    sampleReport: {
      requestId: "req-ws-refuse",
      rows: [
        {
          dimension: "date",
          metric: "sessions",
          value: 1,
          coverageNote: "fixture",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: false,
      measuredReceiptObserved: false,
      mappingGapExplicit: false,
    },
    saveMode: Ga4ConnectSaveMode.READ_ONLY,
  });
  if (!writeScope.ok && writeScope.code === "WRITE_SCOPE_REFUSED") {
    details.push("Write-capable analytics scope → WRITE_SCOPE_REFUSED");
  } else {
    passed = false;
    details.push(`Write-scope refuse unexpectedly ${JSON.stringify(writeScope)}`);
  }

  details.push(
    "No gateway mutate — connection save is local fixture record only; applyAttemptCount=0",
  );
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-ga4-connect-${randomUUID()}`,
    kind: SoakProofKind.CONNECT_GA4_READ_READY_NEXT_SYNC,
    passed,
    details,
    // Local fixture connection record only — never submitIntent/apply.
    applyAttemptCount: 0,
    operationId: `op-us007-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
