# workflow

Implemented for M2 / NEXT-10 local durable missions + Temporal wiring.

```bash
pnpm test:workflow
# with Postgres:
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial_test
pnpm test:workflow
```

Suites:

1. Offline mission enqueue + binding probe + LOCAL_DURABLE memory restart
2. Temporal local test server (`@temporalio/testing`) — happy path, worker crash/restart with **single apply**, history replay
3. Optional Postgres durable mission restart when `DATABASE_URL` is set

Optional real cluster + compose e2e (CI-required):

```bash
docker compose -f deploy/temporal/docker-compose.yml up -d
export TEMPORAL_ADDRESS=127.0.0.1:7233
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial_test
pnpm test:temporal-compose
```

Without Temporal/Docker the compose suite skips honestly unless
`WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1`.

Live CMS/Zoho/GSC remain **NOT_WIRED**. External effects: none.
