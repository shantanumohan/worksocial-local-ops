/**
 * Process slot runner for supervisor-managed local services.
 * - api / console: loopback HTTP /health (process-managed, not full product surfaces)
 * - temporal-worker: stub heartbeat only — Temporal is NOT_WIRED in R1-01
 * - Renews the host lease by generation so the CLI can exit after start
 */

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type ServiceId = "api" | "console" | "temporal-worker";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

const serviceId = (argValue("--service") ?? process.env.WORKSOCIAL_SERVICE_ID ?? "api") as ServiceId;
const stateDir = argValue("--state-dir") ?? process.env.WORKSOCIAL_STATE_DIR ?? ".worksocial/local-state";
const generationId =
  argValue("--generation") ?? process.env.WORKSOCIAL_GENERATION ?? `gen-${process.pid}`;
const hostId = argValue("--host-id") ?? process.env.WORKSOCIAL_HOST_ID ?? "local";
const leaseTtlMs = Number(
  argValue("--lease-ttl-ms") ?? process.env.WORKSOCIAL_LEASE_TTL_MS ?? 120_000,
);
const mode = argValue("--mode") ?? (serviceId === "temporal-worker" ? "stub" : "http-health");
const port = Number(argValue("--port") ?? (serviceId === "console" ? 8788 : 8787));

mkdirSync(stateDir, { recursive: true });

function writeHeartbeat(status: string, detail: string): void {
  const payload = {
    serviceId,
    status,
    wiringStatus: serviceId === "temporal-worker" ? "stub" : "process-managed",
    pid: process.pid,
    generationId,
    lastHeartbeatAt: new Date().toISOString(),
    detail,
    productionActivated: false as const,
  };
  writeFileSync(join(stateDir, `heartbeat-${serviceId}.json`), JSON.stringify(payload, null, 2), "utf8");
}

function renewLease(): void {
  const statePath = join(stateDir, "supervisor-state.json");
  if (!existsSync(statePath)) {
    return;
  }
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
    /* best-effort renewal */
  }
}

function tick(status: string, detail: string): void {
  writeHeartbeat(status, detail);
  renewLease();
}

let stopping = false;

function shutdown(signal: string): void {
  if (stopping) {
    return;
  }
  stopping = true;
  writeHeartbeat("stopped", `${serviceId} stopped after ${signal}.`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

if (mode === "stub" || serviceId === "temporal-worker") {
  tick(
    "stub",
    "Temporal worker slot is stub — Temporal runtime is NOT_WIRED in R1-01. Process is alive for lifecycle tests only.",
  );
  setInterval(() => {
    tick(
      "stub",
      "Temporal worker slot is stub — Temporal runtime is NOT_WIRED in R1-01.",
    );
  }, 2_000);
} else {
  const server = createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const body = JSON.stringify({
        serviceId,
        status: "running",
        generationId,
        productionActivated: false,
        message:
          serviceId === "api"
            ? "API process slot health OK (minimal R1-01 surface; not full identity/commands)."
            : "Console process slot health OK (minimal R1-01 surface; not full React routes).",
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });

  server.listen(port, "127.0.0.1", () => {
    tick("running", `${serviceId} listening on 127.0.0.1:${port}`);
  });

  server.on("error", (err) => {
    tick("unhealthy", `${serviceId} failed to listen: ${(err as Error).message}`);
    process.exit(1);
  });

  // Keep referenced so hung detection relies on heartbeat age, not process exit.
  setInterval(() => {
    tick("running", `${serviceId} listening on 127.0.0.1:${port}`);
  }, 2_000);
}
