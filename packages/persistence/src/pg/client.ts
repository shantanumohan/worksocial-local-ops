/**
 * PostgreSQL pool factory for durable local execution (M2).
 * External effects: none. Simulator/fixture stores remain available without PG.
 */

import pg from "pg";

export type PgPool = pg.Pool;
export type PgClient = pg.PoolClient;
export type PgQueryable = Pick<pg.Pool, "query"> | Pick<pg.PoolClient, "query">;

export type CreatePgPoolOptions = {
  connectionString?: string;
  max?: number;
};

/** Resolve DATABASE_URL / WORKSOCIAL_DATABASE_URL or explicit connectionString. */
export function resolveDatabaseUrl(
  connectionString?: string,
): string | undefined {
  return (
    connectionString ??
    process.env.WORKSOCIAL_DATABASE_URL ??
    process.env.DATABASE_URL
  );
}

export function createPgPool(options: CreatePgPoolOptions = {}): PgPool {
  const connectionString = resolveDatabaseUrl(options.connectionString);
  if (!connectionString) {
    throw new Error(
      "PostgreSQL connection string required (DATABASE_URL or WORKSOCIAL_DATABASE_URL)",
    );
  }
  return new pg.Pool({
    connectionString,
    max: options.max ?? 10,
  });
}

export async function withTransaction<T>(
  pool: PgPool,
  fn: (client: PgClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}
