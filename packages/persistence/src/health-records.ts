/**
 * Service heartbeat / health records for local process slots.
 * Status labels stay honest: stub / NOT_WIRED ≠ verified.
 */

export type ServiceSlotId = "api" | "console" | "temporal-worker";

export type ServiceWiringStatus =
  | "process-managed"
  | "identity-wired"
  | "stub"
  | "NOT_WIRED"
  | "temporal-wired";

export type ServiceHealthStatus =
  | "stopped"
  | "starting"
  | "running"
  | "unhealthy"
  | "stub"
  | "NOT_RUN";

export type ServiceHeartbeatRecord = {
  serviceId: ServiceSlotId;
  status: ServiceHealthStatus;
  wiringStatus: ServiceWiringStatus;
  pid: number | null;
  /** Start-generation token; used to verify PID ownership before kill. */
  generationId: string | null;
  lastHeartbeatAt: string | null;
  detail: string;
  productionActivated: false;
};

export type HostHealthSnapshot = {
  hostId: string;
  checkedAt: string;
  leaseHeld: boolean;
  services: ServiceHeartbeatRecord[];
  overall: "healthy" | "degraded" | "stopped" | "unconfigured";
  productionActivated: false;
};

export const DEFAULT_SERVICE_SLOTS: readonly ServiceSlotId[] = [
  "api",
  "console",
  "temporal-worker",
] as const;

/** Heartbeats older than this are treated as unhealthy (hung event loop). */
export const DEFAULT_HEARTBEAT_STALE_MS = 10_000;

export function defaultHeartbeat(
  serviceId: ServiceSlotId,
  nowIso: string | null = null,
): ServiceHeartbeatRecord {
  const wiringStatus: ServiceWiringStatus =
    serviceId === "temporal-worker" ? "stub" : "process-managed";
  const status: ServiceHealthStatus =
    serviceId === "temporal-worker" ? "stub" : "stopped";
  return {
    serviceId,
    status,
    wiringStatus,
    pid: null,
    generationId: null,
    lastHeartbeatAt: nowIso,
    detail:
      serviceId === "temporal-worker"
        ? "Temporal worker slot is a stub process — Temporal is NOT_WIRED in R1-01."
        : `${serviceId} process slot is stopped.`,
    productionActivated: false,
  };
}

export function isHeartbeatStale(
  lastHeartbeatAt: string | null,
  nowMs: number,
  staleMs: number = DEFAULT_HEARTBEAT_STALE_MS,
): boolean {
  if (!lastHeartbeatAt) {
    return true;
  }
  const then = Date.parse(lastHeartbeatAt);
  if (!Number.isFinite(then)) {
    return true;
  }
  return nowMs - then > staleMs;
}

export function summarizeHostHealth(
  hostId: string,
  services: ServiceHeartbeatRecord[],
  leaseHeld: boolean,
  checkedAt: string,
): HostHealthSnapshot {
  const managed = services.filter((s) => s.wiringStatus === "process-managed");
  const anyRunning = managed.some((s) => s.status === "running");
  const anyUnhealthy = managed.some((s) => s.status === "unhealthy");
  const allStopped = managed.every((s) => s.status === "stopped" || s.status === "NOT_RUN");

  let overall: HostHealthSnapshot["overall"];
  if (!leaseHeld && allStopped) {
    overall = "stopped";
  } else if (anyUnhealthy || (leaseHeld && !anyRunning && !allStopped)) {
    overall = "degraded";
  } else if (anyRunning) {
    overall = "healthy";
  } else if (allStopped) {
    overall = "stopped";
  } else {
    overall = "unconfigured";
  }

  return {
    hostId,
    checkedAt,
    leaseHeld,
    services,
    overall,
    productionActivated: false,
  };
}
