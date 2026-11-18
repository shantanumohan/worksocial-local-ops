# worksocial-operations

Local WorkSocial operations monorepo (repository: `worksocial-local-ops`).

**Not production-activated.** This scaffold (Release 1 / WP01–WP02) does not enable live providers, credentials, schedules, website changes, CRM writes, or customer replies. External effects: none.

## What this is

- TypeScript monorepo for a **local** operating system: VS Code tasks → supervisor → API/console, Temporal workflow worker, Claude Code role runner (A01–A30), action gateway, credential broker, probes, evaluation worker.
- Reasoning runs through **local Claude Code** worker sessions on the owner-selected host — not a mandatory remote agent platform.
- Status labels must stay honest: fixture / stub / `NOT_RUN` is not sandbox-verified or production-canary-verified.

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

## Developer commands (stubs unless noted)

```bash
pnpm install
pnpm local:doctor | local:start | local:stop
pnpm check
pnpm test:unit          # offline domain unit tests (no network/credentials)
pnpm test:database | test:workflow | test:contract | test:e2e | test:security | test:eval
pnpm recovery:rehearse | release:evidence
```

VS Code tasks: **WorkSocial: Start / Stop / Diagnostics / Test Local Operations** (call supervisor stubs).

## Workspace vs database (OneDrive note)

The owner-selected **WSAgenticArmy** (or equivalent) workspace may live under a synced folder (for example OneDrive). **Do not** place live PostgreSQL data directories, Temporal persistence, browser-session state, or secret vault material inside consumer file-sync paths. Register separate roots for source, working data, content, reports, and encrypted backups; keep the durable DB off the sync volume.

## Acceptance vs reference-core

- `tests/acceptance-matrix-v6.json` — **159** product acceptance cases, all `NOT_RUN` at bootstrap.
- Domain / reference-core unit tests prove pure logic offline; they are **not** production acceptance (see `docs/product/reference-core-vs-acceptance.md`).
- v5 experience contracts (25 screens / 26 flows): `docs/v5/`.

## Specs in-repo

- `docs/product/WorkSocial_Operations_v6_implementation_baseline.md`
- `docs/WorkSocial_Local_30_Agent_Operating_System_v3.md`
- `docs/v5/*`
