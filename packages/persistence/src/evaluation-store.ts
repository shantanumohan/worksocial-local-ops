/**
 * File-backed evaluation store (M8 / NEXT-19).
 * Schema companion: database/migrations/020_m8_search_analytics_eval.sql.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  FIXED_EVALUATION_ISOLATION,
  emptyEvaluationState,
  type EvalConnectionRecord,
  type EvalRunRecord,
  type EvalSuite,
  type EvaluationState,
} from "@worksocial/domain";

export type EvaluationStore = {
  readonly stateDir: string;
  read(): EvaluationState;
  write(state: EvaluationState): void;
  update(mutator: (current: EvaluationState) => EvaluationState): EvaluationState;
  upsertConnection(connection: EvalConnectionRecord): EvaluationState;
  upsertSuite(suite: EvalSuite): EvaluationState;
  addRun(run: EvalRunRecord): EvaluationState;
  upsertRun(run: EvalRunRecord): EvaluationState;
  listConnections(limit?: number): EvalConnectionRecord[];
  listSuites(limit?: number): EvalSuite[];
  listRuns(limit?: number): EvalRunRecord[];
  status(): {
    connectionCount: number;
    suiteCount: number;
    runCount: number;
    budgetLimitMinor: number;
    budgetSettledMinor: number;
    liveEvalWiring: EvaluationState["liveEvalWiring"];
    chatgptAdsWiring: EvaluationState["chatgptAdsWiring"];
    isolation: EvaluationState["isolation"];
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

export function defaultEvaluationStateDir(baseDir: string): string {
  return join(baseDir, "evaluation");
}

export function createFileEvaluationStore(stateDir: string): EvaluationStore {
  const evalDir = join(stateDir, "evaluation");
  const statePath = join(evalDir, "evaluation-state.json");

  const read = (): EvaluationState => {
    const existing = readJsonFile<EvaluationState>(statePath);
    if (!existing || existing.version !== 1) {
      return emptyEvaluationState(new Date().toISOString());
    }
    const base = emptyEvaluationState(existing.updatedAtIso);
    return {
      ...base,
      ...existing,
      connections: existing.connections ?? [],
      suites: existing.suites ?? [],
      runs: existing.runs ?? [],
      budget: existing.budget ?? base.budget,
      liveEvalWiring: "NOT_WIRED",
      chatgptAdsWiring: "NOT_WIRED",
      isolation: { ...FIXED_EVALUATION_ISOLATION },
    };
  };

  const write = (state: EvaluationState): void => {
    atomicWriteJson(statePath, {
      ...state,
      liveEvalWiring: "NOT_WIRED",
      chatgptAdsWiring: "NOT_WIRED",
      isolation: { ...FIXED_EVALUATION_ISOLATION },
    });
  };

  const update = (
    mutator: (current: EvaluationState) => EvaluationState,
  ): EvaluationState => {
    const next = mutator(read());
    write(next);
    return next;
  };

  return {
    stateDir: evalDir,
    read,
    write,
    update,
    upsertConnection: (connection) =>
      update((state) => {
        const others = state.connections.filter(
          (c) => c.connectionId !== connection.connectionId,
        );
        return {
          ...state,
          connections: [...others, connection].slice(-100),
          updatedAtIso: connection.updatedAtIso,
        };
      }),
    upsertSuite: (suite) =>
      update((state) => {
        const others = state.suites.filter((s) => s.suiteId !== suite.suiteId);
        return {
          ...state,
          suites: [...others, suite].slice(-100),
          updatedAtIso: suite.createdAtIso,
        };
      }),
    addRun: (run) =>
      update((state) => ({
        ...state,
        runs: [...state.runs, run].slice(-500),
        updatedAtIso: run.createdAtIso,
      })),
    upsertRun: (run) =>
      update((state) => {
        const others = state.runs.filter((r) => r.runId !== run.runId);
        return {
          ...state,
          runs: [...others, run].slice(-500),
          updatedAtIso: run.completedAtIso ?? run.createdAtIso,
        };
      }),
    listConnections: (limit = 50) => {
      const rows = read().connections;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listSuites: (limit = 50) => {
      const rows = read().suites;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listRuns: (limit = 50) => {
      const rows = read().runs;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: () => {
      const state = read();
      return {
        connectionCount: state.connections.length,
        suiteCount: state.suites.length,
        runCount: state.runs.length,
        budgetLimitMinor: state.budget.limitMinor,
        budgetSettledMinor: state.budget.settledMinor,
        liveEvalWiring: state.liveEvalWiring,
        chatgptAdsWiring: state.chatgptAdsWiring,
        isolation: state.isolation,
        honestNote:
          "AA-20/M8 isolated EVAL_ONLY worker. Claude/Gemini fixture adjudication only — no publish/CRM/customer-message tools. Separate eval budget. ChatGPT Ads NOT_WIRED / access-blocked. Live model fleet NOT_WIRED. Learning cannot expand effects. Temporal NOT_WIRED. Catalog cases remain NOT_RUN.",
      };
    },
  };
}
