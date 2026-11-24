/**
 * T-X064 — SSRF redirect and DNS rebind: blocked every hop.
 *
 * Fixture-only evaluation of an outbound URL hop chain. Every hop (initial
 * request and each redirect) must be https, allowlisted, non-private by
 * hostname, and resolved only to public addresses. DNS rebind (allowlisted
 * hostname → private/link-local/metadata IP) is denied at that hop — never
 * follow onward. No live DNS or fetch; callers supply fixture addresses.
 * External effects: NONE. Fixture ACCEPTED ≠ sandbox/prod VERIFIED.
 */

export type SsrfHop = {
  hopIndex: number;
  url: string;
  /** Fixture-supplied DNS answers for this hop (no live resolve). */
  resolvedAddresses: readonly string[];
};

export type SsrfHopBlockCode =
  | "INVALID_URL"
  | "NON_HTTPS"
  | "CREDENTIALS_FORBIDDEN"
  | "PRIVATE_OR_LOCAL_HOSTNAME"
  | "HOST_NOT_ALLOWLISTED"
  | "DNS_REBIND_PRIVATE_ADDRESS"
  | "EMPTY_RESOLVED_ADDRESSES";

export type SsrfHopVerdict =
  | {
      hopIndex: number;
      url: string;
      allowed: true;
      hostname: string;
      resolvedAddresses: string[];
    }
  | {
      hopIndex: number;
      url: string;
      allowed: false;
      code: SsrfHopBlockCode;
      hostname: string | null;
      resolvedAddresses: string[];
      reason: string;
    };

export type SsrfChainCode =
  | "ALL_HOPS_ALLOWED"
  | "EMPTY_CHAIN"
  | "HOP_BLOCKED";

export type SsrfChainDecision = {
  allowed: boolean;
  code: SsrfChainCode;
  /** Present when a hop was blocked. */
  blockedHopIndex: number | null;
  blockedCode: SsrfHopBlockCode | null;
  reasons: string[];
  hopVerdicts: SsrfHopVerdict[];
};

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[|\]$/g, "");
}

/** True for loopback, RFC1918, link-local, CGNAT, ULA, metadata, *.internal. */
export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = normalizeHost(hostname);
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
  // IPv6 link-local fe80::/10 and ULA fc00::/7 (not just the fe80: literal prefix).
  if (isIpv6LinkLocalOrUla(host)) {
    return true;
  }
  if (host === "metadata" || host.endsWith(".internal")) {
    return true;
  }
  return false;
}

/** fe80::/10 link-local and fc00::/7 unique-local. */
function isIpv6LinkLocalOrUla(host: string): boolean {
  if (!host.includes(":")) return false;
  const bare = host.split("%")[0]!;
  if (bare.startsWith("::")) {
    // :: and ::1 already handled; other compressed forms are not fe80::/10 / fc00::/7.
    return false;
  }
  const m = /^([0-9a-f]{1,4}):/i.exec(bare);
  if (!m) return false;
  const hextet = Number.parseInt(m[1]!, 16);
  if (hextet >= 0xfe80 && hextet <= 0xfebf) return true;
  if (hextet >= 0xfc00 && hextet <= 0xfdff) return true;
  return false;
}

/**
 * Expand an IPv6 literal (compressed `::` and optional dotted-quad tail) into
 * eight hextet strings. Returns null when the shape is not a valid IPv6 form.
 */
function expandIpv6Hextets(host: string): string[] | null {
  if (!host.includes(":")) return null;

  let working = host;
  let dottedTail: string | null = null;
  const dq = /^(.+):(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(host);
  if (dq) {
    working = dq[1]!;
    dottedTail = dq[2]!;
  }

  const sides = working.split("::");
  if (sides.length > 2) return null;
  const left =
    sides[0] === "" ? [] : sides[0]!.split(":").filter((h) => h.length > 0);
  const right =
    sides.length === 2
      ? sides[1] === ""
        ? []
        : sides[1]!.split(":").filter((h) => h.length > 0)
      : [];
  const need = 8 - left.length - right.length - (dottedTail ? 2 : 0);
  if (need < 0) return null;
  if (sides.length === 1 && need !== 0) return null;

  const hextets = [...left, ...Array(need).fill("0"), ...right];
  if (dottedTail) {
    const parts = dottedTail.split(".").map((p) => Number(p));
    if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
      return null;
    }
    hextets.push(((parts[0]! << 8) | parts[1]!).toString(16));
    hextets.push(((parts[2]! << 8) | parts[3]!).toString(16));
  }
  if (hextets.length !== 8) return null;
  if (hextets.some((h) => !/^[0-9a-f]{1,4}$/i.test(h))) return null;
  return hextets.map((h) => h.toLowerCase());
}

/**
 * Unwrap IPv4-mapped IPv6 (`::ffff:a.b.c.d`, expanded `0:0:0:0:0:ffff:…`,
 * or hex-tail forms) to dotted IPv4. Returns null when not IPv4-mapped.
 */
