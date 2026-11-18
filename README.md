# worksocial-operations

Local WorkSocial operations monorepo (repository: `worksocial-local-ops`).

**Not production-activated.** No live providers, credentials, schedules, website changes, CRM writes, or customer replies. External effects: none.

## What is real (R1-01 → R1-06 + learning)

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
- **Credential broker** — opaque vault references; Claude runner / evaluation / **learning-worker** denied mint and reveal.
- **Stop switch** enforced at the gateway before every external effect.
- **Console** — `/login` and `/authority` with honest **connected / authorized / verified** labels (never fake connected).

### R1-03 production mapping
- **Domain + file store + SQL `004_production_mapping.sql`** for site/CMS/repo bindings, forms, booking/CRM ownership, journey registry, read evidence, and labeled write-path outcomes.
- **Read-first gates** — pilot write classes require mapped ownership **and** prior read evidence (`OWNERSHIP_UNPROVEN` / `READ_EVIDENCE_MISSING`).
- **Provider adapters** — `NOT_WIRED` / `FIXTURE` scaffolds only; **no live Zoho/CMS/booking mutations**.
- **Console `/mapping`** — honest binding/adapter status; fixture seed + prove-read helpers.
- **Outcome ledgers** — `writePathOutcomes` + `listWritePathOutcomesForLearning` feed the learning-worker.

### R1-04 thirty-role Claude Code runtime
- **`.claude/agents/A01–A30`** — real role contracts (capabilities, inputs, forbidden effects, limits).
- **`services/claude-runner`** — pinned CLI adapter, output validation, timeouts/budgets, bounded queue, **fixture/offline mode** when CLI absent; **no permission bypass**.
- **Independent review gate** — author cannot self-approve; A25 issues verdicts; effects still go through gateway + grants.
- **Delegation bounds** — typed task requests only; uncontrolled recursion denied (`MAX_DELEGATION_DEPTH`).
- **`services/workflow-worker`** — mission enqueue with honest **`NOT_WIRED`** Temporal status; in-process runner execution.
- **Console `/roles` + API `/roles/*`** — role status, last-run evidence, fixture evaluate-all.
- **Role outcomes** — SUCCESS/FAILURE labels for learning-worker consumption.
- SQL `005_role_runtime.sql` companion schema (file-backed store until Postgres is bound).

### Multi-model learning from verified outcomes
- **`packages/ml` + `services/learning-worker`** — ≥2 pinned open-source models:
  - `outcome-nb-bernoulli@1.0.0` — Bernoulli Naive Bayes (sklearn-compatible, **BSD-3-Clause**)
  - `outcome-logreg-l2@1.0.0` — L2 logistic risk/ranker (sklearn-compatible, **BSD-3-Clause**)
- Feature extraction excludes `fixtureOnly` / fixture execution by default; rejects unverified model-claim labels.
- Train/update loop emits **versioned playbook / ranking / risk proposals awaiting review** — cannot expand grants/spend/CRM/publish authority.
- Isolation: learning-worker has **no** action-gateway write principal and **no** production effect credentials.
- Console `/learning` + API `/learning/*` — status, model registry, last-run metrics, proposals.
- SQL `006_learning.sql` companion schema; CI uses offline fixture baseline weights (no weight download).

### R1-05 monitoring and tests
- **`services/probes`** — deterministic HTTP + DOM/journey checks (fixture mode for CI; Playwright live optional/`NOT_WIRED`).
- **Form-to-CRM canary** — controlled synthetic lead + action-gateway grant + correlated fixture CRM receipt; never enters commercial totals.
- **Reconciliation** — intent vs remote/fixture outcome; ambiguous writes fail closed (`blocksRetry`).
- **Learning hooks** — SUCCESS/FAILURE canary outcomes recorded as `fixtureOnly` write-path evidence.
- Console `/monitoring` + API `/probes/*` — status, runs, last evidence, run-http / run-dom / run-form-canary.
- SQL `007_monitoring.sql` companion schema; **live Zoho remains `NOT_WIRED`** without owner credentials.
- Catalog refs `T-F11`, `T-F12`, `T-US-032`, `T-X040` exercised offline — product cases stay `NOT_RUN`.

### R1-06 knowledge and research / demand intelligence
- **Fact registry** with honest **SUPPORTED / UNKNOWN / HYPOTHESIS** labels, evidence links, and provenance.
- **Instruction/playbook ingestion** records — incoming docs are evidence, never auto-promoted to executable agent instructions.
- **Demand/trend/FAQ/rank** observation schema (source, method, intent, geography, sample size, missing-data, comparability).
- **Ingestion path** rejects unsourced/model claims as facts — hypothesis only until evidence exists.
- **Learning hooks** — fact confirm/refute emits SUCCESS/FAILURE outcomes (`fixtureOnly` when fixture); does not auto-apply authority.
- Console `/knowledge` + API `/knowledge/*` — browse/register facts, demand signals, ingest claims/instructions, seed fixtures.
- SQL `008_knowledge.sql` companion schema; **live SERP / Google Trends remain `NOT_WIRED`**.
- Fixture demand adapters only — no live search API required.

