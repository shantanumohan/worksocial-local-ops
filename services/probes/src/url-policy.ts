/**
 * Live HTTP probe URL policy — reject SSRF-prone destinations.
 * Only https URLs to explicitly approved public hosts; no loopback/private/link-local.
 */

import { approvedLiveProbeHosts } from "./fixtures.js";

export type UrlPolicyVerdict =
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
  // IPv4 dotted
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
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  // IPv6 local/link-local/ULA
  if (host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    return true;
  }
  if (host === "metadata" || host.endsWith(".internal")) {
    return true;
  }
  return false;
}

/**
 * Validate a candidate live probe URL before fetch.
 * Requires https + hostname on WORKSOCIAL_PROBE_ALLOWED_HOSTS allowlist.
 */
export function validateLiveProbeUrl(raw: string): UrlPolicyVerdict {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "Invalid live probe URL" };
  }
  if (url.protocol !== "https:") {
    return {
      ok: false,
      reason: "Live probes require https:// URLs only",
    };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "Live probe URLs must not include credentials" };
  }
  if (isPrivateOrLocalHostname(url.hostname)) {
    return {
      ok: false,
      reason: `Rejected non-public hostname for live probe: ${url.hostname}`,
    };
  }
  const allowed = approvedLiveProbeHosts();
  if (allowed.length === 0) {
    return {
      ok: false,
      reason:
        "No approved live probe hosts configured (set WORKSOCIAL_PROBE_ALLOWED_HOSTS)",
    };
  }
  const host = url.hostname.toLowerCase();
  if (!allowed.includes(host)) {
    return {
      ok: false,
      reason: `Host ${host} is not on the approved live probe allowlist`,
    };
  }
  return { ok: true, url };
}

/**
 * After a redirect, re-validate the final response URL (SSRF via redirect).
 */
export function validateRedirectTarget(
  finalUrl: string,
  requestedUrl: string,
): UrlPolicyVerdict {
  const verdict = validateLiveProbeUrl(finalUrl);
  if (!verdict.ok) {
    return {
      ok: false,
      reason: `Redirect target rejected (${requestedUrl} → ${finalUrl}): ${verdict.reason}`,
    };
  }
  return verdict;
}
