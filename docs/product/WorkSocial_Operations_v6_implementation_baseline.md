# WorkSocial Operations — Product, engineering, coding and verification specification

Version 6.0 | 17 November 2026 | Implementation baseline

Owner: Shantanu Mohan  
Execution: Local services launched from Visual Studio Code; 30 operational Claude Code roles  
Experience baseline: v5's 25 screens, 26 journeys and 60 user stories  
Delivery boundary: This specification and accompanying executable reference tests are not the deployed application.

## Precedence

The user's local execution, selected-folder, 30-role, autonomous publishing/testing/CRM/customer-response requirements are binding. Preserve v3's local operating architecture and v5's experience contracts. v6 resolves engineering detail. Earlier cloud-first/18-agent proposals do not apply.

## Mandatory first-release scope

Release 1 includes all 30 registered roles, all 25 experience routes, local startup and recovery, real authentication, selected storage roots, source/fact registry, read-first connections, independent action authorization, durable missions, page audits and permitted changes, original content and distribution, semantic search, controlled form/CRM testing, after-hours response and takeover, bounded repair, review/analysis, paid-media decision support, isolated Claude/Gemini evaluation, cost controls, backup and restore.

Feature status labels only: implemented-contract-tested, sandbox-verified, production-canary-verified, blocked-external-access, or excluded-by-owner.

## Repository layout (`worksocial-operations/`)

- `apps/console` — React routes and semantic components
- `apps/api` — identity, commands, queries, SSE
- `services/supervisor` — startup, host lease, diagnostics
- `services/workflow-worker` — Temporal workflows + activities
- `services/claude-runner` — pinned CLI adapter and output validation
- `services/action-gateway` — sole authority for provider effects
- `services/credential-broker` — vault access, narrow provider credentials
- `services/probes` — deterministic HTTP/DOM/journey checks
- `services/evaluation-worker` — Claude/Gemini test-only execution
- `packages/contracts|domain|persistence|provider-adapters|observability|ui`
- `database/migrations/`
- `tests/{unit,integration,contract,workflow,e2e,security,eval,soak}/`
- `.claude/agents/` — exactly A01–A30
- `.vscode/tasks.json`
- `docs/{adrs,runbooks,product,contracts}/`

Modules depend inward on contracts/domain. Domain must not import UI, network, Node process APIs, or provider SDKs. Gateway and broker are independent OS/process principals from code-writing workers.

## Work package sequence (Release 1)

- WP01–05: sources, contracts, local lifecycle, authority, durable Claude execution
- WP06–09: provider identity, governed facts, demand/visibility/search, content + distribution
- WP10–12: form-to-CRM, concierge/takeover, bounded repairs
- WP13–14: review/analysis, paid-media proposals, isolated evaluation
- WP15–16: security/recovery/soak, integrated owner acceptance

Implement frontend surfaces alongside their owning slice.

## Mandatory decisions (summary)

- One supervisor owns startup/health/queues; VS Code tasks call it.
- Bounded Claude Code invocations; no blanket permission bypass; typed proposals only.
- Only action gateway dispatches; durable intent first; acceptance ≠ verified.
- Budget reservations with honest actual-cost settlement; ads need exact financial decisions.
- Evaluation tools have no operational write credentials.
- Takeover increments conversation version; no reservation without booking evidence.

## Target developer commands

`pnpm local:doctor|local:start|local:stop|check|test:unit|test:database|test:workflow|test:contract|test:e2e|test:security|test:eval|recovery:rehearse|release:evidence`

## Fundamental invariants

1. Reasoning worker proposes; gateway authorizes and applies.
2. Connection, permission, and verified outcome are separate evidence.
3. Every external mutation has one logical operation identity and immutable payload digest.
4. Approvals are revision-bound and expire.
5. Stale/missing/conflicting critical prerequisites deny the action.
6. Ambiguous remote writes are reconciled before new writes.
7. Human takeover invalidates unsent replies via conversation version.
8. Provider/test errors are not zero data by default.
9. Synthetic records never enter commercial totals.
10. Evaluation providers never receive production effect tools.
11. Retries cannot weaken policy, tests, or independent review.
12. Completion requires environment evidence, not model narration.

## Stop conditions

Stop the affected capability when source ownership is unproven, account identity changes, secrets leak, a grant is missing, remote outcome cannot be reconciled, a repair needs to weaken its test, a critical fact lacks evidence, or requested behavior exceeds approved scope.

Full v6 chat paste and v3 engineering specification remain authoritative for detailed sections not summarized here.
