import { describe, expect, it } from "vitest";
import {
  createGbpFixtureSimulator,
  createLinkedInFixtureSimulator,
  liveGbpUnavailable,
  liveLinkedInUnavailable,
} from "./gbp-social-fixture.js";

const now = "2026-11-20T14:30:00.000Z";

describe("GBP fixture simulator", () => {
  it("accepts, independently reads, and matches expected body", () => {
    const gbp = createGbpFixtureSimulator();
    const applied = gbp.apply({
      variantId: "var-gbp",
      body: "Open for tours this week.",
      nowIso: now,
    });
    expect(applied.outcome).toBe("ACCEPTED_PENDING");
    const read = gbp.independentRead({
      variantId: "var-gbp",
      expectedBody: "Open for tours this week.",
    });
    expect(read.matched).toBe(true);
    expect(read.observedFields?.body).toBe("Open for tours this week.");
  });

  it("recovers UNKNOWN_REMOTE_OUTCOME then verifies", () => {
    const gbp = createGbpFixtureSimulator();
    const lost = gbp.apply({
      variantId: "var-gbp-2",
      body: "Hello",
      nowIso: now,
      forceUnknownRemote: true,
    });
    expect(lost.outcome).toBe("UNKNOWN_REMOTE_OUTCOME");
    const before = gbp.independentRead({
      variantId: "var-gbp-2",
      expectedBody: "Hello",
    });
    expect(before.matched).toBe(false);
    const recovered = gbp.recover({
      variantId: "var-gbp-2",
      body: "Hello",
      nowIso: now,
    });
    expect(recovered.outcome).toBe("ACCEPTED_PENDING");
    const after = gbp.independentRead({
      variantId: "var-gbp-2",
      expectedBody: "Hello",
    });
    expect(after.matched).toBe(true);
  });
});

describe("LinkedIn fixture simulator", () => {
  it("accepts and independently verifies title+body", () => {
    const li = createLinkedInFixtureSimulator();
    const applied = li.apply({
      variantId: "var-li",
      title: "Training rooms",
      body: "Book a tour",
      nowIso: now,
    });
    expect(applied.outcome).toBe("ACCEPTED_PENDING");
    const read = li.independentRead({
      variantId: "var-li",
      expectedTitle: "Training rooms",
      expectedBody: "Book a tour",
    });
    expect(read.matched).toBe(true);
  });

  it("live stubs stay UNAVAILABLE / NOT_WIRED", () => {
    expect(liveGbpUnavailable().mode).toBe("LIVE_UNAVAILABLE");
    expect(liveLinkedInUnavailable().mode).toBe("LIVE_UNAVAILABLE");
  });
});
