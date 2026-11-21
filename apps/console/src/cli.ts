/**
 * Supervisor-managed console process slot — login + authority view (R1-02).
 */

import { resolveWorkSocialStateDir } from "@worksocial/persistence";
import { startConsoleServer } from "./server.js";
import { startHeartbeatLoop, writeServiceHeartbeat } from "./slot-heartbeat.js";

function argValue(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return undefined;
  }
  return process.argv[idx + 1];
}

const stateDir =
  argValue("--state-dir") ?? process.env.WORKSOCIAL_STATE_DIR ?? resolveWorkSocialStateDir();
const generationId =
  argValue("--generation") ?? process.env.WORKSOCIAL_GENERATION ?? `gen-${process.pid}`;
const hostId = argValue("--host-id") ?? process.env.WORKSOCIAL_HOST_ID ?? "local";
const leaseTtlMs = Number(
  argValue("--lease-ttl-ms") ?? process.env.WORKSOCIAL_LEASE_TTL_MS ?? 120_000,
);
const port = Number(argValue("--port") ?? process.env.WORKSOCIAL_CONSOLE_PORT ?? 8788);
const apiPort = Number(process.env.WORKSOCIAL_API_PORT ?? 8787);
const apiOrigin = `http://127.0.0.1:${apiPort}`;

const heartbeat = {
  serviceId: "console" as const,
  stateDir,
  generationId,
  hostId,
  leaseTtlMs,
  wiringStatus: "identity-wired" as const,
};

const server = startConsoleServer({ port, apiOrigin });

let stopping = false;
function shutdown(signal: string): void {
  if (stopping) {
    return;
  }
  stopping = true;
  writeServiceHeartbeat(heartbeat, "stopped", `console stopped after ${signal}`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

server.listen(port, "127.0.0.1", () => {
  startHeartbeatLoop(
    heartbeat,
    `console login/authority listening on 127.0.0.1:${port}`,
  );
});

server.on("error", (err) => {
  writeServiceHeartbeat(
    heartbeat,
    "unhealthy",
    `console failed to listen: ${(err as Error).message}`,
  );
  process.exit(1);
});
