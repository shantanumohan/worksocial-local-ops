# workflow-worker

Mission enqueue + durable local mission runtime (M2 / NEXT-10) + M3 evidence missions
+ Temporal SDK wiring for local durable orchestration.

## Temporal status

| Label | Meaning |
|---|---|
| `NOT_WIRED` | No reachable Temporal frontend (default honesty) |
| `READY_TO_BIND` | `TEMPORAL_ADDRESS` + SDK present; connection not proven |
| `TEMPORAL` | SDK connected to a reachable Temporal frontend |
| `LOCAL_DURABLE` | Postgres/file-backed mission workflow (no Temporal) |
| `FIXTURE` | Explicit fixture-only Temporal stub |

Probe: `probeTemporalBinding()` / `probeTemporalConnection()`.
Docs: `docs/product/temporal-binding.md`.
Compose: `deploy/temporal/docker-compose.yml`.

## Durable mission (LOCAL_DURABLE)

`createDurableMissionRuntime` / `createMemoryDurableMissionRuntime` /
`createPgDurableMissionRuntime`:

1. Enqueue workflow + job **before** effect ack
2. Claim lease
3. Accept effect (`ACCEPTED_PENDING`) via `@worksocial/persistence`
4. Optional review wait
5. Independent verify — **no second apply**
6. `resumeAfterRestart` after process death at effect boundaries

## Temporal mission (TEMPORAL)

`durableMissionWorkflow` + activities in `src/temporal/`:

1. Same effect boundary as LOCAL_DURABLE (idempotent `operationId`)
2. Worker polls task queue `worksocial-missions`
3. Activity stores: Postgres when `DATABASE_URL` set; memory only with
   `WORKSOCIAL_TEMPORAL_ALLOW_MEMORY=1`
4. Crash/restart proven via `@temporalio/testing` local server (`pnpm test:workflow`)
5. History replay via `Worker.runReplayHistory`
6. Live compose e2e (CI): `pnpm test:temporal-compose` against
   `deploy/temporal/docker-compose.yml` — API → Temporal → PG

API: `bindTemporalMissionEnqueue` injects `createTemporalMissionClient` when the
frontend is reachable so missions start Temporal workflows (not in-process Claude).

Supervisor: when `TEMPORAL_ADDRESS` is set, the `temporal-worker` slot runs
`src/temporal/worker-main.ts` instead of the stub heartbeat.

## Evidence mission (M3 / NEXT-12)

`createEvidenceMissionRuntime` / `createMemoryEvidenceMissionRuntime` on LOCAL_DURABLE.

Not production-activated. External effects: none. Live CMS/Zoho/GSC remain NOT_WIRED.
Does not claim R1 complete or 159 acceptance VERIFIED.
