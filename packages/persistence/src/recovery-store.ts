/**
 * Recovery evidence store (WP10 / F24 / AA-48 PG cutover).
 * Schema: database/migrations/024_recovery_evidence.sql
 *          + 027_credential_recovery_state.sql
 *
 * Backends:
 * - memory — fixture/unit fallback
 * - file — default when DATABASE_URL unset
 * - postgres — when DATABASE_URL / WORKSOCIAL_DATABASE_URL set
 *
 * Live recovery stays NOT_RUN. Live provider revoke stays NOT_WIRED. External effects: NONE.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyRecoveryEvidenceState,
  LiveRecoveryClaim,
  type CapabilityStopRecord,
  type HealthTimelineEvent,
  type QueuedWorkItem,
  type RecoveryEvidenceArtifact,
  type RecoveryEvidenceState,
  type RecoveryRunRecord,
} from "@worksocial/domain";
import {
  createPgPool,
  resolveDatabaseUrl,
  withTransaction,
  type PgPool,
  type PgQueryable,
} from "./pg/client.js";

export type RecoveryStoreBackend = "memory" | "file" | "postgres";

export type RecoveryStoreStatus = {
  backend: RecoveryStoreBackend;
  timelineCount: number;
  queuedWorkCount: number;
  activeCapabilityStops: number;
  runCount: number;
  classCounts: {
    STALE_OBSERVATION: number;
    ACTIVE_INCIDENT: number;
    UNKNOWN_REMOTE_OUTCOME: number;
  };
  liveWiring: RecoveryEvidenceState["liveWiring"];
  liveRecoveryClaim: RecoveryEvidenceState["liveRecoveryClaim"];
  chatgptAdsWiring: "NOT_WIRED";
  productionActivated: false;
  externalEffects: "NONE";
  honestNote: string;
};

export type RecoveryStore = {
  readonly backend: RecoveryStoreBackend;
  readonly stateDir: string;
  read(): Promise<RecoveryEvidenceState>;
  write(state: RecoveryEvidenceState): Promise<void>;
  update(
    mutator: (current: RecoveryEvidenceState) => RecoveryEvidenceState,
  ): Promise<RecoveryEvidenceState>;
  appendTimeline(event: HealthTimelineEvent): Promise<RecoveryEvidenceState>;
  upsertQueuedWork(items: QueuedWorkItem[]): Promise<RecoveryEvidenceState>;
  upsertCapabilityStop(
    stop: CapabilityStopRecord,
  ): Promise<RecoveryEvidenceState>;
  addRun(run: RecoveryRunRecord): Promise<RecoveryEvidenceState>;
  addArtifact(
    artifact: RecoveryEvidenceArtifact,
  ): Promise<RecoveryEvidenceState>;
  listTimeline(limit?: number): Promise<HealthTimelineEvent[]>;
  listQueuedWork(): Promise<QueuedWorkItem[]>;
  listCapabilityStops(): Promise<CapabilityStopRecord[]>;
  listRuns(limit?: number): Promise<RecoveryRunRecord[]>;
  listArtifacts(limit?: number): Promise<RecoveryEvidenceArtifact[]>;
  status(): Promise<RecoveryStoreStatus>;
};

const HONEST_NOTE =
  "Fixture recovery evidence only. Distinguishes STALE_OBSERVATION / ACTIVE_INCIDENT / UNKNOWN_REMOTE_OUTCOME. Live recovery NOT_RUN; never silently VERIFIED. Local credential revoke/rotate/offboard are fixture paths (/credentials); live provider revocation remains NOT_WIRED. PG persistence ≠ live VERIFIED.";

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

function sealedState(state: RecoveryEvidenceState): RecoveryEvidenceState {
  return {
    ...state,
    liveWiring: {
      hostRecovery: state.liveWiring?.hostRecovery ?? "fixture",
      providerRecovery: state.liveWiring?.providerRecovery ?? "fixture",
      credentialRotation: "fixture",
      offboarding: "fixture",
      liveProviderRevocation: "NOT_WIRED",
    },
    liveRecoveryClaim: state.liveRecoveryClaim ?? LiveRecoveryClaim.NOT_RUN,
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
  };
}

function normalizeState(
  raw: RecoveryEvidenceState | null,
  fallbackIso: string,
): RecoveryEvidenceState {
  if (!raw || raw.version !== 1) {
    return emptyRecoveryEvidenceState(fallbackIso);
  }
  const base = emptyRecoveryEvidenceState(raw.updatedAtIso ?? fallbackIso);
  return sealedState({
    ...base,
    ...raw,
    timeline: raw.timeline ?? [],
    queuedWork: raw.queuedWork ?? [],
    capabilityStops: raw.capabilityStops ?? [],
    runs: raw.runs ?? [],
    artifacts: raw.artifacts ?? [],
  });
}

function statusFromState(
  backend: RecoveryStoreBackend,
  state: RecoveryEvidenceState,
): RecoveryStoreStatus {
  const classCounts = {
    STALE_OBSERVATION: 0,
    ACTIVE_INCIDENT: 0,
    UNKNOWN_REMOTE_OUTCOME: 0,
  };
  for (const e of state.timeline) {
    classCounts[e.classification] += 1;
  }
  return {
    backend,
    timelineCount: state.timeline.length,
    queuedWorkCount: state.queuedWork.length,
    activeCapabilityStops: state.capabilityStops.filter((s) => !s.resumeAllowed)
      .length,
    runCount: state.runs.length,
    classCounts,
    liveWiring: state.liveWiring,
    liveRecoveryClaim: state.liveRecoveryClaim,
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
    externalEffects: "NONE",
    honestNote: HONEST_NOTE,
  };
}

function createStateBackedStore(input: {
  backend: RecoveryStoreBackend;
  stateDir: string;
  load: () => RecoveryEvidenceState;
  save: (state: RecoveryEvidenceState) => void;
}): RecoveryStore {
  const { backend, stateDir, load, save } = input;

  const read = async (): Promise<RecoveryEvidenceState> => sealedState(load());

  const write = async (state: RecoveryEvidenceState): Promise<void> => {
    save(sealedState(state));
  };

  const update = async (
    mutator: (current: RecoveryEvidenceState) => RecoveryEvidenceState,
  ): Promise<RecoveryEvidenceState> => {
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
    appendTimeline: (event) =>
      update((s) => ({
        ...s,
        timeline: [...s.timeline, event],
        updatedAtIso: event.recordedAtIso,
      })),
    upsertQueuedWork: (items) =>
      update((s) => {
        const byId = new Map(s.queuedWork.map((q) => [q.workId, q]));
        for (const item of items) {
          byId.set(item.workId, item);
        }
        return {
          ...s,
          queuedWork: [...byId.values()],
          updatedAtIso: new Date().toISOString(),
        };
      }),
    upsertCapabilityStop: (stop) =>
      update((s) => ({
        ...s,
        capabilityStops: [
          ...s.capabilityStops.filter((c) => c.stopId !== stop.stopId),
          stop,
        ],
        updatedAtIso: stop.stoppedAtIso,
      })),
    addRun: (run) =>
      update((s) => ({
        ...s,
        runs: [...s.runs, run],
        updatedAtIso: run.endedAtIso,
      })),
    addArtifact: (artifact) =>
      update((s) => ({
        ...s,
        artifacts: [...s.artifacts, artifact],
        updatedAtIso: artifact.createdAtIso,
      })),
    listTimeline: async (limit = 100) => (await read()).timeline.slice(-limit),
    listQueuedWork: async () => (await read()).queuedWork,
    listCapabilityStops: async () => (await read()).capabilityStops,
    listRuns: async (limit = 50) => (await read()).runs.slice(-limit),
    listArtifacts: async (limit = 50) => (await read()).artifacts.slice(-limit),
    status: async () => statusFromState(backend, await read()),
  };
}

export function defaultRecoveryStateDir(baseDir: string): string {
  return join(baseDir, "recovery");
}

export function createMemoryRecoveryStore(
  initial?: RecoveryEvidenceState,
): RecoveryStore {
  let current = sealedState(
    initial ?? emptyRecoveryEvidenceState(new Date().toISOString()),
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

export function createFileRecoveryStore(stateDir: string): RecoveryStore {
  const recoveryDir = join(stateDir, "recovery");
  const statePath = join(recoveryDir, "recovery-state.json");
  const evidenceDir = join(recoveryDir, "evidence");

  return createStateBackedStore({
    backend: "file",
    stateDir,
    load: () =>
      normalizeState(
        readJsonFile<RecoveryEvidenceState>(statePath),
        new Date().toISOString(),
      ),
    save: (state) => {
      mkdirSync(evidenceDir, { recursive: true });
      atomicWriteJson(statePath, sealedState(state));
    },
  });
}

function asIso(value: unknown, fallback: string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.length > 0) {
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : fallback;
  }
  return fallback;
}

function asJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function rowToTimeline(row: Record<string, unknown>): HealthTimelineEvent {
  return {
    eventId: String(row.event_id),
    recordedAtIso: asIso(row.recorded_at_iso, new Date().toISOString()),
    plane: row.plane as HealthTimelineEvent["plane"],
    classification:
      row.classification as HealthTimelineEvent["classification"],
    summary: String(row.summary),
    sourceKind: row.source_kind as HealthTimelineEvent["sourceKind"],
    relatedCapabilityIds: asJson<string[]>(row.related_capability_ids, []),
    queuedWorkCount: Number(row.queued_work_count ?? 0),
    evidenceRefs: asJson<string[]>(row.evidence_refs, []),
  };
}

function rowToQueued(row: Record<string, unknown>): QueuedWorkItem {
  return {
    workId: String(row.work_id),
    capabilityId: String(row.capability_id),
    operationId: row.operation_id == null ? null : String(row.operation_id),
    effectState:
      row.effect_state == null
        ? null
        : (row.effect_state as QueuedWorkItem["effectState"]),
    queuedAtIso: asIso(row.queued_at_iso, new Date().toISOString()),
    summary: String(row.summary),
  };
}

function rowToStop(row: Record<string, unknown>): CapabilityStopRecord {
  return {
    stopId: String(row.stop_id),
    capabilityId: String(row.capability_id),
    plane: row.plane as CapabilityStopRecord["plane"],
    reason: String(row.reason),
    stoppedAtIso: asIso(row.stopped_at_iso, new Date().toISOString()),
    unrelatedCapabilitiesAllowed: true,
    resumeAllowed: Boolean(row.resume_allowed),
  };
}

function rowToRun(row: Record<string, unknown>): RecoveryRunRecord {
  return {
    runId: String(row.run_id),
    scenarioId: row.scenario_id as RecoveryRunRecord["scenarioId"],
    status: row.status as RecoveryRunRecord["status"],
    classification:
      row.classification as RecoveryRunRecord["classification"],
    timelineEventIds: asJson<string[]>(row.timeline_event_ids, []),
    capabilityStopIds: asJson<string[]>(row.capability_stop_ids, []),
    queuedWorkIds: asJson<string[]>(row.queued_work_ids, []),
    artifactId: row.artifact_id == null ? null : String(row.artifact_id),
    details: asJson<string[]>(row.details, []),
    liveRecoveryVerified: false,
    liveRecoveryClaim: LiveRecoveryClaim.NOT_RUN,
    externalEffects: "NONE",
    productionActivated: false,
    startedAtIso: asIso(row.started_at_iso, new Date().toISOString()),
    endedAtIso: asIso(row.ended_at_iso, new Date().toISOString()),
  };
}

function rowToArtifact(
  row: Record<string, unknown>,
): RecoveryEvidenceArtifact {
  return {
    artifactId: String(row.artifact_id),
    scenarioId: row.scenario_id as RecoveryEvidenceArtifact["scenarioId"],
    environment: "fixture",
    redacted: true,
    summary: String(row.summary),
    classification:
      row.classification as RecoveryEvidenceArtifact["classification"],
    evidenceRef: String(row.evidence_ref),
    createdAtIso: asIso(row.created_at_iso, new Date().toISOString()),
  };
}

async function loadPgState(db: PgQueryable): Promise<RecoveryEvidenceState> {
  const nowIso = new Date().toISOString();
  const meta = await db.query(
    `SELECT live_recovery_claim, updated_at FROM recovery_evidence_state WHERE singleton_id = 'default'`,
  );
  const timeline = await db.query(
    `SELECT * FROM recovery_timeline_events ORDER BY recorded_at_iso ASC`,
  );
  const queued = await db.query(
    `SELECT * FROM recovery_queued_work ORDER BY queued_at_iso ASC`,
  );
  const stops = await db.query(
    `SELECT * FROM recovery_capability_stops ORDER BY stopped_at_iso ASC`,
  );
  const runs = await db.query(
    `SELECT * FROM recovery_runs ORDER BY started_at_iso ASC`,
  );
  const artifacts = await db.query(
    `SELECT * FROM recovery_artifacts ORDER BY created_at_iso ASC`,
  );

  const updatedAtIso = meta.rows[0]
    ? asIso(meta.rows[0].updated_at, nowIso)
    : nowIso;

  return sealedState({
    version: 1,
    updatedAtIso,
    timeline: timeline.rows.map((r) =>
      rowToTimeline(r as Record<string, unknown>),
    ),
    queuedWork: queued.rows.map((r) =>
      rowToQueued(r as Record<string, unknown>),
    ),
    capabilityStops: stops.rows.map((r) =>
      rowToStop(r as Record<string, unknown>),
    ),
    runs: runs.rows.map((r) => rowToRun(r as Record<string, unknown>)),
    artifacts: artifacts.rows.map((r) =>
      rowToArtifact(r as Record<string, unknown>),
    ),
    liveWiring: {
      hostRecovery: "fixture",
      providerRecovery: "fixture",
      credentialRotation: "fixture",
      offboarding: "fixture",
      liveProviderRevocation: "NOT_WIRED",
    },
    liveRecoveryClaim: LiveRecoveryClaim.NOT_RUN,
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
  });
}

async function replacePgState(
  db: PgQueryable,
  state: RecoveryEvidenceState,
): Promise<void> {
  const sealed = sealedState(state);
  await db.query(
    `INSERT INTO recovery_evidence_state (singleton_id, live_recovery_claim, updated_at)
     VALUES ('default', 'NOT_RUN', $1::timestamptz)
     ON CONFLICT (singleton_id) DO UPDATE SET
       live_recovery_claim = 'NOT_RUN',
       updated_at = EXCLUDED.updated_at`,
    [sealed.updatedAtIso],
  );

  await db.query(`DELETE FROM recovery_timeline_events`);
  await db.query(`DELETE FROM recovery_queued_work`);
  await db.query(`DELETE FROM recovery_capability_stops`);
  await db.query(`DELETE FROM recovery_runs`);
  await db.query(`DELETE FROM recovery_artifacts`);

  for (const e of sealed.timeline) {
    await db.query(
      `INSERT INTO recovery_timeline_events (
         event_id, recorded_at_iso, plane, classification, summary,
         source_kind, related_capability_ids, queued_work_count, evidence_refs
       ) VALUES (
         $1, $2::timestamptz, $3, $4, $5, $6, $7::jsonb, $8, $9::jsonb
       )`,
      [
        e.eventId,
        e.recordedAtIso,
        e.plane,
        e.classification,
        e.summary,
        e.sourceKind,
        JSON.stringify(e.relatedCapabilityIds),
        e.queuedWorkCount,
        JSON.stringify(e.evidenceRefs),
      ],
    );
  }

  for (const w of sealed.queuedWork) {
    await db.query(
      `INSERT INTO recovery_queued_work (
         work_id, capability_id, operation_id, effect_state, queued_at_iso, summary
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, $6)`,
      [
        w.workId,
        w.capabilityId,
        w.operationId,
        w.effectState,
        w.queuedAtIso,
        w.summary,
      ],
    );
  }

  for (const s of sealed.capabilityStops) {
    await db.query(
      `INSERT INTO recovery_capability_stops (
         stop_id, capability_id, plane, reason, stopped_at_iso,
         unrelated_capabilities_allowed, resume_allowed
       ) VALUES ($1, $2, $3, $4, $5::timestamptz, true, $6)`,
      [
        s.stopId,
        s.capabilityId,
        s.plane,
        s.reason,
        s.stoppedAtIso,
        s.resumeAllowed,
      ],
    );
  }

  for (const r of sealed.runs) {
    await db.query(
      `INSERT INTO recovery_runs (
         run_id, scenario_id, status, classification,
         timeline_event_ids, capability_stop_ids, queued_work_ids, artifact_id,
         details, live_recovery_verified, live_recovery_claim, external_effects,
         production_activated, started_at_iso, ended_at_iso
       ) VALUES (
         $1, $2, $3, $4,
         $5::jsonb, $6::jsonb, $7::jsonb, $8,
         $9::jsonb, false, 'NOT_RUN', 'NONE',
         false, $10::timestamptz, $11::timestamptz
       )`,
      [
        r.runId,
        r.scenarioId,
        r.status,
        r.classification,
        JSON.stringify(r.timelineEventIds),
        JSON.stringify(r.capabilityStopIds),
        JSON.stringify(r.queuedWorkIds),
        r.artifactId,
        JSON.stringify(r.details),
        r.startedAtIso,
        r.endedAtIso,
      ],
    );
  }

  for (const a of sealed.artifacts) {
    await db.query(
      `INSERT INTO recovery_artifacts (
         artifact_id, scenario_id, environment, redacted, summary,
         classification, evidence_ref, created_at_iso
       ) VALUES ($1, $2, 'fixture', true, $3, $4, $5, $6::timestamptz)`,
      [
        a.artifactId,
        a.scenarioId,
        a.summary,
        a.classification,
        a.evidenceRef,
        a.createdAtIso,
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

export function createPgRecoveryStore(db: PgQueryable): RecoveryStore {
  const runWrite = async (
    fn: (q: PgQueryable) => Promise<RecoveryEvidenceState>,
  ): Promise<RecoveryEvidenceState> => {
    if (isPool(db)) {
      return withTransaction(db, fn);
    }
    return fn(db);
  };

  const read = async (): Promise<RecoveryEvidenceState> => loadPgState(db);

  const write = async (state: RecoveryEvidenceState): Promise<void> => {
    await runWrite(async (q) => {
      await replacePgState(q, state);
      return sealedState(state);
    });
  };

  const update = async (
    mutator: (current: RecoveryEvidenceState) => RecoveryEvidenceState,
  ): Promise<RecoveryEvidenceState> =>
    runWrite(async (q) => {
      await q.query(
        `SELECT singleton_id FROM recovery_evidence_state WHERE singleton_id = 'default' FOR UPDATE`,
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
    appendTimeline: (event) =>
      update((s) => ({
        ...s,
        timeline: [...s.timeline, event],
        updatedAtIso: event.recordedAtIso,
      })),
    upsertQueuedWork: (items) =>
      update((s) => {
        const byId = new Map(s.queuedWork.map((q) => [q.workId, q]));
        for (const item of items) {
          byId.set(item.workId, item);
        }
        return {
          ...s,
          queuedWork: [...byId.values()],
          updatedAtIso: new Date().toISOString(),
        };
      }),
    upsertCapabilityStop: (stop) =>
      update((s) => ({
        ...s,
        capabilityStops: [
          ...s.capabilityStops.filter((c) => c.stopId !== stop.stopId),
          stop,
        ],
        updatedAtIso: stop.stoppedAtIso,
      })),
    addRun: (run) =>
      update((s) => ({
        ...s,
        runs: [...s.runs, run],
        updatedAtIso: run.endedAtIso,
      })),
    addArtifact: (artifact) =>
      update((s) => ({
        ...s,
        artifacts: [...s.artifacts, artifact],
        updatedAtIso: artifact.createdAtIso,
      })),
    listTimeline: async (limit = 100) => (await read()).timeline.slice(-limit),
    listQueuedWork: async () => (await read()).queuedWork,
    listCapabilityStops: async () => (await read()).capabilityStops,
    listRuns: async (limit = 50) => (await read()).runs.slice(-limit),
    listArtifacts: async (limit = 50) => (await read()).artifacts.slice(-limit),
    status: async () => statusFromState("postgres", await read()),
  };
}

export type OpenRecoveryStoreOptions = {
  stateDir: string;
  connectionString?: string;
  forceMemory?: boolean;
  forceFile?: boolean;
};

export type OpenRecoveryStoreResult = {
  store: RecoveryStore;
  backend: RecoveryStoreBackend;
  pool: PgPool | null;
};

/**
 * Prefer Postgres when DATABASE_URL is set; otherwise file (fixture) store.
 * Memory only when forceMemory is set.
 */
export function openRecoveryStore(
  options: OpenRecoveryStoreOptions,
): OpenRecoveryStoreResult {
  if (options.forceMemory) {
    return {
      store: createMemoryRecoveryStore(),
      backend: "memory",
      pool: null,
    };
  }
  if (options.forceFile) {
    return {
      store: createFileRecoveryStore(options.stateDir),
      backend: "file",
      pool: null,
    };
  }
  const url = resolveDatabaseUrl(options.connectionString);
  if (url) {
    const pool = createPgPool({ connectionString: url, max: 4 });
    return {
      store: createPgRecoveryStore(pool),
      backend: "postgres",
      pool,
    };
  }
  return {
    store: createFileRecoveryStore(options.stateDir),
    backend: "file",
    pool: null,
  };
}
