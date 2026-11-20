# Temporal binding status (NEXT-10)

**Current runtime label: `NOT_WIRED`** for a Temporal self-hosted cluster.

Local durable mission semantics (`LOCAL_DURABLE`) use PostgreSQL:

- enqueue job + workflow **before** effect ack
- lease claim with expiry
- effect accept → `ACCEPTED_PENDING`
- optional review wait
- independent verify without a second simulator apply
- crash/restart resume from durable rows

## What is still NOT_WIRED

| Capability | Status |
|---|---|
| Temporal frontend / history service | NOT_WIRED |
| `@temporalio` client + worker packages | NOT_PRESENT |
| Task-queue worker process | NOT_WIRED |
| Temporal history replay tests | NOT_WIRED |
| Console `temporalWiring` flipped to live | NOT_WIRED |

## Bind checklist

1. Run a Temporal cluster (self-host or `temporalio/auto-setup`).
2. Set `TEMPORAL_ADDRESS` (and optional `TEMPORAL_NAMESPACE`).
3. Add `@temporalio/client` + `@temporalio/worker`; host mission workflows/activities.
4. Point activities at `createPgDurableExecutionService` (same effect boundary contract).
5. CI: Temporal service + crash/restart with history replay.
6. Only then change runtime labels away from `NOT_WIRED` / `LOCAL_DURABLE`.

`probeTemporalBinding()` returns `READY_TO_BIND` when `TEMPORAL_ADDRESS` is set but the SDK is not packaged — **runtime label stays `NOT_WIRED`**.

External effects: none (simulator only). R1 is not complete.
