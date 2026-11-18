# worksocial-operations

Local WorkSocial operations monorepo (repository: `worksocial-local-ops`).

**Not production-activated.** No live providers, credentials, schedules, website changes, CRM writes, or customer replies. External effects: none.

## What is real (R1-01)

- **Supervisor-owned local lifecycle** — `pnpm local:start|stop|doctor|health` and VS Code tasks call `services/supervisor` (not stubs-only).
- **Detached process slots** for `api` and `console` with loopback `/health` HTTP (survive editor/terminal close); PID kill requires generation ownership; restart round-trip covered by tests / `test-local`.
- **Host lease renewed by running slots** (generation-scoped) so the CLI can exit after start.
- **Storage-root registry + sync-path policy** — refuses durable `database` / `temporal` / `secrets` under OneDrive-style paths on logical **and canonical** (symlink/junction) paths.
- **Host lease + heartbeat records** (file-backed under `.worksocial/local-state`) and SQL migration `database/migrations/002_local_execution.sql`.
- Offline **unit tests** for domain + persistence policy + supervisor lifecycle.

## What is still stub / NOT_WIRED

| Area | Status |
|------|--------|
| Temporal runtime / durable workflows | **stub** process slot — `NOT_WIRED` |
| Full API identity/commands/SSE | minimal health slot only |
| Full console React routes | minimal health slot only |
| Auth / login / standing grants | **out of scope** (R1-02) |
| Postgres bound as live control plane | schema ready; runtime state is **file-backed** until DB is wired |
| Live providers, CRM, publishing, after-hours | excluded |

Status labels stay honest: fixture / stub / `NOT_RUN` ≠ sandbox-verified or production-canary-verified.

## Layout (v6 § repository layout)

```
apps/console, apps/api
services/{supervisor,workflow-worker,claude-runner,action-gateway,credential-broker,probes,evaluation-worker}
packages/{contracts,domain,persistence,provider-adapters,observability,ui}
database/migrations
tests/{unit,integration,contract,workflow,e2e,security,eval,soak}
.claude/agents          # A01–A30 placeholders
.vscode/tasks.json
docs/{adrs,runbooks,product,contracts,v5}
```

## Developer commands

```bash
pnpm install
pnpm local:doctor | local:start | local:stop | local:health
pnpm check
pnpm test:unit          # domain + persistence + supervisor (offline)
pnpm test:database | test:workflow | test:contract | test:e2e | test:security | test:eval
pnpm recovery:rehearse | release:evidence
```

VS Code tasks: **WorkSocial: Start / Stop / Diagnostics / Test Local Operations** → supervisor CLI.

## Workspace vs database (OneDrive note)

Example owner workspace (source/content OK):  
`C:\Users\ShantanuMohan\OneDrive - myworksocial.com\Documents\AgenticArmyWS`

That path is a **workspace / artifact root example**, not a database root. **Do not** place live PostgreSQL data directories, Temporal persistence, browser-session state, or secret vault material inside consumer file-sync paths (OneDrive, etc.). Register separate roots:

| Kind | Sync folder OK? |
|------|-----------------|
| `source`, `working`, `content`, `reports`, `encrypted_backup` | yes (owner-selected) |
| `database`, `temporal`, `secrets` | **no** — keep off sync volumes |

Optional env: `WORKSOCIAL_SYNC_DENY` (comma-separated extra deny substrings), `WORKSOCIAL_STATE_DIR`, `WORKSOCIAL_HOST_ID`, `WORKSOCIAL_API_PORT`, `WORKSOCIAL_CONSOLE_PORT`.

## Acceptance vs reference-core

- `tests/acceptance-matrix-v6.json` — **159** product acceptance cases (bootstrap statuses unchanged unless a later WP updates them).
- Domain / persistence / supervisor unit tests prove local bootstrap logic offline; they are **not** production acceptance (see `docs/product/reference-core-vs-acceptance.md`).

## Specs in-repo

- `docs/product/WorkSocial_Operations_v6_implementation_baseline.md`
- `docs/WorkSocial_Local_30_Agent_Operating_System_v3.md`
- `docs/v5/*`
