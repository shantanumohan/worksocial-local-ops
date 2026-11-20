/**
 * Temporal self-host binding probe (NEXT-10).
 *
 * A live Temporal cluster is NOT_WIRED on the local host until
 * TEMPORAL_ADDRESS is set AND a successful connection probe is recorded.
 * Until then, durable mission semantics run via Postgres LOCAL_DURABLE.
 *
 * External effects: none. No Temporal SDK dependency in this slice — binding
 * is environment + documentation gated so we do not claim a wired cluster.
 */

export type TemporalBindingStatus =
  | "NOT_WIRED"
  | "LOCAL_DURABLE"
  | "FIXTURE"
  | "READY_TO_BIND";

export type TemporalBindingReport = {
  status: TemporalBindingStatus;
  address: string | null;
  namespace: string | null;
  detail: string;
  blockers: string[];
  sdkDependency: "NOT_PRESENT";
  productionActivated: false;
};

/**
 * Resolve Temporal wiring from environment without contacting a cluster.
 * READY_TO_BIND means address is configured but SDK/worker are not yet shipped.
 */
export function probeTemporalBinding(
  env: NodeJS.ProcessEnv = process.env,
): TemporalBindingReport {
  const address = env.TEMPORAL_ADDRESS?.trim() || null;
  const namespace = env.TEMPORAL_NAMESPACE?.trim() || "default";

  if (!address) {
    return {
      status: "NOT_WIRED",
      address: null,
      namespace: null,
      detail:
        "TEMPORAL_ADDRESS unset. Mission durability uses Postgres LOCAL_DURABLE (enqueue, leases, effect boundaries, review wait). Temporal cluster remains NOT_WIRED.",
      blockers: [
        "Set TEMPORAL_ADDRESS (host:port) for a self-hosted Temporal frontend",
        "Add @temporalio/client + @temporalio/worker and a worker process",
        "Point task queue + namespace; prove crash/restart with Temporal history",
      ],
      sdkDependency: "NOT_PRESENT",
      productionActivated: false,
    };
  }

  return {
    status: "READY_TO_BIND",
    address,
    namespace,
    detail:
      "TEMPORAL_ADDRESS is set, but the Temporal SDK/worker are not packaged in this slice. Treat as NOT_WIRED for runtime; continue with LOCAL_DURABLE Postgres workflows until the SDK bind PR lands.",
    blockers: [
      "Package @temporalio/client and @temporalio/worker",
      "Implement worker that hosts mission workflows/activities",
      "CI Temporal auto-setup service + history replay tests",
      "Do not flip console temporalWiring away from NOT_WIRED until probe succeeds",
    ],
    sdkDependency: "NOT_PRESENT",
    productionActivated: false,
  };
}

/** Runtime label used by mission enqueue / role-runtime honesty. */
export function runtimeTemporalLabel(
  report: TemporalBindingReport,
): "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE" {
  if (report.status === "FIXTURE") return "FIXTURE";
  if (report.status === "LOCAL_DURABLE") return "LOCAL_DURABLE";
  // READY_TO_BIND still reports NOT_WIRED until SDK actually connects.
  return "NOT_WIRED";
}
