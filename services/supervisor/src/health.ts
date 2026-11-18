import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_SERVICE_SLOTS,
  defaultHeartbeat,
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
): ReturnType<typeof summarizeHostHealth> {
  const state = store.read();
  const nowMs = Date.parse(nowIso);
  const leaseHeld = Boolean(
    state.hostLease && !isLeaseExpired(state.hostLease, Number.isFinite(nowMs) ? nowMs : Date.now()),
  );

  const services: ServiceHeartbeatRecord[] = DEFAULT_SERVICE_SLOTS.map((serviceId) => {
    const fromState =
      state.heartbeats.find((h) => h.serviceId === serviceId) ?? defaultHeartbeat(serviceId);

    // Prefer supervisor state when it already records a clean stop.
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

    return {
      ...base,
      productionActivated: false as const,
    };
  });

  return summarizeHostHealth(config.hostId, services, leaseHeld, nowIso);
}
