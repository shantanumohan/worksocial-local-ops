import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  createFileLocalStateStore,
  registerStorageRoot,
  createEmptyRegistry,
} from "@worksocial/persistence";
import { loadSupervisorConfig } from "./config.js";
import { runSupervisorCommand } from "./lifecycle.js";
import { createInMemorySpawner } from "./process-manager.js";

describe("supervisor lifecycle", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  function setup() {
    const stateDir = mkdtempSync(join(tmpdir(), "ws-supervisor-"));
    dirs.push(stateDir);
    const store = createFileLocalStateStore(stateDir);
    const spawner = createInMemorySpawner();
    const config = {
      ...loadSupervisorConfig(
        {
          WORKSOCIAL_STATE_DIR: stateDir,
          WORKSOCIAL_HOST_ID: "test-host",
          WORKSOCIAL_SEED_EXAMPLE_ROOTS: "0",
        },
        process.cwd(),
      ),
      stateDir,
      hostId: "test-host",
      seedExampleRoots: false,
    };
    return { store, spawner, config, stateDir };
  }

  it("starts, stops, and restarts managed process slots", async () => {
    const { store, spawner, config } = setup();

    const started = await runSupervisorCommand("start", store, config, spawner);
    expect(started.ok).toBe(true);
    expect(started.lease?.hostId).toBe("test-host");
    expect(spawner.running.size).toBe(3);
    expect(started.stubs?.some((s) => s.includes("NOT_WIRED"))).toBe(true);

    const api = started.heartbeats?.find((h) => h.serviceId === "api");
    expect(api?.status).toBe("running");
    const temporal = started.heartbeats?.find((h) => h.serviceId === "temporal-worker");
    expect(temporal?.status).toBe("stub");
    expect(temporal?.wiringStatus).toBe("stub");

    const stopped = await runSupervisorCommand("stop", store, config, spawner);
    expect(stopped.ok).toBe(true);
    expect(spawner.running.size).toBe(0);

    const restarted = await runSupervisorCommand("start", store, config, spawner);
    expect(restarted.ok).toBe(true);
    expect(spawner.running.size).toBe(3);
  });

  it("test-local performs start → stop → start round-trip", async () => {
    const { store, spawner, config } = setup();
    const result = await runSupervisorCommand("test-local", store, config, spawner);
    expect(result.ok).toBe(true);
    expect(result.doctor).toBeDefined();
    expect(spawner.running.size).toBe(3);
  });

  it("refuses start when durable root is on a sync path", async () => {
    const { store, spawner, config } = setup();
    store.update((state) => {
      const registered = registerStorageRoot(
        createEmptyRegistry(),
        "database",
        "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS/db",
        { id: "database" },
      );
      // Force-insert a violating root as if config were tampered (bypass register).
      const forced = registered.ok
        ? registered.registry
        : {
            roots: [
              {
                id: "database",
                kind: "database" as const,
                path: "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS/db",
                syncPath: true,
                registeredAt: new Date().toISOString(),
              },
            ],
            updatedAt: new Date().toISOString(),
          };
      // If register correctly refused, inject manually to simulate persisted bad state.
      const roots =
        registered.ok === false
          ? {
              roots: [
                {
                  id: "database",
                  kind: "database" as const,
                  path: "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS/db",
                  syncPath: true,
                  registeredAt: new Date().toISOString(),
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : forced;

      return { ...state, storageRoots: roots };
    });

    const started = await runSupervisorCommand("start", store, config, spawner);
    expect(started.ok).toBe(false);
    expect(started.storageErrors?.some((e) => e.code === "DURABLE_ON_SYNC_PATH")).toBe(true);
    expect(spawner.running.size).toBe(0);
  });

  it("doctor reports honest temporal stub status", async () => {
    const { store, spawner, config } = setup();
    await runSupervisorCommand("start", store, config, spawner);
    const doctor = await runSupervisorCommand("doctor", store, config, spawner);
    expect(doctor.doctor?.checks.some((c) => c.id === "slot-temporal-worker" && c.status === "warn")).toBe(
      true,
    );
    expect(doctor.productionActivated).toBe(false);
  });
});
