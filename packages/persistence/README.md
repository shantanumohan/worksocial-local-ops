# `@worksocial/persistence`

Local control-plane persistence helpers:

- Storage-root registry + sync-path policy (R1-01)
- Safe host path defaults outside the checkout (`resolveHostPaths` / XDG / LocalAppData) (AA-33)
- Host lease + dead-holder reclaim + plane-separated health (R1-01 / AA-33)
- Process ownership probes (`/proc` for kill auth; heartbeat files are health-only)
- File-backed supervisor state (R1-01)
- File-backed **authority store** — users, sessions, standing policies, grants, stop switch, audit (R1-02)
- File-backed **production mapping store** — bindings, forms, booking/CRM ownership, journeys, read evidence, labeled write-path outcomes (R1-03)
- File-backed **role-runtime store** — role status, run evidence, outcome hooks (R1-04)
- File-backed **learning store** — training runs, model registry snapshot, proposals under review
- File-backed **probe/monitoring store** — HTTP/DOM/canary runs, fixture receipts (R1-05)
- File-backed **knowledge store** — facts, instruction ingestions, demand/trend/FAQ/rank signals, fact verification outcomes (R1-06)
- **M2 durable execution (Postgres)** — jobs, effect intents/attempts, gateway decisions, receipts, budget reservations, outbox, independent fake-provider ledger (`013_durable_execution.sql`)

## Durable execution (NEXT-08 / NEXT-09)

| Interface | Memory/fixture | Postgres |
|---|---|---|
| `JobStore` | `createMemoryJobStore` | `createPgJobStore` |
| `EffectStore` | `createMemoryEffectStore` | `createPgEffectStore` |
| `BudgetStore` | `createMemoryBudgetStore` | `createPgBudgetStore` |
| `ReceiptStore` | `createMemoryReceiptStore` | `createPgReceiptStore` |
| `GatewayDecisionStore` | `createMemoryGatewayDecisionStore` | `createPgGatewayDecisionStore` |
| `FakeProviderStore` | `createMemoryFakeProviderStore` | `createPgFakeProviderStore` |

`createPgDurableExecutionService(pool)` runs accept in one transaction:
stable idempotency key → job + effect + outbox + budget reserve → fake-provider apply once → `ACCEPTED_PENDING`.
Independent read-back verifies without a second apply. `ACCEPTED ≠ VERIFIED`.

```bash
export DATABASE_URL=postgres://worksocial:worksocial@127.0.0.1:5432/worksocial
pnpm db:migrate
pnpm test:database
```

SQL schemas: `database/migrations/001_*.sql` … `013_durable_execution.sql`.
File-backed domain stores remain for authority/content/etc. until later cutovers.
No live Zoho/CMS/SERP mutations. Learning proposals cannot expand authority.
Model claims are never facts. R1 is not complete.