export function unwrapIpv4MappedAddress(address: string): string | null {
  const host = normalizeHost(address).split("%")[0]!;
  const hextets = expandIpv6Hextets(host);
  if (!hextets) return null;

  // IPv4-mapped shape: 0:0:0:0:0:ffff:x:x (RFC 4291)
  for (let i = 0; i < 5; i++) {
    if (Number.parseInt(hextets[i]!, 16) !== 0) return null;
  }
  if (Number.parseInt(hextets[5]!, 16) !== 0xffff) return null;

  const hi = Number.parseInt(hextets[6]!, 16);
  const lo = Number.parseInt(hextets[7]!, 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/** True when a resolved address is non-public (SSRF / DNS-rebind target). */
export function isPrivateOrLocalAddress(address: string): boolean {
  if (isPrivateOrLocalHostname(address)) {
    return true;
  }
  // IPv4-mapped IPv6 can hide RFC1918 / link-local / metadata behind ::ffff:.
  const mapped = unwrapIpv4MappedAddress(address);
  if (mapped !== null && isPrivateOrLocalHostname(mapped)) {
    return true;
  }
  return false;
}

function hostOnAllowlist(
  hostname: string,
  allowedHosts: readonly string[],
): boolean {
  const host = normalizeHost(hostname);
  return allowedHosts.some((origin) => {
    const o = normalizeHost(origin);
    return host === o || host.endsWith(`.${o}`);
  });
}

/**
 * Evaluate one hop: URL shape, allowlist, and every resolved address.
 */
export function evaluateSsrfHop(
  hop: SsrfHop,
  allowedHosts: readonly string[],
): SsrfHopVerdict {
  let url: URL;
  try {
    url = new URL(hop.url);
  } catch {
    return {
      hopIndex: hop.hopIndex,
      url: hop.url,
      allowed: false,
      code: "INVALID_URL",
      hostname: null,
      resolvedAddresses: [...hop.resolvedAddresses],
      reason: `Hop ${hop.hopIndex}: invalid URL`,
    };
  }

  const hostname = normalizeHost(url.hostname);
  if (url.protocol !== "https:") {
    return {
      hopIndex: hop.hopIndex,
      url: hop.url,
      allowed: false,
      code: "NON_HTTPS",
      hostname,
      resolvedAddresses: [...hop.resolvedAddresses],
      reason: `Hop ${hop.hopIndex}: require https (got ${url.protocol})`,
    };
  }
  if (url.username || url.password) {
    return {
      hopIndex: hop.hopIndex,
      url: hop.url,
      allowed: false,
      code: "CREDENTIALS_FORBIDDEN",
      hostname,
      resolvedAddresses: [...hop.resolvedAddresses],
      reason: `Hop ${hop.hopIndex}: credentials in URL forbidden`,
    };
  }
  if (isPrivateOrLocalHostname(hostname)) {
    return {
      hopIndex: hop.hopIndex,
      url: hop.url,
      allowed: false,
      code: "PRIVATE_OR_LOCAL_HOSTNAME",
      hostname,
      resolvedAddresses: [...hop.resolvedAddresses],
      reason: `Hop ${hop.hopIndex}: private/local hostname ${hostname}`,
    };
  }
  if (!hostOnAllowlist(hostname, allowedHosts)) {
    return {
      hopIndex: hop.hopIndex,
      url: hop.url,
      allowed: false,
      code: "HOST_NOT_ALLOWLISTED",
      hostname,
      resolvedAddresses: [...hop.resolvedAddresses],
      reason: `Hop ${hop.hopIndex}: host ${hostname} not on allowlist`,
    };
  }
  if (hop.resolvedAddresses.length === 0) {
    return {
      hopIndex: hop.hopIndex,
      url: hop.url,
      allowed: false,
      code: "EMPTY_RESOLVED_ADDRESSES",
      hostname,
      resolvedAddresses: [],
      reason: `Hop ${hop.hopIndex}: no resolved addresses (fail closed)`,
    };
  }
  for (const addr of hop.resolvedAddresses) {
    if (isPrivateOrLocalAddress(addr)) {
      return {
        hopIndex: hop.hopIndex,
        url: hop.url,
        allowed: false,
        code: "DNS_REBIND_PRIVATE_ADDRESS",
        hostname,
        resolvedAddresses: [...hop.resolvedAddresses],
        reason: `Hop ${hop.hopIndex}: DNS rebind — ${hostname} resolved to private/local ${addr}`,
      };
    }
  }
  return {
    hopIndex: hop.hopIndex,
    url: hop.url,
    allowed: true,
    hostname,
    resolvedAddresses: [...hop.resolvedAddresses],
  };
}

/**
 * Evaluate the full redirect chain. Stops at the first blocked hop —
 * every hop before that must have been allowed (blocked every hop).
 */
export function evaluateSsrfRedirectDnsRebindChain(input: {
  hops: readonly SsrfHop[];
  allowedHosts: readonly string[];
}): SsrfChainDecision {
  if (input.hops.length === 0) {
    return {
      allowed: false,
      code: "EMPTY_CHAIN",
      blockedHopIndex: null,
      blockedCode: null,
      reasons: ["Empty hop chain — fail closed"],
      hopVerdicts: [],
    };
  }

  const hopVerdicts: SsrfHopVerdict[] = [];
  const sorted = [...input.hops].sort((a, b) => a.hopIndex - b.hopIndex);

  for (const hop of sorted) {
    const verdict = evaluateSsrfHop(hop, input.allowedHosts);
    hopVerdicts.push(verdict);
    if (!verdict.allowed) {
      const redirectNote =
        hop.hopIndex > 0
          ? `Redirect hop ${hop.hopIndex} blocked (every hop checked)`
          : `Initial hop ${hop.hopIndex} blocked`;
      return {
        allowed: false,
        code: "HOP_BLOCKED",
        blockedHopIndex: hop.hopIndex,
        blockedCode: verdict.code,
        reasons: [redirectNote, verdict.reason],
        hopVerdicts,
      };
    }
  }

  return {
    allowed: true,
    code: "ALL_HOPS_ALLOWED",
    blockedHopIndex: null,
    blockedCode: null,
    reasons: [
      `All ${hopVerdicts.length} hop(s) allowlisted https with public resolved addresses`,
    ],
    hopVerdicts,
  };
}

export const SSRF_REDIRECT_DNS_REBIND_RELATED_CASE_IDS = ["T-X064"] as const;
