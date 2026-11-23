/**
 * Fixture proof for T-F05 — Connect Search Console and organic visibility.
 * Complete F05 evidence package: identity+scopes+API readiness, property bind,
 * comparable-query config, observation batch+coverage+sitemap, intent→page map,
 * daily schedule+watermark; unsafe claims refused; live NOT_WIRED. Distinct from
 * open T-US-009 schedule/watermark summary. External effects: NONE. Never
 * invents live VERIFIED.
 */

import { randomUUID } from "node:crypto";
import {
  GscPropertyKind,
  REQUIRED_GSC_GRANT_SCOPES,
  SoakProofKind,
  evaluateConnectSearchConsoleOrganicVisibility,
  type ConnectSearchConsoleOrganicVisibilityInput,
  type SoakProofRecord,
} from "@worksocial/domain";

function baseInput(
  overrides: Partial<ConnectSearchConsoleOrganicVisibilityInput> = {},
): ConnectSearchConsoleOrganicVisibilityInput {
  return {
    packageId: "pkg-f05-soak",
    connectionIdentity: {
      subject: "owner@example.worksocial.test",
      grantScopes: [...REQUIRED_GSC_GRANT_SCOPES],
      apiEnabled: true,
    },
    propertyBinding: {
      kind: GscPropertyKind.DOMAIN,
      propertyId: "sc-domain:example.worksocial.test",
      siteBindingId: "site-bind-f05-soak",
      displayName: "Fixture GSC domain property",
    },
    comparableQuery: {
      country: "usa",
      device: "DESKTOP",
      searchType: "web",
      comparisonWindowDays: 28,
    },
    observationBatch: {
      providerRequestId: "req-gsc-obs-f05-soak",
      sitemapStatus: "submitted_ok",
      rows: [
        {
          queryOrPage: "coworking near me",
          clicks: 12,
          impressions: 90,
          coverageNote: "fixture sample window; not live metrics",
          omitted: false,
        },
        {
          queryOrPage: "omitted-query-fixture",
          clicks: null,
          impressions: null,
          coverageNote: "row omitted — UNKNOWN demand, not zero",
          omitted: true,
        },
      ],
    },
    intentToPageMappings: [
      {
        intent: "book_tour",
        pagePath: "/tour",
        highValue: true,
      },
      {
        intent: "hours",
        pagePath: "/hours",
        highValue: false,
      },
    ],
    dailyReadSchedule: {
      cadence: "daily",
      nextReadAtIso: "2026-11-24T06:00:00.000Z",
      sourceWatermark: "gsc-wm-f05-soak",
      writeAuthorized: false,
    },
    attemptWriteSave: false,
    inventZeroFromOmittedRows: false,
    claimLiveVerifiedGsc: false,
    requestLiveProviderWiring: false,
    ...overrides,
  };
}

/**
 * Complete expected proof set for T-F05 fixture ACCEPTED.
 */
