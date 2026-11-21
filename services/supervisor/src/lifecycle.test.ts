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
    // Ensure dataHome mirrors temp layout for seed tests.
    config.dataHome = stateDir;
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
                canonicalPath:
                  "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS/db",
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
                  canonicalPath:
                    "C:/Users/ShantanuMohan/OneDrive - myworksocial.com/Documents/AgenticArmyWS/db",
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

  it("fails start and cleans up when a required slot becomes unhealthy", async () => {
    const { store, spawner, config } = setup();
    const originalStart = spawner.start.bind(spawner);
    spawner.start = (request) => {
      const spawned = originalStart(request);
      if (request.serviceId === "api") {
        // Simulate immediate crash of the api slot after spawn.
        void spawner.stopOwned({
          pid: spawned.info.pid,
          serviceId: "api",
          generationId: request.generationId,
        });
      }
      return spawned;
    };

    const started = await runSupervisorCommand("start", store, config, spawner);
    expect(started.ok).toBe(false);
    expect(started.message).toMatch(/unhealthy|not ready/i);
    expect(spawner.running.size).toBe(0);
  });

  it("does not kill a PID that fails ownership verification", async () => {
    const { store, spawner, config } = setup();
    const started = await runSupervisorCommand("start", store, config, spawner);
    expect(started.ok).toBe(true);
    const api = store.read().heartbeats.find((h) => h.serviceId === "api");
    expect(api?.pid).toBeTruthy();
    const foreignPid = api!.pid!;
    const realGeneration = api!.generationId!;
    const result = await spawner.stopOwned({
      pid: foreignPid,
      serviceId: "api",
      generationId: "other-gen",
    });
    expect(result).toBe("skipped");
    expect(spawner.isAlive(foreignPid)).toBe(true);
    // Clean up with the real generation.
    await spawner.stopOwned({
      pid: foreignPid,
      serviceId: "api",
      generationId: realGeneration,
    });
    await runSupervisorCommand("stop", store, config, spawner);
  });

  it("recover restarts after crash when slots are dead but lease remains", async () => {
    const { store, spawner, config } = setup();
    const first = await runSupervisorCommand("start", store, config, spawner);
    expect(first.ok).toBe(true);
    // Simulate hard crash: children gone, lease still present with dead holder.
    for (const [pid, meta] of [...spawner.running.entries()]) {
      await spawner.stopOwned({
        pid,
        serviceId: meta.serviceId,
        generationId: meta.generationId,
      });
    }
    store.update((state) => ({
      ...state,
      hostLease: state.hostLease
        ? {
            ...state.hostLease,
            holderPid: 1,
            // Keep TTL alive so recovery must handle non-expired dead holder.
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }
        : null,
      heartbeats: state.heartbeats.map((h) => ({
        ...h,
        status: h.serviceId === "temporal-worker" ? "stub" : "unhealthy",
        pid: null,
        detail: "crashed",
      })),
    }));
    const recovered = await runSupervisorCommand("recover", store, config, spawner);
    expect(recovered.ok).toBe(true);
    expect(recovered.message).toMatch(/Recovery restart OK/i);
    expect(spawner.running.size).toBe(3);
    expect(store.read().hostLease?.holderPid).toBe(process.pid);
  });

  it("recover adopts a healthy live generation without killing slots", async () => {
    const { store, spawner, config } = setup();
    const started = await runSupervisorCommand("start", store, config, spawner);
    expect(started.ok).toBe(true);
    const genBefore = store.read().hostLease?.generationId;
    const pidsBefore = [...spawner.running.keys()].sort();
    const recovered = await runSupervisorCommand("recover", store, config, spawner);
    expect(recovered.ok).toBe(true);
    expect(recovered.message).toMatch(/Adopted live generation/i);
    expect(store.read().hostLease?.generationId).toBe(genBefore);
    expect([...spawner.running.keys()].sort()).toEqual(pidsBefore);
    expect(recovered.health?.components.host.status).toBe("up");
    expect(recovered.health?.components.api.status).toBe("up");
    expect(recovered.health?.components.temporal.status).toBe("stub");
  });

  it("health message distinguishes host vs api/console/temporal planes", async () => {
    const { store, spawner, config } = setup();
    await runSupervisorCommand("start", store, config, spawner);
    const health = await runSupervisorCommand("health", store, config, spawner);
    expect(health.message).toMatch(/host=up/);
    expect(health.message).toMatch(/api=up/);
    expect(health.message).toMatch(/console=up/);
    expect(health.message).toMatch(/temporal=stub/);
    expect(health.health?.components.temporal.wiringStatus).toBe("stub");
  });
});
