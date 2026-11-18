import { afterEach, describe, expect, it } from "vitest";
import { validateLiveProbeUrl, validateRedirectTarget } from "./url-policy.js";

const prev = process.env.WORKSOCIAL_PROBE_ALLOWED_HOSTS;

afterEach(() => {
  if (prev === undefined) {
    delete process.env.WORKSOCIAL_PROBE_ALLOWED_HOSTS;
  } else {
    process.env.WORKSOCIAL_PROBE_ALLOWED_HOSTS = prev;
  }
});

describe("live probe URL policy", () => {
  it("rejects loopback, private, and http URLs", () => {
    process.env.WORKSOCIAL_PROBE_ALLOWED_HOSTS = "worksocial.com";
    expect(validateLiveProbeUrl("http://worksocial.com/").ok).toBe(false);
    expect(validateLiveProbeUrl("https://127.0.0.1/").ok).toBe(false);
    expect(validateLiveProbeUrl("https://192.168.1.1/").ok).toBe(false);
    expect(validateLiveProbeUrl("https://10.0.0.5/x").ok).toBe(false);
    expect(validateLiveProbeUrl("https://localhost/").ok).toBe(false);
  });

  it("requires allowlist and accepts approved public https", () => {
    delete process.env.WORKSOCIAL_PROBE_ALLOWED_HOSTS;
    expect(validateLiveProbeUrl("https://worksocial.com/contact").ok).toBe(
      false,
    );
    process.env.WORKSOCIAL_PROBE_ALLOWED_HOSTS = "worksocial.com,www.worksocial.com";
    const ok = validateLiveProbeUrl("https://worksocial.com/contact");
    expect(ok.ok).toBe(true);
    expect(validateLiveProbeUrl("https://evil.example/").ok).toBe(false);
  });

  it("rejects redirect hops to private hosts", () => {
    process.env.WORKSOCIAL_PROBE_ALLOWED_HOSTS = "worksocial.com";
    const bad = validateRedirectTarget(
      "https://127.0.0.1/admin",
      "https://worksocial.com/",
    );
    expect(bad.ok).toBe(false);
  });
});
