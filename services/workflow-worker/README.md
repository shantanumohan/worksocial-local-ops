# workflow-worker

Mission enqueue + durable local mission runtime (M2 / NEXT-10) + M3 evidence missions.

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

## Evidence mission (M3 / NEXT-12)

`createEvidenceMissionRuntime` / `createMemoryEvidenceMissionRuntime`:

1. Compile trust-labeled input package (fail-closed on stale/unauthorized/oversized)
2. Writer role job (offline fake/fixture by default; live fail-closed)
3. Persist proposal + A25 review artifacts
4. Separate A25 review bound to exact proposal revision + evidence digest
5. LOCAL_DURABLE enqueue → accept → review → verify; restart preserves history

Not production-activated. External effects: none. Does not claim R1 complete.
