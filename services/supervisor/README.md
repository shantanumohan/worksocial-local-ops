# `@worksocial/supervisor`

Owns local service lifecycle for WorkSocial operations (R1-01).

## Real in this package

- Host lease (singleton local)
- Start / stop / restart of process slots: `api`, `console`, `temporal-worker`
- Doctor + health checks
- Storage-root sync-path policy enforcement before start
- VS Code / `pnpm local:*` entry via `src/cli.ts`

## Honest stubs / not wired

- `temporal-worker` slot is a **stub** process — Temporal runtime is `NOT_WIRED`
- `api` / `console` expose minimal loopback `/health` only (not full product surfaces)
- Runtime control-plane state is **file-backed** under `.worksocial/local-state` until Postgres is bound (`002_local_execution.sql` defines schema)

## Commands

```bash
pnpm local:start
pnpm local:stop
pnpm local:doctor
pnpm exec tsx services/supervisor/src/cli.ts health
pnpm exec tsx services/supervisor/src/cli.ts test-local
```
