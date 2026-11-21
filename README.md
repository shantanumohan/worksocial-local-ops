# worksocial-operations

Local WorkSocial operations monorepo (repository: `worksocial-local-ops`).

**Not production-activated.** No live providers, credentials, schedules, website changes, CRM writes, or customer replies. External effects: none.

## What is real (R1-01 → R1-10 + learning)

### R1-01 local execution
- **Supervisor-owned local lifecycle** — `pnpm local:start|stop|recover|doctor|health` and VS Code tasks call `services/supervisor`.
- **Detached process slots** for `api` and `console`; Temporal worker remains a stub slot unless `TEMPORAL_ADDRESS` is set.
- **Storage-root registry + sync-path policy** — refuses durable `database` / `temporal` / `secrets` under OneDrive-style paths.
- File-backed host lease / heartbeats under a **safe default state dir outside the checkout** (XDG / `%LOCALAPPDATA%\WorkSocial`) + SQL `002_local_execution.sql`. Plane-separated health: host ≠ api ≠ console ≠ temporal.

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
- **`services/workflow-worker`** — mission enqueue; Temporal label is **`NOT_WIRED`** until a frontend is reachable, then **`TEMPORAL`** (frontend reachability only — not worker polling; see `docs/product/temporal-binding.md`). Unbound API path stays in-process **`NOT_WIRED`**. Separate **`LOCAL_DURABLE`** mission path uses Postgres/file stores without Temporal orchestration.
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
- Catalog refs `T-F20`, `T-US-039`, `T-US-040`, `T-X049` exercised offline — product cases stay `NOT_RUN`.

### M5 / NEXT-16 lead capture + bounded repair
- **`services/lead-capture`** — browser/form harness → fixture Zoho CRM → field verify → cleanup; synthetic excluded from commerce totals.
- **Delivery failure → incident → bounded repair → re-verify**; weaken-test / protected-path proposals fail closed.
- **M1 gateway** authorize + **M2 durable** accept/verify (`LOCAL_DURABLE`); Temporal optional when bound (default `NOT_WIRED`).
- Console `/monitoring` surfaces last SUCCESS, current FAILURE, artifact refs, correlated submission↔CRM, repair state.
- API `/lead-capture/*` — status, journeys, run-journey, cleanup, open-incident-from-failure, run-bounded-repair.
- SQL `017_lead_capture.sql` companion schema; **live Zoho NOT_WIRED**; **R1-complete not claimed**.

### R1-06 knowledge and research / demand intelligence
- **Fact registry** with honest **SUPPORTED / UNKNOWN / HYPOTHESIS** labels, evidence links, and provenance.
- **Instruction/playbook ingestion** records — incoming docs are evidence, never auto-promoted to executable agent instructions.
- **Demand/trend/FAQ/rank** observation schema (source, method, intent, geography, sample size, missing-data, comparability).
- **Ingestion path** rejects unsourced/model claims as facts — hypothesis only until evidence exists.
- **Learning hooks** — fact confirm/refute emits SUCCESS/FAILURE outcomes (`fixtureOnly` when fixture); does not auto-apply authority.
- Console `/knowledge` + API `/knowledge/*` — browse/register facts, demand signals, ingest claims/instructions, seed fixtures.
- SQL `008_knowledge.sql` companion schema; **live SERP / Google Trends remain `NOT_WIRED`**.
- Fixture demand adapters only — no live search API required.

### R1-07 SEO and search
- **Page audits** with dimension findings (metadata, schema, canonical, content, …) and golden fixture pages.
- **SEO change proposals** gated so released claims cite **SUPPORTED** facts only — never HYPOTHESIS as schema “truth”.
- **Schema.org validation** — visible-content agreement + fact-label checks (`PASS` / `PARTIAL` / `FAIL`).
- **Semantic search** over a fixture space/service catalog with deterministic hard constraints and honest no-match.
- **Pilot page release** through the **action gateway** — requires mapping ownership + read evidence + standing grant; **`ACCEPTED_PENDING` ≠ `VERIFIED`**.
- **Learning hooks** — verified SEO release SUCCESS/FAILURE outcomes (`fixtureOnly` when fixture).
- Console `/seo` + API `/seo/*` — audits, proposals, schema validate, search, fixture release.
- SQL `009_seo.sql` companion schema; **live CMS publish remains `NOT_WIRED`**.

