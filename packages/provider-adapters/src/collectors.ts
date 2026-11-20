/**
 * M4 / NEXT-14 — page snapshot + GSC/GA4 collectors.
 * Live reads only when credentials exist; otherwise explicit FIXTURE labels.
 * Never claims LIVE for fixture rows. External network only for opt-in live HTML.
 */

import {
  ConnectionKind,
  MeasurementMode,
  createPageSnapshot,
  type MeasurementModeValue,
  type MeasurementObservation,
  type PageSnapshotRecord,
} from "@worksocial/domain";

export const FIXTURE_PILOT_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Quiet desks near the PATH</title>
  <meta name="description" content="Book a tour of our Jersey City pilot floor." />
  <link rel="canonical" href="https://fixture.worksocial.local/pilot" />
</head>
<body>
  <h1>Quiet desks near the PATH</h1>
  <p>Book a tour of our Jersey City pilot floor. Fixture page — not a live CMS.</p>
</body>
</html>`;

export type PageSnapshotCollectorInput = {
  snapshotId: string;
  siteId: string;
  pagePath: string;
  nowIso: string;
  /** Prefer live only when explicitly requested and fetch succeeds. */
  preferLive?: boolean;
  liveUrl?: string;
  fetchImpl?: typeof fetch;
};

export type PageSnapshotCollectorResult = {
  snapshot: PageSnapshotRecord;
  measurementMode: MeasurementModeValue;
  usedLiveFetch: boolean;
  note: string;
};

function envHasLiveCollectorCreds(kind: "gsc" | "ga4"): boolean {
  if (kind === "gsc") {
    return Boolean(
      process.env.WORKSOCIAL_GSC_ACCESS_TOKEN ||
        process.env.WORKSOCIAL_GSC_CREDENTIALS_JSON,
    );
  }
  return Boolean(
    process.env.WORKSOCIAL_GA4_ACCESS_TOKEN ||
      process.env.WORKSOCIAL_GA4_CREDENTIALS_JSON,
  );
}

/**
 * Capture a page snapshot. Default is fixture HTML with FIXTURE provenance.
 * Live fetch is best-effort and still labeled LIVE only on success.
 */
export async function capturePageSnapshot(
  input: PageSnapshotCollectorInput,
): Promise<PageSnapshotCollectorResult> {
  if (input.preferLive && input.liveUrl) {
    const fetchImpl = input.fetchImpl ?? fetch;
    try {
      const res = await fetchImpl(input.liveUrl, {
        method: "GET",
        redirect: "follow",
        headers: { accept: "text/html" },
      });
      if (res.ok) {
        const html = await res.text();
        const snapshot = createPageSnapshot({
          snapshotId: input.snapshotId,
          siteId: input.siteId,
          pagePath: input.pagePath,
          html,
          measurementMode: MeasurementMode.LIVE,
          sourceLabel: input.liveUrl,
          nowIso: input.nowIso,
        });
        return {
          snapshot,
          measurementMode: MeasurementMode.LIVE,
          usedLiveFetch: true,
          note: "Live HTML snapshot captured. Measurement mode: LIVE.",
        };
      }
    } catch {
      // Fall through to fixture — never pretend live succeeded.
    }
    const snapshot = createPageSnapshot({
      snapshotId: input.snapshotId,
      siteId: input.siteId,
      pagePath: input.pagePath,
      html: FIXTURE_PILOT_HTML,
      measurementMode: MeasurementMode.FIXTURE,
      sourceLabel: "fixture://pilot-page",
      nowIso: input.nowIso,
    });
    return {
      snapshot,
      measurementMode: MeasurementMode.FIXTURE,
      usedLiveFetch: false,
      note:
        "Live fetch failed or returned non-OK — using FIXTURE snapshot with explicit label.",
    };
  }

  const snapshot = createPageSnapshot({
    snapshotId: input.snapshotId,
    siteId: input.siteId,
    pagePath: input.pagePath,
    html: FIXTURE_PILOT_HTML,
    measurementMode: MeasurementMode.FIXTURE,
    sourceLabel: "fixture://pilot-page",
    nowIso: input.nowIso,
  });
  return {
    snapshot,
    measurementMode: MeasurementMode.FIXTURE,
    usedLiveFetch: false,
    note: "Fixture page snapshot. No live crawl performed.",
  };
}

export type MeasurementCollectorResult = {
  observation: MeasurementObservation;
  measurementMode: MeasurementModeValue;
  note: string;
};

/** GSC read adapter — LIVE only with credentials; otherwise labeled FIXTURE. */
export function readGscObservations(input: {
  observationId: string;
  nowIso: string;
}): MeasurementCollectorResult {
  if (envHasLiveCollectorCreds("gsc")) {
    return {
      observation: {
        observationId: input.observationId,
        kind: ConnectionKind.GSC,
        measurementMode: MeasurementMode.LIVE,
        rows: [
          { label: "Clicks (7d)", value: "(live token present — query not executed in M4)" },
          { label: "Impressions (7d)", value: "(live token present — query not executed in M4)" },
        ],
        windowLabel: "last_7_days",
        note:
          "Credentials detected. Live GSC query transport is not fully wired in M4 — labeled LIVE capability present, no fabricated metrics.",
        capturedAtIso: input.nowIso,
      },
      measurementMode: MeasurementMode.LIVE,
      note: "GSC credentials present; metric query remains bounded/unexecuted in M4.",
    };
  }

  return {
    observation: {
      observationId: input.observationId,
      kind: ConnectionKind.GSC,
      measurementMode: MeasurementMode.FIXTURE,
      rows: [
        { label: "Clicks (7d)", value: "42" },
        { label: "Impressions (7d)", value: "910" },
        { label: "Top query", value: "quiet desks jersey city" },
      ],
      windowLabel: "fixture_last_7_days",
      note: "FIXTURE Search Console sample — not live property data.",
      capturedAtIso: input.nowIso,
    },
    measurementMode: MeasurementMode.FIXTURE,
    note: "No GSC credentials — returning labeled FIXTURE observations.",
  };
}

/** GA4 read adapter — LIVE only with credentials; otherwise labeled FIXTURE. */
export function readGa4Observations(input: {
  observationId: string;
  nowIso: string;
}): MeasurementCollectorResult {
  if (envHasLiveCollectorCreds("ga4")) {
    return {
      observation: {
        observationId: input.observationId,
        kind: ConnectionKind.GA4,
        measurementMode: MeasurementMode.LIVE,
        rows: [
          { label: "Sessions (7d)", value: "(live token present — query not executed in M4)" },
          { label: "Engaged sessions (7d)", value: "(live token present — query not executed in M4)" },
        ],
        windowLabel: "last_7_days",
        note:
          "Credentials detected. Live GA4 Data API query is not fully wired in M4 — labeled LIVE capability present, no fabricated metrics.",
        capturedAtIso: input.nowIso,
      },
      measurementMode: MeasurementMode.LIVE,
      note: "GA4 credentials present; metric query remains bounded/unexecuted in M4.",
    };
  }

  return {
    observation: {
      observationId: input.observationId,
      kind: ConnectionKind.GA4,
      measurementMode: MeasurementMode.FIXTURE,
      rows: [
        { label: "Sessions (7d)", value: "128" },
        { label: "Engaged sessions (7d)", value: "91" },
        { label: "Top landing page", value: "/pilot" },
      ],
      windowLabel: "fixture_last_7_days",
      note: "FIXTURE GA4 sample — not live property data.",
      capturedAtIso: input.nowIso,
    },
    measurementMode: MeasurementMode.FIXTURE,
    note: "No GA4 credentials — returning labeled FIXTURE observations.",
  };
}

export function collectorCredentialHints(): {
  gsc: "present" | "absent";
  ga4: "present" | "absent";
} {
  return {
    gsc: envHasLiveCollectorCreds("gsc") ? "present" : "absent",
    ga4: envHasLiveCollectorCreds("ga4") ? "present" : "absent",
  };
}
