import { describe, expect, it } from "vitest";
import {
  buildHostHealthComponents,
  defaultHeartbeat,
  isHeartbeatStale,
  summarizeHostHealth,
} from "./health-records.js";

describe("heartbeat staleness", () => {
  it("marks missing or old heartbeats stale", () => {
    expect(isHeartbeatStale(null, 10_000, 5_000)).toBe(true);
    expect(isHeartbeatStale(new Date(1_000).toISOString(), 10_000, 5_000)).toBe(true);
    expect(isHeartbeatStale(new Date(8_000).toISOString(), 10_000, 5_000)).toBe(false);
  });
});

describe("host health components", () => {
  it("separates host lease from api/console/temporal planes", () => {
    const services = [
      {
        ...defaultHeartbeat("api"),
        status: "running" as const,
        wiringStatus: "identity-wired" as const,
        pid: 11,
        generationId: "g1",
        lastHeartbeatAt: new Date().toISOString(),
        detail: "api up",
      },
      {
        ...defaultHeartbeat("console"),
        status: "running" as const,
        wiringStatus: "process-managed" as const,
        pid: 12,
        generationId: "g1",
        lastHeartbeatAt: new Date().toISOString(),
        detail: "console up",
      },
      {
        ...defaultHeartbeat("temporal-worker"),
        status: "stub" as const,
        wiringStatus: "stub" as const,
        pid: 13,
        generationId: "g1",
        lastHeartbeatAt: new Date().toISOString(),
        detail: "Temporal NOT_WIRED",
      },
    ];

    const components = buildHostHealthComponents(services, true);
    expect(components.host.status).toBe("up");
    expect(components.api.status).toBe("up");
    expect(components.console.status).toBe("up");
    expect(components.temporal.status).toBe("stub");

    const snap = summarizeHostHealth("host-a", services, true, new Date().toISOString());
    expect(snap.overall).toBe("healthy");
    expect(snap.components.temporal.wiringStatus).toBe("stub");
    expect(snap.components.host.leaseHeld).toBe(true);
  });

  it("marks host down when lease is absent even if temporal stub exists", () => {
    const services = [defaultHeartbeat("api"), defaultHeartbeat("console"), defaultHeartbeat("temporal-worker")];
    const components = buildHostHealthComponents(services, false);
    expect(components.host.status).toBe("down");
    expect(components.api.status).toBe("down");
    expect(components.temporal.status).toBe("stub");
  });

  it("reports degraded (not healthy) when slots run without an active lease", () => {
    const services = [
      {
        ...defaultHeartbeat("api"),
        status: "running" as const,
        wiringStatus: "identity-wired" as const,
        pid: 11,
        generationId: "g1",
        lastHeartbeatAt: new Date().toISOString(),
        detail: "api up",
      },
      {
        ...defaultHeartbeat("console"),
        status: "running" as const,
        wiringStatus: "process-managed" as const,
        pid: 12,
        generationId: "g1",
        lastHeartbeatAt: new Date().toISOString(),
        detail: "console up",
      },
      defaultHeartbeat("temporal-worker"),
    ];
    const snap = summarizeHostHealth("host-a", services, false, new Date().toISOString());
    expect(snap.components.host.status).toBe("down");
    expect(snap.overall).toBe("degraded");
  });
});