### R1-08 Content and distribution
- **Article pipeline** — brief → draft → QA gate → approve → gateway release → read-back verify.
- **Destination registry** — CMS, GBP, LinkedIn, Facebook with format/length contracts; full-blog rejected on short-update channels.
- **Canonical-first distribution** — dependent GBP/social variants require a verified owned-site URL; article edits invalidate variant approvals.
- **Fixture adapters** for CMS / GBP / social receipts; **live adapters honestly `NOT_WIRED`** without credentials.
- **Per-destination receipts** — `ACCEPTED_PENDING` / `PUBLISHED_VERIFIED` / `FAILED` / `UNSUPPORTED_ACTION`; partial success stays visible.
- **Gateway-gated** releases with mapping ownership + read evidence + standing grants; **acceptance ≠ verified**.
- **Learning hooks** — SUCCESS/FAILURE outcomes (`fixtureOnly` when fixture); no authority auto-apply.
- Console `/content` + API `/content/*` — campaigns, articles, variants, receipts, release/verify.
- SQL `010_content.sql` companion schema; **live CMS / GBP / social remain `NOT_WIRED`**.

### M6 Canonical publish + GBP/social (NEXT-17)
- **Versioned authoring** — `POST /content/create-campaign`, `/content/create-article`, `/content/edit-article` + console draft form; digest change bumps version and invalidates A25 bindings.
- **Claim/source QA** — `POST /content/record-claim-qa` requires SUPPORTED facts with source refs before review.
- **A25 review binding** — `POST /content/bind-review` reuses M3 binding invariants (exact revision + evidence package; edits invalidate).
- **Multi-destination distribute** — `POST /content/distribute` owned-site (staging CMS simulator + content fixture) → GBP fixture → LinkedIn fixture; per-destination format, claims/QA, receipt, independent read-back, durable accept/verify (LOCAL_DURABLE).
- **Partial failure recovery** — `POST /content/recover-distribution` re-applies only unfinished destinations; verified destinations are never re-applied. Stable `biz-content:…` operation keys.
- SQL `019_canonical_publish.sql` companion schema. **External effects NONE.** Missions may use Temporal when bound; slice shipped before Temporal CI bind — see `docs/product/temporal-binding.md`. Not an R1-complete claim.

### R1-09 / M7 (NEXT-18) Customer response / after-hours
- **Unified inbox domain** — conversations, messages, leases, response policy, handoffs, qualified leads, booking evidence, webhook events, ownership ledger.
- **Fixture webhook simulator** (`POST /inbox/ingest-fixture`) with durable `providerEventId` coalesce — no duplicate inbound rows.
- **Concierge drafts** grounded in **SUPPORTED** facts only; states **draft → queued → sent → delivered** (acceptance ≠ delivery).
- **Human takeover** increments conversation version and cancels **every unsent** agent response (queued + draft rows + unqueued drafts); gateway re-checks version before send.
- **Fixture Zoho lead logging** with inbound/event coalesce (no duplicate leads on webhook replay); synthetic leads excluded from commercial totals.
- **Morning handoff** with acknowledgement; pause-replies control distinct from takeover.
- **No reservation without booking evidence** — recommendation / tour request / booking link ≠ confirmation.
- **Learning hooks** — SUCCESS/FAILURE send/lead outcomes (`fixtureOnly` when fixture).
- Console `/inbox` — conversation list, chronological timeline, ownership badge, takeover control.
- SQL `011_inbox.sql` + `018_inbox_m7.sql` companions; **live inbox / Zoho remain `NOT_WIRED`**. Temporal follows binding probe (default unbound). Not an R1-complete claim.

### M8 Grounded search, analytics, evaluation (NEXT-19)
- **Grounded semantic search** — public hits cite **SUPPORTED** facts only; UNKNOWN / no-result / clarify stay honest; judgment + remediation ledger (T-F23 shaped).
- **Analytics read path** — GSC/GA4 **FIXTURE** samples; credentials-without-query → **UNAVAILABLE**; live query transport **NOT_WIRED**. Fixture ≠ sandbox ≠ live. Omitted GSC rows → UNKNOWN (not zero). GA4 debug validation ≠ measured receipt.
- **Isolated EVAL_ONLY worker (AA-20)** — Claude/Gemini fixture adjudication; no publish/CRM/customer-message tools; separate eval budget; live fleet **NOT_WIRED**; learning cannot expand effects; ChatGPT Ads **access-blocked** without verified local transport/entitlement.
- Console `/analysis` + `/eval`; APIs `/analysis/*` + `/eval/*` + `/seo/judge-search`.
- SQL `020_m8_search_analytics_eval.sql` companion; Temporal follows binding probe. Catalog cases remain **NOT_RUN** unless fixture evidence is attached (matrix may mark a few fixture **ACCEPTED** — never silent live **VERIFIED**). Not an R1-complete claim.

