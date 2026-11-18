import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  acquireHostLease,
  assertDurableRootsOffSync,
  createEmptyRegistry,
  releaseHostLease,
  registerStorageRoot,
  type LocalStateStore,
  type ServiceHeartbeatRecord,
  type ServiceSlotId,
  defaultHeartbeat,
  DEFAULT_SERVICE_SLOTS,
} from "@worksocial/persistence";
import type { SupervisorConfig } from "./config.js";
import { runDoctor } from "./doctor.js";
import { collectHealth } from "./health.js";
import type { ProcessSpawner } from "./process-manager.js";
import type { SupervisorCommand, SupervisorResult } from "./types.js";

const MANAGED_SLOTS: ServiceSlotId[] = ["api", "console", "temporal-worker"];
const REQUIRED_READY: ServiceSlotId[] = ["api", "console"];

type HeartbeatFile = {
  pid?: number | null;
  generationId?: string | null;
  status?: string;
};

function readHeartbeatFile(stateDir: string, serviceId: ServiceSlotId): HeartbeatFile | null {
  const path = join(stateDir, `heartbeat-${serviceId}.json`);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as HeartbeatFile;
  } catch {
    return null;
  }
}

function clearHeartbeatFiles(stateDir: string): void {
  for (const serviceId of MANAGED_SLOTS) {
    const path = join(stateDir, `heartbeat-${serviceId}.json`);
    if (existsSync(path)) {
      rmSync(path, { force: true });
    }
  }
}

function stubsNote(): string[] {
  return [
    "temporal-worker: stub process slot — Temporal runtime NOT_WIRED in R1-01",
    "api/console: minimal loopback /health process slots — not full product surfaces",
    "auth/login/standing grants: out of scope (R1-02)",
    "Postgres binding: schema migrated in SQL; runtime state is file-backed until DB is wired",
  ];
}

function upsertHeartbeat(
  heartbeats: ServiceHeartbeatRecord[],
  next: ServiceHeartbeatRecord,
): ServiceHeartbeatRecord[] {
  return [...heartbeats.filter((h) => h.serviceId !== next.serviceId), next];
}

function seedExampleRootsIfRequested(
  store: LocalStateStore,
  config: SupervisorConfig,
): void {
  if (!config.seedExampleRoots) {
    return;
  }
  store.update((state) => {
    if (state.storageRoots.roots.length > 0) {
      return state;
    }
    let registry = createEmptyRegistry();
    const workspace = join(config.repoRoot);
    const localData = join(config.stateDir, "durable-example");
    const pairs: Array<Parameters<typeof registerStorageRoot>[1]> = [
      "source",
      "working",
      "content",
      "reports",
      "encrypted_backup",
      "database",
      "temporal",
      "secrets",
    ];
    for (const kind of pairs) {
      const path =
        kind === "database" || kind === "temporal" || kind === "secrets"
          ? join(localData, kind)
          : join(workspace, ".worksocial", "example-roots", kind);
      const result = registerStorageRoot(registry, kind, path, {
        denyPatterns: config.syncDenyPatterns,
        id: kind,
      });
      if (result.ok) {
        registry = result.registry;
      }
    }
    return {
      ...state,
      storageRoots: registry,
      updatedAt: new Date().toISOString(),
    };
  });
}

