/**
 * Live compose e2e: API → Temporal → Postgres (fixture effects only).
 *
 * Requires TEMPORAL_ADDRESS (temporalio/auto-setup) + DATABASE_URL.
 * When WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1 (CI), missing/unreachable
 * Temporal fails the suite. Otherwise the suite skips honestly.
 *
 * External effects: NONE. Live CMS/Zoho/GSC remain NOT_WIRED.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPgPool,
  resolveDatabaseUrl,
  runMigrations,
  type PgPool,
} from "@worksocial/persistence";
import { startApiServer } from "@worksocial/api";
import {
  createTemporalMissionClient,
  createTemporalMissionWorker,
  createTemporalWorkerMissionStores,
  probeTemporalConnection,
  runtimeTemporalLabel,
  type TemporalMissionClient,
} from "@worksocial/workflow-worker";
import path from "node:path";
import { fileURLToPath } from "node:url";

type TemporalWorker = Awaited<ReturnType<typeof createTemporalMissionWorker>>;

const address = process.env.TEMPORAL_ADDRESS?.trim() || "";
const databaseUrl = resolveDatabaseUrl();
const required = process.env.WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED === "1";

let probeOk = false;
let skipReason = "";

if (!address) {
  skipReason = "TEMPORAL_ADDRESS unset — compose Temporal frontend not bound";
} else if (!databaseUrl) {
  skipReason =
    "DATABASE_URL / WORKSOCIAL_DATABASE_URL unset — PG activity stores required";
}

async function resolveProbe(): Promise<void> {
  if (skipReason) return;
  const probe = await probeTemporalConnection(process.env, { timeoutMs: 5_000 });
  if (runtimeTemporalLabel(probe) !== "TEMPORAL") {
    skipReason = `Temporal frontend unreachable at ${address}: ${probe.detail}`;
    return;
  }
  probeOk = true;
}

await resolveProbe();

if (required && !probeOk) {
  throw new Error(
    `WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1 but compose path unavailable: ${skipReason || "unknown"}`,
  );
}

const describeCompose = probeOk ? describe : describe.skip;

describeCompose("temporal compose e2e (API → Temporal → PG)", () => {
  let pool: PgPool;
  let stores: ReturnType<typeof createTemporalWorkerMissionStores>;
  let worker: TemporalWorker;
  let workerRun: Promise<void>;
  let client: TemporalMissionClient;
  let stateDir: string;
  let baseUrl: string;
  let closeApi: () => Promise<void>;

  beforeAll(async () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationsDir = path.resolve(here, "../../database/migrations");
    pool = createPgPool({ max: 6 });
    await runMigrations({ pool, migrationsDir });

    stores = createTemporalWorkerMissionStores({
      temporalLabelOverride: "TEMPORAL",
    });
    expect(stores.storeKind).toBe("postgres");

    const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || "default";
    worker = await createTemporalMissionWorker({
      address,
      namespace,
      runtime: stores.runtime,
    });
    workerRun = worker.run();

    client = await createTemporalMissionClient({ address, namespace });

    stateDir = mkdtempSync(join(tmpdir(), "ws-temporal-compose-"));
    const started = await startApiServer({
      stateDir,
      port: 0,
      consolePort: 8788,
      ownerPassword: "compose-e2e-password",
    });
    expect(started.temporalEnqueueStatus).toBe("TEMPORAL");

    await new Promise<void>((resolve, reject) => {
      started.server.listen(0, "127.0.0.1", () => resolve());
      started.server.on("error", reject);
    });
    const addr = started.server.address();
    if (!addr || typeof addr === "string") {
      throw new Error("API server has no listen address");
    }
    baseUrl = `http://127.0.0.1:${addr.port}`;
    started.runtime.apiOrigin = baseUrl;
    started.runtime.consoleOrigin = baseUrl;

    closeApi = () =>
      new Promise<void>((resolve, reject) => {
        started.server.close((err) => (err ? reject(err) : resolve()));
      });
  }, 180_000);

  afterAll(async () => {
    if (closeApi) {
      await closeApi().catch(() => undefined);
    }
    if (client) {
      await client.close().catch(() => undefined);
    }
    if (worker) {
      worker.shutdown();
      await workerRun?.catch(() => undefined);
    }
    if (stores?.pool) {
      await stores.pool.end().catch(() => undefined);
    }
    if (pool) {
      await pool.end().catch(() => undefined);
    }
    if (stateDir) {
      rmSync(stateDir, { recursive: true, force: true });
    }
  });

  it("runs /roles/run through Temporal to VERIFIED with a single PG apply", async () => {
    const login = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
      },
      body: JSON.stringify({
        username: "owner",
        password: "compose-e2e-password",
      }),
    });
    expect(login.status).toBe(200);
    const loginBody = (await login.json()) as { csrfToken: string };
    const cookieHeader = (
      login.headers.getSetCookie?.()[0] ?? login.headers.get("set-cookie")!
    ).split(";")[0]!;

    const stateRes = await fetch(`${baseUrl}/roles/state`, {
      headers: { origin: baseUrl, cookie: cookieHeader },
    });
    expect(stateRes.status).toBe(200);
    const state = (await stateRes.json()) as {
      temporalWiring: string;
      temporalEnqueueStatus: string;
    };
    expect(state.temporalWiring).toBe("TEMPORAL");
    expect(state.temporalEnqueueStatus).toBe("TEMPORAL");

    const runRes = await fetch(`${baseUrl}/roles/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: baseUrl,
        cookie: cookieHeader,
        "x-csrf-token": loginBody.csrfToken,
      },
      body: JSON.stringify({ roleId: "A01", trigger: "temporal_compose_e2e" }),
    });
    expect(runRes.status).toBe(200);
    const body = (await runRes.json()) as {
      mission: {
        accepted: boolean;
        temporalStatus: string;
        temporalRunId: string | null;
        workflowId: string;
        detail: string;
      };
      run: unknown;
    };
    expect(body.mission.accepted).toBe(true);
    expect(body.mission.temporalStatus).toBe("TEMPORAL");
    expect(body.mission.temporalRunId).toBeTruthy();
    expect(body.run).toBeNull();

    const temporalWorkflowId = `mission-${body.mission.workflowId}`;
    const result = await client.awaitMission(temporalWorkflowId);
    expect(result.outcome).toBe("VERIFIED");
    expect(result.temporalWiring).toBe("TEMPORAL");
    expect(result.applyAttemptCount).toBe(1);
    expect(result.phase).toBe("succeeded");

    const wf = await stores.runtime.getWorkflow(body.mission.workflowId);
    expect(wf?.phase).toBe("succeeded");
    expect(wf?.temporalWiring).toBe("TEMPORAL");
    expect(wf?.applyAttemptCount).toBe(1);
  }, 180_000);
});

if (!probeOk) {
  describe("temporal compose e2e (honest skip)", () => {
    it("documents skipped compose path when Temporal/Docker unavailable", () => {
      expect(skipReason.length).toBeGreaterThan(0);
      console.log(
        JSON.stringify({
          suite: "test:temporal-compose",
          status: "SKIPPED",
          reason: skipReason,
          note: "Set TEMPORAL_ADDRESS + DATABASE_URL and start deploy/temporal compose, or run CI temporal-compose job.",
          productionActivated: false,
          externalEffects: "NONE",
        }),
      );
    });
  });
}
