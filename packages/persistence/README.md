# `@worksocial/persistence`

Local control-plane persistence helpers:

- Storage-root registry + sync-path policy (R1-01)
- Host lease + service heartbeat record types (R1-01)
- File-backed supervisor state (R1-01)
- File-backed **authority store** — users, sessions, standing policies, grants, stop switch, audit (R1-02)
- File-backed **production mapping store** — bindings, forms, booking/CRM ownership, journeys, read evidence, labeled write-path outcomes (R1-03)
- File-backed **role-runtime store** — role status, run evidence, outcome hooks (R1-04)
- File-backed **learning store** — training runs, model registry snapshot, proposals under review
- File-backed **probe/monitoring store** — HTTP/DOM/canary runs, fixture receipts (R1-05)
- File-backed **knowledge store** — facts, instruction ingestions, demand/trend/FAQ/rank signals, fact verification outcomes (R1-06)

SQL schemas:

- `database/migrations/002_local_execution.sql`
- `database/migrations/003_identity_authority.sql`
- `database/migrations/004_production_mapping.sql`
- `database/migrations/005_role_runtime.sql`
- `database/migrations/006_learning.sql`
- `database/migrations/007_monitoring.sql`
- `database/migrations/008_knowledge.sql`

Honest interim: file-backed until Postgres is bound. No live Zoho/CMS/SERP mutations. Learning proposals cannot expand grants/spend/CRM/publish authority. Model claims are never facts.
