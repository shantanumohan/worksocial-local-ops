import { describe, expect, it } from "vitest";
import {
  AnalyticsEnvironment,
  Ga4PropertyKind,
} from "./analytics.js";
import { ConnectionState, WriteReadiness } from "./connection-status.js";
import {
  DEFAULT_GA4_READ_SYNC_INTERVAL_MS,
  Ga4ConnectSaveMode,
  fixtureGa4PropertyBinding,
  saveGa4ReadOnlyConnection,
} from "./ga4-connect-read-ready.js";

const nowIso = "2026-11-22T21:00:00.000Z";

function baseInput(
  overrides: Partial<Parameters<typeof saveGa4ReadOnlyConnection>[0]> = {},
) {
  return {
    nowIso,
    connectionId: "ga4-conn-fixture-007",
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["analytics.readonly"],
    property: fixtureGa4PropertyBinding(),
    siteBindingId: "site-fixture-main",
    webStreamId: "stream-web-001",
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
        gapReason: "no booking stream mapped",
      },
    ],
    eventDictionaryOwner: "owner-fixture",
    eventDictionaryVersion: "edict-v1",
    sampleReport: {
      requestId: "req-sample-007",
      rows: [
        {
          dimension: "sessionDefaultChannelGroup",
          metric: "sessions",
          value: 12,
          coverageNote: "fixture sample only",
        },
      ],
    },
    measurementTests: {
      debugEndpointAccepted: true,
      measuredReceiptObserved: false,
      mappingGapExplicit: true,
    },
    saveMode: Ga4ConnectSaveMode.READ_ONLY,
    ...overrides,
  };
}

describe("ga4-connect-read-ready (T-US-007)", () => {
  it("saves read-only connection with READ_READY and next sync", () => {
    const result = saveGa4ReadOnlyConnection(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.connectionState).toBe(ConnectionState.READ_READY);
    expect(result.writeReadiness).toBe(WriteReadiness.NOT_AUTHORIZED);
    expect(result.status.connected).toBe(true);
    expect(result.status.authorized).toBe(false);
    expect(result.status.verified).toBe(false);
    expect(result.nextSyncAtIso).toBe(
      new Date(
        Date.parse(nowIso) + DEFAULT_GA4_READ_SYNC_INTERVAL_MS,
      ).toISOString(),
    );
    expect(result.mappedEventCount).toBe(1);
    expect(result.unmappedEventCount).toBe(1);
    expect(result.eventGaps[0]).toMatch(/purchase/);
    expect(result.sampleRowCount).toBe(1);
    expect(result.measurementOutcomes.deliveredConversionClaimed).toBe(false);
    expect(result.measurementOutcomes.debugOk).toBe(true);
    expect(result.liveWiring).toBe("FIXTURE");
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses WRITE save mode", () => {
    const result = saveGa4ReadOnlyConnection(
      baseInput({ saveMode: Ga4ConnectSaveMode.WRITE }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_SAVE_REFUSED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses LIVE property transport", () => {
    const result = saveGa4ReadOnlyConnection(
      baseInput({
        property: {
          ...fixtureGa4PropertyBinding(),
          environment: AnalyticsEnvironment.LIVE,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("LIVE_TRANSPORT_NOT_WIRED");
  });

  it("refuses wrong property kind", () => {
    const result = saveGa4ReadOnlyConnection(
      baseInput({
        property: {
          propertyId: "UA-1",
          kind: Ga4PropertyKind.UA_PROPERTY,
          measurementId: null,
          displayName: "UA",
          environment: AnalyticsEnvironment.FIXTURE,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRONG_PROPERTY_KIND");
  });

  it("refuses empty sample report", () => {
    const result = saveGa4ReadOnlyConnection(
      baseInput({
        sampleReport: { requestId: "req-empty", rows: [] },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("SAMPLE_REPORT_EMPTY");
  });

  it("requires identity and scopes", () => {
    const result = saveGa4ReadOnlyConnection(
      baseInput({ identitySubject: "  ", grantScopes: [] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_IDENTITY");
  });

  it("refuses write-capable or blank scopes", () => {
    const write = saveGa4ReadOnlyConnection(
      baseInput({
        grantScopes: ["https://www.googleapis.com/auth/analytics"],
      }),
    );
    expect(write.ok).toBe(false);
    if (write.ok) return;
    expect(write.code).toBe("WRITE_SCOPE_REFUSED");

    const blank = saveGa4ReadOnlyConnection(
      baseInput({ grantScopes: ["", "  "] }),
    );
    expect(blank.ok).toBe(false);
    if (blank.ok) return;
    expect(blank.code).toBe("MISSING_IDENTITY");
  });

  it("refuses NOT_WIRED / UNAVAILABLE environments", () => {
    for (const environment of [
      AnalyticsEnvironment.NOT_WIRED,
      AnalyticsEnvironment.UNAVAILABLE,
    ] as const) {
      const result = saveGa4ReadOnlyConnection(
        baseInput({
          property: { ...fixtureGa4PropertyBinding(), environment },
        }),
      );
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.code).toBe("ENVIRONMENT_NOT_READY");
    }
  });

  it("requires explicit gapReason when mappingGapExplicit", () => {
    const result = saveGa4ReadOnlyConnection(
      baseInput({
        eventDictionary: [
          {
            eventName: "purchase",
            businessOutcome: "booking",
            mapped: false,
            gapReason: null,
          },
        ],
        measurementTests: {
          debugEndpointAccepted: true,
          measuredReceiptObserved: false,
          mappingGapExplicit: true,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("EVENT_GAP_REASON_REQUIRED");
  });

  it("rejects non-positive syncIntervalMs", () => {
    const zero = saveGa4ReadOnlyConnection(baseInput({ syncIntervalMs: 0 }));
    expect(zero.ok).toBe(false);
    if (zero.ok) return;
    expect(zero.code).toBe("INVALID_SYNC_INTERVAL");

    const nan = saveGa4ReadOnlyConnection(
      baseInput({ syncIntervalMs: Number.NaN }),
    );
    expect(nan.ok).toBe(false);
    if (nan.ok) return;
    expect(nan.code).toBe("INVALID_SYNC_INTERVAL");
  });
});
