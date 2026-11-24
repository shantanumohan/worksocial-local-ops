import { describe, expect, it } from "vitest";
import {
  evaluateSsrfHop,
  evaluateSsrfRedirectDnsRebindChain,
  isPrivateOrLocalAddress,
  isPrivateOrLocalHostname,
} from "./ssrf-redirect-dns-rebind.js";

const ALLOWED = ["worksocial.com", "cdn.worksocial.com"] as const;

describe("SSRF redirect + DNS rebind (T-X064)", () => {
  it("classifies private/local hostnames and addresses", () => {
    expect(isPrivateOrLocalHostname("127.0.0.1")).toBe(true);
    expect(isPrivateOrLocalHostname("169.254.169.254")).toBe(true);
    expect(isPrivateOrLocalHostname("10.0.0.5")).toBe(true);
    expect(isPrivateOrLocalHostname("localhost")).toBe(true);
    expect(isPrivateOrLocalHostname("worksocial.com")).toBe(false);
    expect(isPrivateOrLocalAddress("192.168.1.1")).toBe(true);
    expect(isPrivateOrLocalAddress("93.184.216.34")).toBe(false);
    // fe80::/10 — not only the literal fe80: prefix
    expect(isPrivateOrLocalAddress("fe80::1")).toBe(true);
    expect(isPrivateOrLocalAddress("fe90::1")).toBe(true);
    expect(isPrivateOrLocalAddress("febf::1")).toBe(true);
    expect(isPrivateOrLocalAddress("fec0::1")).toBe(false);
    expect(isPrivateOrLocalAddress("fd12::1")).toBe(true);
    expect(isPrivateOrLocalAddress("2001:db8::1")).toBe(false);
    // IPv4-mapped IPv6 must not hide private/link-local/metadata.
    expect(isPrivateOrLocalAddress("::ffff:10.0.0.9")).toBe(true);
    expect(isPrivateOrLocalAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateOrLocalAddress("::ffff:192.168.1.1")).toBe(true);
    expect(isPrivateOrLocalAddress("::ffff:a00:9")).toBe(true); // 10.0.0.9
    expect(isPrivateOrLocalAddress("::ffff:93.184.216.34")).toBe(false);
  });

  it("blocks NON_HTTPS and CREDENTIALS_FORBIDDEN on every hop", () => {
    const http = evaluateSsrfHop(
      {
        hopIndex: 0,
        url: "http://worksocial.com/insecure",
        resolvedAddresses: ["93.184.216.34"],
      },
      ALLOWED,
    );
    expect(http.allowed).toBe(false);
    if (!http.allowed) {
      expect(http.code).toBe("NON_HTTPS");
    }

    const creds = evaluateSsrfHop(
      {
        hopIndex: 1,
        url: "https://user:secret@worksocial.com/x",
        resolvedAddresses: ["93.184.216.34"],
      },
      ALLOWED,
    );
    expect(creds.allowed).toBe(false);
    if (!creds.allowed) {
      expect(creds.code).toBe("CREDENTIALS_FORBIDDEN");
    }
  });

  it("blocks DNS rebind via IPv4-mapped IPv6 private address", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/mapped",
          resolvedAddresses: ["::ffff:10.1.2.3"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
  });

  it("allows a multi-hop public allowlisted chain (positive control)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
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
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe("ALL_HOPS_ALLOWED");
    expect(decision.hopVerdicts).toHaveLength(2);
    expect(decision.blockedHopIndex).toBeNull();
  });

  it("blocks redirect hop to private hostname", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
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
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
  });

  it("blocks DNS rebind on allowlisted hostname → private IP", () => {
    const hop = evaluateSsrfHop(
      {
        hopIndex: 0,
        url: "https://worksocial.com/rebind",
        resolvedAddresses: ["169.254.169.254"],
      },
      ALLOWED,
    );
    expect(hop.allowed).toBe(false);
    if (!hop.allowed) {
      expect(hop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    }

    const decision = evaluateSsrfRedirectDnsRebindChain({
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
          resolvedAddresses: ["10.0.0.9"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
  });

  it("blocks non-allowlisted redirect hop", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
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
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("HOST_NOT_ALLOWLISTED");
    expect(decision.blockedHopIndex).toBe(1);
  });

  it("fails closed on empty chain or empty resolved addresses", () => {
    expect(
      evaluateSsrfRedirectDnsRebindChain({
        allowedHosts: ALLOWED,
        hops: [],
      }).code,
    ).toBe("EMPTY_CHAIN");
    const emptyDns = evaluateSsrfHop(
      {
        hopIndex: 0,
        url: "https://worksocial.com/",
        resolvedAddresses: [],
      },
      ALLOWED,
    );
    expect(emptyDns.allowed).toBe(false);
    if (!emptyDns.allowed) {
      expect(emptyDns.code).toBe("EMPTY_RESOLVED_ADDRESSES");
    }
  });
});
