/**
 * Fixture proof for T-F04 — Connect Google Analytics 4.
 * Complete F04 evidence package: scopes+identity, property→site bind,
 * versioned event dictionary+owner+gaps, sample report request/rows/coverage,
 * three measurement outcomes, READ_READY+next sync; unsafe claims refused;
 * live NOT_WIRED. Distinct from open T-US-007 ready-read/next-sync summary.
 * External effects: NONE. Never invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  Ga4PropertyKind,
  REQUIRED_GA4_GRANT_SCOPES,
  SoakProofKind,
  evaluateConnectGoogleAnalytics4,
  type ConnectGoogleAnalytics4Input,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ConnectGoogleAnalytics4Input> = {},
): ConnectGoogleAnalytics4Input {
  return {
    packageId: "pkg-f04-soak",
    connectionIdentity: {
      subject: "owner@example.worksocial.test",
      grantScopes: [...REQUIRED_GA4_GRANT_SCOPES],
    },
    propertyToSiteBinding: {
      propertyId: "properties/123456789",
      accountId: "accounts/111",
      webStreamId: "streams/222",
      siteBindingId: "site-bind-f04-soak",
      kind: Ga4PropertyKind.GA4_PROPERTY,
      measurementId: "G-TESTFIXTURE",
      displayName: "Fixture GA4 property",
    },
    eventDictionary: {
      version: "evt-dict-v1",
      owner: "owner-analytics",
      entries: [
        {
          eventName: "generate_lead",
          businessOutcome: "qualified_lead",
          mapped: true,
          gapReason: null,
        },
        {
          eventName: "purchase",
          businessOutcome: "booking_completed",
          mapped: false,
          gapReason: "booking provider not wired in fixture",
        },
      ],
    },
    sampleReport: {
      providerRequestId: "req-ga4-sample-f04-soak",
      dimensions: ["date", "sessionDefaultChannelGroup"],
      rows: [
        {
          dimension: "2026-11-22|Organic Search",
          metric: "sessions",
          value: 42,
          coverageNote: "fixture sample window; not live metrics",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: true,
      measuredReceiptObserved: false,
      mappingGapExplicit: true,
    },
    readReady: {
      status: "READ_READY",
      nextSyncAtIso: "2026-11-23T06:00:00.000Z",
      writeAuthorized: false,
    },
    attemptWriteSave: false,
    claimDeliveredConversionFromDebug: false,
    claimLiveVerifiedGa4: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F04 fixture ACCEPTED.
 */
export function proofConnectGoogleAnalytics4(nowIso: string): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateConnectGoogleAnalytics4(baseInput());
  if (
    happy.allowed &&
    happy.code === "CONNECT_GOOGLE_ANALYTICS_4_EVIDENCE_RECORDED" &&
    happy.evidence.propertyKind === "ga4_property" &&
    happy.evidence.measurementMappingGapExplicit === true &&
    happy.evidence.readReadyStatus === "READ_READY" &&
    happy.evidence.writeAuthorized === false &&
    happy.evidence.ga4VerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F04 evidence package → CONNECT_GOOGLE_ANALYTICS_4_EVIDENCE_RECORDED; scopes+identity; property→site bind; versioned event dictionary+owner+gaps; sample report request/rows/coverage; three measurement outcomes; READ_READY+next sync; ga4VerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noIdentity = evaluateConnectGoogleAnalytics4(
    baseInput({
      connectionIdentity: { subject: "", grantScopes: [] },
    }),
  );
  if (
    !noIdentity.allowed &&
    noIdentity.code === "CONNECTION_IDENTITY_REQUIRED"
  ) {
    details.push("empty connection identity → CONNECTION_IDENTITY_REQUIRED");
  } else {
    passed = false;
    details.push(`Connection identity unexpectedly ${JSON.stringify(noIdentity)}`);
  }

  const wrongKind = evaluateConnectGoogleAnalytics4(
    baseInput({
      propertyToSiteBinding: {
        ...baseInput().propertyToSiteBinding,
        kind: Ga4PropertyKind.UA_PROPERTY,
      },
    }),
  );
  if (
    !wrongKind.allowed &&
    wrongKind.code === "WRONG_PROPERTY_KIND_REFUSED"
  ) {
    details.push("UA property kind → WRONG_PROPERTY_KIND_REFUSED");
  } else {
    passed = false;
    details.push(`Wrong kind unexpectedly ${JSON.stringify(wrongKind)}`);
  }

  const noSample = evaluateConnectGoogleAnalytics4(
    baseInput({
      sampleReport: { providerRequestId: "", dimensions: [], rows: [] },
    }),
  );
  if (!noSample.allowed && noSample.code === "SAMPLE_REPORT_REQUIRED") {
    details.push("empty sample report → SAMPLE_REPORT_REQUIRED");
  } else {
    passed = false;
    details.push(`Sample report unexpectedly ${JSON.stringify(noSample)}`);
  }

  const blankGap = evaluateConnectGoogleAnalytics4(
    baseInput({
      eventDictionary: {
        version: "evt-dict-v1",
        owner: "owner-analytics",
        entries: [
          {
            eventName: "purchase",
            businessOutcome: "booking_completed",
            mapped: false,
            gapReason: null,
          },
        ],
      },
    }),
  );
  if (
    !blankGap.allowed &&
    blankGap.code === "EVENT_DICTIONARY_REQUIRED"
  ) {
    details.push(
      "unmapped event without gapReason → EVENT_DICTIONARY_REQUIRED",
    );
  } else {
    passed = false;
    details.push(`Event dictionary unexpectedly ${JSON.stringify(blankGap)}`);
  }

  const writeSave = evaluateConnectGoogleAnalytics4(
    baseInput({ attemptWriteSave: true }),
  );
  if (!writeSave.allowed && writeSave.code === "WRITE_SAVE_REFUSED") {
    details.push("attemptWriteSave → WRITE_SAVE_REFUSED");
  } else {
    passed = false;
    details.push(`Write save unexpectedly ${JSON.stringify(writeSave)}`);
  }

  const debugClaim = evaluateConnectGoogleAnalytics4(
    baseInput({ claimDeliveredConversionFromDebug: true }),
  );
  if (
    !debugClaim.allowed &&
    debugClaim.code === "DEBUG_DELIVERED_CONVERSION_CLAIM_REFUSED"
  ) {
    details.push(
      "claimDeliveredConversionFromDebug → DEBUG_DELIVERED_CONVERSION_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Debug claim unexpectedly ${JSON.stringify(debugClaim)}`);
  }

  const liveClaim = evaluateConnectGoogleAnalytics4(
    baseInput({ claimLiveVerifiedGa4: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_GA4_REFUSED"
  ) {
    details.push("claimLiveVerifiedGa4 → FALSE_LIVE_VERIFIED_GA4_REFUSED");
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateConnectGoogleAnalytics4(
    baseInput({ requestLiveProviderWiring: true }),
  );
  if (
    !liveWire.allowed &&
    liveWire.code === "LIVE_PROVIDER_WIRING_NOT_WIRED"
  ) {
    details.push("requestLiveProviderWiring → LIVE_PROVIDER_WIRING_NOT_WIRED");
  } else {
    passed = false;
    details.push(`Live wiring unexpectedly ${JSON.stringify(liveWire)}`);
  }

  details.push(
    "liveProviderSuccessClaimed=false liveProviderWiring=NOT_WIRED externalEffects=NONE",
  );
  details.push(
    "Distinct from T-US-007 (ready-read/next-sync summary) — complete F04 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CONNECT_GOOGLE_ANALYTICS_4,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-connect-google-analytics-4-f04",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
