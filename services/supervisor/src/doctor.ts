import { accessSync, constants, existsSync } from "node:fs";
import {
  assertDurableRootsOffSync,
  describeOwnershipCapability,
  listMissingArtifactRoots,
  listMissingDurableRoots,
  resolveCanonicalPath,
  type LocalStateStore,
} from "@worksocial/persistence";
import type { SupervisorConfig } from "./config.js";
import type { DoctorCheck, DoctorReport } from "./types.js";
import { collectHealth } from "./health.js";
import type { ProcessSpawner } from "./process-manager.js";

function checkRootAccess(path: string, needWrite: boolean): string | null {
  if (!existsSync(path)) {
    return `Path does not exist: ${path}`;
  }
  try {
    accessSync(path, needWrite ? constants.R_OK | constants.W_OK : constants.R_OK);
    return null;
  } catch {
    return needWrite
      ? `Path not readable/writable: ${path}`
      : `Path not readable: ${path}`;
  }
}

export function runDoctor(
  store: LocalStateStore,
  config: SupervisorConfig,
  spawner: ProcessSpawner,
  nowIso: string = new Date().toISOString(),
): DoctorReport {
  const state = store.read();
  const checks: DoctorCheck[] = [];
  const deny = { denyPatterns: config.syncDenyPatterns };

  checks.push({
    id: "state-dir",
    status: config.hostPaths.stateDirOnSyncPath ? "fail" : "pass",
    message: config.hostPaths.stateDirOnSyncPath
      ? `State dir under sync path (refused): ${config.stateDir}. Set WORKSOCIAL_STATE_DIR off OneDrive.`
      : existsSync(config.stateDir)
        ? `Supervisor state dir present: ${config.stateDir} (source=${config.hostPaths.source}; outside checkout by default).`
        : `Supervisor state dir will be created at ${config.stateDir} (source=${config.hostPaths.source}; outside checkout by default).`,
  });

  checks.push({
    id: "data-home",
    status: "pass",
    message: `Data home ${config.dataHome}; durable suggestions database=${config.hostPaths.durableRoots.database} temporal=${config.hostPaths.durableRoots.temporal} secrets=${config.hostPaths.durableRoots.secrets}`,
  });

  const ownership = describeOwnershipCapability(false);
  checks.push({
    id: "process-ownership",
    status: ownership.procAvailable ? "pass" : "warn",
    message: ownership.detail,
  });

  const missingArtifacts = listMissingArtifactRoots(state.storageRoots);
  checks.push({
    id: "artifact-roots",
    status: missingArtifacts.length === 0 ? "pass" : "warn",
    message:
      missingArtifacts.length === 0
        ? "All artifact storage roots registered (source/working/content/reports/encrypted_backup)."
        : `Missing artifact roots: ${missingArtifacts.join(", ")}. Register via selected-folder wizard / config.`,
  });

  const missingDurable = listMissingDurableRoots(state.storageRoots);
  checks.push({
    id: "durable-roots",
    status: missingDurable.length === 0 ? "pass" : "warn",
    message:
      missingDurable.length === 0
        ? "Durable roots registered (database/temporal/secrets)."
        : `Durable roots not registered yet: ${missingDurable.join(", ")}. Must stay off OneDrive-style sync paths.`,
  });

  const syncErrors = assertDurableRootsOffSync(state.storageRoots, deny);
  checks.push({
    id: "durable-off-sync",
    status: syncErrors.length === 0 ? "pass" : "fail",
    message:
      syncErrors.length === 0
        ? "No durable DB/Temporal/secrets roots under consumer sync paths (logical + canonical)."
        : syncErrors.map((e) => e.message).join(" "),
  });

  for (const root of state.storageRoots.roots) {
    const needWrite =
      root.kind === "working" ||
      root.kind === "content" ||
      root.kind === "reports" ||
      root.kind === "encrypted_backup" ||
      root.kind === "database" ||
      root.kind === "temporal" ||
      root.kind === "secrets";
    const canonical = root.canonicalPath || resolveCanonicalPath(root.path);
    const accessError = checkRootAccess(canonical, needWrite);
    checks.push({
      id: `root-access-${root.kind}`,
      status: accessError ? "fail" : "pass",
      message: accessError
        ? `${root.kind}: ${accessError}`
        : `${root.kind} root OK at ${canonical}`,
    });
  }

  const health = collectHealth(store, config, spawner, nowIso);
  const components = health.components;

  checks.push({
    id: "component-host",
    status: components.host.status === "up" ? "pass" : "warn",
    message: `host plane=${components.host.status} leaseHeld=${components.host.leaseHeld} — ${components.host.detail}`,
  });
  checks.push({
    id: "component-api",
    status: components.api.status === "degraded" ? "fail" : components.api.status === "up" ? "pass" : "warn",
    message: `api plane=${components.api.status} wiring=${components.api.wiringStatus} — ${components.api.detail}`,
  });
  checks.push({
    id: "component-console",
    status:
      components.console.status === "degraded"
        ? "fail"
        : components.console.status === "up"
          ? "pass"
          : "warn",
    message: `console plane=${components.console.status} wiring=${components.console.wiringStatus} — ${components.console.detail}`,
  });
  checks.push({
    id: "component-temporal",
    status: components.temporal.status === "up" ? "pass" : "warn",
    message: `temporal plane=${components.temporal.status} wiring=${components.temporal.wiringStatus} — ${components.temporal.detail}`,
  });

  for (const svc of health.services) {
    if (svc.serviceId === "temporal-worker") {
      const wired =
        svc.wiringStatus === "temporal-wired" &&
        (svc.status === "running" || svc.status === "starting");
      checks.push({
        id: `slot-${svc.serviceId}`,
        status: wired ? "pass" : "warn",
        message: wired
          ? `temporal-worker wiringStatus=${svc.wiringStatus} status=${svc.status} — Temporal worker slot bound (live CMS/Zoho/GSC still NOT_WIRED).`
          : `temporal-worker wiringStatus=${svc.wiringStatus} status=${svc.status} — Temporal is NOT_WIRED (honest stub slot until TEMPORAL_ADDRESS + reachable frontend).`,
      });
      continue;
    }
    const ok = svc.status === "running" || svc.status === "stopped" || svc.status === "stub";
    checks.push({
      id: `slot-${svc.serviceId}`,
      status: svc.status === "unhealthy" ? "fail" : ok ? "pass" : "warn",
      message: `${svc.serviceId}: status=${svc.status} wiring=${svc.wiringStatus} pid=${svc.pid ?? "none"} — ${svc.detail}`,
    });
  }

  checks.push({
    id: "host-lease",
    status: health.leaseHeld ? "pass" : "warn",
    message: health.leaseHeld
      ? `Host lease held for ${config.hostId} (generation=${state.hostLease?.generationId ?? "n/a"}). Distinct from Temporal/API/console plane status.`
      : "No active host lease (services may be stopped).",
  });

  checks.push({
    id: "production-activation",
    status: "pass",
    message: "productionActivated=false — no live providers, CRM writes, or publishing.",
  });

  const ok = checks.every((c) => c.status !== "fail");

  return {
    ok,
    checkedAt: nowIso,
    checks,
    storageRoots: state.storageRoots,
    health,
    productionActivated: false,
  };
}
