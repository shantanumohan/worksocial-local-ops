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
    // Expanded / alternate spellings must canonicalize before mapped check.
    expect(isPrivateOrLocalAddress("0:0:0:0:0:ffff:10.0.0.9")).toBe(true);
    expect(
      isPrivateOrLocalAddress("0000:0000:0000:0000:0000:ffff:0a00:0009"),
    ).toBe(true);
    expect(isPrivateOrLocalAddress("0:0:0:0:0:ffff:93.184.216.34")).toBe(false);
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

    const httpChain = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "http://worksocial.com/insecure",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(httpChain.allowed).toBe(false);
    expect(httpChain.code).toBe("HOP_BLOCKED");
    expect(httpChain.blockedCode).toBe("NON_HTTPS");
    expect(httpChain.blockedHopIndex).toBe(0);
    const httpBlocked = httpChain.hopVerdicts[0];
    if (httpBlocked && !httpBlocked.allowed) {
      expect(httpBlocked.code).toBe("NON_HTTPS");
    }

    const credsChain = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://user:secret@worksocial.com/x",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(credsChain.allowed).toBe(false);
    expect(credsChain.code).toBe("HOP_BLOCKED");
    expect(credsChain.blockedCode).toBe("CREDENTIALS_FORBIDDEN");
    expect(credsChain.blockedHopIndex).toBe(0);
    const credsBlocked = credsChain.hopVerdicts[0];
    if (credsBlocked && !credsBlocked.allowed) {
      expect(credsBlocked.code).toBe("CREDENTIALS_FORBIDDEN");
      expect(credsBlocked.hostname).toBe("worksocial.com");
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
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.hopVerdicts).toHaveLength(1);
    expect(decision.hopVerdicts[0]?.allowed).toBe(false);
    const mappedBlocked = decision.hopVerdicts[0];
    if (mappedBlocked && !mappedBlocked.allowed) {
      expect(mappedBlocked.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedBlocked.resolvedAddresses).toEqual(["::ffff:10.1.2.3"]);
    }
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
    expect(decision.hopVerdicts.every((v) => v.allowed)).toBe(true);
    expect(decision.blockedCode).toBeNull();
    expect(decision.reasons).toEqual([
      "All 2 hop(s) allowlisted https with public resolved addresses",
    ]);
    expect(decision.hopVerdicts[0]?.hopIndex).toBe(0);
    expect(decision.hopVerdicts[1]?.hopIndex).toBe(1);
    const hop0 = decision.hopVerdicts[0];
    const hop1 = decision.hopVerdicts[1];
    expect(hop0?.allowed).toBe(true);
    expect(hop1?.allowed).toBe(true);
    if (hop0?.allowed) {
      expect(hop0.hostname).toBe("worksocial.com");
      expect(hop0.resolvedAddresses).toEqual(["93.184.216.34"]);
      expect(hop0.url).toBe("https://worksocial.com/start");
    }
    if (hop1?.allowed) {
      expect(hop1.hostname).toBe("cdn.worksocial.com");
      expect(hop1.resolvedAddresses).toEqual(["151.101.1.1"]);
      expect(hop1.url).toBe("https://cdn.worksocial.com/next");
    }
  });

  it("blocks private hostname on initial redirect hop (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://localhost/admin",
          resolvedAddresses: ["127.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
    expect(decision.hopVerdicts).toHaveLength(1);
    expect(decision.hopVerdicts[0]?.allowed).toBe(false);
    const blocked = decision.hopVerdicts[0];
    expect(blocked?.allowed).toBe(false);
    if (blocked && !blocked.allowed) {
      expect(blocked.code).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
    }
  });

  it("blocks DNS rebind via IPv6 link-local address on hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/linklocal",
          resolvedAddresses: ["fe80::1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts).toHaveLength(1);
    expect(decision.hopVerdicts[0]?.allowed).toBe(false);
    const blocked = decision.hopVerdicts[0];
    if (blocked && !blocked.allowed) {
      expect(blocked.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    }
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
    expect(decision.hopVerdicts).toHaveLength(2);
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    expect(decision.hopVerdicts[1]?.allowed).toBe(false);
    const allowedHop = decision.hopVerdicts[0];
    if (allowedHop?.allowed) {
      expect(allowedHop.url).toBe("https://worksocial.com/start");
      expect(allowedHop.hopIndex).toBe(0);
    }
    const blockedHop = decision.hopVerdicts[1];
    if (blockedHop && !blockedHop.allowed) {
      expect(blockedHop.code).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
      expect(blockedHop.hostname).toBe("127.0.0.1");
      expect(blockedHop.reason.length).toBeGreaterThan(0);
      expect(blockedHop.url).toBe("https://127.0.0.1/admin");
    }
  });

  it("blocks DNS rebind via IPv4-mapped metadata address on hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/metadata",
          resolvedAddresses: ["::ffff:169.254.169.254"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts).toHaveLength(1);
    const mappedMeta = decision.hopVerdicts[0];
    if (mappedMeta && !mappedMeta.allowed) {
      expect(mappedMeta.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedMeta.hostname).toBe("worksocial.com");
      expect(mappedMeta.resolvedAddresses).toEqual(["::ffff:169.254.169.254"]);
    }
  });

  it("blocks ::1 resolved address on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/loopback-v6",
          resolvedAddresses: ["::1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    const loopHop = decision.hopVerdicts[0];
    if (loopHop && !loopHop.allowed) {
      expect(loopHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(loopHop.hostname).toBe("worksocial.com");
    }
  });

  it("blocks 0.0.0.0 resolved address on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/zero",
          resolvedAddresses: ["0.0.0.0"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const zeroHop = decision.hopVerdicts[0];
    if (zeroHop && !zeroHop.allowed) {
      expect(zeroHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(zeroHop.resolvedAddresses).toEqual(["0.0.0.0"]);
    }
  });

  it("blocks DNS rebind via ULA fd12:: address on hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/ula",
          resolvedAddresses: ["fd12::1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.hopVerdicts).toHaveLength(1);
    const ulaBlocked = decision.hopVerdicts[0];
    if (ulaBlocked && !ulaBlocked.allowed) {
      expect(ulaBlocked.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    }
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

    const hop0Rebind = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/rebind",
          resolvedAddresses: ["169.254.169.254"],
        },
      ],
    });
    expect(hop0Rebind.allowed).toBe(false);
    expect(hop0Rebind.code).toBe("HOP_BLOCKED");
    expect(hop0Rebind.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(hop0Rebind.blockedHopIndex).toBe(0);
    const metadataRebind = hop0Rebind.hopVerdicts[0];
    if (metadataRebind && !metadataRebind.allowed) {
      expect(metadataRebind.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(metadataRebind.resolvedAddresses).toEqual(["169.254.169.254"]);
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
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.hopVerdicts).toHaveLength(2);
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    expect(decision.hopVerdicts[1]?.allowed).toBe(false);
    const rebindHop = decision.hopVerdicts[1];
    if (rebindHop && !rebindHop.allowed) {
      expect(rebindHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(rebindHop.hostname).toBe("cdn.worksocial.com");
    }
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
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.hopVerdicts).toHaveLength(2);
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    expect(decision.hopVerdicts[1]?.allowed).toBe(false);
    const blockedHop = decision.hopVerdicts[1];
    if (blockedHop && !blockedHop.allowed) {
      expect(blockedHop.code).toBe("HOST_NOT_ALLOWLISTED");
      expect(blockedHop.hostname).toBe("evil.example");
    }
  });

  it("fails closed on empty chain or empty resolved addresses", () => {
    const emptyChain = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [],
    });
    expect(emptyChain.code).toBe("EMPTY_CHAIN");
    expect(emptyChain.allowed).toBe(false);
    expect(emptyChain.hopVerdicts).toHaveLength(0);
    expect(emptyChain.blockedHopIndex).toBeNull();
    expect(emptyChain.blockedCode).toBeNull();
    expect(emptyChain.reasons.length).toBeGreaterThan(0);
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

    const emptyAddrChain = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/",
          resolvedAddresses: [],
        },
      ],
    });
    expect(emptyAddrChain.allowed).toBe(false);
    expect(emptyAddrChain.code).toBe("HOP_BLOCKED");
    expect(emptyAddrChain.blockedCode).toBe("EMPTY_RESOLVED_ADDRESSES");
    expect(emptyAddrChain.blockedHopIndex).toBe(0);
    const emptyHop = emptyAddrChain.hopVerdicts[0];
    if (emptyHop && !emptyHop.allowed) {
      expect(emptyHop.code).toBe("EMPTY_RESOLVED_ADDRESSES");
      expect(emptyHop.resolvedAddresses).toEqual([]);
    }
  });
});
