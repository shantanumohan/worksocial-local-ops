# integration

Live integration suites that need external local services (Temporal compose, etc.).

## Temporal compose e2e

`deploy/temporal/docker-compose.yml` starts Temporal's own Postgres on **5433**
(user `temporal`) — that is **not** the app database. Start a separate app
Postgres on **5432** for `worksocial_test` before migrate / e2e.

```bash
# App Postgres (activity stores / migrations) — distinct from Temporal's DB
docker run -d --name worksocial-pg \
  -e POSTGRES_USER=worksocial \
  -e POSTGRES_PASSWORD=worksocial \
  -e POSTGRES_DB=worksocial_test \
  -p 5432:5432 \
  postgres:16

# Temporal auto-setup (orchestration + its own PG on 5433)
docker compose -f deploy/temporal/docker-compose.yml up -d

export TEMPORAL_ADDRESS=127.0.0.1:7233
export TEMPORAL_NAMESPACE=default
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial_test

# Optional readiness (frontend + namespace); CI runs this from workflow-worker
pnpm --filter @worksocial/workflow-worker exec tsx scripts/wait-temporal-frontend.ts

pnpm db:migrate
pnpm test:temporal-compose
```

Without Temporal/Docker the suite **skips honestly** unless
`WORKSOCIAL_TEMPORAL_COMPOSE_REQUIRED=1` (CI).

Proves: API `/roles/run` → Temporal `durableMissionWorkflow` → Postgres
mission row `VERIFIED` with a single apply. Fixture effects only.

Live CMS / Zoho / GSC remain **NOT_WIRED**. External effects: **NONE**.
