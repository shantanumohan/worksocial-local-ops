import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  composeOwnershipProbes,
  createHeartbeatFileOwnershipProbe,
  defaultOwnershipProbe,
  describeOwnershipCapability,
  isProcOwnershipAvailable,
  verifyProcessOwnership,
} from "./process-ownership.js";

describe("process-ownership", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts a pid whose cmdline/environ advertise service + generation", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {
        readCommandLine: () =>
          "tsx heartbeat-slot.ts --service api --generation gen-abc",
        readEnviron: () => "WORKSOCIAL_SERVICE_ID=api\0WORKSOCIAL_GENERATION=gen-abc\0",
      },
    );
    expect(ok).toBe(true);
  });

  it("rejects PID reuse when generation is missing", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {
        readCommandLine: () => "nginx: worker process",
        readEnviron: () => "USER=www\0",
      },
    );
    expect(ok).toBe(false);
  });

  it("denies kill when no ownership probe data is available", () => {
    const ok = verifyProcessOwnership(
      { pid: 123, serviceId: "api", generationId: "gen-abc" },
      {},
    );
    expect(ok).toBe(false);
  });

  it("verifies ownership via heartbeat-file fallback", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "ws-own-"));
    dirs.push(stateDir);
    writeFileSync(
      join(stateDir, "heartbeat-api.json"),
      JSON.stringify({
        serviceId: "api",
        pid: 4242,
        generationId: "gen-hb",
        status: "running",
      }),
      "utf8",
    );
    const probe = createHeartbeatFileOwnershipProbe(stateDir);
    expect(
      verifyProcessOwnership(
        { pid: 4242, serviceId: "api", generationId: "gen-hb" },
        probe,
      ),
    ).toBe(true);
    expect(
      verifyProcessOwnership(
        { pid: 4242, serviceId: "api", generationId: "other" },
        probe,
      ),
    ).toBe(false);
  });

  it("composes /proc-preferring probe with heartbeat fallback", () => {
    const stateDir = mkdtempSync(join(tmpdir(), "ws-own-"));
    dirs.push(stateDir);
    writeFileSync(
      join(stateDir, "heartbeat-console.json"),
      JSON.stringify({
        serviceId: "console",
        pid: 77,
        generationId: "g-console",
      }),
      "utf8",
    );
    const probe = composeOwnershipProbes(
      { readCommandLine: () => null, readEnviron: () => null },
      createHeartbeatFileOwnershipProbe(stateDir),
    );
    expect(
      verifyProcessOwnership(
        { pid: 77, serviceId: "console", generationId: "g-console" },
        probe,
      ),
    ).toBe(true);
  });

  it("reports /proc capability honestly on this host", () => {
    const cap = describeOwnershipCapability(true);
    expect(cap.procAvailable).toBe(isProcOwnershipAvailable());
    expect(cap.heartbeatFallback).toBe(true);
    expect(cap.detail.length).toBeGreaterThan(0);
    // On Linux CI/cloud agents, default probe should use /proc.
    if (isProcOwnershipAvailable()) {
      const probe = defaultOwnershipProbe();
      expect(typeof probe.readCommandLine).toBe("function");
    }
  });
});
