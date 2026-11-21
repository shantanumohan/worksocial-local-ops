import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  composeOwnershipProbes,
  createHeartbeatFileOwnershipProbe,
  defaultOwnershipProbe,
  verifyProcessOwnership,
  type ProcessOwnershipProbe,
  type ServiceSlotId,
} from "@worksocial/persistence";
import type { ManagedProcessInfo } from "./types.js";
import type { SupervisorConfig } from "./config.js";

export type SpawnRequest = {
  serviceId: ServiceSlotId;
  config: SupervisorConfig;
  generationId: string;
  hostId: string;
  leaseTtlMs: number;
};

export type SpawnedSlot = {
  info: ManagedProcessInfo;
  child: ChildProcess;
};

export type StopTarget = {
  pid: number;
  serviceId: ServiceSlotId;
  generationId: string;
};

export type ProcessSpawner = {
  start(request: SpawnRequest): SpawnedSlot;
  /** Stop only when ownership of the PID is verified (or in-memory map confirms). */
  stopOwned(target: StopTarget, signal?: NodeJS.Signals): Promise<"stopped" | "skipped">;
  isAlive(pid: number): boolean;
};

function heartbeatSlotScript(repoRoot: string): string {
  return join(repoRoot, "services/supervisor/src/slots/heartbeat-slot.ts");
}

function temporalWorkerScript(repoRoot: string): string {
  return join(repoRoot, "services/workflow-worker/src/temporal/worker-main.ts");
}

function temporalAddressConfigured(): boolean {
  return Boolean(process.env.TEMPORAL_ADDRESS?.trim());
}

function apiCliScript(repoRoot: string): string {
  return join(repoRoot, "apps/api/src/cli.ts");
}

function consoleCliScript(repoRoot: string): string {
  return join(repoRoot, "apps/console/src/cli.ts");
}

function slotEntrypoint(repoRoot: string, serviceId: ServiceSlotId): string {
  if (serviceId === "api") {
    return apiCliScript(repoRoot);
  }
  if (serviceId === "console") {
    return consoleCliScript(repoRoot);
  }
  if (serviceId === "temporal-worker" && temporalAddressConfigured()) {
    return temporalWorkerScript(repoRoot);
  }
  return heartbeatSlotScript(repoRoot);
}

function resolveTsx(repoRoot: string): string {
  const local = join(repoRoot, "node_modules", ".bin", "tsx");
  if (existsSync(local)) {
    return local;
  }
  return "tsx";
}

