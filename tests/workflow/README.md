# workflow

Implemented for M2 / NEXT-10 local durable missions.

```bash
pnpm test:workflow
# with Postgres:
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial_test
pnpm test:workflow
```

Temporal self-host remains **NOT_WIRED** (see `docs/product/temporal-binding.md`).
Crash/restart at effect boundaries is proven via Postgres `LOCAL_DURABLE`.
External effects: none.
