/**
 * Process slot runner for supervisor-managed local services.
 * - api / console: loopback HTTP /health (process-managed, not full product surfaces)
 * - temporal-worker: stub heartbeat only — Temporal is NOT_WIRED in R1-01
 */

import { createServer } from "node:http";
import { mkdirSync, writeFileSync } from "node:fs";
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
const mode = argValue("--mode") ?? (serviceId === "temporal-worker" ? "stub" : "http-health");
const port = Number(argValue("--port") ?? (serviceId === "console" ? 8788 : 8787));

mkdirSync(stateDir, { recursive: true });

function writeHeartbeat(status: string, detail: string): void {
  const payload = {
    serviceId,
    status,
    wiringStatus: serviceId === "temporal-worker" ? "stub" : "process-managed",
    pid: process.pid,
    lastHeartbeatAt: new Date().toISOString(),
    detail,
    productionActivated: false as const,
  };
  writeFileSync(join(stateDir, `heartbeat-${serviceId}.json`), JSON.stringify(payload, null, 2), "utf8");
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
  writeHeartbeat(
    "stub",
    "Temporal worker slot is stub — Temporal runtime is NOT_WIRED in R1-01. Process is alive for lifecycle tests only.",
  );
  // Keep a referenced timer so the stub slot process stays alive until SIGTERM.
  setInterval(() => {
    writeHeartbeat(
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
    writeHeartbeat("running", `${serviceId} listening on 127.0.0.1:${port}`);
  });

  setInterval(() => {
    writeHeartbeat("running", `${serviceId} listening on 127.0.0.1:${port}`);
  }, 2_000).unref?.();
}
