/**
 * Live collector URL policy — reject SSRF-prone destinations.
 * https only; no loopback/private/link-local; host must match allowedOrigins
 * (registered site domain / WORKSOCIAL_COLLECTOR_ALLOWED_HOSTS).
 */

export type CollectorUrlPolicyVerdict =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "localhost.localdomain" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::" ||
    host === "::1"
  ) {
    return true;
  }
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  if (host === "metadata" || host.endsWith(".internal")) {
    return true;
  }
  return false;
}

function envAllowedHosts(): string[] {
  const raw = process.env.WORKSOCIAL_COLLECTOR_ALLOWED_HOSTS ?? "";
  return raw
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validate a live page-snapshot URL before fetch.
 * @param allowedOrigins hostnames derived from registered site domains (e.g. example.com)
 */
export function validateLiveCollectorUrl(
  raw: string,
  allowedOrigins: readonly string[] = [],
): CollectorUrlPolicyVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid live collector URL" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, reason: "Live collectors require https:// URLs only" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Live collector URLs must not include credentials" };
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    return {
      ok: false,
      reason: `Rejected non-public hostname for live collector: ${url.hostname}`,
    };
  }
  const host = url.hostname.toLowerCase();
  const allowed = [
    ...new Set([
      ...allowedOrigins.map((h) => h.toLowerCase()),
      ...envAllowedHosts(),
    ]),
  ];
  if (allowed.length === 0) {
    return {
      ok: false,
      reason:
        "No approved live collector hosts (register a public site domain or set WORKSOCIAL_COLLECTOR_ALLOWED_HOSTS)",
    };
  }
  const matched = allowed.some(
    (origin) => host === origin || host.endsWith(`.${origin}`),
  );
  if (!matched) {
    return {
      ok: false,
      reason: `Host ${host} is not on the approved collector allowlist for the registered site`,
    };
  }
  return { ok: true, url };
}

export function validateCollectorRedirectTarget(
  finalUrl: string,
  requestedUrl: string,
  allowedOrigins: readonly string[] = [],
): CollectorUrlPolicyVerdict {
  const verdict = validateLiveCollectorUrl(finalUrl, allowedOrigins);
  if (!verdict.ok) {
    return {
      ok: false,
      reason: `Redirect target rejected (${requestedUrl} → ${finalUrl}): ${verdict.reason}`,
    };
  }
  return verdict;
}