async function stopGeneration(
  store: LocalStateStore,
  config: SupervisorConfig,
  spawner: ProcessSpawner,
  generationId: string | null,
): Promise<void> {
  const state = store.read();
  const targets = new Map<number, { serviceId: ServiceSlotId; generationId: string }>();

  for (const hb of state.heartbeats) {
    if (hb.pid !== null && hb.generationId) {
      if (generationId === null || hb.generationId === generationId) {
        targets.set(hb.pid, { serviceId: hb.serviceId, generationId: hb.generationId });
      }
    }
  }
  for (const serviceId of MANAGED_SLOTS) {
    const file = readHeartbeatFile(config.stateDir, serviceId);
    if (
      file?.pid != null &&
      typeof file.generationId === "string" &&
      (generationId === null || file.generationId === generationId)
    ) {
      targets.set(file.pid, { serviceId, generationId: file.generationId });
    }
  }

  for (const [pid, meta] of targets) {
    await spawner.stopOwned({
      pid,
      serviceId: meta.serviceId,
      generationId: meta.generationId,
    });
  }

  clearHeartbeatFiles(config.stateDir);
  store.update((current) => {
    const releaseInput: {
      hostId: string;
      holderPid: number;
      force: true;
      isHolderAlive: (pid: number) => boolean;
      generationId?: string;
    } = {
      hostId: config.hostId,
      holderPid: process.pid,
      force: true,
      isHolderAlive: (pid) => spawner.isAlive(pid),
    };
    const gen = generationId ?? current.hostLease?.generationId;
    if (gen !== undefined) {
      releaseInput.generationId = gen;
    }
    const released = releaseHostLease(current.hostLease, releaseInput);
    return {
      ...current,
      hostLease: released.released ? null : current.hostLease,
      heartbeats: DEFAULT_SERVICE_SLOTS.map((id) => {
        const base = defaultHeartbeat(id);
        if (id === "temporal-worker") {
          return {
            ...base,
            status: "stub",
            detail: "temporal-worker stopped; Temporal remains NOT_WIRED.",
          };
        }
        return {
          ...base,
          status: "stopped",
          detail: `${id} stopped by supervisor.`,
        };
      }),
      updatedAt: new Date().toISOString(),
    };
  });
}

async function stopAll(
  store: LocalStateStore,
  config: SupervisorConfig,
  spawner: ProcessSpawner,
): Promise<void> {
  await stopGeneration(store, config, spawner, null);
}

function managedSlotsReady(health: ReturnType<typeof collectHealth>): boolean {
  return REQUIRED_READY.every((id) => {
    const svc = health.services.find((s) => s.serviceId === id);
    return svc?.status === "running" && svc.pid !== null;
  });
}