export function proofConnectSearchConsoleOrganicVisibility(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  const happy = evaluateConnectSearchConsoleOrganicVisibility(baseInput());
  if (
    happy.allowed &&
    happy.code ===
      "CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_EVIDENCE_RECORDED" &&
    happy.evidence.apiEnabled === true &&
    happy.evidence.omittedRowCount === 1 &&
    happy.evidence.scheduleCadence === "daily" &&
    happy.evidence.writeAuthorized === false &&
    happy.evidence.gscVerifiedLive === false &&
    happy.liveProviderWiring === "NOT_WIRED" &&
    happy.externalEffects === "NONE"
  ) {
    details.push(
      "complete F05 evidence package → CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY_EVIDENCE_RECORDED; identity+scopes+API readiness; property bind; comparable-query config; observation batch+coverage+sitemap; intent→page map; daily schedule+watermark; gscVerifiedLive=false; live NOT_WIRED",
    );
  } else {
    passed = false;
    details.push(`Happy path unexpectedly ${JSON.stringify(happy)}`);
  }

  const noIdentity = evaluateConnectSearchConsoleOrganicVisibility(
    baseInput({
      connectionIdentity: {
        subject: "",
        grantScopes: [],
        apiEnabled: false,
      },
    }),
  );
  if (
    !noIdentity.allowed &&
    noIdentity.code === "CONNECTION_IDENTITY_REQUIRED"
  ) {
    details.push("empty connection identity → CONNECTION_IDENTITY_REQUIRED");
  } else {
    passed = false;
    details.push(
      `Connection identity unexpectedly ${JSON.stringify(noIdentity)}`,
    );
  }

  const noProperty = evaluateConnectSearchConsoleOrganicVisibility(
    baseInput({
      propertyBinding: {
        ...baseInput().propertyBinding,
        propertyId: "",
      },
    }),
  );
  if (!noProperty.allowed && noProperty.code === "PROPERTY_BINDING_REQUIRED") {
    details.push("empty propertyId → PROPERTY_BINDING_REQUIRED");
  } else {
    passed = false;
    details.push(`Property binding unexpectedly ${JSON.stringify(noProperty)}`);
  }

  const noComparable = evaluateConnectSearchConsoleOrganicVisibility(
    baseInput({
      comparableQuery: {
        country: "",
        device: "",
        searchType: "",
        comparisonWindowDays: 0,
      },
    }),
  );
  if (
    !noComparable.allowed &&
    noComparable.code === "COMPARABLE_QUERY_CONFIG_REQUIRED"
  ) {
    details.push(
      "empty comparable-query → COMPARABLE_QUERY_CONFIG_REQUIRED",
    );
  } else {
    passed = false;
    details.push(
      `Comparable query unexpectedly ${JSON.stringify(noComparable)}`,
    );
  }

  const noObs = evaluateConnectSearchConsoleOrganicVisibility(
    baseInput({
      observationBatch: {
        providerRequestId: "",
        sitemapStatus: "",
        rows: [],
      },
    }),
  );
  if (!noObs.allowed && noObs.code === "OBSERVATION_BATCH_REQUIRED") {
    details.push("empty observation batch → OBSERVATION_BATCH_REQUIRED");
  } else {
    passed = false;
    details.push(`Observation batch unexpectedly ${JSON.stringify(noObs)}`);
  }

  const writeSave = evaluateConnectSearchConsoleOrganicVisibility(
    baseInput({ attemptWriteSave: true }),
  );
  if (!writeSave.allowed && writeSave.code === "WRITE_SAVE_REFUSED") {
    details.push("attemptWriteSave → WRITE_SAVE_REFUSED");
  } else {
    passed = false;
    details.push(`Write save unexpectedly ${JSON.stringify(writeSave)}`);
  }

  const inventZero = evaluateConnectSearchConsoleOrganicVisibility(
    baseInput({ inventZeroFromOmittedRows: true }),
  );
  if (
    !inventZero.allowed &&
    inventZero.code === "OMITTED_ZERO_DEMAND_CLAIM_REFUSED"
  ) {
    details.push(
      "inventZeroFromOmittedRows → OMITTED_ZERO_DEMAND_CLAIM_REFUSED",
    );
  } else {
    passed = false;
    details.push(`Invent zero unexpectedly ${JSON.stringify(inventZero)}`);
  }

  const liveClaim = evaluateConnectSearchConsoleOrganicVisibility(
    baseInput({ claimLiveVerifiedGsc: true }),
  );
  if (
    !liveClaim.allowed &&
    liveClaim.code === "FALSE_LIVE_VERIFIED_GSC_REFUSED"
  ) {
    details.push("claimLiveVerifiedGsc → FALSE_LIVE_VERIFIED_GSC_REFUSED");
  } else {
    passed = false;
    details.push(`Live claim unexpectedly ${JSON.stringify(liveClaim)}`);
  }

  const liveWire = evaluateConnectSearchConsoleOrganicVisibility(
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
    "Distinct from T-US-009 (schedule/watermark summary) — complete F05 flow evidence package",
  );
  details.push(`proofRecordedAt=${nowIso}`);

  return {
    proofId: randomUUID(),
    kind: SoakProofKind.CONNECT_SEARCH_CONSOLE_ORGANIC_VISIBILITY,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: "op-connect-search-console-organic-visibility-f05",
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
