import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ServiceSlotId } from "@worksocial/persistence";
import type { ManagedProcessInfo } from "./types.js";
import type { SupervisorConfig } from "./config.js";

export type SpawnedSlot = {
  info: ManagedProcessInfo;
  child: ChildProcess;
};

export type ProcessSpawner = {
  start(serviceId: ServiceSlotId, config: SupervisorConfig): SpawnedSlot;
  stop(pid: number, signal?: NodeJS.Signals): Promise<void>;
  isAlive(pid: number): boolean;
};

function slotScript(repoRoot: string): string {
  return join(repoRoot, "services/supervisor/src/slots/heartbeat-slot.ts");
}

function resolveTsx(repoRoot: string): string {
  const local = join(repoRoot, "node_modules", ".bin", "tsx");
  if (existsSync(local)) {
    return local;
  }
  return "tsx";
}

function buildArgs(serviceId: ServiceSlotId, config: SupervisorConfig): string[] {
  const args = [
    slotScript(config.repoRoot),
    "--service",
    serviceId,
    "--state-dir",
    config.stateDir,
  ];

  if (serviceId === "api") {
    args.push("--port", String(config.apiPort), "--mode", "http-health");
  } else if (serviceId === "console") {
    args.push("--port", String(config.consolePort), "--mode", "http-health");
  } else {
    args.push("--mode", "stub");
  }

  return args;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Default spawner: real child processes via tsx slot runners.
 * API/console expose loopback health HTTP; temporal-worker is an honest stub slot.
 */
export function createChildProcessSpawner(): ProcessSpawner {
  return {
    start(serviceId, config) {
      if (!existsSync(slotScript(config.repoRoot))) {
        throw new Error(`Missing slot runner script for ${serviceId}`);
      }
      const tsxPath = resolveTsx(config.repoRoot);
      const args = buildArgs(serviceId, config);
      const child = spawn(tsxPath, args, {
        cwd: config.repoRoot,
        env: {
          ...process.env,
          WORKSOCIAL_SERVICE_ID: serviceId,
          WORKSOCIAL_STATE_DIR: config.stateDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
        detached: false,
      });

      if (child.pid === undefined) {
        throw new Error(`Failed to spawn ${serviceId}`);
      }

      const info: ManagedProcessInfo = {
        serviceId,
        pid: child.pid,
        startedAt: new Date().toISOString(),
        command: tsxPath,
        args,
      };

      return { info, child };
    },

    async stop(pid, signal = "SIGTERM") {
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
  running: Map<number, ServiceSlotId>;
  nextPid: number;
} {
  const running = new Map<number, ServiceSlotId>();
  let nextPid = 10_000;

  const spawner: ProcessSpawner & {
    running: Map<number, ServiceSlotId>;
    nextPid: number;
  } = {
    running,
    nextPid,
    start(serviceId, _config) {
      const pid = nextPid++;
      spawner.nextPid = nextPid;
      running.set(pid, serviceId);
      const info: ManagedProcessInfo = {
        serviceId,
        pid,
        startedAt: new Date().toISOString(),
        command: "memory",
        args: [serviceId],
      };
      const child = {
        pid,
        killed: false,
        kill: () => {
          running.delete(pid);
          return true;
        },
      } as unknown as ChildProcess;
      return { info, child };
    },
    async stop(pid) {
      running.delete(pid);
    },
    isAlive(pid) {
      return running.has(pid);
    },
  };

  return spawner;
}
