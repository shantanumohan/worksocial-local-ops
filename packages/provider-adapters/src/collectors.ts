/**
 * M4 / NEXT-14 — page snapshot + GSC/GA4 collectors.
 * Live reads only when credentials exist AND a query/fetch succeeds.
 * Unqueried credential presence → UNAVAILABLE (never pretend LIVE).
 * Live HTML fetch is SSRF-gated (https + allowlisted public hosts).
 */

import {
  ConnectionKind,
  MeasurementMode,
  createPageSnapshot,
  type MeasurementModeValue,
  type MeasurementObservation,
  type PageSnapshotRecord,
  type StagingPageFields,
} from "@worksocial/domain";
import {
  validateCollectorRedirectTarget,
  validateLiveCollectorUrl,
} from "./url-policy.js";

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
  /** Hostnames allowed for live fetch (registered site domain). */
  allowedOrigins?: readonly string[];
  /** Optional fixture HTML override (e.g. from staging CMS page). */
  fixtureHtml?: string;
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

/** Build deterministic fixture HTML from staging CMS page fields. */
export function htmlFromStagingFields(
  fields: StagingPageFields,
  path: string,
  domain: string,
): string {
  const canonical = `https://${domain}${path.startsWith("/") ? path : `/${path}`}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(fields.title)}</title>
  <meta name="description" content="${escapeHtml(fields.metaDescription)}" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
</head>
<body>
  <h1>${escapeHtml(fields.h1)}</h1>
  <p>${escapeHtml(fields.bodyExcerpt)}</p>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function fetchLiveHtmlSafely(
  liveUrl: string,
  allowedOrigins: readonly string[],
  fetchImpl: typeof fetch,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; reason: string }> {
  const initial = validateLiveCollectorUrl(liveUrl, allowedOrigins);
  if (!initial.ok) {
    return { ok: false, reason: initial.reason };
  }

  // Manual redirects so each hop is re-checked (SSRF via redirect).
  let current = initial.url.toString();
  for (let hop = 0; hop < 5; hop++) {
    let res: Response;
    try {
      res = await fetchImpl(current, {
        method: "GET",
        redirect: "manual",
        headers: { accept: "text/html" },
      });
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { ok: false, reason: `Redirect ${res.status} without Location` };
      }
      const next = new URL(location, current).toString();
      const check = validateCollectorRedirectTarget(
        next,
        current,
        allowedOrigins,
      );
      if (!check.ok) {
        return { ok: false, reason: check.reason };
      }
      current = check.url.toString();
      continue;
    }
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status} from live collector` };
    }
    const html = await res.text();
    return { ok: true, html, finalUrl: current };
  }
  return { ok: false, reason: "Too many redirects for live collector" };
}

/**
 * Capture a page snapshot. Default is fixture HTML with FIXTURE provenance.
 * Live fetch is SSRF-gated and labeled LIVE only on success.
 */
export async function capturePageSnapshot(
  input: PageSnapshotCollectorInput,
): Promise<PageSnapshotCollectorResult> {
  const fixtureHtml = input.fixtureHtml ?? FIXTURE_PILOT_HTML;
  const allowedOrigins = input.allowedOrigins ?? [];

  if (input.preferLive && input.liveUrl) {
    const fetchImpl = input.fetchImpl ?? fetch;
    const live = await fetchLiveHtmlSafely(
      input.liveUrl,
      allowedOrigins,
      fetchImpl,
    );
    if (live.ok) {
      const snapshot = createPageSnapshot({
        snapshotId: input.snapshotId,
        siteId: input.siteId,
        pagePath: input.pagePath,
        html: live.html,
        measurementMode: MeasurementMode.LIVE,
        sourceLabel: live.finalUrl,
        nowIso: input.nowIso,
      });
      return {
        snapshot,
        measurementMode: MeasurementMode.LIVE,
        usedLiveFetch: true,
        note: "Live HTML snapshot captured. Measurement mode: LIVE.",
      };
    }
    const snapshot = createPageSnapshot({
      snapshotId: input.snapshotId,
      siteId: input.siteId,
      pagePath: input.pagePath,
      html: fixtureHtml,
      measurementMode: MeasurementMode.FIXTURE,
      sourceLabel: "fixture://pilot-page",
      nowIso: input.nowIso,
    });
    return {
      snapshot,
      measurementMode: MeasurementMode.FIXTURE,
      usedLiveFetch: false,
      note: `Live fetch refused or failed (${live.reason}) — using FIXTURE snapshot.`,
    };
  }

  const snapshot = createPageSnapshot({
    snapshotId: input.snapshotId,
    siteId: input.siteId,
    pagePath: input.pagePath,
    html: fixtureHtml,
    measurementMode: MeasurementMode.FIXTURE,
    sourceLabel: input.fixtureHtml
      ? "fixture://staging-cms-page"
      : "fixture://pilot-page",
    nowIso: input.nowIso,
  });
  return {
    snapshot,
    measurementMode: MeasurementMode.FIXTURE,
    usedLiveFetch: false,
    note: input.fixtureHtml
      ? "Fixture snapshot built from registered staging CMS page."
      : "Fixture page snapshot. No live crawl performed.",
  };
}

export type MeasurementCollectorResult = {
  observation: MeasurementObservation;
  measurementMode: MeasurementModeValue;
  note: string;
};

/** GSC read adapter — LIVE only after a real query; credentials alone → UNAVAILABLE. */
export function readGscObservations(input: {
  observationId: string;
  nowIso: string;
}): MeasurementCollectorResult {
  if (envHasLiveCollectorCreds("gsc")) {
    return {
      observation: {
        observationId: input.observationId,
        kind: ConnectionKind.GSC,
        measurementMode: MeasurementMode.UNAVAILABLE,
        rows: [
          { label: "Clicks (7d)", value: "unavailable" },
          { label: "Impressions (7d)", value: "unavailable" },
        ],
        windowLabel: "last_7_days",
        note:
          "GSC credentials present but query transport not executed in M4 — measurement mode UNAVAILABLE (not LIVE).",
        capturedAtIso: input.nowIso,
      },
      measurementMode: MeasurementMode.UNAVAILABLE,
      note: "GSC credentials present; no query executed — labeled UNAVAILABLE.",
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

/** GA4 read adapter — LIVE only after a real query; credentials alone → UNAVAILABLE. */
export function readGa4Observations(input: {
  observationId: string;
  nowIso: string;
}): MeasurementCollectorResult {
  if (envHasLiveCollectorCreds("ga4")) {
    return {
      observation: {
        observationId: input.observationId,
        kind: ConnectionKind.GA4,
        measurementMode: MeasurementMode.UNAVAILABLE,
        rows: [
          { label: "Sessions (7d)", value: "unavailable" },
          { label: "Engaged sessions (7d)", value: "unavailable" },
        ],
        windowLabel: "last_7_days",
        note:
          "GA4 credentials present but query transport not executed in M4 — measurement mode UNAVAILABLE (not LIVE).",
        capturedAtIso: input.nowIso,
      },
      measurementMode: MeasurementMode.UNAVAILABLE,
      note: "GA4 credentials present; no query executed — labeled UNAVAILABLE.",
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
