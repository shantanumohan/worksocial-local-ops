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

export type HostComponentStatus = "up" | "down" | "degraded" | "stub" | "NOT_WIRED";

/**
 * Plane-separated health so "host up" is not confused with Temporal / API / console.
 */
export type HostHealthComponents = {
  host: {
    status: HostComponentStatus;
    leaseHeld: boolean;
    detail: string;
  };
  api: {
    status: HostComponentStatus;
    wiringStatus: ServiceWiringStatus;
    detail: string;
  };
  console: {
    status: HostComponentStatus;
    wiringStatus: ServiceWiringStatus;
    detail: string;
  };
  temporal: {
    status: HostComponentStatus;
    wiringStatus: ServiceWiringStatus;
    detail: string;
  };
};

export type HostHealthSnapshot = {
  hostId: string;
  checkedAt: string;
  leaseHeld: boolean;
  services: ServiceHeartbeatRecord[];
  /** Distinct planes: host lease vs api vs console vs Temporal worker. */
  components: HostHealthComponents;
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
        ? "Temporal worker slot defaults to stub until TEMPORAL_ADDRESS binds a real worker (then wiringStatus becomes temporal-wired)."
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

function serviceToComponentStatus(
  service: ServiceHeartbeatRecord | undefined,
  kind: "api" | "console" | "temporal",
): HostHealthComponents["api"] {
  if (!service) {
    return {
      status: kind === "temporal" ? "NOT_WIRED" : "down",
      wiringStatus: kind === "temporal" ? "stub" : "process-managed",
      detail: `${kind} heartbeat missing.`,
    };
  }

  if (kind === "temporal") {
    const wired =
      service.wiringStatus === "temporal-wired" &&
      (service.status === "running" || service.status === "starting");
    if (wired) {
      return {
        status: service.status === "unhealthy" ? "degraded" : "up",
        wiringStatus: service.wiringStatus,
        detail: service.detail,
      };
    }
    return {
      status: service.status === "unhealthy" ? "degraded" : "stub",
      wiringStatus: service.wiringStatus === "temporal-wired" ? "temporal-wired" : "stub",
      detail:
        service.detail ||
        "Temporal worker slot is stub / NOT_WIRED until TEMPORAL_ADDRESS + reachable frontend.",
    };
  }

  if (service.status === "running" || service.status === "starting") {
    return {
      status: "up",
      wiringStatus: service.wiringStatus,
      detail: service.detail,
    };
  }
  if (service.status === "unhealthy") {
    return {
      status: "degraded",
      wiringStatus: service.wiringStatus,
      detail: service.detail,
    };
  }
  if (service.status === "stopped" || service.status === "NOT_RUN") {
    return {
      status: "down",
      wiringStatus: service.wiringStatus,
      detail: service.detail,
    };
  }
  return {
    status: "stub",
    wiringStatus: service.wiringStatus,
    detail: service.detail,
  };
}

export function buildHostHealthComponents(
  services: ServiceHeartbeatRecord[],
  leaseHeld: boolean,
): HostHealthComponents {
  const api = services.find((s) => s.serviceId === "api");
  const consoleSvc = services.find((s) => s.serviceId === "console");
  const temporal = services.find((s) => s.serviceId === "temporal-worker");

  return {
    host: {
      status: leaseHeld ? "up" : "down",
      leaseHeld,
      detail: leaseHeld
        ? "Host lease held — supervisor control plane can manage local slots."
        : "No active host lease (local slots stopped or lease expired).",
    },
    api: serviceToComponentStatus(api, "api"),
    console: serviceToComponentStatus(consoleSvc, "console"),
    temporal: serviceToComponentStatus(temporal, "temporal"),
  };
}

export function summarizeHostHealth(
  hostId: string,
  services: ServiceHeartbeatRecord[],
  leaseHeld: boolean,
  checkedAt: string,
): HostHealthSnapshot {
  const managed = services.filter(
    (s) => s.wiringStatus === "process-managed" || s.wiringStatus === "identity-wired",
  );
  const anyRunning = managed.some((s) => s.status === "running");
  const anyUnhealthy = managed.some((s) => s.status === "unhealthy");
  const allStopped = managed.every((s) => s.status === "stopped" || s.status === "NOT_RUN");
  const components = buildHostHealthComponents(services, leaseHeld);

  let overall: HostHealthSnapshot["overall"];
  if (!leaseHeld && allStopped) {
    overall = "stopped";
  } else if (anyUnhealthy || (leaseHeld && !anyRunning && !allStopped)) {
    overall = "degraded";
  } else if (anyRunning && leaseHeld) {
    // Running slots without an active host lease are degraded — recover should restart.
    overall = "healthy";
  } else if (anyRunning && !leaseHeld) {
    overall = "degraded";
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
    components,
    overall,
    productionActivated: false,
  };
}
