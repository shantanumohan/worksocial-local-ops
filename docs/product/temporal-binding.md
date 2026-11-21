# Temporal binding status (NEXT-10 / Temporal wiring)

**Runtime labels**

| Label | Meaning |
|---|---|
| `NOT_WIRED` | No reachable Temporal frontend (default honesty) |
| `READY_TO_BIND` | `TEMPORAL_ADDRESS` + SDK present; connection not yet proven |
| `TEMPORAL` | SDK connected to a reachable Temporal frontend (**reachability only** — does not certify a polling `worksocial-missions` worker) |
| `LOCAL_DURABLE` | Postgres/file mission durability without Temporal orchestration (distinct from unbound API in-process `NOT_WIRED`) |
| `FIXTURE` | Explicit fixture-only stub |

Local durable mission semantics (`LOCAL_DURABLE`) use PostgreSQL/file stores:

- enqueue job + workflow **before** effect ack
- lease claim with expiry
- effect accept → `ACCEPTED_PENDING`
- optional review wait
- independent verify without a second simulator apply
- crash/restart resume from durable rows

When Temporal is bound (`TEMPORAL`), the same effect boundary runs inside Temporal
activities on task queue `worksocial-missions`. History + worker restart replace
in-process resume; apply attempts stay idempotent on `operationId`.

## API mission enqueue

On API start, `bindTemporalMissionEnqueue` probes the frontend. When reachable it
binds `createTemporalMissionClient` so role/mission POST starts
`durableMissionWorkflow` (run is null; `temporalRunId` returned). When unset or
unreachable, enqueue stays `NOT_WIRED` and runs Claude in-process — honestly.

TEMPORAL without a bound client is refused (no Claude path labeled TEMPORAL).

## Temporal worker activity stores

`worker-main.ts` prefers Postgres (`DATABASE_URL` / `WORKSOCIAL_DATABASE_URL`) via
`createPgDurableMissionRuntime` — same stores as LOCAL_DURABLE. Memory stores
require `WORKSOCIAL_TEMPORAL_ALLOW_MEMORY=1` (tests / explicit escape).

## Packages

`@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`
are packaged in `@worksocial/workflow-worker`. SDK dependency label: **PRESENT**.

## Local Temporal cluster

```bash
docker compose -f deploy/temporal/docker-compose.yml up -d
export TEMPORAL_ADDRESS=127.0.0.1:7233
export TEMPORAL_NAMESPACE=default
export DATABASE_URL=postgres://...   # required for durable Temporal activity stores
pnpm local:start   # temporal-worker slot runs real worker when address is set
```

Without Docker, `pnpm test:workflow` uses `@temporalio/testing` `createLocal()`
(embedded test server) to prove crash/restart / replay / single apply.

## CI compose path

GitHub Actions job `temporal-compose` starts `deploy/temporal/docker-compose.yml`
(`temporalio/auto-setup`) plus app Postgres, waits via
`pnpm --filter @worksocial/workflow-worker run wait:temporal`
(`services/workflow-worker/scripts/wait-temporal-frontend.ts` — SDK dial +
`describeNamespace`; package declares `@temporalio/client`),
then runs:

```bash
WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1 pnpm test:temporal-compose
```

That suite proves **API → Temporal → PG**: `/roles/run` starts
`durableMissionWorkflow`, worker activities write Postgres, outcome `VERIFIED`
with a single apply. Fixture effects only.

Locally without Docker the suite **skips honestly** unless
`WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1`.

## Probe API

- `probeTemporalBinding(env)` — sync env/SDK probe
- `probeTemporalConnection(env)` — dials frontend; upgrades to `TEMPORAL` on success
- `runtimeTemporalLabel(report)` — console/API honesty label

`/roles/status`, `/roles/evaluate-fixture`, and `/owner/status` call
`probeTemporalConnection` (owner-staging via `@worksocial/owner-staging`).
They report `TEMPORAL` only when the frontend is reachable — never when it is not.
They do **not** check whether a worker is polling `worksocial-missions` (workflows may still queue).
`/owner/status` Temporal honesty is frontend reachability only — M4 staging CMS
missions do **not** enqueue on Temporal.
API mission enqueue uses the same probe at process start via `bindTemporalMissionEnqueue`.
Unbound API enqueue is in-process **`NOT_WIRED`**, not `LOCAL_DURABLE`.

## Still NOT_WIRED (intentionally)

| Capability | Status |
|---|---|
| Live CMS / Zoho / GSC / GA4 / GBP / social / inbox | NOT_WIRED |
| Production-activated Temporal namespace / mTLS | NOT_WIRED |
| Windows host Temporal service (AA-12) | NOT_WIRED |
| Product acceptance cases | Mostly NOT_RUN; a few fixture ACCEPTED with evidence only — never silent live VERIFIED |

External effects: none (simulator / fixture only). R1 is not complete.
