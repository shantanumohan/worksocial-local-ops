/**
 * Fixture proof for T-US-009 — Connect Search Console schedule and watermark.
 *
 * Saves fixture GSC as read-only: property bind, comparable-query config,
 * intent→page map, observation batch + coverage notes, daily read schedule,
 * source watermark. Write refused; live NOT_WIRED. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  AnalyticsEnvironment,
  ConnectionState,
  GscConnectSaveMode,
  GscPropertyKind,
  SoakProofKind,
  WriteReadiness,
  fixtureGscPropertyBinding,
  saveGscReadOnlyConnection,
  type GscPropertyKindValue,
  type SoakProofRecord,
} from "@worksocial/domain";

/**
 * Complete expected proof set for T-US-009 fixture ACCEPTED.
 */
export function proofConnectGscScheduleWatermark(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;
  const connectionId = `gsc-conn-${randomUUID().slice(0, 8)}`;
  const watermarkIso = new Date(Date.parse(nowIso) - 12 * 60 * 60 * 1000).toISOString();

  // 1. Happy path — read-only save → READ_READY + schedule + watermark.
  const saved = saveGscReadOnlyConnection({
    nowIso,
    connectionId,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    property: fixtureGscPropertyBinding({
      propertyId: "sc-domain:worksocial.test",
    }),
    comparableQuery: {
      country: "usa",
      device: "DESKTOP",
      searchType: "web",
      comparisonWindowStartIso: new Date(
        Date.parse(nowIso) - 7 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      comparisonWindowEndIso: nowIso,
    },
    intentPageMappings: [
      {
        intent: "quiet desks jersey city",
        pagePath: "/spaces/quiet-desks",
        confidence: "high",
      },
      {
        intent: "day pass coworking",
        pagePath: "/passes/day",
        confidence: "medium",
      },
    ],
    observationBatch: {
      batchId: `obs-${randomUUID().slice(0, 8)}`,
      rows: [
        {
          query: "quiet desks jersey city",
          pagePath: "/spaces/quiet-desks",
          clicks: 9,
          impressions: 210,
          omitted: false,
          coverageNote: "fixture sample — not live GSC metrics",
        },
        {
          query: "day pass coworking",
          pagePath: "/passes/day",
          clicks: null,
          impressions: null,
          omitted: true,
          coverageNote: "omitted row retained as coverage note (not zero demand)",
        },
      ],
    },
    sourceWatermarkIso: watermarkIso,
    saveMode: GscConnectSaveMode.READ_ONLY,
  });

  if (
    saved.ok &&
    saved.connectionState === ConnectionState.READ_READY &&
    saved.writeReadiness === WriteReadiness.NOT_AUTHORIZED &&
    saved.status.connected === true &&
    saved.status.authorized === false &&
    saved.status.verified === false &&
    saved.dailyReadScheduleAtIso > nowIso &&
    saved.sourceWatermarkIso === watermarkIso &&
    saved.sourceWatermarkIso <= nowIso &&
    saved.intentMappingCount === 2 &&
    saved.observationRowCount === 2 &&
    saved.coverageNotes.length >= 1 &&
    saved.comparableQuery.country === "usa" &&
    saved.liveWiring === "FIXTURE" &&
    saved.externalEffects === "NONE"
  ) {
    details.push(
      `READ_READY schedule=${saved.dailyReadScheduleAtIso}; watermark=${saved.sourceWatermarkIso}; property=${saved.propertyId}`,
    );
    details.push(
      `Comparable query ${saved.comparableQuery.country}/${saved.comparableQuery.device}/${saved.comparableQuery.searchType}`,
    );
    details.push(
      `Intent mappings=${saved.intentMappingCount}; observation batch ${saved.observationBatchId} rows=${saved.observationRowCount}`,
    );
  } else {
    passed = false;
    details.push(`Happy-path save unexpectedly ${JSON.stringify(saved)}`);
  }

  // 2. WRITE save refused.
  const writeRefuse = saveGscReadOnlyConnection({
    nowIso,
    connectionId: `gsc-write-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["webmasters.readonly"],
    property: fixtureGscPropertyBinding(),
    comparableQuery: {
      country: "usa",
      device: "MOBILE",
      searchType: "web",
      comparisonWindowStartIso: "2026-11-01T00:00:00.000Z",
      comparisonWindowEndIso: "2026-11-08T00:00:00.000Z",
    },
    intentPageMappings: [
      {
        intent: "coworking",
        pagePath: "/",
        confidence: "low",
      },
    ],
    observationBatch: {
      batchId: "obs-write-refuse",
      rows: [
        {
          query: "coworking",
          pagePath: "/",
          clicks: 1,
          impressions: 10,
          omitted: false,
          coverageNote: "fixture",
        },
      ],
    },
    sourceWatermarkIso: watermarkIso,
    saveMode: GscConnectSaveMode.WRITE,
  });
  if (!writeRefuse.ok && writeRefuse.code === "WRITE_SAVE_REFUSED") {
    details.push("WRITE save mode → WRITE_SAVE_REFUSED (read-only only)");
  } else {
    passed = false;
    details.push(`WRITE refuse unexpectedly ${JSON.stringify(writeRefuse)}`);
  }

  // 3. Live transport refused.
  const liveRefuse = saveGscReadOnlyConnection({
    nowIso,
    connectionId: `gsc-live-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["webmasters.readonly"],
    property: {
      propertyId: "sc-domain:live.example",
      kind: GscPropertyKind.DOMAIN,
      displayName: "Live attempt",
      environment: AnalyticsEnvironment.LIVE,
    },
    comparableQuery: {
      country: "usa",
      device: "DESKTOP",
      searchType: "web",
      comparisonWindowStartIso: "2026-11-01T00:00:00.000Z",
      comparisonWindowEndIso: "2026-11-08T00:00:00.000Z",
    },
    intentPageMappings: [
      {
        intent: "coworking",
        pagePath: "/",
        confidence: "low",
      },
    ],
    observationBatch: {
      batchId: "obs-live-refuse",
      rows: [
        {
          query: "coworking",
          pagePath: "/",
          clicks: 1,
          impressions: 10,
          omitted: false,
          coverageNote: "fixture",
        },
      ],
    },
    sourceWatermarkIso: watermarkIso,
    saveMode: GscConnectSaveMode.READ_ONLY,
  });
  if (!liveRefuse.ok && liveRefuse.code === "LIVE_TRANSPORT_NOT_WIRED") {
    details.push("LIVE property → LIVE_TRANSPORT_NOT_WIRED");
  } else {
    passed = false;
    details.push(`LIVE refuse unexpectedly ${JSON.stringify(liveRefuse)}`);
  }

  // 4. Future watermark refused.
  const futureWm = saveGscReadOnlyConnection({
    nowIso,
    connectionId: `gsc-wm-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["webmasters.readonly"],
    property: fixtureGscPropertyBinding(),
    comparableQuery: {
      country: "usa",
      device: "DESKTOP",
      searchType: "web",
      comparisonWindowStartIso: "2026-11-01T00:00:00.000Z",
      comparisonWindowEndIso: "2026-11-08T00:00:00.000Z",
    },
    intentPageMappings: [
      {
        intent: "coworking",
        pagePath: "/",
        confidence: "low",
      },
    ],
    observationBatch: {
      batchId: "obs-wm-refuse",
      rows: [
        {
          query: "coworking",
          pagePath: "/",
          clicks: 1,
          impressions: 10,
          omitted: false,
          coverageNote: "fixture",
        },
      ],
    },
    sourceWatermarkIso: new Date(Date.parse(nowIso) + 60_000).toISOString(),
    saveMode: GscConnectSaveMode.READ_ONLY,
  });
  if (!futureWm.ok && futureWm.code === "INVALID_SOURCE_WATERMARK") {
    details.push("Future source watermark → INVALID_SOURCE_WATERMARK");
  } else {
    passed = false;
    details.push(`Watermark refuse unexpectedly ${JSON.stringify(futureWm)}`);
  }

  // 5. Unknown property kind refused.
  const unknownKind = saveGscReadOnlyConnection({
    nowIso,
    connectionId: `gsc-kind-${randomUUID().slice(0, 8)}`,
    identitySubject: "fixture-owner@worksocial.test",
    grantScopes: ["webmasters.readonly"],
    property: {
      propertyId: "sc-unknown",
      kind: "unknown" as GscPropertyKindValue,
      displayName: "Unknown",
      environment: AnalyticsEnvironment.FIXTURE,
    },
    comparableQuery: {
      country: "usa",
      device: "DESKTOP",
      searchType: "web",
      comparisonWindowStartIso: "2026-11-01T00:00:00.000Z",
      comparisonWindowEndIso: "2026-11-08T00:00:00.000Z",
    },
    intentPageMappings: [
      {
        intent: "coworking",
        pagePath: "/",
        confidence: "low",
      },
    ],
    observationBatch: {
      batchId: "obs-kind-refuse",
      rows: [
        {
          query: "coworking",
          pagePath: "/",
          clicks: 1,
          impressions: 10,
          omitted: false,
          coverageNote: "fixture",
        },
      ],
    },
    sourceWatermarkIso: watermarkIso,
    saveMode: GscConnectSaveMode.READ_ONLY,
  });
  if (!unknownKind.ok && unknownKind.code === "WRONG_PROPERTY_KIND") {
    details.push("unknown property kind → WRONG_PROPERTY_KIND refuse");
  } else {
    passed = false;
    details.push(`Kind refuse unexpectedly ${JSON.stringify(unknownKind)}`);
  }

  details.push(
    "No gateway mutate — connection save is local fixture record only; applyAttemptCount=0",
  );
  details.push("liveProviderSuccessClaimed=false externalEffects=NONE");

  return {
    proofId: `proof-gsc-connect-${randomUUID()}`,
    kind: SoakProofKind.CONNECT_GSC_SCHEDULE_WATERMARK,
    passed,
    details,
    // Local fixture connection record only — never submitIntent/apply.
    applyAttemptCount: 0,
    operationId: `op-us009-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
