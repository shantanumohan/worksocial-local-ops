/**
 * Evaluation store (M8 / AA-20 / AA-21).
 * Schema: database/migrations/020_m8_search_analytics_eval.sql
 *          + 025_eval_state_budget.sql
 *
 * Backends:
 * - memory — fixture/unit fallback
 * - file — default when DATABASE_URL unset
 * - postgres — when DATABASE_URL / WORKSOCIAL_DATABASE_URL set
 *
 * Live Claude/Gemini fleet and ChatGPT Ads stay NOT_WIRED. External effects: NONE.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  FIXED_EVALUATION_ISOLATION,
  emptyEvaluationState,
  type BudgetAccount,
  type ChatGptAdsAccessDecision,
  type EvalConnectionRecord,
  type EvalRunRecord,
  type EvalSuite,
  type EvaluationState,
} from "@worksocial/domain";
import {
  createPgPool,
  resolveDatabaseUrl,
  withTransaction,
  type PgPool,
  type PgQueryable,
} from "./pg/client.js";

export type EvaluationStoreBackend = "memory" | "file" | "postgres";

export type EvaluationStoreStatus = {
  backend: EvaluationStoreBackend;
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

export type EvaluationStore = {
  readonly backend: EvaluationStoreBackend;
  /** File root when backend=file; empty for memory/postgres. */
  readonly stateDir: string;
  read(): Promise<EvaluationState>;
  write(state: EvaluationState): Promise<void>;
  update(
    mutator: (current: EvaluationState) => EvaluationState,
  ): Promise<EvaluationState>;
  upsertConnection(connection: EvalConnectionRecord): Promise<EvaluationState>;
  upsertSuite(suite: EvalSuite): Promise<EvaluationState>;
  addRun(run: EvalRunRecord): Promise<EvaluationState>;
  upsertRun(run: EvalRunRecord): Promise<EvaluationState>;
  listConnections(limit?: number): Promise<EvalConnectionRecord[]>;
  listSuites(limit?: number): Promise<EvalSuite[]>;
  listRuns(limit?: number): Promise<EvalRunRecord[]>;
  status(): Promise<EvaluationStoreStatus>;
};

const HONEST_NOTE =
  "AA-21/M8 isolated EVAL_ONLY worker. Claude/Gemini fixture adjudication only — no publish/CRM/customer-message tools. Separate eval budget. ChatGPT Ads NOT_WIRED / access-blocked. Live model fleet NOT_WIRED. Learning cannot expand effects. Temporal NOT_WIRED. Catalog cases remain NOT_RUN. ACCEPTED≠VERIFIED.";

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

function normalizeState(
  raw: EvaluationState | null,
  fallbackIso: string,
): EvaluationState {
  if (!raw || raw.version !== 1) {
    return emptyEvaluationState(fallbackIso);
  }
  const base = emptyEvaluationState(raw.updatedAtIso ?? fallbackIso);
  return {
    ...base,
    ...raw,
    connections: raw.connections ?? [],
    suites: raw.suites ?? [],
    runs: raw.runs ?? [],
    // Legacy file budgets may omit heldMinor / heldReservations (pre-T-X027).
    budget: parseBudget(raw.budget ?? base.budget, raw.updatedAtIso ?? fallbackIso),
    liveEvalWiring: "NOT_WIRED",
    chatgptAdsWiring: "NOT_WIRED",
    isolation: { ...FIXED_EVALUATION_ISOLATION },
  };
}

function sealedState(state: EvaluationState): EvaluationState {
  return {
    ...state,
    liveEvalWiring: "NOT_WIRED",
    chatgptAdsWiring: "NOT_WIRED",
    isolation: { ...FIXED_EVALUATION_ISOLATION },
  };
}

function statusFromState(
  backend: EvaluationStoreBackend,
  state: EvaluationState,
): EvaluationStoreStatus {
  return {
    backend,
    connectionCount: state.connections.length,
    suiteCount: state.suites.length,
    runCount: state.runs.length,
    budgetLimitMinor: state.budget.limitMinor,
    budgetSettledMinor: state.budget.settledMinor,
    liveEvalWiring: state.liveEvalWiring,
    chatgptAdsWiring: state.chatgptAdsWiring,
    isolation: state.isolation,
    honestNote: HONEST_NOTE,
  };
}

