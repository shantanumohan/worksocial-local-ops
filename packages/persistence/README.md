# `@worksocial/persistence`

Local control-plane persistence helpers:

- Storage-root registry + sync-path policy (R1-01)
- Host lease + service heartbeat record types (R1-01)
- File-backed supervisor state (R1-01)
- File-backed **authority store** — users, sessions, standing policies, grants, stop switch, audit (R1-02)

SQL schemas:

- `database/migrations/002_local_execution.sql`
- `database/migrations/003_identity_authority.sql`

Honest interim: file-backed until Postgres is bound. No live providers.