### AA-19 review analysis + paid-media proposals (F16 / F19)

- Console `/paid` + enhanced `/analysis` (hypotheses / redacted briefs).
- APIs `/paid/*` and `/analysis/{definitions,hypotheses,briefs,save-*}`.
- Google Ads fixture Analyze-only proposals with financial diffs; approve/decline records decisions without spend mutations.
- ChatGPT Ads remains **ACCESS_BLOCKED** without verified local transport + entitlement; live execute **NOT_WIRED**. External effects **NONE**. Catalog cases stay **NOT_RUN**.

### WP10 recovery evidence (F24)

- Classifies **STALE_OBSERVATION** vs **ACTIVE_INCIDENT** vs **UNKNOWN_REMOTE_OUTCOME** for host/provider outage and queued work (fixture-only).
- Console `/recovery`; APIs `/recovery/status` · `/recovery/inspect` · `/recovery/run` · timeline / queued-work / capability-stops.
- Live recovery stays **NOT_RUN** — never silently VERIFIED. Local credential revoke/rotate/offboard are **fixture** paths (`/credentials`); live provider revocation **NOT_WIRED**. External effects **NONE**.
- Runbook: `docs/runbooks/recovery-evidence.md`. Complements M9 soak; does not close product T-F24 alone.

### WP10 credential rotation / offboarding (F24)

- Console `/credentials`; APIs `/credentials/status` · seed · lease · revoke · rotate · offboard · audit · live-revoke.
- Local revoke marks connections **REVOKED**, denies new leases/effects, cancels eligible queued work, retains redacted audit.
- Live provider revoke stays **NOT_WIRED** (residual obligation on offboarding manifest). External effects **NONE**. Catalog **NOT_RUN**.
- Runbook: `docs/runbooks/credential-rotation.md`.

### M9 R1 soak / acceptance evidence (NEXT-20)
- **Soak / recovery harness** — crash-restart, no duplicate effects, job continuity, unknown-remote reconcile on file-durable LOCAL_DURABLE stores (`pnpm recovery:rehearse`).
- **Acceptance evidence compiler** — selected catalog cases (T-X014 / T-X020 / T-US-048 / T-X066) may become **ACCEPTED** only with the complete expected proof set and redacted fixture artifacts (`pnpm release:evidence`). **T-X066** requires the backup/omit-receipt proof (not retry-only no-dup). Never silently **VERIFIED** for live.
- **72h pilot gate** — duration from **server-recorded** start/heartbeat/end only (client claim dates rejected); short CI soaks stay `pilotGate=NOT_MET`. Owner Windows 72h soak documented in `docs/runbooks/m9-soak-acceptance.md`.
- Console `/soak`; APIs `/soak/status` · `/soak/run` · `/soak/report` · `/soak/cases`.
- SQL `021_m9_soak_acceptance.sql` companion; live CMS/GSC/GA4/Zoho **NOT_WIRED**; Temporal prod/Windows still **NOT_WIRED** (local bind optional). ChatGPT Ads **access-blocked**. **Not R1-complete.**

### M4 Owner staging workflow (NEXT-13–15)
- **Console** — `/activation`, `/connections`, `/sites`, `/missions`, `/review`, `/evidence` wired to typed `/owner/*` APIs; safe text rendering (no raw ID/JSON as primary UI).
- **Collectors** — page snapshot + deterministic checks; GSC/GA4 adapters labeled **FIXTURE** (or LIVE capability when credentials exist). Provenance preserved.
- **Staging CMS simulator** — apply → independent read-back → UNKNOWN_REMOTE_OUTCOME recovery. Acceptance ≠ verified. F12 verify cheat removed (no desired→observed copy in the browser).
- SQL `016_owner_staging.sql` companion schema; **Temporal remains `NOT_WIRED`** on the owner-staging surface until that service probes binding (hard-coded today). Not an R1-complete claim.

