# `@worksocial/supervisor`

Owns local service lifecycle for WorkSocial operations (R1-01 / AA-33 host recovery).

## Real in this package

- Host lease (singleton local) with dead-holder reclaim
- Start / stop / **recover** / restart of process slots: `api`, `console`, `temporal-worker`
- Doctor + plane-separated health (host vs api vs console vs temporal)
- Safe default state dir **outside the git checkout** (XDG / LocalAppData); sync-path refuse
- Storage-root sync-path policy enforcement before start
- Ownership-verified stop: same-session spawn map + Linux `/proc` (heartbeat files never authorize kill)
- VS Code / `pnpm local:*` entry via `src/cli.ts`

## Honest stubs / not wired

- `temporal-worker` slot is a **stub** unless `TEMPORAL_ADDRESS` is set — then it runs the real Temporal worker (`TEMPORAL` when frontend reachable). Live CMS/Zoho/GSC stay `NOT_WIRED`.
- `api` / `console` expose minimal loopback `/health` only (not full product surfaces)
- Runtime control-plane state is **file-backed** under the resolved state dir until Postgres is bound (`002_local_execution.sql` defines schema)
- Windows AgenticArmyWS service bind is **AA-12** (out of scope)

## Commands

```bash
pnpm local:start
pnpm local:stop
pnpm local:recover
pnpm local:doctor
pnpm local:health
pnpm exec tsx services/supervisor/src/cli.ts test-local
```

See `docs/runbooks/host-service-storage.md`.
