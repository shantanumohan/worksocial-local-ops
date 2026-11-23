import { describe, expect, it } from "vitest";
import { AnalyticsEnvironment } from "./analytics.js";
import { ConnectionState, WriteReadiness } from "./connection-status.js";
import { GscPropertyKind } from "./connect-search-console-organic-visibility.js";
import {
  DEFAULT_GSC_DAILY_READ_INTERVAL_MS,
  GscConnectSaveMode,
  fixtureGscPropertyBinding,
  saveGscReadOnlyConnection,
} from "./gsc-connect-schedule-watermark.js";

const nowIso = "2026-11-22T21:00:00.000Z";
const watermarkIso = "2026-11-22T06:00:00.000Z";

function baseInput(
  overrides: Partial<Parameters<typeof saveGscReadOnlyConnection>[0]> = {},
) {
  return {
    nowIso,
    connectionId: "gsc-conn-fixture-009",
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["webmasters.readonly"],
    property: fixtureGscPropertyBinding(),
    comparableQuery: {
      country: "usa",
      device: "DESKTOP",
      searchType: "web",
      comparisonWindowStartIso: "2026-11-15T00:00:00.000Z",
      comparisonWindowEndIso: "2026-11-22T00:00:00.000Z",
    },
    intentPageMappings: [
      {
        intent: "quiet desks jersey city",
        pagePath: "/spaces/quiet-desks",
        confidence: "high" as const,
      },
    ],
    observationBatch: {
      batchId: "obs-batch-009",
      rows: [
        {
          query: "quiet desks jersey city",
          pagePath: "/spaces/quiet-desks",
          clicks: 4,
          impressions: 120,
          omitted: false,
          coverageNote: "fixture sample — not live GSC",
        },
      ],
    },
    sourceWatermarkIso: watermarkIso,
    saveMode: GscConnectSaveMode.READ_ONLY,
    ...overrides,
  };
}

describe("gsc-connect-schedule-watermark (T-US-009)", () => {
  it("saves read-only connection with daily schedule and source watermark", () => {
    const result = saveGscReadOnlyConnection(baseInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.connectionState).toBe(ConnectionState.READ_READY);
    expect(result.writeReadiness).toBe(WriteReadiness.NOT_AUTHORIZED);
    expect(result.status.connected).toBe(true);
    expect(result.status.authorized).toBe(false);
    expect(result.status.verified).toBe(false);
    expect(result.dailyReadScheduleAtIso).toBe(
      new Date(
        Date.parse(nowIso) + DEFAULT_GSC_DAILY_READ_INTERVAL_MS,
      ).toISOString(),
    );
    expect(result.sourceWatermarkIso).toBe(watermarkIso);
    expect(result.intentMappingCount).toBe(1);
    expect(result.observationRowCount).toBe(1);
    expect(result.coverageNotes[0]).toMatch(/fixture sample/i);
    expect(result.liveWiring).toBe("FIXTURE");
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses WRITE save mode", () => {
    const result = saveGscReadOnlyConnection(
      baseInput({ saveMode: GscConnectSaveMode.WRITE }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("WRITE_SAVE_REFUSED");
    expect(result.externalEffects).toBe("NONE");
  });

  it("refuses LIVE property transport", () => {
    const result = saveGscReadOnlyConnection(
      baseInput({
        property: {
          ...fixtureGscPropertyBinding(),
          environment: AnalyticsEnvironment.LIVE,
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("LIVE_TRANSPORT_NOT_WIRED");
  });

  it("refuses future source watermark", () => {
    const result = saveGscReadOnlyConnection(
      baseInput({ sourceWatermarkIso: "2026-11-23T00:00:00.000Z" }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_SOURCE_WATERMARK");
  });

  it("refuses empty observation batch", () => {
    const result = saveGscReadOnlyConnection(
      baseInput({
        observationBatch: { batchId: "obs-empty", rows: [] },
      }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("OBSERVATION_BATCH_EMPTY");
  });

  it("requires identity and scopes", () => {
    const result = saveGscReadOnlyConnection(
      baseInput({ identitySubject: "  ", grantScopes: [] }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("MISSING_IDENTITY");
  });

  it("accepts URL-prefix property kind", () => {
    const result = saveGscReadOnlyConnection(
      baseInput({
        property: fixtureGscPropertyBinding({
          propertyId: "https://worksocial.test/",
          kind: GscPropertyKind.URL_PREFIX,
        }),
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.propertyKind).toBe(GscPropertyKind.URL_PREFIX);
  });
});
