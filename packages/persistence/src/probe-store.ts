/**
 * File-backed monitoring / probe store (R1-05).
 * Schema companion: database/migrations/007_monitoring.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyMonitoringState,
  type CanaryRemoteReceipt,
  type MonitoringState,
  type ProbeRunRecord,
} from "@worksocial/domain";

export type ProbeStore = {
  readonly stateDir: string;
  read(): MonitoringState;
  write(state: MonitoringState): void;
  update(mutator: (current: MonitoringState) => MonitoringState): MonitoringState;
  recordRun(run: ProbeRunRecord): MonitoringState;
  addFixtureReceipt(receipt: CanaryRemoteReceipt): MonitoringState;
  lastRun(kind?: ProbeRunRecord["kind"]): ProbeRunRecord | null;
  listRuns(limit?: number): ProbeRunRecord[];
  status(): {
    runCount: number;
    lastRunsByKind: Partial<Record<ProbeRunRecord["kind"], ProbeRunRecord>>;
    liveZohoWiring: MonitoringState["liveZohoWiring"];
    playwrightWiring: MonitoringState["playwrightWiring"];
    fixtureReceiptCount: number;
    honestNote: string;
  };
};

function atomicWriteJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, filePath);
}

function readJsonFile<T>(filePath: string): T | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function defaultProbeStateDir(baseDir: string): string {
  return join(baseDir, "monitoring");
}

export function createFileProbeStore(stateDir: string): ProbeStore {
  const monitoringDir = join(stateDir, "monitoring");
  const statePath = join(monitoringDir, "monitoring-state.json");

  const read = (): MonitoringState => {
    const existing = readJsonFile<MonitoringState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyMonitoringState(new Date().toISOString());
    }
    return {
      ...existing,
      runs: existing.runs ?? [],
      fixtureReceipts: existing.fixtureReceipts ?? [],
      liveZohoWiring: "NOT_WIRED",
      playwrightWiring: existing.playwrightWiring ?? "FIXTURE",
    };
  };

  const write = (state: MonitoringState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: MonitoringState) => MonitoringState,
  ): MonitoringState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: monitoringDir,
    read,
    write,
    update,
    recordRun: (run) =>
      update((state) => ({
        ...state,
        runs: [...state.runs, run].slice(-500),
        updatedAtIso: run.finishedAtIso,
      })),
    addFixtureReceipt: (receipt) =>
      update((state) => ({
        ...state,
        fixtureReceipts: [...state.fixtureReceipts, receipt].slice(-500),
        updatedAtIso: receipt.observedAtIso,
      })),
    lastRun: (kind) => {
      const runs = read().runs;
      const filtered = kind ? runs.filter((r) => r.kind === kind) : runs;
      return filtered.length > 0 ? filtered[filtered.length - 1]! : null;
    },
    listRuns: (limit = 50) => {
      const runs = read().runs;
      return runs.slice(Math.max(0, runs.length - limit));
    },
    status: () => {
      const state = read();
      const lastRunsByKind: Partial<
        Record<ProbeRunRecord["kind"], ProbeRunRecord>
      > = {};
      for (const run of state.runs) {
        lastRunsByKind[run.kind] = run;
      }
      return {
        runCount: state.runs.length,
        lastRunsByKind,
        liveZohoWiring: state.liveZohoWiring,
        playwrightWiring: state.playwrightWiring,
        fixtureReceiptCount: state.fixtureReceipts.length,
        honestNote:
          "HTTP/DOM fixture probes and form-to-CRM fixture canaries are real offline evidence. Live Zoho remains NOT_WIRED without owner credentials. Playwright live browser path is optional; CI uses fixture DOM.",
      };
    },
  };
}
