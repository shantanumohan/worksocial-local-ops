/**
 * Fixture proof for T-X064 — SSRF redirect and DNS rebind: blocked every hop.
 *
 * Exercises evaluateSsrfRedirectDnsRebindChain with fixture hop chains only
 * (no live DNS/fetch). Redirect-to-private, DNS rebind, and non-allowlisted
 * hops are denied; a multi-hop public allowlisted chain is the positive
 * control. External effects: NONE.
 */

import { randomUUID } from "node:crypto";
import {
  SoakProofKind,
  evaluateSsrfRedirectDnsRebindChain,
  type SoakProofRecord,
} from "@worksocial/domain";

const ALLOWED = ["worksocial.com", "cdn.worksocial.com"] as const;

/**
 * Complete expected proof set for T-X064 fixture ACCEPTED.
 */
export function proofSsrfRedirectDnsRebindBlockedEveryHop(
  nowIso: string,
): SoakProofRecord {
  const details: string[] = [];
  let passed = true;

  // 1. Positive control: multi-hop public allowlisted → ALL_HOPS_ALLOWED.
  const ok = evaluateSsrfRedirectDnsRebindChain({
    allowedHosts: ALLOWED,
    hops: [
      {
        hopIndex: 0,
        url: "https://worksocial.com/start",
        resolvedAddresses: ["93.184.216.34"],
      },
      {
        hopIndex: 1,
        url: "https://cdn.worksocial.com/next",
        resolvedAddresses: ["151.101.1.1"],
      },
    ],
  });
  if (
    ok.allowed === true &&
    ok.code === "ALL_HOPS_ALLOWED" &&
    ok.hopVerdicts.length === 2 &&
    ok.hopVerdicts.every((h) => h.allowed)
  ) {
    details.push(
      "Positive control: 2-hop allowlisted https + public IPs → ALL_HOPS_ALLOWED",
    );
  } else {
    passed = false;
    details.push(`Positive control unexpectedly ${JSON.stringify(ok)}`);
  }

  // 2. Redirect hop to loopback hostname → blocked at hop 1.
  const redirectPrivate = evaluateSsrfRedirectDnsRebindChain({
    allowedHosts: ALLOWED,
    hops: [
      {
        hopIndex: 0,
        url: "https://worksocial.com/start",
        resolvedAddresses: ["93.184.216.34"],
      },
      {
        hopIndex: 1,
        url: "https://127.0.0.1/admin",
        resolvedAddresses: ["127.0.0.1"],
      },
    ],
  });
  if (
    redirectPrivate.allowed === false &&
    redirectPrivate.code === "HOP_BLOCKED" &&
    redirectPrivate.blockedHopIndex === 1 &&
    redirectPrivate.blockedCode === "PRIVATE_OR_LOCAL_HOSTNAME" &&
    redirectPrivate.hopVerdicts[0]?.allowed === true
  ) {
    details.push(
      "Redirect hop 1 → 127.0.0.1 PRIVATE_OR_LOCAL_HOSTNAME (hop 0 still allowed)",
    );
  } else {
    passed = false;
    details.push(
      `Redirect-private unexpectedly ${JSON.stringify(redirectPrivate)}`,
    );
  }

  // 3. DNS rebind: allowlisted host resolves to link-local metadata IP.
  const rebind = evaluateSsrfRedirectDnsRebindChain({
    allowedHosts: ALLOWED,
    hops: [
      {
        hopIndex: 0,
        url: "https://worksocial.com/ok",
        resolvedAddresses: ["93.184.216.34"],
      },
      {
        hopIndex: 1,
        url: "https://cdn.worksocial.com/rebind",
        resolvedAddresses: ["169.254.169.254"],
      },
    ],
  });
  if (
    rebind.allowed === false &&
    rebind.blockedHopIndex === 1 &&
    rebind.blockedCode === "DNS_REBIND_PRIVATE_ADDRESS"
  ) {
    details.push(
      "DNS rebind hop 1: cdn.worksocial.com → 169.254.169.254 DNS_REBIND_PRIVATE_ADDRESS",
    );
  } else {
    passed = false;
    details.push(`DNS rebind unexpectedly ${JSON.stringify(rebind)}`);
  }

  // 4. Non-allowlisted redirect hop blocked (every hop checked).
  const offAllow = evaluateSsrfRedirectDnsRebindChain({
    allowedHosts: ALLOWED,
    hops: [
      {
        hopIndex: 0,
        url: "https://worksocial.com/start",
        resolvedAddresses: ["93.184.216.34"],
      },
      {
        hopIndex: 1,
        url: "https://evil.example/x",
        resolvedAddresses: ["203.0.113.10"],
      },
    ],
  });
  if (
    offAllow.allowed === false &&
    offAllow.blockedHopIndex === 1 &&
    offAllow.blockedCode === "HOST_NOT_ALLOWLISTED"
  ) {
    details.push("Redirect hop 1 → evil.example HOST_NOT_ALLOWLISTED");
  } else {
    passed = false;
    details.push(`Off-allowlist unexpectedly ${JSON.stringify(offAllow)}`);
  }

  // 5. Initial hop DNS rebind to RFC1918 also blocked (not only redirects).
  const initialRebind = evaluateSsrfRedirectDnsRebindChain({
    allowedHosts: ALLOWED,
    hops: [
      {
        hopIndex: 0,
        url: "https://worksocial.com/meta",
        resolvedAddresses: ["10.1.2.3"],
      },
    ],
  });
  if (
    initialRebind.allowed === false &&
    initialRebind.blockedHopIndex === 0 &&
    initialRebind.blockedCode === "DNS_REBIND_PRIVATE_ADDRESS"
  ) {
    details.push(
      "Initial hop DNS rebind → 10.1.2.3 DNS_REBIND_PRIVATE_ADDRESS",
    );
  } else {
    passed = false;
    details.push(
      `Initial DNS rebind unexpectedly ${JSON.stringify(initialRebind)}`,
    );
  }

  // 6. IPv6 link-local fe80::/10 (not only fe80: literal) — e.g. fe90::1.
  const v6Rebind = evaluateSsrfRedirectDnsRebindChain({
    allowedHosts: ALLOWED,
    hops: [
      {
        hopIndex: 0,
        url: "https://worksocial.com/v6",
        resolvedAddresses: ["fe90::1"],
      },
    ],
  });
  if (
    v6Rebind.allowed === false &&
    v6Rebind.blockedHopIndex === 0 &&
    v6Rebind.blockedCode === "DNS_REBIND_PRIVATE_ADDRESS"
  ) {
    details.push(
      "IPv6 link-local fe80::/10 rebind → fe90::1 DNS_REBIND_PRIVATE_ADDRESS",
    );
  } else {
    passed = false;
    details.push(`IPv6 link-local rebind unexpectedly ${JSON.stringify(v6Rebind)}`);
  }

  details.push(
    "liveDnsResolve=NOT_WIRED liveFetch=NOT_WIRED liveProviderSuccessClaimed=false externalEffects=NONE",
  );

  return {
    proofId: `proof-ssrf-rebind-${randomUUID()}`,
    kind: SoakProofKind.SSRF_REDIRECT_DNS_REBIND_BLOCKED_EVERY_HOP,
    passed,
    details,
    applyAttemptCount: 1,
    operationId: `op-tx064-${randomUUID().slice(0, 8)}`,
    createdAtIso: nowIso,
    fixtureOnly: true,
  };
}
