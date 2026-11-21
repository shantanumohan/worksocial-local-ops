# integration

Live integration suites that need external local services (Temporal compose, etc.).

## Temporal compose e2e

```bash
docker compose -f deploy/temporal/docker-compose.yml up -d
export TEMPORAL_ADDRESS=127.0.0.1:7233
export TEMPORAL_NAMESPACE=default
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial_test
pnpm db:migrate
pnpm test:temporal-compose
```

Without Temporal/Docker the suite **skips honestly** unless
`WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1` (CI).

Proves: API `/roles/run` → Temporal `durableMissionWorkflow` → Postgres
mission row `VERIFIED` with a single apply. Fixture effects only.

Live CMS / Zoho / GSC remain **NOT_WIRED**. External effects: **NONE**.
)