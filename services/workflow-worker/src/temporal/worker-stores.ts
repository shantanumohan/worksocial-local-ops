/**
 * Select durable stores for the Temporal worker process.
 * Prefer Postgres (same stores as LOCAL_DURABLE). Memory only with explicit escape hatch.
 */

import {
  createPgPool,
  resolveDatabaseUrl,
  type PgPool,
} from "@worksocial/persistence";
import {
  createMemoryDurableMissionRuntime,
  createPgDurableMissionRuntime,
  type DurableMissionRuntime,
} from "../durable-mission.js";

export type TemporalWorkerStoreKind = "postgres" | "memory";

export type TemporalWorkerMissionStores = {
  runtime: DurableMissionRuntime;
  storeKind: TemporalWorkerStoreKind;
  pool: PgPool | null;
  detail: string;
};

export function resolveTemporalWorkerStoreKind(
  env: NodeJS.ProcessEnv = process.env,
  connectionString?: string,
):
  | { ok: true; kind: TemporalWorkerStoreKind; detail: string }
  | { ok: false; detail: string } {
  const url = resolveDatabaseUrl(connectionString);
  if (url) {
    return {
      ok: true,
      kind: "postgres",
      detail:
        "Temporal activities use Postgres mission_workflows + durable execution stores.",
    };
  }
  if (env.WORKSOCIAL_TEMPORAL_ALLOW_MEMORY === "1") {
    return {
      ok: true,
      kind: "memory",
      detail:
        "Temporal activities use in-memory stores (WORKSOCIAL_TEMPORAL_ALLOW_MEMORY=1). Not durable across worker restarts.",
    };
  }
  return {
    ok: false,
    detail:
      "Temporal worker requires DATABASE_URL / WORKSOCIAL_DATABASE_URL for durable activity stores. Set WORKSOCIAL_TEMPORAL_ALLOW_MEMORY=1 only for local tests.",
  };
}

/**
 * Bind PG (preferred) or memory mission runtime for Temporal activities.
 * Caller owns pool.end() when storeKind is postgres.
 */
export function createTemporalWorkerMissionStores(options?: {
  connectionString?: string;
  env?: NodeJS.ProcessEnv;
  temporalLabelOverride?: "TEMPORAL";
}): TemporalWorkerMissionStores {
  const env = options?.env ?? process.env;
  const resolved = resolveTemporalWorkerStoreKind(
    env,
    options?.connectionString,
  );
  if (!resolved.ok) {
    throw new Error(resolved.detail);
  }

  const label = options?.temporalLabelOverride ?? "TEMPORAL";

  if (resolved.kind === "postgres") {
    const pool = createPgPool({
      ...(options?.connectionString
        ? { connectionString: options.connectionString }
        : {}),
      max: 6,
    });
    return {
      runtime: createPgDurableMissionRuntime({
        pool,
        temporalLabelOverride: label,
      }),
      storeKind: "postgres",
      pool,
      detail: resolved.detail,
    };
  }

  return {
    runtime: createMemoryDurableMissionRuntime({
      temporalLabelOverride: label,
    }),
    storeKind: "memory",
    pool: null,
    detail: resolved.detail,
  };
}
