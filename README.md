# worksocial-operations

Local WorkSocial operations monorepo (repository: `worksocial-local-ops`).

**Not production-activated.** No live providers, credentials, schedules, website changes, CRM writes, or customer replies. External effects: none.

## What is real (R1-01 + R1-02)

### R1-01 local execution
- **Supervisor-owned local lifecycle** — `pnpm local:start|stop|doctor|health` and VS Code tasks call `services/supervisor`.
- **Detached process slots** for `api` and `console`; Temporal worker remains a stub slot.
- **Storage-root registry + sync-path policy** — refuses durable `database` / `temporal` / `secrets` under OneDrive-style paths.
- File-backed host lease / heartbeats under `.worksocial/local-state` + SQL `002_local_execution.sql`.

### R1-02 identity and authority
- **Local session auth** for API/console (single-owner host; no cloud IdP). Default user `owner` / `local-owner-change-me` (override `WORKSOCIAL_OWNER_PASSWORD`).
- **Roles** — `administrator` and `operator` with privileged-action checks.
- **Standing policies + capability grants** in domain + file-backed authority store + SQL `003_identity_authority.sql`.
- **Action gateway** — sole mutation authority stub: durable intent → authorize → apply/deny; `ACCEPTED_PENDING` ≠ `VERIFIED`.
- **Credential broker** — opaque vault references; Claude runner / evaluation denied mint and reveal.
- **Stop switch** enforced at the gateway before every external effect.
- **Console** — `/login` and `/authority` with honest **connected / authorized / verified** labels (never fake connected).

## What is still stub / NOT_WIRED

| Area | Status |
|------|--------|
| Temporal runtime / durable workflows | **stub** — `NOT_WIRED` |
| Full console React routes (v5 25 screens) | minimal login + authority only |
| Live OAuth / provider connections | excluded (R1-03+) |
| Postgres bound as live control plane | schema ready; runtime state is **file-backed** |
| Full Temporal Claude runner fleet | out of scope (R1-04) |
| CRM, publishing, after-hours | excluded |

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
pnpm test:unit          # domain + persistence + supervisor + gateway + broker + api
pnpm test:contract      # unauthorized-write + stop-switch
pnpm test:database | test:workflow | test:e2e | test:security | test:eval
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

Optional env: `WORKSOCIAL_SYNC_DENY`, `WORKSOCIAL_STATE_DIR`, `WORKSOCIAL_HOST_ID`, `WORKSOCIAL_API_PORT`, `WORKSOCIAL_CONSOLE_PORT`, `WORKSOCIAL_OWNER_PASSWORD`.

## Acceptance vs reference-core

- `tests/acceptance-matrix-v6.json` — **159** product acceptance cases (bootstrap statuses unchanged unless a later WP updates them).
- Domain / persistence / gateway / broker / API unit tests prove R1-02 offline; they are **not** production acceptance (see `docs/product/reference-core-vs-acceptance.md`).

## Specs in-repo

- `docs/product/WorkSocial_Operations_v6_implementation_baseline.md`
- `docs/WorkSocial_Local_30_Agent_Operating_System_v3.md`
- `docs/v5/*`
