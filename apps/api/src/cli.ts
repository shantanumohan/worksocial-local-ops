/**
 * Supervisor-managed API process slot with R1-02 identity/authority HTTP.
 */

import { resolveWorkSocialStateDir } from "@worksocial/persistence";
import { startApiServer } from "./server.js";
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
const port = Number(argValue("--port") ?? process.env.WORKSOCIAL_API_PORT ?? 8787);
const consolePort = Number(
  process.env.WORKSOCIAL_CONSOLE_PORT ?? 8788,
);

const heartbeat = {
  serviceId: "api" as const,
  stateDir,
  generationId,
  hostId,
  leaseTtlMs,
  wiringStatus: "identity-wired" as const,
};

async function main(): Promise<void> {
  const { server, temporalEnqueueStatus } = await startApiServer({
    stateDir,
    port,
    consolePort,
    ...(process.env.WORKSOCIAL_OWNER_PASSWORD
      ? { ownerPassword: process.env.WORKSOCIAL_OWNER_PASSWORD }
      : {}),
  });

  let stopping = false;
  function shutdown(signal: string): void {
    if (stopping) {
      return;
    }
    stopping = true;
    writeServiceHeartbeat(heartbeat, "stopped", `api stopped after ${signal}`);
    server.close(() => process.exit(0));
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  server.listen(port, "127.0.0.1", () => {
    startHeartbeatLoop(
      heartbeat,
      `api identity/authority listening on 127.0.0.1:${port}; mission enqueue=${temporalEnqueueStatus}`,
    );
  });

  server.on("error", (err) => {
    writeServiceHeartbeat(
      heartbeat,
      "unhealthy",
      `api failed to listen: ${(err as Error).message}`,
    );
    process.exit(1);
  });
}

main().catch((err) => {
  writeServiceHeartbeat(
    heartbeat,
    "unhealthy",
    `api failed to start: ${(err as Error).message}`,
  );
  process.exit(1);
});
