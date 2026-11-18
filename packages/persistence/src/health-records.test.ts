import { describe, expect, it } from "vitest";
import { isHeartbeatStale } from "./health-records.js";

describe("heartbeat staleness", () => {
  it("marks missing or old heartbeats stale", () => {
    expect(isHeartbeatStale(null, 10_000, 5_000)).toBe(true);
    expect(isHeartbeatStale(new Date(1_000).toISOString(), 10_000, 5_000)).toBe(true);
    expect(isHeartbeatStale(new Date(8_000).toISOString(), 10_000, 5_000)).toBe(false);
  });
});
