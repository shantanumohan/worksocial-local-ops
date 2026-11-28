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
    expect(emptyChain.reasons).toEqual(["Empty hop chain — fail closed"]);
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

  it("blocks hop when any resolved address is private (mixed public+private)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/mixed-rr",
          resolvedAddresses: ["93.184.216.34", "10.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const mixedHop = decision.hopVerdicts[0];
    if (mixedHop && !mixedHop.allowed) {
      expect(mixedHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mixedHop.resolvedAddresses).toEqual([
        "93.184.216.34",
        "10.0.0.1",
      ]);
    }
  });

  it("blocks RFC1918 192.168.x resolved on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/rfc1918",
          resolvedAddresses: ["192.168.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.code).toBe("HOP_BLOCKED");
    const rfcHop = decision.hopVerdicts[0];
    if (rfcHop && !rfcHop.allowed) {
      expect(rfcHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(rfcHop.hostname).toBe("worksocial.com");
    }
  });

  it("blocks 10.0.0.0/8 resolved on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://cdn.worksocial.com/ten",
          resolvedAddresses: ["10.255.255.255"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts).toHaveLength(1);
    const tenHop = decision.hopVerdicts[0];
    if (tenHop && !tenHop.allowed) {
      expect(tenHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(tenHop.hostname).toBe("cdn.worksocial.com");
      expect(tenHop.resolvedAddresses).toEqual(["10.255.255.255"]);
    }
  });

  it("blocks link-local 169.254.x resolved on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/link-local",
          resolvedAddresses: ["169.254.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    const linkHop = decision.hopVerdicts[0];
    if (linkHop && !linkHop.allowed) {
      expect(linkHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(linkHop.hostname).toBe("worksocial.com");
      expect(linkHop.resolvedAddresses).toEqual(["169.254.0.1"]);
    }
  });

  it("blocks loopback 127.0.0.1 resolved on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://cdn.worksocial.com/loopback-rebind",
          resolvedAddresses: ["127.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.code).toBe("HOP_BLOCKED");
    const loopHop = decision.hopVerdicts[0];
    if (loopHop && !loopHop.allowed) {
      expect(loopHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(loopHop.hostname).toBe("cdn.worksocial.com");
      expect(loopHop.resolvedAddresses).toEqual(["127.0.0.1"]);
    }
  });

  it("blocks CGNAT 100.64.x resolved on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/cgnat",
          resolvedAddresses: ["100.64.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.code).toBe("HOP_BLOCKED");
    const cgnatHop = decision.hopVerdicts[0];
    if (cgnatHop && !cgnatHop.allowed) {
      expect(cgnatHop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(cgnatHop.hostname).toBe("worksocial.com");
      expect(cgnatHop.resolvedAddresses).toEqual(["100.64.0.1"]);
    }
  });

  it("blocks *.localhost hostname on redirect hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://api.dev.localhost/callback",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
    expect(decision.blockedHopIndex).toBe(0);
    const localhostHop = decision.hopVerdicts[0];
    if (localhostHop && !localhostHop.allowed) {
      expect(localhostHop.code).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
      expect(localhostHop.hostname).toBe("api.dev.localhost");
    }
  });

  it("blocks literal metadata hostname on redirect hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://metadata/latest/meta-data",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
    expect(decision.blockedHopIndex).toBe(0);
    const metaHop = decision.hopVerdicts[0];
    if (metaHop && !metaHop.allowed) {
      expect(metaHop.code).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
      expect(metaHop.hostname).toBe("metadata");
    }
  });

  it("blocks RFC1918 172.16.x resolved on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/rfc1918-172",
          resolvedAddresses: ["172.16.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.code).toBe("HOP_BLOCKED");
    const hop172 = decision.hopVerdicts[0];
    if (hop172 && !hop172.allowed) {
      expect(hop172.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(hop172.hostname).toBe("worksocial.com");
      expect(hop172.resolvedAddresses).toEqual(["172.16.0.1"]);
    }
  });

  it("blocks *.internal hostname on redirect hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://pod.cluster.local.internal/admin",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
    expect(decision.blockedHopIndex).toBe(0);
    const internalHop = decision.hopVerdicts[0];
    if (internalHop && !internalHop.allowed) {
      expect(internalHop.code).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
      expect(internalHop.hostname).toBe("pod.cluster.local.internal");
    }
  });

  it("blocks invalid URL on hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "not-a-valid-url",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("INVALID_URL");
    const badUrlHop = decision.hopVerdicts[0];
    if (badUrlHop && !badUrlHop.allowed) {
      expect(badUrlHop.code).toBe("INVALID_URL");
      expect(badUrlHop.hostname).toBeNull();
    }
  });

  it("blocks invalid URL on redirect hop 1 after allowed hop 0", () => {
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
          url: "%%%",
          resolvedAddresses: ["151.101.1.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("INVALID_URL");
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    expect(decision.hopVerdicts[1]?.allowed).toBe(false);
  });

  it("blocks IPv4-mapped loopback ::ffff:127.0.0.1 on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/mapped-loopback",
          resolvedAddresses: ["::ffff:127.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    const mappedLoop = decision.hopVerdicts[0];
    if (mappedLoop && !mappedLoop.allowed) {
      expect(mappedLoop.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedLoop.hostname).toBe("worksocial.com");
      expect(mappedLoop.resolvedAddresses).toEqual(["::ffff:127.0.0.1"]);
    }
  });

  it("blocks IPv4-mapped CGNAT ::ffff:100.64.x on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/mapped-cgnat",
          resolvedAddresses: ["::ffff:100.64.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const mappedCgnat = decision.hopVerdicts[0];
    if (mappedCgnat && !mappedCgnat.allowed) {
      expect(mappedCgnat.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedCgnat.hostname).toBe("worksocial.com");
      expect(mappedCgnat.resolvedAddresses).toEqual(["::ffff:100.64.0.1"]);
    }
  });

  it("blocks IPv4-mapped link-local ::ffff:169.254.x on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/mapped-link-local",
          resolvedAddresses: ["::ffff:169.254.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    const mappedLink = decision.hopVerdicts[0];
    if (mappedLink && !mappedLink.allowed) {
      expect(mappedLink.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedLink.hostname).toBe("worksocial.com");
      expect(mappedLink.resolvedAddresses).toEqual(["::ffff:169.254.0.1"]);
    }
  });

  it("blocks IPv4-mapped RFC1918 ::ffff:172.16.x on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://worksocial.com/mapped-172",
          resolvedAddresses: ["::ffff:172.16.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.blockedHopIndex).toBe(0);
    const mapped172 = decision.hopVerdicts[0];
    if (mapped172 && !mapped172.allowed) {
      expect(mapped172.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mapped172.hostname).toBe("worksocial.com");
      expect(mapped172.resolvedAddresses).toEqual(["::ffff:172.16.0.1"]);
    }
  });

  it("blocks 0.0.0.0 hostname on redirect hop 0", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://0.0.0.0/wildcard",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedCode).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
    expect(decision.blockedHopIndex).toBe(0);
    const zeroHostHop = decision.hopVerdicts[0];
    if (zeroHostHop && !zeroHostHop.allowed) {
      expect(zeroHostHop.code).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
      expect(zeroHostHop.hostname).toBe("0.0.0.0");
    }
  });

  it("blocks localhost.localdomain on redirect hop 1 after allowed hop 0", () => {
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
          url: "https://localhost.localdomain/redirect",
          resolvedAddresses: ["93.184.216.34"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    const localHop = decision.hopVerdicts[1];
    if (localHop && !localHop.allowed) {
      expect(localHop.code).toBe("PRIVATE_OR_LOCAL_HOSTNAME");
      expect(localHop.hostname).toBe("localhost.localdomain");
    }
  });

  it("blocks IPv4-mapped private ::ffff:192.168.x on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/mapped-hop1",
          resolvedAddresses: ["::ffff:192.168.55.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    const mappedHop1 = decision.hopVerdicts[1];
    if (mappedHop1 && !mappedHop1.allowed) {
      expect(mappedHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedHop1.hostname).toBe("cdn.worksocial.com");
      expect(mappedHop1.resolvedAddresses).toEqual(["::ffff:192.168.55.1"]);
    }
  });

  it("blocks ::1 resolved on allowlisted hostname redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/v6-loopback",
          resolvedAddresses: ["::1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    const v6Hop1 = decision.hopVerdicts[1];
    if (v6Hop1 && !v6Hop1.allowed) {
      expect(v6Hop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(v6Hop1.hostname).toBe("cdn.worksocial.com");
      expect(v6Hop1.resolvedAddresses).toEqual(["::1"]);
    }
  });

  it("blocks IPv4-mapped loopback ::ffff:127.0.0.1 on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/mapped-loopback-hop1",
          resolvedAddresses: ["::ffff:127.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    const mappedLoop1 = decision.hopVerdicts[1];
    if (mappedLoop1 && !mappedLoop1.allowed) {
      expect(mappedLoop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedLoop1.hostname).toBe("cdn.worksocial.com");
      expect(mappedLoop1.resolvedAddresses).toEqual(["::ffff:127.0.0.1"]);
    }
  });

  it("blocks IPv4-mapped RFC1918 ::ffff:172.16.x on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/mapped-172-hop1",
          resolvedAddresses: ["::ffff:172.16.99.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    const mapped172Hop1 = decision.hopVerdicts[1];
    if (mapped172Hop1 && !mapped172Hop1.allowed) {
      expect(mapped172Hop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mapped172Hop1.hostname).toBe("cdn.worksocial.com");
      expect(mapped172Hop1.resolvedAddresses).toEqual(["::ffff:172.16.99.1"]);
    }
  });

  it("blocks IPv4-mapped CGNAT ::ffff:100.64.x on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/mapped-cgnat-hop1",
          resolvedAddresses: ["::ffff:100.64.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    expect(decision.hopVerdicts[0]?.allowed).toBe(true);
    const mappedCgnatHop1 = decision.hopVerdicts[1];
    if (mappedCgnatHop1 && !mappedCgnatHop1.allowed) {
      expect(mappedCgnatHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedCgnatHop1.hostname).toBe("cdn.worksocial.com");
      expect(mappedCgnatHop1.resolvedAddresses).toEqual(["::ffff:100.64.0.1"]);
    }
  });

  it("blocks IPv4-mapped link-local ::ffff:169.254.x on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/mapped-linklocal-hop1",
          resolvedAddresses: ["::ffff:169.254.1.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const mappedLinkHop1 = decision.hopVerdicts[1];
    if (mappedLinkHop1 && !mappedLinkHop1.allowed) {
      expect(mappedLinkHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedLinkHop1.hostname).toBe("cdn.worksocial.com");
      expect(mappedLinkHop1.resolvedAddresses).toEqual(["::ffff:169.254.1.1"]);
    }
  });

  it("blocks IPv4-mapped 10.0.0.0/8 ::ffff:10.x on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/mapped-ten-hop1",
          resolvedAddresses: ["::ffff:10.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const mappedTenHop1 = decision.hopVerdicts[1];
    if (mappedTenHop1 && !mappedTenHop1.allowed) {
      expect(mappedTenHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedTenHop1.hostname).toBe("cdn.worksocial.com");
      expect(mappedTenHop1.resolvedAddresses).toEqual(["::ffff:10.0.0.1"]);
    }
  });

  it("blocks IPv6 link-local fe80:: on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/v6-linklocal-hop1",
          resolvedAddresses: ["fe80::dead:beef"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const linkHop1 = decision.hopVerdicts[1];
    if (linkHop1 && !linkHop1.allowed) {
      expect(linkHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(linkHop1.hostname).toBe("cdn.worksocial.com");
      expect(linkHop1.resolvedAddresses).toEqual(["fe80::dead:beef"]);
    }
  });

  it("blocks IPv6 ULA fd12:: on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/v6-ula-hop1",
          resolvedAddresses: ["fd12::1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const ulaHop1 = decision.hopVerdicts[1];
    if (ulaHop1 && !ulaHop1.allowed) {
      expect(ulaHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(ulaHop1.hostname).toBe("cdn.worksocial.com");
      expect(ulaHop1.resolvedAddresses).toEqual(["fd12::1"]);
    }
  });

  it("blocks 0.0.0.0 resolved address on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/zero-hop1",
          resolvedAddresses: ["0.0.0.0"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const zeroHop1 = decision.hopVerdicts[1];
    if (zeroHop1 && !zeroHop1.allowed) {
      expect(zeroHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(zeroHop1.hostname).toBe("cdn.worksocial.com");
      expect(zeroHop1.resolvedAddresses).toEqual(["0.0.0.0"]);
    }
  });

  it("blocks link-local 169.254.x resolved on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/linklocal-hop1",
          resolvedAddresses: ["169.254.77.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const linkLocalHop1 = decision.hopVerdicts[1];
    if (linkLocalHop1 && !linkLocalHop1.allowed) {
      expect(linkLocalHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(linkLocalHop1.hostname).toBe("cdn.worksocial.com");
      expect(linkLocalHop1.resolvedAddresses).toEqual(["169.254.77.1"]);
    }
  });

  it("blocks RFC1918 192.168.x resolved on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/rfc1918-hop1",
          resolvedAddresses: ["192.168.88.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const rfcHop1 = decision.hopVerdicts[1];
    if (rfcHop1 && !rfcHop1.allowed) {
      expect(rfcHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(rfcHop1.hostname).toBe("cdn.worksocial.com");
      expect(rfcHop1.resolvedAddresses).toEqual(["192.168.88.1"]);
    }
  });

  it("blocks loopback 127.0.0.1 resolved on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/loopback-hop1",
          resolvedAddresses: ["127.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const loopHop1 = decision.hopVerdicts[1];
    if (loopHop1 && !loopHop1.allowed) {
      expect(loopHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(loopHop1.hostname).toBe("cdn.worksocial.com");
      expect(loopHop1.resolvedAddresses).toEqual(["127.0.0.1"]);
    }
  });

  it("blocks RFC1918 172.16.x resolved on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/172-hop1",
          resolvedAddresses: ["172.16.55.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const hop172Hop1 = decision.hopVerdicts[1];
    if (hop172Hop1 && !hop172Hop1.allowed) {
      expect(hop172Hop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(hop172Hop1.hostname).toBe("cdn.worksocial.com");
      expect(hop172Hop1.resolvedAddresses).toEqual(["172.16.55.1"]);
    }
  });

  it("blocks CGNAT 100.64.x resolved on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/cgnat-hop1",
          resolvedAddresses: ["100.64.12.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const cgnatHop1 = decision.hopVerdicts[1];
    if (cgnatHop1 && !cgnatHop1.allowed) {
      expect(cgnatHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(cgnatHop1.hostname).toBe("cdn.worksocial.com");
      expect(cgnatHop1.resolvedAddresses).toEqual(["100.64.12.1"]);
    }
  });

  it("blocks 10.0.0.0/8 resolved on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/ten-hop1",
          resolvedAddresses: ["10.0.0.44"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const tenHop1 = decision.hopVerdicts[1];
    if (tenHop1 && !tenHop1.allowed) {
      expect(tenHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(tenHop1.hostname).toBe("cdn.worksocial.com");
      expect(tenHop1.resolvedAddresses).toEqual(["10.0.0.44"]);
    }
  });

  it("blocks expanded IPv4-mapped RFC1918 on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/expanded-mapped-hop1",
          resolvedAddresses: ["0:0:0:0:0:ffff:192.168.1.5"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const expandedHop1 = decision.hopVerdicts[1];
    if (expandedHop1 && !expandedHop1.allowed) {
      expect(expandedHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(expandedHop1.hostname).toBe("cdn.worksocial.com");
      expect(expandedHop1.resolvedAddresses).toEqual([
        "0:0:0:0:0:ffff:192.168.1.5",
      ]);
    }
  });

  it("blocks hex IPv4-mapped 10.0.0.9 ::ffff:a00:9 on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/hex-mapped-ten-hop1",
          resolvedAddresses: ["::ffff:a00:9"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const hexMappedHop1 = decision.hopVerdicts[1];
    if (hexMappedHop1 && !hexMappedHop1.allowed) {
      expect(hexMappedHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(hexMappedHop1.hostname).toBe("cdn.worksocial.com");
      expect(hexMappedHop1.resolvedAddresses).toEqual(["::ffff:a00:9"]);
    }
  });

  it("blocks expanded IPv4-mapped 172.16.x on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/expanded-172-hop1",
          resolvedAddresses: ["0:0:0:0:0:ffff:172.16.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const expanded172Hop1 = decision.hopVerdicts[1];
    if (expanded172Hop1 && !expanded172Hop1.allowed) {
      expect(expanded172Hop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(expanded172Hop1.hostname).toBe("cdn.worksocial.com");
      expect(expanded172Hop1.resolvedAddresses).toEqual([
        "0:0:0:0:0:ffff:172.16.0.1",
      ]);
    }
  });

  it("blocks expanded IPv4-mapped 10.0.0.0/8 on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/expanded-ten-hop1",
          resolvedAddresses: ["0:0:0:0:0:ffff:10.0.0.9"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const expandedTenHop1 = decision.hopVerdicts[1];
    if (expandedTenHop1 && !expandedTenHop1.allowed) {
      expect(expandedTenHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(expandedTenHop1.hostname).toBe("cdn.worksocial.com");
      expect(expandedTenHop1.resolvedAddresses).toEqual([
        "0:0:0:0:0:ffff:10.0.0.9",
      ]);
    }
  });

  it("blocks expanded IPv4-mapped loopback on redirect hop 1", () => {
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
          url: "https://cdn.worksocial.com/expanded-loopback-hop1",
          resolvedAddresses: ["0:0:0:0:0:ffff:127.0.0.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.blockedHopIndex).toBe(1);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const expandedLoopHop1 = decision.hopVerdicts[1];
    if (expandedLoopHop1 && !expandedLoopHop1.allowed) {
      expect(expandedLoopHop1.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(expandedLoopHop1.hostname).toBe("cdn.worksocial.com");
      expect(expandedLoopHop1.resolvedAddresses).toEqual([
        "0:0:0:0:0:ffff:127.0.0.1",
      ]);
    }
  });

  it("blocks IPv4-mapped RFC1918 ::ffff:192.168.x on allowlisted hostname (hop 0)", () => {
    const decision = evaluateSsrfRedirectDnsRebindChain({
      allowedHosts: ALLOWED,
      hops: [
        {
          hopIndex: 0,
          url: "https://cdn.worksocial.com/mapped-rfc1918",
          resolvedAddresses: ["::ffff:192.168.1.1"],
        },
      ],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.code).toBe("HOP_BLOCKED");
    expect(decision.blockedHopIndex).toBe(0);
    expect(decision.blockedCode).toBe("DNS_REBIND_PRIVATE_ADDRESS");
    const mappedRfc = decision.hopVerdicts[0];
    if (mappedRfc && !mappedRfc.allowed) {
      expect(mappedRfc.code).toBe("DNS_REBIND_PRIVATE_ADDRESS");
      expect(mappedRfc.hostname).toBe("cdn.worksocial.com");
      expect(mappedRfc.resolvedAddresses).toEqual(["::ffff:192.168.1.1"]);
    }
  });
});