### R1-10 Bounded repair and release
- **Incidents / tickets / proposals / attempts / test evidence** with isolated worktree + asset lease.
- **Fail-closed gates** — cannot weaken tests, mutate baselines, touch protected policy/gateway paths, exceed two attempts, or self-approve (A24 ≠ A25).
- **Independent review** required before gateway release; high-risk markers (price/credentials/payment/…) blocked.
- **Fixture inject → repair → canary verify** path; **`ACCEPTED_PENDING` ≠ `VERIFIED`**.
- **Learning hooks** — SUCCESS/FAILURE release outcomes (`fixtureOnly` when fixture); no authority expansion.
- Console `/repair` + API `/repair/*` — seed, inject, review, release, verify.
- SQL `012_repair.sql` companion schema; **live CMS repair remains `NOT_WIRED`**.

## What is still stub / NOT_WIRED

| Area | Status |
|------|--------|
| Temporal runtime / durable workflows | **bindable** — default **`NOT_WIRED`** without `TEMPORAL_ADDRESS`; CI compose + SDK prove wired path; prod mTLS / Windows Temporal still **NOT_WIRED** (see `docs/product/temporal-binding.md`) |
| Live Claude Code CLI fleet | optional; default **fixture** (`WORKSOCIAL_CLAUDE_FIXTURE` unset/`1`) |
| Full console React routes (v5 25 screens) | progressive HTML: activation → connections → sites → missions → review → evidence (+ prior diagnostic pages). Not full React. |
| Live OAuth / provider connections | **excluded** — fixture/NOT_WIRED scaffolds; GSC/GA4 LIVE only with credentials |
| Live Zoho / CMS / booking mutations | **excluded** — fixture canary / fixture SEO/content/inbox lead / fixture repair / staging CMS **simulator** only |
| Live SERP / Google Trends | **NOT_WIRED** — fixture demand adapters only (R1-06) |
| Live CMS page / article publish | **NOT_WIRED** — fixture/simulator read-back only (R1-07/R1-08/M4) |
| Live GBP / LinkedIn / Facebook publish | **NOT_WIRED** — fixture receipts only (R1-08) |
| Live Playwright browser sessions | **NOT_WIRED** unless optional install + URL binding |
| Postgres bound as live control plane | schema ready; runtime state is **file-backed** |
| Hugging Face / ONNX weight downloads | **not used** — pure-TS offline trainers + fixture baselines |
| Production-canary-verified learning | **not claimed** — offline metrics only |
| Live inbox providers (email/webchat/SMS) | **NOT_WIRED** — fixture ingest/send only (R1-09) |
| Live Zoho after-hours lead write | **NOT_WIRED** — fixture CRM receipt only (R1-09) |
| Live CMS bounded repair | **NOT_WIRED** — fixture canary apply/verify only (R1-10) |
| Live GSC / GA4 query transport | **NOT_WIRED** — fixture / UNAVAILABLE collectors only (M8) |
| Live Claude/Gemini eval fleet | **NOT_WIRED** — EVAL_ONLY fixture adjudication (M8/AA-20); `pnpm test:eval` proves isolation offline |
| ChatGPT Ads | **access-blocked / NOT_WIRED** without verified local transport + entitlement (M8) |
| 72h R1 pilot soak on owner host | **NOT_MET** in CI — requires documented ≥72h owner soak (M9) |

Status labels stay honest: fixture / stub / `NOT_RUN` / fixture-`ACCEPTED` ≠ sandbox-verified or production-canary-verified.

## Layout (v6 § repository layout)

```
apps/console, apps/api
services/{supervisor,workflow-worker,claude-runner,action-gateway,credential-broker,learning-worker,probes,knowledge,seo,content,inbox,repair,owner-staging,evaluation-worker,soak,recovery,paid-media}
packages/{contracts,domain,ml,persistence,provider-adapters,observability,ui}
database/migrations
tests/{unit,integration,contract,workflow,e2e,security,eval,soak}
.claude/agents          # A01–A30 role contracts
.vscode/tasks.json
docs/{adrs,runbooks,product,contracts,v5}
```

## Toolchain (pinned)

See `docs/product/toolchain.md`. Node `.nvmrc` (`20.18.1`), pnpm `9.15.0` via `packageManager`, TypeScript `5.7.2`, Vitest `2.1.8`. CI: `.github/workflows/ci.yml` runs implemented suites (including `test:eval` + `test:security` gate regressions).

## Developer commands