async function startAll(
  store: LocalStateStore,
  config: SupervisorConfig,
  spawner: ProcessSpawner,
): Promise<SupervisorResult> {
  seedExampleRootsIfRequested(store, config);

  const syncErrors = assertDurableRootsOffSync(store.read().storageRoots, {
    denyPatterns: config.syncDenyPatterns,
  });
  if (syncErrors.length > 0) {
    return {
      ok: false,
      command: "start",
      message: "Refusing start: durable storage roots violate sync-path policy.",
      productionActivated: false,
      storageErrors: syncErrors,
      stubs: stubsNote(),
    };
  }

  // Restart semantics: stop existing managed pids, then acquire lease and start.
  await stopAll(store, config, spawner);

  const generationId = randomUUID();
  const leaseResult = acquireHostLease(store.read().hostLease, {
    hostId: config.hostId,
    holderPid: process.pid,
    generationId,
    ttlMs: config.leaseTtlMs,
  });

  if (!leaseResult.ok) {
    return {
      ok: false,
      command: "start",
      message: leaseResult.message,
      productionActivated: false,
      stubs: stubsNote(),
    };
  }

  store.update((current) => ({
    ...current,
    hostLease: leaseResult.lease,
    updatedAt: new Date().toISOString(),
  }));

  let heartbeats = store.read().heartbeats;

  for (const serviceId of MANAGED_SLOTS) {
    const spawned = spawner.start({
      serviceId,
      config,
      generationId,
      hostId: config.hostId,
      leaseTtlMs: config.leaseTtlMs,
    });
    let livePid = spawned.info.pid;
    if (spawned.info.command !== "memory") {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const file = readHeartbeatFile(config.stateDir, serviceId);
        if (file?.pid != null && file.generationId === generationId) {
          livePid = file.pid;
          break;
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    const detail =
      serviceId === "temporal-worker"
        ? "Stub temporal-worker slot started (Temporal NOT_WIRED)."
        : `${serviceId} process slot started (pid ${livePid}).`;
    const record: ServiceHeartbeatRecord = {
      serviceId,
      status: serviceId === "temporal-worker" ? "stub" : "running",
      wiringStatus: serviceId === "temporal-worker" ? "stub" : "process-managed",
      pid: livePid,
      generationId,
      lastHeartbeatAt: new Date().toISOString(),
      detail,
      productionActivated: false,
    };
    heartbeats = upsertHeartbeat(heartbeats, record);
  }

  store.update((current) => ({
    ...current,
    heartbeats,
    hostLease: leaseResult.lease,
    updatedAt: new Date().toISOString(),
  }));

  let health = collectHealth(store, config, spawner);
  for (let attempt = 0; attempt < 40 && !managedSlotsReady(health); attempt += 1) {
    const hardFail = REQUIRED_READY.some((id) => {
      const svc = health.services.find((s) => s.serviceId === id);
      return svc?.status === "unhealthy";
    });
    if (hardFail) {
      break;
    }
    await new Promise((r) => setTimeout(r, 50));
    health = collectHealth(store, config, spawner);
  }

  if (!managedSlotsReady(health)) {
    await stopGeneration(store, config, spawner, generationId);
    return {
      ok: false,
      command: "start",
      message:
        "Start failed: required api/console slots unhealthy or not ready; partial children cleaned up.",
      productionActivated: false,
      health: collectHealth(store, config, spawner),
      heartbeats: store.read().heartbeats,
      stubs: stubsNote(),
    };
  }

  return {
    ok: true,
    command: "start",
    message: `Local operations started under host lease ${leaseResult.lease.leaseId}${leaseResult.reclaimed ? " (reclaimed)" : ""} generation=${generationId}.`,
    productionActivated: false,
    lease: store.read().hostLease ?? leaseResult.lease,
    health,
    heartbeats: store.read().heartbeats,
    stubs: stubsNote(),
  };
}

export async function runSupervisorCommand(
  command: SupervisorCommand,
  store: LocalStateStore,
  config: SupervisorConfig,
  spawner: ProcessSpawner,
): Promise<SupervisorResult> {
  switch (command) {
    case "start":
      return startAll(store, config, spawner);

    case "stop": {
      await stopAll(store, config, spawner);
      const health = collectHealth(store, config, spawner);
      return {
        ok: true,
        command: "stop",
        message: "Local operations stopped; host lease released when held by this supervisor.",
        productionActivated: false,
        lease: store.read().hostLease,
        health,
        heartbeats: store.read().heartbeats,
        stubs: stubsNote(),
      };
    }

    case "doctor":
    case "diagnostics": {
      const doctor = runDoctor(store, config, spawner);
      return {
        ok: doctor.ok,
        command,
        message: doctor.ok
          ? "Doctor completed — no failing checks."
          : "Doctor completed — one or more checks failed.",
        productionActivated: false,
        doctor,
        health: doctor.health,
        lease: store.read().hostLease,
        stubs: stubsNote(),
      };
    }

    case "health": {
      const health = collectHealth(store, config, spawner);
      return {
        ok: health.overall === "healthy" || health.overall === "stopped",
        command: "health",
        message: `Host health overall=${health.overall}`,
        productionActivated: false,
        health,
        lease: store.read().hostLease,
        heartbeats: health.services,
        stubs: stubsNote(),
      };
    }

    case "test-local": {
      const first = await startAll(store, config, spawner);
      if (!first.ok) {
        return { ...first, command: "test-local" };
      }
      await stopAll(store, config, spawner);
      const second = await startAll(store, config, spawner);
      const doctor = runDoctor(store, config, spawner);
      const result: SupervisorResult = {
        ok: second.ok && doctor.ok,
        command: "test-local",
        message: second.ok
          ? "Restart round-trip OK (start → stop → start); doctor attached."
          : "Restart round-trip failed.",
        productionActivated: false,
        doctor,
        stubs: stubsNote(),
      };
      if (second.lease !== undefined) {
        result.lease = second.lease;
      }
      if (second.health !== undefined) {
        result.health = second.health;
      }
      return result;
    }

    default: {
      const _exhaustive: never = command;
      return {
        ok: false,
        command: _exhaustive,
        message: `Unknown command`,
        productionActivated: false,
      };
    }
  }
}
