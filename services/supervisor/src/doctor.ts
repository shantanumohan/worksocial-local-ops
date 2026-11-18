import { accessSync, constants, existsSync } from "node:fs";
import {
  assertDurableRootsOffSync,
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
    status: "pass",
    message: existsSync(config.stateDir)
      ? `Supervisor state dir present: ${config.stateDir} (file-backed until Postgres is bound).`
      : `Supervisor state dir will be created at ${config.stateDir} (file-backed until Postgres is bound).`,
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

  for (const svc of health.services) {
    if (svc.serviceId === "temporal-worker") {
      checks.push({
        id: `slot-${svc.serviceId}`,
        status: "warn",
        message: `temporal-worker wiringStatus=${svc.wiringStatus} status=${svc.status} — Temporal is NOT_WIRED (honest stub slot).`,
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
      ? `Host lease held for ${config.hostId} (generation=${state.hostLease?.generationId ?? "n/a"}).`
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
