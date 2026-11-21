# Temporal binding status (NEXT-10 / Temporal wiring)

**Runtime labels**

| Label | Meaning |
|---|---|
| `NOT_WIRED` | No reachable Temporal frontend (default honesty) |
| `READY_TO_BIND` | `TEMPORAL_ADDRESS` + SDK present; connection not yet proven |
| `TEMPORAL` | SDK connected to a reachable Temporal frontend |
| `LOCAL_DURABLE` | Postgres/file mission durability without Temporal orchestration |
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

## Packages

`@temporalio/client`, `@temporalio/worker`, `@temporalio/workflow`, `@temporalio/activity`
are packaged in `@worksocial/workflow-worker`. SDK dependency label: **PRESENT**.

## Local Temporal cluster

```bash
docker compose -f deploy/temporal/docker-compose.yml up -d
export TEMPORAL_ADDRESS=127.0.0.1:7233
export TEMPORAL_NAMESPACE=default
pnpm local:start   # temporal-worker slot runs real worker when address is set
```

Without Docker, `pnpm test:workflow` uses `@temporalio/testing` `createLocal()`
(embedded test server) to prove crash/restart / replay / single apply.

## Probe API

- `probeTemporalBinding(env)` — sync env/SDK probe
- `probeTemporalConnection(env)` — dials frontend; upgrades to `TEMPORAL` on success
- `runtimeTemporalLabel(report)` — console/API honesty label

`/roles/status` and `/roles/evaluate-fixture` call `probeTemporalConnection`.
They report `TEMPORAL` only when the frontend is reachable — never when it is not.

## Still NOT_WIRED (intentionally)

| Capability | Status |
|---|---|
| Live CMS / Zoho / GSC / GA4 / GBP / social / inbox | NOT_WIRED |
| Production-activated Temporal namespace / mTLS | NOT_WIRED |
| Windows host Temporal service (AA-12) | NOT_WIRED |
| 159 acceptance cases | NOT_RUN (do not claim VERIFIED) |

External effects: none (simulator / fixture only). R1 is not complete.