```bash
pnpm install --frozen-lockfile
pnpm local:doctor | local:start | local:stop | local:recover | local:health
pnpm check
pnpm test:acceptance-matrix   # 159-case catalog ↔ matrix (NOT_RUN|ACCEPTED+evidence; never silent live VERIFIED)
pnpm test:unit                # domain + ml + persistence + … + evaluation-worker + soak + api
pnpm test:contract            # … + m9 soak/acceptance + …
pnpm test:e2e                 # offline e2e-lite including M9 soak (not browser product acceptance)
pnpm test:database | test:workflow   # M2 durable suites
pnpm recovery:rehearse | release:evidence | test:soak            # M9 fixture soak + evidence
pnpm test:eval                                                   # AA-20 offline EVAL_ONLY isolation (not live/catalog VERIFIED)
pnpm test:security                                               # ownership / auth / lease gates (not pen-test / not catalog VERIFIED)
```

VS Code tasks: **WorkSocial: Start / Stop / Diagnostics / Test Local Operations** → supervisor CLI.

Optional env: `WORKSOCIAL_SYNC_DENY`, `WORKSOCIAL_STATE_DIR`, `WORKSOCIAL_DATA_HOME`, `WORKSOCIAL_HOST_ID`, `WORKSOCIAL_API_PORT`, `WORKSOCIAL_CONSOLE_PORT`, `WORKSOCIAL_OWNER_PASSWORD`, `WORKSOCIAL_CLAUDE_CLI`, `WORKSOCIAL_CLAUDE_FIXTURE` (`0` to allow live CLI when present), `WORKSOCIAL_PLAYWRIGHT` (`1` to acknowledge optional Playwright install — still unbound/`NOT_WIRED` without URL), `WORKSOCIAL_PROBE_ALLOWED_HOSTS` (comma-separated public hostnames required for live HTTP probes; loopback/private rejected).

## Workspace vs database (OneDrive note)

Example owner workspace (source/content OK):  
`C:\Users\ShantanuMohan\OneDrive - myworksocial.com\Documents\AgenticArmyWS`

That path is a **workspace / artifact root example**, not a database root. **Do not** place live PostgreSQL data directories, Temporal persistence, browser-session state, auth sessions, or secret vault material inside consumer file-sync paths (OneDrive, etc.).

Default control-plane state is **outside the repo**:

| Platform | Default |
|----------|---------|
| Linux | `~/.local/share/worksocial/local-state` (or `$XDG_DATA_HOME/worksocial`) |
| Windows | `%LOCALAPPDATA%\WorkSocial\local-state` |
| Override | `WORKSOCIAL_STATE_DIR` / `WORKSOCIAL_DATA_HOME` |

Supervisor refuses to run when the resolved state dir is under OneDrive-style sync paths. See `docs/runbooks/host-service-storage.md`.

| Kind | Sync folder OK? |
|------|-----------------|
| `source`, `working`, `content`, `reports`, `encrypted_backup` | yes (owner-selected) |
| `database`, `temporal`, `secrets`, control-plane state | **no** — keep off sync volumes |

## Acceptance vs reference-core

- `docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md` — **full** 159-case product acceptance catalog (T-F / T-US / T-X); statuses remain `NOT_RUN` until evidence, or `ACCEPTED` only with real redacted artifacts.
- `tests/acceptance-matrix-v6.json` — machine-readable index aligned to the catalog (every ID resolves; ChatGPT Ads transport/entitlement gate retained; fixture ACCEPTED ≠ live VERIFIED).
- `tests/acceptance-evidence/fixture/` — redacted fixture evidence from `pnpm release:evidence`.
- Offline unit/contract/e2e-lite suites prove fixture behavior; they are **not** production acceptance and do **not** claim R1 complete (see `docs/product/reference-core-vs-acceptance.md`).
- Soak runbook: `docs/runbooks/m9-soak-acceptance.md`.

## Specs in-repo

- `docs/product/WorkSocial_Operations_v6_implementation_baseline.md`
- `docs/product/v6-wp-sequencing.md` — WP01–WP16 band ↔ landed vs open (honesty index)
- `docs/product/WorkSocial_Acceptance_Test_Catalog_v6.md`
- `docs/product/temporal-binding.md`
- `docs/WorkSocial_Local_30_Agent_Operating_System_v3.md`
- `docs/v5/*` — see `docs/v5/README.md`
- `docs/product/ml-learning-from-outcomes.md` — owner requirement; local multi-model learning slice