function createStateBackedStore(input: {
  backend: EvaluationStoreBackend;
  stateDir: string;
  load: () => EvaluationState;
  save: (state: EvaluationState) => void;
}): EvaluationStore {
  const { backend, stateDir, load, save } = input;

  const read = async (): Promise<EvaluationState> => sealedState(load());

  const write = async (state: EvaluationState): Promise<void> => {
    save(sealedState(state));
  };

  const update = async (
    mutator: (current: EvaluationState) => EvaluationState,
  ): Promise<EvaluationState> => {
    const next = sealedState(mutator(await read()));
    await write(next);
    return next;
  };

  return {
    backend,
    stateDir,
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
    listConnections: async (limit = 50) => {
      const rows = (await read()).connections;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listSuites: async (limit = 50) => {
      const rows = (await read()).suites;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listRuns: async (limit = 50) => {
      const rows = (await read()).runs;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: async () => statusFromState(backend, await read()),
  };
}

export function defaultEvaluationStateDir(baseDir: string): string {
  return join(baseDir, "evaluation");
}

export function createMemoryEvaluationStore(
  initial?: EvaluationState,
): EvaluationStore {
  let current = sealedState(
    initial ?? emptyEvaluationState(new Date().toISOString()),
  );
  return createStateBackedStore({
    backend: "memory",
    stateDir: "",
    load: () => current,
    save: (state) => {
      current = sealedState(state);
    },
  });
}

export function createFileEvaluationStore(stateDir: string): EvaluationStore {
  const evalDir = join(stateDir, "evaluation");
  const statePath = join(evalDir, "evaluation-state.json");

  return createStateBackedStore({
    backend: "file",
    stateDir: evalDir,
    load: () =>
      normalizeState(
        readJsonFile<EvaluationState>(statePath),
        new Date().toISOString(),
      ),
    save: (state) => {
      atomicWriteJson(statePath, sealedState(state));
    },
  });
}

function parseBudget(raw: unknown, fallbackIso: string): BudgetAccount {
  const empty = emptyEvaluationState(fallbackIso).budget;
  if (!raw || typeof raw !== "object") return empty;
  const row = raw as Record<string, unknown>;
  const heldReservations =
    typeof row.heldReservations === "object" && row.heldReservations !== null
      ? (row.heldReservations as Record<string, number>)
      : {};
  // T-X027: heldMinor must match map sum. Legacy files may omit heldMinor or
  // leave it stale — derive from per-reservation holds (never invent zero).
  // Non-finite / non-positive map values do not invent capacity.
  let heldMinor = 0;
  for (const amount of Object.values(heldReservations)) {
    const n = Number(amount);
    if (Number.isFinite(n) && n > 0) {
      heldMinor += n;
    }
  }
  return {
    dayKey: String(row.dayKey ?? empty.dayKey),
    currency: String(row.currency ?? empty.currency),
    limitMinor: Number(row.limitMinor ?? empty.limitMinor),
    reservedMinor: Number(row.reservedMinor ?? 0),
    settledMinor: Number(row.settledMinor ?? 0),
    heldMinor,
    openReservations:
      typeof row.openReservations === "object" && row.openReservations !== null
        ? (row.openReservations as Record<string, number>)
        : {},
    heldReservations,
    settledReservations:
      typeof row.settledReservations === "object" &&
      row.settledReservations !== null
        ? (row.settledReservations as BudgetAccount["settledReservations"])
        : {},
  };
}

function rowToConnection(row: Record<string, unknown>): EvalConnectionRecord {
  return {
    connectionId: String(row.connection_id),
    provider: row.provider as EvalConnectionRecord["provider"],
    capability: row.capability as EvalConnectionRecord["capability"],
    displayName: String(row.display_name),
    fixtureOnly: Boolean(row.fixture_only),
    operationalFallback: false,
    createdAtIso: new Date(String(row.created_at)).toISOString(),
    updatedAtIso: new Date(String(row.updated_at)).toISOString(),
  };
}

function rowToSuite(row: Record<string, unknown>): EvalSuite {
  const cases =
    typeof row.cases === "object" && row.cases !== null
      ? (row.cases as EvalSuite["cases"])
      : typeof row.cases === "string"
        ? (JSON.parse(row.cases) as EvalSuite["cases"])
        : [];
  return {
    suiteId: String(row.suite_id),
    title: String(row.title),
    cases,
    fixtureOnly: Boolean(row.fixture_only),
    createdAtIso: new Date(String(row.created_at)).toISOString(),
  };
}

function rowToRun(row: Record<string, unknown>): EvalRunRecord {
  const results =
    typeof row.results === "object" && row.results !== null
      ? (row.results as EvalRunRecord["results"])
      : typeof row.results === "string"
        ? (JSON.parse(row.results) as EvalRunRecord["results"])
        : [];
  const adsRaw =
    typeof row.chatgpt_ads_json === "object" && row.chatgpt_ads_json !== null
      ? (row.chatgpt_ads_json as ChatGptAdsAccessDecision)
      : typeof row.chatgpt_ads_json === "string"
        ? (JSON.parse(row.chatgpt_ads_json) as ChatGptAdsAccessDecision)
        : {
            allowed: false,
            code: "ADS_ACCESS_BLOCKED" as const,
            reasons: ["ChatGPT Ads NOT_WIRED"],
            environment: "NOT_WIRED" as const,
          };
  return {
    runId: String(row.run_id),
    suiteId: String(row.suite_id),
    provider: row.provider as EvalRunRecord["provider"],
    capability: "EVAL_ONLY",
    status: row.status as EvalRunRecord["status"],
    reservationId:
      row.reservation_id == null ? null : String(row.reservation_id),
    reservedMinor: Number(row.reserved_minor ?? 0),
    settledMinor: Number(row.settled_minor ?? 0),
    results,
    fixtureOnly: Boolean(row.fixture_only),
    chatgptAdsDecision: {
      ...adsRaw,
      allowed: false,
    },
    createdAtIso: new Date(String(row.created_at)).toISOString(),
    completedAtIso:
      row.completed_at == null
        ? null
        : new Date(String(row.completed_at)).toISOString(),
  };
}

async function loadPgState(db: PgQueryable): Promise<EvaluationState> {
  const nowIso = new Date().toISOString();
  const meta = await db.query(
    `SELECT budget_json, updated_at FROM journey.eval_state WHERE singleton_id = 'default'`,
  );
  const connections = await db.query(
    `SELECT * FROM journey.eval_connections ORDER BY updated_at ASC`,
  );
  const suites = await db.query(
    `SELECT * FROM journey.eval_suites ORDER BY created_at ASC`,
  );
  const runs = await db.query(
    `SELECT * FROM journey.eval_runs ORDER BY created_at ASC`,
  );

  const updatedAtIso = meta.rows[0]
    ? new Date(String(meta.rows[0].updated_at)).toISOString()
    : nowIso;
  const budget = parseBudget(meta.rows[0]?.budget_json, updatedAtIso);

  return sealedState({
    version: 1,
    updatedAtIso,
    connections: connections.rows.map((r) =>
      rowToConnection(r as Record<string, unknown>),
    ),
    suites: suites.rows.map((r) => rowToSuite(r as Record<string, unknown>)),
    runs: runs.rows.map((r) => rowToRun(r as Record<string, unknown>)),
    budget,
    liveEvalWiring: "NOT_WIRED",
    chatgptAdsWiring: "NOT_WIRED",
    isolation: { ...FIXED_EVALUATION_ISOLATION },
  });
}

async function replacePgState(
  db: PgQueryable,
  state: EvaluationState,
): Promise<void> {
  const sealed = sealedState(state);
  await db.query(
    `INSERT INTO journey.eval_state (singleton_id, budget_json, updated_at)
     VALUES ('default', $1::jsonb, $2::timestamptz)
     ON CONFLICT (singleton_id) DO UPDATE SET
       budget_json = EXCLUDED.budget_json,
       updated_at = EXCLUDED.updated_at`,
    [JSON.stringify(sealed.budget), sealed.updatedAtIso],
  );

  await db.query(`DELETE FROM journey.eval_runs`);
  await db.query(`DELETE FROM journey.eval_connections`);
  await db.query(`DELETE FROM journey.eval_suites`);

  const suites = [...sealed.suites.slice(-100)];
  const suiteIds = new Set(suites.map((s) => s.suiteId));
  // LIVE_NOT_WIRED / budget-fail paths may record a run before a suite is seeded.
  for (const run of sealed.runs.slice(-500)) {
    if (!suiteIds.has(run.suiteId)) {
      suites.push({
        suiteId: run.suiteId,
        title: `placeholder:${run.suiteId}`,
        cases: [],
        fixtureOnly: true,
        createdAtIso: run.createdAtIso,
      });
      suiteIds.add(run.suiteId);
    }
  }

  for (const suite of suites) {
    await db.query(
      `INSERT INTO journey.eval_suites (
         suite_id, title, cases, fixture_only, created_at
       ) VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz)`,
      [
        suite.suiteId,
        suite.title,
        JSON.stringify(suite.cases),
        suite.fixtureOnly,
        suite.createdAtIso,
      ],
    );
  }

  for (const connection of sealed.connections.slice(-100)) {
    await db.query(
      `INSERT INTO journey.eval_connections (
         connection_id, provider, capability, display_name,
         fixture_only, operational_fallback, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, false, $6::timestamptz, $7::timestamptz)`,
      [
        connection.connectionId,
        connection.provider,
        connection.capability,
        connection.displayName,
        connection.fixtureOnly,
        connection.createdAtIso,
        connection.updatedAtIso,
      ],
    );
  }

  for (const run of sealed.runs.slice(-500)) {
    await db.query(
      `INSERT INTO journey.eval_runs (
         run_id, suite_id, provider, capability, status,
         reservation_id, reserved_minor, settled_minor, results,
         fixture_only, chatgpt_ads_json, created_at, completed_at
       ) VALUES (
         $1, $2, $3, 'EVAL_ONLY', $4,
         $5, $6, $7, $8::jsonb,
         $9, $10::jsonb, $11::timestamptz, $12::timestamptz
       )`,
      [
        run.runId,
        run.suiteId,
        run.provider,
        run.status,
        run.reservationId,
        run.reservedMinor,
        run.settledMinor,
        JSON.stringify(run.results),
        run.fixtureOnly,
        JSON.stringify({ ...run.chatgptAdsDecision, allowed: false }),
        run.createdAtIso,
        run.completedAtIso,
      ],
    );
  }
}

function isPool(db: PgQueryable): db is PgPool {
  return (
    typeof (db as PgPool).connect === "function" &&
    typeof (db as { release?: unknown }).release !== "function"
  );
}

export function createPgEvaluationStore(db: PgQueryable): EvaluationStore {
  const runWrite = async (
    fn: (q: PgQueryable) => Promise<EvaluationState>,
  ): Promise<EvaluationState> => {
    if (isPool(db)) {
      return withTransaction(db, fn);
    }
    return fn(db);
  };

  const read = async (): Promise<EvaluationState> => loadPgState(db);

  const write = async (state: EvaluationState): Promise<void> => {
    await runWrite(async (q) => {
      await replacePgState(q, state);
      return sealedState(state);
    });
  };

  const update = async (
    mutator: (current: EvaluationState) => EvaluationState,
  ): Promise<EvaluationState> =>
    runWrite(async (q) => {
      await q.query(
        `SELECT singleton_id FROM journey.eval_state WHERE singleton_id = 'default' FOR UPDATE`,
      );
      const current = await loadPgState(q);
      const next = sealedState(mutator(current));
      await replacePgState(q, next);
      return next;
    });

  return {
    backend: "postgres",
    stateDir: "",
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
    listConnections: async (limit = 50) => {
      const rows = (await read()).connections;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listSuites: async (limit = 50) => {
      const rows = (await read()).suites;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    listRuns: async (limit = 50) => {
      const rows = (await read()).runs;
      return rows.slice(Math.max(0, rows.length - limit));
    },
    status: async () => statusFromState("postgres", await read()),
  };
}

export type OpenEvaluationStoreOptions = {
  stateDir: string;
  /** Explicit URL; otherwise DATABASE_URL / WORKSOCIAL_DATABASE_URL. */
  connectionString?: string;
  /** Force memory even when DATABASE_URL is set (unit fixtures). */
  forceMemory?: boolean;
  /** Force file even when DATABASE_URL is set. */
  forceFile?: boolean;
};

export type OpenEvaluationStoreResult = {
  store: EvaluationStore;
  backend: EvaluationStoreBackend;
  pool: PgPool | null;
};

/**
 * Prefer Postgres when DATABASE_URL is set; otherwise file (fixture) store.
 * Memory only when forceMemory is set.
 */
export function openEvaluationStore(
  options: OpenEvaluationStoreOptions,
): OpenEvaluationStoreResult {
  if (options.forceMemory) {
    return {
      store: createMemoryEvaluationStore(),
      backend: "memory",
      pool: null,
    };
  }
  if (options.forceFile) {
    return {
      store: createFileEvaluationStore(options.stateDir),
      backend: "file",
      pool: null,
    };
  }
  const url = resolveDatabaseUrl(options.connectionString);
  if (url) {
    const pool = createPgPool({ connectionString: url, max: 4 });
    return {
      store: createPgEvaluationStore(pool),
      backend: "postgres",
      pool,
    };
  }
  return {
    store: createFileEvaluationStore(options.stateDir),
    backend: "file",
    pool: null,
  };
}
