# workflow-worker

Mission enqueue + durable local mission runtime (M2 / NEXT-10).

## Temporal status

| Label | Meaning |
|---|---|
| `NOT_WIRED` | No Temporal cluster / SDK bound (default honesty for Temporal) |
| `LOCAL_DURABLE` | Postgres-backed mission workflow (enqueue, leases, review, effect restart) |
| `FIXTURE` | Explicit fixture-only Temporal stub |

Probe: `probeTemporalBinding()`. Docs: `docs/product/temporal-binding.md`.

## Durable mission

`createDurableMissionRuntime` / `createMemoryDurableMissionRuntime`:

1. Enqueue workflow + job **before** effect ack
2. Claim lease
3. Accept effect (`ACCEPTED_PENDING`) via `@worksocial/persistence`
4. Optional review wait
5. Independent verify — **no second apply**
6. `resumeAfterRestart` after process death at effect boundaries

Not production-activated. External effects: none.
