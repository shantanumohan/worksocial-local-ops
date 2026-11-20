# Database migrations

Ordered SQL under `migrations/` (`001_…` … `013_…`).

```bash
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial
pnpm db:migrate
pnpm test:database
```

`013_durable_execution.sql` is the M2 first slice: jobs, effect intents/attempts,
gateway decisions, execution receipts, budget accounts/reservations, outbox,
and the independent fake-provider ledger. Runner: `pnpm db:migrate`
(`packages/persistence` `runMigrations`). External effects: none (simulator only).
