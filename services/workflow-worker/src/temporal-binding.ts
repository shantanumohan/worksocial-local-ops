/**
 * Temporal self-host binding probe (NEXT-10 / Temporal wiring slice).
 *
 * Labels stay honest:
 * - NOT_WIRED — no address, or address set but connection failed / SDK unreachable
 * - READY_TO_BIND — address + SDK present, connection not yet proven
 * - TEMPORAL — SDK connected to a reachable Temporal frontend
 * - LOCAL_DURABLE / FIXTURE — explicit non-cluster paths
 *
 * External effects: none. Live CMS/Zoho/GSC stay NOT_WIRED elsewhere.
 */

export type TemporalBindingStatus =
  | "NOT_WIRED"
  | "LOCAL_DURABLE"
  | "FIXTURE"
  | "READY_TO_BIND"
  | "TEMPORAL";

export type TemporalSdkDependency = "NOT_PRESENT" | "PRESENT";

export type TemporalBindingReport = {
  status: TemporalBindingStatus;
  address: string | null;
  namespace: string | null;
  detail: string;
  blockers: string[];
  sdkDependency: TemporalSdkDependency;
  productionActivated: false;
};

export const TEMPORAL_TASK_QUEUE = "worksocial-missions";

/**
 * Sync SDK presence check. @temporalio/client is a hard dependency of this
 * package; always PRESENT after the Temporal wiring slice.
 */
export function temporalSdkPresent(): boolean {
  return true;
}

/**
 * Resolve Temporal wiring from environment without contacting a cluster.
 * READY_TO_BIND means address + SDK are configured; call probeTemporalConnection
 * to upgrade to TEMPORAL.
 */
export function probeTemporalBinding(
  env: NodeJS.ProcessEnv = process.env,
): TemporalBindingReport {
  const address = env.TEMPORAL_ADDRESS?.trim() || null;
  const namespace = env.TEMPORAL_NAMESPACE?.trim() || "default";
  const sdkDependency: TemporalSdkDependency = temporalSdkPresent()
    ? "PRESENT"
    : "NOT_PRESENT";

  if (!address) {
    return {
      status: "NOT_WIRED",
      address: null,
      namespace: null,
      detail:
        "TEMPORAL_ADDRESS unset. Mission durability uses Postgres LOCAL_DURABLE (enqueue, leases, effect boundaries, review wait). Temporal cluster remains NOT_WIRED.",
      blockers: [
        "Set TEMPORAL_ADDRESS (host:port) for a self-hosted Temporal frontend",
        "Run deploy/temporal/docker-compose.yml (temporalio/auto-setup) or a local test server",
        "Start the temporal-worker slot so it polls worksocial-missions",
      ],
      sdkDependency,
      productionActivated: false,
    };
  }

  if (sdkDependency === "NOT_PRESENT") {
    return {
      status: "READY_TO_BIND",
      address,
      namespace,
      detail:
        "TEMPORAL_ADDRESS is set, but the Temporal SDK is not present. Treat as NOT_WIRED for runtime.",
      blockers: [
        "Package @temporalio/client and @temporalio/worker",
        "Implement worker that hosts mission workflows/activities",
      ],
      sdkDependency,
      productionActivated: false,
    };
  }

  return {
    status: "READY_TO_BIND",
    address,
    namespace,
    detail:
      "TEMPORAL_ADDRESS and Temporal SDK are present. Connection probe not yet successful — runtime label stays NOT_WIRED until probeTemporalConnection succeeds.",
    blockers: [
      "Reach Temporal frontend at TEMPORAL_ADDRESS",
      "Start temporal-worker against task queue worksocial-missions",
      "Prove crash/restart with Temporal history (see temporal-mission tests)",
    ],
    sdkDependency,
    productionActivated: false,
  };
}

/**
 * Attempt a real Temporal frontend connection. On success status is TEMPORAL.
 * Never throws — failures remain NOT_WIRED / READY_TO_BIND with blockers.
 */
export async function probeTemporalConnection(
  env: NodeJS.ProcessEnv = process.env,
  options?: { timeoutMs?: number },
): Promise<TemporalBindingReport> {
  const base = probeTemporalBinding(env);
  if (!base.address || base.sdkDependency !== "PRESENT") {
    return base;
  }

  const timeoutMs = options?.timeoutMs ?? 3_000;
  try {
    const { Connection } = await import("@temporalio/client");
    const connection = await Connection.connect({
      address: base.address,
      connectTimeout: timeoutMs,
    });
    // Connection.connect dials the frontend; close promptly after reachability.
    await connection.close();
    return {
      status: "TEMPORAL",
      address: base.address,
      namespace: base.namespace,
      detail: `Temporal frontend reachable at ${base.address} (namespace ${base.namespace}). SDK PRESENT. Local durable mission workflows may use task queue ${TEMPORAL_TASK_QUEUE}. Live CMS/Zoho/GSC remain NOT_WIRED.`,
      blockers: [],
      sdkDependency: "PRESENT",
      productionActivated: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "READY_TO_BIND",
      address: base.address,
      namespace: base.namespace,
      detail: `TEMPORAL_ADDRESS set and SDK present, but frontend unreachable: ${message}`,
      blockers: [
        `Start Temporal at ${base.address} (see deploy/temporal/docker-compose.yml)`,
        "Or unset TEMPORAL_ADDRESS to stay on LOCAL_DURABLE / NOT_WIRED honesty",
      ],
      sdkDependency: "PRESENT",
      productionActivated: false,
    };
  }
}

/** Runtime label used by mission enqueue / role-runtime honesty. */
export function runtimeTemporalLabel(
  report: TemporalBindingReport,
): "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE" | "TEMPORAL" {
  if (report.status === "FIXTURE") return "FIXTURE";
  if (report.status === "LOCAL_DURABLE") return "LOCAL_DURABLE";
  if (report.status === "TEMPORAL") return "TEMPORAL";
  // READY_TO_BIND without a successful connection stays NOT_WIRED.
  return "NOT_WIRED";
}
