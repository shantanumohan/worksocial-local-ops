/**
 * File-backed role runtime store (R1-04).
 * Schema companion: database/migrations/005_role_runtime.sql.
 * Holds last-run evidence and SUCCESS/FAILURE outcome hooks for learning-worker.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type {
  AgentRoleId,
  CostRecordingKindValue,
  RoleExecutionModeValue,
  RoleRunOutcomeEvidence,
  RoleRunStatusValue,
} from "@worksocial/domain";
import { CostRecordingKind, listAgentRoleContracts } from "@worksocial/domain";

export type RoleStatusRecord = {
  roleId: AgentRoleId;
  lastRunId: string | null;
  lastJobId: string | null;
  lastStatus: RoleRunStatusValue | "never_run";
  lastExecutionMode: RoleExecutionModeValue | null;
  lastSummary: string | null;
  lastFinishedAtIso: string | null;
  runCount: number;
};

export type RoleRunEvidence = {
  runId: string;
  jobId: string;
  roleId: AgentRoleId;
  workflowId: string;
  status: RoleRunStatusValue;
  executionMode: RoleExecutionModeValue;
  summary: string;
  artifactIds: string[];
  cliVersion: string | null;
  modelId: string | null;
  permissionBypassUsed: false;
  startedAtIso: string;
  finishedAtIso: string;
  costMinor: number;
  /** How costMinor was obtained — required for honest /roles/status. */
  costKind: CostRecordingKindValue;
  budgetReservationId: string | null;
};

export type RoleRuntimeState = {
  version: 1;
  updatedAtIso: string;
  roles: RoleStatusRecord[];
  runs: RoleRunEvidence[];
  outcomes: RoleRunOutcomeEvidence[];
  /** Honest Temporal wiring status for mission enqueue. */
  temporalWiring: "NOT_WIRED" | "LOCAL_DURABLE" | "FIXTURE";
};

export type RoleRuntimeStore = {
  readonly stateDir: string;
  read(): RoleRuntimeState;
  write(state: RoleRuntimeState): void;
  update(mutator: (current: RoleRuntimeState) => RoleRuntimeState): RoleRuntimeState;
  recordRun(evidence: RoleRunEvidence, outcome: RoleRunOutcomeEvidence): RoleRuntimeState;
  getRoleStatus(roleId: AgentRoleId): RoleStatusRecord | undefined;
  listOutcomesForLearning(): RoleRunOutcomeEvidence[];
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

export function emptyRoleRuntimeState(nowIso: string): RoleRuntimeState {
  return {
    version: 1,
    updatedAtIso: nowIso,
    roles: listAgentRoleContracts().map((c) => ({
      roleId: c.roleId,
      lastRunId: null,
      lastJobId: null,
      lastStatus: "never_run",
      lastExecutionMode: null,
      lastSummary: null,
      lastFinishedAtIso: null,
      runCount: 0,
    })),
    runs: [],
    outcomes: [],
    temporalWiring: "NOT_WIRED",
  };
}

export function createFileRoleRuntimeStore(stateDir: string): RoleRuntimeStore {
  const statePath = join(stateDir, "role-runtime.json");

  const read = (): RoleRuntimeState => {
    const existing = readJsonFile<RoleRuntimeState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyRoleRuntimeState(new Date().toISOString());
    }
    return {
      ...existing,
      roles: existing.roles ?? emptyRoleRuntimeState(existing.updatedAtIso).roles,
      runs: (existing.runs ?? []).map((run) => {
        const raw = run as RoleRunEvidence & { costKind?: CostRecordingKindValue };
        return {
          ...run,
          costKind:
            raw.costKind ??
            (run.executionMode === "fixture"
              ? CostRecordingKind.FIXTURE
              : CostRecordingKind.UNKNOWN),
        };
      }),
      outcomes: existing.outcomes ?? [],
      temporalWiring: existing.temporalWiring ?? "NOT_WIRED",
    };
  };

  const write = (state: RoleRuntimeState): void => {
    atomicWriteJson(statePath, state);
  };

  const update = (
    mutator: (current: RoleRuntimeState) => RoleRuntimeState,
  ): RoleRuntimeState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir,
    read,
    write,
    update,
    recordRun(evidence, outcome) {
      return update((current) => {
        const roles = current.roles.map((r) => {
          if (r.roleId !== evidence.roleId) {
            return r;
          }
          return {
            roleId: r.roleId,
            lastRunId: evidence.runId,
            lastJobId: evidence.jobId,
            lastStatus: evidence.status,
            lastExecutionMode: evidence.executionMode,
            lastSummary: evidence.summary,
            lastFinishedAtIso: evidence.finishedAtIso,
            runCount: r.runCount + 1,
          };
        });
        return {
          ...current,
          updatedAtIso: evidence.finishedAtIso,
          roles,
          runs: [evidence, ...current.runs].slice(0, 500),
          outcomes: [outcome, ...current.outcomes].slice(0, 500),
        };
      });
    },
    getRoleStatus(roleId) {
      return read().roles.find((r) => r.roleId === roleId);
    },
    listOutcomesForLearning() {
      return read().outcomes;
    },
  };
}

export function defaultRoleRuntimeStateDir(baseDir: string): string {
  return join(baseDir, "role-runtime");
}
