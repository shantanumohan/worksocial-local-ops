/** Heartbeat + host-lease renewal for supervisor-managed console slot. */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SlotHeartbeatOptions = {
  serviceId: "api" | "console";
  stateDir: string;
  generationId: string;
  hostId: string;
  leaseTtlMs: number;
  wiringStatus?: "process-managed" | "identity-wired";
};

export function writeServiceHeartbeat(
  options: SlotHeartbeatOptions,
  status: string,
  detail: string,
): void {
  mkdirSync(options.stateDir, { recursive: true });
  const payload = {
    serviceId: options.serviceId,
    status,
    wiringStatus: options.wiringStatus ?? "identity-wired",
    pid: process.pid,
    generationId: options.generationId,
    lastHeartbeatAt: new Date().toISOString(),
    detail,
    productionActivated: false as const,
  };
  writeFileSync(
    join(options.stateDir, `heartbeat-${options.serviceId}.json`),
    JSON.stringify(payload, null, 2),
    "utf8",
  );
}

export function renewHostLease(options: SlotHeartbeatOptions): void {
  const statePath = join(options.stateDir, "supervisor-state.json");
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
    if (
      !lease ||
      lease.generationId !== options.generationId ||
      lease.hostId !== options.hostId
    ) {
      return;
    }
    const now = Date.now();
    state.hostLease = {
      ...lease,
      holderPid: process.pid,
      renewedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + options.leaseTtlMs).toISOString(),
    };
    state.updatedAt = new Date(now).toISOString();
    const tmp = `${statePath}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, statePath);
  } catch {
    /* best-effort */
  }
}

export function startHeartbeatLoop(
  options: SlotHeartbeatOptions,
  detail: string,
): void {
  const tick = (): void => {
    writeServiceHeartbeat(options, "running", detail);
    renewHostLease(options);
  };
  tick();
  setInterval(tick, 2_000);
}