## What is still stub / NOT_WIRED

| Area | Status |
|------|--------|
| Temporal runtime / durable workflows | **stub** — `NOT_WIRED` (in-process enqueue only) |
| Live Claude Code CLI fleet | optional; default **fixture** (`WORKSOCIAL_CLAUDE_FIXTURE` unset/`1`) |
| Full console React routes (v5 25 screens) | minimal login + authority + mapping + roles + monitoring + knowledge + learning |
| Live OAuth / provider connections | **excluded** — fixture/NOT_WIRED scaffolds only |
| Live Zoho / CMS / booking mutations | **excluded** — fixture canary only |
| Live SERP / Google Trends | **NOT_WIRED** — fixture demand adapters only (R1-06) |
| Live Playwright browser sessions | **NOT_WIRED** unless optional install + URL binding |
| Postgres bound as live control plane | schema ready; runtime state is **file-backed** |
| Hugging Face / ONNX weight downloads | **not used** — pure-TS offline trainers + fixture baselines |
| Production-canary-verified learning | **not claimed** — offline metrics only |
| SEO publishing / after-hours | excluded (R1-07–R1-09) |

Status labels stay honest: fixture / stub / `NOT_RUN` ≠ sandbox-verified or production-canary-verified.

## Layout (v6 § repository layout)

```
apps/console, apps/api
services/{supervisor,workflow-worker,claude-runner,action-gateway,credential-broker,learning-worker,probes,knowledge,evaluation-worker}
packages/{contracts,domain,ml,persistence,provider-adapters,observability,ui}
database/migrations
tests/{unit,integration,contract,workflow,e2e,security,eval,soak}
.claude/agents          # A01–A30 role contracts
.vscode/tasks.json
docs/{adrs,runbooks,product,contracts,v5}
```

## Developer commands

```bash
pnpm install
pnpm local:doctor | local:start | local:stop | local:health
pnpm check
pnpm test:unit          # domain + ml + persistence + supervisor + gateway + broker + runners + learning-worker + probes + knowledge + api
pnpm test:contract      # unauthorized-write + stop-switch + read-evidence + thirty-role-runtime + learning-worker + form-crm-canary + knowledge-labeling
pnpm test:e2e           # offline e2e-lite HTTP→DOM→canary journey
pnpm test:database | test:workflow | test:security | test:eval
pnpm recovery:rehearse | release:evidence
```

VS Code tasks: **WorkSocial: Start / Stop / Diagnostics / Test Local Operations** → supervisor CLI.

Optional env: `WORKSOCIAL_SYNC_DENY`, `WORKSOCIAL_STATE_DIR`, `WORKSOCIAL_HOST_ID`, `WORKSOCIAL_API_PORT`, `WORKSOCIAL_CONSOLE_PORT`, `WORKSOCIAL_OWNER_PASSWORD`, `WORKSOCIAL_CLAUDE_CLI`, `WORKSOCIAL_CLAUDE_FIXTURE` (`0` to allow live CLI when present), `WORKSOCIAL_PLAYWRIGHT` (`1` to acknowledge optional Playwright install — still unbound/`NOT_WIRED` without URL), `WORKSOCIAL_PROBE_ALLOWED_HOSTS` (comma-separated public hostnames required for live HTTP probes; loopback/private rejected).

## Workspace vs database (OneDrive note)

Example owner workspace (source/content OK):  
`C:\Users\ShantanuMohan\OneDrive - myworksocial.com\Documents\AgenticArmyWS`

That path is a **workspace / artifact root example**, not a database root. **Do not** place live PostgreSQL data directories, Temporal persistence, browser-session state, or secret vault material inside consumer file-sync paths (OneDrive, etc.). Register separate roots:

| Kind | Sync folder OK? |
|------|-----------------|
| `source`, `working`, `content`, `reports`, `encrypted_backup` | yes (owner-selected) |
| `database`, `temporal`, `secrets` | **no** — keep off sync volumes |

## Acceptance vs reference-core

- `tests/acceptance-matrix-v6.json` — **159** product acceptance cases (bootstrap statuses unchanged unless a later WP updates them).
- Domain / persistence / gateway / broker / runner / learning / API unit tests prove offline behavior; they are **not** production acceptance (see `docs/product/reference-core-vs-acceptance.md`).

## Specs in-repo

- `docs/product/WorkSocial_Operations_v6_implementation_baseline.md`
- `docs/WorkSocial_Local_30_Agent_Operating_System_v3.md`
- `docs/v5/*`
- `docs/product/ml-learning-from-outcomes.md` — owner requirement; local multi-model learning slice