function buildArgs(request: SpawnRequest): string[] {
  const { serviceId, config, generationId, hostId, leaseTtlMs } = request;
  const entry = slotEntrypoint(config.repoRoot, serviceId);

  if (serviceId === "api") {
    return [
      entry,
      "--state-dir",
      config.stateDir,
      "--generation",
      generationId,
      "--host-id",
      hostId,
      "--lease-ttl-ms",
      String(leaseTtlMs),
      "--port",
      String(config.apiPort),
    ];
  }

  if (serviceId === "console") {
    return [
      entry,
      "--state-dir",
      config.stateDir,
      "--generation",
      generationId,
      "--host-id",
      hostId,
      "--lease-ttl-ms",
      String(leaseTtlMs),
      "--port",
      String(config.consolePort),
    ];
  }

  if (serviceId === "temporal-worker" && temporalAddressConfigured()) {
    return [
      entry,
      "--state-dir",
      config.stateDir,
      "--generation",
      generationId,
      "--host-id",
      hostId,
      "--lease-ttl-ms",
      String(leaseTtlMs),
    ];
  }

  return [
    entry,
    "--service",
    serviceId,
    "--state-dir",
    config.stateDir,
    "--generation",
    generationId,
    "--host-id",
    hostId,
    "--lease-ttl-ms",
    String(leaseTtlMs),
    "--mode",
    "stub",
  ];
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function signalAndWait(pid: number, signal: NodeJS.Signals): Promise<void> {
  try {
    process.kill(pid, signal);
  } catch {
    return;
  }
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

/**
 * Default spawner: detached child processes (survive VS Code/terminal close).
 * API/console expose loopback health HTTP.
 * temporal-worker is a stub unless TEMPORAL_ADDRESS is set (then real Temporal worker).
 *
 * Ownership: Linux /proc preferred; heartbeat-file fallback when stateDir is provided
 * (needed on hosts without /proc so stop/recover remains possible).
 */
export function createChildProcessSpawner(
  ownershipProbeOrStateDir?: ProcessOwnershipProbe | string,
): ProcessSpawner {
  const ownershipProbe: ProcessOwnershipProbe =
    typeof ownershipProbeOrStateDir === "string"
      ? composeOwnershipProbes(
          defaultOwnershipProbe(),
          createHeartbeatFileOwnershipProbe(ownershipProbeOrStateDir),
        )
      : (ownershipProbeOrStateDir ?? defaultOwnershipProbe());

  return {
    start(request) {
      const entry = slotEntrypoint(request.config.repoRoot, request.serviceId);
      if (!existsSync(entry)) {
        throw new Error(`Missing slot runner script for ${request.serviceId}: ${entry}`);
      }
      const tsxPath = resolveTsx(request.config.repoRoot);
      const args = buildArgs(request);
      const child = spawn(tsxPath, args, {
        cwd: request.config.repoRoot,
        env: {
          ...process.env,
          WORKSOCIAL_SERVICE_ID: request.serviceId,
          WORKSOCIAL_STATE_DIR: request.config.stateDir,
          WORKSOCIAL_GENERATION: request.generationId,
          WORKSOCIAL_HOST_ID: request.hostId,
          WORKSOCIAL_LEASE_TTL_MS: String(request.leaseTtlMs),
          WORKSOCIAL_API_PORT: String(request.config.apiPort),
          WORKSOCIAL_CONSOLE_PORT: String(request.config.consolePort),
        },
        stdio: "ignore",
        detached: true,
      });

      if (child.pid === undefined) {
        throw new Error(`Failed to spawn ${request.serviceId}`);
      }

      // Allow the parent CLI/task to exit without waiting on slots.
      child.unref();

      const info: ManagedProcessInfo = {
        serviceId: request.serviceId,
        pid: child.pid,
        startedAt: new Date().toISOString(),
        command: tsxPath,
        args,
      };

      return { info, child };
    },

    async stopOwned(target, signal = "SIGTERM") {
      if (!isProcessAlive(target.pid)) {
        return "skipped";
      }
      const owned = verifyProcessOwnership(
        {
          pid: target.pid,
          serviceId: target.serviceId,
          generationId: target.generationId,
        },
        ownershipProbe,
      );
      if (!owned) {
        return "skipped";
      }
      await signalAndWait(target.pid, signal);
      return "stopped";
    },

    isAlive(pid) {
      return isProcessAlive(pid);
    },
  };
}

/**
 * In-memory spawner for unit tests (no real OS processes).
 */
export function createInMemorySpawner(): ProcessSpawner & {
  running: Map<number, { serviceId: ServiceSlotId; generationId: string }>;
  nextPid: number;
} {
  const running = new Map<number, { serviceId: ServiceSlotId; generationId: string }>();
  let nextPid = 10_000;

  const spawner: ProcessSpawner & {
    running: Map<number, { serviceId: ServiceSlotId; generationId: string }>;
    nextPid: number;
  } = {
    running,
    nextPid,
    start(request) {
      const pid = nextPid++;
      spawner.nextPid = nextPid;
      running.set(pid, {
        serviceId: request.serviceId,
        generationId: request.generationId,
      });
      const info: ManagedProcessInfo = {
        serviceId: request.serviceId,
        pid,
        startedAt: new Date().toISOString(),
        command: "memory",
        args: [request.serviceId, request.generationId],
      };
      const child = {
        pid,
        killed: false,
        unref: () => undefined,
        kill: () => {
          running.delete(pid);
          return true;
        },
      } as unknown as ChildProcess;
      return { info, child };
    },
    async stopOwned(target) {
      const entry = running.get(target.pid);
      if (!entry) {
        return "skipped";
      }
      if (
        entry.serviceId !== target.serviceId ||
        entry.generationId !== target.generationId
      ) {
        return "skipped";
      }
      running.delete(target.pid);
      return "stopped";
    },
    isAlive(pid) {
      return running.has(pid);
    },
  };

  return spawner;
}
