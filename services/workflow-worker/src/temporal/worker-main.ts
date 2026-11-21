/**
 * Process entry for the supervisor temporal-worker slot when TEMPORAL_ADDRESS is set.
 * Writes heartbeats and runs a Temporal worker against worksocial-missions.
 * External effects: none (simulator durable path only).
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createMemoryDurableMissionRuntime,
} from "../durable-mission.js";
import { probeTemporalConnection } from "../temporal-binding.js";
import { createTemporalMissionWorker } from "./worker.js";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

const stateDir =
  argValue("--state-dir") ?? process.env.WORKSOCIAL_STATE_DIR ?? ".worksocial/local-state";
const generationId =
  argValue("--generation") ?? process.env.WORKSOCIAL_GENERATION ?? `gen-${process.pid}`;
const hostId = argValue("--host-id") ?? process.env.WORKSOCIAL_HOST_ID ?? "local";
const leaseTtlMs = Number(
  argValue("--lease-ttl-ms") ?? process.env.WORKSOCIAL_LEASE_TTL_MS ?? 120_000,
);
const address = process.env.TEMPORAL_ADDRESS?.trim();
const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || "default";

mkdirSync(stateDir, { recursive: true });

function writeHeartbeat(
  status: string,
  wiringStatus: string,
  detail: string,
): void {
  const payload = {
    serviceId: "temporal-worker",
    status,
    wiringStatus,
    pid: process.pid,
    generationId,
    lastHeartbeatAt: new Date().toISOString(),
    detail,
    productionActivated: false as const,
  };
  writeFileSync(
    join(stateDir, "heartbeat-temporal-worker.json"),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

function renewLease(): void {
  const statePath = join(stateDir, "supervisor-state.json");
  if (!existsSync(statePath)) return;
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {
      hostLease?: {
        leaseId: string;
        hostId: string;
        generationId: string;
        holderPid: number;
        acquiredAt: string;
        renewedAt: string;
        expiresAt: string;
        scope: "local-singleton";
      } | null;
      [key: string]: unknown;
    };
    const lease = state.hostLease;
    if (!lease || lease.generationId !== generationId || lease.hostId !== hostId) {
      return;
    }
    const now = Date.now();
    state.hostLease = {
      ...lease,
      holderPid: process.pid,
      renewedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + leaseTtlMs).toISOString(),
    };
    state.updatedAt = new Date(now).toISOString();
    const tmp = `${statePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, statePath);
  } catch {
    /* best-effort */
  }
}

function tick(status: string, wiringStatus: string, detail: string): void {
  writeHeartbeat(status, wiringStatus, detail);
  renewLease();
}

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) return;
  stopping = true;
  tick("stopped", "temporal-wired", `temporal-worker stopped after ${signal}.`);
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

async function main(): Promise<void> {
  if (!address) {
    tick(
      "stub",
      "stub",
      "TEMPORAL_ADDRESS unset — temporal-worker refuses TEMPORAL mode; use stub slot.",
    );
    process.exit(1);
  }

  tick(
    "starting",
    "temporal-wired",
    `Connecting Temporal worker to ${address} (ns=${namespace})…`,
  );

  const probe = await probeTemporalConnection(process.env, { timeoutMs: 5_000 });
  if (probe.status !== "TEMPORAL") {
    tick(
      "unhealthy",
      "NOT_WIRED",
      probe.detail,
    );
    process.exit(1);
  }

  const runtime = createMemoryDurableMissionRuntime({
    temporalLabelOverride: "TEMPORAL",
  });
  const worker = await createTemporalMissionWorker({
    address,
    namespace,
    runtime,
  });

  tick(
    "running",
    "temporal-wired",
    `Temporal worker polling ${address} ns=${namespace} queue=worksocial-missions. External effects NONE.`,
  );
  setInterval(() => {
    tick(
      "running",
      "temporal-wired",
      `Temporal worker alive at ${address} (ns=${namespace}).`,
    );
  }, 2_000);

  await worker.run();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  tick("unhealthy", "NOT_WIRED", `Temporal worker failed: ${message}`);
  process.exit(1);
});
