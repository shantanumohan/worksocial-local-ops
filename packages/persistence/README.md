# `@worksocial/persistence`

Local control-plane persistence helpers for R1-01:

- Storage-root registry (source / working / content / reports / encrypted_backup + durable database / temporal / secrets)
- Sync-path policy (refuse durable roots under OneDrive-style paths)
- Host lease + service heartbeat record types
- File-backed local state store (honest interim until Postgres is bound)

SQL schema: `database/migrations/002_local_execution.sql`.
