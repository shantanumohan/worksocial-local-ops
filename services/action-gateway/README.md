# `@worksocial/action-gateway`

Sole mutation authority stub (R1-02 + R1-03):

- Durable intent recorded before authorize/apply
- Standing grants + stop switch enforced via `@worksocial/domain`
- Pilot write classes require mapped ownership + prior read evidence when `productionMapping` is supplied
- Stub apply yields `ACCEPTED_PENDING` — never auto-`VERIFIED`
- No live providers; independent of Claude runner credentials

## Fixture vs durable Postgres

| Path | Persistence | Use |
|---|---|---|
| `createActionGateway()` | In-memory ledger + decisions Map | Offline unit/contract tests |
| `@worksocial/persistence` `createPgDurableExecutionService` | Postgres jobs/effects/receipts/budgets/fake-provider | M2 restart-safe accept → verify without a second apply |

Run unit tests: `pnpm --filter @worksocial/action-gateway test`  
Durable suite: `pnpm test:database` (requires `DATABASE_URL`)
