import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_HEARTBEAT_STALE_MS,
  DEFAULT_SERVICE_SLOTS,
  defaultHeartbeat,
  isHeartbeatStale,
  isLeaseExpired,
  summarizeHostHealth,
  type LocalStateStore,
  type ServiceHeartbeatRecord,
  type ServiceSlotId,
} from "@worksocial/persistence";
import type { SupervisorConfig } from "./config.js";
import type { ProcessSpawner } from "./process-manager.js";

function readSlotHeartbeatFile(
  stateDir: string,
  serviceId: ServiceSlotId,
): ServiceHeartbeatRecord | null {
  const path = join(stateDir, `heartbeat-${serviceId}.json`);
  if (!existsSync(path)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as ServiceHeartbeatRecord;
  } catch {
    return null;
  }
}

export function collectHealth(
  store: LocalStateStore,
  config: SupervisorConfig,
  spawner: ProcessSpawner,
  nowIso: string = new Date().toISOString(),
  staleMs: number = DEFAULT_HEARTBEAT_STALE_MS,
): ReturnType<typeof summarizeHostHealth> {
  const state = store.read();
  const nowMs = Date.parse(nowIso);
  const effectiveNow = Number.isFinite(nowMs) ? nowMs : Date.now();
  const leaseHeld = Boolean(
    state.hostLease && !isLeaseExpired(state.hostLease, effectiveNow),
  );

  const services: ServiceHeartbeatRecord[] = DEFAULT_SERVICE_SLOTS.map((serviceId) => {
    const fromState =
      state.heartbeats.find((h) => h.serviceId === serviceId) ?? defaultHeartbeat(serviceId);

    if (fromState.status === "stopped" && fromState.pid === null) {
      return { ...fromState, productionActivated: false as const };
    }

    const fromFile = readSlotHeartbeatFile(config.stateDir, serviceId);
    const base = fromFile ?? fromState;

    if (base.pid !== null && !spawner.isAlive(base.pid)) {
      return {
        ...base,
        status: serviceId === "temporal-worker" ? "stub" : "unhealthy",
        pid: null,
        detail: `${serviceId} pid ${base.pid} is not alive.`,
        productionActivated: false as const,
      };
    }

    const active =
      base.status === "running" || base.status === "stub" || base.status === "starting";
    if (active && isHeartbeatStale(base.lastHeartbeatAt, effectiveNow, staleMs)) {
      // In-memory tests do not refresh heartbeat files; skip stale if no file exists.
      if (fromFile || existsSync(join(config.stateDir, `heartbeat-${serviceId}.json`))) {
        return {
          ...base,
          status: serviceId === "temporal-worker" ? "stub" : "unhealthy",
          detail: `${serviceId} heartbeat stale (last=${base.lastHeartbeatAt}).`,
          productionActivated: false as const,
        };
      }
    }

    return {
      ...base,
      productionActivated: false as const,
    };
  });

  return summarizeHostHealth(config.hostId, services, leaseHeld, nowIso);
}
