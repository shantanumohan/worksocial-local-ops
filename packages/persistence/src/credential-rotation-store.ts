/**
 * Credential rotation / offboarding store (WP10 / F24 / AA-48 PG cutover).
 * Schema: database/migrations/026_credential_rotation.sql
 *          + 027_credential_recovery_state.sql
 *          + 028_credential_rebind.sql (T-X029)
 *
 * Backends:
 * - memory — fixture/unit fallback
 * - file — default when DATABASE_URL unset
 * - postgres — when DATABASE_URL / WORKSOCIAL_DATABASE_URL set
 *
 * Live provider revocation stays NOT_WIRED. External effects: NONE. Catalog: NOT_RUN.
 * T-X029 fixture ACCEPTED only via explicit rebind evidence — not live VERIFIED.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  emptyCredentialRotationState,
  type CredentialAuditEntry,
  type CredentialQueuedWorkItem,
  type CredentialRebindRecord,
  type CredentialRotationRecord,
  type CredentialRotationState,
  type FixtureCredentialConnection,
  type OffboardingManifest,
} from "@worksocial/domain";
import {
  createPgPool,
  resolveDatabaseUrl,
  withTransaction,
  type PgPool,
  type PgQueryable,
} from "./pg/client.js";

export type CredentialRotationStoreBackend = "memory" | "file" | "postgres";

export type CredentialRotationStoreStatus = {
  backend: CredentialRotationStoreBackend;
  connectionCount: number;
  activeCount: number;
  revokedCount: number;
  queuedWorkCount: number;
  auditCount: number;
  rotationCount: number;
  rebindCount: number;
  manifestCount: number;
  liveWiring: CredentialRotationState["liveWiring"];
  catalogClaim: "NOT_RUN";
  chatgptAdsWiring: "NOT_WIRED";
  productionActivated: false;
  externalEffects: "NONE";
  honestNote: string;
};

export type CredentialRotationStore = {
  readonly backend: CredentialRotationStoreBackend;
  readonly stateDir: string;
  read(): Promise<CredentialRotationState>;
  write(state: CredentialRotationState): Promise<void>;
  update(
    mutator: (current: CredentialRotationState) => CredentialRotationState,
  ): Promise<CredentialRotationState>;
  upsertConnection(
    connection: FixtureCredentialConnection,
  ): Promise<CredentialRotationState>;
  upsertQueuedWork(
    items: CredentialQueuedWorkItem[],
  ): Promise<CredentialRotationState>;
  appendAudit(entry: CredentialAuditEntry): Promise<CredentialRotationState>;
  addRotation(
    record: CredentialRotationRecord,
  ): Promise<CredentialRotationState>;
  addRebind(record: CredentialRebindRecord): Promise<CredentialRotationState>;
  addManifest(manifest: OffboardingManifest): Promise<CredentialRotationState>;
  getConnection(
    connectionId: string,
  ): Promise<FixtureCredentialConnection | null>;
  listConnections(): Promise<FixtureCredentialConnection[]>;
  listQueuedWork(connectionId?: string): Promise<CredentialQueuedWorkItem[]>;
  listAudit(limit?: number): Promise<CredentialAuditEntry[]>;
  listRotations(limit?: number): Promise<CredentialRotationRecord[]>;
  listRebinds(limit?: number): Promise<CredentialRebindRecord[]>;
  listManifests(limit?: number): Promise<OffboardingManifest[]>;
  status(): Promise<CredentialRotationStoreStatus>;
};

const HONEST_NOTE =
  "Fixture credential revoke/rotate/rebind/offboard only. Different-account tokens require explicit rebind (T-X029). Live provider revocation NOT_WIRED. External effects NONE. Broader catalog NOT_RUN. PG persistence ≠ live VERIFIED.";

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

function sealedState(state: CredentialRotationState): CredentialRotationState {
  return {
    ...state,
    rebinds: state.rebinds ?? [],
    liveWiring: {
      localRevoke: "fixture",
      localRotation: "fixture",
      localRebind: "fixture",
      offboardingManifest: "fixture",
      liveProviderRevocation: "NOT_WIRED",
    },
    catalogClaim: "NOT_RUN",
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
    externalEffects: "NONE",
  };
}

function normalizeState(
  raw: CredentialRotationState | null,
  fallbackIso: string,
): CredentialRotationState {
  if (!raw || raw.version !== 1) {
    return emptyCredentialRotationState(fallbackIso);
  }
  const base = emptyCredentialRotationState(raw.updatedAtIso ?? fallbackIso);
  return sealedState({
    ...base,
    ...raw,
    connections: raw.connections ?? [],
    queuedWork: raw.queuedWork ?? [],
    audit: raw.audit ?? [],
    rotations: raw.rotations ?? [],
    rebinds: raw.rebinds ?? [],
    offboardingManifests: raw.offboardingManifests ?? [],
  });
}

function statusFromState(
  backend: CredentialRotationStoreBackend,
  state: CredentialRotationState,
): CredentialRotationStoreStatus {
  return {
    backend,
    connectionCount: state.connections.length,
    activeCount: state.connections.filter((c) => c.status === "ACTIVE").length,
    revokedCount: state.connections.filter(
      (c) => c.status === "REVOKED" || c.status === "ROTATED_AWAY",
    ).length,
    queuedWorkCount: state.queuedWork.length,
    auditCount: state.audit.length,
    rotationCount: state.rotations.length,
    rebindCount: state.rebinds.length,
    manifestCount: state.offboardingManifests.length,
    liveWiring: state.liveWiring,
    catalogClaim: "NOT_RUN",
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
    externalEffects: "NONE",
    honestNote: HONEST_NOTE,
  };
}

function createStateBackedStore(input: {
  backend: CredentialRotationStoreBackend;
  stateDir: string;
  load: () => CredentialRotationState;
  save: (state: CredentialRotationState) => void;
}): CredentialRotationStore {
  const { backend, stateDir, load, save } = input;

  const read = async (): Promise<CredentialRotationState> =>
    sealedState(load());

  const write = async (state: CredentialRotationState): Promise<void> => {
    save(sealedState(state));
  };

  const update = async (
    mutator: (current: CredentialRotationState) => CredentialRotationState,
  ): Promise<CredentialRotationState> => {
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
          connections: [...others, connection],
          updatedAtIso: connection.revokedAtIso ?? connection.createdAtIso,
        };
      }),
    upsertQueuedWork: (items) =>
      update((state) => {
        const byId = new Map(state.queuedWork.map((w) => [w.workId, w]));
        for (const item of items) {
          byId.set(item.workId, item);
        }
        return {
          ...state,
          queuedWork: [...byId.values()],
          updatedAtIso: new Date().toISOString(),
        };
      }),
    appendAudit: (entry) =>
      update((state) => ({
        ...state,
        audit: [...state.audit, entry],
        updatedAtIso: entry.recordedAtIso,
      })),
    addRotation: (record) =>
      update((state) => ({
        ...state,
        rotations: [...state.rotations, record],
        updatedAtIso: record.createdAtIso,
      })),
    addRebind: (record) =>
      update((state) => ({
        ...state,
        rebinds: [...state.rebinds, record],
        updatedAtIso: record.createdAtIso,
      })),
    addManifest: (manifest) =>
      update((state) => ({
        ...state,
        offboardingManifests: [...state.offboardingManifests, manifest],
        updatedAtIso: manifest.createdAtIso,
      })),
    getConnection: async (connectionId) =>
      (await read()).connections.find((c) => c.connectionId === connectionId) ??
      null,
    listConnections: async () => (await read()).connections,
    listQueuedWork: async (connectionId) => {
      const items = (await read()).queuedWork;
      return connectionId
        ? items.filter((w) => w.connectionId === connectionId)
        : items;
    },
    listAudit: async (limit = 100) => (await read()).audit.slice(-limit),
    listRotations: async (limit = 50) => (await read()).rotations.slice(-limit),
    listRebinds: async (limit = 50) => (await read()).rebinds.slice(-limit),
    listManifests: async (limit = 50) =>
      (await read()).offboardingManifests.slice(-limit),
    status: async () => statusFromState(backend, await read()),
  };
}

export function defaultCredentialRotationStateDir(baseDir: string): string {
  return join(baseDir, "credential-rotation");
}

export function createMemoryCredentialRotationStore(
  initial?: CredentialRotationState,
): CredentialRotationStore {
  let current = sealedState(
    initial ?? emptyCredentialRotationState(new Date().toISOString()),
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

export function createFileCredentialRotationStore(
  stateDir: string,
): CredentialRotationStore {
  const dir = join(stateDir, "credential-rotation");
  const statePath = join(dir, "credential-rotation-state.json");

  return createStateBackedStore({
    backend: "file",
    stateDir: dir,
    load: () =>
      normalizeState(
        readJsonFile<CredentialRotationState>(statePath),
        new Date().toISOString(),
      ),
    save: (state) => {
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

function rowToConnection(
  row: Record<string, unknown>,
): FixtureCredentialConnection {
  const created = asIso(row.created_at_iso, new Date().toISOString());
  return {
    connectionId: String(row.connection_id),
    providerId: String(row.provider_id),
    referenceId: String(row.reference_id),
    accountLabel: String(row.account_label),
    status: row.status as FixtureCredentialConnection["status"],
    connectionState:
      row.connection_state as FixtureCredentialConnection["connectionState"],
    writeReadiness:
      row.write_readiness as FixtureCredentialConnection["writeReadiness"],
    verificationState:
      row.verification_state as FixtureCredentialConnection["verificationState"],
    scopes: asJson<string[]>(row.scopes, []),
    createdAtIso: created,
    revokedAtIso:
      row.revoked_at_iso == null ? null : asIso(row.revoked_at_iso, created),
    rotatedToReferenceId:
      row.rotated_to_reference_id == null
        ? null
        : String(row.rotated_to_reference_id),
    approvedBy: row.approved_by == null ? null : String(row.approved_by),
  };
}

function rowToQueued(
  row: Record<string, unknown>,
): CredentialQueuedWorkItem {
  return {
    workId: String(row.work_id),
    connectionId: String(row.connection_id),
    capabilityId: String(row.capability_id),
    operationId: row.operation_id == null ? null : String(row.operation_id),
    effectState: row.effect_state as CredentialQueuedWorkItem["effectState"],
    queuedAtIso: asIso(row.queued_at_iso, new Date().toISOString()),
    summary: String(row.summary),
  };
}

function rowToAudit(row: Record<string, unknown>): CredentialAuditEntry {
  return {
    entryId: String(row.entry_id),
    kind: row.kind as CredentialAuditEntry["kind"],
    connectionId:
      row.connection_id == null ? null : String(row.connection_id),
    referenceId: row.reference_id == null ? null : String(row.reference_id),
    summary: String(row.summary),
    redacted: true,
    recordedAtIso: asIso(row.recorded_at_iso, new Date().toISOString()),
    details: asJson<CredentialAuditEntry["details"]>(row.details, {}),
  };
}

function rowToRotation(
  row: Record<string, unknown>,
): CredentialRotationRecord {
  return {
    rotationId: String(row.rotation_id),
    connectionId: String(row.connection_id),
    oldReferenceId: String(row.old_reference_id),
    newReferenceId: String(row.new_reference_id),
    approvedBy: String(row.approved_by),
    localSwitchComplete: true,
    sameAccount: true,
    liveProviderRevoke: "NOT_WIRED",
    secretsExported: false,
    createdAtIso: asIso(row.created_at_iso, new Date().toISOString()),
    summary: String(row.summary),
  };
}

function rowToRebind(row: Record<string, unknown>): CredentialRebindRecord {
  return {
    rebindId: String(row.rebind_id),
    oldConnectionId: String(row.old_connection_id),
    newConnectionId: String(row.new_connection_id),
    oldAccountLabel: String(row.old_account_label),
    newAccountLabel: String(row.new_account_label),
    oldReferenceId: String(row.old_reference_id),
    newReferenceId: String(row.new_reference_id),
    approvedBy: String(row.approved_by),
    explicitRebind: true,
    silentRefreshRejected: true,
    localSwitchComplete: true,
    liveProviderRevoke: "NOT_WIRED",
    secretsExported: false,
    catalogCaseId: "T-X029",
    externalEffects: "NONE",
    createdAtIso: asIso(row.created_at_iso, new Date().toISOString()),
    summary: String(row.summary),
  };
}

function rowToManifest(row: Record<string, unknown>): OffboardingManifest {
  return {
    manifestId: String(row.manifest_id),
    connectionId: String(row.connection_id),
    revokedLocally: true,
    schedulesDisabled: true,
    queuedCancelledCount: Number(row.queued_cancelled_count ?? 0),
    queuedRetainedPostApplyCount: Number(
      row.queued_retained_post_apply_count ?? 0,
    ),
    auditRetained: true,
    residualObligations: asJson<OffboardingManifest["residualObligations"]>(
      row.residual_obligations,
      [],
    ),
    liveProviderRevoke: "NOT_WIRED",
    externalEffects: "NONE",
    productionActivated: false,
    catalogClaim: "NOT_RUN",
    createdAtIso: asIso(row.created_at_iso, new Date().toISOString()),
    summary: String(row.summary),
  };
}

async function loadPgState(db: PgQueryable): Promise<CredentialRotationState> {
  const nowIso = new Date().toISOString();
  const meta = await db.query(
    `SELECT updated_at FROM credential_rotation_state WHERE singleton_id = 'default'`,
  );
  const connections = await db.query(
    `SELECT * FROM credential_connections ORDER BY created_at_iso ASC`,
  );
  const queued = await db.query(
    `SELECT * FROM credential_queued_work ORDER BY queued_at_iso ASC`,
  );
  const audit = await db.query(
    `SELECT * FROM credential_audit_entries ORDER BY recorded_at_iso ASC`,
  );
  const rotations = await db.query(
    `SELECT * FROM credential_rotations ORDER BY created_at_iso ASC`,
  );
  const rebinds = await db.query(
    `SELECT * FROM credential_rebinds ORDER BY created_at_iso ASC`,
  );
  const manifests = await db.query(
    `SELECT * FROM credential_offboarding_manifests ORDER BY created_at_iso ASC`,
  );

  const updatedAtIso = meta.rows[0]
    ? asIso(meta.rows[0].updated_at, nowIso)
    : nowIso;

  return sealedState({
    version: 1,
    updatedAtIso,
    connections: connections.rows.map((r) =>
      rowToConnection(r as Record<string, unknown>),
    ),
    queuedWork: queued.rows.map((r) =>
      rowToQueued(r as Record<string, unknown>),
    ),
    audit: audit.rows.map((r) => rowToAudit(r as Record<string, unknown>)),
    rotations: rotations.rows.map((r) =>
      rowToRotation(r as Record<string, unknown>),
    ),
    rebinds: rebinds.rows.map((r) =>
      rowToRebind(r as Record<string, unknown>),
    ),
    offboardingManifests: manifests.rows.map((r) =>
      rowToManifest(r as Record<string, unknown>),
    ),
    liveWiring: {
      localRevoke: "fixture",
      localRotation: "fixture",
      localRebind: "fixture",
      offboardingManifest: "fixture",
      liveProviderRevocation: "NOT_WIRED",
    },
    catalogClaim: "NOT_RUN",
    chatgptAdsWiring: "NOT_WIRED",
    productionActivated: false,
    externalEffects: "NONE",
  });
}

async function replacePgState(
  db: PgQueryable,
  state: CredentialRotationState,
): Promise<void> {
  const sealed = sealedState(state);
  await db.query(
    `INSERT INTO credential_rotation_state (singleton_id, updated_at)
     VALUES ('default', $1::timestamptz)
     ON CONFLICT (singleton_id) DO UPDATE SET updated_at = EXCLUDED.updated_at`,
    [sealed.updatedAtIso],
  );

  await db.query(`DELETE FROM credential_queued_work`);
  await db.query(`DELETE FROM credential_audit_entries`);
  await db.query(`DELETE FROM credential_rotations`);
  await db.query(`DELETE FROM credential_rebinds`);
  await db.query(`DELETE FROM credential_offboarding_manifests`);
  await db.query(`DELETE FROM credential_connections`);

  for (const c of sealed.connections) {
    await db.query(
      `INSERT INTO credential_connections (
         connection_id, provider_id, reference_id, account_label, status,
         connection_state, write_readiness, verification_state, scopes,
         created_at_iso, revoked_at_iso, rotated_to_reference_id, approved_by
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9::jsonb,
         $10::timestamptz, $11::timestamptz, $12, $13
       )`,
      [
        c.connectionId,
        c.providerId,
        c.referenceId,
        c.accountLabel,
        c.status,
        c.connectionState,
        c.writeReadiness,
        c.verificationState,
        JSON.stringify(c.scopes),
        c.createdAtIso,
        c.revokedAtIso,
        c.rotatedToReferenceId,
        c.approvedBy,
      ],
    );
  }

  for (const w of sealed.queuedWork) {
    await db.query(
      `INSERT INTO credential_queued_work (
         work_id, connection_id, capability_id, operation_id,
         effect_state, queued_at_iso, summary
       ) VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7)`,
      [
        w.workId,
        w.connectionId,
        w.capabilityId,
        w.operationId,
        w.effectState,
        w.queuedAtIso,
        w.summary,
      ],
    );
  }

  for (const a of sealed.audit) {
    await db.query(
      `INSERT INTO credential_audit_entries (
         entry_id, kind, connection_id, reference_id, summary,
         redacted, recorded_at_iso, details
       ) VALUES ($1, $2, $3, $4, $5, true, $6::timestamptz, $7::jsonb)`,
      [
        a.entryId,
        a.kind,
        a.connectionId,
        a.referenceId,
        a.summary,
        a.recordedAtIso,
        JSON.stringify(a.details),
      ],
    );
  }

  for (const r of sealed.rotations) {
    await db.query(
      `INSERT INTO credential_rotations (
         rotation_id, connection_id, old_reference_id, new_reference_id,
         approved_by, local_switch_complete, live_provider_revoke,
         secrets_exported, created_at_iso, summary
       ) VALUES (
         $1, $2, $3, $4, $5, true, 'NOT_WIRED', false, $6::timestamptz, $7
       )`,
      [
        r.rotationId,
        r.connectionId,
        r.oldReferenceId,
        r.newReferenceId,
        r.approvedBy,
        r.createdAtIso,
        r.summary,
      ],
    );
  }

  for (const r of sealed.rebinds) {
    await db.query(
      `INSERT INTO credential_rebinds (
         rebind_id, old_connection_id, new_connection_id,
         old_account_label, new_account_label, old_reference_id, new_reference_id,
         approved_by, explicit_rebind, silent_refresh_rejected,
         local_switch_complete, live_provider_revoke, secrets_exported,
         catalog_case_id, external_effects, created_at_iso, summary
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8,
         true, true, true, 'NOT_WIRED', false, 'T-X029', 'NONE',
         $9::timestamptz, $10
       )`,
      [
        r.rebindId,
        r.oldConnectionId,
        r.newConnectionId,
        r.oldAccountLabel,
        r.newAccountLabel,
        r.oldReferenceId,
        r.newReferenceId,
        r.approvedBy,
        r.createdAtIso,
        r.summary,
      ],
    );
  }

  for (const m of sealed.offboardingManifests) {
    await db.query(
      `INSERT INTO credential_offboarding_manifests (
         manifest_id, connection_id, revoked_locally, schedules_disabled,
         queued_cancelled_count, queued_retained_post_apply_count, audit_retained,
         residual_obligations, live_provider_revoke, external_effects,
         production_activated, catalog_claim, created_at_iso, summary
       ) VALUES (
         $1, $2, true, true, $3, $4, true,
         $5::jsonb, 'NOT_WIRED', 'NONE', false, 'NOT_RUN', $6::timestamptz, $7
       )`,
      [
        m.manifestId,
        m.connectionId,
        m.queuedCancelledCount,
        m.queuedRetainedPostApplyCount,
        JSON.stringify(m.residualObligations),
        m.createdAtIso,
        m.summary,
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

export function createPgCredentialRotationStore(
  db: PgQueryable,
): CredentialRotationStore {
  const runWrite = async (
    fn: (q: PgQueryable) => Promise<CredentialRotationState>,
  ): Promise<CredentialRotationState> => {
    if (isPool(db)) {
      return withTransaction(db, fn);
    }
    return fn(db);
  };

  const read = async (): Promise<CredentialRotationState> => loadPgState(db);

  const write = async (state: CredentialRotationState): Promise<void> => {
    await runWrite(async (q) => {
      await replacePgState(q, state);
      return sealedState(state);
    });
  };

  const update = async (
    mutator: (current: CredentialRotationState) => CredentialRotationState,
  ): Promise<CredentialRotationState> =>
    runWrite(async (q) => {
      await q.query(
        `SELECT singleton_id FROM credential_rotation_state WHERE singleton_id = 'default' FOR UPDATE`,
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
          connections: [...others, connection],
          updatedAtIso: connection.revokedAtIso ?? connection.createdAtIso,
        };
      }),
    upsertQueuedWork: (items) =>
      update((state) => {
        const byId = new Map(state.queuedWork.map((w) => [w.workId, w]));
        for (const item of items) {
          byId.set(item.workId, item);
        }
        return {
          ...state,
          queuedWork: [...byId.values()],
          updatedAtIso: new Date().toISOString(),
        };
      }),
    appendAudit: (entry) =>
      update((state) => ({
        ...state,
        audit: [...state.audit, entry],
        updatedAtIso: entry.recordedAtIso,
      })),
    addRotation: (record) =>
      update((state) => ({
        ...state,
        rotations: [...state.rotations, record],
        updatedAtIso: record.createdAtIso,
      })),
    addRebind: (record) =>
      update((state) => ({
        ...state,
        rebinds: [...state.rebinds, record],
        updatedAtIso: record.createdAtIso,
      })),
    addManifest: (manifest) =>
      update((state) => ({
        ...state,
        offboardingManifests: [...state.offboardingManifests, manifest],
        updatedAtIso: manifest.createdAtIso,
      })),
    getConnection: async (connectionId) =>
      (await read()).connections.find((c) => c.connectionId === connectionId) ??
      null,
    listConnections: async () => (await read()).connections,
    listQueuedWork: async (connectionId) => {
      const items = (await read()).queuedWork;
      return connectionId
        ? items.filter((w) => w.connectionId === connectionId)
        : items;
    },
    listAudit: async (limit = 100) => (await read()).audit.slice(-limit),
    listRotations: async (limit = 50) => (await read()).rotations.slice(-limit),
    listRebinds: async (limit = 50) => (await read()).rebinds.slice(-limit),
    listManifests: async (limit = 50) =>
      (await read()).offboardingManifests.slice(-limit),
    status: async () => statusFromState("postgres", await read()),
  };
}

export type OpenCredentialRotationStoreOptions = {
  stateDir: string;
  connectionString?: string;
  forceMemory?: boolean;
  forceFile?: boolean;
};

export type OpenCredentialRotationStoreResult = {
  store: CredentialRotationStore;
  backend: CredentialRotationStoreBackend;
  pool: PgPool | null;
};

/**
 * Prefer Postgres when DATABASE_URL is set; otherwise file (fixture) store.
 * Memory only when forceMemory is set.
 */
export function openCredentialRotationStore(
  options: OpenCredentialRotationStoreOptions,
): OpenCredentialRotationStoreResult {
  if (options.forceMemory) {
    return {
      store: createMemoryCredentialRotationStore(),
      backend: "memory",
      pool: null,
    };
  }
  if (options.forceFile) {
    return {
      store: createFileCredentialRotationStore(options.stateDir),
      backend: "file",
      pool: null,
    };
  }
  const url = resolveDatabaseUrl(options.connectionString);
  if (url) {
    const pool = createPgPool({ connectionString: url, max: 4 });
    return {
      store: createPgCredentialRotationStore(pool),
      backend: "postgres",
      pool,
    };
  }
  return {
    store: createFileCredentialRotationStore(options.stateDir),
    backend: "file",
    pool: null,
  };
}
