# Database migrations

Ordered SQL under `migrations/` (`001_…` … `019_…`).

```bash
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial
pnpm db:migrate
pnpm test:database
```

`013_durable_execution.sql` is the M2 first slice: jobs, effect intents/attempts,
gateway decisions, execution receipts, budget accounts/reservations, outbox,
and the independent fake-provider ledger. `014_mission_workflows.sql` adds LOCAL_DURABLE
mission rows. `015_artifacts.sql` is the M3 schema companion for immutable artifact
revisions and A25 review bindings (file-backed store until Postgres cutover).
`016_owner_staging.sql` is the M4 companion for owner activation, collectors,
missions, and staging CMS read-back (file-backed until Postgres cutover).
`017_lead_capture.sql` is the M5 companion for lead-capture journeys, synthetic
cleanup events, and commerce projection checks (file-backed until Postgres cutover).
`018_inbox_m7.sql` is the M7 companion for delivered status, webhook coalesce
events, ownership versioning, and lead coalesce keys (file-backed until Postgres cutover).
`019_canonical_publish.sql` is the M6 companion for claim/source records,
content review bindings, and multi-destination distribution runs (file-backed
until Postgres cutover).
Runner: `pnpm db:migrate` (`packages/persistence` `runMigrations`).
External effects: none (simulator only).
